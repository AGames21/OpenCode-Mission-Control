/**
 * Official OpenCode SDK integration.
 *
 * Transport: HTTP(S) to a local `opencode serve` instance
 * (default http://127.0.0.1:4096). The desktop shell spawns/manages the
 * server as a sidecar; the web dev fallback expects the user to run
 * `opencode serve --port 4096` manually. No scraping, no private APIs.
 */
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/client';

export type ConnStatus = 'disconnected' | 'connecting' | 'live' | 'reconnecting' | 'error';

export const DEFAULT_ENDPOINT = 'http://127.0.0.1:4096';

/** Candidate endpoints probed by the setup wizard (local only). */
export const CANDIDATE_ENDPOINTS = [
  DEFAULT_ENDPOINT,
  'http://127.0.0.1:4097',
  'http://127.0.0.1:8080',
];

export function createClient(baseUrl: string): OpencodeClient {
  return createOpencodeClient({ baseUrl });
}

export interface Snapshot {
  agents: Array<{ name: string; model?: string | null; variant?: string | null; mode?: string | null }>;
  sessions: Array<Record<string, unknown>>;
  configModel: string | null;
  todo: Record<string, unknown> | null;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** Best-effort snapshot; every section degrades independently. */
export async function fetchSnapshot(client: OpencodeClient): Promise<Snapshot> {
  const [agentsRes, sessionsRes, configRes] = await Promise.all([
    safe(() => client.app.agents()),
    safe(() => client.session.list()),
    safe(() => client.config.get()),
  ]);

  const agents = (agentsRes as { data?: unknown } | null)?.data;
  const sessions = (sessionsRes as { data?: unknown } | null)?.data;
  const config = (configRes as { data?: unknown } | null)?.data as { model?: string } | undefined;

  return {
    agents: Array.isArray(agents) ? (agents as Snapshot['agents']) : [],
    sessions: Array.isArray(sessions) ? (sessions as Snapshot['sessions']) : [],
    configModel: typeof config?.model === 'string' ? config.model : null,
    todo: null,
  };
}

export interface EventHandlers {
  onEvent: (raw: unknown) => void;
  onError: (err: unknown) => void;
}

/**
 * Subscribe to the global SSE event stream.
 * The SDK delivers events via callback (verified against 1.18.30 types).
 */
export function subscribeEvents(
  client: OpencodeClient,
  handlers: EventHandlers,
  signal: AbortSignal,
): { stop: () => void } {
  let stopped = false;
  // The generated client returns a promise resolving to the SSE stream handle.
  const p = (client.global as unknown as { event: (o: unknown) => Promise<unknown> }).event({
    signal,
    onSseEvent: (ev: unknown) => {
      if (!stopped) handlers.onEvent(ev);
    },
    onSseError: (err: unknown) => {
      if (!stopped) handlers.onError(err);
    },
  });
  // Attach a rejection handler so a refused connection surfaces as onError
  // instead of an unhandled rejection.
  p.then(
    () => undefined,
    (err: unknown) => {
      if (!stopped) handlers.onError(err);
    },
  );
  return {
    stop: () => {
      stopped = true;
    },
  };
}

/** Probe whether an endpoint answers like an OpenCode server. */
export async function probeEndpoint(baseUrl: string, timeoutMs = 2500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const client = createClient(baseUrl);
    const res = await safe(() => client.config.get());
    return res !== null;
  } finally {
    clearTimeout(t);
  }
}
