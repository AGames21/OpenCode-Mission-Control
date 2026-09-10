import { useEffect, useMemo, useState } from 'react';
import AgentGraph from './components/AgentGraph';
import Chat from './components/Chat';
import Inspector from './components/Inspector';
import Team from './components/Team';
import Timeline from './components/Timeline';
import { SettingsModal, SetupBanner, StatsBar, TopBar } from './components/Panels';
import { createClient } from './lib/opencode';
import { useMission } from './store';

type View = 'graph' | 'chat' | 'team';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<View>('graph');
  const boot = useMission((s) => s.boot);
  const endpoint = useMission((s) => s.settings.endpoint);
  const client = useMemo(() => createClient(endpoint), [endpoint]);

  useEffect(() => {
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="shell">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <nav className="viewtabs" aria-label="Views">
        {(['graph', 'chat', 'team'] as View[]).map((v) => (
          <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {v === 'graph' ? '⬢ GRAPH' : v === 'chat' ? '💬 CHAT' : '👥 TEAM'}
          </button>
        ))}
      </nav>
      <StatsBar />
      {view === 'graph' && (
        <main className="main">
          <div className="canvas">
            <AgentGraph />
            <SetupBanner />
          </div>
          <Inspector />
        </main>
      )}
      {view === 'chat' && (
        <main className="main main-chat">
          <Chat client={client} />
        </main>
      )}
      {view === 'team' && (
        <main className="main main-chat">
          <Team />
        </main>
      )}
      <Timeline />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
