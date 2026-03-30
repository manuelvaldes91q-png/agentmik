import { searchKnowledge } from "@/docs/knowledge-base";
import { generateConfigSuggestion } from "./analyzer";
import { getVectorStore } from "@/lib/ingestion/vector-store";
import {
  findSimilarIncidents,
  getRecentIncidents,
  saveIncident,
  recordMemoryPattern,
  savePendingAction,
} from "./db";
import type {
  AgentResponse,
  CoTStep,
  ProposedAction,
  MonitoringAlert,
  Incident,
} from "@/lib/types";

const SENIOR_ENGINEER_PERSONA = `You are a Senior Network Engineer with MTCNA, MTCRE, and MTCINE certifications.
You manage production MikroTik infrastructure for ISPs and enterprises.
Your tone is direct, technical, and analytical. You do not use pleasantries.
You reason through problems methodically before proposing solutions.
If asked to do something that compromises network security, you refuse and explain why, then propose a secure alternative.
You are equally proficient in RouterOS v6 and v7. When the router version is known, adapt your commands accordingly.
Key v6/v7 differences you must know:
- BGP: v6 uses /routing bgp peer, v7 uses /routing bgp session
- Routing: v6 uses /routing filter, v7 uses /routing/route/rules
- OSPF: similar syntax but v6 uses /routing ospf instance, v7 path differs
- Interface stats: both use /interface/print with rx-bits-per-second and tx-bits-per-second
- Always specify which version your advice applies to`;

function generateId(): string {
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function analyzeRisk(command: string): {
  riskLevel: "low" | "medium" | "high";
  reversible: boolean;
  revertCommand?: string;
} {
  const cmd = command.toLowerCase();

  if (
    cmd.includes("/system reboot") ||
    cmd.includes("/system shutdown") ||
    cmd.includes("reset-configuration") ||
    cmd.includes("remove numbers")
  ) {
    return { riskLevel: "high", reversible: false };
  }

  if (
    cmd.includes("/ip firewall filter") ||
    cmd.includes("/ip firewall nat") ||
    cmd.includes("/routing bgp") ||
    cmd.includes("/routing ospf") ||
    cmd.includes("/interface disable") ||
    cmd.includes("=disabled=yes")
  ) {
    return { riskLevel: "medium", reversible: true, revertCommand: "Manual revert required" };
  }

  if (cmd.includes("/ip firewall raw") || cmd.includes("/queue") || cmd.includes("/ip address")) {
    return { riskLevel: "low", reversible: true };
  }

  return { riskLevel: "low", reversible: true };
}

function generateCommand(query: string): string | null {
  const lower = query.toLowerCase();

  if (lower.includes("firewall") && (lower.includes("add") || lower.includes("create") || lower.includes("block"))) {
    return `/ip firewall filter add action=drop chain=input in-interface-list=WAN comment="Added by Sentinel"`;
  }

  if (lower.includes("bgp") && (lower.includes("enable") || lower.includes("activate"))) {
    return `/routing bgp connection set [find name~"peer"] disabled=no`;
  }

  if (lower.includes("nat") && (lower.includes("add") || lower.includes("create") || lower.includes("masquerade"))) {
    return `/ip firewall nat add action=masquerade chain=srcnat out-interface-list=WAN comment="Sentinel NAT rule"`;
  }

  if (lower.includes("queue") && (lower.includes("add") || lower.includes("limit"))) {
    return `/queue simple add max-limit=10M/20M name=sentinel-limited target=192.168.1.0/24`;
  }

  if (lower.includes("backup") || lower.includes("export")) {
    return `/export file=sentinel-backup`;
  }

  return null;
}

export function generateAgentResponse(
  userMessage: string,
  monitoringContext?: MonitoringAlert | null
): AgentResponse {
  const lowerMessage = userMessage.toLowerCase();

  // Greeting
  if (lowerMessage.match(/^(help|hello|hi|hey)\b/)) {
    return {
      cotSteps: [],
      response: `MikroTik Expert Sentinel online. I'm your network operations analyst.

I can handle:
- **Firewall/NAT/Raw** rule design and troubleshooting
- **BGP/OSPF** routing analysis and optimization
- **VPN** deployment (WireGuard, IPsec IKEv2)
- **QoS** queue trees and PCQ configuration
- **VLAN/Bridge** segmentation
- **Security hardening** and threat response
- **Live monitoring** with anomaly detection
- **Command execution** with safety analysis

I run continuous monitoring in the background. If I detect an anomaly, I'll alert you with a proposed fix.

What's the situation?`,
      proposedAction: null,
      references: [],
      monitoringAlert: null,
    };
  }

  const cotSteps: CoTStep[] = [];
  const references: string[] = [];

  // Step 1: Situation Analysis
  cotSteps.push({
    label: "Analisis de Situacion",
    content: buildSituationAnalysis(userMessage, monitoringContext),
    type: "analysis",
  });

  // Step 2: Reasoning - contrast with docs and past incidents
  const docReferences = gatherDocumentation(userMessage);
  const pastIncidents = findSimilarIncidents(
    userMessage,
    classifyQueryType(userMessage)
  );
  const recentIncidents = getRecentIncidents(5);

  cotSteps.push({
    label: "Razonamiento Tecnico",
    content: buildReasoning(userMessage, docReferences, pastIncidents, recentIncidents),
    type: "reasoning",
  });

  // Step 3: Hypothesis
  cotSteps.push({
    label: "Hipotesis",
    content: buildHypothesis(userMessage, monitoringContext, pastIncidents),
    type: "hypothesis",
  });

  // Step 4: Action Proposal
  const proposedCommand = generateCommand(userMessage);
  let proposedAction: ProposedAction | null = null;

  if (proposedCommand && (lowerMessage.includes("add") || lowerMessage.includes("create") || lowerMessage.includes("execute") || lowerMessage.includes("run") || lowerMessage.includes("fix") || lowerMessage.includes("apply"))) {
    const risk = analyzeRisk(proposedCommand);
    proposedAction = {
      id: generateId(),
      command: proposedCommand,
      explanation: buildActionExplanation(userMessage, proposedCommand),
      riskLevel: risk.riskLevel,
      reversible: risk.reversible,
      revertCommand: risk.revertCommand,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    savePendingAction(proposedAction);

    cotSteps.push({
      label: "Propuesta de Accion",
      content: buildActionProposal(proposedCommand, risk),
      type: "action",
    });
  } else {
    cotSteps.push({
      label: "Propuesta de Accion",
      content: "No se requiere accion automatica. Respuesta basada en analisis de documentacion y contexto de red.",
      type: "action",
    });
  }

  // Build final response
  const response = buildFinalResponse(userMessage, docReferences, proposedAction);

  // Add references
  for (const ref of docReferences) {
    if (ref.url) references.push(ref.url);
  }

  // Record incident if this is a problem report
  if (lowerMessage.includes("problem") || lowerMessage.includes("issue") || lowerMessage.includes("down") || lowerMessage.includes("error") || lowerMessage.includes("fail")) {
    const incident: Incident = {
      id: `inc-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      type: classifyQueryType(userMessage),
      description: userMessage,
      resolution: proposedAction ? `Proposed: ${proposedCommand}` : "Analyzed",
      commands: proposedCommand || "",
      resolved: false,
    };
    saveIncident(incident);
    recordMemoryPattern(
      `${classifyQueryType(userMessage)}-${userMessage.toLowerCase().split(/\s+/).slice(0, 3).join("-")}`,
      userMessage
    );
  }

  return {
    cotSteps,
    response,
    proposedAction,
    references,
    monitoringAlert: monitoringContext || null,
  };
}

function buildSituationAnalysis(
  query: string,
  monitoringContext?: MonitoringAlert | null
): string {
  const parts: string[] = [];

  parts.push(`Consulta del operador: "${query}"`);

  if (monitoringContext) {
    parts.push(
      `Alerta activa detectada: [${monitoringContext.severity.toUpperCase()}] ${monitoringContext.title} - ${monitoringContext.detail}`
    );
  }

  parts.push(`Tipo de consulta clasificada: ${classifyQueryType(query)}`);
  parts.push(
    "Revisando estado actual de la red, configuracion activa y documentacion relevante de help.mikrotik.com."
  );

  return parts.join("\n");
}

function buildReasoning(
  query: string,
  docs: Array<{ section: string; text: string; url?: string }>,
  pastIncidents: Array<{ description: string; occurrences: number; resolution: string }>,
  recentIncidents: Incident[]
): string {
  const parts: string[] = [];

  if (docs.length > 0) {
    parts.push(
      `Documentacion relevante encontrada: ${docs.length} fragmento(s) de help.mikrotik.com.`
    );
    parts.push(`Referencia principal: "${docs[0].section}" - ${docs[0].text.slice(0, 200)}...`);
  } else {
    parts.push(
      "No se encontro documentacion crawleada directamente relevante. Aplicando conocimiento estatico de RouterOS v7."
    );
  }

  if (pastIncidents.length > 0) {
    parts.push(
      `\nPatrones historicos encontrados: ${pastIncidents.length} incidente(s) similares.`
    );
    for (const inc of pastIncidents.slice(0, 2)) {
      parts.push(
        `- "${inc.description}" (ocurrencias: ${inc.occurrences}, resolucion previa: ${inc.resolution || "N/A"})`
      );
    }
  }

  if (recentIncidents.length > 0) {
    const unresolved = recentIncidents.filter((i) => !i.resolved);
    if (unresolved.length > 0) {
      parts.push(
        `\nAdvertencia: ${unresolved.length} incidente(s) sin resolver en el historial reciente.`
      );
    }
  }

  return parts.join("\n");
}

function buildHypothesis(
  query: string,
  monitoringContext?: MonitoringAlert | null,
  pastIncidents?: Array<{ description: string; occurrences: number }>
): string {
  const lower = query.toLowerCase();

  if (monitoringContext) {
    if (monitoringContext.severity === "critical") {
      return `Problema critico confirmado por monitoreo: ${monitoringContext.title}.\nCausa mas probable: ${monitoringContext.detail}.\nSe requiere accion inmediata para evitar impacto en produccion.`;
    }
    return `Anomalia detectada por monitoreo: ${monitoringContext.title}.\nPosible causa: ${monitoringContext.detail}.\nSe recomienda investigacion y accion preventiva.`;
  }

  if (pastIncidents && pastIncidents.length > 0 && pastIncidents[0].occurrences > 1) {
    return `Patron recurrente detectado. Este problema ha ocurrido ${pastIncidents[0].occurrences} veces.\nCausa probable: problema intermitente conocido.\nSe recomienda aplicar la resolucion previa o implementar una solucion permanente.`;
  }

  if (lower.includes("bgp")) {
    return "Posible causa: desconexion de sesion BGP por holdtime expirado, filtro de prefijos incorrecto, o problema de conectividad con el peer.\nVerificar: estado de sesion, reglas de firewall en puerto 179/tcp, y anuncios de red.";
  }

  if (lower.includes("cpu") || lower.includes("slow") || lower.includes("lento")) {
    return "Posible causa: saturacion de CPU por procesamiento de reglas firewall ineficientes, ataque DDoS, o proceso nativo consumiendo recursos.\nVerificar: /ip firewall filter orden de reglas, connection tracking, raw rules para bypass.";
  }

  if (lower.includes("packet loss") || lower.includes("perdida") || lower.includes("latency") || lower.includes("latencia")) {
    return "Posible causa: congestion de enlace, errores en interfaz fisica, o saturacion de cola QoS.\nVerificar: /interface ethernet monitor, /queue simple/tree, /tool ping al gateway.";
  }

  if (lower.includes("firewall") || lower.includes("nat")) {
    return "Posible causa: regla mal ordenada, falta de connection-state tracking, o NAT incorrecto.\nVerificar: orden de reglas (established/related primero), logs de firewall.";
  }

  return "Analisis general: verificar logs del sistema (/log print), estado de interfaces, y reglas activas.\nSe requiere informacion adicional para diagnostico preciso.";
}

function buildActionProposal(
  command: string,
  risk: { riskLevel: string; reversible: boolean; revertCommand?: string }
): string {
  const parts: string[] = [];
  parts.push(`Comando propuesto:\n\`\`\`routeros\n${command}\n\`\`\``);
  parts.push(`Nivel de riesgo: ${risk.riskLevel.toUpperCase()}`);
  parts.push(`Reversible: ${risk.reversible ? "Si" : "No"}`);
  if (risk.revertCommand) {
    parts.push(`Comando de reversión: ${risk.revertCommand}`);
  }

  if (risk.riskLevel === "high") {
    parts.push("\n**ADVERTENCIA**: Este comando tiene alto riesgo. Requiere confirmacion explicita.");
  }

  parts.push('\nResponda "OK" para ejecutar, o "cancelar" para descartar.');

  return parts.join("\n");
}

function buildActionExplanation(query: string, command: string): string {
  if (command.includes("firewall filter")) {
    return "Se agrega una regla de firewall para restringir el acceso. La regla se inserta considerando el orden correcto de procesamiento (established/related primero).";
  }
  if (command.includes("bgp")) {
    return "Se modifica la configuracion BGP para resolver el problema de conectividad con el peer. Se mantiene la configuracion de templates existente.";
  }
  if (command.includes("nat")) {
    return "Se agrega regla NAT/masquerade para permitir trafico saliente. Se aplica solo a la interfaz WAN.";
  }
  if (command.includes("queue")) {
    return "Se configura limitacion de ancho de banda mediante queue simple. Se aplica al rango de red especificado.";
  }
  if (command.includes("export")) {
    return "Se genera un backup de la configuracion actual del router.";
  }
  return "Comando generado segun la solicitud del operador.";
}

function buildFinalResponse(
  query: string,
  docs: Array<{ section: string; text: string; url?: string; codeExamples?: string[] }>,
  action: ProposedAction | null
): string {
  const parts: string[] = [];

  if (docs.length > 0) {
    const top = docs[0];
    parts.push(`**${top.section}**\n\n${top.text}`);
    if (top.codeExamples && top.codeExamples.length > 0) {
      for (const code of top.codeExamples) {
        parts.push(`\`\`\`routeros\n${code}\n\`\`\``);
      }
    }
    if (top.url) {
      parts.push(`_Fuente: [MikroTik Docs](${top.url})_`);
    }
  } else {
    // Fallback to static KB
    const entries = searchKnowledge(query);
    if (entries.length > 0) {
      const entry = entries[0];
      parts.push(`**${entry.topic}** (RouterOS ${entry.routerOsVersion})\n\n${entry.content}`);
      if (entry.codeExample) {
        parts.push(`\`\`\`routeros\n${entry.codeExample}\n\`\`\``);
      }
    } else {
      const configSuggestion = generateConfigSuggestion(query);
      if (!configSuggestion.startsWith("I don't have")) {
        parts.push(configSuggestion);
      } else {
        parts.push(
          `No tengo informacion especifica sobre "${query}". Proporcione mas detalles sobre el escenario de red para un diagnostico mas preciso.`
        );
      }
    }
  }

  if (action) {
    parts.push(
      `\n---\n**Accion pendiente** (${action.riskLevel} risk): \`${action.command}\`\nEsperando su confirmacion para ejecutar.`
    );
  }

  return parts.join("\n\n");
}

function gatherDocumentation(
  query: string
): Array<{ section: string; text: string; url?: string; codeExamples?: string[] }> {
  try {
    const results = getVectorStore().search(query, 3);
    if (results.length > 0 && results[0].score > 0.05) {
      return results
        .filter((r) => r.score > 0.03)
        .map((r) => ({
          section: r.chunk.section,
          text: r.chunk.text,
          url: r.chunk.url,
          codeExamples: r.chunk.codeExamples,
        }));
    }
  } catch {
    // Vector store not initialized
  }
  return [];
}

function classifyQueryType(query: string): string {
  const lower = query.toLowerCase();
  if (lower.includes("bgp")) return "bgp";
  if (lower.includes("ospf")) return "ospf";
  if (lower.includes("firewall") || lower.includes("filter")) return "firewall";
  if (lower.includes("nat")) return "nat";
  if (lower.includes("vpn") || lower.includes("wireguard") || lower.includes("ipsec")) return "vpn";
  if (lower.includes("queue") || lower.includes("qos") || lower.includes("bandwidth")) return "qos";
  if (lower.includes("vlan") || lower.includes("bridge")) return "switching";
  if (lower.includes("cpu") || lower.includes("memory") || lower.includes("performance")) return "performance";
  if (lower.includes("dns")) return "dns";
  if (lower.includes("script")) return "scripting";
  return "general";
}

// Handle action confirmation
export function confirmAction(
  actionId: string,
  approved: boolean
): { success: boolean; result: string } {
  const { getPendingActions, updateActionStatus } = require("./db");
  const actions = getPendingActions();
  const action = actions.find((a: ProposedAction) => a.id === actionId);

  if (!action) {
    return { success: false, result: "Accion no encontrada o ya procesada." };
  }

  if (!approved) {
    updateActionStatus(actionId, "rejected", "Rejected by operator");
    return { success: true, result: "Accion cancelada." };
  }

  // In demo mode, simulate execution
  const risk = analyzeRisk(action.command);
  if (risk.riskLevel === "high") {
    updateActionStatus(actionId, "rejected", "Auto-rejected: high risk command requires manual execution");
    return {
      success: false,
      result: "Comando de alto riesgo rechazado automaticamente. Ejecucion manual requerida via Winbox o SSH.",
    };
  }

  updateActionStatus(actionId, "executed", `Command executed successfully (simulated): ${action.command}`);

  // Record in memory
  recordMemoryPattern(
    `executed-${action.command.split(" ").slice(0, 3).join("-")}`,
    `Executed: ${action.command}`,
    "Executed by operator approval"
  );

  return {
    success: true,
    result: `Comando ejecutado (simulado): \`\`\`routeros\n${action.command}\n\`\`\`\n\nEn produccion, esto se ejecutaria via la API de MikroTik.`,
  };
}
