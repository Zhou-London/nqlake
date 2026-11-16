package nqlake

import org.apache.spark.sql.SparkSession

object Lake {
  val Catalog = "lake"

  private val Region = "us-east-1"

  def session(settings: Settings): SparkSession =
    SparkSession
      .builder()
      .appName(BuildInfo.name)
      .master("local[*]")
      .config("spark.ui.enabled", false)
      .config("spark.driver.host", "localhost")
      .config("spark.driver.bindAddress", "127.0.0.1")
      .config("spark.sql.session.timeZone", "UTC")
      .config("spark.sql.legacy.parquet.nanosAsLong", true)
      .config("spark.sql.parquet.outputTimestampType", "TIMESTAMP_MICROS")
      .config("spark.hadoop.mapreduce.fileoutputcommitter.marksuccessfuljobs", false)
      .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
      .config("spark.sql.defaultCatalog", Catalog)
      .config(s"spark.sql.catalog.$Catalog", "org.apache.iceberg.spark.SparkCatalog")
      .config(s"spark.sql.catalog.$Catalog.type", "rest")
      .config(s"spark.sql.catalog.$Catalog.uri", settings.catalogUri.toString)
      .config(s"spark.sql.catalog.$Catalog.warehouse", settings.warehouse)
      .config(s"spark.sql.catalog.$Catalog.s3.endpoint", settings.s3Endpoint.toString)
      .config(s"spark.sql.catalog.$Catalog.s3.path-style-access", true)
      .config(s"spark.sql.catalog.$Catalog.s3.access-key-id", settings.s3AccessKey)
      .config(s"spark.sql.catalog.$Catalog.s3.secret-access-key", settings.s3SecretKey)
      .config(s"spark.sql.catalog.$Catalog.client.region", Region)
      .config(s"spark.sql.catalog.$Catalog.rest.auth.type", "sigv4")
      .config(s"spark.sql.catalog.$Catalog.rest.signing-name", "s3")
      .config(s"spark.sql.catalog.$Catalog.rest.signing-region", Region)
      .config(s"spark.sql.catalog.$Catalog.rest.access-key-id", settings.s3AccessKey)
      .config(s"spark.sql.catalog.$Catalog.rest.secret-access-key", settings.s3SecretKey)
      .config("spark.hadoop.fs.s3.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
      .config("spark.hadoop.fs.s3a.endpoint", settings.s3Endpoint.toString)
      .config("spark.hadoop.fs.s3a.endpoint.region", Region)
      .config("spark.hadoop.fs.s3a.path.style.access", true)
      .config("spark.hadoop.fs.s3a.access.key", settings.s3AccessKey)
      .config("spark.hadoop.fs.s3a.secret.key", settings.s3SecretKey)
      .getOrCreate()
}
