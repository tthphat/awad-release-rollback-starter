import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

// v2 of the short-link service: supports link expiration behind a database feature flag.

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const newCode = () => [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join('');

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return null; }
}

const isUrl = (u) => typeof u === 'string' && /^https?:\/\/\S+$/.test(u);

export function createApp(db, config) {
  // Fail-fast schema check: fails immediately at startup if migration 002 has not run yet.
  const q = {
    insert: db.prepare('INSERT INTO links (code, url, expires_at) VALUES (?, ?, ?)'),
    get: db.prepare('SELECT code, url, hits, expires_at FROM links WHERE code = ?'),
    list: db.prepare('SELECT code, url, hits, expires_at FROM links ORDER BY id DESC LIMIT ? OFFSET ?'),
    hit: db.prepare('UPDATE links SET hits = hits + 1 WHERE code = ?'),
    ping: db.prepare('SELECT 1'),
    getFlag: db.prepare('SELECT enabled FROM flags WHERE name = ?'),
    setFlag: db.prepare('INSERT INTO flags (name, enabled) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled'),
  };

  // Reads flag state directly from SQLite (propagates across all instances within milliseconds)
  const getExpiryFlag = () => {
    try {
      const row = q.getFlag.get('expiry');
      return Boolean(row?.enabled);
    } catch {
      return false;
    }
  };

  const view = (row, flagExpiry) => ({
    code: row.code,
    url: row.url,
    shortUrl: `${config.baseUrl}/r/${row.code}`,
    hits: row.hits,
    expiresAt: flagExpiry ? (row.expires_at ?? null) : null,
  });

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const error = (res, status, code, message) => json(res, status, { error: code, message });

  async function handle(req, res) {
    res.setHeader('x-app-version', config.version);
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/health') {
      q.ping.get();
      return json(res, 200, { ok: true });
    }

    // F1: /version returns flags object
    if (req.method === 'GET' && url.pathname === '/version') {
      return json(res, 200, {
        version: config.version,
        env: config.env,
        flags: {
          expiry: getExpiryFlag(),
        },
      });
    }

    // F2 & F3: PUT /admin/flags/expiry with x-admin-token
    if (req.method === 'PUT' && parts[0] === 'admin' && parts[1] === 'flags' && parts[2] === 'expiry' && parts.length === 3) {
      const token = req.headers['x-admin-token'];
      if (!token || token !== config.adminToken) {
        return error(res, 401, 'unauthorized', 'invalid or missing admin token');
      }
      const body = await readBody(req);
      if (!body || typeof body.enabled !== 'boolean') {
        return error(res, 400, 'invalid_body', 'enabled boolean field is required');
      }
      q.setFlag.run('expiry', body.enabled ? 1 : 0);
      return json(res, 200, { enabled: body.enabled });
    }

    // tools/check.js uses this to hold a request open during docker stop. Leave it in.
    if (req.method === 'GET' && url.pathname === '/__probe/slow') {
      const ms = Math.min(Number(url.searchParams.get('ms') ?? 1000), 5000);
      await new Promise((r) => setTimeout(r, ms));
      return json(res, 200, { waited: ms });
    }

    const flagExpiry = getExpiryFlag();

    if (parts[0] === 'links' && parts.length === 1) {
      if (req.method === 'GET') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        return json(res, 200, q.list.all(limit, offset).map((row) => view(row, flagExpiry)));
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (!body || !isUrl(body.url)) return error(res, 400, 'invalid_body', 'url (http or https) is required');

        let expiresAt = null;
        if (flagExpiry) {
          if (body.expiresInSeconds !== undefined) {
            // F5: expiresInSeconds must be a positive integer
            if (typeof body.expiresInSeconds !== 'number' || !Number.isInteger(body.expiresInSeconds) || body.expiresInSeconds <= 0) {
              return error(res, 400, 'invalid_expiry', 'expiresInSeconds must be a positive whole number');
            }
            expiresAt = new Date(Date.now() + body.expiresInSeconds * 1000).toISOString();
          }
        }

        const code = newCode();
        q.insert.run(code, body.url, expiresAt);
        return json(res, 201, view(q.get.get(code), flagExpiry));
      }
    }

    if (req.method === 'GET' && parts[0] === 'links' && parts.length === 2) {
      const row = q.get.get(parts[1]);
      if (!row) return error(res, 404, 'not_found', `no link ${parts[1]}`);
      return json(res, 200, view(row, flagExpiry));
    }

    if (req.method === 'GET' && parts[0] === 'r' && parts.length === 2) {
      const row = q.get.get(parts[1]);
      if (!row) return error(res, 404, 'not_found', `no link ${parts[1]}`);

      // F6: When flag is ON and link is expired: 410 error and do not count hit
      if (flagExpiry && row.expires_at) {
        const expTime = new Date(row.expires_at).getTime();
        if (Date.now() >= expTime) {
          return json(res, 410, { error: 'expired' });
        }
      }

      q.hit.run(row.code);
      res.writeHead(302, { location: row.url });
      return res.end();
    }

    return error(res, 404, 'not_found', 'no such route');
  }

  return createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) error(res, 500, 'internal', e.message);
      else res.end();
    });
  });
}
