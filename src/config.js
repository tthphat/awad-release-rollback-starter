// I8 & I11: Configuration comes from environment variables instead of being hardcoded
const env = process.env.APP_ENV || 'development';
const port = Number(process.env.PORT) || 3000;
const dbPath = process.env.DB_PATH || './data/app.db';
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const adminToken = process.env.ADMIN_TOKEN;
const version = process.env.APP_VERSION || 'dev';

// I13 & I14: Fail-fast in production when secrets are missing or insecure
if (env === 'production') {
  // I13: Refuse to start if ADMIN_TOKEN is missing. Names the variable, never prints value.
  if (!adminToken) {
    console.error('Error: missing required environment variable ADMIN_TOKEN');
    process.exit(1);
  }
  // I14: Refuse to start if ADMIN_TOKEN uses default dev secret. Names variable without printing secret value.
  if (adminToken === 'dev-secret') {
    console.error('Error: ADMIN_TOKEN cannot use default development secret in production');
    process.exit(1);
  }
}

export const config = {
  env,
  port,
  dbPath,
  baseUrl,
  adminToken: adminToken || 'dev-secret',
  version,
};
