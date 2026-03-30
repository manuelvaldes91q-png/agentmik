import type { MikroTikConfig, InterfaceStats, SystemHealth, BgpSession, OspfNeighbor, Alert } from "@/lib/types";

export function validateConfig(config: MikroTikConfig): string[] {
  const errors: string[] = [];
  if (!config.ip || config.ip.length < 1) {
    errors.push("La IP o hostname es requerido");
  }
  if (config.port < 1 || config.port > 65535) {
    errors.push("El puerto debe estar entre 1 y 65535");
  }
  if (!config.username || config.username.length < 1) {
    errors.push("El usuario es requerido");
  }
  if (!config.password || config.password.length < 1) {
    errors.push("La contrasena es requerida");
  }
  return errors;
}

// Simulated data (used when no real connection or as fallback)
export function generateSimulatedData(): {
  interfaces: InterfaceStats[];
  health: SystemHealth;
  bgpSessions: BgpSession[];
  ospfNeighbors: OspfNeighbor[];
  alerts: Alert[];
} {
  const now = Date.now();
  const interfaces: InterfaceStats[] = [
    { name: "ether1", type: "ether", status: "up", rxBytes: 4_521_000_000, txBytes: 1_234_000_000, rxRate: 45_000_000, txRate: 12_000_000, comment: "WAN-Uplink" },
    { name: "ether2", type: "ether", status: "up", rxBytes: 892_000_000, txBytes: 2_100_000_000, rxRate: 8_500_000, txRate: 22_000_000, comment: "LAN-Servers" },
    { name: "ether3", type: "ether", status: "up", rxBytes: 234_000_000, txBytes: 567_000_000, rxRate: 2_100_000, txRate: 5_400_000, comment: "LAN-Users" },
    { name: "ether4", type: "ether", status: "down", rxBytes: 0, txBytes: 0, rxRate: 0, txRate: 0 },
    { name: "ether5", type: "ether", status: "up", rxBytes: 1_100_000_000, txBytes: 980_000_000, rxRate: 15_000_000, txRate: 13_000_000, comment: "Backup-Link" },
    { name: "wg0", type: "wireguard", status: "up", rxBytes: 45_000_000, txBytes: 38_000_000, rxRate: 500_000, txRate: 420_000, comment: "WireGuard-VPN" },
    { name: "vlan10", type: "vlan", status: "up", rxBytes: 780_000_000, txBytes: 650_000_000, rxRate: 7_800_000, txRate: 6_500_000, comment: "Management" },
  ];

  const health: SystemHealth = {
    cpuLoad: 23 + Math.floor(Math.random() * 10),
    freeMemory: 148_000_000,
    totalMemory: 256_000_000,
    uptime: "14d07h32m",
    temperature: 48 + Math.floor(Math.random() * 5),
    voltage: 12.1,
    boardName: "CCR2004-1G-12S+2XS",
    routerOsVersion: "7.16.2",
    architecture: "arm64",
  };

  const bgpSessions: BgpSession[] = [
    { name: "ISP-Primary", remoteAddress: "203.0.113.1", status: "established", prefixCount: 920_000, uptime: "14d07h", remoteAs: 64512 },
    { name: "ISP-Backup", remoteAddress: "198.51.100.1", status: "established", prefixCount: 918_500, uptime: "14d07h", remoteAs: 64513 },
    { name: "IX-Peer", remoteAddress: "192.0.2.1", status: "established", prefixCount: 45_000, uptime: "7d02h", remoteAs: 64514 },
  ];

  const ospfNeighbors: OspfNeighbor[] = [
    { identity: "core-sw01", address: "10.0.0.2", state: "Full", interface: "ether2", priority: 128 },
    { identity: "core-sw02", address: "10.0.0.3", state: "Full", interface: "ether3", priority: 100 },
  ];

  const alerts: Alert[] = [
    { id: "a1", type: "info", message: "Sesion BGP con IX-Peer restablecida tras flap de 2s", timestamp: new Date(now - 3_600_000), source: "BGP" },
    { id: "a2", type: "warning", message: "Pico de CPU al 78% detectado (resuelto)", timestamp: new Date(now - 7_200_000), source: "Sistema" },
    { id: "a3", type: "info", message: "Peer WireGuard reconectado", timestamp: new Date(now - 14_400_000), source: "VPN" },
    { id: "a4", type: "warning", message: "ether5 link flapped (3 veces en 10 minutos)", timestamp: new Date(now - 86_400_000), source: "Interfaz" },
    { id: "a5", type: "critical", message: "Fallo de resolucion DNS por 30 segundos", timestamp: new Date(now - 172_800_000), source: "DNS" },
  ];

  return { interfaces, health, bgpSessions, ospfNeighbors, alerts };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatRate(bps: number): string {
  if (bps === 0) return "0 bps";
  const k = 1000;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps"];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return parseFloat((bps / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
