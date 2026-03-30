import { executeCommand } from "./connection-server";
import { loadMikroTikConfig } from "./db";

interface DiagnosticResult {
  category: string;
  findings: string[];
  severity: "info" | "warning" | "critical";
  commands: string[];
  solution: string;
}

// Detect what the user wants to check
export function detectDiagnosticIntent(message: string): string | null {
  const lower = message.toLowerCase();

  if (lower.match(/firewall|filtro|filter|regla|bloqueo|bloquear|drop|accept/)) return "firewall";
  if (lower.match(/interfaz|interface|ethernet|ether|puerto|link|conexion fisica/)) return "interfaces";
  if (lower.match(/cpu|procesador|lento|rendimiento|performance|saturado|carga/)) return "cpu";
  if (lower.match(/memoria|ram|memory|almacenamiento/)) return "memory";
  if (lower.match(/ruta|route|routing|gateway|enrutamiento|navegacion/)) return "routes";
  if (lower.match(/nat|masquerade|src-nat|dst-nat|port forward/)) return "nat";
  if (lower.match(/dns|resolucion|resolver/)) return "dns";
  if (lower.match(/dhcp|ip dinamica|lease/)) return "dhcp";
  if (lower.match(/queue|cola|bandwidth|ancho de banda|limitar|qos/)) return "queues";
  if (lower.match(/log|registro|evento|mensaje/)) return "logs";
  if (lower.match(/conectividad|ping|test|prueba|internet|funciona/)) return "connectivity";
  if (lower.match(/seguridad|security|ataque|ddos|brute|intruso/)) return "security";
  if (lower.match(/todo|completo|general|estado|status|resumen/)) return "overview";

  return null;
}

// Run diagnostic based on intent
export async function runDiagnostic(intent: string): Promise<DiagnosticResult> {
  const hasConfig = loadMikroTikConfig();
  if (!hasConfig) {
    return {
      category: intent,
      findings: ["No hay configuracion de MikroTik guardada"],
      severity: "critical",
      commands: [],
      solution: "Ve a /settings y configura la conexion a tu router MikroTik.",
    };
  }

  switch (intent) {
    case "firewall": return await diagnosticFirewall();
    case "interfaces": return await diagnosticInterfaces();
    case "cpu": return await diagnosticCPU();
    case "memory": return await diagnosticMemory();
    case "routes": return await diagnosticRoutes();
    case "nat": return await diagnosticNAT();
    case "dns": return await diagnosticDNS();
    case "dhcp": return await diagnosticDHCP();
    case "queues": return await diagnosticQueues();
    case "logs": return await diagnosticLogs();
    case "connectivity": return await diagnosticConnectivity();
    case "security": return await diagnosticSecurity();
    case "overview": return await diagnosticOverview();
    default: return {
      category: intent,
      findings: ["Diagnostico no reconocido"],
      severity: "info",
      commands: [],
      solution: "Prueba con: firewall, interfaces, cpu, memoria, rutas, nat, dns, dhcp, colas, logs, conectividad, seguridad, o estado general.",
    };
  }
}

async function diagnosticFirewall(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  // Get firewall filter rules
  const filterRes = await executeCommand("/ip firewall filter print");
  if (filterRes.success && filterRes.result) {
    const rules = filterRes.result as Record<string, string>[];
    commands.push("/ip firewall filter print");

    if (rules.length === 0) {
      findings.push("No hay reglas de firewall configuradas. Tu router esta sin proteccion.");
      return {
        category: "Firewall",
        findings,
        severity: "critical",
        commands,
        solution: "AGREGA ESTAS REGLAS BASICAS AHORA:\n\n/ip firewall filter\nadd action=accept chain=input connection-state=established,related\nadd action=drop chain=input connection-state=invalid\nadd action=accept chain=input protocol=icmp\nadd action=accept chain=input in-interface=ether2\nadd action=drop chain=input in-interface=ether1 comment=\"Drop WAN input\"",
      };
    }

    // Check if first rule accepts established/related
    const firstRule = rules[0];
    if (!firstRule["connection-state"]?.includes("established") && !firstRule["connection-state"]?.includes("related")) {
      findings.push("La primera regla NO acepta conexiones establecidas/relacionadas. Esto causa alta CPU.");
    } else {
      findings.push("Primera regla correcta: acepta conexiones establecidas/relacionadas.");
    }

    // Check for drop invalid
    const hasDropInvalid = rules.some(r => r.action === "drop" && r["connection-state"]?.includes("invalid"));
    if (!hasDropInvalid) {
      findings.push("No hay regla para dropear conexiones invalidas. Agregala para mejorar seguridad.");
    }

    // Count rules by chain
    const inputRules = rules.filter(r => r.chain === "input");
    const forwardRules = rules.filter(r => r.chain === "forward");
    findings.push(`Reglas input: ${inputRules.length} | Reglas forward: ${forwardRules.length} | Total: ${rules.length}`);

    // Check for WAN drop at the end
    const lastInputRule = inputRules[inputRules.length - 1];
    if (lastInputRule && lastInputRule.action !== "drop") {
      findings.push("ADVERTENCIA: La ultima regla de input no es drop. El trafico no autorizado podria pasar.");
    }

    // Check connection tracking
    const connRes = await executeCommand("/ip firewall connection print count-only");
    if (connRes.success && connRes.result) {
      const count = String(connRes.result).trim();
      findings.push(`Conexiones activas: ${count}`);
      if (parseInt(count) > 10000) {
        findings.push("ALTO: Mas de 10,000 conexiones activas. Posible ataque DDoS.");
      }
    }
  }

  return {
    category: "Firewall",
    findings,
    severity: findings.some(f => f.includes("critica") || f.includes("critic") || f.includes("sin proteccion")) ? "critical" : findings.some(f => f.includes("ADVERTENCIA") || f.includes("ALTO")) ? "warning" : "info",
    commands,
    solution: "Si necesitas agregar una regla, dime exactamente que quieres bloquear o permitir y te genero el comando.",
  };
}

async function diagnosticInterfaces(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  const ifaceRes = await executeCommand("/interface print");
  if (ifaceRes.success && ifaceRes.result) {
    const ifaces = ifaceRes.result as Record<string, string>[];
    commands.push("/interface print");

    for (const iface of ifaces) {
      const name = iface.name;
      const status = iface.running === "true" ? "UP" : "DOWN";
      const rxBytes = parseInt(iface["rx-byte"] || "0", 10);
      const txBytes = parseInt(iface["tx-byte"] || "0", 10);
      const rxErors = parseInt(iface["rx-errors"] || "0", 10);
      const txErrors = parseInt(iface["tx-errors"] || "0", 10);
      const rxDrops = parseInt(iface["rx-drops"] || "0", 10);
      const txDrops = parseInt(iface["tx-drops"] || "0", 10);

      findings.push(`${name}: ${status} | RX: ${formatBytes(rxBytes)} | TX: ${formatBytes(txBytes)}`);

      if (rxErors > 0 || txErrors > 0) {
        findings.push(`  ERROR en ${name}: ${rxErors} errores RX, ${txErrors} errores TX. Verifica cable o SFP.`);
      }
      if (rxDrops > 100 || txDrops > 100) {
        findings.push(`  DROPS en ${name}: ${rxDrops} drops RX, ${txDrops} drops TX. Posible saturacion.`);
      }
    }

    const downIfaces = ifaces.filter(i => i.running !== "true");
    if (downIfaces.length > 0) {
      findings.push(`Interfaces caidas: ${downIfaces.map(i => i.name).join(", ")}`);
    }
  }

  return {
    category: "Interfaces",
    findings,
    severity: findings.some(f => f.includes("ERROR")) ? "warning" : "info",
    commands,
    solution: "Si hay errores en una interfaz, verifica el cableado o el modulo SFP. Si hay drops, considera limitar el trafico con queues.",
  };
}

async function diagnosticCPU(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  const resRes = await executeCommand("/system resource print");
  if (resRes.success && resRes.result) {
    const res = (resRes.result as Record<string, string>[])[0];
    commands.push("/system resource print");

    const cpuLoad = parseInt(res["cpu-load"] || "0", 10);
    findings.push(`CPU actual: ${cpuLoad}%`);

    if (cpuLoad > 90) {
      findings.push("CRITICO: CPU sobre 90%. El router podria dejar de responder.");
    } else if (cpuLoad > 70) {
      findings.push("ALTO: CPU sobre 70%. Revisa procesos que consumen recursos.");
    } else {
      findings.push("CPU en nivel normal.");
    }

    findings.push(`Uptime: ${res.uptime || "N/A"}`);
    findings.push(`Version: ${res.version || "N/A"}`);
    findings.push(`Arquitectura: ${res["architecture-name"] || res.architecture || "N/A"}`);
  }

  return {
    category: "CPU",
    findings,
    severity: findings.some(f => f.includes("CRITICO")) ? "critical" : findings.some(f => f.includes("ALTO")) ? "warning" : "info",
    commands,
    solution: cpuLoadFromFindings(findings),
  };
}

function cpuLoadFromFindings(findings: string[]): string {
  const cpuLine = findings.find(f => f.includes("CPU actual:"));
  if (!cpuLine) return "No se pudo obtener CPU.";
  const match = cpuLine.match(/(\d+)%/);
  if (!match) return "No se pudo parsear CPU.";
  const load = parseInt(match[1]);
  if (load > 90) return "Ejecuta /tool profile duration=15 para ver que proceso consume CPU. Posibles causas: firewall mal configurado, BGP con full table, DDoS.";
  if (load > 70) return "CPU elevada. Revisa: /ip firewall filter print stats, /routing bgp peer print stats, /ip firewall connection print count.";
  return "CPU normal. No se requiere accion.";
}

async function diagnosticMemory(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  const resRes = await executeCommand("/system resource print");
  if (resRes.success && resRes.result) {
    const res = (resRes.result as Record<string, string>[])[0];
    commands.push("/system resource print");

    const freeMem = parseInt(res["free-memory"] || "0", 10);
    const totalMem = parseInt(res["total-memory"] || "0", 10);
    const usedPct = totalMem > 0 ? ((totalMem - freeMem) / totalMem * 100) : 0;

    findings.push(`Memoria: ${formatBytes(freeMem)} libre de ${formatBytes(totalMem)} (${usedPct.toFixed(0)}% usado)`);

    if (usedPct > 95) {
      findings.push("CRITICO: Memoria casi agotada. El router podria reiniciarse.");
    } else if (usedPct > 80) {
      findings.push("ALTO: Memoria sobre 80%. Considera deshabilitar paquetes innecesarios.");
    } else {
      findings.push("Memoria en nivel normal.");
    }
  }

  return {
    category: "Memoria",
    findings,
    severity: findings.some(f => f.includes("CRITICO")) ? "critical" : findings.some(f => f.includes("ALTO")) ? "warning" : "info",
    commands,
    solution: "Si la memoria esta alta, ejecuta /system package print y deshabilita paquetes que no uses: /system package disable hotspot, mpls, ppp, wireless.",
  };
}

async function diagnosticRoutes(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  const routeRes = await executeCommand("/ip route print");
  if (routeRes.success && routeRes.result) {
    const routes = routeRes.result as Record<string, string>[];
    commands.push("/ip route print");

    const defaultRoutes = routes.filter(r => r["dst-address"] === "0.0.0.0/0");
    findings.push(`Rutas totales: ${routes.length} | Rutas default: ${defaultRoutes.length}`);

    for (const dr of defaultRoutes) {
      const status = dr["active"] === "true" ? "ACTIVA" : "inactiva";
      findings.push(`Default route via ${dr.gateway} (${status}) - ${dr["routing-mark"] || "main"}`);
    }

    if (defaultRoutes.length === 0) {
      findings.push("CRITICO: No hay ruta por defecto. Sin acceso a internet.");
    }

    const unreachable = routes.filter(r => r["unreachable"] === "true");
    if (unreachable.length > 0) {
      findings.push(`${unreachable.length} rutas inalcanzables. Posible problema de gateway.`);
    }
  }

  return {
    category: "Rutas",
    findings,
    severity: findings.some(f => f.includes("CRITICO")) ? "critical" : "info",
    commands,
    solution: "Si no hay ruta default, agrega: /ip route add dst-address=0.0.0.0/0 gateway=IP_DE_TU_GATEWAY",
  };
}

async function diagnosticNAT(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  const natRes = await executeCommand("/ip firewall nat print");
  if (natRes.success && natRes.result) {
    const rules = natRes.result as Record<string, string>[];
    commands.push("/ip firewall nat print");

    findings.push(`Reglas NAT: ${rules.length}`);

    const masq = rules.filter(r => r.action === "masquerade");
    const srcNat = rules.filter(r => r.action === "src-nat");
    const dstNat = rules.filter(r => r.action === "dst-nat");

    findings.push(`Masquerade: ${masq.length} | Src-NAT: ${srcNat.length} | Dst-NAT (port forward): ${dstNat.length}`);

    if (masq.length === 0 && srcNat.length === 0) {
      findings.push("CRITICO: No hay NAT configurado. Los clientes LAN no tendran acceso a internet.");
    }

    if (dstNat.length > 0) {
      for (const rule of dstNat) {
        findings.push(`Port forward: ${rule["to-ports"] || rule["to-addresses"]} en ${rule["dst-port"]} -> ${rule["to-addresses"]}`);
      }
    }
  }

  return {
    category: "NAT",
    findings,
    severity: findings.some(f => f.includes("CRITICO")) ? "critical" : "info",
    commands,
    solution: "Si no hay NAT, agrega: /ip firewall nat add action=masquerade chain=srcnat out-interface=ether1",
  };
}

async function diagnosticDNS(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  const dnsRes = await executeCommand("/ip dns print");
  if (dnsRes.success && dnsRes.result) {
    const dns = (dnsRes.result as Record<string, string>[])[0];
    commands.push("/ip dns print");

    findings.push(`Servidores DNS: ${dns.servers || "No configurados"}`);
    findings.push(`Cache DNS: ${dns["cache-size"] || "N/A"}`);
    findings.push(`Requests remotos: ${dns["allow-remote-requests"] || "no"}`);
  }

  // Test DNS resolution
  const pingRes = await executeCommand("/ping 8.8.8.8 count=1");
  if (pingRes.success) {
    findings.push("Conectividad a internet: OK");
  } else {
    findings.push("CRITICO: Sin conectividad a internet.");
  }

  return {
    category: "DNS",
    findings,
    severity: findings.some(f => f.includes("CRITICO")) ? "critical" : "info",
    commands,
    solution: "Si DNS no responde, configura: /ip dns set servers=8.8.8.8,8.8.4.4 allow-remote-requests=yes",
  };
}

async function diagnosticDHCP(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  const dhcpRes = await executeCommand("/ip dhcp-server print");
  if (dhcpRes.success && dhcpRes.result) {
    const servers = dhcpRes.result as Record<string, string>[];
    commands.push("/ip dhcp-server print");
    findings.push(`DHCP Servers: ${servers.length}`);
    for (const s of servers) {
      findings.push(`  ${s.name}: interface ${s.interface}, pool ${s["address-pool"]}, ${s.disabled === "true" ? "DESHABILITADO" : "activo"}`);
    }
  }

  const leaseRes = await executeCommand("/ip dhcp-server lease print count-only");
  if (leaseRes.success) {
    findings.push(`Leases activos: ${String(leaseRes.result).trim()}`);
  }

  const clientRes = await executeCommand("/ip dhcp-client print");
  if (clientRes.success && clientRes.result) {
    const clients = clientRes.result as Record<string, string>[];
    commands.push("/ip dhcp-client print");
    for (const c of clients) {
      findings.push(`DHCP Client en ${c.interface}: IP ${c.address || "ninguna"}, status ${c.status || "N/A"}`);
    }
  }

  return {
    category: "DHCP",
    findings,
    severity: "info",
    commands,
    solution: "Si no hay DHCP server, ejecuta: /ip dhcp-server setup para configurarlo.",
  };
}

async function diagnosticQueues(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  const queueRes = await executeCommand("/queue simple print");
  if (queueRes.success && queueRes.result) {
    const queues = queueRes.result as Record<string, string>[];
    commands.push("/queue simple print");
    findings.push(`Simple Queues: ${queues.length}`);
    for (const q of queues.slice(0, 5)) {
      findings.push(`  ${q.name}: ${q["max-limit"] || "sin limite"} -> ${q.target || "N/A"}`);
    }
    if (queues.length > 5) findings.push(`  ... y ${queues.length - 5} mas`);
  }

  return {
    category: "Queues",
    findings,
    severity: "info",
    commands,
    solution: "Para limitar ancho de banda: /queue simple add max-limit=10M/10M name=limite target=192.168.1.0/24",
  };
}

async function diagnosticLogs(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  const logRes = await executeCommand("/log print last=20");
  if (logRes.success && logRes.result) {
    const logs = logRes.result as Record<string, string>[];
    commands.push("/log print last=20");

    const errors = logs.filter(l => l.topics?.includes("error") || l.topics?.includes("critical"));
    const warnings = logs.filter(l => l.topics?.includes("warning"));

    findings.push(`Ultimos ${logs.length} logs: ${errors.length} errores, ${warnings.length} advertencias`);

    for (const log of logs.slice(0, 10)) {
      findings.push(`[${log.time || ""}] ${log.message || ""}`);
    }
  }

  return {
    category: "Logs",
    findings,
    severity: findings.some(f => f.includes("error") || f.includes("critical")) ? "warning" : "info",
    commands,
    solution: "Revisa los logs para identificar problemas recurrentes. Usa /log print topics=error para filtrar errores.",
  };
}

async function diagnosticConnectivity(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  // Ping gateway
  const routeRes = await executeCommand("/ip route print where dst-address=0.0.0.0/0");
  if (routeRes.success && routeRes.result) {
    const routes = routeRes.result as Record<string, string>[];
    for (const r of routes) {
      if (r.gateway) {
        const pingRes = await executeCommand(`/ping ${r.gateway} count=3`);
        findings.push(`Ping a gateway ${r.gateway}: ${pingRes.success ? "OK" : "FALLO"}`);
        commands.push(`/ping ${r.gateway} count=3`);
      }
    }
  }

  // Ping internet
  const inetRes = await executeCommand("/ping 8.8.8.8 count=3");
  findings.push(`Ping a 8.8.8.8: ${inetRes.success ? "OK" : "FALLO - Sin internet"}`);
  commands.push("/ping 8.8.8.8 count=3");

  return {
    category: "Conectividad",
    findings,
    severity: findings.some(f => f.includes("FALLO")) ? "critical" : "info",
    commands,
    solution: "Si no hay conectividad, verifica: 1) Ruta default, 2) NAT masquerade, 3) Firewall input/forward.",
  };
}

async function diagnosticSecurity(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  // Check services
  const svcRes = await executeCommand("/ip service print");
  if (svcRes.success && svcRes.result) {
    const svcs = svcRes.result as Record<string, string>[];
    commands.push("/ip service print");

    for (const svc of svcs) {
      if (svc.disabled !== "true") {
        const restricted = svc.address ? ` (${svc.address})` : " ABIERTO A TODOS";
        findings.push(`Servicio ${svc.name} puerto ${svc.port}: activo${restricted}`);
      }
    }

    const telnet = svcs.find(s => s.name === "telnet" && s.disabled !== "true");
    if (telnet) {
      findings.push("PELIGRO: Telnet habilitado. Deshabilitalo: /ip service disable telnet");
    }

    const ftp = svcs.find(s => s.name === "ftp" && s.disabled !== "true");
    if (ftp) {
      findings.push("ADVERTENCIA: FTP habilitado. Usa SFTP: /ip service disable ftp");
    }
  }

  // Check users
  const userRes = await executeCommand("/user print");
  if (userRes.success && userRes.result) {
    const users = userRes.result as Record<string, string>[];
    commands.push("/user print");
    findings.push(`Usuarios: ${users.length}`);
    const admin = users.find(u => u.name === "admin");
    if (admin) {
      findings.push("ADVERTENCIA: Usuario 'admin' existe. Crea un usuario personal y deshabilita admin.");
    }
  }

  // Connection count
  const connRes = await executeCommand("/ip firewall connection print count-only");
  if (connRes.success) {
    const count = String(connRes.result).trim();
    findings.push(`Conexiones activas: ${count}`);
    if (parseInt(count) > 5000) {
      findings.push("ALTO: Muchas conexiones. Posible ataque DDoS.");
    }
  }

  return {
    category: "Seguridad",
    findings,
    severity: findings.some(f => f.includes("PELIGRO")) ? "critical" : findings.some(f => f.includes("ADVERTENCIA") || f.includes("ALTO")) ? "warning" : "info",
    commands,
    solution: "Deshabilita servicios innecesarios, crea usuarios personalizados, y restringe acceso API por IP.",
  };
}

async function diagnosticOverview(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const commands: string[] = [];

  // System info
  const resRes = await executeCommand("/system resource print");
  if (resRes.success && resRes.result) {
    const res = (resRes.result as Record<string, string>[])[0];
    commands.push("/system resource print");
    findings.push(`RouterOS: ${res.version} | CPU: ${res["cpu-load"]}% | RAM: ${formatBytes(parseInt(res["free-memory"]))} libre / ${formatBytes(parseInt(res["total-memory"]))} | Uptime: ${res.uptime}`);
  }

  // Identity
  const idRes = await executeCommand("/system identity print");
  if (idRes.success && idRes.result) {
    const id = (idRes.result as Record<string, string>[])[0];
    findings.push(`Nombre: ${id.name}`);
  }

  // Interfaces
  const ifaceRes = await executeCommand("/interface print where running=true");
  if (ifaceRes.success && ifaceRes.result) {
    const ifaces = ifaceRes.result as Record<string, string>[];
    findings.push(`Interfaces activas: ${ifaces.length}`);
    for (const iface of ifaces) {
      findings.push(`  ${iface.name}: RX ${formatBytes(parseInt(iface["rx-byte"]))} TX ${formatBytes(parseInt(iface["tx-byte"]))}`);
    }
  }

  // Firewall rules count
  const fwRes = await executeCommand("/ip firewall filter print count-only");
  if (fwRes.success) {
    findings.push(`Reglas firewall: ${String(fwRes.result).trim()}`);
  }

  // NAT rules count
  const natRes = await executeCommand("/ip firewall nat print count-only");
  if (natRes.success) {
    findings.push(`Reglas NAT: ${String(natRes.result).trim()}`);
  }

  // Default route
  const routeRes = await executeCommand("/ip route print where dst-address=0.0.0.0/0 active=yes");
  if (routeRes.success && routeRes.result) {
    const routes = routeRes.result as Record<string, string>[];
    if (routes.length > 0) {
      findings.push(`Gateway activo: ${routes[0].gateway}`);
    } else {
      findings.push("SIN RUTA DEFAULT ACTIVA");
    }
  }

  return {
    category: "Estado General",
    findings,
    severity: "info",
    commands,
    solution: "Si algo no se ve bien, dime que quieres verificar en detalle.",
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}
