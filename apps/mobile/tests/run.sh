#!/usr/bin/env bash
# 运行 autotk 引擎/逻辑测试（Node 内置 node:test，无需额外安装测试框架）。
# 编译纯 TS 子集（engine/params/gen/vision/wda + tests）到临时目录再跑。
# 用法：bash tests/run.sh   或   npm test
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT" tests/_shims.d.ts _tsconfig.test.json' EXIT

# 本机没装 pako/@types/node 时用垫片让 tsc 通过；CI/Mac 上有也无妨。
cat > tests/_shims.d.ts <<'EOF'
declare module "pako" { export function inflate(d: Uint8Array | ArrayLike<number>, o?: unknown): Uint8Array; }
declare module "node:test" { const t: (n: string, f: () => unknown | Promise<unknown>) => void; export default t; }
declare module "node:assert/strict" {
  const a: {
    ok(v: unknown, m?: string): void;
    equal(x: unknown, y: unknown, m?: string): void;
    deepEqual(x: unknown, y: unknown, m?: string): void;
    match(s: string, re: RegExp, m?: string): void;
    throws(f: () => unknown, m?: string): void;
  };
  export default a;
}
EOF

# tsconfig 放仓库根（include 路径相对其所在目录）
cat > _tsconfig.test.json <<EOF
{
  "compilerOptions": {
    "module": "commonjs", "target": "es2020", "lib": ["es2020", "dom"],
    "moduleResolution": "node", "strict": true, "skipLibCheck": true,
    "types": [], "esModuleInterop": true, "resolveJsonModule": true,
    "noEmitOnError": true, "rootDir": ".", "outDir": "$OUT"
  },
  "include": [
    "src/engine/**/*.ts", "src/params/**/*.ts", "src/gen/**/*.ts",
    "src/vision/**/*.ts", "src/wda/**/*.ts", "tests/**/*.ts"
  ]
}
EOF

# 有本地 tsc 用本地，否则 npx 拉一个固定版本
if [ -x node_modules/.bin/tsc ]; then
  node_modules/.bin/tsc -p _tsconfig.test.json
else
  npx -y -p typescript@5.9.2 tsc -p _tsconfig.test.json
fi

node --test "$OUT/tests/"
