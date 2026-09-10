import { useMemo } from 'react';
import { roleMeta } from '../lib/mapping';
import { useMission } from '../store';

/**
 * Team roster from LIVE server data (agents + observed session models).
 * Preset switching needs safe file editing with backup — that ships with
 * the Tauri desktop shell, which can touch user config. Until then this
 * view is read-only on purpose: it never fakes a config it cannot write.
 */
export default function Team() {
  const agents = useMission((s) => s.agents);
  const stats = useMission((s) => s.stats);

  const rows = useMemo(() => Object.values(agents).sort((a, b) => a.id.localeCompare(b.id)), [agents]);
  const distinctModels = useMemo(() => Array.from(new Set(rows.map((r) => r.model))).length, [rows]);

  return (
    <div className="team">
      <div className="team-head">
        <div>
          <div className="panel-title">TEAM ROSTER · LIVE FROM SERVER</div>
          <p className="muted small">
            {rows.length} agents · {distinctModels} distinct models · {stats.sessions} sessions observed.
            Models come from real session telemetry, not a hardcoded list — custom agents appear automatically.
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
      <div className="team-presets">
        <div className="panel-title">PRESETS</div>
        <div className="preset-cards">
          <div className="preset">
            <strong>🎮 Game Dev</strong>
            <span className="muted small">orchestrator + oracle, explorer, designer, fixer, observer, critic</span>
          </div>
          <div className="preset">
            <strong>🌐 General</strong>
            <span className="muted small">orchestrator + explorer, fixer, critic</span>
          </div>
          <div className="preset">
            <strong>🌌 Everything</strong>
            <span className="muted small">all agents incl. council + specialist critics</span>
          </div>
        </div>
        <p className="muted small">
          One-click preset switching needs safe config editing with automatic
          backup — that arrives with the Tauri desktop shell. Presets above
          describe your current live roster; nothing here is applied yet.
        </p>
      </div>
    </div>
  );
}
