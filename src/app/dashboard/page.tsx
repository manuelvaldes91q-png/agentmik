"use client";

import { useState, useEffect } from "react";
import { generateSimulatedData, formatRate } from "@/lib/mikrotik/connection";
import { InterfaceCard } from "@/components/InterfaceCard";
import { MetricBar } from "@/components/MetricBar";
import { TrafficChart } from "@/components/TrafficChart";
import { AlertItem } from "@/components/AlertItem";
import type { BgpSession, OspfNeighbor } from "@/lib/types";

interface SyncStatus {
  syncing: boolean;
  lastSync: string | null;
  totalChunks: number;
  categories: string[];
  error: string | null;
}

interface MonitoringStatus {
  active: boolean;
  latestCpu: number;
  latestTemp: number;
  latestMemory: number;
}

interface PendingAction {
  id: string;
  command: string;
  explanation: string;
  riskLevel: string;
  createdAt: string;
}

export default function DashboardPage() {
  const [data, setData] = useState(() => generateSimulatedData());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    syncing: false,
    lastSync: null,
    totalChunks: 0,
    categories: [],
    error: null,
  });
  const [monitoring, setMonitoring] = useState<MonitoringStatus>({
    active: false,
    latestCpu: 0,
    latestTemp: 0,
    latestMemory: 0,
  });
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setData(generateSimulatedData());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Fetch doc sync status
    fetch("/api/docs/sync")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setSyncStatus((prev) => ({
            ...prev,
            lastSync: json.lastSync,
            totalChunks: json.totalChunks,
            categories: json.categories,
          }));
        }
      })
      .catch(() => {});

    // Fetch monitoring status
    fetch("/api/monitoring")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setMonitoring({
            active: json.active,
            latestCpu: json.latestSnapshot?.cpuLoad || 0,
            latestTemp: json.latestSnapshot?.temperature || 0,
            latestMemory: json.latestSnapshot?.memoryUsedPct || 0,
          });
        }
      })
      .catch(() => {});

    // Fetch pending actions
    fetch("/api/monitoring?action=actions")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setPendingActions(json.pending || []);
        }
      })
      .catch(() => {});
  }, []);

  const handleSyncDocs = async () => {
    setSyncStatus((prev) => ({ ...prev, syncing: true, error: null }));

    try {
      const res = await fetch("/api/docs/sync", { method: "POST" });
      const json = await res.json();

      if (json.success) {
        setSyncStatus({
          syncing: false,
          lastSync: json.lastSync,
          totalChunks: json.chunks,
          categories: json.categories,
          error: null,
        });
      } else {
        setSyncStatus((prev) => ({
          ...prev,
          syncing: false,
          error: json.error || "Sync failed",
        }));
      }
    } catch {
      setSyncStatus((prev) => ({
        ...prev,
        syncing: false,
        error: "Connection error during sync",
      }));
    }
  };

  const handleAction = async (actionId: string, approve: boolean) => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, confirm: approve }),
      });
      const json = await res.json();
      if (json.success) {
        setPendingActions((prev) => prev.filter((a) => a.id !== actionId));
      }
    } catch {
      // silent
    }
  };

  const memoryUsed = ((data.health.totalMemory - data.health.freeMemory) / data.health.totalMemory) * 100;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Network Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data.health.boardName} &middot; RouterOS {data.health.routerOsVersion} &middot; Uptime: {data.health.uptime}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Monitoring indicator */}
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${monitoring.active ? "bg-emerald-500" : "bg-amber-500"} animate-pulse`} />
            <span className={monitoring.active ? "text-emerald-400" : "text-amber-400"}>
              {monitoring.active ? "Monitoreo activo (60s)" : "Monitoreo inactivo"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400">Live</span>
          </div>
          <button
            onClick={handleSyncDocs}
            disabled={syncStatus.syncing}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            {syncStatus.syncing ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sincronizando...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sincronizar Documentacion
              </>
            )}
          </button>
        </div>
      </div>

      {syncStatus.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
          {syncStatus.error}
        </div>
      )}

      {syncStatus.totalChunks > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>Documentacion indexada: {syncStatus.totalChunks} fragmentos</span>
          {syncStatus.categories.length > 0 && (
            <span>Categorias: {syncStatus.categories.join(", ")}</span>
          )}
          {syncStatus.lastSync && (
            <span>Ultima sync: {new Date(syncStatus.lastSync).toLocaleString()}</span>
          )}
        </div>
      )}

      {/* Pending Actions Alert */}
      {pendingActions.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-amber-400 mb-3">
            Acciones Pendientes ({pendingActions.length})
          </h3>
          <div className="space-y-3">
            {pendingActions.map((action) => (
              <div key={action.id} className="flex items-start justify-between gap-4 bg-slate-900/50 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <code className="text-xs text-emerald-400 font-mono break-all">{action.command}</code>
                  <p className="text-xs text-slate-400 mt-1">{action.explanation}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      action.riskLevel === "high" ? "bg-red-500/20 text-red-400" :
                      action.riskLevel === "medium" ? "bg-amber-500/20 text-amber-400" :
                      "bg-emerald-500/20 text-emerald-400"
                    }`}>
                      {action.riskLevel}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(action.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleAction(action.id, true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition-colors"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => handleAction(action.id, false)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-medium transition-colors"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Traffic Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <TrafficChart label="ether1 (WAN)" maxRate={60} />
              <TrafficChart label="ether2 (LAN)" maxRate={30} />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">System Health</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricBar label="CPU Load" value={data.health.cpuLoad} max={100} unit="%" color="bg-emerald-500" />
              <MetricBar label="Memory" value={memoryUsed} max={100} unit="%" color="bg-blue-500" />
              <MetricBar label="Temperature" value={data.health.temperature} max={80} unit="C" color="bg-amber-500" />
              <MetricBar label="Voltage" value={data.health.voltage} max={14} unit="V" color="bg-violet-500" />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Interfaces</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.interfaces.map((iface) => (
                <InterfaceCard key={iface.name} iface={iface} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">BGP Sessions</h2>
              <div className="space-y-2">
                {data.bgpSessions.map((session) => (
                  <div key={session.name} className="bg-slate-900/50 rounded-lg p-3 border border-slate-800/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-200">{session.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        session.status === "established" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                      }`}>
                        {session.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-slate-400">
                      <span>AS{session.remoteAs} &middot; {session.remoteAddress}</span>
                      <span>{session.prefixCount.toLocaleString()} prefixes</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">OSPF Neighbors</h2>
              <div className="space-y-2">
                {data.ospfNeighbors.map((n) => (
                  <div key={n.identity} className="bg-slate-900/50 rounded-lg p-3 border border-slate-800/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-200">{n.identity}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        n.state === "Full" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {n.state}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-slate-400">
                      <span>{n.address} on {n.interface}</span>
                      <span>Priority: {n.priority}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Alerts</h2>
          <div className="space-y-2">
            {data.alerts.map((alert) => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
