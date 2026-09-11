import { useEffect, useMemo, useState } from 'react';
import type { OpencodeClient } from '@opencode-ai/sdk/client';
import { roleMeta } from '../lib/mapping';
import { createClient } from '../lib/opencode';
import type { ChatModel } from '../lib/chat';
import { loadChains, runChain, saveChains } from '../lib/chains';
import { isDesktop, loadSlim, presetAgents, saveSlim, type PresetState } from '../lib/presets';
import { useMission } from '../store';

function Presets({ allRoster }: { allRoster: string[] }) {
  const desktop = isDesktop();
  const [state, setState] = useState<PresetState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState('');
  const [enabled, setEnabled] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    loadSlim()
      .then((s) => {
        setState(s);
        setPreset(s.config.preset ?? s.presetNames[0] ?? '');
        const disabled = new Set(s.config.disabled_agents ?? []);
        setEnabled(s.allAgents.filter((a) => !disabled.has(a)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not read slim config.'));
  }, [desktop]);

  if (!desktop) {
    return (
      <div className="team-presets">
        <div className="panel-title">PRESETS</div>
        <PresetCards
          onPick={() => setError('Preset switching needs the desktop app (safe file access). Download it from Releases.')}
        />
        {error && <p className="err-text">{error}</p>}
      </div>
    );
  }

  const applyShape = async (kind: 'game' | 'general' | 'everything') => {
    if (!state) return;
    const names = presetAgents(kind, state.allAgents.length > 0 ? state.allAgents : allRoster);
    setEnabled(names);
  };

  const apply = async () => {
    if (!state) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const disabled = state.allAgents.filter((a) => !enabled.includes(a));
      const next = { ...state.config, preset, disabled_agents: disabled };
      const backup = await saveSlim(state, next);
      setState({ ...state, config: next });
      setSaved(`Applied. Backup: ${backup}. New sessions pick it up.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Write failed — config untouched.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (a: string) =>
    setEnabled((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  return (
    <div className="team-presets">
      <div className="panel-title">PRESETS · {state ? <span className="mono">{state.path}</span> : 'LOADING…'}</div>
      <PresetCards onPick={(k) => void applyShape(k)} />
      {state && (
        <>
          <div className="chat-controls">
            <label>Preset
              <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                {state.presetNames.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="agent-checks">
            {state.allAgents.map((a) => (
              <label key={a} className="check">
                <input type="checkbox" checked={enabled.includes(a)} onChange={() => toggle(a)} />
                {a}
              </label>
            ))}
          </div>
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => void apply()}>
              {busy ? 'Applying…' : 'Apply (auto-backup)'}
            </button>
          </div>
        </>
      )}
      {saved && <p className="muted">{saved}</p>}
      {error && <p className="err-text">{error}</p>}
    </div>
  );
}

function PresetCards({ onPick }: { onPick: (k: 'game' | 'general' | 'everything') => void }) {
  const cards = [
    { k: 'game', t: '🎮 Game Dev', d: 'oracle, explorer, librarian, designer, fixer, observer, critic' },
    { k: 'general', t: '🌐 General', d: 'explorer, fixer, observer, critic' },
    { k: 'everything', t: '🌌 Everything', d: 'every known agent enabled' },
  ] as const;
  return (
    <div className="preset-cards">
      {cards.map((c) => (
        <button key={c.k} className="preset" onClick={() => onPick(c.k)}>
          <strong>{c.t}</strong>
          <span className="muted small">{c.d}</span>
        </button>
      ))}
    </div>
  );
}

function Chains({ client, roster }: { client: OpencodeClient; roster: string[] }) {
  const [chains, setChains] = useState(loadChains);
  const [name, setName] = useState('Research → Build → Review');
  const [steps, setSteps] = useState<Array<{ agent: string; modelId: string }>>([
    { agent: 'explorer', modelId: 'opencode-go/deepseek-v4-flash' },
    { agent: 'fixer', modelId: 'opencode-go/deepseek-v4-pro' },
    { agent: 'critic', modelId: 'opencode-go/qwen3.8-flash' },
  ]);
  const [input, setInput] = useState('');
  const [outputs, setOutputs] = useState<Array<string | null>>([]);
  const [running, setRunning] = useState(false);
  const [models, setModels] = useState<ChatModel[]>([]);

  useEffect(() => {
    import('../lib/chat').then((m) => {
      void m.fetchModels(client).then(setModels);
    });
  }, [client]);

  const addStep = (agent: string) =>
    setSteps((s) => [...s, { agent, modelId: models.find((m) => m.id.startsWith('opencode-go/'))?.id ?? '' }]);

  const run = async () => {
    if (!input.trim() || steps.length === 0 || running) return;
    setRunning(true);
    setOutputs(steps.map(() => null));
    const resolved = steps.map((s) => ({
      agent: s.agent,
      model: models.find((m) => m.id === s.modelId) ?? { id: s.modelId, providerID: 'opencode-go', modelID: s.modelId, name: s.modelId },
    }));
    await runChain(client, resolved, input.trim(), (i, out, err) => {
      setOutputs((prev) => prev.map((p, j) => (j === i ? (err ?? out) : p)));
    });
    setRunning(false);
  };

  return (
    <div className="team-presets">
      <div className="panel-title">MODEL CHAINS · REAL SEQUENTIAL PROMPTS</div>
      <p className="muted small">
        Design an agent pipeline — each step is a real prompt, each step burns real quota. Drag nodes on the
        graph to arrange your view; define execution order here.
      </p>
      <div className="chain-steps">
        {steps.map((s, i) => (
          <div key={i} className="chain-step">
            <span className="mono">{i + 1}. {s.agent}</span>
            <select
              aria-label={`Model for step ${i + 1}`}
              value={s.modelId}
              onChange={(e) => setSteps((prev) => prev.map((p, j) => (j === i ? { ...p, modelId: e.target.value } : p)))}
            >
              {models.slice(0, 200).map((m) => (
                <option key={m.id} value={m.id}>{m.id}</option>
              ))}
              {!models.some((m) => m.id === s.modelId) && <option value={s.modelId}>{s.modelId}</option>}
            </select>
            <button onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove step">✕</button>
          </div>
        ))}
      </div>
      <div className="chat-controls">
        <label>Add agent
          <select value="" onChange={(e) => { if (e.target.value) addStep(e.target.value); }}>
            <option value="">+ pick…</option>
            {roster.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>Chain name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          onClick={() => {
            const next = [...chains.filter((c) => c.name !== name), { name, steps }];
            setChains(next);
            saveChains(next);
          }}
        >
          Save chain
        </button>
      </div>
      {chains.length > 0 && (
        <div className="chat-controls">
          <label>Load
            <select value="" onChange={(e) => {
              const c = chains.find((x) => x.name === e.target.value);
              if (c) {
                setName(c.name);
                setSteps(c.steps);
              }
            }}>
              <option value="">saved chains…</option>
              {chains.map((c) => (
                <option key={c.name} value={c.name}>{c.name} ({c.steps.length})</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="chat-input">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} placeholder="Chain input — runs through every step in order…" />
        <button className="primary" disabled={running || !input.trim()} onClick={() => void run()}>
          {running ? 'Running…' : `Run chain (${steps.length} steps)`}
        </button>
      </div>
      {outputs.map((o, i) => (
        o !== null && (
          <div key={i} className="msg msg-assistant">
            <div className="msg-head">STEP {i + 1} · {steps[i]?.agent.toUpperCase()}</div>
            <pre className="msg-text">{o.slice(0, 2000)}</pre>
          </div>
        )
      ))}
    </div>
  );
}

export default function Team() {
  const agents = useMission((s) => s.agents);
  const stats = useMission((s) => s.stats);
  const endpoint = useMission((s) => s.settings.endpoint);

  const rows = useMemo(() => Object.values(agents).sort((a, b) => a.id.localeCompare(b.id)), [agents]);
  const distinctModels = useMemo(() => Array.from(new Set(rows.map((r) => r.model))).length, [rows]);
  const roster = useMemo(() => rows.map((r) => r.id), [rows]);
  const client = useMemo(() => createClient(endpoint), [endpoint]);

  return (
    <div className="team">
      <div className="team-head">
        <div>
          <div className="panel-title">TEAM ROSTER · LIVE FROM SERVER</div>
          <p className="muted small">
            {rows.length} agents · {distinctModels} distinct models · {stats.sessions} sessions observed.
            Models come from real session telemetry — custom agents appear automatically.
          </p>
        </div>
      </div>
      <table className="team-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Role</th>
            <th>Model</th>
            <th>Variant</th>
            <th>Status</th>
            <th>Children</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td><span className="mono">{roleMeta(a.id).glyph} {a.id}</span></td>
              <td>{a.role}</td>
              <td className="mono small">{a.model}</td>
              <td>{a.variant}</td>
              <td>{a.state.toUpperCase()}</td>
              <td>{a.childCount}</td>
              <td className="mono">{a.cost !== null ? `$${a.cost.toFixed(4)}` : '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} className="muted">Connect to see your live roster.</td></tr>
          )}
        </tbody>
      </table>
      <Presets allRoster={roster} />
      <Chains client={client} roster={roster} />
    </div>
  );
}
