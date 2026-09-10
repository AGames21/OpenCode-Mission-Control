import { describe, expect, it } from 'vitest';
import { rankModels, toChatMessage, type ChatModel } from './chat';

describe('toChatMessage', () => {
  it('flattens text parts and surfaces tool calls', () => {
    const m = toChatMessage(
      { id: 'm1', role: 'assistant', agent: 'explorer', modelID: 'x', time: { created: 5 } },
      [{ type: 'text', text: 'hello' }, { type: 'tool', tool: 'bash' }, { type: 'text', text: 'world' }],
    );
    expect(m?.text).toBe('hello\n\nworld');
    expect(m?.tools).toEqual(['bash']);
    expect(m?.agent).toBe('explorer');
  });

  it('rejects messages without id or with unknown roles', () => {
    expect(toChatMessage({ role: 'assistant' }, [])).toBeNull();
    expect(toChatMessage({ id: 'x', role: 'system' }, [])).toBeNull();
  });

  it('never throws on malformed parts', () => {
    expect(() => toChatMessage({ id: 'x', role: 'user' }, [null, 42, { nested: {} }])).not.toThrow();
  });
});

describe('rankModels', () => {
  const mk = (id: string): ChatModel => ({ id, providerID: 'p', modelID: id, name: id });
  it('puts configured team models first', () => {
    const ranked = rankModels([mk('a'), mk('b'), mk('c')], ['c']);
    expect(ranked[0].id).toBe('c');
  });
});
