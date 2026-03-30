import type { MikroTikConfig } from "@/lib/types";
import { RouterOSAPI } from "node-routeros";
import { loadMikroTikConfig, markMikroTikConnected } from "./db";
import { setCachedRouterVersion } from "./chat-engine";

type RouterOSVersion = 6 | 7;

function detectVersion(versionStr: string): RouterOSVersion {
  return versionStr.startsWith("6") ? 6 : 7;
}

function createConnection(config: MikroTikConfig): RouterOSAPI {
  return new RouterOSAPI({
    host: config.ip,
    port: config.port,
    user: config.username,
    password: config.password,
    timeout: 15,
    tls: config.useSsl ? {} : undefined,
  });
}

// Cache de contadores para calcular tasas suavizadas
interface ByteCounter {
  rxBytes: number;
  txBytes: number;
  timestamp: number;
  rxRateSmooth: number;
  txRateSmooth: number;
}
const byteCache: Record<string, ByteCounter> = {};
const SMOOTHING = 0.3; // 0 = max suavizado, 1 = sin suavizar

function parseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`[MikroTik] Error: ${msg}`);
  if (msg.includes("ECONNREFUSED") || msg.includes("connect")) return `Error: Conexion rechazada. Habilita API: /ip service enable api`;
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) return `Error: Timeout. Verifica IP y puerto 8728.`;
  if (msg.includes("login") || msg.includes("auth") || msg.includes("password")) return `Error: Autenticacion fallida.`;
  if (msg.includes("CERT") || msg.includes("certificate") || msg.includes("SSL")) return `Error: SSL/TLS. Usa puerto 8728 sin SSL.`;
  if (msg.includes("EHOSTUNREACH") || msg.includes("ENETUNREACH")) return `Error: Host inalcanzable.`;
  if (msg.includes("ECONNRESET")) return `Error: Conexion reiniciada.`;
  return `Error: ${msg}`;
}

export async function testConnection(
  config: MikroTikConfig
): Promise<{ success: boolean; error?: string; identity?: string; version?: string; board?: string }> {
  let conn: RouterOSAPI | null = null;
  try {
    conn = createConnection(config);
    await conn.connect();
    const identityRes = await conn.write("/system/identity/print");
    const identity = identityRes?.[0]?.name || "MikroTik";
    const resourceRes = await conn.write("/system/resource/print");
    const version = resourceRes?.[0]?.version || "unknown";
    const board = resourceRes?.[0]?.["board-name"] || "unknown";
    setCachedRouterVersion(version);
    console.log(`[MikroTik] Conexion exitosa: ${identity} | RouterOS ${version} | ${board}`);
    await conn.close();
    return { success: true, identity, version, board };
  } catch (err) {
    if (conn) { try { conn.close(); } catch { /* */ } }
    return { success: false, error: parseError(err) };
  }
}

export async function executeCommand(
  command: string,
  params: string[] = []
): Promise<{ success: boolean; result?: unknown[]; error?: string }> {
  const config = loadMikroTikConfig();
  if (!config) return { success: false, error: "No hay configuracion guardada" };
  let conn: RouterOSAPI | null = null;
  try {
    conn = createConnection(config);
    await conn.connect();
    const result = params.length > 0 ? await conn.write(command, params) : await conn.write(command);
    await conn.close();
    markMikroTikConnected();
    return { success: true, result };
  } catch (err) {
    if (conn) { try { conn.close(); } catch { /* */ } }
    return { success: false, error: parseError(err) };
  }
}

export async function fetchRealRouterData(): Promise<{
  interfaces: unknown[];
  health: unknown;
  bgpSessions: unknown[];
  ospfNeighbors: unknown[];
  error?: string;
} | null> {
  const config = loadMikroTikConfig();
  if (!config) return null;

  let conn: RouterOSAPI | null = null;
  const now = Date.now();

  try {
    conn = createConnection(config);
    await conn.connect();

    // System resources
    const resources = await conn.write("/system/resource/print");
    const res = resources[0] || {};
    const versionStr: string = res.version || "7.0";
    const routerVersion = detectVersion(versionStr);
    setCachedRouterVersion(versionStr);

    // Identity
    const identity = await conn.write("/system/identity/print");
    const boardName = identity?.[0]?.name || "MikroTik";

    // Interfaces
    const ifaceData = await conn.write("/interface/print");
    const ifaceList = ifaceData || [];

    // Calculate smoothed rates from byte counter deltas
    const interfaces = ifaceList.map((i: Record<string, string>) => {
      const name = i.name;
      const rxBytes = parseInt(i["rx-byte"] || "0", 10);
      const txBytes = parseInt(i["tx-byte"] || "0", 10);
      const isRunning = i.running === "true";

      let rxRate = 0;
      let txRate = 0;

      if (isRunning && byteCache[name]) {
        const prev = byteCache[name];
        const dt = (now - prev.timestamp) / 1000;

        if (dt >= 1 && dt < 60) {
          const rxDelta = rxBytes - prev.rxBytes;
          const txDelta = txBytes - prev.txBytes;

          if (rxDelta >= 0 && txDelta >= 0) {
            const instantRx = (rxDelta * 8) / dt;
            const instantTx = (txDelta * 8) / dt;

            // Exponential moving average - smooths out spikes
            rxRate = Math.round(prev.rxRateSmooth + SMOOTHING * (instantRx - prev.rxRateSmooth));
            txRate = Math.round(prev.txRateSmooth + SMOOTHING * (instantTx - prev.txRateSmooth));
          }
        }
      }

      // Update cache
      byteCache[name] = {
        rxBytes,
        txBytes,
        timestamp: now,
        rxRateSmooth: rxRate,
        txRateSmooth: txRate,
      };

      return {
        name,
        type: i.type || "ether",
        status: (isRunning ? "up" : "down") as "up" | "down",
        rxBytes,
        txBytes,
        rxRate,
        txRate,
        comment: i.comment || undefined,
      };
    });

    // Log only interfaces with traffic
    for (const iface of interfaces) {
      if (iface.status === "up" && (iface.rxRate > 0 || iface.txRate > 0)) {
        console.log(`[MikroTik] ${iface.name}: RX ${formatBps(iface.rxRate)} / TX ${formatBps(iface.txRate)}`);
      }
    }

    const health = {
      cpuLoad: parseInt(res["cpu-load"] || "0", 10),
      freeMemory: parseInt(res["free-memory"] || "0", 10),
      totalMemory: parseInt(res["total-memory"] || "0", 10),
      uptime: res.uptime || "0s",
      temperature: parseInt(res.temperature || "0", 10),
      voltage: parseFloat(res.voltage || "0"),
      boardName,
      routerOsVersion: versionStr,
      architecture: res["architecture-name"] || res.architecture || "unknown",
    };

    // BGP - v6 vs v7
    let bgpSessions: unknown[] = [];
    try {
      if (routerVersion === 6) {
        const bgpData = await conn.write("/routing/bgp/peer/print");
        bgpSessions = (bgpData || []).map((s: Record<string, string>) => ({
          name: s.name || s["remote-address"] || "unknown",
          remoteAddress: s["remote-address"] || "",
          status: (s.state || s.status || "idle").toLowerCase(),
          prefixCount: parseInt(s["prefix-count"] || "0", 10),
          uptime: s.uptime || "0s",
          remoteAs: parseInt(s["remote-as"] || "0", 10),
        }));
      } else {
        const bgpData = await conn.write("/routing/bgp/session/print");
        bgpSessions = (bgpData || []).map((s: Record<string, string>) => ({
          name: s.name || s["remote-address"] || "unknown",
          remoteAddress: s["remote-address"] || "",
          status: (s.state || "idle").toLowerCase(),
          prefixCount: parseInt(s["prefix-count"] || "0", 10),
          uptime: s.uptime || "0s",
          remoteAs: parseInt(s["remote-as"] || "0", 10),
        }));
      }
    } catch { /* BGP not configured */ }

    // OSPF
    let ospfNeighbors: unknown[] = [];
    try {
      const ospfData = await conn.write("/routing/ospf/neighbor/print");
      ospfNeighbors = (ospfData || []).map((n: Record<string, string>) => ({
        identity: n["neighbor-id"] || "unknown",
        address: n.address || "",
        state: n.state || "Down",
        interface: n.interface || "",
        priority: parseInt(n.priority || "0", 10),
      }));
    } catch { /* OSPF not configured */ }

    await conn.close();
    markMikroTikConnected();

    return { interfaces, health, bgpSessions, ospfNeighbors };
  } catch (err) {
    if (conn) { try { conn.close(); } catch { /* */ } }
    const errorMsg = parseError(err);
    console.log(`[MikroTik] fetchRealRouterData fallo: ${errorMsg}`);
    return { interfaces: [], health: null, bgpSessions: [], ospfNeighbors: [], error: errorMsg };
  }
}

// Format bits per second like Winbox does: "12.5 Mbps", "1.2 kbps", "500 bps"
function formatBps(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}
