# Active Context: MikroTik Expert Sentinel

## Current State

**Status**: Full application with CoT reasoning agent, autonomous monitoring, real-time security analysis, and execution authorization

The MikroTik Expert Sentinel v3.0 is a complete Next.js 16 application with:
- Dashboard with live monitoring, pending actions, doc sync, and Security Insights feed
- AI chatbot with Chain-of-Thought reasoning pipeline (Analysis → Reasoning → Hypothesis → Action)
- Autonomous monitoring service (60s interval) with anomaly detection
- Real-time log ingestion engine (10s polling) with attack pattern recognition
- Security analyzer: brute force, port scan, DDoS, protocol error detection
- Autonomous decision matrix (Baja/Media/Alta severity with auto-response)
- Command execution with safety analysis and operator authorization
- Long-term memory via SQLite (incidents, patterns, monitoring snapshots, security events)
- Documentation crawler with vector database for error correlation

## Recently Completed

- [x] Project structure: /components, /lib/mikrotik, /docs, /app routes
- [x] RAG knowledge base with 19 RouterOS v7 entries
- [x] Dashboard with traffic charts, system health, BGP/OSPF status, alerts
- [x] AI chatbot with code block rendering and copy functionality
- [x] .rsc file upload and security analysis
- [x] Documentation crawler using Cheerio for MikroTik help site
- [x] SQLite vector database with TF-IDF cosine similarity search
- [x] Chain-of-Thought reasoning engine (4-step pipeline)
- [x] Proactive monitoring service (60s interval, anomaly detection)
- [x] Command safety analysis and action confirmation system
- [x] Long-term memory (incidents, patterns, monitoring snapshots)
- [x] Senior Network Engineer personality
- [x] Real-time log ingestion engine (10s polling, simulated RouterOS logs)
- [x] Attack pattern recognition (brute force, port scan, DDoS, protocol errors)
- [x] Autonomous decision matrix (Baja/Media/Alta severity levels)
- [x] Auto-generate address-list ban commands for alta severity attacks
- [x] Correlate unknown errors with MikroTik Help vector database
- [x] Security Insights UI with expandable event cards and natural language explanations
- [x] Security API endpoint (/api/security) with event feed and stats

## Architecture

| Module | Purpose |
|--------|---------|
| `src/lib/mikrotik/chat-engine.ts` | CoT reasoning engine, command generation, safety analysis |
| `src/lib/mikrotik/monitoring.ts` | 60s background monitoring, anomaly detection |
| `src/lib/mikrotik/log-ingestion.ts` | 10s log polling, RouterOS log parsing, simulated events |
| `src/lib/mikrotik/security-analyzer.ts` | Attack detection (brute force, port scan, DDoS, protocol errors), severity classification, doc correlation |
| `src/lib/mikrotik/db.ts` | Unified SQLite DB (incidents, snapshots, actions, patterns, security events) |
| `src/lib/mikrotik/connection.ts` | Simulated router data |
| `src/lib/ingestion/vector-store.ts` | TF-IDF vector search for error correlation |
| `src/components/ChatInterface.tsx` | CoT step display, action confirmation UI |
| `src/components/SecurityInsights.tsx` | Security event feed with natural language explanations |
| `src/app/api/chat/route.ts` | Chat + action confirmation API |
| `src/app/api/monitoring/route.ts` | Monitoring control + data API |
| `src/app/api/security/route.ts` | Security events, stats, and ingestion control |

## Session History

| Date | Changes |
|------|---------|
| 2026-03-30 | Built complete MikroTik Expert Sentinel application |
| 2026-03-30 | Added RAG documentation crawler with vector database |
| 2026-03-30 | v2.0 CoT: Chain-of-Thought reasoning, autonomous monitoring, action authorization, long-term memory |
| 2026-03-30 | v3.0 Security: Real-time log ingestion, attack pattern recognition, autonomous decision matrix, Security Insights UI |
