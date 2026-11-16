package nqlake

object Terminal {
  def confirmed(question: String): Boolean =
    Option(System.console()) match {
      case Some(console) => Option(console.readLine("%s [y/N] ", question)).exists(_.trim.equalsIgnoreCase("y"))
      case None          => throw new IllegalStateException("no terminal to confirm on; pass --yes")
    }
}
