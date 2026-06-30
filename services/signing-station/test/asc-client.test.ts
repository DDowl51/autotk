import { describe, it, expect } from "vitest";
import {
  buildRegisterDeviceArgs,
  buildCreateProfileArgs,
  profileVersion,
  findBundleIdResource,
  pickDevelopmentCertificates,
  profileName,
} from "../src/adapters/asc-client";
import type { AscResource } from "node-app-store-connect-api";

describe("buildRegisterDeviceArgs", () => {
  it("create() 的 devices 参数（不裹 data）", () => {
    expect(buildRegisterDeviceArgs("机-01", "UDID123")).toEqual({
      type: "devices",
      attributes: { name: "机-01", platform: "IOS", udid: "UDID123" },
    });
  });
});

describe("buildCreateProfileArgs", () => {
  it("含 bundleId/证书/设备 关系（to-many 用 {data:[...]} 透传）", () => {
    const args = buildCreateProfileArgs({
      name: "ss-a-wda",
      profileType: "IOS_APP_DEVELOPMENT",
      bundleIdResourceId: "B1",
      certificateIds: ["C1", "C2"],
      deviceIds: ["D1", "D2", "D3"],
    });
    expect(args.type).toBe("profiles");
    expect(args.attributes).toEqual({ name: "ss-a-wda", profileType: "IOS_APP_DEVELOPMENT" });
    expect(args.relationships.bundleId.data).toEqual({ type: "bundleIds", id: "B1" });
    expect(args.relationships.certificates.data).toHaveLength(2);
    expect(args.relationships.devices.data[2]).toEqual({ type: "devices", id: "D3" });
  });
});

describe("profileVersion", () => {
  it("与顺序无关、设备集变则变", () => {
    expect(profileVersion(["a", "b", "c"])).toBe(profileVersion(["c", "a", "b"]));
    expect(profileVersion(["a", "b"])).not.toBe(profileVersion(["a", "b", "c"]));
  });
});

const res = (type: string, id: string, attributes: Record<string, unknown>): AscResource => ({ type, id, attributes });

describe("findBundleIdResource", () => {
  it("按 identifier 匹配", () => {
    const list = [res("bundleIds", "1", { identifier: "com.ddowl.x" }), res("bundleIds", "2", { identifier: "com.ddowl.*" })];
    expect(findBundleIdResource(list, "com.ddowl.*")?.id).toBe("2");
    expect(findBundleIdResource(list, "nope")).toBeUndefined();
  });
});

describe("pickDevelopmentCertificates", () => {
  it("优先取 DEVELOPMENT 证书", () => {
    const list = [
      res("certificates", "1", { certificateType: "IOS_DISTRIBUTION" }),
      res("certificates", "2", { certificateType: "IOS_DEVELOPMENT" }),
    ];
    expect(pickDevelopmentCertificates(list).map((r) => r.id)).toEqual(["2"]);
  });
  it("没有 DEVELOPMENT 时退回全部", () => {
    const list = [res("certificates", "1", { certificateType: "IOS_DISTRIBUTION" })];
    expect(pickDevelopmentCertificates(list).map((r) => r.id)).toEqual(["1"]);
  });
});

describe("profileName", () => {
  it("按账号+App 唯一", () => {
    expect(profileName("acct-1", "wda")).toBe("ss-acct-1-wda");
  });
});
