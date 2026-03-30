export interface MikroTikConfig {
  ip: string;
  port: number;
  username: string;
  password: string;
  useSsl: boolean;
}

export interface InterfaceStats {
  name: string;
  type: string;
  status: "up" | "down";
  rxBytes: number;
  txBytes: number;
  rxRate: number;
  txRate: number;
  comment?: string;
}

export interface SystemHealth {
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
  uptime: string;
  temperature: number;
  voltage: number;
  boardName: string;
  routerOsVersion: string;
  architecture: string;
}

export interface BgpSession {
  name: string;
  remoteAddress: string;
  status: "established" | "idle" | "connect" | "active" | "opensent" | "openconfirm";
  prefixCount: number;
  uptime: string;
  remoteAs: number;
}

export interface OspfNeighbor {
  identity: string;
  address: string;
  state: string;
  interface: string;
  priority: number;
}

export interface Alert {
  id: string;
  type: "critical" | "warning" | "info";
  message: string;
  timestamp: Date;
  source: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface KnowledgeEntry {
  id: string;
  category: string;
  topic: string;
  routerOsVersion: string;
  content: string;
  codeExample?: string;
  tags: string[];
}

export interface RscAnalysisResult {
  filename: string;
  securityIssues: Array<{ severity: string; message: string; line?: number }>;
  suggestions: string[];
  parsedSections: Record<string, string[]>;
}
