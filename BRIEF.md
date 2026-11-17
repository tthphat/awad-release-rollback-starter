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
- **Status:** COMPLETED (Committed as commit `5c94b65`, tagged `v2`, tests, change, and compat all PASS).

---

## Hand-over #3: Canary release with automated quality gate and instant rollback
- **Date:** 2026-11-17
- **Objective:** Implement deployment scripts `deploy/release.js` (`npm run release -- <tag>`) and `deploy/rollback.js` (`npm run rollback`) supporting zero-downtime canary rollout with an automated error-detection gate and sub-second rollback.
- **Detailed requirements:**
  1. `deploy/release.js`:
     - CLI argument: `<tag>` (e.g. `v2`, `v3-bad`).
     - Query router `GET http://127.0.0.1:8081/state` to discover `activeSlot` (weight > 0) and `idleSlot` (weight === 0).
     - Start container for `idleSlot` with specified tag using `docker compose up -d --no-deps <idleSlot>` (passing `BLUE_TAG` or `GREEN_TAG` environment variable).
     - Wait for Docker container health check to become `healthy` (timeout 60s). If startup or healthcheck fails, keep traffic 100% on `activeSlot` and exit with non-zero code.
     - Canary Stage 1: Shift traffic to 10% on `idleSlot`, 90% on `activeSlot`. Hold for 12 seconds ($\ge 10$ seconds to satisfy `L4`).
     - Automated Quality Gate (Critical): Do NOT rely on container `/health` during canary traffic shifting (since `v3-bad` keeps `/health` 200 OK while failing 30% of reads with 500). Instead, actively poll live router statistics from `GET http://127.0.0.1:8081/state` during each canary stage. If `slots[idleSlot].errors` increments by 1 or more ($\Delta errors \ge 1$), immediately revert traffic 100% to `activeSlot`, record mark to `POST :8081/mark`, log error reason, and exit 1.
     - Canary Stage 2: If healthy, shift traffic to 50% on `idleSlot`, 50% on `activeSlot`. Hold for 12 seconds ($\ge 2$ stages before 100%).
     - Stage 3: Shift traffic to 100% on `idleSlot`, 0% on `activeSlot`. Record mark to `POST :8081/mark`.
     - Leave `activeSlot` running in standby for potential instant rollback.
  2. `deploy/rollback.js`:
     - CLI command: `npm run rollback`.
     - Query router `GET http://127.0.0.1:8081/state` to find the standby slot (weight < 100%).
     - Instantly shift 100% traffic to the standby slot via `POST http://127.0.0.1:8081/weights`.
     - Confirm new weights via `GET :8081/state`.
     - Post mark `POST :8081/mark`.
     - Log rollback duration and confirmation message.
- **Strict limits:**
  - NOTHING under `tools/` and NOTHING in `test/app.test.js` may change.
  - Tools fingerprint must remain `4b56096c90ea819d`.
  - Do not use `/health` as a canary quality gate; traffic gating must monitor router-level 5xx error metrics.
  - Never terminate the idle container after release.
  - Do not commit or push to git autonomously.
- **Done conditions:**
  - Scripts execute cleanly without syntax or runtime exceptions.
  - Canary stage timings satisfy `L4` (first stage $\le 25\%$ for $\ge 10$ seconds, $\ge 2$ stages before 100%).
  - Bad canary release stops at or below 25% and rolls back automatically satisfying `L7` and `L8`.
