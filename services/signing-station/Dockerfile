# ---- 阶段 1：从源码构建 zsign（重签用） ----
FROM debian:bookworm-slim AS zsign-build
# zsign 官方用 build/linux 下的 Makefile 构建：依赖 git g++ pkg-config libssl-dev（minizip/zlib 已内置，无需额外包）。
RUN apt-get update && apt-get install -y --no-install-recommends \
      git g++ make pkg-config libssl-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# ⚠️ zsign 仓库根【没有】CMakeLists.txt——旧写法用 cmake 一上来就失败，又被末尾 `|| true` 吞掉，
#    导致编不出 zsign、后面 COPY 报「/usr/local/bin/zsign not found」。改用官方 Makefile，
#    且末尾 `zsign -v` 【不再吞错】：编译失败会立刻在构建日志暴露，而不是拖到 COPY 才报。
RUN git clone --depth 1 https://github.com/zhlynn/zsign.git /src \
 && make -C /src/build/linux clean && make -C /src/build/linux \
 && install -m0755 "$(find /src -type f -name zsign -perm -u+x | head -1)" /usr/local/bin/zsign \
 && /usr/local/bin/zsign -v

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
