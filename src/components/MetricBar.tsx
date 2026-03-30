"use client";

export function MetricBar({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const percentage = Math.min((value / max) * 100, 100);
  const barColor = percentage > 80 ? "bg-red-500" : percentage > 60 ? "bg-amber-500" : color;

  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className="text-xs font-mono text-slate-300">
          {typeof value === "number" && value % 1 !== 0 ? value.toFixed(1) : value}{unit}
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
