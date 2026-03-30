"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface CoTStep {
  label: string;
  content: string;
  type: "analysis" | "reasoning" | "hypothesis" | "action";
}

interface ProposedAction {
  id: string;
  command: string;
  explanation: string;
  riskLevel: "low" | "medium" | "high";
  reversible: boolean;
  status: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  cotSteps?: CoTStep[];
  proposedAction?: ProposedAction | null;
  references?: string[];
  timestamp: Date;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-slate-700/50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700/50">
        <span className="text-xs text-slate-400 font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-3 bg-slate-900/80 overflow-x-auto">
        <code className="text-sm font-mono text-emerald-300 whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function renderContent(content: string) {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
          {renderInlineFormatting(content.slice(lastIndex, match.index))}
        </span>
      );
    }
    parts.push(
      <CodeBlock key={`code-${match.index}`} language={match[1] || "text"} code={match[2].trim()} />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(
      <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
        {renderInlineFormatting(content.slice(lastIndex))}
      </span>
    );
  }

  return parts;
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const boldRegex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={`bold-${match.index}`} className="text-slate-100 font-semibold">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

const stepIcons: Record<string, string> = {
  analysis: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  reasoning: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  hypothesis: "M13 10V3L4 14h7v7l9-11h-7z",
  action: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z",
};

const stepColors: Record<string, string> = {
  analysis: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  reasoning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  hypothesis: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  action: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

function CoTStepDisplay({ step, index }: { step: CoTStep; index: number }) {
  const [expanded, setExpanded] = useState(index < 2);
  const color = stepColors[step.type] || stepColors.analysis;
  const icon = stepIcons[step.type] || stepIcons.analysis;

  return (
    <div className={`rounded-lg border ${color} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider flex-1">
          Paso {index + 1}: {step.label}
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 text-xs leading-relaxed text-slate-400 whitespace-pre-wrap">
          {step.content}
        </div>
      )}
    </div>
  );
}

function ActionConfirmation({
  action,
  onConfirm,
}: {
  action: ProposedAction;
  onConfirm: (approved: boolean) => void;
}) {
  const riskColors = {
    low: "text-emerald-400 bg-emerald-500/20",
    medium: "text-amber-400 bg-amber-500/20",
    high: "text-red-400 bg-red-500/20",
  };

  return (
    <div className="mt-3 rounded-lg border border-slate-700/50 bg-slate-900/50 overflow-hidden">
      <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-200">Accion Pendiente</span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${riskColors[action.riskLevel]}`}>
            Riesgo: {action.riskLevel}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">{action.explanation}</p>
      </div>

      <div className="px-4 py-3">
        <CodeBlock code={action.command} language="routeros" />

        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={() => onConfirm(true)}
            className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Ejecutar (OK)
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
        </div>
        {!action.reversible && (
          <p className="text-xs text-red-400 mt-2">
            Este comando NO es reversible. Ejecucion manual recomendada.
          </p>
        )}
      </div>
    </div>
  );
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `MikroTik Expert Sentinel online. I'm your network operations analyst.

I can handle:
- **Firewall/NAT/Raw** rule design and troubleshooting
- **BGP/OSPF** routing analysis and optimization
- **VPN** deployment (WireGuard, IPsec IKEv2)
- **QoS** queue trees and PCQ configuration
- **VLAN/Bridge** segmentation
- **Security hardening** and threat response
- **Live monitoring** with anomaly detection
- **Command execution** with safety analysis

I run continuous monitoring in the background. If I detect an anomaly, I'll alert you with a proposed fix.

What's the situation?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fetch pending actions on mount
  useEffect(() => {
    fetch("/api/monitoring?action=actions")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.pending?.length > 0) {
          // Show pending actions as system messages
          for (const action of json.pending) {
            const actionMsg: Message = {
              id: `pending-${action.id}`,
              role: "assistant",
              content: `**Accion pendiente de aprobacion previa**\n\n\`${action.command}\`\n\n${action.explanation}`,
              proposedAction: action,
              timestamp: new Date(action.createdAt),
            };
            setMessages((prev) => [...prev, actionMsg]);
          }
        }
      })
      .catch(() => {});
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content }),
      });
      const data = await res.json();

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "No pude procesar la solicitud.",
        cotSteps: data.cotSteps || [],
        proposedAction: data.proposedAction || null,
        references: data.references || [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Error de conexion. Verifique la red.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionConfirm = async (messageId: string, actionId: string, approved: boolean) => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, confirm: approved }),
      });
      const data = await res.json();

      // Update the message to remove the action UI and show result
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === messageId) {
            return {
              ...msg,
              proposedAction: msg.proposedAction
                ? { ...msg.proposedAction, status: approved ? "executed" : "rejected" }
                : null,
            };
          }
          return msg;
        })
      );

      // Add result message
      const resultMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: data.result || (approved ? "Accion ejecutada." : "Accion cancelada."),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, resultMsg]);
    } catch {
      const errMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: "Error al procesar la confirmacion.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-emerald-600/20 border border-emerald-500/30 text-slate-100"
                  : "bg-slate-800/80 border border-slate-700/50 text-slate-300"
              }`}
            >
              {/* CoT Steps */}
              {msg.cotSteps && msg.cotSteps.length > 0 && (
                <div className="mb-3 space-y-2">
                  {msg.cotSteps.map((step, i) => (
                    <CoTStepDisplay key={i} step={step} index={i} />
                  ))}
                </div>
              )}

              {/* Response */}
              <div className="text-sm leading-relaxed">{renderContent(msg.content)}</div>

              {/* References */}
              {msg.references && msg.references.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-700/50">
                  <p className="text-xs text-slate-500">
                    Referencias:{" "}
                    {msg.references.map((ref, i) => (
                      <span key={i}>
                        {i > 0 && ", "}
                        <a
                          href={ref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-500 hover:underline"
                        >
                          Doc #{i + 1}
                        </a>
                      </span>
                    ))}
                  </p>
                </div>
              )}

              {/* Action Confirmation */}
              {msg.proposedAction && msg.proposedAction.status === "pending" && (
                <ActionConfirmation
                  action={msg.proposedAction}
                  onConfirm={(approved) => handleActionConfirm(msg.id, msg.proposedAction!.id, approved)}
                />
              )}

              {/* Executed/Rejected status */}
              {msg.proposedAction &&
                (msg.proposedAction.status === "executed" || msg.proposedAction.status === "rejected") && (
                  <div
                    className={`mt-2 text-xs px-2 py-1 rounded inline-block ${
                      msg.proposedAction.status === "executed"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {msg.proposedAction.status === "executed" ? "Ejecutado" : "Cancelado"}
                  </div>
                )}

              <p className="text-xs text-slate-500 mt-2">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs text-slate-500">Analizando...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe el problema o consulta de red..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            rows={2}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors self-end"
          >
            Enviar
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2">
          Chain-of-Thought reasoning activo &middot; Monitoreo continuo &middot; Ejecucion con autorizacion
        </p>
      </div>
    </div>
  );
}
