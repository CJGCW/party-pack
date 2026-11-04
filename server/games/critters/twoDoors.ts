import { wumble, type Traits } from '../../../shared/critters';
import { TWO_DOORS, TWO_DOORS_LEVELS, type DoorsState } from '../../../shared/games/critterGames';
import { critterGame, randInt, randomTraits, sameTraits, shuffled, type Board } from './engine';

export interface DoorsPuzzle {
  doors: number;
  critters: Traits[];
  answer: number[];
}
interface DoorsBoard extends Board {
  door: (number | null)[];
  refused: number[][];
}

/** The rule behind a level: which door a Wumble belongs to. */
function makeRule(level: number): (t: Traits) => number {
  const [a, b, c] = shuffled([0, 1, 2, 3]);
  const v = randInt(5);
  if (level === 1) return (t) => (t[a] === v ? 0 : 1);
  if (level === 2) {
    const w = (v + 1 + randInt(4)) % 5;
    return (t) => (t[a] === v || t[a] === w ? 0 : 1);
  }
  const w = randInt(5);
  if (level === 3) return (t) => (t[a] === v || t[b] === w ? 0 : 1);
  return (t) => (t[b] === w ? 0 : 1) * 2 + (t[c] === v ? 0 : 1);
}

export function makeDoors(level: number): DoorsPuzzle {
  const doorFor = makeRule(level);
  const quota = level === 4 ? [4, 4, 4, 4] : [6, 10];
  const found: Traits[] = [];
  while (quota.some((q) => q > 0)) {
    const t = randomTraits();
    const door = doorFor(t);
    if (quota[door] === 0 || found.some((f) => sameTraits(f, t))) continue;
    quota[door]--;
    found.push(t);
  }
  const critters = shuffled(found);
  return { doors: level === 4 ? 4 : 2, critters, answer: critters.map(doorFor) };
}

export const twoDoors = critterGame<DoorsPuzzle, DoorsBoard>({
  info: TWO_DOORS,
  levels: TWO_DOORS_LEVELS,
  make: makeDoors,
  board: (z) => ({ got: 0, goal: z.critters.length, door: z.critters.map(() => null), refused: z.critters.map(() => []) }),
  input(z, b, raw) {
    const input = raw as { type?: string; critter?: number; door?: number };
    const { critter, door } = input;
    if (input.type !== 'send' || !Number.isInteger(critter) || !Number.isInteger(door)) return false;
    if (critter! < 0 || critter! >= z.critters.length || door! < 0 || door! >= z.doors || b.door[critter!] !== null) return false;
    if (b.refused[critter!].includes(door!)) return false;
    if (z.answer[critter!] === door) {
      b.door[critter!] = door!;
      b.got++;
      b.note = { text: 'Through!', kind: 'good' };
    } else {
      b.refused[critter!].push(door!);
      b.triesLeft--;
      b.note = { text: 'Bounced off!', kind: 'bad' };
    }
    return true;
  },
  phone(z, b, reveal): DoorsState {
    return {
      doors: z.doors,
      critters: z.critters.map((t, i) => ({ t, door: b.door[i], refused: b.refused[i] })),
      answer: reveal ? z.answer : null,
    };
  },
  stage(z, reveal) {
    if (!reveal) return [{ pieces: z.critters.map((t) => wumble(t)), cols: 8 }];
    return Array.from({ length: z.doors }, (_, door) => ({
      label: `Door ${'ABCD'[door]}`,
      pieces: z.critters.filter((_, i) => z.answer[i] === door).map((t) => wumble(t)),
      cols: z.doors === 4 ? 2 : 4,
    }));
  },
});
