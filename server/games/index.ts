import type { MiniGameDefinition } from './MiniGame';
import { pickEm } from './pickEm';
import { tossUp } from './tossUp';
import { rackAttack } from './rackAttack';
import { trivia, triviaQuest } from './trivia';
import { woochaware } from './woochaware';
import { wordleRace } from './wordleRace';

/** Every mini game in the pack. Add new games here. */
export const GAMES: MiniGameDefinition[] = [wordleRace, tossUp, trivia, triviaQuest, pickEm, rackAttack, woochaware];

export function findGame(id: string): MiniGameDefinition | undefined {
  return GAMES.find((g) => g.info.id === id);
}
