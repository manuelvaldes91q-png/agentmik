import { RscUploader } from "@/components/RscUploader";

export default function AnalyzerPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Configuration Analyzer</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload .rsc RouterOS configuration files to detect security issues and get improvement suggestions
        </p>
      </div>

      <RscUploader />

      <div className="mt-8 bg-slate-900/30 rounded-lg p-5 border border-slate-800/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">What we check:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-400">
          <div className="flex items-start gap-2">
            <span className="text-red-400 shrink-0">1.</span>
            <span>Input chain rules without connection-state tracking</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-400 shrink-0">2.</span>
            <span>Insecure services (Telnet, FTP) left enabled</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-400 shrink-0">3.</span>
            <span>Open DNS resolvers without restrictions</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-400 shrink-0">4.</span>
            <span>Address lists without timeouts</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-400 shrink-0">5.</span>
            <span>Best practice suggestions for QoS, VLANs, and more</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-400 shrink-0">6.</span>
            <span>RouterOS v7 optimization opportunities</span>
          </div>
        </div>
      </div>
    </div>
  );
}
