import type { RscAnalysisResult } from "@/lib/types";
import { knowledgeBase } from "@/docs/knowledge-base";

const dangerousPatterns = [
  { pattern: /action=accept\s+chain=input(?!.*connection-state)/g, message: "Accepting input traffic without connection-state check - potential security risk", severity: "high" },
  { pattern: /action=accept\s+chain=input\s+in-interface-list=WAN/g, message: "Accepting all input from WAN interface - dangerous", severity: "high" },
  { pattern: /telnet\s+disabled=no|telnet\s*(?!.*disabled)/g, message: "Telnet service enabled - use SSH instead", severity: "high" },
  { pattern: /ftp\s+disabled=no|ftp\s*(?!.*disabled)/g, message: "FTP service enabled - use SFTP instead", severity: "medium" },
  { pattern: /common-password|password123|admin|default/g, message: "Weak or default password detected", severity: "high" },
  { pattern: /strong-crypto=no/g, message: "Strong crypto disabled - enable for security", severity: "medium" },
  { pattern: /allow-remote-requests=yes(?!.*address)/g, message: "DNS open to all interfaces - restrict with firewall", severity: "medium" },
  { pattern: /action=accept\s+protocol=icmp\s+in-interface-list=WAN/g, message: "ICMP accepted from WAN - consider rate limiting", severity: "low" },
  { pattern: /add-to-address-list(?!.*address-list-timeout)/g, message: "Address list entry without timeout - could accumulate indefinitely", severity: "low" },
  { pattern: /connection-nat=no/g, message: "Connection tracking disabled - NAT may not work correctly", severity: "medium" },
];

const bestPracticeSuggestions = [
  { pattern: /\/ip firewall filter/, suggestion: "Consider adding connection-state=established,related accept rule at the top of your filter chain" },
  { pattern: /\/ip firewall mangle/, suggestion: "Ensure mangle rules use passthrough=no where packet marking should stop processing" },
  { pattern: /\/interface bridge/, suggestion: "Enable VLAN filtering on bridges for proper network segmentation" },
  { pattern: /\/queue tree/, suggestion: "Pair queue trees with mangle packet marks for effective QoS" },
  { pattern: /\/ip dns/, suggestion: "Consider enabling DNS over HTTPS (DoH) for encrypted DNS queries" },
  { pattern: /\/interface wireguard/, suggestion: "Ensure WireGuard listen-port is allowed through input firewall chain" },
  { pattern: /\/routing bgp/, suggestion: "Add firewall rules to allow BGP port 179/tcp from peers only" },
];

// v6-specific patterns that indicate a RouterOS v6 script
const v6Indicators = [
  /\/routing\s+bgp\s+peer\b/,
  /\/routing\s+bgp\s+advertisements\b/,
  /\/routing\s+filter\b/,
  /\/routing\s+ospf\s+instance\b/,
  /\/routing\s+ospf\s+area\b/,
  /\/routing\s+ospf\s+interface\b/,
  /\/ip\s+firewall\s+connection\b/,
  /\/ip\s+hotspot\s+setup\b/,
  /\/queue\s+type\s+add\s+name=pcq/,
  /\/tool\s+bandwidth-test\b/,
];

// v7-specific patterns
const v7Indicators = [
  /\/routing\/bgp\/session\b/,
  /\/routing\/bgp\/connection\b/,
  /\/routing\/route\/rules\b/,
  /\/routing\/ospf\/instance\b/,
  /\/ip\s+firewall\s+raw\b/,
  /\/interface\/monitor-traffic\b/,
];

interface VersionMigration {
  v6Command: string;
  v7Command: string;
  description: string;
}

const v6ToV7Migrations: VersionMigration[] = [
  {
    v6Command: "/routing bgp peer",
    v7Command: "/routing bgp connection + /routing bgp session",
    description: "BGP peer se divide en connection (configuracion) y session (estado)",
  },
  {
    v6Command: "/routing bgp advertisements",
    v7Command: "/routing bgp advertisements (igual, pero dentro del contexto de session)",
    description: "Anuncios BGP ahora se consultan dentro del contexto de sesion",
  },
  {
    v6Command: "/routing filter",
    v7Command: "/routing/route/rules",
    description: "Filtros de ruta ahora usan el motor de reglas de v7",
  },
  {
    v6Command: "/routing ospf instance",
    v7Command: "/routing/ospf/instance",
    description: "Ruta de comandos OSPF cambia a path con slashes",
  },
  {
    v6Command: "/routing ospf area",
    v7Command: "/routing/ospf/area",
    description: "Areas OSPF usan nueva ruta",
  },
  {
    v6Command: "/interface monitor-traffic",
    v7Command: "/interface/monitor-traffic",
    description: "Ruta de comandos de interfaces usa slashes en v7",
  },
  {
    v6Command: "/tool bandwidth-test",
    v7Command: "/tool/bandwidth-test",
    description: "Herramientas usan path con slashes en v7",
  },
];

function detectScriptVersion(content: string): "v6" | "v7" | "unknown" {
  let v6Score = 0;
  let v7Score = 0;

  for (const pattern of v6Indicators) {
    if (pattern.test(content)) v6Score++;
  }
  for (const pattern of v7Indicators) {
    if (pattern.test(content)) v7Score++;
  }

  if (v6Score > v7Score) return "v6";
  if (v7Score > v6Score) return "v7";
  if (v6Score > 0) return "v6";
  return "unknown";
}

function generateMigrationHints(content: string): string[] {
  const hints: string[] = [];
  for (const migration of v6ToV7Migrations) {
    if (content.includes(migration.v6Command)) {
      hints.push(`[v6 -> v7] ${migration.v6Command} => ${migration.v7Command}: ${migration.description}`);
    }
  }
  return hints;
}

export function analyzeRsc(content: string, filename: string): RscAnalysisResult {
  const lines = content.split("\n");
  const securityIssues: RscAnalysisResult["securityIssues"] = [];
  const suggestions: string[] = [];
  const parsedSections: Record<string, string[]> = {};

  // Detect script version
  const detectedVersion = detectScriptVersion(content);
  if (detectedVersion === "v6") {
    suggestions.push(
      `Este script parece ser de RouterOS v6. Si tu router corre v7, puedo ayudarte a migrarlo. Escribe "migrar a v7" para ver los cambios necesarios.`
    );
    // Add migration hints
    const migrationHints = generateMigrationHints(content);
    for (const hint of migrationHints) {
      suggestions.push(hint);
    }
  } else if (detectedVersion === "v7") {
    suggestions.push(
      `Script detectado como RouterOS v7. Si tu router corre v6, algunos comandos pueden no funcionar.`
    );
  }

  let currentSection = "general";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("/")) {
      currentSection = trimmed.split(" ").slice(0, 3).join(" ").replace(/\\$/, "");
      if (!parsedSections[currentSection]) {
        parsedSections[currentSection] = [];
      }
    }
    if (parsedSections[currentSection]) {
      parsedSections[currentSection].push(trimmed);
    }
  }

  for (const { pattern, message, severity } of dangerousPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      securityIssues.push({ severity, message, line: lineNumber });
    }
  }

  for (const { pattern, suggestion } of bestPracticeSuggestions) {
    if (pattern.test(content) && !suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
  }

  if (content.includes("/ip service")) {
    const hasSshDisabled = /ssh\s+disabled=yes/.test(content);
    if (hasSshDisabled) {
      securityIssues.push({ severity: "high", message: "SSH service is being disabled - ensure alternative access method exists" });
    }
  }

  if (content.includes("/user")) {
    const hasAdminMod = /set\s+\[find\s+name=admin\]/.test(content);
    if (hasAdminMod) {
      suggestions.push("Consider creating a new admin user and removing or disabling the default 'admin' account");
    }
  }

  return { filename, securityIssues, suggestions, parsedSections };
}

export function generateConfigSuggestion(topic: string): string {
  const query = topic.toLowerCase();
  const relevantEntries = knowledgeBase.filter((entry) =>
    entry.tags.some((tag) => query.includes(tag)) ||
    entry.topic.toLowerCase().includes(query) ||
    entry.category.toLowerCase().includes(query)
  );

  if (relevantEntries.length === 0) {
    return "I don't have a specific configuration template for that topic. Please try keywords like: firewall, wireguard, vpn, bgp, ospf, qos, queue, vlan, bridge, dns, security.";
  }

  const entry = relevantEntries[0];
  let response = `**${entry.topic}** (RouterOS ${entry.routerOsVersion})\n\n${entry.content}\n\n`;
  if (entry.codeExample) {
    response += `Here's a configuration example:\n\n\`\`\`routeros\n${entry.codeExample}\n\`\`\`\n`;
  }
  return response;
}
