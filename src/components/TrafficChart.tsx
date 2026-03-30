"use client";

import { useEffect, useState, useRef } from "react";

interface TrafficPoint { time: number; rx: number; tx: number; }

export function TrafficChart({ label, maxRate, rxRate, txRate, isReal }: { label: string; maxRate: number; rxRate?: number; txRate?: number; isReal?: boolean }) {
  const [data, setData] = useState<TrafficPoint[]>([]);
  const rxRef = useRef(rxRate ?? 0);
  const txRef = useRef(txRate ?? 0);

  // Update refs when props change
  useEffect(() => {
    if (rxRate !== undefined) rxRef.current = rxRate;
    if (txRate !== undefined) txRef.current = txRate;
  }, [rxRate, txRate]);

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        const next = [...prev.slice(-29), {
          time: Date.now(),
          rx: isReal ? rxRef.current / 1_000_000 : 20 + Math.random() * 40,
          tx: isReal ? txRef.current / 1_000_000 : 10 + Math.random() * 25,
        }];
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [isReal]);

  const height = 80;
  const width = 300;

  const maxVal = data.length > 0
    ? Math.max(maxRate, ...data.map((p) => Math.max(p.rx, p.tx))) * 1.1
    : maxRate;

  const rxPath = data.map((p, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (p.rx / maxVal) * height;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  const txPath = data.map((p, i) => {
    const x = (i / (data.length - 1)) * width;
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
            <span className="text-slate-400">RX {currentRx.toFixed(1)} Mbps</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-slate-400">TX {currentTx.toFixed(1)} Mbps</span>
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
        {data.length > 1 && (
          <>
            <path d={rxFill} fill={`url(#rx-grad-${label})`} />
            <path d={txFill} fill={`url(#tx-grad-${label})`} />
            <path d={rxPath} fill="none" stroke="#06b6d4" strokeWidth="1.5" />
            <path d={txPath} fill="none" stroke="#8b5cf6" strokeWidth="1.5" />
          </>
        )}
      </svg>
    </div>
  );
}
