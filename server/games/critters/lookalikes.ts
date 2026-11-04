import { wumble, type Piece, type Traits } from '../../../shared/critters';
import { LOOKALIKES, LOOKALIKE_LEVELS, type LookalikeState } from '../../../shared/games/critterGames';
import { critterGame, randInt, sameTraits, shuffled, type Board } from './engine';

const PAIRS = 5;

export interface LookalikePuzzle {
  examples: { w: Traits; b: Traits }[];
  critters: Traits[];
  bots: Traits[];
  /** By critter: their bot. */
  answer: number[];
}
interface LookalikeBoard extends Board {
  matched: (number | null)[];
  refused: [number, number][];
}

export function makeLookalikes(level: number): LookalikePuzzle {
  const { active, cross } = LOOKALIKE_LEVELS[level - 1];
  const traits = shuffled([0, 1, 2, 3]).slice(0, active);
  // Which bot trait each goes with.
  let botTrait = traits;
  while (cross && botTrait.some((t, i) => t === traits[i])) botTrait = shuffled([0, 1, 2, 3]).slice(0, active);
  // Three options of each trait matter, each going with one of the bot's.
  const options = traits.map(() => shuffled([0, 1, 2, 3, 4]).slice(0, 3));
  const botOptions = traits.map(() => shuffled([0, 1, 2, 3, 4]).slice(0, 3));
  const fixed = [randInt(5), randInt(5), randInt(5), randInt(5)];
  const pairFor = (choice: number[]) => {
    const w = [randInt(5), randInt(5), randInt(5), randInt(5)];
    const b = [...fixed];
    choice.forEach((c, i) => {
      w[traits[i]] = options[i][c];
      b[botTrait[i]] = botOptions[i][c];
    });
    return { w, b };
  };
  const choices: number[][] = [];
  const build = (at: number, so: number[]) => {
    if (at === active) choices.push(so);
    else for (let c = 0; c < 3; c++) build(at + 1, [...so, c]);
  };
  build(0, []);

  const exampleCount = active === 2 ? 4 : 6;
  for (;;) {
    const picked = shuffled(choices);
    const examples = picked.slice(0, exampleCount);
    const pairs = picked.slice(exampleCount, exampleCount + PAIRS);
    // Every option that's asked about must have been seen in an example.
    if (!pairs.every((p) => p.every((c, i) => examples.some((e) => e[i] === c)))) continue;
    const made = pairs.map(pairFor);
    const bots = shuffled(made.map((m) => m.b));
    return {
      examples: examples.map(pairFor),
      critters: made.map((m) => m.w),
      bots,
      answer: made.map((m) => bots.findIndex((b) => sameTraits(b, m.b))),
    };
  }
}

export const lookalikes = critterGame<LookalikePuzzle, LookalikeBoard>({
  info: LOOKALIKES,
  levels: LOOKALIKE_LEVELS,
  make: makeLookalikes,
  board: (z) => ({ got: 0, goal: z.critters.length, matched: z.critters.map(() => null), refused: [] }),
  input(z, b, raw) {
    const input = raw as { type?: string; critter?: number; bot?: number };
    const { critter, bot } = input;
    if (input.type !== 'match' || !Number.isInteger(critter) || !Number.isInteger(bot)) return false;
    if (critter! < 0 || critter! >= z.critters.length || bot! < 0 || bot! >= z.bots.length) return false;
    if (b.matched[critter!] !== null || b.matched.includes(bot!) || b.refused.some(([w, r]) => w === critter && r === bot)) return false;
    if (z.answer[critter!] === bot) {
      b.matched[critter!] = bot!;
      b.got++;
      b.note = { text: 'Cousins!', kind: 'good' };
    } else {
      b.refused.push([critter!, bot!]);
      b.triesLeft--;
      b.note = { text: 'Not related!', kind: 'bad' };
    }
    return true;
  },
  phone(z, b, reveal): LookalikeState {
    return { examples: z.examples, critters: z.critters, bots: z.bots, matched: b.matched, refused: b.refused, answer: reveal ? z.answer : null };
  },
  stage(z, reveal) {
    const bot = (t: Traits): Piece => ({ k: 'b', t });
    if (reveal) return [{ pieces: z.critters.flatMap((t, i) => [wumble(t), bot(z.bots[z.answer[i]])]), cols: 6 }];
    return [{ pieces: z.examples.flatMap((e) => [wumble(e.w), bot(e.b)]), cols: 6 }];
  },
});
