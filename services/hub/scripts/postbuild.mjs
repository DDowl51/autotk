import { writeFileSync } from "node:fs";

// dist 是 CJS 产物，但 hub 根 package.json 是 "type":"module"（tsx/vitest 开发用）。
// 给 dist 子树单独标记 commonjs，让 Electron 主进程能 require("@mc/hub")。
writeFileSync("dist/package.json", JSON.stringify({ type: "commonjs" }) + "\n");
