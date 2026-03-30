import { generateSimulatedData } from "./connection";
import { fetchRealRouterData } from "./connection-server";
import {
  saveSnapshot,
  getRecentSnapshots,
  cleanupOldSnapshots,
  saveIncident,
  recordMemoryPattern,
  findSimilarIncidents,
  savePendingAction,
  saveMonitoringAlert,
  loadMikroTikConfig,
} from "./db";
import type {
  MonitoringSnapshot,
  MonitoringAlert,
  ProposedAction,
  Incident,
} from "@/lib/types";

let monitoringInterval: ReturnType<typeof setInterval> | null = null;
let alertCallbacks: Array<(alert: MonitoringAlert) => void> = [];
let lastAnomalyTime = 0;
const ANOMALY_COOLDOWN_MS = 300_000; // 5 minutes between anomalies

function generateId(): string {
  return `mon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function takeSnapshot(): Promise<MonitoringSnapshot | null> {
  const hasConfig = loadMikroTikConfig() !== null;

  // Only use real data when a router is configured
  if (hasConfig) {
    const realData = await fetchRealRouterData();
    if (realData && !realData.error && realData.health) {
      const health = realData.health as {
        cpuLoad: number; freeMemory: number; totalMemory: number;
        temperature: number; boardName: string; routerOsVersion: string; uptime: string;
      };
      const interfaces = realData.interfaces as Array<{
        name: string; status: string; rxRate: number; txRate: number;
      }>;
      const memoryUsedPct = ((health.totalMemory - health.freeMemory) / health.totalMemory) * 100;

      const anomalies: string[] = [];
      if (health.cpuLoad > 80) anomalies.push(`CPU alta: ${health.cpuLoad}%`);
      if (health.temperature > 65) anomalies.push(`Temperatura elevada: ${health.temperature}C`);
      for (const iface of interfaces) {
        if (iface.status === "down") anomalies.push(`Interface ${iface.name} caida`);
      }

      console.log(`[Monitoring] Snapshot real: CPU ${health.cpuLoad}%, ${interfaces.length} interfaces`);
      return {
        timestamp: new Date().toISOString(),
        cpuLoad: health.cpuLoad,
        memoryUsedPct,
        temperature: health.temperature,
        bgpSessions: (realData.bgpSessions as Array<{ name: string; status: string; prefixCount: number }>) || [],
        ospfNeighbors: (realData.ospfNeighbors as Array<{ identity: string; state: string }>) || [],
        interfaceStatus: interfaces.map((i) => ({ name: i.name, status: i.status, rxRate: i.rxRate, txRate: i.txRate })),
        anomalies,
      };
    }
    console.log("[Monitoring] Router configurado pero no se pudo obtener datos reales, omitiendo snapshot");
    return null;
  }

  // No router configured - skip snapshots entirely
  console.log("[Monitoring] Sin configuracion de router, omitiendo snapshot");
  return null;
}

function detectAnomalies(current: MonitoringSnapshot): MonitoringAlert | null {
  const now = Date.now();
  if (now - lastAnomalyTime < ANOMALY_COOLDOWN_MS) return null;

  // Check previous snapshots for comparison (need at least 1)
  const recent = getRecentSnapshots(5);

  // Interface flapping detection (needs 1 previous snapshot)
  if (recent.length >= 1) {
    const prevSnapshot = recent[0];
    for (const iface of current.interfaceStatus) {
      const prevIface = prevSnapshot.interfaceStatus.find((i: { name: string }) => i.name === iface.name);
      if (prevIface && prevIface.status !== iface.status) {
        lastAnomalyTime = now;
        const alert: MonitoringAlert = {
          id: generateId(),
          severity: "warning",
          title: `Interface ${iface.name} cambio de estado`,
          detail: `Interface ${iface.name} paso de ${prevIface.status} a ${iface.status}. Posible flap o problema fisico.`,
          source: "Interface Monitor",
          timestamp: new Date().toISOString(),
        };
        saveMonitoringAlert(alert);
        return alert;
      }
    }
  }

  // High CPU (no previous data needed)
  if (current.cpuLoad > 85) {
    lastAnomalyTime = now;
    const alert: MonitoringAlert = {
      id: generateId(),
      severity: "warning",
      title: "CPU alta detectada",
      detail: `CPU en ${current.cpuLoad}%. Posible saturacion, ataque DDoS o proceso bloqueante. Usa /tool profile para diagnostico.`,
      source: "CPU Monitor",
      timestamp: new Date().toISOString(),
      proposedCommand: `/tool profile duration=15`,
    };
    saveMonitoringAlert(alert);
    return alert;
  }

  // Memory high (no previous data needed)
  if (current.memoryUsedPct > 90) {
    lastAnomalyTime = now;
    const alert: MonitoringAlert = {
      id: generateId(),
      severity: "warning",
      title: "Memoria RAM alta",
      detail: `Uso de memoria: ${current.memoryUsedPct.toFixed(0)}%. Considera deshabilitar paquetes innecesarios.`,
      source: "Memory Monitor",
      timestamp: new Date().toISOString(),
      proposedCommand: `/system package print`,
    };
    saveMonitoringAlert(alert);
    return alert;
  }

  // Temperature warning (no previous data needed)
  if (current.temperature > 70) {
    lastAnomalyTime = now;
    const alert: MonitoringAlert = {
      id: generateId(),
      severity: "warning",
      title: "Temperatura elevada",
      detail: `Temperatura del equipo: ${current.temperature}C. Revisar ventilacion y carga de procesamiento.`,
      source: "Thermal Monitor",
      timestamp: new Date().toISOString(),
    };
    saveMonitoringAlert(alert);
    return alert;
  }

  // BGP session drop (needs previous data)
  if (recent.length >= 2) {
    for (const session of current.bgpSessions) {
      const wasEstablished = recent.some(
        (s: MonitoringSnapshot) =>
          s.bgpSessions.find((b: { name: string }) => b.name === session.name)?.status === "established"
      );
      if (session.status !== "established" && wasEstablished) {
        lastAnomalyTime = now;

        const alert: MonitoringAlert = {
          id: generateId(),
          severity: "critical",
          title: `BGP session ${session.name} caida`,
          detail: `Sesion BGP con ${session.name} paso a estado ${session.status}. Posible perdida de conectividad.`,
          source: "BGP Monitor",
          timestamp: new Date().toISOString(),
          proposedCommand: `/routing bgp peer set [find name="${session.name}"] disabled=no`,
        };
        saveMonitoringAlert(alert);

        const incident: Incident = {
          id: `inc-${Date.now().toString(36)}`,
          timestamp: new Date().toISOString(),
          type: "bgp",
          description: `BGP session ${session.name} dropped to ${session.status}`,
          resolution: "",
          commands: "",
          resolved: false,
        };
        saveIncident(incident);
        recordMemoryPattern(`bgp-down-${session.name}`, `BGP session ${session.name} went ${session.status}`);

        return alert;
      }
    }
  }

  // CPU spike (needs previous data for average)
  if (recent.length >= 2) {
    const avgCpu = recent.reduce((sum: number, s: MonitoringSnapshot) => sum + s.cpuLoad, 0) / recent.length;
    if (current.cpuLoad > 85 && avgCpu < 50) {
      lastAnomalyTime = now;
      const alert: MonitoringAlert = {
        id: generateId(),
        severity: "warning",
        title: "Pico de CPU detectado",
        detail: `CPU subio a ${current.cpuLoad}% (promedio reciente: ${avgCpu.toFixed(1)}%). Posible saturacion o ataque.`,
        source: "CPU Monitor",
        timestamp: new Date().toISOString(),
        proposedCommand: `/tool profile duration=15`,
      };
      saveMonitoringAlert(alert);
      return alert;
    }
  }

  return null;
}

async function runMonitoringCycle(): Promise<void> {
  try {
    const snapshot = await takeSnapshot();
    if (!snapshot) return; // No data available, skip this cycle

    saveSnapshot(snapshot);

    // Cleanup old data periodically
    if (Math.random() < 0.05) {
      cleanupOldSnapshots();
    }

    // Check for anomalies
    const alert = detectAnomalies(snapshot);
    if (alert) {
      // Create pending action if there's a proposed command
      if (alert.proposedCommand) {
        const action: ProposedAction = {
          id: alert.id,
          command: alert.proposedCommand,
          explanation: `Auto-deteccion: ${alert.title}. ${alert.detail}`,
          riskLevel: alert.severity === "critical" ? "medium" : "low",
          reversible: true,
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        savePendingAction(action);
      }

      // Notify callbacks
      for (const cb of alertCallbacks) {
        try {
          cb(alert);
        } catch {
          // Callback error
        }
      }
    }
  } catch {
    // Monitoring cycle error - don't crash
  }
}

export function startMonitoring(): void {
  if (monitoringInterval) return;

  // Run immediately
  runMonitoringCycle();

  // Then every 60 seconds
  monitoringInterval = setInterval(runMonitoringCycle, 60_000);
}

export function stopMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
}

export function onMonitoringAlert(callback: (alert: MonitoringAlert) => void): void {
  alertCallbacks.push(callback);
}

export function getMonitoringStatus(): {
  active: boolean;
  snapshotsCount: number;
  latestSnapshot: MonitoringSnapshot | null;
} {
  const snapshots = getRecentSnapshots(1);
  return {
    active: monitoringInterval !== null,
    snapshotsCount: snapshots.length,
    latestSnapshot: snapshots[0] || null,
  };
}
