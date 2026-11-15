package nqlake

import java.nio.channels.FileChannel
import java.nio.file.{Files, Path, StandardCopyOption, StandardOpenOption}
import java.util.UUID

import org.apache.arrow.memory.RootAllocator
import org.apache.arrow.vector.VectorSchemaRoot
import org.apache.arrow.vector.ipc.ArrowFileWriter
import org.apache.spark.sql.{DataFrame, SparkArrow, SparkSession}
import org.apache.spark.sql.execution.arrow.ArrowWriter
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types.{BinaryType, StringType}

object Mmap {
  private val TimeZone            = "UTC"
  private val OffsetBytesPerValue = 4L

  private final case class Estimate(rows: Long, bytes: Long)
  private final case class Written(rows: Long, batches: Long, bytes: Long)

  def run(spark: SparkSession, query: String, output: Path, batchRows: Int, assumeYes: Boolean): Unit = {
    val target    = output.toAbsolutePath.normalize()
    val directory = target.getParent
    if (!Files.isDirectory(directory)) throw new IllegalArgumentException(s"output directory does not exist: $directory")
    val rows = spark.sql(s"SELECT * FROM (\n${query.trim.stripSuffix(";")}\n)")

    val estimate  = estimateSize(rows)
    val freeBytes = Files.getFileStore(directory).getUsableSpace
    Console.err.println(
      s"mmap $target: rows=${estimate.rows} estimated_size=${readable(estimate.bytes)} free_space=${readable(freeBytes)}"
    )
    if (estimate.bytes > freeBytes) throw new IllegalStateException(s"not enough free space in $directory")
    if (!assumeYes && !confirmed(s"Write $target?")) throw new IllegalStateException("aborted, nothing written")

    val partial = directory.resolve(s".${target.getFileName}.${UUID.randomUUID()}.partial")
    try {
      val written = write(rows, partial, batchRows)
      Files.move(partial, target, StandardCopyOption.ATOMIC_MOVE)
      println(s"mmap $target: rows=${written.rows} batches=${written.batches} size=${readable(written.bytes)}")
    } finally Files.deleteIfExists(partial)
  }

  private def estimateSize(rows: DataFrame): Estimate = {
    val fields                    = rows.schema.fields.toSeq
    val (variableWidth, fixedWidth) = fields.partition(f => f.dataType == StringType || f.dataType == BinaryType)
    val valueBytes                = variableWidth.map(f => coalesce(sum(octet_length(col(s"`${f.name}`"))), lit(0L)))
    val totals                    = rows.agg(count(lit(1)), valueBytes: _*).head()

    val rowCount      = totals.getLong(0)
    val variableBytes = variableWidth.indices.map(i => totals.getLong(i + 1)).sum
    val bytesPerRow   = fixedWidth.map(_.dataType.defaultSize.toLong).sum + variableWidth.size * OffsetBytesPerValue
    val validityBytes = rowCount * fields.size / 8
    Estimate(rowCount, rowCount * bytesPerRow + variableBytes + validityBytes)
  }

  private def write(rows: DataFrame, file: Path, batchRows: Int): Written = {
    val allocator = new RootAllocator()
    val root      = VectorSchemaRoot.create(SparkArrow.schema(rows.schema, TimeZone), allocator)
    val channel   = FileChannel.open(file, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)
    val arrowFile = new ArrowFileWriter(root, null, channel)
    val rowWriter = ArrowWriter.create(root)

    var rowCount   = 0L
    var batchCount = 0L
    def flushBatch(): Unit = {
      rowWriter.finish()
      arrowFile.writeBatch()
      rowWriter.reset()
      batchCount += 1
    }

    try {
      arrowFile.start()
      rows.queryExecution.toRdd.map(_.copy()).toLocalIterator.foreach { row =>
        rowWriter.write(row)
        rowCount += 1
        if (rowCount % batchRows == 0) flushBatch()
      }
      if (rowCount % batchRows != 0) flushBatch()
      arrowFile.end()
      channel.force(true)
      Written(rowCount, batchCount, channel.size())
    } finally {
      arrowFile.close()
      root.close()
      allocator.close()
    }
  }

  private def confirmed(question: String): Boolean =
    Option(System.console()) match {
      case Some(console) => Option(console.readLine("%s [y/N] ", question)).exists(_.trim.equalsIgnoreCase("y"))
      case None          => throw new IllegalStateException("no terminal to confirm on; pass --yes")
    }

  private def readable(bytes: Long): String = {
    val units = Seq("B", "KiB", "MiB", "GiB", "TiB")
    val exponent = if (bytes < 1024) 0 else math.min(units.size - 1, (math.log(bytes.toDouble) / math.log(1024)).toInt)
    f"${bytes / math.pow(1024, exponent.toDouble)}%.1f ${units(exponent)}"
  }
}
