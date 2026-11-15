package nqlake

import scala.util.control.NonFatal

import nqlake.Cli.Action

object Main {
  private object ExitCode {
    val Ok      = 0
    val Failure = 1
    val Usage   = 2
  }

  def main(args: Array[String]): Unit =
    sys.exit(Cli.parse(args.toSeq, sys.env) match {
      case Left(help) if help.errors.isEmpty =>
        println(help)
        ExitCode.Ok
      case Left(help) =>
        Console.err.println(help)
        ExitCode.Usage
      case Right(Cli.ShowVersion) =>
        println(s"${BuildInfo.name} ${BuildInfo.version}")
        ExitCode.Ok
      case Right(Cli.Invocation(settings, action)) =>
        run(settings, action)
    })

  private def run(settings: Settings, action: Action): Int = {
    val spark = Lake.session(settings)
    try {
      action match {
        case Action.Init =>
          Init.run(spark)
        case Action.Seed(date, tables, symbols, rowsPerSymbol) =>
          tables.foreach(Seed.run(spark, settings, _, date, symbols, rowsPerSymbol))
        case Action.Ingest(date, tables) =>
          tables.foreach(Ingest.run(spark, settings, _, date))
        case Action.Maintain(tables, retentionDays) =>
          tables.foreach(Maintain.run(spark, _, retentionDays))
        case Action.Mmap(query, output, batchRows, assumeYes) =>
          Mmap.run(spark, query, output, batchRows, assumeYes)
      }
      ExitCode.Ok
    } catch {
      case NonFatal(error) =>
        Console.err.println(s"${BuildInfo.name}: ${error.getMessage}")
        ExitCode.Failure
    } finally spark.stop()
  }
}
