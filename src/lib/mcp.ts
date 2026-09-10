/**
 * Real MCP server management over the official SDK.
 * mcp.add persists to the OpenCode server instance; nothing is simulated.
 */
import type { OpencodeClient } from '@opencode-ai/sdk/client';

export interface McpEntry {
  name: string;
  status: string;
  detail?: string | null;
}

function statusText(s: unknown): { status: string; detail?: string | null } {
  if (!s || typeof s !== 'object') return { status: 'unknown' };
  const o = s as Record<string, unknown>;
  const status = typeof o['status'] === 'string' ? (o['status'] as string) : 'unknown';
  const err = o['error'];
  return { status, detail: typeof err === 'string' ? err : null };
}

export async function fetchMcp(client: OpencodeClient): Promise<McpEntry[]> {
  const res = (await client.mcp.status().catch(() => null)) as { data?: unknown } | null;
  const data = res?.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).map(([name, s]) => ({ name, ...statusText(s) }));
}

export async function addLocalMcp(
  client: OpencodeClient,
  name: string,
  command: string[],
): Promise<string | null> {
  const res = (await client.mcp
    .add({ body: { name, config: { type: 'local', command, enabled: true } } })
    .catch(() => null)) as { error?: unknown } | null;
  if (!res) return 'No response from server.';
  if ((res as { error?: unknown }).error) return 'Server rejected the MCP config.';
  return null;
}

export async function addRemoteMcp(client: OpencodeClient, name: string, url: string): Promise<string | null> {
  const res = (await client.mcp
    .add({ body: { name, config: { type: 'remote', url, enabled: true } } })
    .catch(() => null)) as { error?: unknown } | null;
  if (!res) return 'No response from server.';
  if ((res as { error?: unknown }).error) return 'Server rejected the MCP config.';
  return null;
}

export async function setMcpConnected(client: OpencodeClient, name: string, connect: boolean): Promise<void> {
  if (connect) await client.mcp.connect({ path: { name } }).catch(() => null);
  else await client.mcp.disconnect({ path: { name } }).catch(() => null);
}

export async function fetchToolIds(client: OpencodeClient): Promise<string[]> {
  const res = (await client.tool.ids().catch(() => null)) as { data?: unknown } | null;
  return Array.isArray(res?.data) ? (res.data as string[]) : [];
}

/** Convenience presets — fill the form; the install call is a real mcp.add. */
export const MCP_PRESETS: Array<{ name: string; command: string; hint: string }> = [
  { name: 'playwright', command: 'npx -y @playwright/mcp@latest', hint: 'Browser automation for QA' },
  { name: 'filesystem', command: 'npx -y @modelcontextprotocol/server-filesystem C:\\', hint: 'Scoped file access' },
  { name: 'fetch', command: 'npx -y @modelcontextprotocol/server-fetch', hint: 'Web fetching' },
  { name: 'github', command: 'npx -y @modelcontextprotocol/server-github', hint: 'GitHub API (needs token env)' },
  { name: 'memory', command: 'npx -y @modelcontextprotocol/server-memory', hint: 'Persistent memory' },
];
