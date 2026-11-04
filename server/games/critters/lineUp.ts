import { wumble, type Piece, type Traits } from '../../../shared/critters';
import { LINE_UP, LINE_UP_LEVELS, type Ladder, type LineUpState } from '../../../shared/games/critterGames';
import { critterGame, randInt, shuffled, type Board } from './engine';

export interface LineUpPuzzle {
  critters: Traits[];
  /** The right order: who's in each place. */
  answer: number[];
  ladders: Ladder[];
}
interface LineUpBoard extends Board {
  line: number[];
  marks: boolean[];
}

export function makeLineUp(level: number): LineUpPuzzle {
  const { count, primary, secondary, gaps } = LINE_UP_LEVELS[level - 1];
  const [first, second] = shuffled([0, 1, 2, 3]);
  const firstOrder = shuffled([0, 1, 2, 3, 4]).slice(0, primary);
  const secondOrder = shuffled([0, 1, 2, 3, 4]).slice(0, Math.max(1, secondary));
  const slots = shuffled(firstOrder.flatMap((a) => secondOrder.map((b) => [a, b])))
    .slice(0, count)
    .sort(([a1, b1], [a2, b2]) => firstOrder.indexOf(a1) - firstOrder.indexOf(a2) || secondOrder.indexOf(b1) - secondOrder.indexOf(b2));
  const inOrder = slots.map(([a, b]) => {
    const t = [randInt(5), randInt(5), randInt(5), randInt(5)];
    t[first] = a;
    if (secondary) t[second] = b;
    return t;
  });
  const shown = shuffled(inOrder.map((_, i) => i));
  const critters = shown.map((i) => inOrder[i]);
  const answer = inOrder.map((_, place) => shown.indexOf(place));
  const ladder = (trait: number, values: number[], gap: number): Ladder => {
    const hidden = shuffled(values.map((_, i) => i)).slice(0, gap);
    return { trait, values: values.map((v, i) => (hidden.includes(i) ? null : v)) };
  };
  return { critters, answer, ladders: [ladder(first, firstOrder, gaps[0]), ...(secondary ? [ladder(second, secondOrder, gaps[1])] : [])] };
}

function startLine(z: LineUpPuzzle) {
  for (;;) {
    const line = shuffled(z.answer);
    if (line.every((who, i) => who !== z.answer[i])) return line;
  }
}

/** A chip showing one trait's option, or a question mark for a gap in the clue. */
export function chip(trait: number, value: number | null): Piece {
  if (value === null) return { k: 'e', e: '❓' };
  const t = [-1, -1, -1, -1];
  t[trait] = value;
  return wumble(t);
}

export const lineUp = critterGame<LineUpPuzzle, LineUpBoard>({
  info: LINE_UP,
  levels: LINE_UP_LEVELS,
  make: makeLineUp,
  board: (z) => ({ got: 0, goal: z.critters.length, line: startLine(z), marks: z.critters.map(() => false) }),
  input(z, b, raw) {
    const input = raw as { type?: string; a?: number; b?: number };
    if (input.type === 'check') {
      b.marks = b.line.map((who, i) => who === z.answer[i]);
      b.got = b.marks.filter(Boolean).length;
      if (b.got < b.goal) b.triesLeft--;
      b.note = b.got === b.goal ? { text: 'Perfect!', kind: 'good' } : { text: 'Those lit up are in the right place.', kind: '' };
      return true;
    }
    const { a, b: c } = input;
    const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < b.line.length;
    if (input.type !== 'swap' || !ok(a) || !ok(c) || a === c) return false;
    [b.line[a!], b.line[c!]] = [b.line[c!], b.line[a!]];
    b.marks[a!] = b.marks[c!] = false;
    b.note = null;
    return true;
  },
  phone(z, b, reveal): LineUpState {
    return { critters: z.critters, line: b.line, marks: b.marks, ladders: z.ladders, answer: reveal ? z.answer : null };
  },
  stage(z, reveal) {
    if (reveal) return [{ pieces: z.answer.map((i) => wumble(z.critters[i])) }];
    return [{ pieces: z.critters.map((t) => wumble(t)), cols: 4 }, ...z.ladders.map((l) => ({ pieces: l.values.map((v) => chip(l.trait, v)), cols: 1 }))];
  },
});
