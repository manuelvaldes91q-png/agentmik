import { executeCommand } from "./connection-server";
import { loadMikroTikConfig } from "./db";
import { runComprehensiveHealthCheck } from "./health-analyzer";

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

function fmt(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function sev(f: string[]): "info" | "warning" | "critical" {
  if (f.some(x => x.includes("PELIGRO") || x.includes("CRITICO"))) return "critical";
  if (f.some(x => x.includes("PROBLEMA"))) return "critical";
  if (f.some(x => x.includes("ADVERTENCIA") || x.includes("ALERTA"))) return "warning";
  return "info";
}

export function detectDiagnosticIntent(message: string): string | null {
  const l = message.toLowerCase();
  if (l.match(/firewall|filtro|filter|regla|bloqueo|drop|accept/)) return "firewall";
  if (l.match(/interfaz|interface|ethernet|ether|puerto|link|conexion fisica/)) return "interfaces";
  if (l.match(/cpu|procesador|lento|rendimiento|performance|saturado/)) return "cpu";
  if (l.match(/memoria|ram|memory|almacenamiento/)) return "memory";
  if (l.match(/ruta|route|routing|gateway|enrutamiento/)) return "routes";
  if (l.match(/nat|masquerade|src-nat|dst-nat|port forward/)) return "nat";
  if (l.match(/dns|resolucion|resolver/)) return "dns";
  if (l.match(/dhcp|ip dinamica|lease/)) return "dhcp";
  if (l.match(/queue|cola|bandwidth|ancho de banda|limitar|qos/)) return "queues";
  if (l.match(/log|registro|evento|mensaje/)) return "logs";
  if (l.match(/conectividad|ping|test|prueba|internet|funciona/)) return "connectivity";
  if (l.match(/seguridad|security|ataque|ddos|brute|intruso/)) return "security";
  if (l.match(/salud|health|check|chequeo|calificacion|nota|puntaje|score/)) return "health";
  if (l.match(/prediccion|predice|futura|falla|problema futuro|tendencia/)) return "health";
  if (l.match(/todo|completo|general|estado|status|resumen/)) return "overview";
  return null;
}

export async function runDiagnostic(intent: string): Promise<DiagnosticResult> {
  const config = loadMikroTikConfig();
  if (!config) return { category: intent, findings: ["No hay configuracion. Ve a /settings."], severity: "critical", commands: [], solution: "Configura tu router en /settings." };
  console.log(`[Diagnostic] ${intent} en ${config.ip}:${config.port}`);
  const map: Record<string, () => Promise<DiagnosticResult>> = {
    firewall: diagnosticFirewall, interfaces: diagnosticInterfaces, cpu: diagnosticCPU,
    memory: diagnosticMemory, routes: diagnosticRoutes, nat: diagnosticNAT,
    dns: diagnosticDNS, dhcp: diagnosticDHCP, queues: diagnosticQueues,
    logs: diagnosticLogs, connectivity: diagnosticConnectivity,
    security: diagnosticSecurity, overview: diagnosticOverview,
    health: diagnosticHealth,
  };
  return (map[intent] || (() => Promise.resolve({ category: intent, findings: ["No reconozco ese diagnostico."], severity: "info" as const, commands: [], solution: "Prueba: firewall, interfaces, cpu, memoria, rutas, nat, dns, seguridad." })))();
}

// ======================== FIREWALL ========================
async function diagnosticFirewall(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];
  const cmd = await runCmd("/ip/firewall/filter/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Firewall", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion y permisos." };

  const rules = cmd.result;
  if (rules.length === 0) {
    return { category: "Firewall", findings: ["CRITICO: Sin reglas. Router ABIERTO."], severity: "critical", commands: c,
      solution: "EJECUTA ESTO AHORA:\n/ip firewall filter add action=accept chain=input connection-state=established,related\n/ip firewall filter add action=drop chain=input connection-state=invalid\n/ip firewall filter add action=accept chain=input protocol=icmp limit=50,5:packet\n/ip firewall filter add action=drop chain=input" };
  }

  const input = rules.filter(r => (r.chain || "input") === "input");
  const forward = rules.filter(r => r.chain === "forward");
  f.push(`${rules.length} reglas: ${input.length} input, ${forward.length} forward`);

  // Orden critico
  const first = input[0];
  const hasEst = first && (first["connection-state"] || "").includes("established");
  f.push(hasEst ? "OK: Primera regla = established/related" : "PROBLEMA: Primera regla NO es established/related. Esto causa alta CPU.");
  if (!hasEst) s.push(`/ip firewall filter move [find connection-state~"established"] 0`);

  const dropInv = input.findIndex(r => r.action === "drop" && (r["connection-state"] || "").includes("invalid"));
  if (dropInv === -1) { f.push("PROBLEMA: Sin drop invalid."); s.push("/ip firewall filter add action=drop chain=input connection-state=invalid place-after=[find connection-state~\"established\"]"); }
  else if (dropInv > 2) f.push(`ADVERTENCIA: Drop invalid en pos ${dropInv} (deberia ser 1-2)`);

  // Puertos abiertos
  const dangerousPorts = input.filter(r => r.action === "accept" && r["dst-port"] && !r["src-address"]);
  for (const r of dangerousPorts) {
    const port = r["dst-port"] || "";
    if (port.match(/22|8291|23|21|80|443/)) {
      f.push(`PELIGRO: Puerto ${port} (${r.protocol || "tcp"}) aceptado sin restriccion de IP.`);
      s.push(`/ip firewall filter set ${r[".id"] || "[find dst-port=\"" + port + "\"]"} src-address=TU_IP_PUBLICA`);
    }
  }

  // ICMP sin limite
  const icmpBad = input.find(r => r.protocol === "icmp" && r.action === "accept" && !r["limit"]);
  if (icmpBad) { f.push("ADVERTENCIA: ICMP sin limite."); s.push("/ip firewall filter add action=accept chain=input protocol=icmp limit=50,5:packet"); }

  // Drop final
  const last = input[input.length - 1];
  if (last && last.action !== "drop") { f.push("PROBLEMA: Ultima regla NO es drop."); s.push("/ip firewall filter add action=drop chain=input comment=\"Drop all\""); }

  if (!s.length) s.push("Firewall bien configurado. No se requieren cambios.");

  return { category: "Firewall", findings: f, severity: sev(f), commands: c, solution: s.map((x,i) => x.startsWith("/") ? `SOLUCION #${i+1}:\n  ${x}` : x).join("\n\n") };
}

// ======================== INTERFACES ========================
async function diagnosticInterfaces(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];
  const cmd = await runCmd("/interface/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Interfaces", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };

  for (const i of cmd.result) {
    const st = i.running === "true" ? "UP" : "DOWN";
    const rx = parseInt(i["rx-byte"] || "0"), tx = parseInt(i["tx-byte"] || "0");
    const rxE = parseInt(i["rx-errors"] || "0"), txE = parseInt(i["tx-errors"] || "0");
    const rxD = parseInt(i["rx-drops"] || "0"), txD = parseInt(i["tx-drops"] || "0");

    f.push(`${i.name}: ${st} | RX ${fmt(rx)} TX ${fmt(tx)}`);
    if (rxE > 0 || txE > 0) { f.push(`  PROBLEMA: ${rxE} errores RX, ${txE} errores TX - cable o SFP dañado`); s.push(`/interface ethernet monitor ${i.name} once`); }
    if (rxD > 1000 || txD > 1000) { f.push(`  ALERTA: ${rxD} drops RX, ${txD} drops TX - posible saturacion`); s.push(`Revisa queues y limita trafico en ${i.name}`); }
  }

  const down = cmd.result.filter(i => i.running !== "true" && !i.name.includes("bridge"));
  if (down.length > 0) { f.push(`Interfaces caidas: ${down.map(i => i.name).join(", ")}`); s.push("Verifica cables y configuracion de las interfaces caidas."); }

  // MTU check
  const mtuIssues = cmd.result.filter(i => i.mtu && parseInt(i.mtu) < 1500 && i.type === "ether");
  for (const i of mtuIssues) { f.push(`ADVERTENCIA: ${i.name} MTU=${i.mtu} (default 1500). Puede causar fragmentacion.`); s.push(`/interface ethernet set ${i.name} mtu=1500`); }

  if (!s.length) s.push("Interfaces OK. No se detectaron problemas.");
  return { category: "Interfaces", findings: f, severity: sev(f), commands: c, solution: s.join("\n\n") };
}

// ======================== CPU ========================
async function diagnosticCPU(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];
  const resCmd = await runCmd("/system/resource/print");
  c.push(...resCmd.commands);
  if (resCmd.error) return { category: "CPU", findings: [`Error: ${resCmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };

  const res = resCmd.result[0];
  const cpu = parseInt(res["cpu-load"] || "0");
  f.push(`CPU: ${cpu}% | Uptime: ${res.uptime} | RouterOS: ${res.version}`);

  if (cpu > 50) {
    f.push("");
    f.push("=== EJECUTANDO /tool/profile (15 segundos)... ===");

    // Actually run tool profile
    const profCmd = await runCmd("/tool/profile", ["=duration=15"]);
    c.push(...profCmd.commands);

    if (!profCmd.error && profCmd.result.length > 0) {
      f.push("Procesos que consumen CPU:");
      // Sort by CPU usage
      const sorted = profCmd.result
        .filter(p => p.name && p["cpu-usage"])
        .sort((a, b) => parseInt(b["cpu-usage"] || "0") - parseInt(a["cpu-usage"] || "0"));

      for (const p of sorted) {
        const usage = parseInt(p["cpu-usage"] || "0");
        const name = p.name;
        f.push(`  ${name}: ${usage}%`);

        // Provide specific solution based on process
        if (name === "firewall" && usage > 30) {
          f.push("    -> Firewall consume mucho CPU.");
          s.push("CAUSA: Reglas mal ordenadas o demasiadas reglas.");
          s.push("SOLUCION firewall:");
          s.push("  1. Mueve established/related al inicio: /ip firewall filter move [find connection-state~\"established\"] 0");
          s.push("  2. Mueve drop invalid despues: /ip firewall filter move [find connection-state~\"invalid\"] 1");
          s.push("  3. Usa address-lists en lugar de reglas individuales");
          s.push("  4. Habilita FastTrack: /ip firewall filter add action=fasttrack-connection chain=forward connection-state=established,related");
        }
        if (name === "networking" && usage > 30) {
          f.push("    -> Networking consume mucho CPU. Posible DDoS o flood.");
          s.push("CAUSA: Muchas conexiones o paquetes por segundo.");
          s.push("SOLUCION networking:");
          s.push("  1. Revisa conexiones: /ip firewall connection print count-only");
          s.push("  2. Si > 10000, hay ataque. Bloquea: /ip firewall filter add action=drop chain=forward src-address-list=ddos");
          s.push("  3. Limita SYN: /ip firewall filter add action=drop chain=forward protocol=tcp connection-state=new connection-limit=100/30s");
        }
        if (name === "routing" && usage > 20) {
          f.push("    -> Routing consume mucho CPU. Posible BGP full table.");
          s.push("CAUSA: BGP recibiendo muchos prefijos o OSPF reconvergiendo.");
          s.push("SOLUCION routing:");
          s.push("  1. Revisa BGP: /routing bgp peer print stats");
          s.push("  2. Limita prefijos: /routing bgp peer set [find] prefix-limit=100000");
          s.push("  3. Si no necesitas full route, filtra: /routing filter add chain=bgp-in rule=\"if (dst-len > 24) { reject }\"");
        }
        if (name === "management" && usage > 20) {
          f.push("    -> Management consume CPU. Winbox/API abierto a internet.");
          s.push("CAUSA: Escaneo de puertos o acceso masivo a API/Winbox.");
          s.push("SOLUCION management:");
          s.push("  1. Restringe API: /ip service set api address=IP_DE_TU_SERVIDOR");
          s.push("  2. Restringe Winbox: /ip service set winbox address=192.168.1.0/24");
        }
        if (name === "crypto" && usage > 20) {
          f.push("    -> Crypto consume CPU. Muchas conexiones VPN o IPsec.");
          s.push("CAUSA: VPN/IPsec procesando mucho trafico cifrado.");
          s.push("SOLUCION crypto:");
          s.push("  1. Usa hardware con soporte de cifrado por hardware");
          s.push("  2. Reduce tuneles VPN activos");
        }
        if (name === "queuing" && usage > 20) {
          f.push("    -> Queuing consume CPU. Demasiadas queues simples.");
          s.push("CAUSA: Muchas queues simples procesando cada paquete.");
          s.push("SOLUCION queuing:");
          s.push("  1. Usa PCQ en lugar de queues individuales");
          s.push("  2. Reduce queues simples: /queue simple remove [find target~\"192.168\"]");
          s.push("  3. Agrega PCQ: /queue type add name=pcq-down kind=pcq pcq-classifier=dst-address pcq-rate=5M");
        }
      }

      if (sorted.length === 0) {
        f.push("No se pudieron identificar procesos. Ejecuta manualmente: /tool profile duration=15");
      }
    } else {
      f.push(`No se pudo ejecutar /tool/profile: ${profCmd.error || "error desconocido"}`);
      s.push("Ejecuta manualmente: /tool profile duration=15 y dime los resultados.");
    }

    // Also check connection count
    const connCmd = await runCmd("/ip/firewall/connection/print", ["=count-only"]);
    c.push(...connCmd.commands);
    if (!connCmd.error) {
      const count = connCmd.result.length;
      f.push(`Conexiones activas: ${count}`);
      if (count > 10000) { f.push("ALERTA: Demasiadas conexiones. Posible ataque."); s.push("/ip firewall filter add action=drop chain=forward src-address-list=ddos-flood"); }
    }

    // Check firewall rule count
    const fwCmd = await runCmd("/ip/firewall/filter/print", ["=count-only"]);
    c.push(...fwCmd.commands);
    if (!fwCmd.error) {
      const fwCount = fwCmd.result.length;
      f.push(`Reglas firewall: ${fwCount}`);
      if (fwCount > 100) s.push("Demasiadas reglas. Usa address-lists y jump rules para agrupar.");
    }

  } else if (cpu > 30) {
    f.push("CPU moderada. Normal para la mayoria de operaciones.");
    s.push("CPU estable. No se requiere accion.");
  } else {
    f.push("CPU baja. Router con recursos disponibles.");
    s.push("CPU optima.");
  }

  if (!s.length) s.push("No se detectaron problemas de CPU.");
  return { category: "CPU", findings: f, severity: cpu > 90 ? "critical" : cpu > 70 ? "warning" : "info", commands: c, solution: s.join("\n") };
}

// ======================== MEMORY ========================
async function diagnosticMemory(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];
  const resCmd = await runCmd("/system/resource/print");
  c.push(...resCmd.commands);
  if (resCmd.error) return { category: "Memoria", findings: [`Error: ${resCmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };

  const res = resCmd.result[0];
  const free = parseInt(res["free-memory"] || "0"), total = parseInt(res["total-memory"] || "0");
  const used = total - free, pct = total > 0 ? (used / total * 100) : 0;

  f.push(`RAM: ${fmt(free)} libre / ${fmt(total)} total (${pct.toFixed(0)}% usado)`);

  if (pct > 95) {
    f.push("CRITICO: Memoria casi agotada. Riesgo de reinicio.");
    s.push("PASO 1: Revisa paquetes: /system package print");
    s.push("PASO 2: Deshabilita innecesarios: /system package disable hotspot,mls,ppp,wireless");
    s.push("PASO 3: Reinicia: /system reboot");
  } else if (pct > 80) {
    f.push("ADVERTENCIA: Memoria > 80%.");
    s.push("Revisa paquetes: /system package print");
    s.push("Deshabilita los que no uses: /system package disable <nombre>");
  } else if (pct > 60) {
    f.push("Memoria moderada.");
    s.push("Memoria OK. Monitorea periodicamente.");
  } else {
    f.push("Memoria baja. Recursos disponibles.");
    s.push("RAM optima.");
  }

  // BGP full table uses a lot of RAM
  const bgpCmd = await runCmd("/routing/bgp/peer/print");
  c.push(...bgpCmd.commands);
  if (!bgpCmd.error) {
    const fullTable = bgpCmd.result.filter(p => parseInt(p["prefix-count"] || "0") > 10000);
    if (fullTable.length > 0) {
      f.push("ALERTA: BGP con full route table consume mucha RAM.");
      s.push("Limita prefijos: /routing bgp peer set [find] prefix-limit=100000");
    }
  }

  return { category: "Memoria", findings: f, severity: pct > 95 ? "critical" : pct > 80 ? "warning" : "info", commands: c, solution: s.join("\n") };
}

// ======================== ROUTES ========================
async function diagnosticRoutes(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];
  const cmd = await runCmd("/ip/route/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Rutas", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };

  const routes = cmd.result;
  const defaults = routes.filter(r => r["dst-address"] === "0.0.0.0/0");
  const staticR = routes.filter(r => r["static"] === "true");
  const dynamic = routes.filter(r => r["dynamic"] === "true");
  const unreachable = routes.filter(r => r["unreachable"] === "true");

  f.push(`Rutas: ${routes.length} total (${staticR.length} estaticas, ${dynamic.length} dinamicas)`);
  f.push(`Default routes: ${defaults.length}`);

  for (const d of defaults) {
    const active = d["active"] === "true" ? "ACTIVA" : "INACTIVA";
    const distance = d["distance"] || "?";
    f.push(`  Via ${d.gateway} (${active}, distance=${distance}, ${d["routing-mark"] || "main"})`);
  }

  if (defaults.length === 0) {
    f.push("CRITICO: Sin ruta default. No hay internet.");
    s.push("/ip route add dst-address=0.0.0.0/0 gateway=IP_DE_TU_GATEWAY");
  } else if (defaults.length === 1) {
    const d = defaults[0];
    if (d["active"] !== "true") {
      f.push("PROBLEMA: Ruta default INACTIVA. Gateway inalcanzable.");
      s.push("Verifica que el gateway responda: /ping " + (d.gateway || "GATEWAY") + " count=3");
    } else {
      s.push("Ruta default OK.");
    }
  } else {
    f.push("Multiples default routes detectadas. Verifica failover:");
    for (const d of defaults) f.push(`  distance=${d["distance"] || "?"} via ${d.gateway}`);
    s.push("Para failover, asegurate que las distancias sean diferentes (10, 20, etc).");
  }

  if (unreachable.length > 0) {
    f.push(`ALERTA: ${unreachable.length} rutas inalcanzables.`);
    s.push("Revisa gateways de rutas inalcanzables: /ip route print where unreachable=yes");
  }

  // Check for recursive routing
  const recursive = routes.filter(r => r["check-gateway"] === "ping");
  if (recursive.length > 0) f.push(`Rutas con check-gateway=ping: ${recursive.length} (failover activo)`);

  return { category: "Rutas", findings: f, severity: defaults.length === 0 ? "critical" : defaults.some(d => d["active"] !== "true") ? "warning" : "info", commands: c, solution: s.join("\n") };
}

// ======================== NAT ========================
async function diagnosticNAT(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];
  const cmd = await runCmd("/ip/firewall/nat/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "NAT", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };

  const rules = cmd.result;
  const masq = rules.filter(r => r.action === "masquerade");
  const srcNat = rules.filter(r => r.action === "src-nat");
  const dstNat = rules.filter(r => r.action === "dst-nat");

  f.push(`NAT: ${rules.length} reglas (${masq.length} masquerade, ${srcNat.length} src-nat, ${dstNat.length} dst-nat/port-forward)`);

  if (masq.length === 0 && srcNat.length === 0) {
    f.push("CRITICO: Sin NAT. Los clientes LAN no tendran internet.");
    s.push("/ip firewall nat add action=masquerade chain=srcnat out-interface=ether1 comment=\"NAT principal\"");
  } else {
    for (const m of masq) {
      const iface = m["out-interface"] || m["out-interface-list"] || "?";
      f.push(`  Masquerade en: ${iface}`);
    }
  }

  if (dstNat.length > 0) {
    f.push("Port forwards configurados:");
    for (const r of dstNat) {
      const port = r["dst-port"] || "?";
      const to = r["to-addresses"] || "?";
      const toPort = r["to-ports"] || port;
      f.push(`  Puerto ${port} -> ${to}:${toPort} (${r.protocol || "tcp"})`);
    }
    // Check if ports are also allowed in firewall forward
    const fwCmd = await runCmd("/ip/firewall/filter/print");
    c.push(...fwCmd.commands);
    if (!fwCmd.error) {
      for (const r of dstNat) {
        const port = r["dst-port"] || "";
        const fwRule = fwCmd.result.find(fr => fr["dst-port"]?.includes(port) && fr.action === "accept");
        if (!fwRule) {
          f.push(`PROBLEMA: Puerto ${port} tiene NAT pero NO firewall forward. El trafico sera dropeado.`);
          s.push(`/ip firewall filter add action=accept chain=forward dst-address=${r["to-addresses"] || "IP_INTERNA"} dst-port=${port} protocol=${r.protocol || "tcp"}`);
        }
      }
    }
  }

  // Hairpin NAT check
  const hairpin = rules.find(r => r.action === "masquerade" && r["src-address"]?.includes("192.168"));
  if (dstNat.length > 0 && !hairpin) {
    f.push("ADVERTENCIA: No se detecta hairpin NAT. Los clientes LAN no podran acceder a port forwards por IP publica.");
    s.push("/ip firewall nat add action=masquerade chain=srcnat src-address=192.168.1.0/24 dst-address=192.168.1.0/24");
  }

  if (!s.length) s.push("NAT correctamente configurado.");
  return { category: "NAT", findings: f, severity: sev(f), commands: c, solution: s.join("\n") };
}

// ======================== DNS ========================
async function diagnosticDNS(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];
  const cmd = await runCmd("/ip/dns/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "DNS", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };

  const dns = cmd.result[0];
  const servers = dns?.servers || "No configurado";
  const cache = dns?.["cache-size"] || "?";
  const remote = dns?.["allow-remote-requests"] || "no";

  f.push(`DNS servers: ${servers}`);
  f.push(`Cache: ${cache} | Requests remotos: ${remote}`);

  if (servers === "No configurado" || !servers) {
    f.push("CRITICO: Sin DNS. No se podran resolver nombres.");
    s.push("/ip dns set servers=8.8.8.8,8.8.4.4 allow-remote-requests=yes");
  } else {
    // Check if DNS servers respond
    const pingCmd = await runCmd("/ping", ["=address=8.8.8.8", "=count=1"]);
    c.push(...pingCmd.commands);
    if (pingCmd.error) {
      f.push("PROBLEMA: No se puede alcanzar DNS 8.8.8.8. Sin internet o DNS caido.");
      s.push("Verifica conectividad: /ping 8.8.8.8");
    }
  }

  if (remote === "yes") {
    // Check if DNS is restricted by firewall
    const fwCmd = await runCmd("/ip/firewall/filter/print");
    c.push(...fwCmd.commands);
    if (!fwCmd.error) {
      const dnsAccept = fwCmd.result.find(r => r["dst-port"]?.includes("53") && r.action === "accept");
      if (!dnsAccept) {
        f.push("ADVERTENCIA: DNS acepta requests remotos pero no hay regla firewall para puerto 53.");
      }
    }
  }

  // Static DNS entries
  const staticCmd = await runCmd("/ip/dns/static/print");
  c.push(...staticCmd.commands);
  if (!staticCmd.error) f.push(`DNS estaticos: ${staticCmd.result.length} entradas`);

  if (!s.length) s.push("DNS OK.");
  return { category: "DNS", findings: f, severity: sev(f), commands: c, solution: s.join("\n") };
}

// ======================== DHCP ========================
async function diagnosticDHCP(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];
  const cmd = await runCmd("/ip/dhcp-server/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "DHCP", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };

  if (cmd.result.length === 0) {
    f.push("CRITICO: No hay DHCP server. Los clientes no obtendran IP automaticamente.");
    s.push("Configura DHCP: /ip dhcp-server setup");
    return { category: "DHCP", findings: f, severity: "critical", commands: c, solution: s.join("\n") };
  }

  for (const srv of cmd.result) {
    const disabled = srv.disabled === "true";
    f.push(`${srv.name}: interface=${srv.interface}, pool=${srv["address-pool"]}, ${disabled ? "DESHABILITADO" : "activo"}`);
    if (disabled) s.push(`/ip/dhcp-server enable ${srv.name}`);
  }

  // Check leases
  const leaseCmd = await runCmd("/ip/dhcp-server/lease/print");
  c.push(...leaseCmd.commands);
  if (!leaseCmd.error) {
    const active = leaseCmd.result.filter(l => l.status === "bound");
    f.push(`Leases: ${active.length} activos de ${leaseCmd.result.length} total`);
  }

  // Check network config
  const netCmd = await runCmd("/ip/dhcp-server/network/print");
  c.push(...netCmd.commands);
  if (!netCmd.error) {
    for (const net of netCmd.result) {
      const gw = net.gateway || "SIN GATEWAY";
      const dns = net.dns || net["dns-server"] || "SIN DNS";
      f.push(`Red ${net.address}: gateway=${gw}, dns=${dns}`);
      if (!net.gateway) s.push(`/ip/dhcp-server/network set ${net[".id"] || "[find]"} gateway=IP_ROUTER`);
      if (!net.dns && !net["dns-server"]) s.push(`/ip/dhcp-server/network set ${net[".id"] || "[find]"} dns-server=IP_ROUTER`);
    }
  }

  if (!s.length) s.push("DHCP OK.");
  return { category: "DHCP", findings: f, severity: sev(f), commands: c, solution: s.join("\n") };
}

// ======================== QUEUES ========================
async function diagnosticQueues(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];
  const cmd = await runCmd("/queue/simple/print");
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Queues", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };

  if (cmd.result.length === 0) {
    f.push("Sin queues. Ancho de banda sin control.");
    s.push("Para limitar usuarios:\n  /queue simple add max-limit=10M/10M name=clientes target=192.168.1.0/24");
    s.push("Para PCQ (distribucion equitativa):\n  /queue type add name=pcq-down kind=pcq pcq-classifier=dst-address pcq-rate=5M\n  /queue type add name=pcq-up kind=pcq pcq-classifier=src-address pcq-rate=5M\n  /queue simple add name=clientes target=192.168.1.0/24 queue=pcq-up/pcq-down");
  } else {
    f.push(`Queues: ${cmd.result.length}`);
    for (const q of cmd.result) {
      const limit = q["max-limit"] || "sin limite";
      f.push(`  ${q.name}: ${limit} -> ${q.target || "?"}`);
      if (limit === "sin limite") s.push(`Queue "${q.name}" sin limite. Agrega: /queue simple set ${q[".id"] || "[find name=\"" + q.name + "\"]"} max-limit=10M/10M`);
    }
  }

  // Check queue tree
  const treeCmd = await runCmd("/queue/tree/print");
  c.push(...treeCmd.commands);
  if (!treeCmd.error && treeCmd.result.length > 0) {
    f.push(`Queue trees: ${treeCmd.result.length}`);
  }

  if (!s.length) s.push("Queues OK.");
  return { category: "Queues", findings: f, severity: "info", commands: c, solution: s.join("\n") };
}

// ======================== LOGS ========================
async function diagnosticLogs(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];
  const cmd = await runCmd("/log/print", ["=.proplist=time,message,topics", "=limit=20"]);
  c.push(...cmd.commands);
  if (cmd.error) return { category: "Logs", findings: [`Error: ${cmd.error}`], severity: "critical", commands: c, solution: "Verifica conexion." };

  const logs = cmd.result;
  const errors = logs.filter(l => l.topics?.includes("error") || l.topics?.includes("critical"));
  const warnings = logs.filter(l => l.topics?.includes("warning"));
  const info = logs.filter(l => l.topics?.includes("info"));

  f.push(`Ultimos ${logs.length} logs: ${errors.length} errores, ${warnings.length} warnings, ${info.length} info`);

  if (errors.length > 0) {
    f.push("=== ERRORES ===");
    for (const l of errors) f.push(`[${l.time}] ${l.message}`);
    s.push("Revisa los errores mostrados. Ejecuta /log print topics=error para mas detalles.");
  }

  if (warnings.length > 0) {
    f.push("=== WARNINGS ===");
    for (const l of warnings.slice(0, 5)) f.push(`[${l.time}] ${l.message}`);
  }

  // Check for common patterns
  const loginFails = logs.filter(l => l.message?.includes("login failure"));
  if (loginFails.length > 5) {
    f.push(`ALERTA: ${loginFails.length} intentos de login fallidos. Posible brute force.`);
    s.push("/ip firewall filter add action=add-src-to-address-list chain=input connection-limit=3/30s dst-port=22 protocol=tcp address-list=brute-force address-list-timeout=1d");
    s.push("/ip firewall filter add action=drop chain=input src-address-list=brute-force");
  }

  if (!s.length) s.push("Logs limpios.");
  return { category: "Logs", findings: f, severity: errors.length > 0 ? "warning" : "info", commands: c, solution: s.join("\n") };
}

// ======================== CONNECTIVITY ========================
async function diagnosticConnectivity(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];

  // Get gateway
  const rtCmd = await runCmd("/ip/route/print");
  c.push(...rtCmd.commands);
  const defRoute = rtCmd.result.find(r => r["dst-address"] === "0.0.0.0/0" && r["active"] === "true");

  if (!defRoute) {
    f.push("CRITICO: Sin ruta default activa.");
    s.push("Agrega ruta: /ip route add dst-address=0.0.0.0/0 gateway=IP_DE_TU_GATEWAY");
    return { category: "Conectividad", findings: f, severity: "critical", commands: c, solution: s.join("\n") };
  }

  const gw = defRoute.gateway;
  f.push(`Gateway activo: ${gw}`);

  // Ping gateway
  const gwPing = await runCmd("/ping", [`=address=${gw}`, "=count=3"]);
  c.push(...gwPing.commands);
  if (gwPing.error) { f.push("PROBLEMA: Gateway NO responde."); s.push("Verifica conexion fisica al gateway."); }
  else f.push("OK: Gateway responde.");

  // Ping internet
  const inetPing = await runCmd("/ping", ["=address=8.8.8.8", "=count=3"]);
  c.push(...inetPing.commands);
  if (inetPing.error) {
    f.push("PROBLEMA: Sin internet (8.8.8.8 no responde).");
    s.push("Diagnostico paso a paso:");
    s.push("  1. Verifica NAT: /ip firewall nat print");
    s.push("  2. Verifica firewall: /ip firewall filter print");
    s.push("  3. Verifica DNS: /ip dns print");
  } else {
    f.push("OK: Internet accesible.");
  }

  // Ping DNS
  const dnsPing = await runCmd("/ping", ["=address=1.1.1.1", "=count=2"]);
  c.push(...dnsPing.commands);
  if (dnsPing.error) f.push("ADVERTENCIA: 1.1.1.1 no responde. DNS alternativo caido.");

  // Check connection tracking
  const connCmd = await runCmd("/ip/firewall/connection/print", ["=count-only"]);
  c.push(...connCmd.commands);
  if (!connCmd.error) f.push(`Conexiones activas: ${connCmd.result.length}`);

  if (!s.length) s.push("Conectividad OK.");
  return { category: "Conectividad", findings: f, severity: sev(f), commands: c, solution: s.join("\n") };
}

// ======================== SECURITY ========================
async function diagnosticSecurity(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];

  // Services
  const svcCmd = await runCmd("/ip/service/print");
  c.push(...svcCmd.commands);
  if (!svcCmd.error) {
    f.push("=== SERVICIOS ===");
    for (const svc of svcCmd.result) {
      if (svc.disabled !== "true") {
        const addr = svc.address || "ABIERTO A TODOS";
        f.push(`  ${svc.name} puerto ${svc.port}: ${addr}`);
      }
    }
    const telnet = svcCmd.result.find(x => x.name === "telnet" && x.disabled !== "true");
    const ftp = svcCmd.result.find(x => x.name === "ftp" && x.disabled !== "true");
    const api = svcCmd.result.find(x => x.name === "api" && x.disabled !== "true");
    const www = svcCmd.result.find(x => x.name === "www" && x.disabled !== "true");

    if (telnet) { f.push("PELIGRO: Telnet activo."); s.push("/ip service disable telnet"); }
    if (ftp) { f.push("PELIGRO: FTP activo."); s.push("/ip service disable ftp"); }
    if (api && !api.address) { f.push("ADVERTENCIA: API abierto a todos."); s.push("/ip service set api address=IP_DE_TU_SERVIDOR"); }
    if (www && !www.address) { f.push("ADVERTENCIA: Webfig abierto a todos."); s.push("/ip service set www address=192.168.1.0/24"); }
  }

  // Users
  const usrCmd = await runCmd("/user/print");
  c.push(...usrCmd.commands);
  if (!usrCmd.error) {
    f.push("");
    f.push("=== USUARIOS ===");
    for (const u of usrCmd.result) f.push(`  ${u.name} (grupo: ${u.group})`);
    const admin = usrCmd.result.find(u => u.name === "admin");
    if (admin) { f.push("ADVERTENCIA: Usuario 'admin' existe."); s.push("/user add name=tu_usuario group=full password=CONTRASENA_FUERTE"); s.push("/user disable admin"); }
    if (usrCmd.result.length <= 1) { f.push("ADVERTENCIA: Solo un usuario. Si pierdes acceso, no hay backup."); s.push("Crea un usuario de respaldo."); }
  }

  // Connection flood
  const connCmd = await runCmd("/ip/firewall/connection/print", ["=count-only"]);
  c.push(...connCmd.commands);
  if (!connCmd.error) {
    const count = connCmd.result.length;
    if (count > 5000) { f.push(`ALERTA: ${count} conexiones. Posible DDoS.`); s.push("/ip firewall filter add action=drop chain=forward src-address-list=ddos"); }
  }

  // Check for address-list based blocks
  const addrCmd = await runCmd("/ip/firewall/address-list/print", ["=count-only"]);
  c.push(...addrCmd.commands);
  if (!addrCmd.error) f.push(`Address lists: ${addrCmd.result.length} entradas`);

  // SSH key auth check
  const sshCmd = await runCmd("/ip/ssh/print");
  c.push(...sshCmd.commands);
  if (!sshCmd.error && sshCmd.result.length > 0) {
    const strong = sshCmd.result[0]["strong-crypto"];
    if (strong === "no") { f.push("ADVERTENCIA: SSH strong-crypto deshabilitado."); s.push("/ip ssh set strong-crypto=yes"); }
  }

  if (!s.length) s.push("Seguridad OK.");
  return { category: "Seguridad", findings: f, severity: sev(f), commands: c, solution: s.join("\n") };
}

// ======================== OVERVIEW ========================
async function diagnosticOverview(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];

  // System
  const resCmd = await runCmd("/system/resource/print");
  c.push(...resCmd.commands);
  if (resCmd.error) return { category: "Estado General", findings: [`ERROR: ${resCmd.error}`], severity: "critical", commands: c, solution: "No se pudo conectar. Verifica /settings." };

  const res = resCmd.result[0];
  const cpu = parseInt(res["cpu-load"] || "0");
  const free = parseInt(res["free-memory"] || "0"), total = parseInt(res["total-memory"] || "0");
  const ramPct = total > 0 ? ((total - free) / total * 100) : 0;

  f.push("=== SISTEMA ===");
  f.push(`RouterOS: ${res.version} | Arquitectura: ${res["architecture-name"] || res.architecture || "?"}`);
  f.push(`CPU: ${cpu}% | RAM: ${fmt(free)}/${fmt(total)} (${ramPct.toFixed(0)}%) | Uptime: ${res.uptime}`);

  // Identity
  const idCmd = await runCmd("/system/identity/print");
  c.push(...idCmd.commands);
  if (!idCmd.error) f.push(`Nombre: ${idCmd.result[0]?.name || "MikroTik"}`);

  // Interfaces
  const ifCmd = await runCmd("/interface/print");
  c.push(...ifCmd.commands);
  if (!ifCmd.error) {
    const up = ifCmd.result.filter(i => i.running === "true");
    f.push("");
    f.push("=== INTERFACES ===");
    f.push(`Activas: ${up.length}/${ifCmd.result.length}`);
    for (const i of up) f.push(`  ${i.name}: RX ${fmt(parseInt(i["rx-byte"]))} TX ${fmt(parseInt(i["tx-byte"]))}`);
  }

  // Firewall
  const fwCmd = await runCmd("/ip/firewall/filter/print");
  c.push(...fwCmd.commands);
  if (!fwCmd.error) {
    f.push("");
    f.push("=== FIREWALL ===");
    const input = fwCmd.result.filter(r => (r.chain || "input") === "input");
    const forward = fwCmd.result.filter(r => r.chain === "forward");
    f.push(`Reglas: ${fwCmd.result.length} (${input.length} input, ${forward.length} forward)`);
    const firstOk = input[0] && (input[0]["connection-state"] || "").includes("established");
    f.push(`Primera regla: ${firstOk ? "OK (established)" : "PROBLEMA (no es established)"}`);
    if (!firstOk) s.push("/ip firewall filter move [find connection-state~\"established\"] 0");
  }

  // NAT
  const natCmd = await runCmd("/ip/firewall/nat/print");
  c.push(...natCmd.commands);
  if (!natCmd.error) {
    f.push("");
    f.push("=== NAT ===");
    f.push(`Reglas: ${natCmd.result.length}`);
    const masq = natCmd.result.filter(r => r.action === "masquerade");
    if (masq.length === 0 && natCmd.result.length === 0) { f.push("Sin NAT."); s.push("/ip firewall nat add action=masquerade chain=srcnat out-interface=ether1"); }
  }

  // Routes
  const rtCmd = await runCmd("/ip/route/print");
  c.push(...rtCmd.commands);
  if (!rtCmd.error) {
    const def = rtCmd.result.filter(r => r["dst-address"] === "0.0.0.0/0");
    f.push("");
    f.push("=== RUTAS ===");
    f.push(`Total: ${rtCmd.result.length} | Default: ${def.length}`);
    for (const d of def) f.push(`  Via ${d.gateway} (${d["active"] === "true" ? "ACTIVA" : "INACTIVA"})`);
    if (def.length === 0) s.push("/ip route add dst-address=0.0.0.0/0 gateway=IP_GATEWAY");
  }

  // Services
  const svcCmd = await runCmd("/ip/service/print");
  c.push(...svcCmd.commands);
  if (!svcCmd.error) {
    const open = svcCmd.result.filter(s => s.disabled !== "true");
    f.push("");
    f.push("=== SERVICIOS ACTIVOS ===");
    for (const svc of open) f.push(`  ${svc.name} puerto ${svc.port}: ${svc.address || "ABIERTO"}`);
  }

  // Issues summary
  f.push("");
  f.push("=== RESUMEN ===");
  if (cpu > 80) { f.push("CPU alta."); s.push("/tool profile duration=15"); }
  if (ramPct > 80) { f.push("RAM alta."); s.push("/system package print"); }

  if (!s.length) s.push("Todo OK. No se detectaron problemas.");
  return { category: "Estado General", findings: f, severity: sev(f), commands: c, solution: s.join("\n") };
}

// ======================== HEALTH CHECK COMPREHENSIVE ========================
async function diagnosticHealth(): Promise<DiagnosticResult> {
  const f: string[] = [], s: string[] = [], c: string[] = [];

  const health = await runComprehensiveHealthCheck();

  f.push(`=== CALIFICACION: ${health.grade} (${health.score}/100) ===`);
  f.push(health.summary);

  if (health.issues.length > 0) {
    f.push("");
    f.push("=== PROBLEMAS DETECTADOS ===");
    for (const issue of health.issues) {
      const icon = issue.severity === "critical" ? "CRITICO" : issue.severity === "warning" ? "ADVERTENCIA" : "INFO";
      f.push(`[${icon}] ${issue.category}: ${issue.description}`);
      if (issue.command) s.push(issue.command);
    }
  }

  if (health.predictions.length > 0) {
    f.push("");
    f.push("=== PREDICCIONES ===");
    for (const pred of health.predictions) {
      f.push(`${pred.metric} ${pred.trend}: ${pred.description}`);
      f.push(`  Tiempo estimado: ${pred.estimatedTime}`);
      f.push(`  Accion: ${pred.action}`);
    }
  }

  if (health.recommendations.length > 0) {
    f.push("");
    f.push("=== RECOMENDACIONES ===");
    for (const rec of health.recommendations) f.push(rec);
  }

  if (!s.length) s.push("Sistema en buen estado. No se requieren acciones.");

  return {
    category: "Salud del Sistema",
    findings: f,
    severity: health.score < 50 ? "critical" : health.score < 70 ? "warning" : "info",
    commands: c,
    solution: s.join("\n"),
  };
}
