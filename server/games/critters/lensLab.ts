import { wumble, type Traits } from '../../../shared/critters';
import { LENS_LAB, LENS_LEVELS, type LensState } from '../../../shared/games/critterGames';
import { critterGame, randInt, sameTraits, shuffled, type Board } from './engine';

/** A lens swaps two options of a trait (and, with `only`, only for Wumbles with that option). */
export interface Lens {
  trait: number;
  a: number;
  b: number;
  only?: { trait: number; value: number };
}
export interface LensPuzzle {
  lenses: Lens[];
  pool: Traits[];
  targets: Traits[];
  /** By target: who comes out looking like it. */
  sources: number[];
}
interface LensBoard extends Board {
  gone: boolean[];
  done: boolean[];
  tests: { from: Traits; to: Traits; hit: boolean }[];
}

export function throughLenses(lenses: Lens[], t: Traits): Traits {
  const out = [...t];
  for (const l of lenses) {
    if (l.only && out[l.only.trait] !== l.only.value) continue;
    if (out[l.trait] === l.a) out[l.trait] = l.b;
    else if (out[l.trait] === l.b) out[l.trait] = l.a;
  }
  return out;
}

export function makeLens(level: number): LensPuzzle {
  const spec = LENS_LEVELS[level - 1];
  const order = shuffled([0, 1, 2, 3]);
  const lenses: Lens[] = order.slice(0, spec.lenses).map((trait) => {
    const [a, b] = shuffled([0, 1, 2, 3, 4]);
    return { trait, a, b };
  });
  // Each Wumble's traits come from a few options, and always the two a lens swaps.
  const options = [0, 1, 2, 3].map((trait) => {
    const lens = lenses.find((l) => l.trait === trait);
    return lens ? [lens.a, lens.b] : shuffled([0, 1, 2, 3, 4]).slice(0, 3);
  });
  if (spec.conditional) {
    const free = order[spec.lenses];
    lenses[randInt(lenses.length)].only = { trait: free, value: options[free][0] };
  }
  const roll = () => options.map((o) => o[randInt(o.length)]);
  for (;;) {
    const pool: Traits[] = [];
    for (let i = 0; i < 400 && pool.length < spec.pool; i++) {
      const t = roll();
      if (!pool.some((p) => sameTraits(p, t))) pool.push(t);
    }
    if (pool.length < spec.pool) continue;
    const outs = pool.map((t) => throughLenses(lenses, t));
    const sources = shuffled(pool.map((_, i) => i)).slice(0, spec.targets);
    // Only those picked may come out looking like a target.
    if (outs.some((o, i) => !sources.includes(i) && sources.some((s) => sameTraits(outs[s], o)))) continue;
    if (new Set(sources.map((s) => outs[s].join())).size < sources.length) continue;
    return { lenses, pool, targets: sources.map((s) => outs[s]), sources };
  }
}

export const lensLab = critterGame<LensPuzzle, LensBoard>({
  info: LENS_LAB,
  levels: LENS_LEVELS,
  make: makeLens,
  board: (z) => ({ got: 0, goal: z.targets.length, gone: z.pool.map(() => false), done: z.targets.map(() => false), tests: [] }),
  input(z, b, raw) {
    const input = raw as { type?: string; critter?: number };
    const { critter } = input;
    if (input.type !== 'send' || !Number.isInteger(critter) || critter! < 0 || critter! >= z.pool.length || b.gone[critter!]) return false;
    const from = z.pool[critter!];
    const to = throughLenses(z.lenses, from);
    const hit = z.targets.findIndex((t, i) => !b.done[i] && sameTraits(t, to));
    if (hit >= 0) {
      b.done[hit] = true;
      b.gone[critter!] = true;
      b.got++;
      b.note = { text: "That's the one!", kind: 'good' };
    } else {
      b.triesLeft--;
      b.note = { text: "That's nobody we're after.", kind: 'bad' };
    }
    b.tests.unshift({ from, to, hit: hit >= 0 });
    return true;
  },
  phone(z, b, reveal): LensState {
    return {
      lenses: z.lenses.length,
      pool: z.pool.map((t, i) => (b.gone[i] ? null : t)),
      targets: z.targets.map((t, i) => ({ t, done: b.done[i] })),
      tests: b.tests,
      answer: reveal ? z.sources.map((s) => z.pool[s]) : null,
    };
  },
  stage(z, reveal) {
    return [
      { pieces: reveal ? z.sources.map((s) => wumble(z.pool[s])) : z.pool.map((t) => wumble(t)), cols: reveal ? z.targets.length : 5 },
      { pieces: z.lenses.map(() => ({ k: 'e' as const, e: '🔍' })) },
      { pieces: z.targets.map((t) => wumble(t)), cols: z.targets.length },
    ];
  },
});
