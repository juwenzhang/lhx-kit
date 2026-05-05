# 🚀 部署指南

本文覆盖 lhx-kit 模板生成的项目在**前端静态部署**、**后端服务部署**、**容器化**、**k8s 微服务**四个场景下的部署方案。

---

## 一、前端静态部署

### 1.1 构建产物

```bash
pnpm build          # lhx-cli build → Vite 构建 → dist/
```

`dist/` 目录包含若干 HTML 入口（每个 MPA page 对应一个），以及 assets/。

### 1.2 Nginx

```nginx title="nginx.conf"
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/my-app/dist;
    index home.html;

    # 每个 MPA 页面独立 try_files
    location /home {
        try_files /home.html =404;
    }
    location /settings {
        try_files /settings.html =404;
    }

    # 静态资源长缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # gzip
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
}
```

### 1.3 Docker（模板自带 Dockerfile）

所有前端模板内置多阶段 Dockerfile（node 构建 → nginx 产出）：

```bash
docker build -t my-app:latest .
docker run -p 80:80 my-app:latest
```

### 1.4 GitHub Pages

```yaml title=".github/workflows/deploy.yml"
name: Deploy to GitHub Pages
on:
  push:
    branches: [master]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: {version: 10}
      - uses: actions/setup-node@v4
        with: {node-version: '20', cache: 'pnpm'}
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-pages-artifact@v3
        with: {path: dist}
      - uses: actions/deploy-pages@v4
```

### 1.5 Vercel / Netlify

将 `Framework Preset` 设为 **Vite**，构建命令改为 `pnpm build`，发布目录 `dist`。

---

## 二、Offline 离线包发布

构建完成后，运行离线打包：

```bash
pnpm build
pnpm offline:build   # → dist-offline/offline.zip
```

将 `offline.zip` 上传到你的 CDN 或原生 App 的资产服务器。原生 App 侧读取清单（`offline.zip` 内的 `manifest.json`）比对版本号，按需下载差量包。

---

## 三、后端服务部署（express / koa / fastify）

### 3.1 生产构建

```bash
pnpm build        # tsc → dist/
pnpm start        # node dist/server.js
```

### 3.2 PM2 Cluster（内置 feature）

模板内置 `pm2` feature（`--features=pm2`）生成 `ecosystem.config.cjs`：

```bash
pnpm start:pm2    # pm2 start ecosystem.config.cjs
pnpm reload:pm2   # 零停机热更新
pnpm logs:pm2     # 查看日志
pnpm stop:pm2     # 停止所有进程
```

`ecosystem.config.cjs` 默认配置：

```js
module.exports = {
  apps: [{
    name: 'my-app',
    script: 'dist/server.js',
    instances: 'max',          // 使用所有 CPU 核心
    exec_mode: 'cluster',
    max_memory_restart: '512M',
    env: {NODE_ENV: 'production'}
  }]
};
```

### 3.3 Docker Compose

所有后端模板自带 `docker-compose.yml`（含 postgres / redis / app services）：

```bash
# 开发环境：只启动依赖服务
docker compose up postgres redis -d

# 生产环境：完整部署
docker compose up -d
```

### 3.4 多阶段 Dockerfile

```bash
docker build -t my-api:latest .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e REDIS_URL=redis://... \
  my-api:latest
```

### 3.5 数据库迁移（db-migrate feature）

部署前执行迁移（`--features=db-migrate` 生成的脚本）：

```bash
pnpm db:migrate    # 执行所有待应用的 up 迁移
pnpm db:status     # 查看迁移状态
pnpm db:rollback   # 回滚最后一批迁移
```

推荐在 CI/CD 管道中：

```yaml
steps:
  - run: pnpm build
  - run: pnpm db:migrate
  - run: pnpm start:pm2
```

---

## 四、微服务部署（express / koa / fastify -micro）

### 4.1 k8s Manifests

微服务模板自带 `k8s/` 目录：

```bash
# 部署
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# 查看状态
kubectl get pods -l app=my-worker
kubectl logs -l app=my-worker --tail=100
```

`k8s/deployment.yaml` 配置了 liveness / readiness probe：

```yaml
livenessProbe:
  httpGet:
    path: /livez
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /readyz
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

`/livez` 返回 `{status: "ok"}`（不检查依赖，进程存活即可）。  
`/readyz` 检查 db.ping() + cache.ping()，只有依赖全部就绪才返回 200。

### 4.2 BullMQ Worker 部署

微服务包含独立的 worker 进程：

```bash
# 开发
pnpm dev:worker

# 生产（PM2）
pnpm start:worker

# 或单独启动
node dist/worker.js
```

**建议**：将 API server 和 worker 部署为两个独立的 k8s Deployment，便于分别扩容。

### 4.3 水平扩展注意事项

- BullMQ 默认以 Redis 为队列后端，多副本共享同一队列，自动负载分摊
- API server 无状态，可直接水平扩展
- 如果使用 PM2 cluster 模式，单机多核已经覆盖，**不需要**同时多副本 + cluster

---

## 五、business-mono 全栈部署

```text
business-mono/
├── apps/api/      → Docker 镜像 → k8s Deployment 或 PM2
└── apps/web/      → 静态产物 → Nginx / CDN / Docker
```

### 5.1 分别构建

```bash
# 从 monorepo 根
pnpm build                          # turbo 并行构建 api + web + packages

# 单独构建
pnpm --filter @my-mono/api build
pnpm --filter @my-mono/web build
```

### 5.2 Docker Compose（含 web）

在根 `docker-compose.yml` 追加 web service（模板默认未含，根据实际需要添加）：

```yaml title="docker-compose.yml 追加"
services:
  web:
    image: nginx:alpine
    ports:
      - '80:80'
    volumes:
      - ./apps/web/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - api
```

### 5.3 CI/CD 示例

```yaml title=".github/workflows/deploy.yml"
jobs:
  deploy:
    steps:
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm --filter @my-mono/api db:migrate
      - name: Push Docker image
        run: |
          docker build -t my-api:${{ github.sha }} ./apps/api
          docker push my-api:${{ github.sha }}
      - name: Deploy to k8s
        run: kubectl set image deployment/api api=my-api:${{ github.sha }}
```

---

## 六、环境变量管理

| 文件 | 用途 |
| --- | --- |
| `.env.example` | 模板，提交到 git，展示所有必需变量 |
| `.env` | 本地开发值，**不提交** |
| `.env.production` | 生产值，**通过 CI/CD secret 注入，不提交** |

后端服务使用 `zod` 在启动时验证 `process.env`，缺少必需变量会**立即崩溃**（fail-fast），避免运行时才发现配置错误。

---

## 七、健康检查端点

| 端点 | 适用模板 | 行为 |
| --- | --- | --- |
| `GET /livez` | 所有后端 + 微服务 | 进程存活检查，始终 200 |
| `GET /readyz` | 所有后端 + 微服务 | 检查 db + cache 连接，依赖就绪返回 200 |
| `GET /` | express-service 等 | 欢迎页 / API 版本信息 |
