import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  /**
   * Debug mode: the VIP picks a specific game to play from the lobby, instead of
   * a multi-round session where the wheel picks each game at random.
   */
  debugMode: boolean;
  /**
   * WoochaWare debug: the lobby lists only WoochaWare's microgames, and the VIP
   * picks one to practise (once at each speed level). Takes priority over debugMode.
   * Ignored when WoochaWare is turned off.
   */
  woochaDebug: boolean;
  /**
   * WoochaWare on or off. On, it's one of the games, and phones join over HTTPS
   * (with a self-signed certificate) so their browsers allow the motion sensors its
   * tilt and shake games use. Off, it's left out entirely, phones join over plain
   * HTTP (no certificate warning), and woochaDebug is ignored. The host screen is
   * always plain HTTP.
   */
  woochaware: boolean;
}

const DEFAULTS: Config = { debugMode: false, woochaDebug: false, woochaware: true };
const CONFIG_FILE = resolve(import.meta.dirname, '..', 'party-pack.config.json');

/**
 * Settings come from party-pack.config.json, and environment variables override
 * them (PARTY_PACK_DEBUG=1 turns on debug mode, as `npm run dev:debug` does, and
 * PARTY_PACK_WOOCHA_DEBUG=1 turns on WoochaWare debug, as `npm run dev:woocha` does;
 * PARTY_PACK_WOOCHAWARE=0 turns WoochaWare and HTTPS off).
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
  const woochaEnv = process.env.PARTY_PACK_WOOCHA_DEBUG;
  if (woochaEnv !== undefined) config.woochaDebug = /^(1|true|yes|on)$/i.test(woochaEnv);
  const woochawareEnv = process.env.PARTY_PACK_WOOCHAWARE;
  if (woochawareEnv !== undefined) config.woochaware = /^(1|true|yes|on)$/i.test(woochawareEnv);
  // With WoochaWare off there's nothing to debug, so its debug mode can't take over the lobby.
  if (!config.woochaware) config.woochaDebug = false;
  return config;
}

export const config = loadConfig();
