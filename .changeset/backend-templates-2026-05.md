---
"@lhx-kit/cli": minor
---

feat(cli): add koa-service, fastify-service, and 3 microservice templates (express/koa/fastify-micro)

### New templates

- **koa-service** — Koa 2 + TypeScript service with pino logger, zod env, multistage Dockerfile, graceful shutdown; supports `db-pg | db-mysql | db-none` and `cache-redis | cache-none` feature axes
- **fastify-service** — Fastify 5 + TypeScript service with built-in pino, zod env, same feature axes as koa-service
- **express-micro** — Express 4 microservice: Redis (ioredis + BullMQ) built-in, `/livez` + `/readyz` health endpoints, BullMQ worker (`src/worker.ts`), k8s Deployment + Service YAML, db feature axis
- **koa-micro** — Koa 2 microservice with the same micro stack
- **fastify-micro** — Fastify 5 microservice with the same micro stack

### Microservice design decisions

- **Redis is built-in** for all `*-micro` templates (required by BullMQ); `cache-redis` feature is not applied — REDIS_URL is in the base env schema
- **`src/db.ts` stub** — present in every micro template; overwritten by `db-pg` or `db-mysql` feature at scaffold time so readiness checks (`/readyz`) always compile cleanly regardless of db selection
- **BullMQ worker** — `src/worker.ts` is a separate binary; `pnpm dev:worker` and `pnpm start:worker` scripts included
- **k8s manifests** — `k8s/deployment.yaml` wires liveness (`/livez`) and readiness (`/readyz`) probes; `k8s/service.yaml` exposes ClusterIP port 80

### Feature updates

- `db-pg`, `db-mysql`, `db-none` `appliesTo` extended to include all 3 micro variants

### create + wizard

- **Backend auto-injection** — when no db/cache feature is passed, `db-pg` (and `cache-redis` for non-micro) are injected automatically; preserves explicit `--features` flag
- **Backend wizard branch** — interactive mode now prompts for Database (pg/mysql/none) and Cache (redis/none, skipped for micro); summary panel reflects selections
