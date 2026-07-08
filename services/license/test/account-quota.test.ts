import test from "node:test";
import assert from "node:assert/strict";
import { decideQuotaAllocation, selfIssuableQuota } from "../src/core";

// decideQuotaAllocation：运营给分销分额度的额度池校验。
// 池 = 运营总预算 - 已发码(ownIssued) - 已分配给其他分销(allocatedToOthers)。

test("运营不限额(null)：随意分配，含给下级不限", () => {
  const d = decideQuotaAllocation(null, 999, 999, 500);
  assert.equal(d.ok, true);
  assert.equal(d.remaining, null);
  assert.equal(decideQuotaAllocation(null, 0, 0, null).ok, true); // 可给下级不限
});

test("池内通过：ownIssued+已分配+本次 ≤ 总预算", () => {
  // 预算 100，自己已发 10，其他分销已分配 40 → 剩余 50；给本分销 50 恰好放下。
  const d = decideQuotaAllocation(100, 10, 40, 50);
  assert.equal(d.ok, true);
  assert.equal(d.remaining, 50);
});

test("超池拒绝：本次额度 > 剩余", () => {
  const d = decideQuotaAllocation(100, 10, 40, 51); // 剩余 50，要 51
  assert.equal(d.ok, false);
  assert.equal(d.error, "quota_pool_exceeded");
  assert.equal(d.remaining, 50);
});

test("有限额运营不能给下级不限(null)", () => {
  const d = decideQuotaAllocation(100, 0, 0, null);
  assert.equal(d.ok, false);
  assert.equal(d.error, "quota_required");
  assert.equal(d.remaining, 100);
});

test("边界：剩余为 0 时只能给 0", () => {
  assert.equal(decideQuotaAllocation(100, 60, 40, 0).ok, true); // 剩余 0，给 0 通过
  const d = decideQuotaAllocation(100, 60, 40, 1); // 剩余 0，给 1 超
  assert.equal(d.ok, false);
  assert.equal(d.error, "quota_pool_exceeded");
});

test("改额度语义：allocatedToOthers 已排除本分销当前额度", () => {
  // 预算 100，自己已发 0，其他分销共占 30（不含本分销），本分销原 20、现改到 70。
  // 剩余 = 100-0-30 = 70 → 改到 70 恰好通过；改到 71 超。
  assert.equal(decideQuotaAllocation(100, 0, 30, 70).ok, true);
  assert.equal(decideQuotaAllocation(100, 0, 30, 71).ok, false);
});

// selfIssuableQuota：运营「自己发码」的有效额度 = 总预算 - 已分配给下级。
test("selfIssuableQuota：扣减已分配给下级", () => {
  assert.equal(selfIssuableQuota(100, 30), 70);
  assert.equal(selfIssuableQuota(null, 30), null); // 不限额
  assert.equal(selfIssuableQuota(50, 0), 50); // 普通分销无下级，等于自身额度
});
