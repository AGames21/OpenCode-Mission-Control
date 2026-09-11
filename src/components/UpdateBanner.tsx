import { useEffect, useState } from 'react';
import { isDesktop } from '../lib/presets';

type Phase =
  | { name: 'idle' }
  | { name: 'checking' }
  | { name: 'available'; version: string; notes: string | null }
  | { name: 'downloading'; version: string }
  | { name: 'ready'; version: string }
  | { name: 'uptodate' }
  | { name: 'error'; message: string };

/**
 * Desktop-only auto-updater UI. Checks the GitHub release feed on launch;
 * download + install on one click, then restart. Web builds render nothing.
 */
export default function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [updater, setUpdater] = useState<{
    downloadAndInstall: (cb?: (e: { event: string }) => void) => Promise<void>;
    version: string;
    body?: string | null;
  } | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    (async () => {
      setPhase({ name: 'checking' });
      try {
        const mod = await import('@tauri-apps/plugin-updater');
        const found = (await mod.check()) as {
          version: string;
          body?: string | null;
          downloadAndInstall: (cb?: (e: { event: string }) => void) => Promise<void>;
        } | null;
        if (cancelled) return;
        if (found) {
          setUpdater(found);
          setPhase({ name: 'available', version: found.version, notes: found.body ?? null });
        } else {
          setPhase({ name: 'uptodate' });
        }
      } catch (e) {
        if (!cancelled) setPhase({ name: 'error', message: e instanceof Error ? e.message : 'Update check failed.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isDesktop()) return null;

  const update = async () => {
    if (!updater) return;
    setPhase({ name: 'downloading', version: updater.version });
    try {
      await updater.downloadAndInstall();
      setPhase({ name: 'ready', version: updater.version });
    } catch (e) {
      setPhase({ name: 'error', message: e instanceof Error ? e.message : 'Download failed.' });
    }
  };

  const restart = async () => {
    const proc = await import('@tauri-apps/plugin-process');
    await proc.relaunch();
  };

  if (phase.name === 'idle' || phase.name === 'checking' || phase.name === 'uptodate') return null;

  return (
    <div className="update-banner" role="status">
      {phase.name === 'available' && (
        <>
          <span>⬆ Mission Control {phase.version} is available.{phase.notes ? ` ${phase.notes.slice(0, 120)}` : ''}</span>
          <button className="primary" onClick={() => void update()}>Download & install</button>
        </>
      )}
      {phase.name === 'downloading' && <span>⬇ Downloading {phase.version}…</span>}
      {phase.name === 'ready' && (
        <>
          <span>✅ {phase.version} installed.</span>
          <button className="primary" onClick={() => void restart()}>Restart now</button>
        </>
      )}
      {phase.name === 'error' && <span className="err-text">Update failed: {phase.message}</span>}
    </div>
  );
}
