import { useEffect, useMemo, useRef, useState } from 'react';
import type { OpencodeClient } from '@opencode-ai/sdk/client';
import { createClient } from '../lib/opencode';
import {
  abortSession,
  createSession,
  fetchMessages,
  fetchModels,
  rankModels,
  sendPrompt,
  type ChatMessage,
  type ChatModel,
} from '../lib/chat';
import { useMission } from '../store';

export default function Chat({ client }: { client: OpencodeClient | null }) {
  const agents = useMission((s) => s.agents);
  const settings = useMission((s) => s.settings);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string | null }>>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [modelId, setModelId] = useState<string>('opencode-go/muse-spark-1.3-contributor');
  const [agent, setAgent] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeClient = useMemo(() => client ?? createClient(settings.endpoint), [client, settings.endpoint]);

  const refreshSessions = async () => {
    const res = (await activeClient.session.list().catch(() => null)) as {
      data?: Array<{ id: string; title?: string | null }>;
    } | null;
    if (Array.isArray(res?.data)) {
      setSessions(res.data.slice(0, 30).map((s) => ({ id: s.id, title: s.title ?? null })));
    }
  };

  const refreshMessages = async (id: string) => {
    setMessages(await fetchMessages(activeClient, id));
  };

  useEffect(() => {
    void (async () => {
      const ms = await fetchModels(activeClient);
      setModels(ms);
      if (!ms.some((m) => m.id === modelId) && ms.length > 0) setModelId(ms[0].id);
    })();
    void refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending]);

  // While a reply is pending, poll for streamed parts.
  useEffect(() => {
    if (!pending || !sessionId) return;
    const t = setInterval(() => void refreshMessages(sessionId), 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, sessionId]);

  const teamIds = useMemo(() => Object.values(agents).map((a) => a.model).filter((m) => m !== 'unavailable'), [agents]);
  const ranked = useMemo(() => rankModels(models, teamIds), [models, teamIds]);
  const shown = useMemo(() => {
    const f = filter.toLowerCase();
    const list = f ? ranked.filter((m) => m.id.toLowerCase().includes(f)) : ranked;
    return list.slice(0, 60);
  }, [ranked, filter]);

  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    const id = await createSession(activeClient, draft.slice(0, 60) || 'Mission Control chat');
    if (id) {
      setSessionId(id);
      await refreshSessions();
    }
    return id;
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || pending) return;
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      setError('Pick a model first (list still loading).');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const id = await ensureSession();
      if (!id) throw new Error('Could not create session on the OpenCode server.');
      setDraft('');
      await refreshMessages(id);
      const ok = await sendPrompt(activeClient, id, text, model, agent || undefined);
      if (!ok) throw new Error('Server rejected the prompt (model/agent may be unavailable).');
      await refreshMessages(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prompt failed.');
    } finally {
      setPending(false);
      if (sessionId) await refreshMessages(sessionId);
    }
  };

  const agentNames = useMemo(() => Object.keys(agents).sort(), [agents]);

  return (
    <div className="chat">
      <div className="chat-side">
        <div className="panel-title">SESSIONS</div>
        <button
          className="primary"
          onClick={() => {
            setSessionId(null);
            setMessages([]);
            setDraft('');
          }}
        >
          + New chat
        </button>
        <ul className="chat-sessions">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                className={s.id === sessionId ? 'active' : ''}
                onClick={() => {
                  setSessionId(s.id);
                  void refreshMessages(s.id);
                }}
                title={s.id}
              >
                {s.title || s.id.slice(0, 12)}
              </button>
            </li>
          ))}
          {sessions.length === 0 && <li className="muted small">No sessions yet.</li>}
        </ul>
      </div>

      <div className="chat-main">
        <div className="chat-controls">
          <label>
            Model
            <input
              placeholder="type to filter 7,000+ models…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <select aria-label="Model" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {shown.map((m) => (
              <option key={m.id} value={m.id}>
                {teamIds.includes(m.id) ? `★ ${m.id}` : m.id}
              </option>
            ))}
          </select>
          <label>
            Agent
            <select aria-label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="">default</option>
              {agentNames.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="chat-thread">
          {messages.map((m) => (
            <div key={m.id} className={`msg msg-${m.role}`}>
              <div className="msg-head">
                {m.role === 'user' ? 'YOU' : (m.agent ?? 'ASSISTANT').toUpperCase()}
                {m.modelID && <span className="msg-model">{m.modelID}</span>}
              </div>
              {m.text ? <pre className="msg-text">{m.text}</pre> : <span className="muted small">(no text — tool activity only)</span>}
              {m.tools.length > 0 && <div className="msg-tools">🔧 {m.tools.join(' · ')}</div>}
            </div>
          ))}
          {messages.length === 0 && (
            <p className="muted">Pick a model, choose an agent (optional), and type below. Replies stream from your real OpenCode server.</p>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="err-text">{error}</p>}
        <div className="chat-input">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
            rows={3}
          />
          {pending ? (
            <button onClick={() => sessionId && void abortSession(activeClient, sessionId)}>■ Stop</button>
          ) : (
            <button className="primary" onClick={() => void send()}>Send</button>
          )}
        </div>
      </div>
    </div>
  );
}
