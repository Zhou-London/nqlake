package nqlake

import scala.jdk.CollectionConverters._

import org.apache.hadoop.conf.Configuration
import org.apache.hadoop.fs.Path
import org.apache.parquet.hadoop.ParquetFileReader
import org.apache.parquet.hadoop.util.HadoopInputFile
import org.apache.parquet.schema.{LogicalTypeAnnotation, MessageType, Type}
import org.apache.parquet.schema.LogicalTypeAnnotation.{IntLogicalTypeAnnotation, TimeUnit, TimestampLogicalTypeAnnotation}
import org.apache.parquet.schema.PrimitiveType.PrimitiveTypeName
import org.apache.spark.sql.{Column, DataFrame, SparkSession}
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._

final case class SourceColumn(name: String, fileType: String, lakeType: DataType, value: Column, note: Option[String])

final case class ParquetSource(rows: DataFrame, columns: Seq[SourceColumn])

object ParquetSource {
  private val NanosPerMicro      = 1000L
  private val NanosecondsDropped = Some("nanoseconds are truncated to microseconds")

  def read(spark: SparkSession, files: Seq[Path]): ParquetSource = {
    val hadoop  = spark.sparkContext.hadoopConfiguration
    val schemas = files.map(file => file -> schemaOf(file, hadoop))
    val (firstFile, schema) = schemas.head
    schemas.find { case (_, other) => layout(other) != layout(schema) }.foreach { case (file, _) =>
      throw new IllegalArgumentException(s"$firstFile and $file differ in columns or types; upload them separately")
    }
    schema.getColumns.asScala.find(column => column.getPath.length > 1 && isNanosecond(column.getPrimitiveType)).foreach {
      nested =>
        throw new IllegalArgumentException(
          s"column ${nested.getPath.mkString(".")}: a nested nanosecond timestamp cannot be converted"
        )
    }

    val rows        = spark.read.parquet(files.map(_.toString): _*)
    val parquetType = schema.getFields.asScala.map(field => field.getName -> field).toMap
    ParquetSource(rows, rows.schema.fields.toSeq.map(field => column(field, parquetType(field.name))))
  }

  private def schemaOf(file: Path, hadoop: Configuration): MessageType = {
    val reader = ParquetFileReader.open(HadoopInputFile.fromPath(file, hadoop))
    try reader.getFileMetaData.getSchema
    finally reader.close()
  }

  private def layout(schema: MessageType): Map[String, String] =
    schema.getFields.asScala.map { field =>
      val physical =
        if (field.isPrimitive) s"${field.asPrimitiveType.getPrimitiveTypeName} ${field.getLogicalTypeAnnotation}"
        else field.toString
      field.getName -> physical
    }.toMap

  private def isNanosecond(field: Type): Boolean =
    field.getLogicalTypeAnnotation match {
      case timestamp: TimestampLogicalTypeAnnotation => timestamp.getUnit == TimeUnit.NANOS
      case _                                         => false
    }

  private def column(field: StructField, parquet: Type): SourceColumn = {
    val raw      = col(LakeTable.quoted(field.name))
    val lakeType = supported(field.dataType).getOrElse(
      throw new IllegalArgumentException(s"column ${field.name}: ${field.dataType.catalogString} has no Iceberg equivalent")
    )
    val asRead = SourceColumn(field.name, field.dataType.catalogString, lakeType, raw.cast(lakeType), None)

    if (!parquet.isPrimitive) asRead
    else
      (parquet.asPrimitiveType.getPrimitiveTypeName, parquet.getLogicalTypeAnnotation: LogicalTypeAnnotation) match {
        case (_, timestamp: TimestampLogicalTypeAnnotation) if timestamp.getUnit == TimeUnit.NANOS =>
          val wholeMicros = call_function("div", raw - pmod(raw, lit(NanosPerMicro)), lit(NanosPerMicro))
          val instant     = timestamp_micros(wholeMicros)
          if (timestamp.isAdjustedToUTC)
            SourceColumn(field.name, "timestamp[ns, UTC]", TimestampType, instant, NanosecondsDropped)
          else
            SourceColumn(field.name, "timestamp[ns]", TimestampNTZType, instant.cast(TimestampNTZType), NanosecondsDropped)
        case (PrimitiveTypeName.INT96, _) =>
          asRead.copy(fileType = "int96 timestamp", note = NanosecondsDropped)
        case (_, integer: IntLogicalTypeAnnotation) if !integer.isSigned =>
          asRead.copy(fileType = s"uint${integer.getBitWidth}")
        case _ => asRead
      }
  }

  private def supported(dataType: DataType): Option[DataType] =
    dataType match {
      case ByteType | ShortType => Some(IntegerType)
      case BooleanType | IntegerType | LongType | FloatType | DoubleType | StringType | BinaryType | DateType |
          TimestampType | TimestampNTZType | _: DecimalType =>
        Some(dataType)
      case ArrayType(element, containsNull) => supported(element).map(ArrayType(_, containsNull))
      case MapType(key, value, valueContainsNull) =>
        for (lakeKey <- supported(key); lakeValue <- supported(value)) yield MapType(lakeKey, lakeValue, valueContainsNull)
      case StructType(fields) =>
        val lakeFields = fields.toSeq.map(field => supported(field.dataType).map(lakeType => field.copy(dataType = lakeType)))
        Option.when(lakeFields.forall(_.isDefined))(StructType(lakeFields.flatten))
      case _ => None
    }
}
