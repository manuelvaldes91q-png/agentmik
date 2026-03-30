import type { LogEntry, SecurityEvent, DetectedAttack } from "@/lib/types";
import {
  saveSecurityEvent,
  getSecurityEventsByIp,
  savePendingAction,
  recordMemoryPattern,
  findSimilarIncidents,
} from "./db";
import { getVectorStore } from "@/lib/ingestion/vector-store";
import { searchKnowledge } from "@/docs/knowledge-base";

// Sliding window for log analysis
const LOG_WINDOW_MS = 300_000; // 5 minutes
const logBuffer: LogEntry[] = [];

// Detection thresholds
const BRUTE_FORCE_THRESHOLD = 5;
const PORT_SCAN_THRESHOLD = 8;
const DDOS_CPU_THRESHOLD = 85;

// Cooldown to prevent duplicate events
const eventCooldowns = new Map<string, number>();
const EVENT_COOLDOWN_MS = 600_000; // 10 min cooldown per attack type+IP

let eventCallbacks: Array<(event: SecurityEvent) => void> = [];

function generateId(): string {
  return `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isOnCooldown(key: string): boolean {
  const lastTime = eventCooldowns.get(key);
  if (!lastTime) return false;
  return Date.now() - lastTime < EVENT_COOLDOWN_MS;
}

function setCooldown(key: string): void {
  eventCooldowns.set(key, Date.now());
}

function trimBuffer(): void {
  const cutoff = Date.now() - LOG_WINDOW_MS;
  while (logBuffer.length > 0 && new Date(logBuffer[0].timestamp).getTime() < cutoff) {
    logBuffer.shift();
  }
}

function extractIp(message: string): string {
  const ipMatch = message.match(
    /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/
  );
  return ipMatch ? ipMatch[1] : "unknown";
}

function extractPort(message: string): number | undefined {
  const portMatch = message.match(/->[^:]+:(\d+)/);
  return portMatch ? parseInt(portMatch[1], 10) : undefined;
}

function extractService(message: string): string | undefined {
  const lower = message.toLowerCase();
  if (lower.includes("ssh")) return "SSH";
  if (lower.includes("winbox")) return "WinBox";
  if (lower.includes("ftp")) return "FTP";
  if (lower.includes("telnet")) return "Telnet";
  if (lower.includes("http")) return "HTTP";
  if (lower.includes("dns")) return "DNS";
  return undefined;
}

function isExternalIp(ip: string): boolean {
  return !ip.startsWith("192.168.") && !ip.startsWith("10.") && !ip.startsWith("172.16.") && !ip.startsWith("172.17.") && !ip.startsWith("172.18.") && !ip.startsWith("172.19.") && !ip.startsWith("172.2") && !ip.startsWith("172.3") && ip !== "127.0.0.1" && ip !== "unknown";
}

// Detect brute force attacks
function detectBruteForce(entries: LogEntry[]): DetectedAttack | null {
  const loginFailures = entries.filter(
    (e) =>
      e.message.toLowerCase().includes("login failure") ||
      e.message.toLowerCase().includes("authentication failed") ||
      e.message.toLowerCase().includes("invalid user")
  );

  // Group by source IP
  const ipGroups = new Map<string, LogEntry[]>();
  for (const entry of loginFailures) {
    const ip = extractIp(entry.message);
    if (!ipGroups.has(ip)) ipGroups.set(ip, []);
    ipGroups.get(ip)!.push(entry);
  }

  for (const [ip, group] of ipGroups) {
    if (group.length >= BRUTE_FORCE_THRESHOLD && isExternalIp(ip)) {
      const service = extractService(group[0].message) || "unknown";
      return {
        type: "brute-force",
        sourceIp: ip,
        targetService: service,
        evidenceCount: group.length,
        timeWindowSeconds: LOG_WINDOW_MS / 1000,
        logEntries: group.map((e) => `${e.timestamp} ${e.topics} ${e.message}`),
        confidence: Math.min(0.95, 0.5 + group.length * 0.05),
      };
    }
  }

  return null;
}

// Detect port scanning
function detectPortScan(entries: LogEntry[]): DetectedAttack | null {
  const firewallDrops = entries.filter(
    (e) =>
      e.topics.includes("firewall") &&
      (e.message.includes("drop") ||
        e.message.includes("SYN") ||
        e.message.includes("input:"))
  );

  // Group by source IP
  const ipGroups = new Map<string, Set<number>>();
  const ipEntries = new Map<string, LogEntry[]>();

  for (const entry of firewallDrops) {
    const ip = extractIp(entry.message);
    const port = extractPort(entry.message);
    if (!isExternalIp(ip)) continue;

    if (!ipGroups.has(ip)) {
      ipGroups.set(ip, new Set());
      ipEntries.set(ip, []);
    }
    if (port) ipGroups.get(ip)!.add(port);
    ipEntries.get(ip)!.push(entry);
  }

  for (const [ip, ports] of ipGroups) {
    const entriesForIp = ipEntries.get(ip) || [];
    if (ports.size >= PORT_SCAN_THRESHOLD || entriesForIp.length >= PORT_SCAN_THRESHOLD * 2) {
      return {
        type: "port-scan",
        sourceIp: ip,
        evidenceCount: entriesForIp.length,
        timeWindowSeconds: LOG_WINDOW_MS / 1000,
        logEntries: entriesForIp
          .slice(0, 10)
          .map((e) => `${e.timestamp} ${e.topics} ${e.message}`),
        confidence: Math.min(0.9, 0.4 + ports.size * 0.05),
      };
    }
  }

  return null;
}

// Detect DDoS indicators
function detectDdos(entries: LogEntry[]): DetectedAttack | null {
  const cpuWarnings = entries.filter(
    (e) =>
      e.message.toLowerCase().includes("cpu") ||
      e.message.toLowerCase().includes("connection tracking")
  );

  const highCpu = cpuWarnings.filter((e) => {
    const cpuMatch = e.message.match(/(\d+)%/);
    return cpuMatch && parseInt(cpuMatch[1], 10) >= DDOS_CPU_THRESHOLD;
  });

  const connTrackingFull = entries.filter((e) =>
    e.message.toLowerCase().includes("connection tracking table full")
  );

  if (highCpu.length > 0 || connTrackingFull.length > 0) {
    const evidence = [...highCpu, ...connTrackingFull];
    return {
      type: "ddos-flood",
      sourceIp: "multiple",
      evidenceCount: evidence.length,
      timeWindowSeconds: LOG_WINDOW_MS / 1000,
      logEntries: evidence.map(
        (e) => `${e.timestamp} ${e.topics} ${e.message}`
      ),
      confidence: connTrackingFull.length > 0 ? 0.85 : 0.6,
    };
  }

  return null;
}

// Detect protocol errors (OSPF, BGP)
function detectProtocolErrors(entries: LogEntry[]): DetectedAttack | null {
  const protocolErrors = entries.filter(
    (e) =>
      (e.message.toLowerCase().includes("ospf:") ||
        e.message.toLowerCase().includes("bgp:")) &&
      (e.message.toLowerCase().includes("error") ||
        e.message.toLowerCase().includes("mismatch") ||
        e.message.toLowerCase().includes("expired") ||
        e.message.toLowerCase().includes("failed"))
  );

  if (protocolErrors.length > 0) {
    const ip = extractIp(protocolErrors[0].message);
    return {
      type: "protocol-error",
      sourceIp: ip,
      evidenceCount: protocolErrors.length,
      timeWindowSeconds: LOG_WINDOW_MS / 1000,
      logEntries: protocolErrors.map(
        (e) => `${e.timestamp} ${e.topics} ${e.message}`
      ),
      confidence: 0.8,
    };
  }

  return null;
}

// Correlate with documentation
function correlateDocumentation(attackType: string, message: string): string {
  const searchQuery =
    attackType === "brute-force"
      ? "login failure brute force SSH firewall"
      : attackType === "port-scan"
        ? "port scan firewall drop address list"
        : attackType === "ddos-flood"
          ? "DDoS protection connection tracking firewall raw"
          : attackType === "protocol-error"
            ? message.slice(0, 100)
            : attackType;

  try {
    const vectorResults = getVectorStore().search(searchQuery, 2);
    if (vectorResults.length > 0 && vectorResults[0].score > 0.05) {
      const chunk = vectorResults[0].chunk;
      return `**${chunk.section}** - ${chunk.text.slice(0, 250)}${chunk.text.length > 250 ? "..." : ""} [Fuente: ${chunk.url}]`;
    }
  } catch {
    // vector store not available
  }

  // Fallback to static knowledge base
  const entries = searchKnowledge(searchQuery);
  if (entries.length > 0) {
    return `**${entries[0].topic}** - ${entries[0].content.slice(0, 250)}...`;
  }

  return "No se encontro documentacion especifica. Consultar /log print detail para mas contexto.";
}

// Generate natural language explanation
function generateNaturalLanguage(
  attack: DetectedAttack,
  docs: string
): { naturalLanguage: string; technicalDetail: string; documentationRef: string } {
  switch (attack.type) {
    case "brute-force":
      return {
        naturalLanguage:
          `Se detectaron ${attack.evidenceCount} intentos de login fallidos desde la IP ${attack.sourceIp} ` +
          `contra el servicio ${attack.targetService || "desconocido"} en una ventana de ${attack.timeWindowSeconds} segundos. ` +
          `Esto indica un ataque de fuerza bruta activo.`,
        technicalDetail:
          `Patron: login failure x${attack.evidenceCount} | Origen: ${attack.sourceIp} | ` +
          `Servicio: ${attack.targetService} | Confianza: ${(attack.confidence * 100).toFixed(0)}%`,
        documentationRef: docs,
      };

    case "port-scan":
      return {
        naturalLanguage:
          `La IP externa ${attack.sourceIp} realizo ${attack.evidenceCount} intentos de conexion ` +
          `a puertos cerrados del firewall en los ultimos ${attack.timeWindowSeconds} segundos. ` +
          `Esto es un patron tipico de escaneo de puertos (reconocimiento pre-ataque).`,
        technicalDetail:
          `Patron: SYN scan | Origen: ${attack.sourceIp} | ` +
          `Paquetes: ${attack.evidenceCount} | Confianza: ${(attack.confidence * 100).toFixed(0)}%`,
        documentationRef: docs,
      };

    case "ddos-flood":
      return {
        naturalLanguage:
          `Se detectaron indicadores de ataque DDoS: alta utilizacion de CPU y/o tabla de ` +
          `connection tracking saturada. El router esta bajo presion de trafico anomalo.`,
        technicalDetail:
          `Patron: DDoS/Flood | Evidencias: ${attack.evidenceCount} | ` +
          `Confianza: ${(attack.confidence * 100).toFixed(0)}%`,
        documentationRef: docs,
      };

    case "protocol-error":
      return {
        naturalLanguage:
          `Error de protocolo de routing detectado. El mensaje "${attack.logEntries[0]?.split(" ").slice(2).join(" ") || "desconocido"}" ` +
          `indica un problema de configuracion o conectividad con un vecino de routing.`,
        technicalDetail:
          `Patron: Protocol error | Origen: ${attack.sourceIp} | ` +
          `Evidencias: ${attack.evidenceCount}`,
        documentationRef: docs,
      };

    default:
      return {
        naturalLanguage: `Evento de seguridad detectado: ${attack.type}`,
        technicalDetail: `Evidencias: ${attack.evidenceCount}`,
        documentationRef: docs,
      };
  }
}

// Decision matrix
function classifySeverity(attack: DetectedAttack): {
  severity: SecurityEvent["severity"];
  autoResponse: SecurityEvent["autoResponse"];
  recommendedAction: string;
  proposedCommand: string;
} {
  switch (attack.type) {
    case "brute-force":
      if (attack.evidenceCount >= 10) {
        return {
          severity: "alta",
          autoResponse: "block-pending",
          recommendedAction:
            `Bloquear IP ${attack.sourceIp} en address-list permanentemente. ` +
            `El volumen de intentos (${attack.evidenceCount}) indica un ataque automatizado sostenido.`,
          proposedCommand:
            `/ip firewall address-list add list=blocked-bruteforce address=${attack.sourceIp} comment="Auto-block: brute force ${attack.targetService}"`,
        };
      }
      return {
        severity: "media",
        autoResponse: "suggest",
        recommendedAction:
          `Monitorear IP ${attack.sourceIp}. Considerar bloqueo si los intentos continuan. ` +
          `Reforzar autenticacion: usar key-based SSH, deshabilitar login por password.`,
        proposedCommand:
          `/ip firewall address-list add list=watch-list address=${attack.sourceIp} timeout=1h comment="Suspicious: brute force attempt"`,
      };

    case "port-scan":
      if (attack.evidenceCount >= 15) {
        return {
          severity: "alta",
          autoResponse: "block-pending",
          recommendedAction:
            `Bloquear IP ${attack.sourceIp}. Escaneo intensivo de puertos detectado. ` +
            `Agregar a address-list y usar raw rules para drop temprano.`,
          proposedCommand:
            `/ip firewall address-list add list=blocked-scanners address=${attack.sourceIp} comment="Auto-block: port scan"`,
        };
      }
      return {
        severity: "media",
        autoResponse: "suggest",
        recommendedAction:
          `IP ${attack.sourceIp} realizo escaneo ligero. Agregar a lista de monitoreo. ` +
          `Verificar que las raw rules esten activas para descartar trafico no deseado temprano.`,
        proposedCommand:
          `/ip firewall address-list add list=watch-list address=${attack.sourceIp} timeout=2h comment="Port scan detected"`,
      };

    case "ddos-flood":
      return {
        severity: "alta",
        autoResponse: "suggest",
        recommendedAction:
          `Activa proteccion DDoS: raw rules para bogon filtering, SYN flood protection, ` +
          `y rate limiting en connection tracking. Revisar connection-state rules.`,
        proposedCommand:
          `/ip firewall raw add action=drop chain=prerouting connection-limit=200,32 protocol=tcp comment="DDoS mitigation: SYN flood"`,
      };

    case "protocol-error":
      return {
        severity: "baja",
        autoResponse: "inform",
        recommendedAction:
          `Verificar configuracion de routing con el vecino. Revisar MTU, area OSPF/AS BGP, ` +
          `y autenticacion. Consultar logs detallados con /system logging add topics=ospf,bgp`,
        proposedCommand: "",
      };

    default:
      return {
        severity: "baja",
        autoResponse: "inform",
        recommendedAction: "Revisar manualmente.",
        proposedCommand: "",
      };
  }
}

// Main analysis entry point
export function analyzeLogs(entries: LogEntry[]): SecurityEvent[] {
  // Add to sliding window
  for (const entry of entries) {
    logBuffer.push(entry);
  }
  trimBuffer();

  if (logBuffer.length < 3) return [];

  const events: SecurityEvent[] = [];
  const now = new Date().toISOString();

  // Run all detectors
  const detectors = [detectBruteForce, detectPortScan, detectDdos, detectProtocolErrors];

  for (const detector of detectors) {
    const detected = detector(logBuffer);
    if (!detected) continue;

    const cooldownKey = `${detected.type}-${detected.sourceIp}`;
    if (isOnCooldown(cooldownKey)) continue;
    setCooldown(cooldownKey);

    const docs = correlateDocumentation(detected.type, detected.logEntries[0] || "");
    const nl = generateNaturalLanguage(detected, docs);
    const severity = classifySeverity(detected);

    const event: SecurityEvent = {
      id: generateId(),
      timestamp: now,
      severity: severity.severity,
      attackType: detected.type,
      sourceIp: detected.sourceIp,
      targetPort: detected.targetPort,
      targetService: detected.targetService,
      evidenceCount: detected.evidenceCount,
      timeWindowSeconds: detected.timeWindowSeconds,
      naturalLanguage: nl.naturalLanguage,
      technicalDetail: nl.technicalDetail,
      documentationRef: nl.documentationRef,
      recommendedAction: severity.recommendedAction,
      proposedCommand: severity.proposedCommand,
      autoResponse: severity.autoResponse,
      status: "active",
      relatedLogEntries: detected.logEntries.slice(0, 15),
    };

    // Persist event
    saveSecurityEvent(event);

    // Record in memory for pattern detection
    recordMemoryPattern(
      `${detected.type}-${detected.sourceIp}`,
      `${detected.type} from ${detected.sourceIp}: ${detected.evidenceCount} evidence`
    );

    // If high severity with auto-response, create pending action
    if (severity.severity === "alta" && severity.proposedCommand) {
      const pendingAction = {
        id: event.id,
        command: severity.proposedCommand,
        explanation: `[${severity.severity.toUpperCase()}] ${event.naturalLanguage}`,
        riskLevel: "medium" as const,
        reversible: true,
        revertCommand: `/ip firewall address-list remove [find address=${detected.sourceIp}]`,
        status: "pending" as const,
        createdAt: now,
      };
      savePendingAction(pendingAction);
    }

    // Check for historical recurrence
    const similar = findSimilarIncidents(
      `${detected.type} ${detected.sourceIp}`,
      detected.type
    );
    if (similar.length > 0 && similar[0].occurrences > 1) {
      event.naturalLanguage +=
        `\n\nNota: Este tipo de incidente ya se ha visto ${similar[0].occurrences} veces. ` +
        `Patron recurrente detectado.`;
    }

    events.push(event);

    // Notify callbacks
    for (const cb of eventCallbacks) {
      try {
        cb(event);
      } catch {
        // callback error
      }
    }
  }

  return events;
}

export function onSecurityEvent(callback: (event: SecurityEvent) => void): void {
  eventCallbacks.push(callback);
}

export function getAnalysisStatus(): {
  bufferSize: number;
  windowSeconds: number;
  detectorsActive: string[];
} {
  return {
    bufferSize: logBuffer.length,
    windowSeconds: LOG_WINDOW_MS / 1000,
    detectorsActive: ["brute-force", "port-scan", "ddos-flood", "protocol-error"],
  };
}
