export default {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "0.0.0.0", "192.168.*.*", "10.*.*.*", "*.local"],
  serverExternalPackages: ["@duckdb/node-api"],
  experimental: { turbopackFileSystemCacheForDev: false },
};
