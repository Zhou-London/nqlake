package nqlake

import java.net.URI

final case class Settings(
    catalogUri: URI,
    warehouse: String,
    s3Endpoint: URI,
    s3AccessKey: String,
    s3SecretKey: String,
    landingBucket: String
)
