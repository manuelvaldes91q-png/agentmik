import type { MikroTikConfig } from "@/lib/types";
import { RouterOSAPI } from "node-routeros";
import { loadMikroTikConfig, markMikroTikConnected } from "./db";

export async function testConnection(
  config: MikroTikConfig
): Promise<{ success: boolean; error?: string; identity?: string; version?: string; board?: string }> {
  let conn: RouterOSAPI | null = null;

  try {
    conn = new RouterOSAPI({
      host: config.ip,
      port: config.port,
      user: config.username,
      password: config.password,
      timeout: 15,
      tls: config.useSsl ? {} : undefined,
    });

    await conn.connect();

    // Get identity
    const identityRes = await conn.write("/system/identity/print");
    const identity = identityRes?.[0]?.name || "MikroTik";

    // Get system resource
    const resourceRes = await conn.write("/system/resource/print");
    const version = resourceRes?.[0]?.version || "unknown";
    const board = resourceRes?.[0]?.["board-name"] || "unknown";

    await conn.close();

    return { success: true, identity, version, board };
  } catch (err) {
    if (conn) {
      try { conn.close(); } catch { /* */ }
    }

    const msg = err instanceof Error ? err.message : String(err);

    // Provide helpful error messages
    if (msg.includes("ECONNREFUSED") || msg.includes("connect")) {
      return {
        success: false,
        error: `Conexion rechazada por ${config.ip}:${config.port}. Verifica que el servicio API este habilitado: /ip service enable api`,
      };
    }
    if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
      return {
        success: false,
        error: `Timeout conectando a ${config.ip}:${config.port}. Verifica que la IP sea alcanzable y el puerto ${config.port} este abierto en el firewall.`,
      };
    }
    if (msg.includes("login") || msg.includes("auth") || msg.includes("password") || msg.includes("invalid")) {
      return {
        success: false,
        error: `Autenticacion fallida. Verifica usuario y contrasena. El usuario debe tener permisos de API: /user group set read policy=api,read,test`,
      };
    }
    if (msg.includes("CERT") || msg.includes("certificate") || msg.includes("SSL")) {
      return {
        success: false,
        error: `Error SSL/TLS. Si usas API-SSL, verifica que el certificado sea valido o deshabilita SSL.`,
      };
    }

    return { success: false, error: `Error de conexion: ${msg}` };
  }
}

// Execute a command on the real router
export async function executeCommand(
  command: string
): Promise<{ success: boolean; result?: unknown[]; error?: string }> {
  const config = loadMikroTikConfig();
  if (!config) {
    return { success: false, error: "No hay configuracion de MikroTik guardada" };
  }

  let conn: RouterOSAPI | null = null;

  try {
    conn = new RouterOSAPI({
      host: config.ip,
      port: config.port,
      user: config.username,
      password: config.password,
      timeout: 15,
      tls: config.useSsl ? {} : undefined,
    });

    await conn.connect();
    const result = await conn.write(command);
    await conn.close();

    markMikroTikConnected();
    return { success: true, result };
  } catch (err) {
    if (conn) {
      try { conn.close(); } catch { /* */ }
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// Fetch real router data
export async function fetchRealRouterData(): Promise<{
  interfaces: unknown[];
  health: unknown;
  bgpSessions: unknown[];
  ospfNeighbors: unknown[];
} | null> {
  const config = loadMikroTikConfig();
  if (!config) return null;

  let conn: RouterOSAPI | null = null;

  try {
    conn = new RouterOSAPI({
      host: config.ip,
      port: config.port,
      user: config.username,
      password: config.password,
      timeout: 15,
      tls: config.useSsl ? {} : undefined,
    });

    await conn.connect();

    // Fetch resources
    const resources = await conn.write("/system/resource/print");
    const res = resources[0] || {};

    // Fetch identity
    const identity = await conn.write("/system/identity/print");
    const boardName = identity?.[0]?.name || "MikroTik";

    // Fetch interfaces
    const ifaceData = await conn.write("/interface/print");
    const interfaces = (ifaceData || []).map((i: Record<string, string>) => ({
      name: i.name,
      type: i.type || "ether",
      status: (i.running === "true" ? "up" : "down") as "up" | "down",
      rxBytes: parseInt(i["rx-byte"] || "0", 10),
      txBytes: parseInt(i["tx-byte"] || "0", 10),
      rxRate: parseInt(i["rx-bits-per-second"] || "0", 10),
      txRate: parseInt(i["tx-bits-per-second"] || "0", 10),
      comment: i.comment || undefined,
    }));

    const health = {
      cpuLoad: parseInt(res["cpu-load"] || "0", 10),
      freeMemory: parseInt(res["free-memory"] || "0", 10),
      totalMemory: parseInt(res["total-memory"] || "0", 10),
      uptime: res.uptime || "0s",
      temperature: parseInt(res.temperature || "0", 10),
      voltage: parseFloat(res.voltage || "0"),
      boardName,
      routerOsVersion: res.version || "unknown",
      architecture: res["architecture-name"] || "unknown",
    };

    // BGP sessions
    let bgpSessions: unknown[] = [];
    try {
      const bgpData = await conn.write("/routing/bgp/session/print");
      bgpSessions = (bgpData || []).map((s: Record<string, string>) => ({
        name: s.name || s["remote-address"] || "unknown",
        remoteAddress: s["remote-address"] || "",
        status: (s.state || "idle").toLowerCase(),
        prefixCount: parseInt(s["prefix-count"] || "0", 10),
        uptime: s.uptime || "0s",
        remoteAs: parseInt(s["remote-as"] || "0", 10),
      }));
    } catch { /* BGP not configured */ }

    // OSPF neighbors
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
    if (conn) {
      try { conn.close(); } catch { /* */ }
    }
    return null;
  }
}
