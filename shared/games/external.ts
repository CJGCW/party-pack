import type { GameInfo, WheelEntry } from '../protocol';

// Games played away from the app (board games, cards, anything): the VIP lists them in the lobby,
// each gets its own slice on the wheel, and when one comes up the app waits until the VIP marks
// it finished, tapping who won. Each winner scores a full round's points (see WIN_POINTS_PER_PUZZLE).

export const EXTERNAL: GameInfo = {
  id: 'external',
  name: 'Other game',
  description: 'A game played away from the app. The app waits until the VIP marks it finished.',
  minPlayers: 1,
  maxPlayers: 8,
  modes: [{ id: 'standard', name: 'Standard', description: 'Play it, then the VIP taps Finished.' }],
};

/** A winner scores this for each puzzle a round has: as much as an app game's best player can get in a round. */
export const WIN_POINTS_PER_PUZZLE = 1_000;

export const MAX_EXTERNAL_GAMES = 20;
export const MAX_EXTERNAL_NAME = 40;

/** The VIP's list, as typed: names separated by commas or new lines (blanks and repeats dropped). */
export function parseExternalGames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of String(text ?? '').split(/[,\n]/)) {
    const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_EXTERNAL_NAME).trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
    if (names.length >= MAX_EXTERNAL_GAMES) break;
  }
  return names;
}

/** An external game's slice on the wheel. */
export function externalEntry(name: string): WheelEntry {
  return { id: `${EXTERNAL.id}:${name.toLowerCase()}`, gameId: EXTERNAL.id, modeId: 'standard', label: name };
}

export interface ExternalView {
  name: string;
  /** How long it's been going. */
  elapsedMs: number;
  /** Who can mark it finished. */
  vipName: string;
}

export interface ExternalPlayerView extends ExternalView {
  isVip: boolean;
  /** Everyone who can win (players still here), for the VIP's winner buttons. */
  players: { id: string; name: string; color: string }[];
  /** What a win is worth. */
  winPoints: number;
}

/** The VIP marks it finished, with who won (none is fine). */
export type ExternalInput = { type: 'finish'; winners: string[] };
