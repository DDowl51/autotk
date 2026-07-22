// PhoneHandle(编排层)→ DeviceStatus(Hub 协议)映射。纯函数,可测。
import type { RunStats } from "@auto/core";
import type { DeviceBattery, DeviceStatus } from "@mc/shared";

/** 只依赖 PhoneHandle 的这几个读取方法(便于测试注入假实现)。 */
export interface HandleView {
  getStats(): RunStats;
  getModule(): string | null;
  getAlert(): string | null;
}

/**
 * RunStats → 协议 stats:协议只有 likes/follows/comments/videos 四项 + 2.0 扩展的 dmSent/dmFailed;
 * comments 取「已发回复」(commentReplies),videos 取「已看」(videosWatched)。saves/commentLikes 无协议槽,略。
 */
export function toDeviceStatus(
  h: HandleView,
  extra: { running: boolean; ts: number; page?: string; battery?: DeviceBattery },
): DeviceStatus {
  const st = h.getStats();
  const module = h.getModule();
  const status: DeviceStatus = {
    running: extra.running,
    ts: extra.ts,
    alert: h.getAlert(),
    stats: {
      likes: st.likes,
      follows: st.follows,
      comments: st.commentReplies,
      videos: st.videosWatched,
      dmSent: st.dmSent,
      dmFailed: st.dmFailed,
    },
  };
  if (module !== null) status.module = module;
  if (extra.page !== undefined) status.page = extra.page;
  if (extra.battery !== undefined) status.battery = extra.battery;
  return status;
}
