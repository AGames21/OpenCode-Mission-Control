import { useMemo } from 'react';
import { useMission } from '../store';

export default function Timeline() {
  const timeline = useMission((s) => s.timeline);
  const filter = useMission((s) => s.filter);
  const setFilter = useMission((s) => s.setFilter);
  const agents = useMission((s) => s.agents);

  const agentNames = useMemo(() => Object.keys(agents).sort(), [agents]);
  const kinds = useMemo(() => Array.from(new Set(timeline.map((t) => t.kind))).sort(), [timeline]);

  const visible = useMemo(
    () =>
      timeline
        .filter((e) => (filter.agent === 'all' ? true : e.agent === filter.agent))
        .filter((e) => (filter.kind === 'all' ? true : e.kind === filter.kind))
        .filter((e) => (filter.errorsOnly ? /error/i.test(e.kind) || /error/i.test(e.summary) : true))
        .slice(-200)
        .reverse(),
    [timeline, filter],
  );

  return (
    <section className="timeline">
      <div className="timeline-head">
        <span className="panel-title">LIVE TIMELINE · {timeline.length} EVENTS</span>
        <div className="filters">
          <select aria-label="Filter by agent" value={filter.agent} onChange={(e) => setFilter({ agent: e.target.value })}>
            <option value="all">all agents</option>
            {agentNames.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select aria-label="Filter by event type" value={filter.kind} onChange={(e) => setFilter({ kind: e.target.value })}>
            <option value="all">all types</option>
            {kinds.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={filter.errorsOnly} onChange={(e) => setFilter({ errorsOnly: e.target.checked })} />
            errors only
          </label>
        </div>
      </div>
      <ol className="tlist">
        {visible.map((e) => (
          <li key={e.id} className={/error/i.test(e.kind + e.summary) ? 'err' : ''}>
            <span className="ts">{new Date(e.ts).toLocaleTimeString('en-GB')}</span>
            <span className="t-agent">{e.agent}</span>
            <span className="t-kind">{e.kind}</span>
            <span className="t-sum">{e.summary}</span>
          </li>
        ))}
        {visible.length === 0 && <li className="muted">No events yet — every row here is real OpenCode telemetry.</li>}
      </ol>
    </section>
  );
}
