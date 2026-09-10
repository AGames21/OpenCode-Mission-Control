import { create } from 'zustand';
import {
  buildDelegation,
  deriveState,
  normalizeEvent,
  pushTimeline,
  roleMeta,
  sortSessionsNewest,
  toSessionRecord,
  type AgentInfo,
  type SessionRecord,
  type TimelineEntry,
} from './lib/mapping';
import {
  CANDIDATE_ENDPOINTS,
  DEFAULT_ENDPOINT,
  createClient,
  fetchSnapshot,
  probeEndpoint,
  subscribeEvents,
  type ConnStatus,
} from './lib/opencode';

const SETTINGS_KEY = 'mission-control-settings';

export interface Settings {
  endpoint: string;
  animations: boolean;
  autoReconnect: boolean;
  notifyOnError: boolean;
}

interface MissionState {
  conn: { status: ConnStatus; error: string | null; probing: string | null };
  agents: Record<string, AgentInfo>;
  timeline: TimelineEntry[];
  filter: { agent: string; kind: string; errorsOnly: boolean };
  selectedId: string | null;
  stats: { sessions: number; tools: number; files: number; errors: number; startedAt: number | null };
  settings: Settings;
  detected: string[];

  connect: (endpoint?: string) => Promise<void>;
  disconnect: () => void;
  detectEndpoints: () => Promise<void>;
  boot: () => Promise<void>;
  select: (id: string | null) => void;
  setFilter: (f: Partial<MissionState['filter']>) => void;
  saveSettings: (s: Partial<Settings>) => void;
}

let aborter: AbortController | null = null;
let poller: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sseStop: { stop: () => void } | null = null;
/** Monotonic connection generation: stale async work checks and exits. */
let generation = 0;
/** Endpoint of the live connection (for watchdog-triggered reconnects). */
let currentUrl: string | null = null;
/** True while a reconnect is already scheduled (avoids stacking). */
let reconnectPending = false;

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { endpoint: DEFAULT_ENDPOINT, animations: true, autoReconnect: true, notifyOnError: true, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { endpoint: DEFAULT_ENDPOINT, animations: true, autoReconnect: true, notifyOnError: true };
}

function sessionIdOf(v: unknown): string | null {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['sessionID', 'sessionId', 'id']) {
      if (typeof o[k] === 'string') return o[k] as string;
    }
  }
  return null;
}

export const useMission = create<MissionState>((set, get) => {
  /** Shared reconnect path: SSE errors AND snapshot watchdog converge here. */
  const scheduleReconnect = (url: string) => {
    if (reconnectPending) return;
    reconnectPending = true;
    set({ conn: { status: 'reconnecting', error: null, probing: null } });
    if (get().settings.autoReconnect) {
      reconnectTimer = setTimeout(() => {
        reconnectPending = false;
        void get().connect(url);
      }, 3000);
    } else {
      reconnectPending = false;
      set({ conn: { status: 'error', error: 'Event stream disconnected.', probing: null } });
    }
  };

  const applySnapshot = async (endpoint: string, myGen: number) => {
    const client = createClient(endpoint);
    const snap = await fetchSnapshot(client);
    if (generation !== myGen) return; // superseded by reconnect/disconnect
    if (!snap) {
      // Snapshot layer itself failed: treat as dead server (SSE does not
      // reliably error on some dead sockets — verified live).
      if (get().conn.status === 'live' && currentUrl === endpoint) scheduleReconnect(endpoint);
      return;
    }
    const records = sortSessionsNewest(
      snap.sessions.map(toSessionRecord).filter((s): s is SessionRecord => s !== null),
    );
    // Bound fan-out: children for the 20 most recent sessions only.
    const recent = records.slice(0, 20);
    const kids = await Promise.all(
      recent.map(async (s) => {
        try {
          const r = await client.session.children({ path: { id: s.id } });
          const data = (r as { data?: unknown })?.data;
          const list = Array.isArray(data)
            ? data.map(toSessionRecord).filter((k): k is SessionRecord => k !== null)
            : [];
          return [s.id, list] as const;
        } catch {
          return [s.id, []] as const;
        }
      }),
    );
    const childrenByParent: Record<string, SessionRecord[]> = Object.fromEntries(kids);
    if (generation !== myGen) return; // superseded while fetching
    const delegation = buildDelegation(records, childrenByParent);
    set((st) => {
      const agents: Record<string, AgentInfo> = { ...st.agents };
      const ensure = (name: string): AgentInfo => {
        const prev = agents[name];
        if (prev) return prev;
        const fromApi = snap.agents.find((a) => a.name === name);
        const fresh: AgentInfo = {
          id: name,
          role: roleMeta(name).role,
          model: (typeof fromApi?.model === 'string' && fromApi.model) || snap.configModel || 'unavailable',
          variant: (typeof fromApi?.variant === 'string' && fromApi.variant) || '—',
          state: 'idle',
          activity: null,
          startedAt: null,
          parentId: delegation.parents[name] ?? null,
          childCount: 0,
          sessionId: null,
          lastTool: null,
          lastFile: null,
          error: null,
          cost: null,
          tokensIn: null,
          tokensOut: null,
          lastSeen: null,
          lastEventTs: 0,
        };
        agents[name] = fresh;
        return fresh;
      };
      for (const a of snap.agents) {
        const prev = ensure(a.name);
        agents[a.name] = {
          ...prev,
          model: (typeof a.model === 'string' && a.model) || prev.model,
          variant: (typeof a.variant === 'string' && a.variant) || prev.variant,
          parentId: delegation.parents[a.name] ?? prev.parentId,
        };
      }
      for (const [name, u] of Object.entries(delegation.usage)) {
        const prev = ensure(name);
        agents[name] = { ...prev, cost: u.cost, tokensIn: u.in, tokensOut: u.out };
      }
      for (const [name, count] of Object.entries(delegation.childCounts)) {
        const prev = ensure(name);
        if (delegation.parents[name] && prev.parentId !== delegation.parents[name]) {
          agents[name] = { ...prev, childCount: count, parentId: delegation.parents[name] };
        } else {
          agents[name] = { ...prev, childCount: count };
        }
      }
      for (const [name, s] of Object.entries(delegation.latest)) {
        const prev = ensure(name);
        const sessionModel = s.model ? `${s.model.providerID}/${s.model.id}` : null;
        const sessionTs = s.time?.updated ?? s.time?.created ?? 0;
        // Never let a slower snapshot clobber fresher live-event activity.
        const activity = prev.lastEventTs > sessionTs ? prev.activity : (s.title ?? prev.activity);
        agents[name] = {
          ...prev,
          activity,
          sessionId: s.id,
          startedAt: s.time?.created ? s.time.created : prev.startedAt,
          lastSeen: Math.max(prev.lastSeen ?? 0, sessionTs) || null,
          // Prefer the real per-session model over the server default.
          model: sessionModel ?? prev.model,
          variant: s.model?.variant ?? prev.variant,
        };
      }
      return {
        agents,
        stats: { ...st.stats, sessions: records.length, startedAt: st.stats.startedAt ?? Date.now() },
      };
    });
  };

  const cleanup = () => {
    aborter?.abort();
    aborter = null;
    sseStop?.stop();
    sseStop = null;
    if (poller) clearInterval(poller);
    poller = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  return {
    conn: { status: 'disconnected', error: null, probing: null },
    agents: {},
    timeline: [],
    filter: { agent: 'all', kind: 'all', errorsOnly: false },
    selectedId: null,
    stats: { sessions: 0, tools: 0, files: 0, errors: 0, startedAt: null },
    settings: loadSettings(),
    detected: [],

    select: (id) => set({ selectedId: id }),
    setFilter: (f) => set((st) => ({ filter: { ...st.filter, ...f } })),
    saveSettings: (s) => {
      const next = { ...get().settings, ...s };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      set({ settings: next });
    },

    detectEndpoints: async () => {
      const found: string[] = [];
      for (const url of CANDIDATE_ENDPOINTS) {
        set((st) => ({ conn: { ...st.conn, probing: url } }));
        if (await probeEndpoint(url)) found.push(url);
      }
      set((st) => ({ detected: found, conn: { ...st.conn, probing: null } }));
    },

    /** First-load boot: silently connect to the saved endpoint if alive,
        otherwise fall back to full detection (shows the wizard). */
    boot: async () => {
      if (get().conn.status !== 'disconnected') return;
      if (await probeEndpoint(get().settings.endpoint)) {
        await get().connect(get().settings.endpoint);
      } else {
        await get().detectEndpoints();
      }
    },

    disconnect: () => {
      generation += 1;
      currentUrl = null;
      reconnectPending = false;
      cleanup();
      set({ conn: { status: 'disconnected', error: null, probing: null } });
    },

    connect: async (endpoint) => {
      cleanup();
      generation += 1;
      const myGeneration = generation;
      const url = endpoint ?? get().settings.endpoint;
      set({ conn: { status: 'connecting', error: null, probing: null } });
      const ok = await probeEndpoint(url);
      if (generation !== myGeneration) return; // superseded
      if (!ok) {
        const fail = async (attempt: number) => {
          if (generation !== myGeneration) return;
          if (!get().settings.autoReconnect || attempt > 5) {
            set({ conn: { status: 'error', error: `OpenCode not reachable at ${url}. Start it with: opencode serve --port 4096`, probing: null } });
            return;
          }
          set({ conn: { status: 'reconnecting', error: null, probing: null } });
          reconnectTimer = setTimeout(async () => {
            if (generation !== myGeneration) return;
            if (await probeEndpoint(url)) await get().connect(url);
            else await fail(attempt + 1);
          }, Math.min(2000 * 2 ** attempt, 15000));
        };
        await fail(0);
        return;
      }

      aborter = new AbortController();
      const signal = aborter.signal;
      const client = createClient(url);

      sseStop = subscribeEvents(
        client,
        {
          onEvent: (raw) => {
            const entry = normalizeEvent(raw);
            set((st) => {
              let { agents, stats } = st;
              const k = entry.kind.toLowerCase();
              const props = (raw as { data?: unknown })?.data ?? raw;
              const sid = sessionIdOf(props);
              const isNamedAgent = entry.agent !== 'opencode' && entry.agent !== 'session';
              // Count a tool execution once per tool transition: message parts
              // repeat the same tool many times per single invocation.
              const prevTool = isNamedAgent ? (agents[entry.agent]?.lastTool ?? null) : null;
              const toolCounted = entry.tool !== null && entry.tool !== prevTool;
              if (isNamedAgent) {
                const prev = agents[entry.agent];
                const base: AgentInfo = prev ?? {
                  id: entry.agent, role: roleMeta(entry.agent).role, model: 'unavailable',
                  variant: '—', state: 'idle', activity: null, startedAt: Date.now(),
                  parentId: null, childCount: 0, sessionId: null,
                  lastTool: null, lastFile: null, error: null,
                  cost: null, tokensIn: null, tokensOut: null,
                  lastSeen: null, lastEventTs: 0,
                };
                agents = {
                  ...agents,
                  [entry.agent]: {
                    ...base,
                    state: deriveState({ sessionStatus: k, lastTool: entry.tool ?? base.lastTool, hasError: entry.isError }),
                    activity: entry.summary,
                    startedAt: base.startedAt ?? entry.ts,
                    lastTool: entry.tool ?? base.lastTool,
                    lastFile: entry.file ?? base.lastFile,
                    sessionId: sid ?? base.sessionId,
                    error: entry.isError ? entry.summary : null,
                    lastSeen: entry.ts,
                    lastEventTs: entry.ts,
                  },
                };
              }
              return {
                agents,
                timeline: pushTimeline(st.timeline, entry),
                stats: {
                  ...st.stats,
                  tools: toolCounted ? stats.tools + 1 : stats.tools,
                  files: entry.file ? stats.files + 1 : stats.files,
                  errors: entry.isError ? stats.errors + 1 : stats.errors,
                },
              };
            });
          },
          onError: () => {
            scheduleReconnect(url);
          },
        },
        signal,
      );

      set({ conn: { status: 'live', error: null, probing: null } });
      currentUrl = url;
      reconnectPending = false;
      await applySnapshot(url, myGeneration);
      poller = setInterval(() => {
        if (generation === myGeneration) void applySnapshot(url, myGeneration);
      }, 10000);
    },
  };
});
