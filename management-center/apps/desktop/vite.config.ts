import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // 相对路径，便于 Electron file:// 加载打包产物
  server: { port: 5173 },
  build: { outDir: "dist" },
});
