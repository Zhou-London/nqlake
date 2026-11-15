package nqlake

import java.time.{Instant, ZoneOffset}
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

import org.apache.spark.sql.{Row, SparkSession}

object Maintain {
  private val SqlTimestamp = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC)

  def run(spark: SparkSession, table: LakeTable, retentionDays: Int): Unit = {
    val cutoff = SqlTimestamp.format(Instant.now().minus(retentionDays.toLong, ChronoUnit.DAYS))
    val target = s"table => '${table.identifier}'"
    def call(procedure: String): Array[Row] =
      spark.sql(s"CALL ${Lake.Catalog}.system.$procedure").collect()

    val compacted = call(s"rewrite_data_files($target, strategy => 'sort')").head
    call(s"rewrite_manifests($target)")
    val expired = call(s"expire_snapshots($target, older_than => TIMESTAMP '$cutoff')").head
    val orphans = call(s"remove_orphan_files($target, older_than => TIMESTAMP '$cutoff')")

    println(
      s"maintain ${table.name}: " +
        s"rewritten_data_files=${compacted.getAs[Int]("rewritten_data_files_count")} " +
        s"added_data_files=${compacted.getAs[Int]("added_data_files_count")} " +
        s"expired_data_files=${expired.getAs[Long]("deleted_data_files_count")} " +
        s"orphan_files=${orphans.length}"
    )
  }
}
