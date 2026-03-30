import { RscUploader } from "@/components/RscUploader";

export default function AnalyzerPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Analizador de Configuracion</h1>
        <p className="text-sm text-slate-500 mt-1">
          Sube archivos .rsc de RouterOS para detectar problemas de seguridad y obtener sugerencias
        </p>
      </div>

      <RscUploader />

      <div className="mt-8 bg-slate-900/30 rounded-lg p-5 border border-slate-800/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Que verificamos:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-400">
          <div className="flex items-start gap-2">
            <span className="text-red-400 shrink-0">1.</span>
            <span>Reglas de input chain sin connection-state tracking</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-400 shrink-0">2.</span>
            <span>Servicios inseguros habilitados (Telnet, FTP)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-400 shrink-0">3.</span>
            <span>Resolvers DNS abiertos sin restricciones</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-400 shrink-0">4.</span>
            <span>Address lists sin timeouts</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-400 shrink-0">5.</span>
            <span>Sugerencias de mejores practicas para QoS, VLANs y mas</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-400 shrink-0">6.</span>
            <span>Oportunidades de optimizacion para RouterOS v7</span>
          </div>
        </div>
      </div>
    </div>
  );
}
