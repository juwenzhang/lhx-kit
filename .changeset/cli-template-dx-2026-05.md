---
"@lhx-kit/cli": minor
---

feat(cli): backend template DX improvements — nodemon, Redis reconnect, startup logs

### nodemon auto-restart
All backend templates (`express-service`, `koa-service`, `fastify-service`,
`express-micro`, `koa-micro`, `fastify-micro`, `node-ts`) now ship with:
- `nodemon.json` + `nodemon.worker.json` (micro templates) for file-watch restarts
- `dev` script changed from `tsx watch` to `nodemon`
- `nodemon ^3.1.0` added to devDependencies

### Redis reconnect — suppress log spam
`_features/cache-redis` and all backend templates with cache:
- `retryStrategy` with exponential back-off (max 8 retries, cap 3 s)
- `enableOfflineQueue: false` to fail fast on offline queue
- `on('error')` only logs non-transient errors; ECONNREFUSED is suppressed
  after the first failure and delegated to `retryStrategy` warnings
- `on('end')` emits a single "permanently unreachable" warning when retries
  are exhausted

### Startup access-URL logging
All server templates log the full access URL on startup:
```
info  local:   http://localhost:3000
info  health:  http://localhost:3000/health   (service)
info  livez:   http://localhost:3000/livez    (micro)
info  readyz:  http://localhost:3000/readyz   (micro)
```

### business-mono web — lhx-kit MPA architecture
`apps/web` rewritten from bare Vite SPA to full lhx-kit MPA pattern:
- `project.config.ts` (pages, proxy, envs, opt-in offline)
- `vite.config.ts` uses `lhxKit()` + `react()`
- `src/bootstrap.ts` entry with `setupMobile` / env detection
- `src/services/http.ts` with `ReturnType<typeof createRequest>` to fix
  TS2883 in pnpm strict-hoisting workspaces
- `tsconfig.json` path aliases for workspace packages
