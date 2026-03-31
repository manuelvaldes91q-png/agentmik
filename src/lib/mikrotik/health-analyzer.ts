import { executeCommand } from "./connection-server";
import { getRecentSnapshots, loadMikroTikConfig } from "./db";
import type { MonitoringSnapshot } from "@/lib/types";

export interface HealthScore {
  score: number; // 0-100
  grade: string; // A, B, C, D, F
  summary: string;
  issues: HealthIssue[];
  predictions: Prediction[];
  recommendations: string[];
}

export interface HealthIssue {
  category: string;
  severity: "info" | "warning" | "critical";
  description: string;
  solution: string;
  command: string;
}

export interface Prediction {
  metric: string;
  trend: "rising" | "falling" | "stable";
  estimatedTime: string;
  description: string;
  action: string;
}

// ======================== COMPREHENSIVE HEALTH CHECK ========================
export async function runComprehensiveHealthCheck(): Promise<HealthScore> {
  const config = loadMikroTikConfig();
  if (!config) {
    return { score: 0, grade: "F", summary: "Sin configuracion de router", issues: [{ category: "Configuracion", severity: "critical", description: "No hay router configurado", solution: "Ve a /settings", command: "" }], predictions: [], recommendations: ["Configura tu router en /settings"] };
  }

  const issues: HealthIssue[] = [];
  const predictions: Prediction[] = [];
  const recommendations: string[] = [];
  let totalScore = 100;

  // ---- 1. SISTEMA ----
  const resCmd = await executeCommand("/system/resource/print");
  if (resCmd.success && resCmd.result) {
    const res = (resCmd.result as Record<string, string>[])[0];
    const cpu = parseInt(res["cpu-load"] || "0");
    const free = parseInt(res["free-memory"] || "0"), total = parseInt(res["total-memory"] || "0");
    const ramPct = total > 0 ? ((total - free) / total * 100) : 0;
    const temp = parseInt(res.temperature || "0");

    if (cpu > 90) { totalScore -= 30; issues.push({ category: "CPU", severity: "critical", description: `CPU al ${cpu}% - riesgo de caida`, solution: "Ejecuta /tool profile para identificar proceso", command: "/tool profile duration=15" }); }
    else if (cpu > 70) { totalScore -= 15; issues.push({ category: "CPU", severity: "warning", description: `CPU al ${cpu}% - elevada`, solution: "Monitorea y optimiza procesos", command: "/tool profile duration=15" }); }

    if (ramPct > 95) { totalScore -= 30; issues.push({ category: "RAM", severity: "critical", description: `RAM al ${ramPct.toFixed(0)}% - riesgo de reinicio`, solution: "Deshabilita paquetes innecesarios", command: "/system package disable hotspot,mls,ppp,wireless" }); }
    else if (ramPct > 80) { totalScore -= 15; issues.push({ category: "RAM", severity: "warning", description: `RAM al ${ramPct.toFixed(0)}%`, solution: "Revisa paquetes activos", command: "/system package print" }); }

    if (temp > 70) { totalScore -= 20; issues.push({ category: "Temperatura", severity: "warning", description: `Temperatura ${temp}C - revisar ventilacion`, solution: "Mejora ventilacion o reduce carga", command: "" }); }
  }

  // ---- 2. CONEXIONES ----
  const connCmd = await executeCommand("/ip/firewall/connection/print", ["=count-only"]);
  if (connCmd.success && connCmd.result) {
    const count = connCmd.result.length;
    if (count > 10000) { totalScore -= 25; issues.push({ category: "Conexiones", severity: "critical", description: `${count} conexiones activas - posible DDoS`, solution: "Bloquea IPs sospechosas", command: "/ip firewall filter add action=drop chain=forward src-address-list=ddos" }); }
    else if (count > 5000) { totalScore -= 10; issues.push({ category: "Conexiones", severity: "warning", description: `${count} conexiones activas - elevado`, solution: "Monitorea origen de conexiones", command: "/ip firewall connection print count-by=src-address" }); }
  }

  // ---- 3. FIREWALL ----
  const fwCmd = await executeCommand("/ip/firewall/filter/print");
  if (fwCmd.success && fwCmd.result) {
    const rules = fwCmd.result as Record<string, string>[];
    const input = rules.filter(r => (r.chain || "input") === "input");

    if (rules.length === 0) { totalScore -= 40; issues.push({ category: "Firewall", severity: "critical", description: "Sin reglas firewall - router ABIERTO", solution: "Agrega reglas basicas inmediatamente", command: "/ip firewall filter add action=accept chain=input connection-state=established,related" }); }
    else {
      const first = input[0];
      if (first && !(first["connection-state"] || "").includes("established")) {
        totalScore -= 10; issues.push({ category: "Firewall", severity: "warning", description: "Primera regla no acepta established/related", solution: "Mueve established/related al inicio", command: "/ip firewall filter move [find connection-state~\"established\"] 0" });
      }

      const dangerousPorts = input.filter(r => r.action === "accept" && r["dst-port"] && !r["src-address"] && (r["dst-port"] || "").match(/22|8291|23|21/));
      for (const r of dangerousPorts) {
        totalScore -= 15; issues.push({ category: "Seguridad", severity: "critical", description: `Puerto ${r["dst-port"]} abierto a todos`, solution: "Restringe a tu IP", command: `/ip firewall filter set ${r[".id"] || ""} src-address=TU_IP` });
      }
    }
  }

  // ---- 4. NAT ----
  const natCmd = await executeCommand("/ip/firewall/nat/print");
  if (natCmd.success && natCmd.result) {
    const rules = natCmd.result as Record<string, string>[];
    const masq = rules.filter(r => r.action === "masquerade" || r.action === "src-nat");
    if (masq.length === 0) { totalScore -= 25; issues.push({ category: "NAT", severity: "critical", description: "Sin NAT - clientes sin internet", solution: "Agrega masquerade", command: "/ip firewall nat add action=masquerade chain=srcnat out-interface=ether1" }); }
  }

  // ---- 5. RUTAS ----
  const rtCmd = await executeCommand("/ip/route/print");
  if (rtCmd.success && rtCmd.result) {
    const defaults = (rtCmd.result as Record<string, string>[]).filter(r => r["dst-address"] === "0.0.0.0/0");
    if (defaults.length === 0) { totalScore -= 30; issues.push({ category: "Rutas", severity: "critical", description: "Sin ruta default - sin internet", solution: "Agrega ruta por defecto", command: "/ip route add dst-address=0.0.0.0/0 gateway=IP_GATEWAY" }); }
    else {
      const active = defaults.filter(d => d["active"] === "true");
      if (active.length === 0) {
        totalScore -= 20;
        const gw = defaults[0].gateway || "GATEWAY";
        issues.push({ category: "Rutas", severity: "warning", description: "Ruta default inactiva", solution: "Verifica gateway", command: "/ping " + gw + " count=3" });
      }
    }
  }

  // ---- 6. INTERFACES ----
  const ifCmd = await executeCommand("/interface/print");
  if (ifCmd.success && ifCmd.result) {
    const ifaces = ifCmd.result as Record<string, string>[];
    const errors = ifaces.filter(i => parseInt(i["rx-errors"] || "0") > 0 || parseInt(i["tx-errors"] || "0") > 0);
    for (const i of errors) {
      totalScore -= 5; issues.push({ category: "Interface", severity: "warning", description: `${i.name}: errores RX/TX`, solution: "Verifica cableado o SFP", command: `/interface ethernet monitor ${i.name} once` });
    }
  }

  // ---- 7. SERVICIOS ----
  const svcCmd = await executeCommand("/ip/service/print");
  if (svcCmd.success && svcCmd.result) {
    const telnet = (svcCmd.result as Record<string, string>[]).find(s => s.name === "telnet" && s.disabled !== "true");
    const ftp = (svcCmd.result as Record<string, string>[]).find(s => s.name === "ftp" && s.disabled !== "true");
    if (telnet) { totalScore -= 10; issues.push({ category: "Seguridad", severity: "critical", description: "Telnet activo", solution: "Deshabilita telnet", command: "/ip service disable telnet" }); }
    if (ftp) { totalScore -= 5; issues.push({ category: "Seguridad", severity: "warning", description: "FTP activo", solution: "Deshabilita FTP, usa SFTP", command: "/ip service disable ftp" }); }
  }

  // ---- 8. USUARIOS ----
  const usrCmd = await executeCommand("/user/print");
  if (usrCmd.success && usrCmd.result) {
    const admin = (usrCmd.result as Record<string, string>[]).find(u => u.name === "admin");
    if (admin) { totalScore -= 5; issues.push({ category: "Seguridad", severity: "warning", description: "Usuario admin existe", solution: "Crea usuario personal y deshabilita admin", command: "/user add name=tu_usuario group=full password=CONTRASENA" }); }
  }

  // ---- PREDICCIONES ----
  const snapshots = getRecentSnapshots(20);
  if (snapshots.length >= 5) {
    // CPU trend
    const cpuTrend = analyzeTrend(snapshots.map(s => s.cpuLoad));
    if (cpuTrend.direction === "rising" && cpuTrend.slope > 0.5) {
      predictions.push({ metric: "CPU", trend: "rising", estimatedTime: `${Math.round((100 - snapshots[0].cpuLoad) / cpuTrend.slope)} ciclos`, description: `CPU subiendo ${cpuTrend.slope.toFixed(1)}% por ciclo`, action: "Optimiza procesos antes de llegar a 100%" });
    }

    // Memory trend
    const memTrend = analyzeTrend(snapshots.map(s => s.memoryUsedPct));
    if (memTrend.direction === "rising" && memTrend.slope > 0.3) {
      predictions.push({ metric: "RAM", trend: "rising", estimatedTime: `${Math.round((100 - snapshots[0].memoryUsedPct) / memTrend.slope)} ciclos`, description: `RAM subiendo ${memTrend.slope.toFixed(1)}% por ciclo`, action: "Deshabilita paquetes innecesarios antes de quedarte sin memoria" });
    }

    // Temperature trend
    if (snapshots[0].temperature > 0) {
      const tempTrend = analyzeTrend(snapshots.map(s => s.temperature));
      if (tempTrend.direction === "rising" && tempTrend.slope > 0.2) {
        predictions.push({ metric: "Temperatura", trend: "rising", estimatedTime: `${Math.round((80 - snapshots[0].temperature) / tempTrend.slope)} ciclos`, description: `Temperatura subiendo ${tempTrend.slope.toFixed(1)}C por ciclo`, action: "Revisa ventilacion antes de sobrecalentamiento" });
      }
    }
  }

  // ---- RECOMENDACIONES GENERALES ----
  if (totalScore >= 90) recommendations.push("Sistema en excelente estado. Manten monitoreo activo.");
  else if (totalScore >= 70) recommendations.push("Sistema funcional con areas de mejora. Atiende las alertas amarillas.");
  else if (totalScore >= 50) recommendations.push("Sistema con problemas significativos. Atiende los problemas criticos lo antes posible.");
  else recommendations.push("Sistema en estado critico. Requiere atencion inmediata.");

  if (issues.length === 0) recommendations.push("No se detectaron problemas. Tu router esta bien configurado.");

  // Calculate grade
  const grade = totalScore >= 90 ? "A" : totalScore >= 80 ? "B" : totalScore >= 60 ? "C" : totalScore >= 40 ? "D" : "F";
  const summary = `Tu router tiene una calificacion ${grade} (${totalScore}/100). ${issues.length} problema(s) detectado(s), ${predictions.length} prediccion(es).`;

  return { score: Math.max(0, totalScore), grade, summary, issues, predictions, recommendations };
}

// ======================== TREND ANALYSIS ========================
function analyzeTrend(values: number[]): { direction: "rising" | "falling" | "stable"; slope: number; confidence: number } {
  if (values.length < 3) return { direction: "stable", slope: 0, confidence: 0 };

  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;

  // Calculate R-squared for confidence
  const yPred = values.map((_, i) => yMean + slope * (i - xMean));
  const ssRes = values.reduce((sum, y, i) => sum + (y - yPred[i]) ** 2, 0);
  const ssTot = values.reduce((sum, y) => sum + (y - yMean) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  if (Math.abs(slope) < 0.1) return { direction: "stable", slope, confidence: r2 };
  return { direction: slope > 0 ? "rising" : "falling", slope, confidence: r2 };
}

// ======================== QUICK STATUS FOR CHAT ========================
export async function getQuickStatus(): Promise<string> {
  const config = loadMikroTikConfig();
  if (!config) return "No hay router configurado.";

  const resCmd = await executeCommand("/system/resource/print");
  if (!resCmd.success || !resCmd.result) return "No se pudo conectar al router.";

  const res = (resCmd.result as Record<string, string>[])[0];
  const cpu = parseInt(res["cpu-load"] || "0");
  const free = parseInt(res["free-memory"] || "0"), total = parseInt(res["total-memory"] || "0");
  const ramPct = total > 0 ? ((total - free) / total * 100) : 0;
  const temp = parseInt(res.temperature || "0");

  const ifCmd = await executeCommand("/interface/print");
  const ifaces = ifCmd.success ? (ifCmd.result as Record<string, string>[]) : [];
  const up = ifaces.filter(i => i.running === "true");

  const connCmd = await executeCommand("/ip/firewall/connection/print", ["=count-only"]);
  const conns = connCmd.success && connCmd.result ? connCmd.result.length : 0;

  let status = `Tu router ${res["board-name"] || "MikroTik"} con RouterOS ${res.version}:\n`;
  status += `CPU: ${cpu}% | RAM: ${ramPct.toFixed(0)}% | Temp: ${temp}C\n`;
  status += `Interfaces activas: ${up.length}/${ifaces.length} | Conexiones: ${conns}\n`;
  status += `Uptime: ${res.uptime}`;

  if (cpu > 90) status += "\nALERTA: CPU muy alta. Necesitas revisar inmediatamente.";
  if (ramPct > 90) status += "\nALERTA: RAM casi agotada.";
  if (temp > 70) status += "\nALERTA: Temperatura elevada.";

  return status;
}
