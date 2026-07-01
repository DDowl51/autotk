import { writeFileSync } from "node:fs";

// dist 是 CJS 产物，但本包根 package.json 是 "type":"module"（源码给 TS 工具直接消费）。
// 给 dist 子树标记 commonjs，让 Electron 主进程 require(@mc/hub) 时能连带 require 到本包 dist。
writeFileSync("dist/package.json", JSON.stringify({ type: "commonjs" }) + "\n");
