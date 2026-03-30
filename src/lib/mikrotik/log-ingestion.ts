import type { LogEntry } from "@/lib/types";

const CRITICAL_TOPICS = ["critical", "error", "warning", "firewall", "info"];
const POLL_INTERVAL_MS = 10_000;

let pollInterval: ReturnType<typeof setInterval> | null = null;
let logCallbacks: Array<(entries: LogEntry[]) => void> = [];
let totalIngested = 0;
let lastPollTime: string | null = null;

// RouterOS log categories for simulation
const SIMULATED_CATEGORIES = [
  { topics: "firewall,info", genMessage: generateFirewallLog },
  { topics: "system,error", genMessage: generateSystemError },
  { topics: "system,warning", genMessage: generateSystemWarning },
  { topics: "system,critical", genMessage: generateCriticalLog },
  { topics: "info", genMessage: generateInfoLog },
];

const ATTACK_SOURCE_IPS = [
  "185.220.101.34",
  "45.155.205.233",
  "194.26.29.113",
  "103.136.42.88",
  "91.240.118.172",
  "23.129.64.210",
  "185.56.80.65",
  "45.33.32.156",
  "77.247.181.163",
  "178.62.198.55",
];

const LEGIT_IPS = [
  "192.168.1.10",
  "192.168.1.25",
  "10.0.0.5",
  "172.16.0.100",
];

let attackSimPhase = 0;
let attackSimCounter = 0;

export function parseRouterOSLog(rawLine: string): LogEntry | null {
  // RouterOS log format: HH:MM:SS category message
  // or: HH:MM:SS.xxx category message
  const match = rawLine.match(
    /^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(\S+)\s+(.+)$/
  );
  if (!match) return null;

  const topics = match[2].toLowerCase();
  const message = match[3];

  // Filter: only keep critical categories
  const isRelevant = CRITICAL_TOPICS.some(
    (cat) => topics.includes(cat) || topics === cat
  );
  if (!isRelevant) return null;

  const now = new Date();
  const [hh, mm, ss] = match[1].split(":");
  now.setHours(parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10), 0);

  return {
    timestamp: now.toISOString(),
    topics,
    message,
    rawCategory: topics.split(",")[0],
  };
}

export function generateSimulatedLogs(): LogEntry[] {
  const now = new Date();
  const entries: LogEntry[] = [];

  // Normal background logs (0-3 per cycle)
  const normalCount = Math.floor(Math.random() * 4);
  for (let i = 0; i < normalCount; i++) {
    const cat =
      SIMULATED_CATEGORIES[
        Math.floor(Math.random() * SIMULATED_CATEGORIES.length)
      ];
    entries.push({
      timestamp: now.toISOString(),
      topics: cat.topics,
      message: cat.genMessage(),
      rawCategory: cat.topics.split(",")[0],
    });
  }

  // Simulate attack scenarios
  attackSimCounter++;
  if (attackSimCounter % 6 === 0) {
    attackSimPhase++;
  }

  // Phase 1: Brute force burst (phases 1-3)
  if (attackSimPhase % 5 === 1 && attackSimCounter % 3 === 0) {
    const attackerIp =
      ATTACK_SOURCE_IPS[Math.floor(Math.random() * ATTACK_SOURCE_IPS.length)];
    const service = ["ssh", "winbox", "ftp"][Math.floor(Math.random() * 3)];
    const count = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < count; i++) {
      entries.push({
        timestamp: new Date(now.getTime() + i * 100).toISOString(),
        topics: "system,error",
        message: `login failure for user admin from ${attackerIp} via ${service}`,
        rawCategory: "system",
      });
    }
  }

  // Phase 2: Port scan (phases 2-3)
  if (attackSimPhase % 5 === 2 && attackSimCounter % 2 === 0) {
    const scannerIp =
      ATTACK_SOURCE_IPS[Math.floor(Math.random() * ATTACK_SOURCE_IPS.length)];
    const ports = [22, 23, 445, 3389, 8080, 8443, 5900, 1433, 3306];
    const count = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < count; i++) {
      const port = ports[Math.floor(Math.random() * ports.length)];
      entries.push({
        timestamp: new Date(now.getTime() + i * 50).toISOString(),
        topics: "firewall,info",
        message: `input: in:ether1 out:(none), src-mac ${generateMac()}, proto TCP (SYN), ${scannerIp}:${40000 + Math.floor(Math.random() * 20000)}->198.51.100.10:${port}, len 60`,
        rawCategory: "firewall",
      });
    }
  }

  // Phase 3: DDoS indicators (phases 3-4)
  if (attackSimPhase % 5 === 3) {
    entries.push({
      timestamp: now.toISOString(),
      topics: "system,warning",
      message: `high cpu usage: ${85 + Math.floor(Math.random() * 12)}%`,
      rawCategory: "system",
    });
    if (Math.random() > 0.5) {
      entries.push({
        timestamp: now.toISOString(),
        topics: "firewall,info",
        message: `connection tracking table full (${65000 + Math.floor(Math.random() * 5000)} entries)`,
        rawCategory: "firewall",
      });
    }
  }

  // Phase 0/4: Occasional OSPF/BGP errors
  if (attackSimPhase % 5 === 4 && attackSimCounter % 4 === 0) {
    const errors = [
      "ospf: database description packet mismatch from 10.0.0.2",
      "bgp: holdtime expired for peer 203.0.113.1",
      "ospf: NBR event: 2-Way received from 10.0.0.3 on ether2",
      "bridge: port ether4 state: blocking -> forwarding",
    ];
    entries.push({
      timestamp: now.toISOString(),
      topics: "system,warning",
      message: errors[Math.floor(Math.random() * errors.length)],
      rawCategory: "system",
    });
  }

  // Occasional NAT/DNS warnings
  if (Math.random() < 0.15) {
    const natMsgs = [
      "nat: dst-nat to 192.168.1.100:80 from 203.0.113.50:54321",
      "dns: query timeout for example.com",
      "dns: DNS over HTTPS connection failed, falling back to standard DNS",
    ];
    entries.push({
      timestamp: now.toISOString(),
      topics: "info",
      message: natMsgs[Math.floor(Math.random() * natMsgs.length)],
      rawCategory: "info",
    });
  }

  return entries;
}

export function startLogIngestion(): void {
  if (pollInterval) return;

  lastPollTime = new Date().toISOString();

  pollInterval = setInterval(() => {
    try {
      const entries = generateSimulatedLogs();
      if (entries.length > 0) {
        totalIngested += entries.length;
        lastPollTime = new Date().toISOString();

        for (const cb of logCallbacks) {
          try {
            cb(entries);
          } catch {
            // callback error
          }
        }
      }
    } catch {
      // ingestion error
    }
  }, POLL_INTERVAL_MS);
}

export function stopLogIngestion(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export function onLogsReceived(callback: (entries: LogEntry[]) => void): void {
  logCallbacks.push(callback);
}

export function getIngestionStatus(): {
  active: boolean;
  totalIngested: number;
  lastPoll: string | null;
} {
  return {
    active: pollInterval !== null,
    totalIngested,
    lastPoll: lastPollTime,
  };
}

// Simulation message generators
function generateFirewallLog(): string {
  const actions = ["drop", "reject", "accept"];
  const protos = ["TCP", "UDP", "ICMP"];
  const action = actions[Math.floor(Math.random() * actions.length)];
  const proto = protos[Math.floor(Math.random() * protos.length)];
  const srcIp = `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const dstPort = [22, 80, 443, 3389, 8080][Math.floor(Math.random() * 5)];

  return `input: in:ether1 out:(none), proto ${proto}, ${srcIp}:${40000 + Math.floor(Math.random() * 25000)}->198.51.100.10:${dstPort}, len ${40 + Math.floor(Math.random() * 1400)} (${action} by firewall)`;
}

function generateSystemError(): string {
  const msgs = [
    `disk write error on /flash`,
    `ntp: NTP server 0.pool.ntp.org not responding`,
    `dhcp: no free leases available`,
    `pppoe: connection to acs terminated`,
    `proxy: connection refused by upstream`,
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

function generateSystemWarning(): string {
  const msgs = [
    `temperature alert: ${45 + Math.floor(Math.random() * 15)}C`,
    `memory usage above 70%`,
    `interface ether5 link down`,
    `ntp: time offset ${Math.floor(Math.random() * 500)}ms exceeds threshold`,
    `scheduler: script timeout exceeded`,
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

function generateCriticalLog(): string {
  const msgs = [
    `hardware watchdog triggered`,
    `kernel: out of memory`,
    `flash: write cycle limit approaching`,
    `fan failure detected`,
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

function generateInfoLog(): string {
  const msgs = [
    `user admin logged in from 192.168.1.10 via winbox`,
    `backup created: auto-backup-${new Date().toISOString().slice(0, 10)}.backup`,
    `dhcp: lease offered to ${LEGIT_IPS[Math.floor(Math.random() * LEGIT_IPS.length)]}`,
    `scheduler: daily-backup executed successfully`,
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

function generateMac(): string {
  const hex = "0123456789ABCDEF";
  return Array.from({ length: 6 }, () =>
    hex[Math.floor(Math.random() * 16)] + hex[Math.floor(Math.random() * 16)]
  ).join(":");
}
