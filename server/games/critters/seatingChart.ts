import { wumble, type Traits } from '../../../shared/critters';
import { SEATING_CHART, SEATING_LEVELS, type SeatEdge, type SeatingState } from '../../../shared/games/critterGames';
import { critterGame, pickOne, randomTraits, sameTraits, sharedTraits, shuffled, type Board } from './engine';

export interface SeatingPuzzle {
  rows: number;
  cols: number;
  edges: SeatEdge[];
  critters: Traits[];
  /** A seating that works: who's in each seat. */
  answer: number[];
}
interface SeatingBoard extends Board {
  seats: (number | null)[];
}

/** Everyone in their seats, each sharing something with the neighbours already placed. */
function seatEveryone(rows: number, cols: number, edges: SeatEdge[]): Traits[] {
  for (;;) {
    const seated: Traits[] = [];
    for (let seat = 0; seat < rows * cols; seat++) {
      const before = edges.filter((e) => e.b === seat).map((e) => seated[e.a]);
      for (let attempt = 0; attempt < 800 && seated.length === seat; attempt++) {
        const t = randomTraits();
        if (!seated.some((s) => sameTraits(s, t)) && before.every((n) => sharedTraits(n, t).length > 0)) seated.push(t);
      }
      if (seated.length === seat) break;
    }
    if (seated.length === rows * cols) return seated;
  }
}

export function makeSeating(level: number): SeatingPuzzle {
  const { rows, cols, tags } = SEATING_LEVELS[level - 1];
  const edges: SeatEdge[] = [];
  for (let seat = 0; seat < rows * cols; seat++) {
    if ((seat + 1) % cols) edges.push({ a: seat, b: seat + 1, tag: null });
    if (seat + cols < rows * cols) edges.push({ a: seat, b: seat + cols, tag: null });
  }
  const seated = seatEveryone(rows, cols, edges);
  if (tags) for (const e of edges) e.tag = pickOne(sharedTraits(seated[e.a], seated[e.b]));
  const order = shuffled(seated.map((_, i) => i));
  const answer: number[] = [];
  order.forEach((seat, i) => (answer[seat] = i));
  return { rows, cols, edges, critters: order.map((seat) => seated[seat]), answer };
}

/** Whether Wumble `who` can sit in `seat` beside those already seated. */
export function fits(z: SeatingPuzzle, seats: (number | null)[], who: number, seat: number) {
  return z.edges.every((e) => {
    if (e.a !== seat && e.b !== seat) return true;
    const other = seats[e.a === seat ? e.b : e.a];
    if (other === null) return true;
    const shared = sharedTraits(z.critters[who], z.critters[other]);
    return e.tag === null ? shared.length > 0 : shared.includes(e.tag);
  });
}

export const seatingChart = critterGame<SeatingPuzzle, SeatingBoard>({
  info: SEATING_CHART,
  levels: SEATING_LEVELS,
  make: makeSeating,
  board: (z) => ({ got: 0, goal: z.critters.length, seats: z.critters.map(() => null) }),
  input(z, b, raw) {
    const input = raw as { type?: string; critter?: number; seat?: number };
    const { critter, seat } = input;
    if (!Number.isInteger(seat) || seat! < 0 || seat! >= b.seats.length) return false;
    if (input.type === 'stand') {
      if (b.seats[seat!] === null) return false;
      b.seats[seat!] = null;
      b.got--;
      b.note = null;
      return true;
    }
    if (input.type !== 'sit' || !Number.isInteger(critter) || critter! < 0 || critter! >= z.critters.length) return false;
    if (b.seats[seat!] !== null || b.seats.includes(critter!)) return false;
    if (fits(z, b.seats, critter!, seat!)) {
      b.seats[seat!] = critter!;
      b.got++;
      b.note = { text: 'Comfy!', kind: 'good' };
    } else {
      b.triesLeft--;
      b.note = { text: "They don't get along!", kind: 'bad' };
    }
    return true;
  },
  phone(z, b, reveal): SeatingState {
    return { rows: z.rows, cols: z.cols, edges: z.edges, critters: z.critters, seats: b.seats, answer: reveal ? z.answer : null };
  },
  stage(z, reveal) {
    return [{ pieces: reveal ? z.answer.map((i) => wumble(z.critters[i])) : z.critters.map((t) => wumble(t)), cols: reveal ? z.cols : Math.min(z.critters.length, 6) }];
  },
});
