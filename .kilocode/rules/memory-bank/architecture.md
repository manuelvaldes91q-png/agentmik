# System Patterns: MikroTik Expert Sentinel

## Architecture Overview

```
src/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout + sidebar
│   ├── page.tsx                # Redirects to /dashboard
│   ├── globals.css             # Tailwind + dark mode
│   ├── dashboard/page.tsx      # Monitoring dashboard + doc sync
│   ├── chat/page.tsx           # AI chatbot
│   ├── analyzer/page.tsx       # Config analyzer
│   ├── settings/page.tsx       # MikroTik API settings
│   └── api/
│       ├── chat/route.ts       # Chat + analysis API
│       ├── docs/sync/route.ts  # Documentation crawler sync API
│       ├── mikrotik/route.ts   # MikroTik connection API
│       └── health/route.ts     # Health check
├── components/
│   ├── Sidebar.tsx             # Navigation + KB stats
│   ├── ChatInterface.tsx       # Chat UI with code blocks
│   ├── TrafficChart.tsx        # SVG line charts
│   ├── MetricBar.tsx           # Progress bar metrics
│   ├── InterfaceCard.tsx       # Interface status
│   ├── AlertItem.tsx           # Alert display
│   └── RscUploader.tsx         # File upload + results
├── lib/
│   ├── types.ts                # TypeScript interfaces
│   ├── mikrotik/
│   │   ├── connection.ts       # Config storage, simulated data
│   │   ├── analyzer.ts         # RSC file analysis engine
│   │   └── chat-engine.ts      # AI response generation + vector search
│   └── ingestion/
│       ├── crawler.ts          # MikroTik docs crawler (Cheerio)
│       └── vector-store.ts     # SQLite vector DB + TF-IDF search
├── docs/
│   └── knowledge-base.ts       # Static RAG knowledge entries + search
└── data/                       # SQLite vector DB (gitignored)
    └── mikrotik-vector-store.db
```

## Key Patterns

- Server Components by default, "use client" for interactive pages
- Sidebar layout wraps all pages
- Simulated data for dashboard with periodic updates
- Two-tier knowledge retrieval: vector store (crawled docs) → static knowledge base fallback
- TF-IDF vectorization with cosine similarity for semantic search
- Rate-limited web crawler with retry logic for MikroTik help site
- Content chunking by HTML section headers (h1/h2/h3)
- Security pattern matching for RSC analysis
- Dark Slate/Zinc theme throughout
