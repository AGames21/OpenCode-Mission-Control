import { useEffect, useState } from 'react';
import type { OpencodeClient } from '@opencode-ai/sdk/client';
import {
  MCP_PRESETS,
  addLocalMcp,
  addRemoteMcp,
  fetchMcp,
  fetchToolIds,
  setMcpConnected,
  type McpEntry,
} from '../lib/mcp';

export default function Tools({ client }: { client: OpencodeClient }) {
  const [servers, setServers] = useState<McpEntry[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'local' | 'remote'>('local');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setServers(await fetchMcp(client));
    setTools(await fetchToolIds(client));
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async () => {
    setBusy(true);
    setMsg(null);
    const err =
      mode === 'local'
        ? await addLocalMcp(client, name.trim(), command.trim().split(/\s+/))
        : await addRemoteMcp(client, name.trim(), url.trim());
    setMsg(err ?? `Installed “${name.trim()}”. Enable/connect takes effect on the live server.`);
    await refresh();
    setBusy(false);
  };

  const canInstall =
    name.trim().length > 0 && (mode === 'local' ? command.trim().length > 0 : url.trim().length > 0);

  return (
    <div className="team">
      <div className="panel-title">MCP SERVERS · LIVE</div>
      <table className="team-table">
        <thead>
          <tr><th>Server</th><th>Status</th><th>Detail</th><th></th></tr>
        </thead>
        <tbody>
          {servers.map((s) => (
            <tr key={s.name}>
              <td className="mono">{s.name}</td>
              <td>{s.status.toUpperCase()}</td>
              <td className="muted small">{s.detail ?? '—'}</td>
              <td>
                <button
                  onClick={() => {
                    void (async () => {
                      await setMcpConnected(client, s.name, s.status !== 'connected');
                      await refresh();
                    })();
                  }}
                >
                  {s.status === 'connected' ? 'Disconnect' : 'Connect'}
                </button>
              </td>
            </tr>
          ))}
          {servers.length === 0 && <tr><td colSpan={4} className="muted">No MCP servers reported.</td></tr>}
        </tbody>
      </table>

      <div className="panel-title" style={{ marginTop: 16 }}>INSTALL A TOOL</div>
      <div className="preset-cards">
        {MCP_PRESETS.map((p) => (
          <button
            key={p.name}
            className="preset"
            title={p.hint}
            onClick={() => {
              setMode('local');
              setName(p.name);
              setCommand(p.command);
            }}
          >
            <strong>+ {p.name}</strong>
            <span className="muted small">{p.hint}</span>
          </button>
        ))}
      </div>
      <div className="chat-controls">
        <label>Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as 'local' | 'remote')}>
            <option value="local">local command</option>
            <option value="remote">remote URL</option>
          </select>
        </label>
        <label>Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-tools" spellCheck={false} />
        </label>
        {mode === 'local' ? (
          <label style={{ flex: 1 }}>Command
            <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx -y @scope/mcp-server" spellCheck={false} />
          </label>
        ) : (
          <label style={{ flex: 1 }}>URL
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" spellCheck={false} />
          </label>
        )}
        <button className="primary" disabled={!canInstall || busy} onClick={() => void install()}>
          {busy ? 'Installing…' : 'Install'}
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      <p className="muted small">
        Installs persist on the live OpenCode server instance. To make one permanent, copy it into your
        OpenCode config's <span className="mono">mcp</span> section.
      </p>

      <div className="panel-title" style={{ marginTop: 16 }}>TOOL CATALOG · {tools.length}</div>
      <p className="muted small mono">{tools.length > 0 ? tools.join(' · ') : 'No tools reported.'}</p>
    </div>
  );
}
