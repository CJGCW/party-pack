import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  /**
   * Debug mode: the VIP picks a specific game to play from the lobby, instead of
   * a multi-round session where the wheel picks each game at random.
   */
  debugMode: boolean;
}

const DEFAULTS: Config = { debugMode: false };
const CONFIG_FILE = resolve(import.meta.dirname, '..', 'party-pack.config.json');

/**
 * Settings come from party-pack.config.json, and environment variables override
 * them (PARTY_PACK_DEBUG=1 turns on debug mode, as `npm run dev:debug` does).
 */
function loadConfig(): Config {
  let fromFile: Partial<Config> = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      fromFile = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    } catch (err) {
      console.warn(`Couldn't read ${CONFIG_FILE}, using defaults:`, err);
    }
  }
  const config: Config = { ...DEFAULTS, ...fromFile };

  const debugEnv = process.env.PARTY_PACK_DEBUG;
  if (debugEnv !== undefined) config.debugMode = /^(1|true|yes|on)$/i.test(debugEnv);
  return config;
}

export const config = loadConfig();
