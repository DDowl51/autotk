import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 只跑集成测试（打真 postgres）；纯逻辑单测走 node:test（test:unit）。
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["./test/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
