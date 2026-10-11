# Developer tools and test harness

- `configure.mjs` — **the only build step**: writes your Supabase URL and public key into the site (see ADMIN_CMS_GUIDE.md §3).

- `annotate.py` — added the `data-cms-*` attributes to the original pages (already applied; kept for reference).
- `gen-seed.mjs` — generates `supabase/migrations/20261010000003_cms_seed_content.sql` from the pages, so the database starts with exactly the content the site shows.
- `localstack/` — the local test stack and test suites:
  - `gateway.mjs` routes `/rest/v1` to PostgREST, `/auth/v1` to Supabase Auth (GoTrue) and emulates `/storage/v1` while enforcing the storage RLS policies; it also serves the site.
  - `api-security.test.mjs`, `public-parity.test.mjs`, `admin-e2e.test.mjs` — the suites in ADMIN_TEST_REPORT.md.
  - `start.sh` starts the stack; `run-all.sh` runs every suite from a clean state.
  - `migration-idempotency.test.sh`, `sql-scripts.test.sh`, `configure.test.sh`, `static-checks.mjs` — further suites.
  - `mkusers.mjs` — creates test logins. `../reset-local-db.sh` rebuilds the local database from the migrations.
- `../Sri_Danvantari_Dental_Care/supabase/tests/local-bootstrap.sql` — recreates the Supabase roles/schemas on plain Postgres. **Never run it on the live project.**

Requirements: Postgres 16, GoTrue and PostgREST binaries, Node 20+, `npm i pg playwright pngjs pixelmatch cheerio`.
