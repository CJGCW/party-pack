import { wumble, type Traits } from '../../../shared/critters';
import { PICKY_EATER, PICKY_LEVELS, TOPPINGS, type PickyReply, type PickyState } from '../../../shared/games/critterGames';
import { critterGame, randomTraits, sameTraits, shuffled, type Board } from './engine';

export interface PickyPuzzle {
  toppings: string[];
  customers: Traits[];
  wants: number[][];
}
interface PickyBoard extends Board {
  orders: { picks: number[]; reply: PickyReply }[];
}

export function makePicky(level: number): PickyPuzzle {
  const spec = PICKY_LEVELS[level - 1];
  const toppings = shuffled(TOPPINGS).slice(0, spec.toppings);
  const customers: Traits[] = [];
  while (customers.length < spec.customers) {
    const t = randomTraits();
    if (!customers.some((c) => sameTraits(c, t))) customers.push(t);
  }
  const all = toppings.map((_, i) => i);
  return { toppings, customers, wants: customers.map(() => shuffled(all).slice(0, spec.wants).sort((a, b) => a - b)) };
}

/** What a customer says to a plate. */
export function replyTo(wants: number[], picks: number[]): PickyReply {
  if (picks.some((p) => !wants.includes(p))) return 'yuck';
  return picks.length === wants.length ? 'yum' : 'more';
}

export const pickyEater = critterGame<PickyPuzzle, PickyBoard>({
  info: PICKY_EATER,
  levels: PICKY_LEVELS,
  make: makePicky,
  board: (z) => ({ got: 0, goal: z.customers.length, orders: [] }),
  input(z, b, raw) {
    const input = raw as { type?: string; picks?: number[] };
    if (input.type !== 'serve' || !Array.isArray(input.picks) || b.got >= b.goal) return false;
    const picks = [...new Set(input.picks)].filter((p) => Number.isInteger(p) && p >= 0 && p < z.toppings.length).sort((x, y) => x - y);
    if (!picks.length) return false;
    const reply = replyTo(z.wants[b.got], picks);
    b.triesLeft--;
    if (reply === 'yum') {
      b.got++;
      b.orders = [];
      b.note = { text: 'Yum!', kind: 'good' };
    } else {
      b.orders.push({ picks, reply });
      b.note = reply === 'more' ? { text: '"More!"', kind: '' } : { text: '"Yuck!"', kind: 'bad' };
    }
    return true;
  },
  phone(z, b, reveal): PickyState {
    return { toppings: z.toppings, customers: z.customers, serving: b.got, orders: b.orders, wants: reveal ? z.wants : null };
  },
  stage(z, reveal) {
    return z.customers.map((t, i) => ({
      pieces: [wumble(t), ...(reveal ? z.wants[i].map((w) => ({ k: 'e' as const, e: z.toppings[w] })) : [])],
    }));
  },
});
