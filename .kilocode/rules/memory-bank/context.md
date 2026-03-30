# Active Context: MikroTik Expert Sentinel

## Current State

**Status**: Full application built and operational with RAG documentation crawler

The MikroTik Expert Sentinel is a complete Next.js 16 application with:
- Dashboard with live monitoring simulation and documentation sync button
- AI chatbot with vector store search + static knowledge base fallback
- Configuration analyzer for .rsc files
- MikroTik API settings page
- Documentation crawler with SQLite vector database

## Recently Completed

- [x] Project structure: /components, /lib/mikrotik, /docs, /app routes
- [x] RAG knowledge base with 19 RouterOS v7 entries (Firewall, VPN, BGP, OSPF, QoS, Security, etc.)
- [x] Dashboard with traffic charts, system health bars, interface cards, BGP/OSPF status, alerts
- [x] AI chatbot with code block rendering and copy functionality
- [x] .rsc file upload and security analysis
- [x] MikroTik API connection settings with test/save functionality
- [x] Dark mode Slate/Zinc styling
- [x] All routes build successfully
- [x] Documentation crawler using Cheerio for MikroTik help site
- [x] SQLite vector database (better-sqlite3) with TF-IDF cosine similarity search
- [x] Content chunking by HTML sections (h1/h2/h3)
- [x] "Sincronizar Documentacion" button on Dashboard
- [x] API endpoint `/api/docs/sync` for crawling and status
- [x] Chat engine integration with vector store semantic search
- [x] Rate-limited crawler (1.5s delay, 3 retries, 15s timeout)

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/components/Sidebar.tsx` | Navigation sidebar with DB stats | Updated |
| `src/components/ChatInterface.tsx` | AI chatbot UI | Done |
| `src/components/TrafficChart.tsx` | Live traffic SVG charts | Done |
| `src/components/MetricBar.tsx` | CPU/RAM/temp bars | Done |
| `src/components/InterfaceCard.tsx` | Interface status cards | Done |
| `src/components/AlertItem.tsx` | Alert display | Done |
| `src/components/RscUploader.tsx` | .rsc file upload/analysis | Done |
| `src/lib/mikrotik/connection.ts` | Config, simulated data | Done |
| `src/lib/mikrotik/analyzer.ts` | RSC analysis engine | Done |
| `src/lib/mikrotik/chat-engine.ts` | AI response generator with vector search | Updated |
| `src/lib/ingestion/crawler.ts` | MikroTik docs crawler (Cheerio) | New |
| `src/lib/ingestion/vector-store.ts` | SQLite vector DB with TF-IDF search | New |
| `src/docs/knowledge-base.ts` | Static RAG knowledge entries | Done |
| `src/app/dashboard/page.tsx` | Dashboard with sync button | Updated |
| `src/app/chat/page.tsx` | Chat page | Done |
| `src/app/analyzer/page.tsx` | Config analyzer page | Done |
| `src/app/settings/page.tsx` | MikroTik API settings | Done |
| `src/app/api/chat/route.ts` | Chat API | Done |
| `src/app/api/docs/sync/route.ts` | Documentation sync API | New |
| `src/app/api/mikrotik/route.ts` | MikroTik API proxy | Done |
| `src/app/api/health/route.ts` | Health check | Done |

## Session History

| Date | Changes |
|------|---------|
| 2026-03-30 | Built complete MikroTik Expert Sentinel application |
| 2026-03-30 | Added RAG documentation crawler with Cheerio, SQLite vector store, TF-IDF search, dashboard sync button |
