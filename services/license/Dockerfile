# ---- build ----
FROM node:20-slim AS build
WORKDIR /app

# 可选构建加速（默认关，不传则行为与原来完全一致）：
#   HTTP_PROXY/HTTPS_PROXY —— 走本机代理（Clash/v2ray），Docker Desktop 用 host.docker.internal
#   NPM_REGISTRY           —— 换 npm 镜像（如 https://registry.npmmirror.com）
#   PRISMA_ENGINES_MIRROR  —— 换 Prisma 引擎下载源（npm 装 prisma 时下引擎，中国也慢）
ARG HTTP_PROXY=""
ARG HTTPS_PROXY=""
ARG NPM_REGISTRY="https://registry.npmjs.org/"
ARG PRISMA_ENGINES_MIRROR="https://binaries.prisma.sh"
# 本阶段是「构建层」，最终只 COPY 出 /app/dist —— 这些 ENV 不会进运行镜像，可放心设。
ENV http_proxy=$HTTP_PROXY https_proxy=$HTTPS_PROXY \
    HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY \
    npm_config_registry=$NPM_REGISTRY \
    PRISMA_ENGINES_MIRROR=$PRISMA_ENGINES_MIRROR

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# 同上加速开关。注意：这里用 ARG + 逐条 RUN 内联 env（不 ENV），
# 避免把构建期代理写进运行镜像——否则容器启动 `prisma db push` 会去连一个已不存在的代理而失败。
ARG HTTP_PROXY=""
ARG HTTPS_PROXY=""
ARG NPM_REGISTRY="https://registry.npmjs.org/"
ARG PRISMA_ENGINES_MIRROR="https://binaries.prisma.sh"

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY" HTTP_PROXY="$HTTP_PROXY" HTTPS_PROXY="$HTTPS_PROXY" \
    npm_config_registry="$NPM_REGISTRY" \
    npm install --omit=dev
COPY prisma ./prisma
RUN http_proxy="$HTTP_PROXY" https_proxy="$HTTPS_PROXY" HTTP_PROXY="$HTTP_PROXY" HTTPS_PROXY="$HTTPS_PROXY" \
    PRISMA_ENGINES_MIRROR="$PRISMA_ENGINES_MIRROR" \
    npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3001
# 启动前同步表结构（首次建表/后续无变更幂等），再起服务。（此处不带代理：只连内网 Postgres，无需外网）
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
