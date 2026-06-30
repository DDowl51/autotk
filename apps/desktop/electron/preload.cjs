// 阶段3：把本地发布能力（选目录、扫描、准备来源、登记已发）以 window.publisher 暴露给渲染层。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("publisher", {
  available: true,
  chooseRoot: () => ipcRenderer.invoke("publisher:chooseRoot"),
  refresh: (opts) => ipcRenderer.invoke("publisher:refresh", opts),
  prepareSource: (args) => ipcRenderer.invoke("publisher:prepareSource", args),
  markPublished: (args) => ipcRenderer.invoke("publisher:markPublished", args),
  renameFolder: (args) => ipcRenderer.invoke("publisher:renameFolder", args),
});
