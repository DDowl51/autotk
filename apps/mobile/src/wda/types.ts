export interface Point {
  x: number;
  y: number;
}

/** GET /status 返回结构（仅取我们关心的字段）。 */
export interface Status {
  build: {
    version: string;
    productBundleIdentifier: string;
  };
  os: { name: string; version: string };
  ready: boolean;
}
