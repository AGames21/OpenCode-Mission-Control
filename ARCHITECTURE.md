# Architecture — OpenCode Mission Control (v0.1.x, web frontend)

## Principle

Only the **official `@opencode-ai/sdk`** talks to OpenCode. No terminal
scraping, no DB reads, no private APIs. Every number on screen traces to an
SDK response field; anything unobservable is labeled `unavailable` or omitted.

## Runtime

```
opencode serve --port 4096   (localhost only, user-run for now)
        │  HTTP + SSE  (official SDK routes)
        ▼
React 19 + Vite + TypeScript + zustand + @xyflow/react
```

Later: a Tauri 2 shell will spawn `opencode serve` as a sidecar and expose
tray/notifications/updater. The frontend needs no changes for that.

## Data flow (all local)

1. **Probe** — `config.get()` must return an object with `model` (string) or
   an OpenCode `$schema`. Any other HTTP server is rejected (no false
   "detected").
2. **Snapshot** — `app.agents()` + `session.list()` + `config.get()` in
   parallel, each independently fallible. Sessions sorted newest-first
   (list order is not contractual). Children fetched for the 20 most recent
   sessions (bounded fan-out), then `buildDelegation()` derives:
   - `parents`: agent → parent agent (only from real `parentID`)
   - `childCounts`, `usage` (cost/tokens sums), `latest` session per agent
3. **Live events** — `global.event()` SSE with SDK auto-retry **disabled**;
   the store owns reconnection (status UI + exponential backoff to 15 s).
4. **Poll** — snapshot refresh every 10 s, guarded by a monotonic
   **connection generation**: stale async work (old endpoint, post-disconnect)
   exits before touching the store. Timers/streams are module-singletons,
   never duplicated across overlapping `connect()` calls.

## State rules (zustand, `src/store.ts`)

- Snapshot data never clobbers fresher SSE activity (`lastEventTs` guard).
- Tool executions counted once per tool **transition** (message parts repeat).
- File counts come from event `file`/`path` props, never text parsing.
- Unknown event shapes → `kind: "unknown"`, preserved in timeline, never throw.
- Agents with no verified parent render as **roots** — no invented edges.
- `ACTIVE AGENTS` = non-idle state OR session update within 5 min (labeled,
   derived honestly).
- Usage caption states the 20-session window (partial by design).

## Layout (`buildGraph`, pure + tested)

Roots in a compact grid; each parent's children ring around it with radius
scaled for ≥250 px arc spacing; deterministic de-collision pass
(~220×120 node footprint). `fitView` keeps it framed; user can zoom/pan.

## What is NOT shown

Hidden chain-of-thought (never exposed by the API), per-tokenizer internals,
anything not present in SDK responses.
