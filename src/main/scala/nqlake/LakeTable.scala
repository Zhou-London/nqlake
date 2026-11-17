package nqlake

import scala.jdk.CollectionConverters._

import org.apache.iceberg.Table
import org.apache.iceberg.spark.Spark3Util
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.types.{DateType, StructType, TimestampNTZType, TimestampType}

final case class LakeTable(name: String) {
  val qualifiedName: String = s"${LakeTable.Namespace}.$name"
  val identifier: String    = s"${Lake.Catalog}.$qualifiedName"

  def exists(spark: SparkSession): Boolean = spark.catalog.tableExists(identifier)

  def key(spark: SparkSession): Seq[String] = iceberg(spark).schema().identifierFieldNames().asScala.toSeq

  def isSorted(spark: SparkSession): Boolean = iceberg(spark).sortOrder().isSorted

  def partitionSources(spark: SparkSession): Seq[String] = {
    val table = iceberg(spark)
    table.spec().fields().asScala.toSeq.map(field => table.schema().findColumnName(field.sourceId()))
  }

  def create(spark: SparkSession, schema: StructType, key: Seq[String], partitioning: Partitioning): Unit = {
    val columns = StructType(schema.map(field => field.copy(nullable = field.nullable && !key.contains(field.name))))
    spark.sql(s"CREATE NAMESPACE IF NOT EXISTS ${Lake.Catalog}.${LakeTable.Namespace}")
    spark.sql(s"""
      CREATE TABLE $identifier (${columns.toDDL})
      USING iceberg
      ${partitioning.transform.zip(LakeTable.partitionColumn(columns)).fold("") { case (transform, column) =>
        s"PARTITIONED BY ($transform(${LakeTable.quoted(column)}))"
      }}
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
  val Date      = "date"

  private val ValidName = "[a-z][a-z0-9_]*".r

  def named(name: String): Either[String, LakeTable] =
    Either.cond(ValidName.matches(name), LakeTable(name), s"Not a table name (lowercase letters, digits, _): $name")

  def all(spark: SparkSession): Seq[LakeTable] =
    spark
      .sql(s"SHOW TABLES IN ${Lake.Catalog}.$Namespace")
      .collect()
      .toSeq
      .map(row => LakeTable(row.getAs[String]("tableName")))

  def partitionColumn(schema: StructType): Option[String] =
    if (schema.exists(field => field.name == EventTime && (field.dataType == TimestampType || field.dataType == TimestampNTZType)))
      Some(EventTime)
    else Option.when(schema.exists(field => field.name == Date && field.dataType == DateType))(Date)

  def quoted(column: String): String = s"`${column.replace("`", "``")}`"
}

sealed abstract class Partitioning(val name: String, val transform: Option[String])

object Partitioning {
  case object Day           extends Partitioning("day", Some("days"))
  case object Month         extends Partitioning("month", Some("months"))
  case object Year          extends Partitioning("year", Some("years"))
  case object Unpartitioned extends Partitioning("none", None)

  val all: Seq[Partitioning] = Seq(Day, Month, Year, Unpartitioned)
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
