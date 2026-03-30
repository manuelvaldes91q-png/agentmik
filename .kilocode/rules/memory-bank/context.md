# Active Context: MikroTik Expert Sentinel

## Current State

**Status**: Full application with CoT reasoning, autonomous monitoring, real-time security analysis, full Spanish localization, and real MikroTik connection support

The MikroTik Expert Sentinel v3.0 is a complete Next.js 16 application with:
- Full Spanish localization (UI, AI responses, alerts, security events)
- Real MikroTik connection via node-routeros with persisted credentials
- Dashboard with live monitoring, pending actions, doc sync, Security Insights feed
- AI chatbot with Chain-of-Thought reasoning pipeline in Spanish
- Autonomous monitoring service (60s interval) with anomaly detection
- Real-time log ingestion engine (10s polling) with attack pattern recognition
- Command execution with safety analysis and operator authorization
- Long-term memory via SQLite (incidents, patterns, monitoring snapshots, security events)
- Documentation crawler with vector database

## Architecture

| Module | Purpose |
|--------|---------|
| `src/lib/mikrotik/connection.ts` | Client-safe: simulated data, validation, formatters |
| `src/lib/mikrotik/connection-server.ts` | Server-only: node-routeros real connection |
| `src/lib/mikrotik/db.ts` | Unified SQLite (config persisted, incidents, snapshots, actions, security events) |
| `src/lib/mikrotik/chat-engine.ts` | CoT reasoning engine (Spanish) |
| `src/lib/mikrotik/monitoring.ts` | 60s background monitoring |
| `src/lib/mikrotik/log-ingestion.ts` | 10s log polling (Spanish messages) |
| `src/lib/mikrotik/security-analyzer.ts` | Attack detection (Spanish) |
| `src/components/ChatInterface.tsx` | CoT display, action confirmation (Spanish) |
| `src/components/SecurityInsights.tsx` | Security event feed (Spanish) |
| `src/components/RscUploader.tsx` | Config analyzer (Spanish) |

## Localization

All text is in Spanish:
- Navigation: "Panel de Control", "Asistente IA", "Analizador de Config", "Configuracion"
- AI responses: Technical Spanish networking terminology
- Security events: "Fuerza Bruta", "Escaneo de Puertos", "DDoS/Flooding"
- Alerts: "Pico de CPU detectado", "Sesion BGP restablecida"
- Actions: "Ejecutar (OK)", "Cancelar", "Reconocido"

## Real Connection

- Settings form with: Alias, IP/Host, Puerto API, Usuario, Contrasena, SSL toggle
- Credentials persisted in SQLite `mikrotik_config` table
- Connection test via node-routeros (server-side only)
- Simulated data used as fallback when no real router configured
- "Eliminar Configuracion" button to delete saved credentials from DB

## Session History

| Date | Changes |
|------|---------|
| 2026-03-30 | Built complete application |
| 2026-03-30 | Added RAG documentation crawler with vector database |
| 2026-03-30 | v2.0 CoT: Chain-of-Thought reasoning, autonomous monitoring |
| 2026-03-30 | v3.0 Security: Real-time log ingestion, attack pattern recognition |
| 2026-03-30 | v3.1: Full Spanish localization, real MikroTik connection with node-routeros, credential persistence |
| 2026-03-30 | Added delete MikroTik config button to remove saved router credentials |
| 2026-03-30 | Dashboard now fetches real router data when configured, simulated data only as preview |
| 2026-03-30 | Traffic charts use real interface rates, dynamically render active interfaces |
| 2026-03-30 | RouterOS v6/v7 compatibility: dynamic BGP commands, version detection |
