import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Incident, MonitoringSnapshot, ProposedAction, SecurityEvent, MikroTikConfig } from "@/lib/types";

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbPath = path.join(process.cwd(), "data", "sentinel-agent.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("synchronous = NORMAL");

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      resolution TEXT DEFAULT '',
      commands TEXT DEFAULT '',
      resolved INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type);
    CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);

    CREATE TABLE IF NOT EXISTS monitoring_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      cpu_load REAL NOT NULL,
      memory_used_pct REAL NOT NULL,
      temperature REAL NOT NULL,
      bgp_sessions TEXT NOT NULL,
      ospf_neighbors TEXT NOT NULL,
      interface_status TEXT NOT NULL,
      anomalies TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON monitoring_snapshots(timestamp);

    CREATE TABLE IF NOT EXISTS monitoring_alerts (
      id TEXT PRIMARY KEY,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      proposed_command TEXT DEFAULT '',
      read INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_ts ON monitoring_alerts(timestamp);
    CREATE INDEX IF NOT EXISTS idx_alerts_read ON monitoring_alerts(read);

    CREATE TABLE IF NOT EXISTS pending_actions (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      explanation TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      reversible INTEGER NOT NULL,
      revert_command TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      executed_at TEXT DEFAULT '',
      result TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_id TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT DEFAULT '',
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_key TEXT NOT NULL,
      description TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      occurrences INTEGER DEFAULT 1,
      resolution TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_patterns_key ON memory_patterns(pattern_key);

    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      severity TEXT NOT NULL,
      attack_type TEXT NOT NULL,
      source_ip TEXT NOT NULL,
      target_port INTEGER,
      target_service TEXT,
      evidence_count INTEGER NOT NULL,
      time_window_seconds INTEGER NOT NULL,
      natural_language TEXT NOT NULL,
      technical_detail TEXT NOT NULL,
      documentation_ref TEXT DEFAULT '',
      recommended_action TEXT NOT NULL,
      proposed_command TEXT DEFAULT '',
      auto_response TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      related_log_entries TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sec_events_severity ON security_events(severity);
    CREATE INDEX IF NOT EXISTS idx_sec_events_status ON security_events(status);
    CREATE INDEX IF NOT EXISTS idx_sec_events_ts ON security_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_sec_events_ip ON security_events(source_ip);

    CREATE TABLE IF NOT EXISTS mikrotik_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      alias TEXT NOT NULL DEFAULT 'MikroTik',
      host TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL DEFAULT 8728,
      username TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      use_ssl INTEGER NOT NULL DEFAULT 0,
      last_connected TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return dbInstance;
}

// Incidents
export function saveIncident(incident: Incident): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO incidents (id, timestamp, type, description, resolution, commands, resolved)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    incident.id,
    incident.timestamp,
    incident.type,
    incident.description,
    incident.resolution,
    incident.commands,
    incident.resolved ? 1 : 0
  );
}

export function getRecentIncidents(limit = 20): Incident[] {
  const db = getDb();
  return db.prepare("SELECT * FROM incidents ORDER BY timestamp DESC LIMIT ?").all(limit) as Incident[];
}

export function getIncidentsByType(type: string, limit = 10): Incident[] {
  const db = getDb();
  return db.prepare("SELECT * FROM incidents WHERE type = ? ORDER BY timestamp DESC LIMIT ?").all(type, limit) as Incident[];
}

// Monitoring snapshots
export function saveSnapshot(snapshot: MonitoringSnapshot): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO monitoring_snapshots (timestamp, cpu_load, memory_used_pct, temperature, bgp_sessions, ospf_neighbors, interface_status, anomalies)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    snapshot.timestamp,
    snapshot.cpuLoad,
    snapshot.memoryUsedPct,
    snapshot.temperature,
    JSON.stringify(snapshot.bgpSessions),
    JSON.stringify(snapshot.ospfNeighbors),
    JSON.stringify(snapshot.interfaceStatus),
    JSON.stringify(snapshot.anomalies)
  );
}

export function getRecentSnapshots(limit = 60): MonitoringSnapshot[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM monitoring_snapshots ORDER BY timestamp DESC LIMIT ?").all(limit) as Array<{
    timestamp: string;
    cpu_load: number;
    memory_used_pct: number;
    temperature: number;
    bgp_sessions: string;
    ospf_neighbors: string;
    interface_status: string;
    anomalies: string;
  }>;

  return rows.map((r) => ({
    timestamp: r.timestamp,
    cpuLoad: r.cpu_load,
    memoryUsedPct: r.memory_used_pct,
    temperature: r.temperature,
    bgpSessions: JSON.parse(r.bgp_sessions),
    ospfNeighbors: JSON.parse(r.ospf_neighbors),
    interfaceStatus: JSON.parse(r.interface_status),
    anomalies: JSON.parse(r.anomalies),
  }));
}

export function getSnapshotsSince(since: string): MonitoringSnapshot[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM monitoring_snapshots WHERE timestamp >= ? ORDER BY timestamp ASC").all(since) as Array<{
    timestamp: string;
    cpu_load: number;
    memory_used_pct: number;
    temperature: number;
    bgp_sessions: string;
    ospf_neighbors: string;
    interface_status: string;
    anomalies: string;
  }>;

  return rows.map((r) => ({
    timestamp: r.timestamp,
    cpuLoad: r.cpu_load,
    memoryUsedPct: r.memory_used_pct,
    temperature: r.temperature,
    bgpSessions: JSON.parse(r.bgp_sessions),
    ospfNeighbors: JSON.parse(r.ospf_neighbors),
    interfaceStatus: JSON.parse(r.interface_status),
    anomalies: JSON.parse(r.anomalies),
  }));
}

// Monitoring alerts
export function saveMonitoringAlert(alert: { id: string; severity: string; title: string; detail: string; source: string; timestamp: string; proposedCommand?: string }): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO monitoring_alerts (id, severity, title, detail, source, timestamp, proposed_command)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(alert.id, alert.severity, alert.title, alert.detail, alert.source, alert.timestamp, alert.proposedCommand || "");
}

export function getMonitoringAlerts(limit = 20): Array<{ id: string; severity: string; title: string; detail: string; source: string; timestamp: string; proposedCommand: string; read: boolean }> {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM monitoring_alerts ORDER BY timestamp DESC LIMIT ?").all(limit) as Array<{
    id: string; severity: string; title: string; detail: string; source: string; timestamp: string; proposed_command: string; read: number;
  }>;
  return rows.map((r) => ({
    id: r.id, severity: r.severity, title: r.title, detail: r.detail,
    source: r.source, timestamp: r.timestamp, proposedCommand: r.proposed_command, read: r.read === 1,
  }));
}

export function clearMonitoringAlerts(): void {
  getDb().prepare("DELETE FROM monitoring_alerts").run();
}

// Pending actions
export function savePendingAction(action: ProposedAction): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO pending_actions (id, command, explanation, risk_level, reversible, revert_command, status, created_at, executed_at, result)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    action.id,
    action.command,
    action.explanation,
    action.riskLevel,
    action.reversible ? 1 : 0,
    action.revertCommand || "",
    action.status,
    action.createdAt,
    action.executedAt || "",
    action.result || ""
  );
}

export function getPendingActions(): ProposedAction[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM pending_actions WHERE status = 'pending' ORDER BY created_at DESC").all() as Array<{
    id: string;
    command: string;
    explanation: string;
    risk_level: string;
    reversible: number;
    revert_command: string;
    status: string;
    created_at: string;
    executed_at: string;
    result: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    command: r.command,
    explanation: r.explanation,
    riskLevel: r.risk_level as ProposedAction["riskLevel"],
    reversible: r.reversible === 1,
    revertCommand: r.revert_command || undefined,
    status: r.status as ProposedAction["status"],
    createdAt: r.created_at,
    executedAt: r.executed_at || undefined,
    result: r.result || undefined,
  }));
}

export function updateActionStatus(
  id: string,
  status: ProposedAction["status"],
  result?: string
): void {
  const db = getDb();
  db.prepare(
    `UPDATE pending_actions SET status = ?, executed_at = CASE WHEN ? IN ('executed','failed') THEN datetime('now') ELSE executed_at END, result = ? WHERE id = ?`
  ).run(status, status, result || "", id);

  // Log it
  const action = db.prepare("SELECT * FROM pending_actions WHERE id = ?").get(id) as { command: string } | undefined;
  if (action) {
    db.prepare(
      `INSERT INTO action_log (action_id, command, status, result, timestamp) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(id, action.command, status, result || "");
  }
}

export function getActionLog(limit = 50): Array<{
  action_id: string;
  command: string;
  status: string;
  result: string;
  timestamp: string;
}> {
  const db = getDb();
  return db.prepare("SELECT * FROM action_log ORDER BY timestamp DESC LIMIT ?").all(limit) as Array<{
    action_id: string;
    command: string;
    status: string;
    result: string;
    timestamp: string;
  }>;
}

// Memory patterns
export function findSimilarIncidents(description: string, incidentType: string): Array<{
  id: number;
  pattern_key: string;
  description: string;
  last_seen: string;
  occurrences: number;
  resolution: string;
}> {
  const db = getDb();
  const keyWords = description
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  if (keyWords.length === 0) return [];

  const conditions = keyWords.map(() => "pattern_key LIKE ? OR description LIKE ?").join(" OR ");
  const params = keyWords.flatMap((w) => [`%${w}%`, `%${w}%`]);

  return db
    .prepare(`SELECT * FROM memory_patterns WHERE (${conditions}) ORDER BY occurrences DESC LIMIT 5`)
    .all(...params) as Array<{
    id: number;
    pattern_key: string;
    description: string;
    last_seen: string;
    occurrences: number;
    resolution: string;
  }>;
}

export function recordMemoryPattern(patternKey: string, description: string, resolution = ""): void {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM memory_patterns WHERE pattern_key = ?").get(patternKey) as
    | { id: number; occurrences: number }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE memory_patterns SET occurrences = ?, last_seen = datetime('now'), resolution = ? WHERE id = ?`
    ).run(existing.occurrences + 1, resolution || existing.id.toString(), existing.id);
  } else {
    db.prepare(
      `INSERT INTO memory_patterns (pattern_key, description, last_seen, resolution) VALUES (?, ?, datetime('now'), ?)`
    ).run(patternKey, description, resolution);
  }
}

// Cleanup old snapshots (keep last 24 hours)
export function cleanupOldSnapshots(): void {
  const db = getDb();
  db.prepare(
    `DELETE FROM monitoring_snapshots WHERE timestamp < datetime('now', '-24 hours')`
  ).run();
}

// Security events
export function saveSecurityEvent(event: SecurityEvent): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO security_events
     (id, timestamp, severity, attack_type, source_ip, target_port, target_service,
      evidence_count, time_window_seconds, natural_language, technical_detail,
      documentation_ref, recommended_action, proposed_command, auto_response, status, related_log_entries)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.id,
    event.timestamp,
    event.severity,
    event.attackType,
    event.sourceIp,
    event.targetPort || null,
    event.targetService || null,
    event.evidenceCount,
    event.timeWindowSeconds,
    event.naturalLanguage,
    event.technicalDetail,
    event.documentationRef,
    event.recommendedAction,
    event.proposedCommand,
    event.autoResponse,
    event.status,
    JSON.stringify(event.relatedLogEntries)
  );
}

export function getSecurityEvents(limit = 50): SecurityEvent[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM security_events ORDER BY timestamp DESC LIMIT ?"
  ).all(limit) as Array<{
    id: string;
    timestamp: string;
    severity: string;
    attack_type: string;
    source_ip: string;
    target_port: number | null;
    target_service: string | null;
    evidence_count: number;
    time_window_seconds: number;
    natural_language: string;
    technical_detail: string;
    documentation_ref: string;
    recommended_action: string;
    proposed_command: string;
    auto_response: string;
    status: string;
    related_log_entries: string;
  }>;

  return rows.map(mapRowToSecurityEvent);
}

export function getActiveSecurityEvents(): SecurityEvent[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM security_events WHERE status IN ('active', 'auto-blocked') ORDER BY timestamp DESC"
  ).all() as Array<{
    id: string;
    timestamp: string;
    severity: string;
    attack_type: string;
    source_ip: string;
    target_port: number | null;
    target_service: string | null;
    evidence_count: number;
    time_window_seconds: number;
    natural_language: string;
    technical_detail: string;
    documentation_ref: string;
    recommended_action: string;
    proposed_command: string;
    auto_response: string;
    status: string;
    related_log_entries: string;
  }>;

  return rows.map(mapRowToSecurityEvent);
}

export function getSecurityEventsByIp(ip: string, limit = 20): SecurityEvent[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM security_events WHERE source_ip = ? ORDER BY timestamp DESC LIMIT ?"
  ).all(ip, limit) as Array<{
    id: string;
    timestamp: string;
    severity: string;
    attack_type: string;
    source_ip: string;
    target_port: number | null;
    target_service: string | null;
    evidence_count: number;
    time_window_seconds: number;
    natural_language: string;
    technical_detail: string;
    documentation_ref: string;
    recommended_action: string;
    proposed_command: string;
    auto_response: string;
    status: string;
    related_log_entries: string;
  }>;

  return rows.map(mapRowToSecurityEvent);
}

export function getSecurityStats(): {
  totalEvents: number;
  activeEvents: number;
  altaCount: number;
  mediaCount: number;
  bajaCount: number;
  blockedIps: string[];
} {
  const db = getDb();
  const totalRow = db.prepare("SELECT COUNT(*) as c FROM security_events").get() as { c: number };
  const activeRow = db.prepare("SELECT COUNT(*) as c FROM security_events WHERE status IN ('active','auto-blocked')").get() as { c: number };
  const altaRow = db.prepare("SELECT COUNT(*) as c FROM security_events WHERE severity = 'alta'").get() as { c: number };
  const mediaRow = db.prepare("SELECT COUNT(*) as c FROM security_events WHERE severity = 'media'").get() as { c: number };
  const bajaRow = db.prepare("SELECT COUNT(*) as c FROM security_events WHERE severity = 'baja'").get() as { c: number };
  const blockedRows = db.prepare(
    "SELECT DISTINCT source_ip FROM security_events WHERE status = 'auto-blocked'"
  ).all() as Array<{ source_ip: string }>;

  return {
    totalEvents: totalRow.c,
    activeEvents: activeRow.c,
    altaCount: altaRow.c,
    mediaCount: mediaRow.c,
    bajaCount: bajaRow.c,
    blockedIps: blockedRows.map((r) => r.source_ip),
  };
}

export function updateSecurityEventStatus(id: string, status: SecurityEvent["status"]): void {
  const db = getDb();
  db.prepare("UPDATE security_events SET status = ? WHERE id = ?").run(status, id);
}

export function cleanupOldSecurityEvents(): void {
  const db = getDb();
  db.prepare(
    `DELETE FROM security_events WHERE timestamp < datetime('now', '-72 hours') AND status IN ('resolved','acknowledged')`
  ).run();
}

function mapRowToSecurityEvent(row: {
  id: string;
  timestamp: string;
  severity: string;
  attack_type: string;
  source_ip: string;
  target_port: number | null;
  target_service: string | null;
  evidence_count: number;
  time_window_seconds: number;
  natural_language: string;
  technical_detail: string;
  documentation_ref: string;
  recommended_action: string;
  proposed_command: string;
  auto_response: string;
  status: string;
  related_log_entries: string;
}): SecurityEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    severity: row.severity as SecurityEvent["severity"],
    attackType: row.attack_type,
    sourceIp: row.source_ip,
    targetPort: row.target_port || undefined,
    targetService: row.target_service || undefined,
    evidenceCount: row.evidence_count,
    timeWindowSeconds: row.time_window_seconds,
    naturalLanguage: row.natural_language,
    technicalDetail: row.technical_detail,
    documentationRef: row.documentation_ref,
    recommendedAction: row.recommended_action,
    proposedCommand: row.proposed_command,
    autoResponse: row.auto_response as SecurityEvent["autoResponse"],
    status: row.status as SecurityEvent["status"],
    relatedLogEntries: JSON.parse(row.related_log_entries) as string[],
  };
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// MikroTik connection config
export function saveMikroTikConfig(config: MikroTikConfig & { alias?: string }): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO mikrotik_config (id, alias, host, port, username, password, use_ssl, updated_at)
     VALUES ('default', ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    config.alias || "MikroTik",
    config.ip,
    config.port,
    config.username,
    config.password,
    config.useSsl ? 1 : 0
  );
}

export function loadMikroTikConfig(): (MikroTikConfig & { alias: string; lastConnected: string | null }) | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM mikrotik_config WHERE id = 'default'").get() as {
    alias: string;
    host: string;
    port: number;
    username: string;
    password: string;
    use_ssl: number;
    last_connected: string | null;
  } | undefined;

  if (!row || !row.host) return null;

  return {
    ip: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    useSsl: row.use_ssl === 1,
    alias: row.alias,
    lastConnected: row.last_connected,
  };
}

export function markMikroTikConnected(): void {
  const db = getDb();
  db.prepare(
    `UPDATE mikrotik_config SET last_connected = datetime('now') WHERE id = 'default'`
  ).run();
}

export function deleteMikroTikConfig(): void {
  const db = getDb();
  db.prepare("DELETE FROM mikrotik_config WHERE id = 'default'").run();
}

export function clearAllSimulatedData(): void {
  const db = getDb();
  db.prepare("DELETE FROM monitoring_snapshots").run();
  db.prepare("DELETE FROM security_events").run();
  db.prepare("DELETE FROM pending_actions").run();
  db.prepare("DELETE FROM action_log").run();
  db.prepare("DELETE FROM incidents").run();
  db.prepare("DELETE FROM memory_patterns").run();
  console.log("[DB] Todos los datos simulados eliminados");
}
