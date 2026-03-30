import { NextResponse } from "next/server";
import { testConnection, executeCommand, fetchRealRouterData } from "@/lib/mikrotik/connection-server";
import { validateConfig } from "@/lib/mikrotik/connection";
import { saveMikroTikConfig, loadMikroTikConfig, deleteMikroTikConfig, clearAllSimulatedData } from "@/lib/mikrotik/db";

export async function POST(request: Request) {
  try {
    const { action, config, command } = await request.json();

    if (action === "save" && config) {
      const errors = validateConfig(config);
      if (errors.length > 0) {
        return NextResponse.json({ success: false, error: errors.join(", ") });
      }

      saveMikroTikConfig(config);
      return NextResponse.json({ success: true, message: "Configuracion guardada" });
    }

    if (action === "test" && config) {
      const errors = validateConfig(config);
      if (errors.length > 0) {
        return NextResponse.json({ success: false, error: errors.join(", ") });
      }

      const result = await testConnection(config);
      if (result.success) {
        return NextResponse.json({
          success: true,
          message: `Conexion exitosa. Router: ${result.identity} | RouterOS: ${result.version} | Board: ${result.board}`,
          identity: result.identity,
          version: result.version,
          board: result.board,
        });
      }
      return NextResponse.json({
        success: false,
        error: result.error,
      });
    }

    if (action === "execute" && command) {
      const result = await executeCommand(command);
      return NextResponse.json(result);
    }

    if (action === "delete") {
      deleteMikroTikConfig();
      return NextResponse.json({ success: true, message: "Configuracion eliminada" });
    }

    if (action === "fetch-data") {
      const routerData = await fetchRealRouterData();
      if (routerData && !routerData.error) {
        return NextResponse.json({ success: true, interfaces: routerData.interfaces, health: routerData.health, bgpSessions: routerData.bgpSessions, ospfNeighbors: routerData.ospfNeighbors });
      }
      return NextResponse.json({ success: false, error: routerData?.error || "No se pudo obtener datos del router. Verifica la configuracion en /settings" });
    }

    if (action === "flush-cache") {
      clearAllSimulatedData();
      return NextResponse.json({ success: true, message: "Cache limpiada. Todos los datos simulados eliminados." });
    }

    if (action === "test-saved") {
      const savedConfig = loadMikroTikConfig();
      if (!savedConfig) {
        return NextResponse.json({ success: false, error: "No hay configuracion guardada" });
      }
      const result = await testConnection(savedConfig);
      if (result.success) {
        return NextResponse.json({
          success: true,
          message: `Conexion exitosa. Router: ${result.identity} | RouterOS: ${result.version}`,
        });
      }
      return NextResponse.json({ success: false, error: result.error });
    }

    return NextResponse.json({ error: "Accion invalida" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno del servidor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const config = loadMikroTikConfig();
    if (config) {
      return NextResponse.json({
        status: "configured",
        alias: config.alias,
        host: config.ip,
        port: config.port,
        username: config.username,
        useSsl: config.useSsl,
        lastConnected: config.lastConnected,
      });
    }
    return NextResponse.json({
      status: "not-configured",
      message: "Configurar conexion en /settings",
    });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
