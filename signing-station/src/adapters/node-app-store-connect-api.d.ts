// 该库无官方 TS 类型，按 v2.1.2 入口（index.mjs）实际导出声明。
// 注意：fetchJson 默认直接返回 data（数组/对象本身，并自动翻页），不是 { data }。
declare module "node-app-store-connect-api" {
  export interface AscResource {
    type: string;
    id: string;
    attributes?: Record<string, unknown>;
    relationships?: Record<string, unknown>;
  }
  export interface AscClientFns {
    /** GET。默认 crawlAllPages，直接返回 data（列表是数组、单资源是对象）。 */
    fetchJson(url: string, options?: Record<string, unknown>): Promise<unknown>;
    /** POST。返回创建出的资源本身。relationships 用 { key: { data: ... } } 形式直接透传。 */
    create(args: {
      type: string;
      attributes?: Record<string, unknown>;
      relationships?: Record<string, unknown>;
    }): Promise<AscResource>;
    update(data: { type: string; id: string }, body: { attributes?: unknown; relationships?: unknown }): Promise<unknown>;
    remove(data: { type: string; id: string }): Promise<unknown>;
    fetch(url: string, options?: unknown): Promise<unknown>;
  }
  export function api(creds: {
    issuerId: string;
    apiKey: string;
    privateKey: string | Buffer;
    version?: number;
  }): Promise<AscClientFns>;
}
