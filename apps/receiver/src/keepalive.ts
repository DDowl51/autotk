// 后台保活(β1 命脉):开「始终定位」+ 后台定位模式,让 App 不被 iOS 挂起,
// 从而维持到 master 的 socket、后台下载视频。抢救自旧 autotk 的保活思路。
// ⚠️ RN 运行时(expo-location);真机验(app.json 已声明 NSLocationAlways + UIBackgroundModes:['location'])。
declare const require: (moduleName: string) => any;

export interface Keepalive {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createKeepalive(log?: (m: string) => void): Keepalive {
  let subscription: { remove: () => void } | null = null;

  return {
    async start() {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Location = require("expo-location");
      const fg = await Location.requestForegroundPermissionsAsync();
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (!fg?.granted || !bg?.granted) {
        log?.("⚠️ 定位权限未授「始终」——后台可能被挂起,收视频会停");
        return;
      }
      // 低频定位即可(目的是保活,不是定位);持有订阅让后台定位模式生效。
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Lowest, timeInterval: 60_000, distanceInterval: 0 },
        () => {},
      );
      log?.("后台保活已开(始终定位)");
    },
    async stop() {
      subscription?.remove();
      subscription = null;
    },
  };
}
