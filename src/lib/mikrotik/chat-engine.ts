import { searchKnowledge } from "@/docs/knowledge-base";
import { generateConfigSuggestion } from "./analyzer";
import { getVectorStore } from "@/lib/ingestion/vector-store";

const systemPrompt = `You are MikroTik Expert Sentinel, an AI assistant specialized in MikroTik RouterOS configuration and network engineering. You hold MTCNA, MTCRE, and MTCINE certifications.

Key guidelines:
- Prioritize RouterOS v7 solutions
- Follow MikroTik best practices for security (Firewall, Mangle, Raw rules)
- Speak technically but accessibly
- Provide RouterOS script examples in code blocks
- Always consider security implications
- Recommend connection-state tracking in firewall rules
- Suggest raw rules for performance-critical traffic`;

export function generateChatResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();

  if (
    lowerMessage.includes("help") ||
    lowerMessage.includes("hello") ||
    lowerMessage.includes("hi")
  ) {
    return `I'm MikroTik Expert Sentinel, your RouterOS specialist. I can help you with:

- **Firewall configuration** - Filter rules, Mangle, Raw rules
- **VPN setup** - WireGuard, IPsec, OpenVPN
- **Routing protocols** - BGP, OSPF, policy routing
- **QoS & Bandwidth control** - Queue trees, PCQ, simple queues
- **Security hardening** - Best practices, threat mitigation
- **VLAN & bridging** - Network segmentation
- **Scripting** - Automation, scheduled tasks

Upload an .rsc file for configuration analysis, or ask me any RouterOS question. I'll provide code examples for RouterOS v7.`;
  }

  const configResponse = generateConfigSuggestion(userMessage);
  if (!configResponse.startsWith("I don't have")) {
    return configResponse;
  }

  // Search vector store first (crawled MikroTik documentation)
  try {
    const vectorResults = getVectorStore().search(userMessage, 3);
    if (vectorResults.length > 0 && vectorResults[0].score > 0.05) {
      const topResult = vectorResults[0];
      const chunk = topResult.chunk;
      let response = `**${chunk.section}** (${chunk.title})\n\n${chunk.text}\n\n`;
      if (chunk.codeExamples.length > 0) {
        for (const code of chunk.codeExamples) {
          response += `\`\`\`routeros\n${code}\n\`\`\`\n`;
        }
      }
      response += `\n_Source: [MikroTik Documentation](${chunk.url})_`;

      if (vectorResults.length > 1) {
        const related = vectorResults
          .slice(1)
          .filter((r) => r.score > 0.03)
          .map((r) => `**${r.chunk.section}**`);
        if (related.length > 0) {
          response += "\n\nRelated: " + related.join(", ");
        }
      }

      return response;
    }
  } catch {
    // Fall through to static knowledge base
  }

  // Fall back to static knowledge base
  const relevantEntries = searchKnowledge(userMessage);
  if (relevantEntries.length > 0) {
    const entry = relevantEntries[0];
    let response = `**${entry.topic}** (RouterOS ${entry.routerOsVersion})\n\n${entry.content}\n\n`;
    if (entry.codeExample) {
      response += `\`\`\`routeros\n${entry.codeExample}\n\`\`\`\n`;
    }
    if (relevantEntries.length > 1) {
      response +=
        "\nRelated topics: " +
        relevantEntries
          .slice(1)
          .map((e) => `**${e.topic}**`)
          .join(", ");
    }
    return response;
  }

  if (lowerMessage.includes("firewall")) {
    return `For RouterOS v7 firewall setup, follow this security-first approach:

1. **Accept established/related** connections first
2. **Drop invalid** connections
3. **Allow specific services** (SSH, ICMP)
4. **Drop everything else** on input from WAN

\`\`\`routeros
/ip firewall filter
add action=accept chain=input connection-state=established,related
add action=drop chain=input connection-state=invalid
add action=accept chain=input protocol=icmp
add action=accept chain=input dst-port=22 protocol=tcp src-address=192.168.0.0/24
add action=drop chain=input in-interface-list=WAN
\`\`\`

For performance, also use **raw rules** to drop bogon traffic before connection tracking. Want me to show you the complete firewall template?`;
  }

  if (lowerMessage.includes("wireguard") || lowerMessage.includes("wg")) {
    return `**WireGuard Setup on RouterOS v7:**

\`\`\`routeros
/interface wireguard
add listen-port=13231 mtu=1420 name=wg0
/ip address
add address=10.10.10.1/24 interface=wg0 network=10.10.10.0
/interface wireguard peers
add allowed-address=10.10.10.2/32 interface=wg0 \\
    public-key="CLIENT_PUBLIC_KEY_HERE"
/ip firewall filter
add action=accept chain=input dst-port=13231 \\
    in-interface-list=WAN protocol=udp
\`\`\`

Make sure to generate key pairs first and exchange public keys between peers. Need help with client configuration or routing through the tunnel?`;
  }

  if (lowerMessage.includes("bgp")) {
    return `**BGP Configuration in RouterOS v7:**

\`\`\`routeros
/routing bgp template
add as=65001 name=default router-id=1.1.1.1
/routing bgp connection
add disabled=no local.role=ebgp name=peer-isp \\
    output.network=bgp-networks \\
    remote.address=203.0.113.1.as=65000 \\
    templates=default
\`\`\`

Key BGP tips for v7:
- Use \`/routing bgp template\` for reusable configs
- Always allow port 179/tcp in firewall from peers
- Use \`/routing bgp session print\` to verify status

Which BGP scenario are you working on (multi-homed, transit, IX peering)?`;
  }

  if (
    lowerMessage.includes("queue") ||
    lowerMessage.includes("bandwidth") ||
    lowerMessage.includes("qos")
  ) {
    return `**QoS with Queue Trees (RouterOS v7):**

First, mark packets with mangle:
\`\`\`routeros
/ip firewall mangle
add action=mark-packet chain=prerouting \\
    dst-port=80,443 protocol=tcp \\
    new-packet-mark=web-pkt
\`\`\`

Then create queue trees:
\`\`\`routeros
/queue tree
add max-limit=100M name=total-upload parent=global
add max-limit=50M name=web-upload \\
    parent=total-upload packet-mark=web-pkt
\`\`\`

For fair bandwidth distribution, use **PCQ** (Per Connection Queue):
\`\`\`routeros
/queue type
add kind=pcq name=pcq-dl pcq-classifier=dst-address \\
    pcq-rate=10M
\`\`\`

What bandwidth limits do you need to implement?`;
  }

  if (lowerMessage.includes("vpn") || lowerMessage.includes("ipsec")) {
    return `For VPN on RouterOS v7, you have several options:

1. **WireGuard** - Fastest, simplest setup (recommended)
2. **IPsec IKEv2** - Best for site-to-site and road warrior
3. **SSTP** - Works through firewalls (port 443)
4. **OpenVPN** - Cross-platform compatibility

Which VPN type fits your scenario? I can provide detailed configuration for any of these.

For most use cases, I recommend **WireGuard** for its speed and simplicity, or **IPsec IKEv2** for enterprise compatibility.`;
  }

  if (lowerMessage.includes("vlan") || lowerMessage.includes("bridge")) {
    return `**VLAN Configuration with Bridge Filtering (v7):**

\`\`\`routeros
/interface bridge
add name=bridge1 vlan-filtering=yes
/interface bridge port
add bridge=bridge1 interface=ether2 pvid=10
add bridge=bridge1 interface=ether3 pvid=20
/interface bridge vlan
add bridge=bridge1 tagged=ether1 \\
    untagged=ether2 vlan-ids=10
add bridge=bridge1 tagged=ether1 \\
    untagged=ether3 vlan-ids=20
\`\`\`

Key points:
- Use bridge VLAN filtering (not switch chip VLANs)
- Set PVID on access ports
- Tag trunk ports
- Hardware offload available on CRS3xx/CRS5xx

Need help with inter-VLAN routing or specific port configurations?`;
  }

  return `I can help with that. Based on your query about "${userMessage}", I'd need more specific details to provide the best RouterOS v7 configuration.

Try asking about:
- **Firewall** - Filter rules, raw rules, mangle
- **WireGuard** - VPN setup
- **BGP/OSPF** - Routing protocols
- **Queue trees** - Bandwidth management
- **VLAN** - Network segmentation
- **Security hardening** - Best practices

You can also upload an .rsc configuration file and I'll analyze it for errors and security issues.`;
}
