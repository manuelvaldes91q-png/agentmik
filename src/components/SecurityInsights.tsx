"use client";

import { useState, useEffect, useCallback } from "react";

interface SecurityEvent {
  id: string;
  timestamp: string;
  severity: "baja" | "media" | "alta";
  attackType: string;
  sourceIp: string;
  targetPort?: number;
  targetService?: string;
  evidenceCount: number;
  timeWindowSeconds: number;
  naturalLanguage: string;
  technicalDetail: string;
  documentationRef: string;
  recommendedAction: string;
  proposedCommand: string;
  autoResponse: "inform" | "suggest" | "block-pending";
  status: string;
  relatedLogEntries: string[];
}

interface SecurityStats {
  totalEvents: number;
  activeEvents: number;
  altaCount: number;
  mediaCount: number;
  bajaCount: number;
  blockedIps: string[];
  lastAnalysis: string | null;
  logsIngested: number;
  ingestion: {
    active: boolean;
    totalIngested: number;
    lastPoll: string | null;
  };
}

const severityConfig = {
  alta: {
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    badge: "bg-red-500/20 text-red-400",
    icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  },
  media: {
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-400",
    icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  baja: {
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
    badge: "bg-blue-500/20 text-blue-400",
    icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
};

const attackTypeLabels: Record<string, string> = {
  "brute-force": "Fuerza Bruta",
  "port-scan": "Escaneo de Puertos",
  "ddos-flood": "DDoS/Flooding",
  "protocol-error": "Error de Protocolo",
};

function SecurityEventCard({
  event,
  onAcknowledge,
}: {
  event: SecurityEvent;
  onAcknowledge: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = severityConfig[event.severity];

  return (
    <div className={`rounded-lg border ${config.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <svg
              className={`w-5 h-5 mt-0.5 shrink-0 ${config.color}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${config.badge}`}>
                  {event.severity.toUpperCase()}
                </span>
                <span className="text-xs text-slate-400">
                  {attackTypeLabels[event.attackType] || event.attackType}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-slate-200 mt-1 leading-relaxed">
                {event.naturalLanguage.slice(0, expanded ? 999 : 150)}
                {!expanded && event.naturalLanguage.length > 150 && "..."}
              </p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                <span>
                  IP: <code className="text-slate-400">{event.sourceIp}</code>
                </span>
                <span>Evidencias: {event.evidenceCount}</span>
                {event.targetService && <span>Servicio: {event.targetService}</span>}
              </div>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/30">
          {/* Technical detail */}
          <div className="pt-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Detalle Tecnico
            </h4>
            <p className="text-xs text-slate-300 font-mono bg-slate-900/50 rounded p-2">
              {event.technicalDetail}
            </p>
          </div>

          {/* Recommendation */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Recomendacion
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {event.recommendedAction}
            </p>
          </div>

          {/* Documentation reference */}
          {event.documentationRef && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Referencia Documentacion
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {event.documentationRef}
              </p>
            </div>
          )}

          {/* Proposed command */}
          {event.proposedCommand && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Comando Sugerido
              </h4>
              <pre className="text-xs text-emerald-300 font-mono bg-slate-900/80 rounded p-2 overflow-x-auto">
                {event.proposedCommand}
              </pre>
            </div>
          )}

          {/* Related log entries */}
          {event.relatedLogEntries.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Logs Relacionados ({event.relatedLogEntries.length})
              </h4>
              <div className="max-h-32 overflow-y-auto bg-slate-900/50 rounded p-2 space-y-0.5">
                {event.relatedLogEntries.slice(0, 8).map((log, i) => (
                  <p key={i} className="text-xs text-slate-500 font-mono whitespace-nowrap">
                    {log}
                  </p>
                ))}
                {event.relatedLogEntries.length > 8 && (
                  <p className="text-xs text-slate-600">
                    ... y {event.relatedLogEntries.length - 8} mas
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          {event.status === "active" && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onAcknowledge(event.id)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-medium transition-colors"
              >
                Reconocido
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>ID: {event.id}</span>
            <span>Estado: {event.status}</span>
            <span>
              Auto-respuesta:{" "}
              {event.autoResponse === "block-pending"
                ? "Bloqueo pendiente"
                : event.autoResponse === "suggest"
                  ? "Sugerencia"
                  : "Solo informar"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function SecurityInsights() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, eventsRes] = await Promise.all([
        fetch("/api/security"),
        fetch("/api/security?action=events"),
      ]);
      const statsJson = await statsRes.json();
      const eventsJson = await eventsRes.json();

      if (statsJson.success) {
        setStats(statsJson);
      }
      if (eventsJson.success) {
        setEvents(eventsJson.events);
      }
    } catch {
      // fetch error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAcknowledge = async (id: string) => {
    try {
      await fetch("/api/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "update-event", eventId: id, status: "acknowledged" }),
      });
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "acknowledged" } : e))
      );
    } catch {
      // error
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-6">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Inicializando motor de seguridad...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-300">Security Insights</h2>
          {stats?.ingestion.active && (
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-400">
                Ingesta activa ({stats.ingestion.totalIngested} logs)
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {stats && (
            <>
              {stats.altaCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                  {stats.altaCount} Alta
                </span>
              )}
              {stats.mediaCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                  {stats.mediaCount} Media
                </span>
              )}
              {stats.bajaCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                  {stats.bajaCount} Baja
                </span>
              )}
              <span className="text-slate-500">{stats.activeEvents} activos</span>
            </>
          )}
        </div>
      </div>

      {/* Blocked IPs */}
      {stats && stats.blockedIps.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
          <p className="text-xs text-red-400 font-medium">
            IPs bloqueadas automaticamente:
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            {stats.blockedIps.map((ip) => (
              <code key={ip} className="text-xs bg-red-500/10 text-red-300 px-2 py-0.5 rounded">
                {ip}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Event feed */}
      {events.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-lg p-6 text-center">
          <svg className="w-8 h-8 mx-auto text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-sm text-slate-500">No se han detectado amenazas</p>
          <p className="text-xs text-slate-600 mt-1">
            El motor de analisis esta monitoreando los logs en tiempo real
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <SecurityEventCard
              key={event.id}
              event={event}
              onAcknowledge={handleAcknowledge}
            />
          ))}
        </div>
      )}
    </div>
  );
}
