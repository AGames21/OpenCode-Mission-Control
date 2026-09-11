/**
 * Model chains: run one input through an ordered list of agents, each step
 * a REAL session prompt. Every step burns real quota — runs are explicit.
 */
import type { OpencodeClient } from '@opencode-ai/sdk/client';
import { createSession, fetchMessages, sendPrompt, type ChatModel } from './chat';

export interface ChainStep {
  agent: string;
  modelId: string;
  output: string | null;
  error: string | null;
}

export interface ChainRun {
  sessionId: string;
  steps: ChainStep[];
}

const CHAIN_KEY = 'mission-control-chains-v1';

export function loadChains(): Array<{ name: string; steps: Array<{ agent: string; modelId: string }> }> {
  try {
    const raw = localStorage.getItem(CHAIN_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

export function saveChains(chains: Array<{ name: string; steps: Array<{ agent: string; modelId: string }> }>) {
  try {
    localStorage.setItem(CHAIN_KEY, JSON.stringify(chains));
  } catch {
    /* ignore */
  }
}

export async function runChain(
  client: OpencodeClient,
  steps: Array<{ agent: string; model: ChatModel }>,
  input: string,
  onStep: (index: number, output: string | null, error: string | null) => void,
): Promise<string | null> {
  const sessionId = await createSession(client, `Chain: ${steps.map((s) => s.agent).join(' → ').slice(0, 50)}`);
  if (!sessionId) {
    onStep(0, null, 'Could not create session.');
    return null;
  }
  let current = input;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const prompt =
      i === 0
        ? current
        : `Previous agent (${steps[i - 1].agent}) produced:\n\n${current}\n\nContinue the task from here.`;
    const ok = await sendPrompt(client, sessionId, prompt, s.model, s.agent);
    if (!ok) {
      onStep(i, null, `Prompt rejected for ${s.agent}.`);
      return null;
    }
    // Poll for the reply (prompt() resolves after completion; refresh anyway).
    let text: string | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const msgs = await fetchMessages(client, sessionId);
      const last = [...msgs].reverse().find((m) => m.role === 'assistant' && m.text);
      if (last?.text) {
        text = last.text;
        break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!text) {
      onStep(i, null, `No reply from ${s.agent} within 60s.`);
      return null;
    }
    current = text;
    onStep(i, text, null);
  }
  return current;
}
