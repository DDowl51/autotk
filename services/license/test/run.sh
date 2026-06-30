#!/usr/bin/env bash
# 跑 license 核心纯逻辑测试（node:test，无需装依赖；tsc 用垫片绕过未装的 @types/node）。
# 装好依赖后改用 vitest 即可（这套用于无依赖环境的快速回归）。
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT" test/_shims.d.ts _tsconfig.test.json' EXIT

cat > test/_shims.d.ts <<'EOF'
declare module "node:crypto" {
  export function createHmac(alg: string, key: string): { update(d: string): { digest(enc: string): string } };
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  export function randomInt(max: number): number;
  export function randomBytes(size: number): { toString(enc: string): string };
}
declare const Buffer: { from(s: string, enc?: string): Uint8Array };
declare module "node:test" { const t: (n: string, f: () => unknown | Promise<unknown>) => void; export default t; }
declare module "node:assert/strict" {
  const a: { ok(v: unknown, m?: string): void; equal(x: unknown, y: unknown, m?: string): void; notEqual(x: unknown, y: unknown, m?: string): void; deepEqual(x: unknown, y: unknown, m?: string): void; match(s: string, re: RegExp, m?: string): void; rejects(fn: (() => Promise<unknown>) | Promise<unknown>, e?: unknown): Promise<void>; };
  export default a;
}
EOF

cat > _tsconfig.test.json <<EOF
{ "compilerOptions": { "module":"commonjs","target":"es2020","lib":["es2020"],"moduleResolution":"node","strict":true,"skipLibCheck":true,"types":[],"esModuleInterop":true,"noEmitOnError":true,"rootDir":".","outDir":"$OUT" },
  "include": ["src/core/**/*.ts","src/domain/**/*.ts","test/*.ts"] }
EOF

if [ -x node_modules/.bin/tsc ]; then node_modules/.bin/tsc -p _tsconfig.test.json; else npx -y -p typescript@5.9.2 tsc -p _tsconfig.test.json; fi
node --test "$OUT/test/"
