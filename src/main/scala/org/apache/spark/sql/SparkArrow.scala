package org.apache.spark.sql

import org.apache.arrow.vector.types.pojo.Schema
import org.apache.spark.sql.types.StructType
import org.apache.spark.sql.util.ArrowUtils

object SparkArrow {
  def schema(sparkSchema: StructType, timeZone: String): Schema =
    ArrowUtils.toArrowSchema(sparkSchema, timeZone, errorOnDuplicatedFieldNames = true, largeVarTypes = false)
}
