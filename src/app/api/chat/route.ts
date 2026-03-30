import { NextResponse } from "next/server";
import { generateAgentResponse, confirmAction } from "@/lib/mikrotik/chat-engine";
import { analyzeRsc } from "@/lib/mikrotik/analyzer";
import { getPendingActions } from "@/lib/mikrotik/db";
import { detectDiagnosticIntent, runDiagnostic } from "@/lib/mikrotik/diagnostics";
import type { MonitoringAlert } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Handle action confirmation
    if (body.actionId && body.confirm !== undefined) {
      const result = confirmAction(body.actionId, body.confirm === true || body.confirm === "true");
      return NextResponse.json(result);
    }

    const { message, monitoringAlert } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Check if user wants a real diagnostic
    const diagnosticIntent = detectDiagnosticIntent(message);
    if (diagnosticIntent) {
      console.log(`[Chat] Diagnostico detectado: ${diagnosticIntent} para mensaje: "${message}"`);
      const result = await runDiagnostic(diagnosticIntent);

      let responseText = `## Diagnostico: ${result.category}\n\n`;
      responseText += `**Severidad:** ${result.severity.toUpperCase()}\n\n`;
      responseText += `**Hallazgos:**\n`;
      for (const f of result.findings) {
        responseText += `- ${f}\n`;
      }
      responseText += `\n**Solucion:**\n${result.solution}`;

      if (result.commands.length > 0) {
        responseText += `\n\n**Comandos ejecutados:**\n`;
        for (const cmd of result.commands) {
          responseText += `\`${cmd}\`\n`;
        }
      }

      return NextResponse.json({
        cotSteps: [{
          label: "Diagnostico en vivo",
          content: `Ejecutado diagnostico de ${result.category} en tu router. ${result.findings.length} hallazgos encontrados.`,
          type: "analysis",
        }],
        response: responseText,
        proposedAction: null,
        references: [],
        monitoringAlert: null,
        diagnostic: result,
      });
    }

    // Standard AI response
    const alert: MonitoringAlert | null = monitoringAlert || null;
    const response = generateAgentResponse(message, alert);
    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[Chat] Error: ${msg}`);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { content, filename } = await request.json();

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const result = analyzeRsc(content, filename || "config.rsc");
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const actions = getPendingActions();
    return NextResponse.json({ success: true, actions });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to get actions" }, { status: 500 });
  }
}
