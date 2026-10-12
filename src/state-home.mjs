import os from 'node:os';
import path from 'node:path';

export function stateHome(env = process.env, platform = process.platform) {
  if (env.BBRAINX_HOME) return path.resolve(env.BBRAINX_HOME);
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'BBrainX');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'BBrainX');
  return path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'bbrainx');
}
