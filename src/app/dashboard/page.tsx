"use client";

import { useState, useEffect } from "react";
import { generateSimulatedData, formatRate, formatBytes } from "@/lib/mikrotik/connection";
import { InterfaceCard } from "@/components/InterfaceCard";
import { MetricBar } from "@/components/MetricBar";
import { TrafficChart } from "@/components/TrafficChart";
import { AlertItem } from "@/components/AlertItem";
import type { InterfaceStats, SystemHealth, BgpSession, OspfNeighbor, Alert } from "@/lib/types";

export default function DashboardPage() {
  const [data, setData] = useState(() => generateSimulatedData());

  useEffect(() => {
    const interval = setInterval(() => {
      setData(generateSimulatedData());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

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
        <div className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-emerald-400">Live</span>
        </div>
      </div>

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
