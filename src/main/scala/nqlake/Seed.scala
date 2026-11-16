package nqlake

import java.time.{LocalDate, LocalTime, ZoneOffset}

import org.apache.spark.sql.{Column, DataFrame, SparkSession}
import org.apache.spark.sql.functions._

object Seed {
  private val SessionOpen       = LocalTime.of(9, 30)
  private val DuplicateFraction = 0.01

  def run(
      spark: SparkSession,
      settings: Settings,
      sample: SampleTable,
      date: LocalDate,
      symbols: Int,
      rowsPerSymbol: Int
  ): Unit = {
    val openMicros = date.atTime(SessionOpen).toEpochSecond(ZoneOffset.UTC) * 1000000L
    val ids        = spark.range(symbols.toLong * rowsPerSymbol).toDF()
    val symbolNo   = col("id") % symbols
    val symbol     = format_string("SYM%04d", symbolNo).as("symbol")
    val step       = floor(col("id") / symbols)
    val basePrice  = lit(100.0) + symbolNo

    val rows = sample match {
      case SampleTable.Ohlcv => bars(ids, symbol, basePrice, openMicros, step)
      case SampleTable.Mbo   => orderEvents(ids, symbol, basePrice, openMicros, step)
    }
    val withRedelivery = rows.union(rows.sample(DuplicateFraction, seed = 1L))
    val path           = Landing.directory(settings, sample.table).toString

    withRedelivery.write.mode("append").parquet(path)
    println(s"seed ${sample.table.name} $date: $path")
  }

  private def bars(ids: DataFrame, symbol: Column, basePrice: Column, openMicros: Long, step: Column): DataFrame = {
    val minuteMicros = 60L * 1000000L
    ids
      .select(
        symbol,
        timestamp_micros(lit(openMicros) + step * minuteMicros).as("ts"),
        (basePrice + rand(1L)).as("open"),
        (basePrice + rand(2L)).as("close"),
        (rand(3L) * 10000).cast("long").as("volume")
      )
      .withColumn("high", greatest(col("open"), col("close")) + rand(4L))
      .withColumn("low", least(col("open"), col("close")) - rand(5L))
  }

  private def orderEvents(ids: DataFrame, symbol: Column, basePrice: Column, openMicros: Long, step: Column): DataFrame = {
    val millisecondMicros = 1000L
    val actions           = array(Seq("add", "modify", "cancel", "trade").map(lit): _*)
    ids.select(
      symbol,
      timestamp_micros(lit(openMicros) + step * millisecondMicros).as("ts"),
      col("id").as("sequence"),
      (col("id") / 4).cast("long").as("order_id"),
      element_at(actions, (col("id") % 4 + 1).cast("int")).as("action"),
      when(col("id") % 2 === 0, "bid").otherwise("ask").as("side"),
      round(basePrice + rand(6L), 2).as("price"),
      (rand(7L) * 1000 + 1).cast("long").as("size")
    )
  }
}
