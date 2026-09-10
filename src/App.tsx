import { useState } from 'react';
import AgentGraph from './components/AgentGraph';
import Inspector from './components/Inspector';
import Timeline from './components/Timeline';
import { SettingsModal, SetupBanner, StatsBar, TopBar } from './components/Panels';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="shell">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <StatsBar />
      <main className="main">
        <div className="canvas">
          <AgentGraph />
          <SetupBanner />
        </div>
        <Inspector />
      </main>
      <Timeline />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
