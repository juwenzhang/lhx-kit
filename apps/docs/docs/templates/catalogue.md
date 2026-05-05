# 🧱 模板目录

lhx-cli 内置覆盖前端 / 库 / 后端 / 全栈四大场景的模板体系，基础设施**统一** Biome / Husky / Commitlint / Lint-staged / Docker。

> **2026-05 更新**
>
> - 模板栈切换为 **Biome-only**（不再含 ESLint / Prettier）
> - 新增交互式向导（`@clack/prompts`）+ 双语扫尾提示
> - 前端模板新增 `target` / CSS 三轴特征
> - 新增 `lib-single` / `lib-monorepo` 库开发模板（tsup / rslib / rollup）
> - 新增 `node-ts`、`express-service`、`koa-service`、`fastify-service` 后端服务模板
> - 新增 `express-micro`、`koa-micro`、`fastify-micro` 微服务模板（BullMQ + k8s）
> - 新增 `business-mono` 全栈 monorepo（lhx-kit MPA web + Express API + 共享包）
> - 新增 `pm2` / `db-migrate` 跨切面特征

---

## 一、📋 可用模板

### 前端

| 名称 | 框架 | 状态管理 | UI 组件库 | 路由 | 适用场景 |
| --- | --- | --- | --- | --- | --- |
| `vue3-mpa` | Vue 3.5 | Pinia | Vant 4 | vue-router 4 | 移动端 H5 / 运营落地页 |
| `react-mpa` | React 19 | Zustand 5 | Ant Design 5 | react-router 6 | 管理后台 / 桌面 Web |

### 库

| 名称 | 打包工具 | 适用场景 |
| --- | --- | --- |
| `lib-single` | tsup / rslib / rollup | 独立 npm 包 |
| `lib-monorepo` | tsup / rslib / rollup（per-package） | 多包 monorepo |

### 后端服务

| 名称 | 框架 | 默认 Features | 适用场景 |
| --- | --- | --- | --- |
| `node-ts` | 无框架 | — | 纯 Node.js TypeScript 脚本 / 工具 |
| `express-service` | Express 4 | db-pg, cache-redis | RESTful API 服务 |
| `koa-service` | Koa 2 | db-pg, cache-redis | RESTful API 服务 |
| `fastify-service` | Fastify 5 | db-pg, cache-redis | RESTful API 服务 |

### 微服务

| 名称 | 框架 | Redis | 额外特色 | 适用场景 |
| --- | --- | --- | --- | --- |
| `express-micro` | Express 4 | 内置（BullMQ） | k8s manifests, `/livez`+`/readyz`, worker | 任务队列微服务 |
| `koa-micro` | Koa 2 | 内置（BullMQ） | 同上 | 任务队列微服务 |
| `fastify-micro` | Fastify 5 | 内置（BullMQ） | 同上 | 任务队列微服务 |

### 全栈 Monorepo

| 名称 | 前端 | 后端 | 适用场景 |
| --- | --- | --- | --- |
| `business-mono` | lhx-kit MPA（React 19）| Express + TypeScript + pg + redis | 中后台全栈业务应用 |

---

## 二、🚀 生成一个模板

:::code-group

```bash [交互式]
lhx-cli create my-app
```

```bash [后端服务]
lhx-cli create my-api \
  --template=express-service \
  --features=db-pg,cache-redis \
  --yes
```

```bash [微服务]
lhx-cli create my-worker \
  --template=koa-micro \
  --features=db-pg \
  --yes
```

```bash [前端]
lhx-cli create my-app \
  --template=react-mpa \
  --features=offline \
  --yes
```

```bash [全栈 monorepo]
lhx-cli create my-mono \
  --template=business-mono \
  --yes
```

:::

---

## 三、📂 模板结构详解

```text title="packages/cli/templates/"
templates/
├── _shared/                     # 跨模板基础层（husky / commitlint / biome 等）
├── _features/                   # 跨模板可组合特征
│   ├── db-pg/                   # PostgreSQL：DATABASE_URL + pool + docker-compose 注入
│   ├── db-mysql/                # MySQL 8：mysql2 + docker-compose 注入
│   ├── db-none/                 # 跳过数据库
│   ├── cache-redis/             # Redis：ioredis + REDIS_URL + docker-compose 注入
│   ├── cache-none/              # 跳过缓存
│   ├── pm2/                     # PM2 cluster 生产进程管理
│   ├── db-migrate/              # SQL 迁移脚本（pg + _migrations 表）
│   ├── bundler-tsup/            # tsup 打包配置（lib 模板）
│   ├── bundler-rslib/           # rslib 打包配置（lib 模板）
│   ├── bundler-rollup/          # rollup 打包配置（lib 模板）
│   ├── format-esm/              # ESM 输出（lib 模板）
│   ├── format-cjs/              # CJS 输出（lib 模板）
│   ├── format-umd/              # UMD 输出（lib 模板）
│   ├── target-pc/               # PC 目标（前端）
│   ├── target-mobile/           # 移动端目标（前端）
│   ├── target-hybrid/           # PC + 移动响应式（前端，默认）
│   ├── offline/                 # 离线打包（前端）
│   └── css-*/                   # CSS 三轴特征
├── react-mpa/
├── vue3-mpa/
├── lib-single/
├── lib-monorepo/
├── node-ts/
├── express-service/
├── koa-service/
├── fastify-service/
├── express-micro/
├── koa-micro/
├── fastify-micro/
└── business-mono/
```

---

## 四、🔧 特征矩阵

### 前端特征

| 互斥组 | 可选值 | 默认 |
| --- | --- | --- |
| `target` | `pc` / `mobile` / `hybrid` | `hybrid` |
| `css-preprocessor` | `less` / `sass` / `none` | `less` |
| `css-atomic` | `unocss` / `tailwind` / `none` | `unocss` |
| `css-styling` | `modules` / `emotion` / `styled` / `vanilla-extract` / `vue-scoped` / `none` | `modules` |

跨切面（非互斥）：`offline`（离线打包，target=hybrid 自动开启）、`codebuddy-skills`（AI 工作流）

### 库特征

| 互斥组 | 可选值 | 默认 |
| --- | --- | --- |
| `bundler` | `bundler-tsup` / `bundler-rslib` / `bundler-rollup` | `bundler-tsup` |
| `format` (多选) | `format-esm` / `format-cjs` / `format-umd` | `format-esm` |

`workspaceOverlay`：bundler devDeps（tsup / rslib / rollup）始终安装在 workspace 根，不会扇出到每个 package。

### 后端 / 微服务特征

| 互斥组 | 可选值 | 后端默认 | 微服务默认 |
| --- | --- | --- | --- |
| `db` | `db-pg` / `db-mysql` / `db-none` | `db-pg`（auto-inject） | `db-pg`（auto-inject） |
| `cache` | `cache-redis` / `cache-none` | `cache-redis`（auto-inject） | — Redis 内置，不适用 |

跨切面（非互斥）：`pm2`（cluster 模式进程管理）、`db-migrate`（SQL 迁移脚本）

### 微服务设计说明

- **Redis 内置**：`*-micro` 模板的 BullMQ 强依赖 Redis，`REDIS_URL` 在 base `env.ts` 中，不走 `cache-redis` feature
- **db stub**：`src/db/index.ts` 初始为 stub（`ping()` 返回 `true`），`db-pg` / `db-mysql` feature 覆盖为真实实现
- **k8s manifests**：`k8s/deployment.yaml` 含 `/livez`+`/readyz` probe，`k8s/service.yaml` 暴露 ClusterIP 80
- **BullMQ worker**：`src/worker.ts` 独立二进制，`pnpm dev:worker` / `pnpm start:worker`

---

## 五、📦 business-mono 结构

```text title="business-mono 脚手架输出"
my-mono/
├── apps/
│   ├── api/                     # Express + TypeScript + pg + redis + layered arch
│   │   └── src/
│   │       ├── routes/          # 路由层
│   │       ├── handlers/        # 控制器
│   │       ├── services/        # 业务逻辑（placeholder）
│   │       ├── dao/             # 数据访问（placeholder）
│   │       ├── dto/             # 数据传输对象（placeholder）
│   │       ├── db/              # pg pool（db-pg feature 覆盖）
│   │       ├── cache/           # ioredis（cache-redis feature 覆盖）
│   │       ├── middlewares/     # 错误处理等
│   │       └── utils/
│   └── web/                     # lhx-kit MPA（React 19）
│       ├── project.config.ts    # 页面 / proxy / envs 配置（代理到 apps/api）
│       ├── vite.config.ts       # lhxKit() + react plugin
│       ├── template.html        # MPA HTML 模板
│       └── src/
│           ├── bootstrap.ts     # MSW dev mock + setupMobile
│           ├── pages/home/      # MPA 页面（entry.tsx + router + views）
│           ├── services/        # http client（createRequest）+ example.ts 使用 @pkg/types
│           ├── stores/          # Zustand user store
│           └── mocks/           # MSW handlers（使用 @pkg/types.ApiResponse）
├── packages/
│   ├── types/                   # 共享 TypeScript 接口（ApiResponse, PaginatedResponse）
│   └── utils/                   # 共享工具函数（paginate, sleep, pick, omit）
├── turbo.json                   # Turborepo task pipeline
├── docker-compose.yml           # postgres + redis + api services
└── pnpm-workspace.yaml
```

---

## 六、🔬 占位替换

所有 `*.template` 文件在拷贝时被替换占位符：

```text
<%= projectName %>     # EJS-ish 风格
{{ projectName }}      # Mustache-ish 风格
```

常用变量：`projectName`、`packageName`、`appTitle`、`lhxKitVersionRange`、`packageManager`。

---

## 七、📖 相关资源

- [🚀 快速开始](../guide/getting-started)
- [⚙️ CLI 参考](../cli/reference#create)
- [🧠 架构总览](../guide/architecture)
