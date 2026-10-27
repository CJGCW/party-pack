import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MiniGameDefinition } from './MiniGame';

/**
 * Machine-local add-on games live in /local (which isn't committed): each folder with a
 * server.ts that exports `game` (a MiniGameDefinition), plus phone.ts and tv.ts for its screens
 * (see client/play/addons.ts and client/host/addons.ts). Without the folder there are none.
 */
const ADDON_DIR = resolve(import.meta.dirname, '..', '..', 'local');

export async function loadAddOns(): Promise<MiniGameDefinition[]> {
  if (!existsSync(ADDON_DIR)) return [];
  const games: MiniGameDefinition[] = [];
  for (const entry of readdirSync(ADDON_DIR, { withFileTypes: true })) {
    const file = join(ADDON_DIR, entry.name, 'server.ts');
    if (!entry.isDirectory() || !existsSync(file)) continue;
    try {
      const mod = (await import(pathToFileURL(file).href)) as { game?: MiniGameDefinition };
      if (mod.game) games.push(mod.game);
    } catch (err) {
      console.warn(`[add-ons] Couldn't load ${entry.name}:`, err);
    }
  }
  return games;
}
