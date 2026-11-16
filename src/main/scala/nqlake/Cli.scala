package nqlake

import java.net.URI
import java.nio.file.{Files, Path}
import java.time.LocalDate

import scala.util.Try

import cats.syntax.all._
import com.monovore.decline._
import com.monovore.decline.time._

object Cli {
  sealed trait Request
  case object ShowVersion                                         extends Request
  final case class Invocation(settings: Settings, action: Action) extends Request

  sealed trait Action
  object Action {
    case object Init                                                                                 extends Action
    final case class Seed(date: LocalDate, samples: Seq[SampleTable], symbols: Int, rowsPerSymbol: Int)    extends Action
    final case class Upload(files: Seq[String], tables: Seq[LakeTable], key: Seq[String], assumeYes: Boolean) extends Action
    final case class Maintain(tables: Seq[LakeTable], retentionDays: Int)                                  extends Action
    final case class Mmap(query: String, output: Path, batchRows: Int, assumeYes: Boolean)                 extends Action
  }

  private implicit val tableArgument: Argument[LakeTable] =
    Argument.from("name")(name => LakeTable.named(name).toValidatedNel)

  private implicit val sampleArgument: Argument[SampleTable] =
    Argument.from(SampleTable.all.map(_.table.name).mkString("|")) { name =>
      SampleTable.all.find(_.table.name == name).toValidNel(s"Unknown sample table: $name")
    }

  private def setting[A: Argument](name: String, env: String, default: A, help: String): Opts[A] =
    Opts
      .option[A](name, s"$help (env: $env, default: $default)")
      .orElse(Opts.env[A](env, help))
      .withDefault(default)

  private def credential(env: String, default: String, help: String): Opts[String] =
    Opts.env[String](env, s"$help (default: local development credential)").withDefault(default)

  private def positive(name: String, default: Int, help: String): Opts[Int] =
    Opts
      .option[Int](name, s"$help (default: $default)")
      .withDefault(default)
      .validate(s"--$name must be positive")(_ > 0)

  private val settings: Opts[Settings] = (
    setting("catalog-uri", "NQLAKE_CATALOG_URI", URI.create("http://localhost:8181"), "Iceberg REST catalog"),
    setting("warehouse", "NQLAKE_WAREHOUSE", "warehouse", "Table bucket holding the Iceberg tables"),
    setting("s3-endpoint", "NQLAKE_S3_ENDPOINT", URI.create("http://localhost:8333"), "S3 endpoint of the landing bucket"),
    credential("NQLAKE_S3_ACCESS_KEY", "nqlake", "Access key for the catalog and the landing bucket"),
    credential("NQLAKE_S3_SECRET_KEY", "nqlake-dev-secret", "Secret key for the catalog and the landing bucket"),
    setting("landing-bucket", "NQLAKE_LANDING_BUCKET", "landing", "Bucket holding landed Parquet files")
  ).mapN(Settings.apply)

  private val date: Opts[LocalDate] =
    Opts.option[LocalDate]("date", "Trading date, YYYY-MM-DD", short = "d")

  private def tables(help: String): Opts[Seq[LakeTable]] =
    Opts.options[LakeTable]("table", help, short = "t").map(_.toList.distinct).withDefault(Seq.empty)

  private val samples: Opts[Seq[SampleTable]] =
    Opts
      .options[SampleTable]("table", "Sample table to generate; repeatable (default: all sample tables)", short = "t")
      .map(_.toList.distinct)
      .withDefault(SampleTable.all)

  private val assumeYes: Opts[Boolean] =
    Opts.flag("yes", "Go ahead without asking for confirmation", short = "y").orFalse

  private val init: Opts[Action] =
    Opts.subcommand("init", "Create the namespace and tables if they do not exist")(Opts(Action.Init))

  private val seed: Opts[Action] =
    Opts.subcommand("seed", "Write generated sample Parquet files into the landing bucket") {
      (
        date,
        samples,
        positive("symbols", 20, "Number of symbols"),
        positive("rows-per-symbol", 390, "Rows generated per symbol")
      ).mapN(Action.Seed.apply)
    }

  private val upload: Opts[Action] =
    Opts.subcommand(
      "upload",
      "Load Parquet files into a table, creating it if needed; without files, load and then delete what is in the landing bucket"
    ) {
      (
        Opts.arguments[String]("file").orEmpty,
        tables(
          "Table to load into, created if it does not exist. Required with files; " +
            "without files it is repeatable (default: every directory in the landing bucket)"
        ),
        Opts
          .option[String](
            "key",
            "Primary key columns of a new table, comma-separated; without it rows are appended",
            short = "k",
            metavar = "columns"
          )
          .map(_.split(',').map(_.trim).filter(_.nonEmpty).toSeq.distinct)
          .withDefault(Seq.empty),
        assumeYes
      ).mapN(Action.Upload.apply)
        .validate("Files need exactly one --table")(upload => upload.files.isEmpty || upload.tables.size == 1)
        .validate("--key needs exactly one --table")(upload => upload.key.isEmpty || upload.tables.size == 1)
    }

  private val maintain: Opts[Action] =
    Opts.subcommand("maintain", "Compact and sort data files, expire snapshots, remove orphan files") {
      (
        tables("Table to maintain; repeatable (default: every table)"),
        positive("retention-days", 7, "Keep snapshots and unreferenced files newer than this many days")
      )
        .mapN(Action.Maintain.apply)
    }

  private val query: Opts[String] =
    Opts
      .option[String]("sql", "Spark SQL query selecting the rows to write")
      .orElse(
        Opts
          .option[Path]("sql-file", "File holding the Spark SQL query")
          .mapValidated(file => Try(Files.readString(file)).toEither.leftMap(e => s"Cannot read $file: $e").toValidatedNel)
      )

  private val mmap: Opts[Action] =
    Opts.subcommand("mmap", "Write a query result as one uncompressed Arrow IPC file for another process to mmap") {
      (
        query,
        Opts.option[Path]("output", "File to create or atomically replace", short = "o"),
        positive("batch-rows", 1000000, "Rows per record batch"),
        assumeYes
      ).mapN(Action.Mmap.apply)
    }

  private val version: Opts[Request] =
    Opts.flag("version", "Print the version and exit").as(ShowVersion)

  private val ShortHelp = "-h"
  private val LongHelp  = "--help"

  def parse(args: Seq[String], env: Map[String, String]): Either[Help, Request] =
    command.parse(args.map(arg => if (arg == ShortHelp) LongHelp else arg), env)

  private val command: Command[Request] =
    Command(BuildInfo.name, "Upload market data into the NQLake Iceberg lakehouse and maintain it") {
      version.orElse((settings, init.orElse(seed).orElse(upload).orElse(maintain).orElse(mmap)).mapN(Invocation.apply))
    }
}
