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

// Cache de contadores de bytes para calcular tasas
interface ByteCounter {
  rxBytes: number;
  txBytes: number;
  timestamp: number;
}
const byteCache: Record<string, ByteCounter> = {};

function parseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  console.log(`[MikroTik] Error: ${msg}`);

  if (msg.includes("ECONNREFUSED") || msg.includes("connect")) {
    return `Error: Conexion rechazada (puerto cerrado o API deshabilitada). Habilita: /ip service enable api`;
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
    return `Error: Timeout de conexion. Verifica IP y puerto 8728.`;
  }
  if (msg.includes("login") || msg.includes("auth") || msg.includes("password") || msg.includes("invalid")) {
    return `Error: Autenticacion fallida. Verifica usuario/contrasena.`;
  }
  if (msg.includes("CERT") || msg.includes("certificate") || msg.includes("SSL")) {
    return `Error: SSL/TLS invalido. Usa puerto 8728 sin SSL.`;
  }
  if (msg.includes("EHOSTUNREACH") || msg.includes("ENETUNREACH")) {
    return `Error: Host o red inalcanzable.`;
  }
  if (msg.includes("ECONNRESET")) {
    return `Error: Conexion reiniciada por el router.`;
  }
  return `Error de conexion: ${msg}`;
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
    console.log(`[MikroTik] Conexion exitosa: ${identity} | RouterOS ${version} | Board: ${board}`);

    await conn.close();
    return { success: true, identity, version, board };
  } catch (err) {
    if (conn) { try { conn.close(); } catch { /* */ } }
    return { success: false, error: parseError(err) };
  }
}

export async function executeCommand(
  command: string
): Promise<{ success: boolean; result?: unknown[]; error?: string }> {
  const config = loadMikroTikConfig();
  if (!config) {
    return { success: false, error: "No hay configuracion de MikroTik guardada" };
  }

  let conn: RouterOSAPI | null = null;

  try {
    conn = createConnection(config);
    await conn.connect();
    const result = await conn.write(command);
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
    console.log(`[MikroTik] Conectado a ${config.ip}:${config.port}`);

    // Fetch resources
    const resources = await conn.write("/system/resource/print");
    const res = resources[0] || {};
    const versionStr: string = res.version || "7.0";
    const routerVersion = detectVersion(versionStr);

    setCachedRouterVersion(versionStr);

    // Fetch identity
    const identity = await conn.write("/system/identity/print");
    const boardName = identity?.[0]?.name || "MikroTik";

    console.log(`[MikroTik] ${boardName} | RouterOS ${versionStr} | v${routerVersion}`);

    // Fetch interfaces with byte counters (works on v6 and v7)
    const ifaceData = await conn.write("/interface/print");
    const ifaceList = ifaceData || [];

    const activeCount = ifaceList.filter((i: Record<string, string>) => i.running === "true").length;
    console.log(`[MikroTik] Interfaces: ${ifaceList.length} total, ${activeCount} activas`);

    // Calculate rates from byte counter deltas
    const interfaces = ifaceList.map((i: Record<string, string>) => {
      const name = i.name;
      const rxBytes = parseInt(i["rx-byte"] || "0", 10);
      const txBytes = parseInt(i["tx-byte"] || "0", 10);
      const isRunning = i.running === "true";

      let rxRate = 0;
      let txRate = 0;

      if (isRunning && byteCache[name]) {
        const prev = byteCache[name];
        const timeDeltaSec = (now - prev.timestamp) / 1000;

        if (timeDeltaSec > 0 && timeDeltaSec < 30) {
          // Only calculate if delta is reasonable (< 30s)
          const rxDelta = rxBytes - prev.rxBytes;
          const txDelta = txBytes - prev.txBytes;

          if (rxDelta >= 0) rxRate = Math.round((rxDelta * 8) / timeDeltaSec); // bits per second
          if (txDelta >= 0) txRate = Math.round((txDelta * 8) / timeDeltaSec);
        }
      }

      // Update cache
      byteCache[name] = { rxBytes, txBytes, timestamp: now };

      if (isRunning && (rxRate > 0 || txRate > 0)) {
        console.log(`[MikroTik] ${name}: RX ${(rxRate / 1000000).toFixed(2)} Mbps / TX ${(txRate / 1000000).toFixed(2)} Mbps`);
      }

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

    // BGP sessions - v6 vs v7
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

    // OSPF neighbors - same for v6 and v7
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

    console.log(`[MikroTik] Datos OK: CPU ${health.cpuLoad}%, ${activeCount} interfaces activas`);
    return { interfaces, health, bgpSessions, ospfNeighbors };
  } catch (err) {
    if (conn) { try { conn.close(); } catch { /* */ } }
    const errorMsg = parseError(err);
    console.log(`[MikroTik] fetchRealRouterData fallo: ${errorMsg}`);
    return { interfaces: [], health: null, bgpSessions: [], ospfNeighbors: [], error: errorMsg };
  }
}
