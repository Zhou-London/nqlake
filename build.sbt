ThisBuild / organization := "com.nowquant"
ThisBuild / version      := "1.0.0-SNAPSHOT"
ThisBuild / scalaVersion := "2.13.18"

val sparkVersion   = "4.1.4"
val icebergVersion = "1.12.0"
val hadoopVersion  = "3.4.2"
val awsSdkVersion  = "2.54.17"

val sparkJvmOptions = Seq(
  "-XX:+IgnoreUnrecognizedVMOptions",
  "--add-opens=java.base/java.lang=ALL-UNNAMED",
  "--add-opens=java.base/java.lang.invoke=ALL-UNNAMED",
  "--add-opens=java.base/java.lang.reflect=ALL-UNNAMED",
  "--add-opens=java.base/java.io=ALL-UNNAMED",
  "--add-opens=java.base/java.net=ALL-UNNAMED",
  "--add-opens=java.base/java.nio=ALL-UNNAMED",
  "--add-opens=java.base/java.util=ALL-UNNAMED",
  "--add-opens=java.base/java.util.concurrent=ALL-UNNAMED",
  "--add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED",
  "--add-opens=java.base/jdk.internal.ref=ALL-UNNAMED",
  "--add-opens=java.base/sun.nio.ch=ALL-UNNAMED",
  "--add-opens=java.base/sun.nio.cs=ALL-UNNAMED",
  "--add-opens=java.base/sun.security.action=ALL-UNNAMED",
  "--add-opens=java.base/sun.util.calendar=ALL-UNNAMED",
  "-Djdk.reflect.useDirectMethodHandle=false",
  "-Dio.netty.tryReflectionSetAccessible=true"
)

lazy val nqlake = (project in file("."))
  .enablePlugins(JavaAppPackaging, BuildInfoPlugin)
  .settings(
    name := "nqlake",
    scalacOptions ++= Seq("-deprecation", "-feature", "-Xlint", "-Werror"),
    libraryDependencies ++= Seq(
      "org.apache.spark"      %% "spark-sql"                 % sparkVersion,
      "org.apache.iceberg"    %% "iceberg-spark-runtime-4.1" % icebergVersion,
      "org.apache.iceberg"     % "iceberg-aws-bundle"        % icebergVersion,
      "org.apache.hadoop"      % "hadoop-aws"                % hadoopVersion exclude ("software.amazon.awssdk", "bundle"),
      "software.amazon.awssdk" % "s3-transfer-manager"       % awsSdkVersion intransitive (),
      "software.amazon.awssdk" % "apache-client"             % awsSdkVersion,
      "com.monovore"          %% "decline"                   % "2.6.2"
    ),
    buildInfoKeys    := Seq[BuildInfoKey](name, version),
    buildInfoPackage := "nqlake",
    run / fork       := true,
    run / javaOptions ++= sparkJvmOptions,
    bashScriptExtraDefines += sparkJvmOptions.mkString("declare -a jvm_options=('", "' '", "')"),
    makeBatScripts := Seq.empty,
    Compile / packageDoc / mappings := Seq.empty
  )
