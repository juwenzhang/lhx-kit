# syntax=docker/dockerfile:1.7

FROM node:20.11.0-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
COPY pnpm-lock.yaml* package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # Each MPA entry lives under /<page>/index.html; expose clean URLs.
  location / {
    try_files \$uri \$uri/ \$uri/index.html =404;
  }
  # Long-cache hashed assets
  location ~* \.(js|css|svg|png|jpg|jpeg|webp|woff2?)\$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
EOF
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
