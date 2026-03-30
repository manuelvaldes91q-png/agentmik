"use client";

import { useState, useEffect } from "react";

interface ConnectionForm {
  ip: string;
  port: number;
  username: string;
  password: string;
  useSsl: boolean;
  alias: string;
}

export default function SettingsPage() {
  const [form, setForm] = useState<ConnectionForm>({
    ip: "",
    port: 8728,
    username: "",
    password: "",
    useSsl: false,
    alias: "",
  });
  const [status, setStatus] = useState<"idle" | "testing" | "saving" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/mikrotik")
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "configured") {
          setForm({
            ip: data.host || "",
            port: data.port || 8728,
            username: data.username || "",
            password: "",
            useSsl: data.useSsl || false,
            alias: data.alias || "",
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleTest = async () => {
    setStatus("testing");
    setStatusMsg("Probando conexion...");

    try {
      const res = await fetch("/api/mikrotik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", config: form }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setStatusMsg(data.message || "Conexion exitosa.");
      } else {
        setStatus("error");
        setStatusMsg(data.error || "Fallo la conexion. Verifica credenciales e IP.");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Error de red. Asegurate de que la API sea accesible.");
    }
  };

  const handleSave = async () => {
    setStatus("saving");
    setStatusMsg("Guardando...");

    try {
      const res = await fetch("/api/mikrotik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", config: form }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setStatusMsg("Configuracion guardada correctamente.");
      } else {
        setStatus("error");
        setStatusMsg(data.error || "Error al guardar.");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Error de red al guardar.");
    }
  };

  const handleTestSaved = async () => {
    setStatus("testing");
    setStatusMsg("Probando conexion guardada...");

    try {
      const res = await fetch("/api/mikrotik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-saved" }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setStatusMsg(data.message || "Conexion exitosa con la configuracion guardada.");
      } else {
        setStatus("error");
        setStatusMsg(data.error || "Fallo la conexion con la configuracion guardada.");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Error de red.");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Seguro que deseas eliminar la configuracion guardada?")) return;
    setStatus("saving");
    setStatusMsg("Eliminando configuracion...");

    try {
      const res = await fetch("/api/mikrotik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setStatusMsg("Configuracion eliminada correctamente.");
        setForm({ ip: "", port: 8728, username: "", password: "", useSsl: false, alias: "" });
      } else {
        setStatus("error");
        setStatusMsg(data.error || "Error al eliminar.");
      }
    } catch {
      setStatus("error");
      setStatusMsg("Error de red al eliminar.");
    }
  };

  if (!loaded) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-slate-400">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Cargando configuracion...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Configuracion de Conexion</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configura el acceso API a tu router MikroTik para monitoreo en tiempo real
        </p>
      </div>

      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Alias del Router</label>
          <input
            type="text"
            value={form.alias}
            onChange={(e) => setForm({ ...form, alias: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            placeholder="Ej: Core Valencia, Ewinet-Principal"
          />
          <p className="text-xs text-slate-600 mt-1">Nombre para identificar este router</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">IP / Host</label>
            <input
              type="text"
              value={form.ip}
              onChange={(e) => setForm({ ...form, ip: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="190.x.x.x o tu-ddns.duckdns.org"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Puerto API</label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 8728 })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="8728"
            />
            <p className="text-xs text-slate-600 mt-1">8728 por defecto, 8729 para SSL</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Usuario</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Contrasena</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Ingresa tu contrasena"
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
          <span className="text-sm text-slate-300">Usar SSL (puerto API-SSL 8729)</span>
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
            {(status === "testing" || status === "saving") && (
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            {statusMsg}
          </div>
        )}

        <div className="flex gap-3 pt-2 flex-wrap">
          <button
            onClick={handleTest}
            disabled={status === "testing" || status === "saving"}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Probar Conexion
          </button>
          <button
            onClick={handleTestSaved}
            disabled={status === "testing" || status === "saving"}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Probar Config Guardada
          </button>
          <button
            onClick={handleSave}
            disabled={status === "testing" || status === "saving"}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Guardar Configuracion
          </button>
          <button
            onClick={handleDelete}
            disabled={status === "testing" || status === "saving"}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Eliminar Configuracion
          </button>
        </div>
      </div>

      <div className="mt-6 bg-slate-900/30 rounded-lg p-5 border border-slate-800/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Instrucciones de Configuracion</h3>
        <div className="space-y-2 text-sm text-slate-400">
          <p>1. Habilita el servicio API en tu MikroTik: <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">/ip service enable api</code></p>
          <p>2. Crea un usuario de solo lectura para monitoreo (recomendado):</p>
          <pre className="bg-slate-800/50 p-3 rounded text-xs font-mono text-slate-300 overflow-x-auto mt-1">
{`/user add name=monitor group=read password=CONTRASENA_FUERTE
/user group set read policy=api,read,test`}
          </pre>
          <p>3. Restringe el acceso API a la IP de este servidor: <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">/ip service set api address=IP_DE_TU_SERVIDOR</code></p>
          <p>4. Para SSL, habilita API-SSL: <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">/ip service enable api-ssl</code> y usa puerto 8729</p>
        </div>
      </div>
    </div>
  );
}
