---
"@lhx-kit/cli": minor
---

feat(templates): add nodemon auto-restart to all backend templates

All backend templates (express-service, koa-service, fastify-service,
express-micro, koa-micro, fastify-micro, node-ts) now ship with:

- `nodemon.json` — watches `src/`, restarts via `tsx --env-file=.env`
- `nodemon.worker.json` (micro templates only) — same for the worker process
- `dev` script changed from `tsx watch` to `nodemon`
- `dev:worker` script (micro) changed to `nodemon --config nodemon.worker.json`
- `nodemon ^3.1.0` added to devDependencies
