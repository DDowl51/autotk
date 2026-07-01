// @mc/hub 作为库的入口（供 Electron 主进程 require 内嵌）。
// CLI 仍是 src/main.ts。
export { startHub, type StartHubOptions, type HubHandle } from "./start-hub";
