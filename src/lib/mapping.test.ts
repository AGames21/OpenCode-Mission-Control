import { describe, expect, it } from 'vitest';
import {
  buildDelegation,
  buildGraph,
  childAgentName,
  deriveState,
  normalizeEvent,
  pushTimeline,
  roleMeta,
  stateForTool,
  toSessionRecord,
  type AgentInfo,
  type TimelineEntry,
} from './mapping';

describe('stateForTool', () => {
  it('maps observable tools to states', () => {
    expect(stateForTool('read')).toBe('reading');
    expect(stateForTool('grep')).toBe('reading');
    expect(stateForTool('edit')).toBe('editing');
    expect(stateForTool('bash')).toBe('executing');
    expect(stateForTool('task')).toBe('thinking');
  });

  it('returns null for unknown tools instead of guessing', () => {
    expect(stateForTool('some-future-tool')).toBeNull();
    expect(stateForTool(null)).toBeNull();
  });
});

describe('deriveState', () => {
  it('prefers error signal', () => {
    expect(deriveState({ hasError: true, lastTool: 'read' })).toBe('error');
  });

  it('falls back to idle when nothing is observable', () => {
    expect(deriveState({})).toBe('idle');
  });

  it('maps waiting/permission status', () => {
    expect(deriveState({ sessionStatus: 'waiting_for_permission' })).toBe('waiting');
  });
});

describe('normalizeEvent', () => {
  it('normalizes a session event', () => {
    const e = normalizeEvent({ type: 'session.created', properties: { sessionID: 'abc123' } });
    expect(e.kind).toBe('session.created');
    expect(e.summary).toMatch(/Session started/);
  });

  it('never throws on malformed payloads', () => {
    expect(() => normalizeEvent(null)).not.toThrow();
    expect(() => normalizeEvent({ weird: [1, 2, { x: 1 }] })).not.toThrow();
    const e = normalizeEvent(null);
    expect(e.kind).toBe('unknown');
  });

  it('keeps future event types visible instead of dropping them', () => {
    const e = normalizeEvent({ type: 'quantum.teleport', properties: {} });
    expect(e.kind).toBe('quantum.teleport');
    expect(e.summary.length).toBeGreaterThan(0);
  });
});

describe('roleMeta', () => {
  it('labels known agents', () => {
    expect(roleMeta('oracle').role).toMatch(/Oracle/);
  });

  it('falls back gracefully for unknown agents', () => {
    const m = roleMeta('my-custom-agent');
    expect(m.role).toMatch(/my-custom-agent/);
    expect(m.glyph).toBeTruthy();
  });
});

describe('buildGraph', () => {
  const base = { role: 'R', model: 'm', variant: '', activity: null, startedAt: null, sessionId: null, lastTool: null, lastFile: null, error: null, cost: null, tokensIn: null, tokensOut: null };
  const agents: AgentInfo[] = [
    { ...base, id: 'orchestrator', state: 'thinking', parentId: null, childCount: 2 },
    { ...base, id: 'explorer', state: 'reading', parentId: 'orchestrator', childCount: 0, lastTool: 'grep' },
    { ...base, id: 'critic', state: 'idle', parentId: 'orchestrator', childCount: 0 },
  ];

  it('maps parent/child delegation to edges', () => {
    const g = buildGraph(agents);
    expect(g.nodes).toHaveLength(3);
    expect(g.edges.map((e) => e.id).sort()).toEqual(['orchestrator->critic', 'orchestrator->explorer']);
  });

  it('marks only non-idle edges active', () => {
    const g = buildGraph(agents);
    expect(g.edges.find((e) => e.target === 'explorer')?.active).toBe(true);
    expect(g.edges.find((e) => e.target === 'critic')?.active).toBe(false);
  });

  it('ignores dangling parents', () => {
    const g = buildGraph([
      { ...agents[1], parentId: 'ghost' },
    ]);
    expect(g.edges).toHaveLength(0);
  });

  it('resolves root-vs-ring collisions', () => {
    const many: AgentInfo[] = [
      { ...agents[0] },
      ...Array.from({ length: 8 }, (_, i) => ({ ...agents[1], id: `kid-${i}` })),
      ...Array.from({ length: 8 }, (_, i) => ({ ...agents[2], id: `root-${i}`, parentId: null })),
    ];
    const g = buildGraph(many);
    const boxes = g.nodes.map((n) => ({ ...n, x0: n.x - 125, x1: n.x + 125, y0: n.y - 75, y1: n.y + 75 }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(overlap, `${a.id} vs ${b.id} overlap`).toBe(false);
      }
    }
  });

  it('spaces many siblings so nodes do not overlap', () => {
    const many: AgentInfo[] = [
      { ...agents[0] },
      ...Array.from({ length: 24 }, (_, i) => ({ ...agents[1], id: `agent-${i}` })),
    ];
    const g = buildGraph(many);
    const pts = g.nodes.filter((n) => n.id !== 'orchestrator');
    let min = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < min) min = d;
      }
    }
    expect(min).toBeGreaterThan(200);
  });
});

describe('session derivation', () => {
  it('rejects records without id instead of fabricating one', () => {
    expect(toSessionRecord(null)).toBeNull();
    expect(toSessionRecord({ agent: 'explorer' })).toBeNull();
  });

  it('normalizes a real child payload', () => {
    const s = toSessionRecord({
      id: 'ses_abc', parentID: 'ses_parent', title: 'Explorer: telemetry work',
      cost: 0.026, tokens: { input: 75957, output: 10412 },
      model: { id: 'deepseek-v4-flash', providerID: 'opencode-go', variant: 'high' },
      time: { created: 1000, updated: 2000 },
    });
    expect(s?.parentID).toBe('ses_parent');
    expect(s?.cost).toBeCloseTo(0.026);
    expect(s?.model?.id).toBe('deepseek-v4-flash');
    expect(s?.model?.variant).toBe('high');
    expect(childAgentName(s!)).toBe('explorer');
  });

  it('builds delegation with usage aggregation', () => {
    const parent = toSessionRecord({ id: 'p', agent: 'orchestrator', title: 'Main task' })!;
    const kid = toSessionRecord({
      id: 'k', parentID: 'p', title: 'Explorer: research',
      cost: 0.02, tokens: { input: 100, output: 10 }, time: { updated: 5 },
    })!;
    const d = buildDelegation([parent], { p: [kid] });
    expect(d.parents['explorer']).toBe('orchestrator');
    expect(d.childCounts['explorer']).toBe(1);
    expect(d.usage['explorer'].cost).toBeCloseTo(0.02);
    expect(d.usage['explorer'].in).toBe(100);
    expect(d.latest['explorer'].id).toBe('k');
  });

  it('keeps unknown child agents instead of dropping them', () => {
    const parent = toSessionRecord({ id: 'p', agent: 'orchestrator' })!;
    const kid = toSessionRecord({ id: 'k', parentID: 'p', agent: 'my-custom-agent' })!;
    const d = buildDelegation([parent], { p: [kid] });
    expect(d.parents['my-custom-agent']).toBe('orchestrator');
  });
});

describe('pushTimeline', () => {
  const mk = (id: string): TimelineEntry => ({ id, ts: 1, agent: 'a', kind: 'k', summary: 's' });

  it('dedupes by id and caps length', () => {
    let list: TimelineEntry[] = [];
    for (let i = 0; i < 10; i++) list = pushTimeline(list, mk(`e${i}`), 5);
    expect(list).toHaveLength(5);
    expect(list[0].id).toBe('e5');
    const same = pushTimeline(list, mk('e9'), 5);
    expect(same).toBe(list);
  });
});
