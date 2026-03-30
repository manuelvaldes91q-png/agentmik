import { NextResponse } from "next/server";
import { testConnection } from "@/lib/mikrotik/connection-server";
import { validateConfig } from "@/lib/mikrotik/connection";
import { saveMikroTikConfig, loadMikroTikConfig } from "@/lib/mikrotik/db";

export async function POST(request: Request) {
  try {
    const { action, config } = await request.json();

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
          message: `Conexion exitosa. Router: ${result.identity}`,
        });
      }
      return NextResponse.json({
        success: false,
        error: result.error || "No se pudo conectar al router",
      });
    }

    return NextResponse.json({ error: "Accion invalida" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
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
