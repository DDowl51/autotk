#!/usr/bin/env bash
# 跑 collector 测试（Node 内置 node:test，无需装框架）。编译纯 TS 到临时目录再跑。
# 用 management-center 里现成的 @types/node（避免本目录单独装依赖）。
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT" _tsconfig.test.json' EXIT

# 找一个带 @types/node 的 node_modules/@types 作为 typeRoots
TYPEROOT=""
for p in ./node_modules/@types ../../management-center/node_modules/@types ../../autotk/node_modules/@types; do
  [ -d "$p/node" ] && TYPEROOT="$p" && break
done

cat > _tsconfig.test.json <<EOF
{
  "compilerOptions": {
    "module": "commonjs", "target": "es2020", "lib": ["es2020"],
    "moduleResolution": "node", "strict": true, "skipLibCheck": true,
    "types": ["node"], "typeRoots": ["${TYPEROOT}"],
    "esModuleInterop": true, "noEmitOnError": true,
    "rootDir": ".", "outDir": "$OUT"
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
EOF

TSC=""
for p in ./node_modules/.bin/tsc ../../management-center/node_modules/.bin/tsc ../../autotk/node_modules/.bin/tsc; do
  [ -x "$p" ] && TSC="$p" && break
done
if [ -n "$TSC" ]; then
  "$TSC" -p _tsconfig.test.json
else
  npx -y -p typescript@5.9.2 tsc -p _tsconfig.test.json
fi

node --test "$OUT/tests/"
