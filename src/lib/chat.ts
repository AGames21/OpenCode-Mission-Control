/**
 * Real OpenCode chat: sessions, models, prompts — all official SDK routes.
 * Nothing here simulates a reply; every message comes from the server.
 */
import type { OpencodeClient } from '@opencode-ai/sdk/client';

export interface ChatModel {
  id: string; // "providerID/modelID"
  providerID: string;
  modelID: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: string[];
  agent?: string | null;
  modelID?: string | null;
  time: number;
}

let modelsCache: ChatModel[] | null = null;

function provId(prov: Record<string, unknown>): string {
  const id = prov['id'];
  return typeof id === 'string' && id ? id : 'unknown';
}

/** All models the server knows. Cached per connection. */
export async function fetchModels(client: OpencodeClient): Promise<ChatModel[]> {
  if (modelsCache) return modelsCache;
  const res = (await client.provider.list().catch(() => null)) as { data?: unknown } | null;
  const data = res?.data as { all?: Array<Record<string, unknown>> } | undefined;
  const out: ChatModel[] = [];
  const seen = new Set<string>();
  for (const prov of data?.all ?? []) {
    const pid = provId(prov);
    const models = prov['models'] as Record<string, { name?: string }> | undefined;
    for (const [key, m] of Object.entries(models ?? {})) {
      // Routable id: the provider's own id + its raw model key.
      // (Model keys alone are ambiguous across 214 providers.)
      const id = `${pid}/${key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, providerID: pid, modelID: key, name: m?.name ?? key });
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  modelsCache = out;
  return out;
}

export function clearModelsCache() {
  modelsCache = null;
}

/** Team models first (the ones actually configured), then everything else. */
export function rankModels(models: ChatModel[], teamModelIds: string[]): ChatModel[] {
  const team = new Set(teamModelIds);
  return [...models].sort((a, b) => Number(team.has(b.id)) - Number(team.has(a.id)));
}

export async function createSession(client: OpencodeClient, title: string): Promise<string | null> {
  const res = (await client.session.create({ body: { title } }).catch(() => null)) as {
    data?: { id?: string };
  } | null;
  return res?.data?.id ?? null;
}

export async function sendPrompt(
  client: OpencodeClient,
  sessionId: string,
  text: string,
  model: ChatModel,
  agent?: string,
): Promise<boolean> {
  const res = (await client.session
    .prompt({
      path: { id: sessionId },
      body: {
        model: { providerID: model.providerID, modelID: model.modelID },
        ...(agent ? { agent } : {}),
        parts: [{ type: 'text', text } as never],
      },
    })
    .catch(() => null)) as { error?: unknown } | null;
  return !!res && !('error' in (res as object) && (res as { error?: unknown }).error);
}

export async function abortSession(client: OpencodeClient, sessionId: string): Promise<void> {
  await client.session.abort({ path: { id: sessionId } }).catch(() => null);
}

function partText(p: Record<string, unknown>): string | null {
  if (typeof p['text'] === 'string' && p['text']) return p['text'] as string;
  return null;
}

function partTool(p: Record<string, unknown>): string | null {
  const t = p['tool'];
  if (typeof t === 'string' && t) return t;
  const call = p['call'] as Record<string, unknown> | undefined;
  if (call && typeof call['tool'] === 'string') return call['tool'] as string;
  return null;
}

/** Flatten one server message into renderable chat content. Pure. */
export function toChatMessage(info: Record<string, unknown>, parts: unknown[]): ChatMessage | null {
  const id = typeof info['id'] === 'string' ? (info['id'] as string) : null;
  const role = info['role'] === 'assistant' ? 'assistant' : info['role'] === 'user' ? 'user' : null;
  if (!id || !role) return null;
  const texts: string[] = [];
  const tools: string[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as Record<string, unknown>;
    const t = partText(p);
    if (t) texts.push(t);
    const tool = partTool(p);
    if (tool) tools.push(tool);
  }
  const timeRaw = (info['time'] as Record<string, unknown> | undefined)?.['created'];
  return {
    id,
    role,
    text: texts.join('\n\n'),
    tools,
    agent: typeof info['agent'] === 'string' ? (info['agent'] as string) : null,
    modelID: typeof info['modelID'] === 'string' ? (info['modelID'] as string) : null,
    time: typeof timeRaw === 'number' ? timeRaw : Date.now(),
  };
}

export async function fetchMessages(client: OpencodeClient, sessionId: string): Promise<ChatMessage[]> {
  const res = (await client.session.messages({ path: { id: sessionId } }).catch(() => null)) as {
    data?: Array<{ info: unknown; parts: unknown[] }>;
  } | null;
  if (!Array.isArray(res?.data)) return [];
  return res.data
    .map((m) => toChatMessage(m.info as Record<string, unknown>, m.parts ?? []))
    .filter((m): m is ChatMessage => m !== null);
}
