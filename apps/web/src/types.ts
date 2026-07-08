export interface Product {
  id: string;
  key: string;
  name: string;
  createdAt: string;
}

export interface Code {
  id: string;
  code: string;
  status: "UNUSED" | "ACTIVE" | "DISABLED";
  maxDevices: number;
  expiresAt: string | null;
  devices: number;
  productId?: string;
  productName?: string;
  ownerName?: string | null;
  note?: string | null;
}

export interface Account {
  id: string;
  username: string;
  role: "ADMIN" | "OPERATOR" | "USER";
  codeQuota: number | null;
  disabled: boolean;
  codeCount?: number;
  createdAt?: string;
  productIds?: string[]; // 该分销可见/可发码的产品白名单
}

export interface Me {
  id: string;
  username: string;
  role: "ADMIN" | "OPERATOR" | "USER";
  codeQuota: number | null;
  used?: number;
  allocated?: number; // 运营已分配给名下分销的额度之和
}
