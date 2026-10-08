import type { MiniGameDefinition } from './MiniGame';
import { tossUp } from './tossUp';
import { trivia } from './trivia';
import { woochaware } from './woochaware';
import { wordleRace } from './wordleRace';

/** Every mini game in the pack. Add new games here. */
export const GAMES: MiniGameDefinition[] = [wordleRace, tossUp, trivia, woochaware];

export function findGame(id: string): MiniGameDefinition | undefined {
  return GAMES.find((g) => g.info.id === id);
}
