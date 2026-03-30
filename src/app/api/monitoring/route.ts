import { NextResponse } from "next/server";
import {
  startMonitoring,
  stopMonitoring,
  getMonitoringStatus,
} from "@/lib/mikrotik/monitoring";
import { getRecentSnapshots, getPendingActions, getActionLog } from "@/lib/mikrotik/db";

let autoStarted = false;

function ensureMonitoringStarted(): void {
  if (!autoStarted) {
    autoStarted = true;
    startMonitoring();
  }
}

export async function GET(request: Request) {
  try {
    ensureMonitoringStarted();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "snapshots") {
      const limit = parseInt(searchParams.get("limit") || "60", 10);
      const snapshots = getRecentSnapshots(limit);
      return NextResponse.json({ success: true, snapshots });
    }

    if (action === "actions") {
      const pending = getPendingActions();
      const log = getActionLog(20);
      return NextResponse.json({ success: true, pending, log });
    }

    const status = getMonitoringStatus();
    return NextResponse.json({ success: true, ...status });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to get monitoring data" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { command } = await request.json();

    if (command === "start") {
      startMonitoring();
      return NextResponse.json({ success: true, message: "Monitoring started" });
    }

    if (command === "stop") {
      stopMonitoring();
      return NextResponse.json({ success: true, message: "Monitoring stopped" });
    }

    return NextResponse.json({ success: false, error: "Unknown command" }, { status: 400 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to control monitoring" },
      { status: 500 }
    );
  }
}
