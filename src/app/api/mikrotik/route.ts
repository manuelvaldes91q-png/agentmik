import { NextResponse } from "next/server";
import { saveConfig, validateConfig } from "@/lib/mikrotik/connection";

export async function POST(request: Request) {
  try {
    const { action, config } = await request.json();

    if (action === "save" && config) {
      saveConfig("default", config);
      return NextResponse.json({ success: true, message: "Configuration saved" });
    }

    if (action === "test" && config) {
      const errors = validateConfig(config);
      if (errors.length > 0) {
        return NextResponse.json({ success: false, error: errors.join(", ") });
      }

      return NextResponse.json({
        success: false,
        error: "Cannot connect to real MikroTik in this environment. Configuration is valid - configure a real router connection in production.",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ready",
    message: "MikroTik API proxy is running",
    note: "Configure connection in /settings to connect to a real router",
  });
}
