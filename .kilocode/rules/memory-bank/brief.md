# Project Brief: MikroTik Expert Sentinel

## Purpose

A full-stack AI-powered MikroTik RouterOS expert assistant application that provides real-time network monitoring, configuration analysis, and an AI chatbot specialized in MikroTik networking.

## Target Users

- Network engineers managing MikroTik infrastructure
- ISPs and WISPs using RouterOS
- System administrators needing RouterOS configuration help

## Core Use Case

1. **Dashboard**: Monitor router interfaces, CPU/RAM, BGP/OSPF sessions, and receive alerts
2. **AI Chatbot**: Get expert RouterOS v7 configuration help with code examples
3. **Config Analyzer**: Upload .rsc files to detect security issues and get suggestions
4. **Settings**: Configure real MikroTik API connection for live data

## Key Requirements

### Must Have
- Next.js 16 with App Router and TypeScript
- Tailwind CSS 4 dark mode (Slate/Zinc theme)
- RAG knowledge base for MikroTik documentation
- Dashboard with traffic charts, system health, interface status
- AI chatbot with code block highlighting
- .rsc configuration file analyzer
- MikroTik API connection settings
- Modular structure: /components, /lib/mikrotik, /docs

### Technical
- RouterOS v7 prioritized
- Security best practices (Firewall, Mangle, Raw rules)
- Simulated data for demo, real API integration ready

## Constraints

- Package manager: Bun
- No external AI API - uses local knowledge base search
- Simulated monitoring data in demo mode
