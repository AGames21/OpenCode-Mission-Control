# OpenCode Mission Control

A futuristic real-time desktop dashboard for monitoring OpenCode AI agents and multi-agent workflows.

> **Status:** early development (v0.1.0). The web frontend connects to a local
> `opencode serve` instance and visualizes **real** sessions, agents,
> delegation, models, and usage. The Tauri 2 Windows shell + installer are on
> the roadmap. This is an independent community project, not affiliated with
> OpenCode.

## What works today

- **Live agent graph** — every agent reported by your OpenCode server appears
  as a node with real model, variant, state, and latest activity.
- **Real delegation edges** — derived from `session.children` parent IDs only.
  No guessed relationships.
- **Agent inspector** — role, model, variant, status, parent, children,
  session, elapsed time, real cost and token usage per agent.
- **Live timeline** — real SSE events with agent/type/error filters.
- **Setup detection** — probes local endpoints, one click to connect.
- **Reliability** — auto-reconnect with backoff, per-call degradation, unknown
  events preserved (never crash, never fake).

## Quick start (development)

Requirements: Node 20+, [OpenCode](https://opencode.ai) 1.18+.

```sh
# 1. Start a local OpenCode server (telemetry stays on this machine)
opencode serve --port 4096

# 2. Install and run the dashboard
npm install
npm run dev
# open http://localhost:5199 → Connect → LIVE
```

Other commands: `npm test` (vitest), `npm run typecheck`, `npm run build`.

## How it connects

Mission Control uses only the official `@opencode-ai/sdk`:

| Signal | SDK call | Real? |
|---|---|---|
| Agent list + variants | `app.agents()` | ✅ |
| Sessions | `session.list()` | ✅ |
| Parent/child delegation | `session.children()` | ✅ |
| Cost + tokens | session `cost` / `tokens` fields | ✅ |
| Per-agent model | session `model` field | ✅ |
| Live events | `global.event()` SSE | ✅ |
| Hidden chain-of-thought | — | ❌ never exposed |

Nothing leaves the machine. No analytics, no accounts.

## Roadmap

- Tauri 2 Windows shell (sidecar server, tray, notifications)
- `OpenCode-Mission-Control-Setup-x64.exe` (NSIS, per-user, no admin)
- Mini always-on-top mode, in-app updater, GitHub release automation
- Screenshots + full docs (`ARCHITECTURE.md`, `DEVELOPMENT.md`)

## License

MIT — see `LICENSE` (to be added before first release).
