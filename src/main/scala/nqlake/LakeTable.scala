package nqlake

import scala.jdk.CollectionConverters._

import org.apache.iceberg.Table
import org.apache.iceberg.spark.Spark3Util
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.types.{StructType, TimestampNTZType, TimestampType}

final case class LakeTable(name: String) {
  val qualifiedName: String = s"${LakeTable.Namespace}.$name"
  val identifier: String    = s"${Lake.Catalog}.$qualifiedName"

  def exists(spark: SparkSession): Boolean = spark.catalog.tableExists(identifier)

  def key(spark: SparkSession): Seq[String] = iceberg(spark).schema().identifierFieldNames().asScala.toSeq

  def isSorted(spark: SparkSession): Boolean = iceberg(spark).sortOrder().isSorted

  def create(spark: SparkSession, schema: StructType, key: Seq[String]): Unit = {
    val columns = StructType(schema.map(field => field.copy(nullable = field.nullable && !key.contains(field.name))))
    val partitionedByDay = schema.exists { field =>
      field.name == LakeTable.EventTime && (field.dataType == TimestampType || field.dataType == TimestampNTZType)
    }
    spark.sql(s"CREATE NAMESPACE IF NOT EXISTS ${Lake.Catalog}.${LakeTable.Namespace}")
    spark.sql(s"""
      CREATE TABLE $identifier (${columns.toDDL})
      USING iceberg
      ${if (partitionedByDay) s"PARTITIONED BY (days(${LakeTable.EventTime}))" else ""}
      TBLPROPERTIES (
        'format-version' = '2',
        'write.parquet.compression-codec' = 'zstd'
      )""")
    if (key.nonEmpty) {
      val keyColumns = key.map(LakeTable.quoted).mkString(", ")
      spark.sql(s"ALTER TABLE $identifier WRITE ORDERED BY $keyColumns")
      spark.sql(s"ALTER TABLE $identifier SET IDENTIFIER FIELDS $keyColumns")
    }
  }

  private def iceberg(spark: SparkSession): Table = Spark3Util.loadIcebergTable(spark, identifier)
}

object LakeTable {
  val Namespace = "market"
  val EventTime = "ts"

  private val ValidName = "[a-z][a-z0-9_]*".r

  def named(name: String): Either[String, LakeTable] =
    Either.cond(ValidName.matches(name), LakeTable(name), s"Not a table name (lowercase letters, digits, _): $name")

  def all(spark: SparkSession): Seq[LakeTable] =
    spark
      .sql(s"SHOW TABLES IN ${Lake.Catalog}.$Namespace")
      .collect()
      .toSeq
      .map(row => LakeTable(row.getAs[String]("tableName")))

  def quoted(column: String): String = s"`${column.replace("`", "``")}`"
}

sealed abstract class SampleTable(name: String, val key: Seq[String], columns: String) {
  val table: LakeTable   = LakeTable(name)
  val schema: StructType = StructType.fromDDL(columns)
}

object SampleTable {
  case object Ohlcv
      extends SampleTable(
        name = "ohlcv",
        key = Seq("symbol", LakeTable.EventTime),
        columns = "symbol STRING, ts TIMESTAMP, open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE, volume BIGINT"
      )

  case object Mbo
      extends SampleTable(
        name = "mbo",
        key = Seq("symbol", LakeTable.EventTime, "sequence"),
        columns =
          "symbol STRING, ts TIMESTAMP, sequence BIGINT, order_id BIGINT, action STRING, side STRING, price DOUBLE, size BIGINT"
      )

  val all: Seq[SampleTable] = Seq(Ohlcv, Mbo)
}
