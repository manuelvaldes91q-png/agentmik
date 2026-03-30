import type { MikroTikConfig } from "@/lib/types";
import { RouterOSAPI } from "node-routeros";
import { loadMikroTikConfig, markMikroTikConnected } from "./db";

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

function parseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("ECONNREFUSED") || msg.includes("connect")) {
    return `Conexion rechazada. Verifica que el servicio API este habilitado: /ip service enable api`;
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
    return `Timeout de conexion. Verifica que la IP sea alcanzable y el puerto este abierto en el firewall.`;
  }
  if (msg.includes("login") || msg.includes("auth") || msg.includes("password") || msg.includes("invalid")) {
    return `Autenticacion fallida. Verifica usuario y contrasena: /user group set read policy=api,read,test`;
  }
  if (msg.includes("CERT") || msg.includes("certificate") || msg.includes("SSL")) {
    return `Error SSL/TLS. Verifica el certificado o deshabilita SSL.`;
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
  debugInfo?: Record<string, unknown>;
} | null> {
  const config = loadMikroTikConfig();
  if (!config) return null;

  let conn: RouterOSAPI | null = null;

  try {
    conn = createConnection(config);
    await conn.connect();

    // Fetch resources
    const resources = await conn.write("/system/resource/print");
    const res = resources[0] || {};
    const versionStr: string = res.version || "7.0";
    const routerVersion = detectVersion(versionStr);

    // Fetch identity
    const identity = await conn.write("/system/identity/print");
    const boardName = identity?.[0]?.name || "MikroTik";

    // Fetch interfaces - works the same on v6 and v7
    const ifaceData = await conn.write("/interface/print");
    const ifaceList = ifaceData || [];

    // Get real-time rates via monitor-traffic for active interfaces
    const ratesMap: Record<string, { rxRate: number; txRate: number }> = {};
    for (const iface of ifaceList) {
      if (iface.running === "true") {
        try {
          const mon = await conn.write("/interface/monitor-traffic", [
            `=numbers=${iface[".id"]}`,
            "=once=",
          ]);
          if (mon && mon[0]) {
            ratesMap[iface.name] = {
              rxRate: parseInt(mon[0]["rx-bits-per-second"] || "0", 10),
              txRate: parseInt(mon[0]["tx-bits-per-second"] || "0", 10),
            };
          }
        } catch {
          // monitor-traffic may fail for some interface types
        }
      }
    }

    const interfaces = ifaceList.map((i: Record<string, string>) => {
      const rates = ratesMap[i.name] || { rxRate: 0, txRate: 0 };
      return {
        name: i.name,
        type: i.type || "ether",
        status: (i.running === "true" ? "up" : "down") as "up" | "down",
        rxBytes: parseInt(i["rx-byte"] || "0", 10),
        txBytes: parseInt(i["tx-byte"] || "0", 10),
        rxRate: rates.rxRate || parseInt(i["rx-bits-per-second"] || "0", 10),
        txRate: rates.txRate || parseInt(i["tx-bits-per-second"] || "0", 10),
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

    // BGP sessions - v6 vs v7 differ
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

    // OSPF neighbors - same command for v6 and v7
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
    return { interfaces: [], health: null, bgpSessions: [], ospfNeighbors: [], error: parseError(err) };
  }
}
