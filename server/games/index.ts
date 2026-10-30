import { config } from '../config';
import type { MiniGameDefinition } from './MiniGame';
import { loadAddOns } from './addons';
import { blockbusters } from './blockbusters';
import { clueCrew } from './clueCrew';
import { concentration } from './concentration';
import { external } from './external';
import { longestWord } from './longestWord';
import { mazeRace } from './mazeRace';
import { pegDrop } from './pegDrop';
import { spiralShot } from './spiralShot';
import { starSplat } from './starSplat';
import { pickEm, pickEmCoop } from './pickEm';
import { tossUp } from './tossUp';
import { rackAttack } from './rackAttack';
import { trivia, triviaQuest } from './trivia';
import { twentyOne } from './twentyOne';
import { woochaware } from './woochaware';
import { wordleRace } from './wordleRace';

/** Every mini game in the pack. Add new games here. WoochaWare can be turned off in the config. */
export const GAMES: MiniGameDefinition[] = [
  wordleRace, tossUp, trivia, triviaQuest, pickEm, pickEmCoop, rackAttack, clueCrew, concentration, blockbusters, twentyOne, longestWord, pegDrop, mazeRace, spiralShot, starSplat,
  ...(config.woochaware ? [woochaware] : []),
  // Machine-local add-ons, if any (see ./addons).
  ...(await loadAddOns()),
];

export function findGame(id: string): MiniGameDefinition | undefined {
  // Games played away from the app aren't a slice of their own (each one the VIP lists is), so they're not in GAMES.
  return GAMES.find((g) => g.info.id === id) ?? (id === external.info.id ? external : undefined);
}
