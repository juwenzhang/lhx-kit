---
"@lhx-kit/cli": minor
---

feat(cli): add pm2, db-migrate features + business-mono template using lhx-kit MPA architecture

### New features

- **pm2** — PM2 cluster-mode process manager feature. Adds `ecosystem.config.cjs` with `instances: 'max'`, log files, memory limit. Applies to all 6 service/micro templates and node-ts. Scripts: `start:pm2`, `stop:pm2`, `reload:pm2`, `logs:pm2`.
- **db-migrate** — Lightweight SQL migration runner using raw `pg`. Adds `src/scripts/migrate.ts` and `migrations/0001_initial.sql` with `-- migrate:up` / `-- migrate:down` blocks. Tracks applied migrations in `_migrations` table. Scripts: `db:migrate`, `db:rollback`, `db:status`.

### business-mono redesign

- **`apps/web` now uses the lhx-kit MPA architecture** (mirrors react-mpa) instead of a bare Vite SPA:
  - `project.config.ts` with `lhx-cli` scripts, `/api` proxy to Express port 3000, pages/aliases config
  - `vite.config.ts` uses `lhxKit()` + `@vitejs/plugin-react`
  - `template.html` (lhx-kit MPA HTML template)
  - `src/bootstrap.ts`, `src/env.d.ts`, MSW mocks, Zustand user store
  - `src/pages/home/` MPA page with entry.tsx, router.tsx, HomeLanding.tsx
  - `src/services/http.ts` (`createRequest` from `@lhx-kit/runtime`)
  - `src/services/example.ts` uses `ApiResponse<T>` from `@<%= packageName %>/types`
  - Offline support commented-in via `project.config.ts` (uncomment + add feature to enable)

### Smoke tests in examples/

All new templates verified in `examples/`:
- `express-svc-smoke`, `koa-svc-smoke`, `fastify-svc-smoke` — service templates with db-pg + cache-redis
- `express-micro-smoke`, `koa-micro-smoke`, `fastify-micro-smoke` — micro templates with db-pg
- `node-ts-smoke` — plain Node.js TypeScript template
- `business-smoke` — full-stack monorepo with lhx-kit MPA web
