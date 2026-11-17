package nqlake

import org.apache.hadoop.fs.Path
import org.apache.spark.sql.{DataFrame, SparkSession}
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types.{StructField, StructType}

object Upload {
  private final case class Target(schema: StructType, key: Seq[String], creation: Option[Partitioning]) {
    val isNew: Boolean = creation.nonEmpty
  }

  def run(
      spark: SparkSession,
      settings: Settings,
      files: Seq[String],
      tables: Seq[LakeTable],
      key: Seq[String],
      partitioning: Option[Partitioning],
      assumeYes: Boolean
  ): Unit = {
    val hadoop = spark.sparkContext.hadoopConfiguration
    def load(table: LakeTable, parquetFiles: Seq[Path]): Unit =
      this.load(spark, table, parquetFiles, key, partitioning, assumeYes)

    if (files.nonEmpty) load(tables.head, files.flatMap(file => Landing.filesUnder(Landing.location(file), hadoop)))
    else {
      val landedTables = if (tables.nonEmpty) tables else Landing.tables(settings, hadoop)
      if (landedTables.isEmpty) println("upload: nothing in landing")
      landedTables.foreach { table =>
        val landed = Landing.files(settings, table, hadoop)
        if (landed.isEmpty) println(s"upload ${table.name}: nothing in landing")
        else {
          load(table, landed)
          Landing.remove(landed, hadoop)
          println(s"upload ${table.name}: removed ${counted(landed.size, "landing file")}")
        }
      }
    }
  }

  private def load(
      spark: SparkSession,
      table: LakeTable,
      files: Seq[Path],
      key: Seq[String],
      partitioning: Option[Partitioning],
      assumeYes: Boolean
  ): Unit = {
    if (files.isEmpty) throw new IllegalArgumentException("no Parquet files to upload")
    val source   = ParquetSource.read(spark, files)
    val target   = targetOf(spark, table, source, key, partitioning)
    val inFile   = source.columns.map(column => column.name -> column).toMap
    val required = target.schema.fields.toSeq.filterNot(field => field.nullable || inFile.contains(field.name))
    if (required.nonEmpty)
      throw new IllegalArgumentException(
        s"the files lack required columns of ${table.qualifiedName}: ${required.map(_.name).mkString(", ")}"
      )

    val rows = source.rows.select(target.schema.fields.toSeq.map { field =>
      inFile.get(field.name).fold(lit(null))(_.value).cast(field.dataType).as(field.name)
    }: _*)

    val warnings = warningsOf(table, source, target)
    Console.err.println(
      s"upload ${table.name}: ${counted(files.size, "file")} -> " +
        target.creation.fold(s"table ${table.qualifiedName}") { partitioning =>
          s"new table ${table.qualifiedName}, " +
            partitioning.transform.zip(LakeTable.partitionColumn(target.schema)).fold("unpartitioned") { case (_, column) =>
              s"one partition per ${partitioning.name} of $column"
            }
        }
    )
    warnings.foreach(Console.err.println)
    if (warnings.nonEmpty && !assumeYes && !Terminal.confirmed("Continue?"))
      throw new IllegalStateException("aborted, nothing uploaded")

    target.creation.foreach(table.create(spark, target.schema, target.key, _))
    write(spark, table, target.key, rows, files.size)
  }

  private def targetOf(
      spark: SparkSession,
      table: LakeTable,
      source: ParquetSource,
      requestedKey: Seq[String],
      requestedPartitioning: Option[Partitioning]
  ): Target =
    if (table.exists(spark)) {
      if (requestedPartitioning.nonEmpty)
        throw new IllegalArgumentException(s"${table.qualifiedName} already exists; --partition only applies to a new table")
      val key = table.key(spark)
      if (requestedKey.nonEmpty && requestedKey.toSet != key.toSet)
        throw new IllegalArgumentException(
          s"${table.qualifiedName} already exists " +
            (if (key.isEmpty) "without a key" else s"with key (${key.mkString(", ")})")
        )
      Target(spark.table(table.identifier).schema, key, creation = None)
    } else {
      val unknown = requestedKey.filterNot(source.columns.map(_.name).contains)
      if (unknown.nonEmpty)
        throw new IllegalArgumentException(s"--key columns are not in the files: ${unknown.mkString(", ")}")
      val schema          = StructType(source.columns.map(column => StructField(column.name, column.lakeType)))
      val partitionColumn = LakeTable.partitionColumn(schema)
      if (partitionColumn.isEmpty && requestedPartitioning.exists(_.transform.nonEmpty))
        throw new IllegalArgumentException(
          s"--partition needs a timestamp column named ${LakeTable.EventTime} or a DATE column named ${LakeTable.Date}"
        )
      val partitioning =
        requestedPartitioning.getOrElse(if (partitionColumn.nonEmpty) Partitioning.Day else Partitioning.Unpartitioned)
      Target(schema, requestedKey, creation = Some(partitioning))
    }

  private def warningsOf(table: LakeTable, source: ParquetSource, target: Target): Seq[String] = {
    val tableType = target.schema.fields.map(field => field.name -> field.dataType.catalogString).toMap
    val converted = source.columns.filter(column => tableType.get(column.name).exists(_ != column.fileType))
    val dropped   = source.columns.map(_.name).filterNot(tableType.contains)
    val missing   = target.schema.fieldNames.toSeq.filterNot(source.columns.map(_.name).contains)
    val nameWidth = converted.map(_.name.length).maxOption.getOrElse(0)

    Seq(
      Option.when(converted.nonEmpty)(
        ("warning: column types are converted before writing:" +: converted.map { column =>
          s"  ${column.name.padTo(nameWidth, ' ')}  ${column.fileType} -> ${tableType(column.name)}" +
            column.note.fold("")(note => s"  ($note)")
        }).mkString("\n")
      ),
      Option.when(dropped.nonEmpty)(
        s"warning: columns not in ${table.qualifiedName} are dropped: ${dropped.mkString(", ")}"
      ),
      Option.when(missing.nonEmpty)(s"warning: columns missing from the files are written as NULL: ${missing.mkString(", ")}"),
      Option.when(target.isNew && target.key.isEmpty)("warning: no --key, so rows are appended and duplicates are kept")
    ).flatten
  }

  private def write(spark: SparkSession, table: LakeTable, key: Seq[String], rows: DataFrame, fileCount: Int): Unit = {
    val staged = rows.persist()
    try {
      val rowCount = staged.count()
      val written =
        if (rowCount == 0) ""
        else if (key.isEmpty) {
          staged.writeTo(table.identifier).append()
          s" table_rows=${spark.table(table.identifier).count()}"
        } else {
          val keyless = staged.filter(key.map(column => col(LakeTable.quoted(column)).isNull).reduce(_ || _)).count()
          if (keyless > 0)
            throw new IllegalArgumentException(s"$keyless rows have NULL in a key column (${key.mkString(", ")})")
          val distinct = staged.dropDuplicates(key)
          upsert(spark, table, key, distinct)
          s" distinct=${distinct.count()} table_rows=${spark.table(table.identifier).count()}"
        }
      println(s"upload ${table.name}: files=$fileCount rows=$rowCount$written")
    } finally staged.unpersist()
  }

  private def counted(count: Int, noun: String): String = if (count == 1) s"1 $noun" else s"$count ${noun}s"

  private def upsert(spark: SparkSession, table: LakeTable, key: Seq[String], rows: DataFrame): Unit = {
    val target  = (column: String) => col(s"${table.identifier}.${LakeTable.quoted(column)}")
    val landed  = (column: String) => col(s"landed.${LakeTable.quoted(column)}")
    val sameKey = key.map(column => target(column) === landed(column)).reduce(_ && _)
    val ranged  =
      if (key.contains(LakeTable.EventTime))
        (Seq(LakeTable.EventTime) ++ table.partitionSources(spark).filter(_ == LakeTable.Date)).distinct
      else Seq.empty
    val condition =
      if (ranged.isEmpty) sameKey
      else {
        val bounds = ranged.flatMap(column => Seq(min(col(LakeTable.quoted(column))), max(col(LakeTable.quoted(column)))))
        val window = rows.agg(bounds.head, bounds.tail: _*).head()
        sameKey && ranged.zipWithIndex.map { case (column, i) =>
          target(column).between(window.get(2 * i), window.get(2 * i + 1))
        }.reduce(_ && _)
      }

    rows
      .as("landed")
      .mergeInto(table.identifier, condition)
      .whenMatched()
      .updateAll()
      .whenNotMatched()
      .insertAll()
      .merge()
  }
}
