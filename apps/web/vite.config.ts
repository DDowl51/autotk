import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 开发时把 /admin 代理到后端，免跨域。
    proxy: {
      "/admin": "http://localhost:3001",
    },
  },
});
