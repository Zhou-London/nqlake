package nqlake

import java.time.LocalDate

import org.apache.spark.sql.types.StructType

sealed abstract class LakeTable(val name: String, val key: Seq[String], columns: String) {
  val schema: StructType = StructType.fromDDL(columns)
  val identifier: String = s"${Lake.Catalog}.${LakeTable.Namespace}.$name"

  def landingPath(settings: Settings, date: LocalDate): String =
    s"s3a://${settings.landingBucket}/$name/date=$date"
}

object LakeTable {
  val Namespace = "market"
  val EventTime = "ts"

  case object Ohlcv
      extends LakeTable(
        name = "ohlcv",
        key = Seq("symbol", EventTime),
        columns = "symbol STRING, ts TIMESTAMP, open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE, volume BIGINT"
      )

  case object Mbo
      extends LakeTable(
        name = "mbo",
        key = Seq("symbol", EventTime, "sequence"),
        columns =
          "symbol STRING, ts TIMESTAMP, sequence BIGINT, order_id BIGINT, action STRING, side STRING, price DOUBLE, size BIGINT"
      )

  val all: Seq[LakeTable] = Seq(Ohlcv, Mbo)
}
