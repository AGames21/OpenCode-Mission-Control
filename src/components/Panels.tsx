import { useEffect, useState } from 'react';
import { useMission } from '../store';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-v">{value}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

export function StatsBar() {
  const agents = useMission((s) => s.agents);
  const stats = useMission((s) => s.stats);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const active = Object.values(agents).filter((a) => a.state !== 'idle' && a.state !== 'success').length;
  const uptime = stats.startedAt ? Math.floor((Date.now() - stats.startedAt) / 1000) : 0;
  const up = `${Math.floor(uptime / 60)}m ${uptime % 60}s`;

  return (
    <div className="stats">
      <Stat label="ACTIVE AGENTS" value={`${active} / ${Object.keys(agents).length}`} />
      <Stat label="SESSIONS" value={stats.sessions} />
      <Stat label="TOOLS EXECUTED" value={stats.tools} />
      <Stat label="FILES MODIFIED" value={stats.files} />
      <Stat label="ERRORS" value={stats.errors} />
      <Stat label="UPTIME" value={Object.keys(agents).length ? up : '—'} />
    </div>
  );
}

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const conn = useMission((s) => s.conn);
  const settings = useMission((s) => s.settings);
  const connect = useMission((s) => s.connect);
  const disconnect = useMission((s) => s.disconnect);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>⬢</span>
        <span className="brand-name">OPENCODE <strong>MISSION CONTROL</strong></span>
        <span className={`conn conn-${conn.status}`}>
          <span className="conn-dot" />
          {conn.status.toUpperCase()}
        </span>
      </div>
      <div className="top-actions">
        <span className="endpoint">{settings.endpoint}</span>
        {conn.status === 'live' ? (
          <button onClick={() => disconnect()}>Disconnect</button>
        ) : (
          <button className="primary" onClick={() => void connect()}>Connect</button>
        )}
        <button onClick={onOpenSettings} aria-label="Settings">⚙</button>
      </div>
    </header>
  );
}

export function SetupBanner() {
  const conn = useMission((s) => s.conn);
  const detected = useMission((s) => s.detected);
  const detectEndpoints = useMission((s) => s.detectEndpoints);
  const connect = useMission((s) => s.connect);
  const saveSettings = useMission((s) => s.saveSettings);

  useEffect(() => {
    if (conn.status === 'disconnected') void detectEndpoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (conn.status === 'live' || conn.status === 'connecting') return null;

  return (
    <div className="setup" role="dialog" aria-label="Connect to OpenCode">
      <h2>Connect Mission Control to OpenCode</h2>
      {conn.probing && <p className="muted">Probing {conn.probing}…</p>}
      {conn.error && <p className="err-text">{conn.error}</p>}
      {conn.status === 'reconnecting' && <p className="muted">Reconnecting with backoff…</p>}
      {detected.length > 0 ? (
        <div className="found">
          <p>OpenCode detected at:</p>
          {detected.map((d) => (
            <button key={d} className="primary" onClick={() => { saveSettings({ endpoint: d }); void connect(d); }}>
              Connect · {d}
            </button>
          ))}
        </div>
      ) : (
        !conn.probing && (
          <div>
            <p className="muted">OpenCode wasn't detected. Start it locally, then retry:</p>
            <code className="cmd">opencode serve --port 4096</code>
            <div className="row">
              <button className="primary" onClick={() => void detectEndpoints()}>Retry</button>
              <button onClick={() => void connect()}>Connect anyway</button>
            </div>
            <p className="muted small">Telemetry stays on this machine. Nothing is sent anywhere.</p>
          </div>
        )
      )}
    </div>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useMission((s) => s.settings);
  const saveSettings = useMission((s) => s.saveSettings);
  const connect = useMission((s) => s.connect);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label>
          Telemetry endpoint
          <input value={settings.endpoint} onChange={(e) => saveSettings({ endpoint: e.target.value })} spellCheck={false} />
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.animations} onChange={(e) => saveSettings({ animations: e.target.checked })} />
          Animations
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.autoReconnect} onChange={(e) => saveSettings({ autoReconnect: e.target.checked })} />
          Automatic reconnection
        </label>
        <div className="row">
          <button className="primary" onClick={() => { onClose(); void connect(settings.endpoint); }}>Save & reconnect</button>
          <button onClick={onClose}>Close</button>
        </div>
        <p className="muted small">Settings are stored locally in this browser profile / app data. No accounts, no analytics.</p>
      </div>
    </div>
  );
}
