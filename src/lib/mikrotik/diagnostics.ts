import { executeCommand } from "./connection-server";
import { loadMikroTikConfig } from "./db";

interface DiagnosticResult {
  category: string;
  findings: string[];
  severity: "info" | "warning" | "critical";
  commands: string[];
  solution: string;
}

// Wrapper that always returns findings even on error
async function runCmd(command: string): Promise<{ result: Record<string, string>[]; error: string | null; commands: string[] }> {
  const res = await executeCommand(command);
  if (res.success && res.result) {
    console.log(`[Diagnostic] ${command}: OK (${(res.result as unknown[]).length} items)`);
    return { result: res.result as Record<string, string>[], error: null, commands: [command] };
  }
  const errMsg = res.error || "Error desconocido";
  console.log(`[Diagnostic] ${command}: FALLO - ${errMsg}`);
  return { result: [], error: errMsg, commands: [command] };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
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
  const config = loadMikroTikConfig();
  if (!config) {
    return {
      category: intent,
      findings: ["No hay configuracion de MikroTik guardada. Ve a /settings para configurar tu router."],
      severity: "critical",
      commands: [],
      solution: "Ve a /settings y configura la IP, puerto, usuario y contrasena de tu MikroTik.",
    };
  }

  console.log(`[Diagnostic] Ejecutando diagnostico: ${intent} en ${config.ip}:${config.port}`);

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

// ============ DIAGNOSTIC FUNCTIONS ============

async function diagnosticFirewall(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const cmd = await runCmd("/ip firewall filter print");
  allCommands.push(...cmd.commands);

  if (cmd.error) {
    findings.push(`Error al consultar firewall: ${cmd.error}`);
    return { category: "Firewall", findings, severity: "critical", commands: allCommands, solution: "Verifica la conexion al router y los permisos del usuario API." };
  }

  const rules = cmd.result;
  if (rules.length === 0) {
    findings.push("No hay reglas de firewall configuradas. Tu router esta ABIERTO.");
    return { category: "Firewall", findings, severity: "critical", commands: allCommands,
      solution: "AGREGA ESTAS REGLAS BASICAS:\n\n/ip firewall filter\nadd action=accept chain=input connection-state=established,related\nadd action=drop chain=input connection-state=invalid\nadd action=accept chain=input protocol=icmp\nadd action=accept chain=input in-interface=ether2\nadd action=drop chain=input in-interface=ether1" };
  }

  const firstRule = rules[0];
  const hasEstablished = firstRule["connection-state"]?.includes("established") || firstRule["connection-state"]?.includes("related");
  findings.push(hasEstablished
    ? "Primera regla OK: acepta conexiones establecidas/relacionadas."
    : "PROBLEMA: La primera regla NO acepta established/related. Esto causa alta CPU.");

  const hasDropInvalid = rules.some(r => r.action === "drop" && r["connection-state"]?.includes("invalid"));
  if (!hasDropInvalid) findings.push("FALTA: No hay regla para dropear conexiones invalidas.");

  const inputRules = rules.filter(r => r.chain === "input");
  const forwardRules = rules.filter(r => r.chain === "forward");
  findings.push(`Reglas: ${inputRules.length} input, ${forwardRules.length} forward, ${rules.length} total`);

  const lastInput = inputRules[inputRules.length - 1];
  if (lastInput && lastInput.action !== "drop") findings.push("ADVERTENCIA: La ultima regla de input no es drop.");

  // Connection count
  const connCmd = await runCmd("/ip firewall connection print count-only");
  allCommands.push(...connCmd.commands);
  if (!connCmd.error) {
    const count = String(connCmd.result).trim();
    findings.push(`Conexiones activas: ${count}`);
  }

  return { category: "Firewall", findings, severity: findings.some(f => f.includes("PROBLEMA") || f.includes("ABIERTO")) ? "critical" : findings.some(f => f.includes("ADVERTENCIA") || f.includes("FALTA")) ? "warning" : "info", commands: allCommands,
    solution: "Si necesitas agregar una regla, dime que quieres bloquear o permitir." };
}

async function diagnosticInterfaces(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const cmd = await runCmd("/interface print");
  allCommands.push(...cmd.commands);

  if (cmd.error) {
    findings.push(`Error al consultar interfaces: ${cmd.error}`);
    return { category: "Interfaces", findings, severity: "critical", commands: allCommands, solution: "Verifica la conexion al router." };
  }

  for (const iface of cmd.result) {
    const name = iface.name;
    const status = iface.running === "true" ? "UP" : "DOWN";
    const rxBytes = parseInt(iface["rx-byte"] || "0", 10);
    const txBytes = parseInt(iface["tx-byte"] || "0", 10);
    const rxE = parseInt(iface["rx-errors"] || "0", 10);
    const txE = parseInt(iface["tx-errors"] || "0", 10);
    const rxD = parseInt(iface["rx-drops"] || "0", 10);
    const txD = parseInt(iface["tx-drops"] || "0", 10);

    findings.push(`${name}: ${status} | RX ${formatBytes(rxBytes)} | TX ${formatBytes(txBytes)}`);
    if (rxE > 0 || txE > 0) findings.push(`  ERRORES en ${name}: ${rxE} RX / ${txE} TX - revisa cableado`);
    if (rxD > 100 || txD > 100) findings.push(`  DROPS en ${name}: ${rxD} RX / ${txD} TX - posible saturacion`);
  }

  const down = cmd.result.filter(i => i.running !== "true");
  if (down.length > 0) findings.push(`Interfaces caidas: ${down.map(i => i.name).join(", ")}`);

  return { category: "Interfaces", findings, severity: findings.some(f => f.includes("ERRORES")) ? "warning" : "info", commands: allCommands,
    solution: "Si hay errores, verifica cableado/SFP. Si hay drops, limita trafico con queues." };
}

async function diagnosticCPU(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const cmd = await runCmd("/system resource print");
  allCommands.push(...cmd.commands);

  if (cmd.error) {
    findings.push(`Error al obtener CPU: ${cmd.error}`);
    return { category: "CPU", findings, severity: "critical", commands: allCommands, solution: "No se pudo conectar al router. Verifica configuracion en /settings." };
  }

  const res = cmd.result[0];
  const cpuLoad = parseInt(res["cpu-load"] || "0", 10);

  findings.push(`CPU: ${cpuLoad}%`);
  if (cpuLoad > 90) findings.push("CRITICO: CPU > 90%. El router puede dejar de responder.");
  else if (cpuLoad > 70) findings.push("ALTO: CPU > 70%. Revisa procesos.");
  else findings.push("CPU normal.");

  findings.push(`Uptime: ${res.uptime || "N/A"}`);
  findings.push(`RouterOS: ${res.version || "N/A"}`);

  return { category: "CPU", findings, severity: cpuLoad > 90 ? "critical" : cpuLoad > 70 ? "warning" : "info", commands: allCommands,
    solution: cpuLoad > 90 ? "Ejecuta /tool profile duration=15 para identificar proceso. Causas comunes: firewall mal ordenado, BGP full table, DDoS." : "CPU estable." };
}

async function diagnosticMemory(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const cmd = await runCmd("/system resource print");
  allCommands.push(...cmd.commands);

  if (cmd.error) {
    findings.push(`Error al obtener memoria: ${cmd.error}`);
    return { category: "Memoria", findings, severity: "critical", commands: allCommands, solution: "Verifica conexion al router." };
  }

  const res = cmd.result[0];
  const free = parseInt(res["free-memory"] || "0", 10);
  const total = parseInt(res["total-memory"] || "0", 10);
  const usedPct = total > 0 ? ((total - free) / total * 100) : 0;

  findings.push(`Memoria: ${formatBytes(free)} libre de ${formatBytes(total)} (${usedPct.toFixed(0)}% usado)`);
  if (usedPct > 95) findings.push("CRITICO: Memoria casi agotada.");
  else if (usedPct > 80) findings.push("ALTO: Memoria > 80%.");
  else findings.push("Memoria OK.");

  return { category: "Memoria", findings, severity: usedPct > 95 ? "critical" : usedPct > 80 ? "warning" : "info", commands: allCommands,
    solution: usedPct > 80 ? "Deshabilita paquetes innecesarios: /system package disable hotspot,mls,ppp,wireless" : "Memoria estable." };
}

async function diagnosticRoutes(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const cmd = await runCmd("/ip route print");
  allCommands.push(...cmd.commands);

  if (cmd.error) {
    findings.push(`Error al obtener rutas: ${cmd.error}`);
    return { category: "Rutas", findings, severity: "critical", commands: allCommands, solution: "Verifica conexion al router." };
  }

  const routes = cmd.result;
  const defaults = routes.filter(r => r["dst-address"] === "0.0.0.0/0");
  findings.push(`Rutas: ${routes.length} total, ${defaults.length} default`);

  for (const dr of defaults) {
    const active = dr["active"] === "true" ? "ACTIVA" : "inactiva";
    findings.push(`Default via ${dr.gateway} (${active})`);
  }

  if (defaults.length === 0) findings.push("CRITICO: Sin ruta default. No hay internet.");

  return { category: "Rutas", findings, severity: defaults.length === 0 ? "critical" : "info", commands: allCommands,
    solution: defaults.length === 0 ? "Agrega: /ip route add dst-address=0.0.0.0/0 gateway=IP_GATEWAY" : "Rutas OK." };
}

async function diagnosticNAT(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const cmd = await runCmd("/ip firewall nat print");
  allCommands.push(...cmd.commands);

  if (cmd.error) {
    findings.push(`Error al obtener NAT: ${cmd.error}`);
    return { category: "NAT", findings, severity: "critical", commands: allCommands, solution: "Verifica conexion." };
  }

  const rules = cmd.result;
  const masq = rules.filter(r => r.action === "masquerade");
  const dstNat = rules.filter(r => r.action === "dst-nat");
  findings.push(`NAT: ${masq.length} masquerade, ${dstNat.length} port forwards, ${rules.length} total`);

  if (masq.length === 0 && rules.filter(r => r.action === "src-nat").length === 0) {
    findings.push("CRITICO: Sin NAT. Los clientes no tendran internet.");
  }

  return { category: "NAT", findings, severity: findings.some(f => f.includes("CRITICO")) ? "critical" : "info", commands: allCommands,
    solution: "Si falta NAT: /ip firewall nat add action=masquerade chain=srcnat out-interface=ether1" };
}

async function diagnosticDNS(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const cmd = await runCmd("/ip dns print");
  allCommands.push(...cmd.commands);

  if (cmd.error) {
    findings.push(`Error al obtener DNS: ${cmd.error}`);
    return { category: "DNS", findings, severity: "critical", commands: allCommands, solution: "Verifica conexion." };
  }

  const dns = cmd.result[0];
  findings.push(`DNS servers: ${dns?.servers || "No configurados"}`);

  return { category: "DNS", findings, severity: "info", commands: allCommands,
    solution: "Si no hay DNS: /ip dns set servers=8.8.8.8,8.8.4.4 allow-remote-requests=yes" };
}

async function diagnosticDHCP(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const cmd = await runCmd("/ip dhcp-server print");
  allCommands.push(...cmd.commands);

  if (cmd.error) {
    findings.push(`Error al obtener DHCP: ${cmd.error}`);
    return { category: "DHCP", findings, severity: "critical", commands: allCommands, solution: "Verifica conexion." };
  }

  findings.push(`DHCP servers: ${cmd.result.length}`);
  for (const s of cmd.result) {
    findings.push(`  ${s.name}: ${s.interface} - ${s.disabled === "true" ? "OFF" : "ON"}`);
  }

  return { category: "DHCP", findings, severity: "info", commands: allCommands, solution: "Si falta DHCP: /ip dhcp-server setup" };
}

async function diagnosticQueues(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const cmd = await runCmd("/queue simple print");
  allCommands.push(...cmd.commands);

  if (cmd.error) {
    findings.push(`Error al obtener queues: ${cmd.error}`);
    return { category: "Queues", findings, severity: "critical", commands: allCommands, solution: "Verifica conexion." };
  }

  findings.push(`Simple queues: ${cmd.result.length}`);
  for (const q of cmd.result.slice(0, 5)) {
    findings.push(`  ${q.name}: ${q["max-limit"] || "sin limite"}`);
  }

  return { category: "Queues", findings, severity: "info", commands: allCommands, solution: "Para limitar: /queue simple add max-limit=10M/10M name=limite target=192.168.1.0/24" };
}

async function diagnosticLogs(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const cmd = await runCmd("/log print last=15");
  allCommands.push(...cmd.commands);

  if (cmd.error) {
    findings.push(`Error al obtener logs: ${cmd.error}`);
    return { category: "Logs", findings, severity: "critical", commands: allCommands, solution: "Verifica conexion." };
  }

  const logs = cmd.result;
  const errors = logs.filter(l => l.topics?.includes("error") || l.topics?.includes("critical"));
  findings.push(`Logs: ${logs.length} recientes, ${errors.length} errores`);

  for (const log of logs.slice(0, 10)) {
    findings.push(`[${log.time || ""}] ${log.message || ""}`);
  }

  return { category: "Logs", findings, severity: errors.length > 0 ? "warning" : "info", commands: allCommands,
    solution: errors.length > 0 ? "Revisa los errores mostrados arriba." : "Logs limpios." };
}

async function diagnosticConnectivity(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const pingCmd = await runCmd("/ping 8.8.8.8 count=3");
  allCommands.push(...pingCmd.commands);
  findings.push(pingCmd.error ? "SIN INTERNET: No se puede alcanzar 8.8.8.8" : "Internet OK: 8.8.8.8 alcanzable");

  return { category: "Conectividad", findings, severity: pingCmd.error ? "critical" : "info", commands: allCommands,
    solution: pingCmd.error ? "Verifica: 1) Ruta default  2) NAT masquerade  3) Firewall" : "Conectividad OK." };
}

async function diagnosticSecurity(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  const svcCmd = await runCmd("/ip service print");
  allCommands.push(...svcCmd.commands);

  if (!svcCmd.error) {
    for (const svc of svcCmd.result) {
      if (svc.disabled !== "true") {
        const addr = svc.address ? ` (${svc.address})` : " ABIERTO";
        findings.push(`${svc.name} puerto ${svc.port}: activo${addr}`);
      }
    }
    if (svcCmd.result.some(s => s.name === "telnet" && s.disabled !== "true"))
      findings.push("PELIGRO: Telnet activo. Deshabilitalo: /ip service disable telnet");
  }

  const userCmd = await runCmd("/user print");
  allCommands.push(...userCmd.commands);
  if (!userCmd.error) {
    findings.push(`Usuarios: ${userCmd.result.length}`);
    if (userCmd.result.some(u => u.name === "admin"))
      findings.push("ADVERTENCIA: Usuario admin existe. Cambia nombre o crea uno nuevo.");
  }

  return { category: "Seguridad", findings, severity: findings.some(f => f.includes("PELIGRO")) ? "critical" : findings.some(f => f.includes("ADVERTENCIA")) ? "warning" : "info", commands: allCommands,
    solution: "Deshabilita servicios innecesarios y crea usuarios personalizados." };
}

async function diagnosticOverview(): Promise<DiagnosticResult> {
  const findings: string[] = [];
  const allCommands: string[] = [];

  // System
  const resCmd = await runCmd("/system resource print");
  allCommands.push(...resCmd.commands);
  if (resCmd.error) {
    findings.push(`ERROR: No se pudo conectar al router: ${resCmd.error}`);
    return { category: "Estado General", findings, severity: "critical", commands: allCommands, solution: "Verifica la configuracion en /settings y los permisos del usuario." };
  }

  const res = resCmd.result[0];
  findings.push(`RouterOS: ${res.version} | CPU: ${res["cpu-load"]}% | RAM: ${formatBytes(parseInt(res["free-memory"]))}/${formatBytes(parseInt(res["total-memory"]))} | Uptime: ${res.uptime}`);

  // Identity
  const idCmd = await runCmd("/system identity print");
  allCommands.push(...idCmd.commands);
  if (!idCmd.error) findings.push(`Nombre: ${idCmd.result[0]?.name || "MikroTik"}`);

  // Interfaces
  const ifCmd = await runCmd("/interface print");
  allCommands.push(...ifCmd.commands);
  if (!ifCmd.error) {
    const up = ifCmd.result.filter(i => i.running === "true");
    findings.push(`Interfaces: ${up.length}/${ifCmd.result.length} activas`);
    for (const i of up) {
      findings.push(`  ${i.name}: RX ${formatBytes(parseInt(i["rx-byte"]))} TX ${formatBytes(parseInt(i["tx-byte"]))}`);
    }
  }

  // Firewall
  const fwCmd = await runCmd("/ip firewall filter print count-only");
  allCommands.push(...fwCmd.commands);
  if (!fwCmd.error) findings.push(`Reglas firewall: ${String(fwCmd.result).trim()}`);

  // NAT
  const natCmd = await runCmd("/ip firewall nat print count-only");
  allCommands.push(...natCmd.commands);
  if (!natCmd.error) findings.push(`Reglas NAT: ${String(natCmd.result).trim()}`);

  // Default route
  const rtCmd = await runCmd("/ip route print where dst-address=0.0.0.0/0 active=yes");
  allCommands.push(...rtCmd.commands);
  if (!rtCmd.error) {
    const activeRt = rtCmd.result;
    findings.push(activeRt.length > 0 ? `Gateway: ${activeRt[0].gateway}` : "SIN GATEWAY ACTIVO");
  }

  return { category: "Estado General", findings, severity: "info", commands: allCommands, solution: "Si algo no se ve bien, dime que quieres verificar en detalle." };
}
