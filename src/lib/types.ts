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

// Agent Chain-of-Thought types
export interface CoTStep {
  label: string;
  content: string;
  type: "analysis" | "reasoning" | "hypothesis" | "action";
}

export interface AgentResponse {
  cotSteps: CoTStep[];
  response: string;
  proposedAction: ProposedAction | null;
  references: string[];
  monitoringAlert: MonitoringAlert | null;
}

export interface ProposedAction {
  id: string;
  command: string;
  explanation: string;
  riskLevel: "low" | "medium" | "high";
  reversible: boolean;
  revertCommand?: string;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  createdAt: string;
  executedAt?: string;
  result?: string;
}

export interface MonitoringAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  source: string;
  timestamp: string;
  proposedCommand?: string;
}

export interface MonitoringSnapshot {
  timestamp: string;
  cpuLoad: number;
  memoryUsedPct: number;
  temperature: number;
  bgpSessions: Array<{ name: string; status: string; prefixCount: number }>;
  ospfNeighbors: Array<{ identity: string; state: string }>;
  interfaceStatus: Array<{ name: string; status: string; rxRate: number; txRate: number }>;
  anomalies: string[];
}

export interface Incident {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  resolution: string;
  commands: string;
  resolved: boolean;
}

// Security Event Analysis types
export interface LogEntry {
  timestamp: string;
  topics: string;
  message: string;
  rawCategory: string;
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  severity: "baja" | "media" | "alta";
  attackType: string;
  sourceIp: string;
  targetPort?: number;
  targetService?: string;
  evidenceCount: number;
  timeWindowSeconds: number;
  naturalLanguage: string;
  technicalDetail: string;
  documentationRef: string;
  recommendedAction: string;
  proposedCommand: string;
  autoResponse: "inform" | "suggest" | "block-pending";
  status: "active" | "acknowledged" | "resolved" | "auto-blocked";
  relatedLogEntries: string[];
}

export interface AttackSignature {
  name: string;
  description: string;
  detectFn: (entries: LogEntry[]) => DetectedAttack | null;
}

export interface DetectedAttack {
  type: string;
  sourceIp: string;
  targetPort?: number;
  targetService?: string;
  evidenceCount: number;
  timeWindowSeconds: number;
  logEntries: string[];
  confidence: number;
}

export interface SecurityStats {
  totalEvents: number;
  activeEvents: number;
  altaCount: number;
  mediaCount: number;
  bajaCount: number;
  blockedIps: string[];
  lastAnalysis: string | null;
  logsIngested: number;
}
