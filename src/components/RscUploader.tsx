"use client";

import { useState } from "react";
import type { RscAnalysisResult } from "@/lib/types";

export function RscUploader() {
  const [result, setResult] = useState<RscAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const analyzeFile = async (file: File) => {
    setIsAnalyzing(true);
    const content = await file.text();

    try {
      const res = await fetch("/api/chat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, filename: file.name }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({
        filename: file.name,
        securityIssues: [{ severity: "high", message: "Failed to analyze file" }],
        suggestions: [],
        parsedSections: {},
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) analyzeFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) analyzeFile(file);
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragOver
            ? "border-emerald-500 bg-emerald-500/5"
            : "border-slate-700 bg-slate-900/30"
        }`}
      >
        <svg className="w-10 h-10 mx-auto text-slate-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-slate-400 mb-2">
          Drag and drop your <span className="text-emerald-400 font-mono">.rsc</span> file here
        </p>
        <p className="text-xs text-slate-500 mb-4">or</p>
        <label className="inline-block px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm cursor-pointer transition-colors">
          Browse Files
          <input
            type="file"
            accept=".rsc,.txt"
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
      </div>

      {isAnalyzing && (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Analyzing configuration...</p>
        </div>
      )}

      {result && !isAnalyzing && (
        <div className="space-y-4">
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">
              Analysis: <span className="font-mono text-emerald-400">{result.filename}</span>
            </h3>

            {result.securityIssues.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
                  Security Issues ({result.securityIssues.length})
                </h4>
                <div className="space-y-2">
                  {result.securityIssues.map((issue, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 text-sm p-2 rounded ${
                        issue.severity === "high" ? "bg-red-500/10 text-red-300" :
                        issue.severity === "medium" ? "bg-amber-500/10 text-amber-300" :
                        "bg-blue-500/10 text-blue-300"
                      }`}
                    >
                      <span className="text-xs font-mono px-1 rounded bg-slate-800 shrink-0">
                        {issue.severity.toUpperCase()}
                      </span>
                      <span>{issue.message}</span>
                      {issue.line && <span className="text-xs opacity-60">Line {issue.line}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.suggestions.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">
                  Suggestions ({result.suggestions.length})
                </h4>
                <ul className="space-y-1">
                  {result.suggestions.map((s, i) => (
                    <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                      <span className="text-amber-500 shrink-0">&rarr;</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Object.keys(result.parsedSections).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Parsed Sections
                </h4>
                <div className="space-y-2">
                  {Object.entries(result.parsedSections).map(([section, lines]) => (
                    <details key={section} className="bg-slate-800/50 rounded border border-slate-700/50">
                      <summary className="px-3 py-2 text-xs font-mono text-slate-300 cursor-pointer">
                        {section} ({lines.length} lines)
                      </summary>
                      <pre className="px-3 py-2 text-xs font-mono text-slate-400 border-t border-slate-700/50 overflow-x-auto">
                        {lines.join("\n")}
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {result.securityIssues.length === 0 && result.suggestions.length === 0 && (
              <div className="flex items-center gap-2 text-emerald-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">No obvious issues detected</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
