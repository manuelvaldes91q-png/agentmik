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

export function analyzeRsc(content: string, filename: string): RscAnalysisResult {
  const lines = content.split("\n");
  const securityIssues: RscAnalysisResult["securityIssues"] = [];
  const suggestions: string[] = [];
  const parsedSections: Record<string, string[]> = {};

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
