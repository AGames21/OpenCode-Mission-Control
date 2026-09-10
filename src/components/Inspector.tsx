import { useState } from 'react';
import { useMission } from '../store';

const TABS = ['OVERVIEW', 'ACTIVITY', 'TOOLS', 'FILES', 'SESSIONS', 'ERRORS'] as const;

function Field({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="field">
      <span className="field-k">{k}</span>
      <span className="field-v">{v ?? <em className="unavail">unavailable</em>}</span>
    </div>
  );
}

function elapsed(startedAt: number | null): string {
  if (!startedAt) return '—';
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(s / 60);
  if (m < 1) return `${s}s`;
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function Inspector() {
  const selectedId = useMission((s) => s.selectedId);
  const agents = useMission((s) => s.agents);
  const timeline = useMission((s) => s.timeline);
  const [tab, setTab] = useState<(typeof TABS)[number]>('OVERVIEW');

  const agent = selectedId ? agents[selectedId] : null;
  if (!agent) {
    return (
      <aside className="inspector">
        <div className="panel-title">INSPECTOR</div>
        <p className="muted">Select an agent node to inspect real telemetry.</p>
      </aside>
    );
  }

  const related = timeline.filter((e) => e.agent === agent.id).slice(-30).reverse();
  const tools = related.filter((e) => /tool:/i.test(e.summary));
  const errors = related.filter((e) => /error/i.test(e.kind) || /error/i.test(e.summary));

  return (
    <aside className="inspector">
      <div className="panel-title">INSPECTOR · {agent.id.toUpperCase()}</div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'OVERVIEW' && (
        <div className="tab-body">
          <Field k="Role" v={agent.role} />
          <Field k="Model" v={agent.model} />
          <Field k="Variant" v={agent.variant === '—' ? null : agent.variant} />
          <Field k="Status" v={agent.state.toUpperCase()} />
          <Field k="Parent" v={agent.parentId} />
          <Field k="Children" v={String(agent.childCount)} />
          <Field k="Elapsed" v={elapsed(agent.startedAt)} />
          <Field k="Session" v={agent.sessionId} />
          <Field k="Error" v={agent.error} />
          <Field k="Cost" v={agent.cost !== null ? `$${agent.cost.toFixed(4)}` : null} />
          <Field k="Tokens in" v={agent.tokensIn !== null ? agent.tokensIn.toLocaleString() : null} />
          <Field k="Tokens out" v={agent.tokensOut !== null ? agent.tokensOut.toLocaleString() : null} />
          <p className="muted small">Usage aggregates real per-session cost/tokens reported by the local OpenCode server.</p>
        </div>
      )}
      {tab === 'ACTIVITY' && (
        <div className="tab-body">
          <Field k="Current" v={agent.activity} />
          <Field k="Tool" v={agent.lastTool} />
          <ul className="elist">
            {related.map((e) => (
              <li key={e.id}><span className="ts">{new Date(e.ts).toLocaleTimeString()}</span> {e.summary}</li>
            ))}
            {related.length === 0 && <li className="muted">No events observed for this agent yet.</li>}
          </ul>
        </div>
      )}
      {tab === 'TOOLS' && (
        <div className="tab-body">
          <Field k="Current tool" v={agent.lastTool} />
          <ul className="elist">
            {tools.map((e) => (
              <li key={e.id}><span className="ts">{new Date(e.ts).toLocaleTimeString()}</span> {e.summary}</li>
            ))}
            {tools.length === 0 && <li className="muted">No tool executions observed yet.</li>}
          </ul>
        </div>
      )}
      {tab === 'FILES' && (
        <div className="tab-body">
          <Field k="Current file" v={agent.lastFile} />
          <p className="muted small">File reads/edits appear here only when reported by real events.</p>
        </div>
      )}
      {tab === 'SESSIONS' && (
        <div className="tab-body">
          <Field k="Session" v={agent.sessionId} />
          <Field k="Parent" v={agent.parentId} />
          <Field k="Children" v={String(agent.childCount)} />
        </div>
      )}
      {tab === 'ERRORS' && (
        <div className="tab-body">
          <ul className="elist">
            {errors.map((e) => (
              <li key={e.id} className="err"><span className="ts">{new Date(e.ts).toLocaleTimeString()}</span> {e.summary}</li>
            ))}
            {errors.length === 0 && <li className="muted">No errors observed.</li>}
          </ul>
        </div>
      )}
    </aside>
  );
}
