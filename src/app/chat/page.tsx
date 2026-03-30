import { ChatInterface } from "@/components/ChatInterface";

export default function ChatPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-800">
        <h1 className="text-xl font-bold text-slate-100">Asistente IA</h1>
        <p className="text-sm text-slate-500 mt-1">
          Consulta sobre configuracion RouterOS, seguridad y redes
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatInterface />
      </div>
    </div>
  );
}
