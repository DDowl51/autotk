// Step 合同:每步的统一形状(需求方「双识别」思路的形式化)。见 docs/自动化框架-架构设计总纲 §6。
import type { Point } from "./geometry";

/** 基本操作(L1):动作层。tapTarget/typeInto 引用 Target id,由引擎从当前帧定位结果取坐标。 */
export type BasicOp =
  | { kind: "none" }
  | { kind: "tapTarget"; target: string }
  | { kind: "tapPoint"; point: Point }
  | { kind: "typeInto"; target: string; text: string }
  | { kind: "swipeNext" } // 盲滑(固定手势,不问 VLM;前置危险检测已在 Step.hazards 完成)
  | { kind: "swipe"; from: Point; to: Point; durMs?: number };

/** 升级链项(按序尝试,终点应为 alertOperator——不盲动)。 */
export type Escalation =
  | { kind: "retry"; times: number } // 额外重试次数
  | { kind: "variants"; ops: BasicOp[] } // 逐个换 act(如上滑换列)
  | { kind: "recover" } // 交上层回基地
  | { kind: "alertOperator"; message: string }; // 停手 + 告警(终点)

export interface Step {
  intent: string;
  /** 本步动作(缺省=纯观察步)。 */
  act?: BasicOp;
  /** 期望目标 id:证明「环境正确/可以做」。 */
  expected: string[];
  /** 危险目标 id(global ∪ 页面专属,由插件在建步时并好)。 */
  hazards: string[];
  /** 操作后成功判据(通常=下一步 expected;空=纯动作步即成功)。 */
  verify: string[];
  /** 等待期望/验证上限(ms)。 */
  timeout: number;
  /** 超时升级链;空则默认 [alertOperator]。 */
  onFail: Escalation[];
}
