#!/usr/bin/env bash
# 跑 telemetry SDK 测试（Node 内置 node:test，无需装框架）。编译纯 TS 到临时目录再跑。
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT" _tsconfig.test.json tests/_shims.d.ts' EXIT

cat > tests/_shims.d.ts <<'EOF'
declare module "node:test" { const t: (n: string, f: () => unknown | Promise<unknown>) => void; export default t; }
declare module "node:assert/strict" {
  const a: {
    ok(v: unknown, m?: string): void;
    equal(x: unknown, y: unknown, m?: string): void;
    deepEqual(x: unknown, y: unknown, m?: string): void;
    match(s: string, re: RegExp, m?: string): void;
  };
  export default a;
}
EOF

cat > _tsconfig.test.json <<EOF
{
  "compilerOptions": {
    "module": "commonjs", "target": "es2020", "lib": ["es2020", "dom"],
    "moduleResolution": "node", "strict": true, "skipLibCheck": true,
    "types": [], "esModuleInterop": true, "noEmitOnError": true,
    "rootDir": ".", "outDir": "$OUT"
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
EOF

# 优先用任意已装的 tsc（本机各项目 node_modules 里有），否则 npx 拉固定版本
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
