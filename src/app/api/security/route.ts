import { NextResponse } from "next/server";
import {
  startLogIngestion,
  stopLogIngestion,
  getIngestionStatus,
  onLogsReceived,
  generateSimulatedLogs,
} from "@/lib/mikrotik/log-ingestion";
import {
  analyzeLogs,
  getAnalysisStatus,
} from "@/lib/mikrotik/security-analyzer";
import {
  getSecurityEvents,
  getActiveSecurityEvents,
  getSecurityStats,
  updateSecurityEventStatus,
  cleanupOldSecurityEvents,
} from "@/lib/mikrotik/db";

let autoStarted = false;
let analysisAttached = false;

function ensureEngineStarted(): void {
  if (!autoStarted) {
    autoStarted = true;
    startLogIngestion();
  }
  if (!analysisAttached) {
    analysisAttached = true;
    onLogsReceived((entries) => {
      analyzeLogs(entries);
    });
  }
}

export async function GET(request: Request) {
  try {
    ensureEngineStarted();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "events") {
      const status = searchParams.get("status");
      const events =
        status === "active"
          ? getActiveSecurityEvents()
          : getSecurityEvents(50);
      return NextResponse.json({ success: true, events });
    }

    if (action === "analysis") {
      const analysisStatus = getAnalysisStatus();
      return NextResponse.json({ success: true, ...analysisStatus });
    }

    // Default: return stats + ingestion status
    const stats = getSecurityStats();
    const ingestion = getIngestionStatus();

    return NextResponse.json({
      success: true,
      ...stats,
      ingestion,
      lastAnalysis: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to get security data" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    ensureEngineStarted();

    const body = await request.json();

    if (body.command === "start") {
      startLogIngestion();
      return NextResponse.json({ success: true, message: "Log ingestion started" });
    }

    if (body.command === "stop") {
      stopLogIngestion();
      return NextResponse.json({ success: true, message: "Log ingestion stopped" });
    }

    if (body.command === "analyze-now") {
      const entries = generateSimulatedLogs();
      const events = analyzeLogs(entries);
      return NextResponse.json({
        success: true,
        newEvents: events.length,
        events,
      });
    }

    if (body.command === "update-event" && body.eventId && body.status) {
      updateSecurityEventStatus(body.eventId, body.status);
      return NextResponse.json({ success: true });
    }

    if (body.command === "cleanup") {
      cleanupOldSecurityEvents();
      return NextResponse.json({ success: true, message: "Old events cleaned up" });
    }

    return NextResponse.json(
      { success: false, error: "Unknown command" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to execute command" },
      { status: 500 }
    );
  }
}
