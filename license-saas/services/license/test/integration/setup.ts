import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 把 .env 里的变量加载进 process.env（vitest 不自动读 .env）。
try {
  const env = readFileSync(resolve(__dirname, "../../.env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // 没有 .env 时依赖外部已设的环境变量
}
