"use client";

import type { Alert } from "@/lib/types";

function getAlertIcon(type: Alert["type"]) {
  switch (type) {
    case "critical":
      return "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z";
    case "warning":
      return "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
    case "info":
      return "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
  }
}

function getAlertColor(type: Alert["type"]) {
  switch (type) {
    case "critical": return "text-red-400 bg-red-500/10 border-red-500/20";
    case "warning": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    case "info": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  }
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AlertItem({ alert }: { alert: Alert }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${getAlertColor(alert.type)}`}>
      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={getAlertIcon(alert.type)} />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{alert.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs opacity-60">{alert.source}</span>
          <span className="text-xs opacity-40">&middot;</span>
          <span className="text-xs opacity-60">{formatTimeAgo(alert.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
