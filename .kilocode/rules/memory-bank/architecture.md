# System Patterns: MikroTik Expert Sentinel

## Architecture Overview

```
src/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout + sidebar
│   ├── page.tsx                # Redirects to /dashboard
│   ├── globals.css             # Tailwind + dark mode
│   ├── dashboard/page.tsx      # Monitoring dashboard
│   ├── chat/page.tsx           # AI chatbot
│   ├── analyzer/page.tsx       # Config analyzer
│   ├── settings/page.tsx       # MikroTik API settings
│   └── api/
│       ├── chat/route.ts       # Chat + analysis API
│       ├── mikrotik/route.ts   # MikroTik connection API
│       └── health/route.ts     # Health check
├── components/
│   ├── Sidebar.tsx             # Navigation
│   ├── ChatInterface.tsx       # Chat UI with code blocks
│   ├── TrafficChart.tsx        # SVG line charts
│   ├── MetricBar.tsx           # Progress bar metrics
│   ├── InterfaceCard.tsx       # Interface status
│   ├── AlertItem.tsx           # Alert display
│   └── RscUploader.tsx         # File upload + results
├── lib/
│   ├── types.ts                # TypeScript interfaces
│   └── mikrotik/
│       ├── connection.ts       # Config storage, simulated data
│       ├── analyzer.ts         # RSC file analysis engine
│       └── chat-engine.ts      # AI response generation
└── docs/
    └── knowledge-base.ts       # RAG knowledge entries + search
```

## Key Patterns

- Server Components by default, "use client" for interactive pages
- Sidebar layout wraps all pages
- Simulated data for dashboard with periodic updates
- Knowledge base search for RAG-like responses
- Security pattern matching for RSC analysis
- Dark Slate/Zinc theme throughout
