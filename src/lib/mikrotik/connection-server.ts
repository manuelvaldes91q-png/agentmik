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

function parseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const raw = err instanceof Error ? err.stack || err.message : String(err);

  console.log(`[MikroTik] Error de conexion: ${raw}`);

  if (msg.includes("ECONNREFUSED") || msg.includes("connect")) {
    return `Error: Conexion rechazada (puerto cerrado o API deshabilitada). Habilita el servicio API: /ip service enable api`;
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
    return `Error: Timeout de conexion. Verifica la IP (${msg}) y que el puerto 8728 este abierto en el firewall del router.`;
  }
  if (msg.includes("login") || msg.includes("auth") || msg.includes("password") || msg.includes("invalid")) {
    return `Error: Autenticacion fallida. Verifica usuario/contrasena. El usuario debe tener permisos: /user group set read policy=api,read,test`;
  }
  if (msg.includes("CERT") || msg.includes("certificate") || msg.includes("SSL")) {
    return `Error: SSL/TLS invalido. Si usas puerto 8729, verifica el certificado o usa puerto 8728 sin SSL.`;
  }
  if (msg.includes("EHOSTUNREACH") || msg.includes("ENETUNREACH")) {
    return `Error: Host o red inalcanzable. Verifica la IP del router y la conectividad de red.`;
  }
  if (msg.includes("ECONNRESET")) {
    return `Error: Conexion reiniciada por el router. Posible sobrecarga o reinicio del servicio API.`;
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

    // Cache version for chat engine
    setCachedRouterVersion(version);

    console.log(`[MikroTik] Conexion establecida con exito: ${identity} | RouterOS ${version} | Board: ${board}`);

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
    console.log(`[MikroTik] Conexion establecida con ${config.ip}:${config.port}`);

    // Fetch resources
    const resources = await conn.write("/system/resource/print");
    const res = resources[0] || {};
    const versionStr: string = res.version || "7.0";
    const routerVersion = detectVersion(versionStr);

    // Cache version for chat engine
    setCachedRouterVersion(versionStr);

    // Fetch identity
    const identity = await conn.write("/system/identity/print");
    const boardName = identity?.[0]?.name || "MikroTik";

    console.log(`[MikroTik] Router: ${boardName} | RouterOS ${versionStr} | v${routerVersion}`);

    // Fetch interfaces - works the same on v6 and v7
    const ifaceData = await conn.write("/interface/print");
    const ifaceList = ifaceData || [];

    console.log(`[MikroTik] Interfaces encontradas: ${ifaceList.length} | Activas: ${ifaceList.filter((i: Record<string, string>) => i.running === "true").length}`);

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
            const rxRate = parseInt(mon[0]["rx-bits-per-second"] || "0", 10);
            const txRate = parseInt(mon[0]["tx-bits-per-second"] || "0", 10);
            ratesMap[iface.name] = { rxRate, txRate };
            console.log(`[MikroTik] ${iface.name}: RX ${(rxRate / 1000000).toFixed(2)} Mbps / TX ${(txRate / 1000000).toFixed(2)} Mbps`);
          }
        } catch (monErr) {
          const errMsg = monErr instanceof Error ? monErr.message : String(monErr);
          console.log(`[MikroTik] monitor-traffic fallo para ${iface.name}: ${errMsg}`);
          // Fallback: try /interface print stats for cumulative bytes
          try {
            const statsData = await conn.write("/interface/print", ["=.proplist=name,rx-bits-per-second,tx-bits-per-second", `=numbers=${iface[".id"]}`]);
            if (statsData && statsData[0]) {
              ratesMap[iface.name] = {
                rxRate: parseInt(statsData[0]["rx-bits-per-second"] || "0", 10),
                txRate: parseInt(statsData[0]["tx-bits-per-second"] || "0", 10),
              };
              console.log(`[MikroTik] ${iface.name} (fallback): rates obtenidos de /interface/print`);
            }
          } catch {
            console.log(`[MikroTik] ${iface.name}: no se pudieron obtener rates (sin permisos o interfaz no soportada)`);
          }
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

    const activeCount = interfaces.filter((i: { status: string }) => i.status === "up").length;
    console.log(`[MikroTik] Datos obtenidos: ${interfaces.length} interfaces (${activeCount} activas), CPU: ${health.cpuLoad}%, Memoria: ${((health.totalMemory - health.freeMemory) / health.totalMemory * 100).toFixed(0)}%`);

    return { interfaces, health, bgpSessions, ospfNeighbors };
  } catch (err) {
    if (conn) { try { conn.close(); } catch { /* */ } }
    const errorMsg = parseError(err);
    console.log(`[MikroTik] fetchRealRouterData fallo: ${errorMsg}`);
    return { interfaces: [], health: null, bgpSessions: [], ospfNeighbors: [], error: errorMsg };
  }
}
