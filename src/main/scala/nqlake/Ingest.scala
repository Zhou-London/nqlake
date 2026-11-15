package nqlake

import java.sql.Timestamp
import java.time.LocalDate

import org.apache.spark.sql.{DataFrame, SparkSession}
import org.apache.spark.sql.functions._

object Ingest {
  def run(spark: SparkSession, settings: Settings, table: LakeTable, date: LocalDate): Unit = {
    import spark.implicits._

    val landed = spark.read
      .parquet(table.landingPath(settings, date))
      .select(table.schema.fields.toSeq.map(field => col(field.name).cast(field.dataType)): _*)
      .persist()

    try {
      val eventTime = col(LakeTable.EventTime)
      val (landedRows, first, last) =
        landed.agg(count(lit(1)), min(eventTime), max(eventTime)).as[(Long, Timestamp, Timestamp)].head()

      if (landedRows == 0) println(s"ingest ${table.name} $date: landed=0")
      else {
        val distinct = landed.dropDuplicates(table.key)
        upsert(table, distinct, first, last)
        println(
          s"ingest ${table.name} $date: landed=$landedRows distinct=${distinct.count()} " +
            s"table_rows=${spark.table(table.identifier).count()}"
        )
      }
    } finally landed.unpersist()
  }

  private def upsert(table: LakeTable, rows: DataFrame, first: Timestamp, last: Timestamp): Unit = {
    val target         = (column: String) => col(s"${table.identifier}.$column")
    val sameKey        = table.key.map(key => target(key) === col(s"landed.$key")).reduce(_ && _)
    val inLandedWindow = target(LakeTable.EventTime).between(first, last)

    rows
      .as("landed")
      .mergeInto(table.identifier, sameKey && inLandedWindow)
      .whenMatched()
      .updateAll()
      .whenNotMatched()
      .insertAll()
      .merge()
  }
}
