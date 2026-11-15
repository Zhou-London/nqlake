package nqlake

import org.apache.spark.sql.SparkSession

object Init {
  def run(spark: SparkSession): Unit = {
    spark.sql(s"CREATE NAMESPACE IF NOT EXISTS ${Lake.Catalog}.${LakeTable.Namespace}")
    LakeTable.all.foreach { table =>
      spark.sql(s"""
        CREATE TABLE IF NOT EXISTS ${table.identifier} (${table.schema.toDDL})
        USING iceberg
        PARTITIONED BY (days(${LakeTable.EventTime}))
        TBLPROPERTIES (
          'format-version' = '2',
          'write.parquet.compression-codec' = 'zstd'
        )""")
      spark.sql(s"ALTER TABLE ${table.identifier} WRITE ORDERED BY ${table.key.mkString(", ")}")
      println(s"init ${table.name}: ready")
    }
  }
}
