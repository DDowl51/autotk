export interface MasterStatusSnapshot {
  running: boolean;
  restarting: boolean;
  pid: number | null;
  vlmUrl: string;
  subnets: string[];
  lastScanAt: number | null;
  discoveredCount: number;
  onlineCount: number;
  lastError: string | null;
}

export interface MasterStatusTracker {
  snapshot(): MasterStatusSnapshot;
  beginStart(info?: { vlmUrl?: string; subnets?: string }): void;
  markRunning(pid?: number | null): void;
  markStopped(info?: { intentional?: boolean; code?: number | null; signal?: string | null }): void;
  markFailed(error: unknown): void;
  ingest(stream: "stdout" | "stderr", chunk: string): void;
}

export function createMasterStatusTracker(options?: {
  now?: () => number;
  onChange?: (status: MasterStatusSnapshot) => void;
}): MasterStatusTracker;

export function parseSubnets(value: string): string[];
