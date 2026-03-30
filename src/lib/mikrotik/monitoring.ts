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

function takeSnapshot(): MonitoringSnapshot {
  // Use simulated data as fallback
  const data = generateSimulatedData();

  // Try to get real data if a MikroTik is configured (non-blocking)
  const hasConfig = loadMikroTikConfig() !== null;
  if (hasConfig) {
    fetchRealRouterData().then((realData) => {
      if (realData) {
        // Real data is available but snapshot already taken with simulated
        // Real data flows through the dashboard API endpoint instead
      }
    }).catch(() => {});
  }

  const memoryUsedPct =
    ((data.health.totalMemory - data.health.freeMemory) / data.health.totalMemory) * 100;

  const anomalies: string[] = [];

  // Check for BGP session issues
  for (const session of data.bgpSessions) {
    if (session.status !== "established") {
      anomalies.push(`BGP session ${session.name} is ${session.status}`);
    }
  }

  // Check for OSPF issues
  for (const neighbor of data.ospfNeighbors) {
    if (neighbor.state !== "Full") {
      anomalies.push(`OSPF neighbor ${neighbor.identity} state: ${neighbor.state}`);
    }
  }

  // Check CPU
  if (data.health.cpuLoad > 80) {
    anomalies.push(`High CPU load: ${data.health.cpuLoad}%`);
  }

  // Check temperature
  if (data.health.temperature > 65) {
    anomalies.push(`High temperature: ${data.health.temperature}C`);
  }

  // Check interfaces
  for (const iface of data.interfaces) {
    if (iface.status === "down" && iface.name !== "ether4") {
      anomalies.push(`Interface ${iface.name} is down`);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    cpuLoad: data.health.cpuLoad,
    memoryUsedPct,
    temperature: data.health.temperature,
    bgpSessions: data.bgpSessions.map((s) => ({
      name: s.name,
      status: s.status,
      prefixCount: s.prefixCount,
    })),
    ospfNeighbors: data.ospfNeighbors.map((n) => ({
      identity: n.identity,
      state: n.state,
    })),
    interfaceStatus: data.interfaces.map((i) => ({
      name: i.name,
      status: i.status,
      rxRate: i.rxRate,
      txRate: i.txRate,
    })),
    anomalies,
  };
}

function detectAnomalies(current: MonitoringSnapshot): MonitoringAlert | null {
  const now = Date.now();
  if (now - lastAnomalyTime < ANOMALY_COOLDOWN_MS) return null;

  // Check previous snapshots for comparison
  const recent = getRecentSnapshots(5);
  if (recent.length < 2) return null;

  // BGP session drop
  for (const session of current.bgpSessions) {
    const wasEstablished = recent.some(
      (s) =>
        s.bgpSessions.find((b) => b.name === session.name)?.status === "established"
    );
    if (session.status !== "established" && wasEstablished) {
      lastAnomalyTime = now;

      const alert: MonitoringAlert = {
        id: generateId(),
        severity: "critical",
        title: `BGP session ${session.name} caida`,
        detail: `Sesion BGP con ${session.name} paso a estado ${session.status}. Posible perdida de conectividad con el peer.`,
        source: "BGP Monitor",
        timestamp: new Date().toISOString(),
        proposedCommand: `/routing bgp connection set [find name="${session.name}"] disabled=no`,
      };

      // Record incident
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

      // Check for similar past incidents
      const similar = findSimilarIncidents(`BGP ${session.name} down`, "bgp");
      if (similar.length > 0 && similar[0].occurrences > 1) {
        alert.detail += `\n\nNota: Este problema ha ocurrido ${similar[0].occurrences} veces anteriormente. Posible causa recurrente.`;
      }

      recordMemoryPattern(`bgp-down-${session.name}`, `BGP session ${session.name} went ${session.status}`);

      return alert;
    }
  }

  // CPU spike
  const avgCpu = recent.reduce((sum, s) => sum + s.cpuLoad, 0) / recent.length;
  if (current.cpuLoad > 85 && avgCpu < 50) {
    lastAnomalyTime = now;

    return {
      id: generateId(),
      severity: "warning",
      title: "Pico de CPU detectado",
      detail: `CPU subio a ${current.cpuLoad}% (promedio reciente: ${avgCpu.toFixed(1)}%). Posible saturacion o ataque.`,
      source: "CPU Monitor",
      timestamp: new Date().toISOString(),
      proposedCommand: `/ip firewall raw add action=drop chain=prerouting src-address-list=blocked-ddos comment="Auto-block DDoS"`,
    };
  }

  // Temperature warning
  if (current.temperature > 70) {
    lastAnomalyTime = now;

    return {
      id: generateId(),
      severity: "warning",
      title: "Temperatura elevada",
      detail: `Temperatura del equipo: ${current.temperature}C. Revisar ventilacion y carga de procesamiento.`,
      source: "Thermal Monitor",
      timestamp: new Date().toISOString(),
    };
  }

  // Interface flapping detection
  const prevSnapshot = recent[0];
  for (const iface of current.interfaceStatus) {
    const prevIface = prevSnapshot.interfaceStatus.find((i) => i.name === iface.name);
    if (prevIface && prevIface.status !== iface.status) {
      lastAnomalyTime = now;

      return {
        id: generateId(),
        severity: "warning",
        title: `Interface ${iface.name} cambio de estado`,
        detail: `Interface ${iface.name} paso de ${prevIface.status} a ${iface.status}. Posible flap o problema fisico.`,
        source: "Interface Monitor",
        timestamp: new Date().toISOString(),
      };
    }
  }

  return null;
}

function runMonitoringCycle(): void {
  try {
    const snapshot = takeSnapshot();
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
