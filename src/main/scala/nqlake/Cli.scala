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
    final case class Seed(date: LocalDate, tables: Seq[LakeTable], symbols: Int, rowsPerSymbol: Int) extends Action
    final case class Ingest(date: LocalDate, tables: Seq[LakeTable])                                 extends Action
    final case class Maintain(tables: Seq[LakeTable], retentionDays: Int)                            extends Action
    final case class Mmap(query: String, output: Path, batchRows: Int, assumeYes: Boolean)           extends Action
  }

  private implicit val tableArgument: Argument[LakeTable] =
    Argument.from(LakeTable.all.map(_.name).mkString("|")) { name =>
      LakeTable.all.find(_.name == name).toValidNel(s"Unknown table: $name")
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

  private val tables: Opts[Seq[LakeTable]] =
    Opts
      .options[LakeTable]("table", "Table to process; repeatable (default: all tables)", short = "t")
      .map(_.toList.distinct)
      .withDefault(LakeTable.all)

  private val init: Opts[Action] =
    Opts.subcommand("init", "Create the namespace and tables if they do not exist")(Opts(Action.Init))

  private val seed: Opts[Action] =
    Opts.subcommand("seed", "Write generated sample Parquet files into the landing bucket") {
      (
        date,
        tables,
        positive("symbols", 20, "Number of symbols"),
        positive("rows-per-symbol", 390, "Rows generated per symbol")
      ).mapN(Action.Seed.apply)
    }

  private val ingest: Opts[Action] =
    Opts.subcommand("ingest", "Deduplicate one day of landed files and merge them into the tables") {
      (date, tables).mapN(Action.Ingest.apply)
    }

  private val maintain: Opts[Action] =
    Opts.subcommand("maintain", "Compact and sort data files, expire snapshots, remove orphan files") {
      (tables, positive("retention-days", 7, "Keep snapshots and unreferenced files newer than this many days"))
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
        Opts.flag("yes", "Write without asking for confirmation", short = "y").orFalse
      ).mapN(Action.Mmap.apply)
    }

  private val version: Opts[Request] =
    Opts.flag("version", "Print the version and exit").as(ShowVersion)

  private val ShortHelp = "-h"
  private val LongHelp  = "--help"

  def parse(args: Seq[String], env: Map[String, String]): Either[Help, Request] =
    command.parse(args.map(arg => if (arg == ShortHelp) LongHelp else arg), env)

  private val command: Command[Request] =
    Command(BuildInfo.name, "Ingest landed market data into the NQLake Iceberg lakehouse and maintain it") {
      version.orElse((settings, init.orElse(seed).orElse(ingest).orElse(maintain).orElse(mmap)).mapN(Invocation.apply))
    }
}
