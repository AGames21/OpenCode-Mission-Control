/**
 * Pure derivation helpers for Mission Control telemetry.
 *
 * Everything here is intentionally free of I/O and React so it can be
 * unit-tested cheaply. All functions must be total: unknown or malformed
 * OpenCode payloads map to a safe fallback, never throw.
 */

export type AgentState =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'editing'
  | 'executing'
  | 'testing'
  | 'reviewing'
  | 'waiting'
  | 'success'
  | 'error';

export interface AgentInfo {
  /** Agent name as reported by OpenCode (e.g. "explorer", "oracle"). */
  id: string;
  /** Human role label. Unknown agents get a generic label. */
  role: string;
  model: string;
  variant: string;
  state: AgentState;
  /** Short high-level activity line, or null when idle/unknown. */
  activity: string | null;
  startedAt: number | null;
  parentId: string | null;
  childCount: number;
  sessionId: string | null;
  lastTool: string | null;
  lastFile: string | null;
  error: string | null;
  /** Real observed usage (sums over mapped sessions). Null when unobserved. */
  cost: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface TimelineEntry {
  id: string;
  ts: number;
  agent: string;
  kind: string;
  summary: string;
}

/** Known-agent role metadata. Unknown names fall back gracefully. */
const KNOWN_ROLES: Record<string, { role: string; glyph: string }> = {
  orchestrator: { role: 'Main / Orchestrator', glyph: '◉' },
  oracle: { role: 'Oracle / Architect', glyph: '⬢' },
  explorer: { role: 'Explorer', glyph: '◎' },
  librarian: { role: 'Librarian / Research', glyph: '▤' },
  designer: { role: 'Designer', glyph: '⬣' },
  fixer: { role: 'Fixer', glyph: '⬔' },
  observer: { role: 'Visual QA', glyph: '◌' },
  critic: { role: 'Critic', glyph: '⬕' },
  'emergency-oracle': { role: 'Emergency Oracle', glyph: '⬣' },
};

export function roleMeta(name: string): { role: string; glyph: string } {
  const key = (name || '').toLowerCase();
  return (
    KNOWN_ROLES[key] ?? {
      role: key ? `Agent · ${name}` : 'Unknown agent',
      glyph: '○',
    }
  );
}

/** Map a tool name to the agent state it implies. Returns null if unknown. */
export function stateForTool(tool: string | null | undefined): AgentState | null {
  if (!tool) return null;
  const t = tool.toLowerCase();
  if (t.includes('playwright') || t.includes('browser')) return 'testing';
  if (t === 'read' || t.startsWith('read') || t.includes('grep') || t.includes('glob') || t.includes('find')) return 'reading';
  if (t === 'edit' || t === 'write' || t.includes('edit')) return 'editing';
  if (t === 'bash' || t === 'shell' || t.includes('exec') || t.includes('task_') === false) {
    if (t === 'bash' || t.includes('shell') || t.includes('exec')) return 'executing';
  }
  if (t === 'task' || t.includes('subagent') || t.includes('delegate')) return 'thinking';
  if (t.includes('test') || t.includes('playwright')) return 'testing';
  if (t.includes('review') || t === 'critic') return 'reviewing';
  return null;
}

/**
 * Derive an agent state from observable session signals.
 * Only uses documented/observable inputs; never invents detail.
 */
export function deriveState(input: {
  sessionStatus?: string | null;
  lastTool?: string | null;
  hasError?: boolean;
  busy?: boolean | null;
}): AgentState {
  if (input.hasError) return 'error';
  const toolState = stateForTool(input.lastTool);
  if (toolState) return toolState;
  const s = (input.sessionStatus || '').toLowerCase();
  if (s.includes('busy') || s.includes('working') || s.includes('active')) {
    return input.busy === false ? 'idle' : 'thinking';
  }
  if (s.includes('idle') || s === '') return 'idle';
  if (s.includes('waiting') || s.includes('permission') || s.includes('ask')) return 'waiting';
  if (s.includes('done') || s.includes('complete') || s.includes('success')) return 'success';
  if (s.includes('fail') || s.includes('error')) return 'error';
  return 'thinking';
}

let timelineSeq = 0;

/**
 * Normalize one raw SSE event into a timeline entry.
 * Unknown event shapes are preserved as kind:"unknown" — never dropped,
 * never thrown.
 */
export function normalizeEvent(raw: unknown): TimelineEntry {
  const ts = Date.now();
  try {
    const r = raw as Record<string, unknown>;
    const envelope = (r?.['data'] ?? r) as Record<string, unknown>;
    const type =
      (typeof r?.['type'] === 'string' && (r['type'] as string)) ||
      (typeof envelope?.['type'] === 'string' && (envelope['type'] as string)) ||
      'unknown';
    const props = (envelope?.['properties'] ?? envelope) as Record<string, unknown>;
    const agent =
      (typeof props?.['agent'] === 'string' && (props['agent'] as string)) ||
      (typeof props?.['name'] === 'string' && (props['name'] as string)) ||
      (typeof envelope?.['sessionID'] === 'string' ? 'session' : 'opencode');
    const summary = summarizeEvent(type, props);
    timelineSeq += 1;
    return { id: `${ts}-${timelineSeq}`, ts, agent, kind: type, summary };
  } catch {
    timelineSeq += 1;
    return { id: `${ts}-${timelineSeq}`, ts, agent: 'opencode', kind: 'unknown', summary: 'Unrecognized event payload' };
  }
}

function summarizeEvent(type: string, props: Record<string, unknown>): string {
  const t = type.toLowerCase();
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = props?.[k];
      if (typeof v === 'string' && v) return v;
      if (typeof v === 'number') return String(v);
    }
    return null;
  };
  if (t.includes('session.created')) return `Session started${pick('sessionID') ? ` · ${shortId(pick('sessionID')!)}` : ''}`;
  if (t.includes('session.deleted')) return 'Session ended';
  if (t.includes('session.idle')) return 'Session idle';
  if (t.includes('session.status')) return `Status → ${pick('status') ?? 'updated'}`;
  if (t.includes('session.error')) return `Error: ${pick('error', 'message') ?? 'unknown error'}`;
  if (t.includes('message.updated') || t.includes('message.part')) {
    const tool = pick('tool');
    return tool ? `Tool: ${tool}` : 'Message updated';
  }
  if (t.includes('permission')) return `Permission required${pick('tool') ? `: ${pick('tool')}` : ''}`;
  if (t.includes('file.edited') || t.includes('fileedited')) return `Edited ${pick('file', 'path') ?? 'a file'}`;
  if (t.includes('filewatcher')) return 'Workspace files changed';
  if (t.includes('command.executed')) return `Command: ${pick('command') ?? 'executed'}`;
  if (t.includes('todo')) return 'Todo list updated';
  if (t.includes('pty')) return `Terminal ${t.includes('exited') ? 'exited' : 'activity'}`;
  if (t.includes('lsp')) return 'Language server update';
  if (t === 'unknown') return 'Unrecognized event payload';
  return humanize(type);
}

function humanize(type: string): string {
  return type
    .replace(/^event\.?/i, '')
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export interface GraphModel {
  nodes: Array<{
    id: string;
    label: string;
    state: AgentState;
    x: number;
    y: number;
  }>;
  edges: Array<{ id: string; source: string; target: string; active: boolean }>;
}

/**
 * Hierarchical layout: roots (agents with no verified parent) spread along
 * the top; each parent's children ring around it with radius scaled so
 * siblings never overlap (≥250px arc spacing). Pure + deterministic.
 */
export function buildGraph(agents: AgentInfo[]): GraphModel {
  const ids = new Set(agents.map((a) => a.id));
  const byId = new Map(agents.map((a) => [a.id, a]));
  const childrenOf = (pid: string) => agents.filter((b) => b.parentId === pid && ids.has(pid));
  const roots = agents.filter((a) => !a.parentId || !ids.has(a.parentId));
  const placed = new Map<string, { x: number; y: number }>();

  // Roots in a compact grid (keeps fitView zoom readable).
  const cols = Math.max(1, Math.ceil(Math.sqrt(roots.length)));
  roots.forEach((r, i) => {
    placed.set(r.id, { x: (i % cols) * 400 - ((cols - 1) * 400) / 2, y: Math.floor(i / cols) * 300 - 320 });
  });

  // Children ring around their verified parent.
  const queue = [...roots];
  const seen = new Set(roots.map((r) => r.id));
  while (queue.length > 0) {
    const parent = queue.shift()!;
    const pp = placed.get(parent.id) ?? { x: 0, y: 0 };
    const kids = childrenOf(parent.id).filter((k) => !seen.has(k.id));
    const radius = Math.max(300, (kids.length * 250) / (Math.PI * 2));
    kids.forEach((k, i) => {
      const angle = kids.length <= 1 ? Math.PI / 2 : (i / kids.length) * Math.PI * 2 + Math.PI / 2;
      placed.set(k.id, { x: pp.x + Math.cos(angle) * radius, y: pp.y + Math.sin(angle) * radius });
      seen.add(k.id);
      queue.push(k);
    });
  }
  // Safety net: anything unplaced (cycles) goes below.
  agents.forEach((a, i) => {
    if (!placed.has(a.id)) placed.set(a.id, { x: (i % 8) * 420 - 1400, y: 420 });
  });

  // Deterministic de-collision: node footprint ~220x120 + margin.
  const W = 250;
  const H = 150;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    const ids = agents.map((a) => a.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = placed.get(ids[i])!;
        const b = placed.get(ids[j])!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = W - Math.abs(dx);
        const oy = H - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          if (ox < oy) {
            const s = (dx >= 0 ? 1 : -1) * (ox / 2 + 1);
            a.x -= s;
            b.x += s;
          } else {
            const s = (dy >= 0 ? 1 : -1) * (oy / 2 + 1);
            a.y -= s;
            b.y += s;
          }
        }
      }
    }
    if (!moved) break;
  }

  const nodes = agents.map((a) => ({
    id: a.id,
    label: a.id,
    state: a.state,
    x: placed.get(a.id)!.x,
    y: placed.get(a.id)!.y,
  }));
  const edges = agents
    .filter((a) => a.parentId && ids.has(a.parentId) && byId.has(a.parentId as string))
    .map((a) => ({
      id: `${a.parentId}->${a.id}`,
      source: a.parentId as string,
      target: a.id,
      active: a.state !== 'idle' && a.state !== 'success',
    }));
  return { nodes, edges };
}

/** Cap + dedupe helper for the live timeline (newest last). */
export function pushTimeline(list: TimelineEntry[], entry: TimelineEntry, cap = 500): TimelineEntry[] {
  if (list.some((e) => e.id === entry.id)) return list;
  const next = [...list, entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/* ------------------------------------------------------------------ */
/* Session → agent graph derivation (real OpenCode session schema).    */
/* ------------------------------------------------------------------ */

export interface SessionModel {
  id: string;
  providerID: string;
  variant: string | null;
}

export interface SessionRecord {
  id: string;
  agent?: string | null;
  title?: string | null;
  parentID?: string | null;
  cost?: number | null;
  model?: SessionModel | null;
  tokens?: { input?: number; output?: number } | null;
  time?: { created?: number; updated?: number } | null;
  [k: string]: unknown;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Normalize one raw session object; returns null when it has no id. */
export function toSessionRecord(raw: unknown): SessionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = str(o['id']);
  if (!id) return null;
  const time = o['time'];
  const tokens = o['tokens'];
  const m = o['model'];
  const model =
    m && typeof m === 'object'
      ? {
          id: str((m as Record<string, unknown>)['id']) ?? 'unknown',
          providerID: str((m as Record<string, unknown>)['providerID']) ?? 'unknown',
          variant: str((m as Record<string, unknown>)['variant']),
        }
      : null;
  return {
    id,
    agent: str(o['agent']),
    title: str(o['title']),
    parentID: str(o['parentID']),
    cost: num(o['cost']),
    model,
    tokens:
      tokens && typeof tokens === 'object'
        ? { input: num((tokens as Record<string, unknown>)['input']) ?? undefined, output: num((tokens as Record<string, unknown>)['output']) ?? undefined }
        : null,
    time:
      time && typeof time === 'object'
        ? { created: num((time as Record<string, unknown>)['created']) ?? undefined, updated: num((time as Record<string, unknown>)['updated']) ?? undefined }
        : null,
  };
}

/** Try to infer the agent name for a child session (explicit field first). */
export function childAgentName(child: SessionRecord): string | null {
  if (child.agent) return child.agent;
  // Fall back to title conventions like "Explorer: ..." observed in the wild.
  const m = /^([A-Za-z][\w-]*)\s*:/.exec(child.title ?? '');
  return m ? m[1].toLowerCase() : null;
}

export interface DelegationModel {
  /** agent -> parent agent (only when both endpoints are known agents). */
  parents: Record<string, string>;
  /** agent -> number of child sessions observed. */
  childCounts: Record<string, number>;
  /** agent -> aggregated cost/tokens over mapped sessions. */
  usage: Record<string, { cost: number; in: number; out: number }>;
  /** agent -> most recent session record mapped to it. */
  latest: Record<string, SessionRecord>;
}

/**
 * Build parent/child/usage maps from sessions + their children.
 * Unknown child agent names are still counted under their literal name so
 * future/custom agents appear dynamically instead of being dropped.
 */
export function buildDelegation(
  sessions: SessionRecord[],
  childrenByParent: Record<string, SessionRecord[]>,
): DelegationModel {
  const parents: Record<string, string> = {};
  const childCounts: Record<string, number> = {};
  const usage: Record<string, { cost: number; in: number; out: number }> = {};
  const latest: Record<string, SessionRecord> = {};

  const credit = (agent: string | null, s: SessionRecord) => {
    if (!agent) return;
    childCounts[agent] = childCounts[agent] ?? 0;
    const u = (usage[agent] ??= { cost: 0, in: 0, out: 0 });
    if (typeof s.cost === 'number') u.cost += s.cost;
    if (typeof s.tokens?.input === 'number') u.in += s.tokens.input;
    if (typeof s.tokens?.output === 'number') u.out += s.tokens.output;
    const t = s.time?.updated ?? s.time?.created ?? 0;
    const prev = latest[agent] ? (latest[agent].time?.updated ?? latest[agent].time?.created ?? 0) : -1;
    if (t >= prev) latest[agent] = s;
  };

  const byId = new Map(sessions.map((s) => [s.id, s]));
  for (const s of sessions) {
    if (s.agent) credit(s.agent, s);
    const kids = childrenByParent[s.id] ?? [];
    for (const k of kids) {
      const name = childAgentName(k);
      if (!name) continue;
      childCounts[name] = (childCounts[name] ?? 0) + 1;
      credit(name, k);
      if (s.agent && name !== s.agent) parents[name] = s.agent;
    }
    void byId;
  }
  return { parents, childCounts, usage, latest };
}
