# ---- 阶段 1：从源码构建 zsign（重签用） ----
FROM debian:bookworm-slim AS zsign-build
RUN apt-get update && apt-get install -y --no-install-recommends \
      git g++ make cmake libssl-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/zhlynn/zsign.git /src \
 && cd /src && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j \
 && cp "$(find /src -type f -name zsign -perm -u+x | head -1)" /usr/local/bin/zsign \
 && /usr/local/bin/zsign -v || true

# ---- 阶段 2：运行镜像 ----
FROM node:20-bookworm-slim
# openssl：给 .mobileconfig 加签 + 解设备回传的 PKCS#7
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=zsign-build /usr/local/bin/zsign /usr/local/bin/zsign

WORKDIR /app
# 通过 tsx 直接跑 TS，故安装含 devDependencies（tsx）。
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV CONFIG_PATH=/app/config.json
ENV WORK_DIR=/app/data/work
EXPOSE 4100
CMD ["npx", "tsx", "src/main.ts"]
