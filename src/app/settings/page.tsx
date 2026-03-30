"use client";

import { useState } from "react";

interface ConnectionForm {
  ip: string;
  port: number;
  username: string;
  password: string;
  useSsl: boolean;
}

export default function SettingsPage() {
  const [form, setForm] = useState<ConnectionForm>({
    ip: "192.168.1.1",
    port: 8728,
    username: "admin",
    password: "",
    useSsl: false,
  });
  const [status, setStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const handleTest = async () => {
    setStatus("testing");
    setStatusMsg("Testing connection...");

    try {
      const res = await fetch("/api/mikrotik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", config: form }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setStatusMsg("Connection successful! Router detected.");
      } else {
        setStatus("error");
        setStatusMsg(data.error || "Connection failed. Check credentials and IP.");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Network error. Ensure the API is accessible.");
    }
  };

  const handleSave = async () => {
    await fetch("/api/mikrotik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", config: form }),
    });
    setStatus("success");
    setStatusMsg("Configuration saved.");
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">MikroTik Connection</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure API access to your MikroTik router for real-time monitoring
        </p>
      </div>

      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Router IP Address</label>
            <input
              type="text"
              value={form.ip}
              onChange={(e) => setForm({ ...form, ip: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="192.168.1.1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">API Port</label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 8728 })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="8728"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Enter password"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setForm({ ...form, useSsl: !form.useSsl })}
            className={`w-10 h-5 rounded-full transition-colors ${form.useSsl ? "bg-emerald-600" : "bg-slate-700"}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-0.5 ${form.useSsl ? "translate-x-5" : "translate-x-0"}`} />
          </button>
          <span className="text-sm text-slate-300">Use SSL (API-SSL port 8729)</span>
        </div>

        {status !== "idle" && (
          <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
            status === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
            status === "error" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
            "bg-blue-500/10 text-blue-400 border border-blue-500/20"
          }`}>
            {status === "success" && (
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {status === "testing" && (
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            {statusMsg}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleTest}
            disabled={status === "testing"}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Test Connection
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Save Configuration
          </button>
        </div>
      </div>

      <div className="mt-6 bg-slate-900/30 rounded-lg p-5 border border-slate-800/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Setup Instructions</h3>
        <div className="space-y-2 text-sm text-slate-400">
          <p>1. Enable API service on your MikroTik: <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">/ip service enable api</code></p>
          <p>2. Create a read-only user for monitoring (recommended):</p>
          <pre className="bg-slate-800/50 p-3 rounded text-xs font-mono text-slate-300 overflow-x-auto mt-1">
{`/user add name=monitor group=read password=STRONG_PASS
/user group set read policy=api,read,test`}
          </pre>
          <p>3. Restrict API access to this server&apos;s IP: <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">/ip service set api address=YOUR_SERVER_IP</code></p>
          <p>4. For SSL, enable API-SSL: <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">/ip service enable api-ssl</code> and use port 8729</p>
        </div>
      </div>
    </div>
  );
}
