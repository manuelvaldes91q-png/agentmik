"use client";

import { useEffect, useState } from "react";

interface TrafficPoint { time: number; rx: number; tx: number; }

function generateInitialData(count: number): TrafficPoint[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    time: now - (count - 1 - i) * 2000,
    rx: 20 + Math.random() * 40,
    tx: 10 + Math.random() * 25,
  }));
}

export function TrafficChart({ label, maxRate }: { label: string; maxRate: number }) {
  const [data, setData] = useState<TrafficPoint[]>(() => generateInitialData(30));

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        const next = [...prev.slice(1), {
          time: Date.now(),
          rx: 20 + Math.random() * 40,
          tx: 10 + Math.random() * 25,
        }];
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const height = 80;
  const width = 300;
  const maxVal = maxRate || 60;

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

  const currentRx = data[data.length - 1]?.rx ?? 0;
  const currentTx = data[data.length - 1]?.tx ?? 0;

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
        <path d={rxFill} fill={`url(#rx-grad-${label})`} />
        <path d={txFill} fill={`url(#tx-grad-${label})`} />
        <path d={rxPath} fill="none" stroke="#06b6d4" strokeWidth="1.5" />
        <path d={txPath} fill="none" stroke="#8b5cf6" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
