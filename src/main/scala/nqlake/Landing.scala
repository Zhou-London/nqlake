package nqlake

import java.nio.file.Paths

import org.apache.hadoop.conf.Configuration
import org.apache.hadoop.fs.Path

object Landing {
  def directory(settings: Settings, table: LakeTable): Path = new Path(root(settings), table.name)

  def tables(settings: Settings, hadoop: Configuration): Seq[LakeTable] = {
    val bucket = root(settings)
    bucket
      .getFileSystem(hadoop)
      .listStatus(bucket)
      .toSeq
      .filter(_.isDirectory)
      .map(_.getPath.getName)
      .filterNot(isHidden)
      .sorted
      .map(name => LakeTable.named(name).fold(reason => throw new IllegalArgumentException(s"landing: $reason"), identity))
  }

  def files(settings: Settings, table: LakeTable, hadoop: Configuration): Seq[Path] = {
    val landed = directory(settings, table)
    if (landed.getFileSystem(hadoop).exists(landed)) filesUnder(landed, hadoop) else Seq.empty
  }

  def remove(files: Seq[Path], hadoop: Configuration): Unit =
    files.foreach(file => file.getFileSystem(hadoop).delete(file, false))

  def location(file: String): Path =
    if (file.contains("://")) new Path(file) else new Path(Paths.get(file).toAbsolutePath.normalize().toUri)

  def filesUnder(location: Path, hadoop: Configuration): Seq[Path] = {
    val fileSystem = location.getFileSystem(hadoop)
    val status     = fileSystem.getFileStatus(location)
    if (status.isFile) Seq(status.getPath)
    else {
      val base    = status.getPath.toUri
      val listing = fileSystem.listFiles(status.getPath, true)
      Iterator
        .continually(listing)
        .takeWhile(_.hasNext)
        .map(_.next().getPath)
        .filterNot(file => base.relativize(file.toUri).getPath.split('/').exists(isHidden))
        .toSeq
        .sortBy(_.toString)
    }
  }

  private def root(settings: Settings): Path = new Path(s"s3a://${settings.landingBucket}/")

  private def isHidden(name: String): Boolean = name.startsWith("_") || name.startsWith(".")
}
