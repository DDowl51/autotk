import test from "node:test";
import assert from "node:assert/strict";
import { shouldDeactivate, activationErrorMessage } from "../src/license/gate";
import { LicenseError } from "../src/license/sdk/errors";

test("shouldDeactivate: 仅封禁/未激活踢人，其余离线宽限", () => {
  assert.equal(shouldDeactivate(new LicenseError("revoked")), true);
  assert.equal(shouldDeactivate(new LicenseError("not_activated")), true);
  assert.equal(shouldDeactivate(new LicenseError("network")), false);
  assert.equal(shouldDeactivate(new LicenseError("timeout")), false);
  assert.equal(shouldDeactivate(new LicenseError("server")), false);
  assert.equal(shouldDeactivate(new LicenseError("device_limit")), false);
  assert.equal(shouldDeactivate(new Error("x")), false);
  assert.equal(shouldDeactivate(undefined), false);
});

test("activationErrorMessage: 各错误码有中文提示", () => {
  assert.match(activationErrorMessage(new LicenseError("code_not_found")), /激活码无效/);
  assert.match(activationErrorMessage(new LicenseError("device_limit")), /设备数/);
  assert.match(activationErrorMessage(new LicenseError("expired")), /过期/);
  assert.match(activationErrorMessage(new LicenseError("disabled")), /停用/);
  assert.match(activationErrorMessage(new LicenseError("network")), /网络/);
  assert.match(activationErrorMessage(new LicenseError("revoked")), /解绑/);
  assert.equal(typeof activationErrorMessage(new Error("x")), "string");
});
