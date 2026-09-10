# Development

## Prerequisites

- Node 20+, npm
- OpenCode 1.18+ (`opencode --version`) with `opencode serve` support

## Run

```sh
opencode serve --port 4096      # terminal 1: local telemetry server
npm install
npm run dev                     # terminal 2: http://localhost:5199
```

Click **Connect** (or the detected endpoint). Expected live state against a
used OpenCode install: agent nodes, delegation edges, session counts, real
models/variants in the inspector.

## Checks

```sh
npm test          # vitest — telemetry parsing, delegation, layout, timeline
npm run typecheck # tsc --noEmit
npm run build     # production bundle to dist/
npm run lint      # oxlint
```

CI (`.github/workflows/ci.yml`) runs all of the above on push/PR.

## Conventions

- **Real data only.** Test fixtures may use fake events; production code must
  map unknown payloads to safe fallbacks, never invent values.
- Pure derivation lives in `src/lib/mapping.ts` with unit tests. I/O lives in
  `src/lib/opencode.ts` + `src/store.ts`.
- New OpenCode event types: extend `summarizeEvent()`; unknown kinds already
  render via `humanize()`.
- New agents need no code changes: known names get role labels/glyphs in
  `roleMeta()`; anything else appears as a generic node automatically.
- Keep the store generation-guard discipline: any new async loop must check
  the connection generation before `set()`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "OpenCode not reachable" | Start `opencode serve --port 4096`; check Windows Firewall loopback |
| `Connect` finds nothing | Probes 4096/4097/8080 only — set a custom endpoint in ⚙ Settings |
| Timeline empty but LIVE | Server genuinely idle — events appear only during real activity |
| Console 404/CORS noise on load | Endpoint probing in dev mode; harmless, Tauri build won't emit it |
| `0 / N active` | Correct when idle — actives derive from live events + 5-min recency |
