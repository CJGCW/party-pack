import { wumble, type Traits } from '../../../shared/critters';
import { SWITCHBACK, SWITCH_LEVELS, type Gate, type SwitchState } from '../../../shared/games/critterGames';
import { critterGame, pickOne, randInt, randomTraits, sameTraits, shuffled, type Board } from './engine';

export interface SwitchPuzzle {
  depth: number;
  gates: Gate[];
  exits: boolean[];
  critters: Traits[];
  answer: number[];
}
interface SwitchBoard extends Board {
  flipped: boolean[];
  home: boolean[];
  last: SwitchState['last'];
}

/** Runs a Wumble down the track, flipping switches on the way. */
export function run(z: { gates: Gate[] }, flipped: boolean[], t: Traits) {
  const gates: number[] = [];
  let node = 0;
  while (node < z.gates.length) {
    gates.push(node);
    const gate = z.gates[node];
    let right: boolean;
    if (gate.kind === 'test') right = t[gate.trait] !== gate.value;
    else {
      right = flipped[node];
      flipped[node] = !flipped[node];
    }
    node = 2 * node + (right ? 2 : 1);
  }
  return { gates, exit: node - z.gates.length };
}

/** An order that gets them all home, if there is one. */
export function solve(z: { gates: Gate[]; exits: boolean[]; critters: Traits[] }, flipped = z.gates.map(() => false), left = z.critters.map((_, i) => i)): number[] | null {
  if (!left.length) return [];
  for (const who of left) {
    const after = [...flipped];
    if (!z.exits[run(z, after, z.critters[who]).exit]) continue;
    const rest = solve(z, after, left.filter((w) => w !== who));
    if (rest) return [who, ...rest];
  }
  return null;
}

export function makeSwitch(level: number): SwitchPuzzle {
  const { depth, critters: count, switches } = SWITCH_LEVELS[level - 1];
  const gateCount = 2 ** depth - 1;
  for (;;) {
    const critters: Traits[] = [];
    while (critters.length < count) {
      const t = randomTraits();
      if (!critters.some((c) => sameTraits(c, t))) critters.push(t);
    }
    const flipping = shuffled(Array.from({ length: gateCount }, (_, i) => i)).slice(0, switches);
    const gates: Gate[] = Array.from({ length: gateCount }, (_, i) => {
      if (flipping.includes(i)) return { kind: 'switch' };
      const trait = randInt(4);
      return { kind: 'test', trait, value: pickOne(critters)[trait] };
    });
    const exits = Array.from({ length: gateCount + 1 }, () => Math.random() < 0.55);
    const z = { depth, gates, exits, critters };
    const answer = solve(z);
    if (!answer) continue;
    // There has to be something to work out: most orders mustn't work.
    const failing = Array.from({ length: 12 }, () => shuffled(critters)).filter((order) => {
      const flipped = gates.map(() => false);
      return order.some((t) => !exits[run(z, flipped, t).exit]);
    }).length;
    if (failing >= 8) return { ...z, answer };
  }
}

export const switchback = critterGame<SwitchPuzzle, SwitchBoard>({
  info: SWITCHBACK,
  levels: SWITCH_LEVELS,
  make: makeSwitch,
  board: (z) => ({ got: 0, goal: z.critters.length, flipped: z.gates.map(() => false), home: z.critters.map(() => false), last: null }),
  input(z, b, raw) {
    const input = raw as { type?: string; critter?: number };
    const { critter } = input;
    if (input.type !== 'send' || !Number.isInteger(critter) || critter! < 0 || critter! >= z.critters.length || b.home[critter!]) return false;
    const { gates, exit } = run(z, b.flipped, z.critters[critter!]);
    b.last = { critter: critter!, gates, exit };
    if (z.exits[exit]) {
      b.home[critter!] = true;
      b.got++;
      b.note = { text: 'Home!', kind: 'good' };
    } else {
      b.triesLeft--;
      b.note = { text: 'Dead end! Back to the start.', kind: 'bad' };
    }
    return true;
  },
  phone(z, b, reveal): SwitchState {
    return {
      depth: z.depth,
      gates: z.gates,
      flipped: b.flipped,
      exits: z.exits,
      critters: z.critters.map((t, i) => ({ t, home: b.home[i] })),
      last: b.last,
      answer: reveal ? z.answer : null,
    };
  },
  stage(z, reveal) {
    return [{ label: reveal ? 'An order that works' : undefined, pieces: (reveal ? z.answer.map((i) => z.critters[i]) : z.critters).map((t) => wumble(t)) }];
  },
});
