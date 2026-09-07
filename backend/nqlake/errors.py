"""Errors the lake layer raises on purpose. The API layer maps each to an HTTP status."""


class LakeError(Exception):
    """Base class of every error raised on purpose by ``nqlake.lake``."""


class NotFound(LakeError):
    """Names a namespace or table that the catalog does not hold."""


class AlreadyExists(LakeError):
    """Names a namespace or table that the catalog already holds."""


class InvalidRequest(LakeError):
    """Rejects input the lake cannot act on: a bad name, filter, type, or schema."""


class Incompatible(InvalidRequest):
    """Rejects data whose schema cannot be stored in the target Iceberg table.

    ``problems`` lists one sentence per offending column so the caller can fix
    every column in one pass.
    """

    def __init__(self, message: str, problems: list[str]) -> None:
        super().__init__(message)
        self.problems = problems


class Unavailable(LakeError):
    """Reports a service the lake depends on that did not answer."""
