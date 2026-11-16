package nqlake

import org.apache.spark.sql.SparkSession

object Init {
  def run(spark: SparkSession): Unit =
    SampleTable.all.foreach { sample =>
      if (!sample.table.exists(spark)) sample.table.create(spark, sample.schema, sample.key, Partitioning.Day)
      println(s"init ${sample.table.name}: ready")
    }
}
