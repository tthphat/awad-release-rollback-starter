# BRIEF — IA#4 Release and Rollback (CSC13114)

Student: 23120319 — Trương Thành Phát

---

## Hand-over #1: Production packaging for linkbox v1
- **Date:** 2026-11-16
- **Objective:** Package the `linkbox` service into a production-ready Docker image `linkbox:v1` without altering business logic.
- **Detailed requirements:**
  1. Update `Dockerfile`:
     - Pinned base image `node:22-alpine`.
     - Image size $\le 300\text{ MB}$.
     - Run as non-root user `USER node`.
     - No secrets (`ADMIN_TOKEN`) baked into image layers or history.
     - Grant ownership of `/data` volume directory to user `node`.
     - Bake `APP_VERSION` via build argument: `docker build --build-arg APP_VERSION=1.0.0 -t linkbox:v1 .`.
     - Add `HEALTHCHECK` directive probing HTTP `/health`.
     - Exec-form `CMD ["node", "src/server.js"]` so Node runs as PID 1 to receive `SIGTERM`.
  2. Create `.dockerignore`:
     - Exclude `.git`, `env/`, `tools/`, `test/`, `deploy/`, `data/`, logs, and documentation files from `/app`.
  3. Update `src/config.js` and `src/server.js`:
     - Read config from environment variables: `APP_ENV`, `BASE_URL`, `DB_PATH`, `ADMIN_TOKEN`.
     - Fail-fast in production if `ADMIN_TOKEN` is missing or uses `dev-secret`, naming the variable without leaking the secret value.
     - Handle `SIGTERM` for graceful shutdown under 8 seconds.
  4. Update `package.json`:
     - Decouple migrations from `npm start` (start script runs server only).
- **Strict limits:**
  - NOTHING under `tools/` and NOTHING in `test/app.test.js` may change.
  - Do not run `git commit` or `git push`.
- **Done condition:**
  - `npm run check -- image --new=linkbox:v1` passes all 15 checks (`I1` through `I15`).
- **Status:** COMPLETED (Committed as commit `1a571dd`, tagged `v1`, 15/15 PASS).

---

## Hand-over #2: Link expiry feature behind database flag and migration 002 (v2)
- **Date:** 2026-11-17
- **Objective:** Implement the link expiry feature, database feature flag, and expand/contract schema migrations according to `docs/CHANGE.md` without breaking backward compatibility with `v1`.
- **Detailed requirements:**
  1. Migrations (`migrations/002_expiry.up.sql` and `migrations/002_expiry.down.sql`):
     - `002_expiry.up.sql`: Expand schema by adding a nullable `expires_at TEXT` column to `links`, and create a `flags` table (`name TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0`). Existing links retain `expires_at: null` and never expire.
     - `002_expiry.down.sql`: Provide a safe rollback path back to schema 001 (drop `flags` table and revert `links` table without `expires_at`).
  2. Startup schema validation (Fail-fast):
     - `v2` must verify on startup that `expires_at` column exists in table `links`. If migration `002` has not run, `createApp` must throw an error and fail immediately so container never reports healthy before its migration.
  3. Database-backed feature flag (`expiry`):
     - Flag state is stored in the database, defaulted to OFF (`enabled: false`).
     - Must not require container restart or environment variable changes to flip.
     - Any running instance sharing the database must observe flag updates within 2 seconds.
     - `PUT /admin/flags/expiry`: Requires `x-admin-token: <ADMIN_TOKEN>`. Returns 200 with new state on success; 401 on invalid/missing token.
     - `GET /version`: Includes `flags`: `{"version": "2.0.0", "env": "staging", "flags": {"expiry": false}}`.
  4. Logic when flag is OFF:
     - Exact same behavior as `v1`. `expiresInSeconds` in POST body is ignored, responses return `expiresAt: null`, and `GET /r/:code` always redirects (302) even for expired links.
  5. Logic when flag is ON:
     - `POST /links` with positive integer `expiresInSeconds`: Returns 201 with ISO 8601 `expiresAt`.
     - `POST /links` without `expiresInSeconds`: Returns 201 with `expiresAt: null` (never expires).
     - `POST /links` with invalid `expiresInSeconds` (not a positive integer): Returns 400.
     - `GET /r/:code`: If not expired, redirects (302) and increments hits; if expired, returns 410 `{"error": "expired"}` without incrementing hits.
     - `GET /links/:code` and `GET /links`: Return `expiresAt` whether expired or not.
- **Strict limits:**
  - **NOTHING under `tools/` and NOTHING in `test/app.test.js` may change.**
  - `v1` must continue to operate flawlessly on the migrated schema (`C1`, `C2`).
  - Do not run `git commit` or `git push`.
- **Done conditions:**
  - `npm test` passes all 6 tests (check `T3`).
  - `npm run check -- change` passes all 7 checks (`F1` through `F7`).
  - `npm run check -- compat` passes all 4 checks (`C1` through `C4`).
