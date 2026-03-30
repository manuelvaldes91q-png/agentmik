import { executeCommand } from "./connection-server";
import { loadMikroTikConfig } from "./db";

interface DiagnosticResult {
  category: string;
  findings: string[];
  severity: "info" | "warning" | "critical";
  commands: string[];
  solution: string;
}

async function runCmd(command: string, params: string[] = []): Promise<{ result: Record<string, string>[]; error: string | null; commands: string[] }> {
  const fullCmd = params.length > 0 ? `${command} ${params.join(" ")}` : command;
  const res = await executeCommand(command, params);
  if (res.success && res.result) {
    console.log(`[Diagnostic] ${fullCmd}: OK (${(res.result as unknown[]).length} items)`);
    return { result: res.result as Record<string, string>[], error: null, commands: [fullCmd] };
  }
  const errMsg = res.error || "Error desconocido";
  console.log(`[Diagnostic] ${fullCmd}: FALLO - ${errMsg}`);
  return { result: [], error: errMsg, commands: [fullCmd] };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

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

export async function runDiagnostic(intent: string): Promise<DiagnosticResult> {
  const config = loadMikroTikConfig();
  if (!config) {
    return { category: intent, findings: ["No hay configuracion. Ve a /settings."], severity: "critical", commands: [], solution: "Configura tu router en /settings." };
  }
  console.log(`[Diagnostic] ${intent} en ${config.ip}:${config.port}`);
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
    default: return { category: intent, findings: ["No reconozco ese diagnostico."], severity: "info", commands: [], solution: "Prueba: firewall, interfaces, cpu, memoria, rutas, nat, dns, seguridad, estado general." };
  }
}

// ============ DIAGNOSTICS ============

async function diagnosticFirewall(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/ip/firewall/filter/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Firewall", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion y permisos." };
  if (cmd.result.length === 0) return { category: "Firewall", findings: ["Sin reglas. Router ABIERTO."], severity: "critical", commands: c, solution: "/ip firewall filter\nadd action=accept chain=input connection-state=established,related\nadd action=drop chain=input connection-state=invalid\nadd action=drop chain=input in-interface=ether1" };
  const ok = cmd.result[0]["connection-state"]?.includes("established");
  f.push(ok ? "Primera regla OK: established/related." : "PROBLEMA: Primera regla no acepta established/related.");
  f.push(`Reglas: ${cmd.result.length} total`);
  return { category: "Firewall", findings: f, severity: f.some(x => x.includes("PROBLEMA")) ? "critical" : "info", commands: c, solution: "Dime que quieres bloquear/permitir." };
}

async function diagnosticInterfaces(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/interface/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Interfaces", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };
  for (const i of cmd.result) {
    f.push(`${i.name}: ${i.running === "true" ? "UP" : "DOWN"} | RX ${formatBytes(parseInt(i["rx-byte"] || "0"))} TX ${formatBytes(parseInt(i["tx-byte"] || "0"))}`);
  }
  return { category: "Interfaces", findings: f, severity: "info", commands: c, solution: "Si hay errores, revisa cableado." };
}

async function diagnosticCPU(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/system/resource/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "CPU", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };
  const res = cmd.result[0]; const cpu = parseInt(res["cpu-load"] || "0");
  f.push(`CPU: ${cpu}%`); f.push(`Uptime: ${res.uptime} | v${res.version}`);
  return { category: "CPU", findings: f, severity: cpu > 90 ? "critical" : cpu > 70 ? "warning" : "info", commands: c, solution: cpu > 70 ? "Ejecuta /tool profile para identificar proceso." : "CPU estable." };
}

async function diagnosticMemory(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/system/resource/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Memoria", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };
  const res = cmd.result[0]; const free = parseInt(res["free-memory"] || "0"), total = parseInt(res["total-memory"] || "0");
  const pct = total > 0 ? ((total - free) / total * 100) : 0;
  f.push(`RAM: ${formatBytes(free)} libre / ${formatBytes(total)} (${pct.toFixed(0)}%)`);
  return { category: "Memoria", findings: f, severity: pct > 90 ? "critical" : pct > 80 ? "warning" : "info", commands: c, solution: pct > 80 ? "Deshabilita paquetes innecesarios." : "RAM OK." };
}

async function diagnosticRoutes(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/ip/route/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Rutas", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };
  const def = cmd.result.filter(r => r["dst-address"] === "0.0.0.0/0");
  f.push(`Rutas: ${cmd.result.length} | Default: ${def.length}`);
  for (const d of def) f.push(`Via ${d.gateway} (${d["active"] === "true" ? "ACTIVA" : "inactiva"})`);
  return { category: "Rutas", findings: f, severity: def.length === 0 ? "critical" : "info", commands: c, solution: def.length === 0 ? "/ip route add dst-address=0.0.0.0/0 gateway=TU_GATEWAY" : "Rutas OK." };
}

async function diagnosticNAT(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/ip/firewall/nat/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "NAT", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };
  const masq = cmd.result.filter(r => r.action === "masquerade");
  f.push(`NAT: ${masq.length} masquerade, ${cmd.result.length} total`);
  return { category: "NAT", findings: f, severity: cmd.result.length === 0 ? "critical" : "info", commands: c, solution: cmd.result.length === 0 ? "/ip firewall nat add action=masquerade chain=srcnat out-interface=ether1" : "NAT OK." };
}

async function diagnosticDNS(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/ip/dns/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "DNS", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };
  f.push(`DNS: ${cmd.result[0]?.servers || "No configurado"}`);
  return { category: "DNS", findings: f, severity: "info", commands: c, solution: "/ip dns set servers=8.8.8.8" };
}

async function diagnosticDHCP(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/ip/dhcp-server/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "DHCP", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };
  f.push(`DHCP servers: ${cmd.result.length}`);
  return { category: "DHCP", findings: f, severity: "info", commands: c, solution: "Si falta: /ip dhcp-server setup" };
}

async function diagnosticQueues(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/queue/simple/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Queues", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };
  f.push(`Queues: ${cmd.result.length}`);
  for (const q of cmd.result.slice(0, 5)) f.push(`  ${q.name}: ${q["max-limit"] || "sin limite"}`);
  return { category: "Queues", findings: f, severity: "info", commands: c, solution: "Para limitar: /queue simple add max-limit=10M/10M name=limite target=192.168.1.0/24" };
}

async function diagnosticLogs(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/log/print", ["=.proplist=time,message,topics", "=limit=15"]);
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Logs", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };
  const errs = cmd.result.filter(l => l.topics?.includes("error"));
  f.push(`Logs: ${cmd.result.length} recientes, ${errs.length} errores`);
  for (const l of cmd.result.slice(0, 10)) f.push(`[${l.time || ""}] ${l.message || ""}`);
  return { category: "Logs", findings: f, severity: errs.length > 0 ? "warning" : "info", commands: c, solution: errs.length > 0 ? "Revisa errores." : "Logs limpios." };
}

async function diagnosticConnectivity(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const cmd = await runCmd("/ping", ["=address=8.8.8.8", "=count=3"]);
  c.push(...cmd.commands);
  f.push(cmd.error ? "SIN INTERNET" : "Internet OK");
  return { category: "Conectividad", findings: f, severity: cmd.error ? "critical" : "info", commands: c, solution: cmd.error ? "Verifica ruta, NAT, firewall." : "Conectividad OK." };
}

async function diagnosticSecurity(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const svcCmd = await runCmd("/ip/service/print");
  c.push(...svcCmd.commands);
  if (!svcCmd.error) {
    for (const s of svcCmd.result) if (s.disabled !== "true") f.push(`${s.name} puerto ${s.port}: ${s.address || "ABIERTO"}`);
    if (svcCmd.result.some(s => s.name === "telnet" && s.disabled !== "true")) f.push("PELIGRO: Telnet activo");
  }
  const usrCmd = await runCmd("/user/print");
  c.push(...usrCmd.commands);
  if (!usrCmd.error) { f.push(`Usuarios: ${usrCmd.result.length}`); if (usrCmd.result.some(u => u.name === "admin")) f.push("ADVERTENCIA: admin existe"); }
  return { category: "Seguridad", findings: f, severity: f.some(x => x.includes("PELIGRO")) ? "critical" : f.some(x => x.includes("ADVERTENCIA")) ? "warning" : "info", commands: c, solution: "Deshabilita telnet/ftp, crea usuario personalizado." };
}

async function diagnosticOverview(): Promise<DiagnosticResult> {
  const f: string[] = []; const c: string[] = [];
  const resCmd = await runCmd("/system/resource/print");
  c.push(...resCmd.commands);
  if (resCmd.error) return { category: "Estado General", findings: [`ERROR: ${resCmd.error}`], severity: "critical", commands: c, solution: "No se pudo conectar. Verifica /settings." };
  const res = resCmd.result[0];
  f.push(`RouterOS: ${res.version} | CPU: ${res["cpu-load"]}% | RAM: ${formatBytes(parseInt(res["free-memory"]))}/${formatBytes(parseInt(res["total-memory"]))} | Uptime: ${res.uptime}`);
  const idCmd = await runCmd("/system/identity/print");
  c.push(...idCmd.commands);
  if (!idCmd.error) f.push(`Nombre: ${idCmd.result[0]?.name || "MikroTik"}`);
  const ifCmd = await runCmd("/interface/print");
  c.push(...ifCmd.commands);
  if (!ifCmd.error) { const up = ifCmd.result.filter(i => i.running === "true"); f.push(`Interfaces: ${up.length}/${ifCmd.result.length} activas`); for (const i of up) f.push(`  ${i.name}: RX ${formatBytes(parseInt(i["rx-byte"]))} TX ${formatBytes(parseInt(i["tx-byte"]))}`); }
  const fwCmd = await runCmd("/ip/firewall/filter/print");
  c.push(...fwCmd.commands);
  if (!fwCmd.error) f.push(`Firewall: ${fwCmd.result.length} reglas`);
  const natCmd = await runCmd("/ip/firewall/nat/print");
  c.push(...natCmd.commands);
  if (!natCmd.error) f.push(`NAT: ${natCmd.result.length} reglas`);
  return { category: "Estado General", findings: f, severity: "info", commands: c, solution: "Si algo no se ve bien, dime que verificar." };
}
