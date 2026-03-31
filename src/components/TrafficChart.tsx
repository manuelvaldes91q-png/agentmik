"use client";

import { useState, useRef, useEffect } from "react";

interface TrafficPoint { time: number; rx: number; tx: number; }

function formatRate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} kbps`;
  if (bps >= 1) return `${bps.toFixed(0)} bps`;
  return `0 bps`;
}

export function TrafficChart({ label, rxRate, txRate, isReal }: { label: string; rxRate?: number; txRate?: number; isReal?: boolean }) {
  const [data, setData] = useState<TrafficPoint[]>([]);
  const prevRx = useRef<number | undefined>(undefined);
  const prevTx = useRef<number | undefined>(undefined);

  useEffect(() => {
    const rx = isReal ? (rxRate ?? 0) : 0;
    const tx = isReal ? (txRate ?? 0) : 0;

    if (prevRx.current !== rx || prevTx.current !== tx) {
      prevRx.current = rx;
      prevTx.current = tx;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData((prev) => [...prev.slice(-29), { time: Date.now(), rx, tx }]);
    }
  }, [rxRate, txRate, isReal]);

  const height = 80;
  const width = 300;

  const maxVal = data.length > 0
    ? Math.max(100_000, ...data.map((p) => Math.max(p.rx, p.tx))) * 1.2
    : 100_000;

  const rxPath = data.map((p, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - (p.rx / maxVal) * height;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  const txPath = data.map((p, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - (p.tx / maxVal) * height;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  const rxFill = rxPath + ` L ${width} ${height} L 0 ${height} Z`;
  const txFill = txPath + ` L ${width} ${height} L 0 ${height} Z`;

  const currentRx = data.length > 0 ? data[data.length - 1].rx : 0;
  const currentTx = data.length > 0 ? data[data.length - 1].tx : 0;

  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500" />
            <span className="text-slate-400">RX {formatRate(currentRx)}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-slate-400">TX {formatRate(currentTx)}</span>
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20">
        <defs>
          <linearGradient id={`rx-grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`tx-grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#334155" strokeWidth="0.5" strokeDasharray="4" />
        <line x1="0" y1={height} x2={width} y2={height} stroke="#334155" strokeWidth="0.5" />
        {data.length > 1 && (
          <>
            <path d={rxFill} fill={`url(#rx-grad-${label})`} />
            <path d={txFill} fill={`url(#tx-grad-${label})`} />
            <path d={rxPath} fill="none" stroke="#06b6d4" strokeWidth="1.5" />
            <path d={txPath} fill="none" stroke="#8b5cf6" strokeWidth="1.5" />
          </>
        )}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
        <span>-30s</span>
        <span>-15s</span>
        <span>ahora</span>
      </div>
    </div>
  );
}
