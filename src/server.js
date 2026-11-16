import { config } from './config.js';
import { open } from './db.js';
import { createApp } from './app.js';

const db = open(config.dbPath);
const server = createApp(db, config);

server.listen(config.port, () =>
  console.log(`linkbox ${config.version} (${config.env}) on :${config.port}, db ${config.dbPath}`));

// I10: Graceful shutdown on SIGTERM (sent by `docker stop`).
// Stops accepting new connections, allows in-flight requests to complete, and exits under 8 seconds.
process.on('SIGTERM', () => {
  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
});
