import { startHub } from "./start-hub";

// CLI 入口：独立跑 Hub（云部署/开发用）。Electron 内嵌走 startHub 库入口。
void startHub({
  onListening: (port) => {
    // eslint-disable-next-line no-console
    console.log(`hub on :${port}`);
  },
}).catch((e) => {
  // eslint-disable-next-line no-console
  console.error("hub 启动失败：", e);
  process.exit(1);
});
