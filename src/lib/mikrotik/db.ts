import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Incident, MonitoringSnapshot, ProposedAction } from "@/lib/types";

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

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
