"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/chat", label: "AI Assistant", icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
  { href: "/analyzer", label: "Config Analyzer", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  { href: "/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [kbStats, setKbStats] = useState({ totalChunks: 0, lastSync: null as string | null });
  const [agentStatus, setAgentStatus] = useState({ active: false, snapshots: 0 });
  const [secStatus, setSecStatus] = useState({ active: false, activeEvents: 0, altaCount: 0 });

  useEffect(() => {
    fetch("/api/docs/sync")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setKbStats({ totalChunks: json.totalChunks, lastSync: json.lastSync });
        }
      })
      .catch(() => {});

    fetch("/api/monitoring")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setAgentStatus({ active: json.active, snapshots: json.snapshotsCount || 0 });
        }
      })
      .catch(() => {});

    fetch("/api/security")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setSecStatus({
            active: json.ingestion?.active || false,
            activeEvents: json.activeEvents || 0,
            altaCount: json.altaCount || 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100">MikroTik Expert</h1>
            <p className="text-xs text-emerald-500 font-medium">Sentinel v2.0 CoT</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-slate-800 text-emerald-400"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className={`w-2 h-2 rounded-full ${agentStatus.active ? "bg-emerald-500" : "bg-amber-500"} animate-pulse`} />
          <span>{agentStatus.active ? "Agente activo" : "Agente en standby"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
          <div className={`w-2 h-2 rounded-full ${secStatus.active ? "bg-emerald-500" : "bg-slate-500"}`} />
          <span>
            {secStatus.active
              ? `Security: ${secStatus.activeEvents} eventos` + (secStatus.altaCount > 0 ? ` (${secStatus.altaCount} alta)` : "")
              : "Security: standby"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
          <div className={`w-2 h-2 rounded-full ${kbStats.totalChunks > 0 ? "bg-emerald-500" : "bg-slate-500"}`} />
          <span>{kbStats.totalChunks > 0 ? `KB: ${kbStats.totalChunks} chunks` : "KB: 19 static"}</span>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          {kbStats.lastSync
            ? `Docs synced: ${new Date(kbStats.lastSync).toLocaleDateString()}`
            : "Sync docs from Dashboard"}
        </p>
      </div>
    </aside>
  );
}
