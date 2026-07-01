import { describe, it, expect } from "vitest";
import { summarizeIpaEntries, MotherIpaInspector } from "../src/adapters/mother-ipa";

// 好 WDA：含 XCTest 框架 + .xctest 插件
const goodWda = [
  "Payload/WebDriverAgentRunner-Runner.app/Info.plist",
  "Payload/WebDriverAgentRunner-Runner.app/WebDriverAgentRunner-Runner",
  "Payload/WebDriverAgentRunner-Runner.app/Frameworks/XCTest.framework/XCTest",
  "Payload/WebDriverAgentRunner-Runner.app/Frameworks/XCTestCore.framework/XCTestCore",
  "Payload/WebDriverAgentRunner-Runner.app/Frameworks/XCUIAutomation.framework/XCUIAutomation",
  "Payload/WebDriverAgentRunner-Runner.app/PlugIns/WebDriverAgentRunner.xctest/WebDriverAgentRunner",
];
// 坏 WDA：有图标、无 XCTest 框架
const badWda = [
  "Payload/WebDriverAgentRunner-Runner.app/Info.plist",
  "Payload/WebDriverAgentRunner-Runner.app/AppIcon60x60@2x.png",
  "Payload/WebDriverAgentRunner-Runner.app/Assets.car",
];

describe("summarizeIpaEntries", () => {
  it("识别 app 包名、框架、XCTest 框架与插件", () => {
    const s = summarizeIpaEntries(goodWda);
    expect(s.appBundle).toBe("WebDriverAgentRunner-Runner.app");
    expect(s.frameworks).toEqual(["XCTest.framework", "XCTestCore.framework", "XCUIAutomation.framework"]);
    expect(s.hasXctestFrameworks).toBe(true);
    expect(s.hasXctestPlugin).toBe(true);
  });

  it("坏包：缺 XCTest 框架与插件", () => {
    const s = summarizeIpaEntries(badWda);
    expect(s.hasXctestFrameworks).toBe(false);
    expect(s.hasXctestPlugin).toBe(false);
    expect(s.frameworks).toEqual([]);
  });
});

describe("MotherIpaInspector", () => {
  it("注入 lister：好包 exists+齐全", async () => {
    const insp = new MotherIpaInspector(async () => goodWda);
    expect(await insp.inspect("/x/wda.ipa")).toMatchObject({
      exists: true,
      hasXctestFrameworks: true,
      hasXctestPlugin: true,
    });
  });

  it("文件不存在/坏 zip（lister 抛错）→ exists=false，不冒泡", async () => {
    const insp = new MotherIpaInspector(async () => {
      throw new Error("unzip: cannot find or open");
    });
    expect(await insp.inspect("/no.ipa")).toMatchObject({ exists: false });
  });
});
