/**
 * Preset + agent management for the DESKTOP app only.
 * Reads/writes the real oh-my-opencode-slim.json with automatic backup.
 * Web builds cannot touch user files — the UI stays read-only there.
 */

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export interface SlimConfig {
  preset?: string;
  presets?: Record<string, Record<string, unknown>>;
  agents?: Record<string, unknown>;
  disabled_agents?: string[];
  [k: string]: unknown;
}

export interface PresetState {
  path: string;
  config: SlimConfig;
  presetNames: string[];
  allAgents: string[];
  backupPath: string | null;
}

async function tauriMods() {
  const [{ homeDir }, fs] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-fs'),
  ]);
  return { homeDir, fs };
}

export async function loadSlim(): Promise<PresetState> {
  const { homeDir, fs } = await tauriMods();
  const home = await homeDir();
  const sep = home.endsWith('/') || home.endsWith('\\') ? '' : '/';
  const path = `${home}${sep}.config/opencode/oh-my-opencode-slim.json`;
  const text = await fs.readTextFile(path);
  const config = JSON.parse(text) as SlimConfig;
  const presetNames = Object.keys(config.presets ?? {});
  const names = new Set<string>();
  for (const p of Object.values(config.presets ?? {})) {
    for (const k of Object.keys(p as Record<string, unknown>)) {
      if (k !== 'orchestrator') names.add(k);
    }
  }
  for (const k of Object.keys(config.agents ?? {})) names.add(k);
  return { path, config, presetNames, allAgents: [...names].sort(), backupPath: null };
}

/** Backup + write. Returns the backup path. Never writes without backup. */
export async function saveSlim(state: PresetState, next: SlimConfig): Promise<string> {
  const { fs } = await tauriMods();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = state.path.replace(/\.json$/, '') + `.mc-backup-${stamp}.json`;
  const original = await fs.readTextFile(state.path);
  await fs.writeTextFile(backupPath, original);
  await fs.writeTextFile(state.path, JSON.stringify(next, null, 2));
  return backupPath;
}

/** Built-in team shapes over the user's own agent names. */
export function presetAgents(kind: 'game' | 'general' | 'everything', all: string[]): string[] {
  if (kind === 'everything') return [...all];
  const game = new Set(['oracle', 'explorer', 'librarian', 'designer', 'fixer', 'observer', 'critic']);
  const general = new Set(['explorer', 'fixer', 'observer', 'critic']);
  const want = kind === 'game' ? game : general;
  return all.filter((a) => want.has(a));
}
