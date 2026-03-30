"use client";

import { formatBytes, formatRate } from "@/lib/mikrotik/connection";
import type { InterfaceStats } from "@/lib/types";

export function InterfaceCard({ iface }: { iface: InterfaceStats }) {
  const isUp = iface.status === "up";

  return (
    <div className={`rounded-lg p-3 border transition-colors ${
      isUp
        ? "bg-slate-900/50 border-slate-800/50"
        : "bg-slate-900/20 border-slate-800/30 opacity-60"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isUp ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-sm font-medium text-slate-200">{iface.name}</span>
          {iface.comment && (
            <span className="text-xs text-slate-500">({iface.comment})</span>
          )}
        </div>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          iface.type === "wireguard" ? "bg-indigo-500/20 text-indigo-400" :
          iface.type === "vlan" ? "bg-amber-500/20 text-amber-400" :
          "bg-slate-700/50 text-slate-400"
        }`}>
          {iface.type}
        </span>
      </div>

      {isUp && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-slate-500">RX: </span>
            <span className="text-cyan-400 font-mono">{formatRate(iface.rxRate * 8)}</span>
          </div>
          <div>
            <span className="text-slate-500">TX: </span>
            <span className="text-violet-400 font-mono">{formatRate(iface.txRate * 8)}</span>
          </div>
          <div>
            <span className="text-slate-500">Total RX: </span>
            <span className="text-slate-300 font-mono">{formatBytes(iface.rxBytes)}</span>
          </div>
          <div>
            <span className="text-slate-500">Total TX: </span>
            <span className="text-slate-300 font-mono">{formatBytes(iface.txBytes)}</span>
          </div>
        </div>
      )}

      {!isUp && (
        <p className="text-xs text-slate-500">Interface is down</p>
      )}
    </div>
  );
}
