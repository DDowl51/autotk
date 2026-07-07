// 把 electron 主进程（electron/main.cjs）连同它 require 的 @mc/hub、@mc/publisher、@mc/shared
// 及其依赖（socket.io 等）**打成一个 cjs 文件** build/main.cjs。
// 这样 electron-builder 打包时不必去解析 pnpm 的软链 workspace 包（那正是 pnpm + electron-builder
// 最常见的打包失败点）——asar 里只有一个自包含的 main。
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

await build({
  entryPoints: ["electron/main.cjs"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"], // electron 由运行时提供；node 内置模块 esbuild 自动外置
  outfile: "build/main.cjs",
  logLevel: "info",
});

// preload 是按**文件路径**加载的（BrowserWindow 的 preload 指向 __dirname/preload.cjs），
// 不能被 bundle 进 main——必须作为独立文件放到 build/ 与 main.cjs 同级。
mkdirSync("build", { recursive: true });
copyFileSync("electron/preload.cjs", "build/preload.cjs");

console.log("✅ 主进程已打包 → build/main.cjs (+ preload.cjs)");
