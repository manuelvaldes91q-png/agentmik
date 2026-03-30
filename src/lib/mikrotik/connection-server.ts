import type { MikroTikConfig } from "@/lib/types";
import { RouterOSAPI } from "node-routeros";
import { saveMikroTikConfig, loadMikroTikConfig, markMikroTikConnected } from "./db";

export async function testConnection(config: MikroTikConfig): Promise<{ success: boolean; error?: string; identity?: string }> {
  try {
    const conn = new RouterOSAPI({
      host: config.ip,
      port: config.port,
      user: config.username,
      password: config.password,
      timeout: 10,
      tls: config.useSsl ? {} : undefined,
    });

    await conn.connect();
    const identity = await conn.write("/system/identity/print");
    await conn.close();

    return { success: true, identity: identity?.[0]?.name || "MikroTik" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de conexion desconocido";
    return { success: false, error: msg };
  }
}

export { saveMikroTikConfig, loadMikroTikConfig, markMikroTikConnected };
