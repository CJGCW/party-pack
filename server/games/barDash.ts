import {
  BAR_DASH,
  BAR_END,
  BAR_START,
  BARS,
  DASH_MS,
  DRINK_MS,
  DRINK_SPEED,
  GLASS_SPEED,
  LIVES,
  PUSH_BACK,
  ROUND_MS,
  SLIDE_SPEED,
  TICK_HZ,
  arrivalsFor,
  type Arrival,
  type BarInput,
  type BarState,
} from '../../shared/games/barDash';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

interface Mover {
  bar: number;
  x: number;
  speed: number;
}

/** A customer: walking on, or served (sliding back to `slideTo`, then drinking until `drinkUntil`). */
interface Customer extends Mover {
  slideTo?: number;
  drinkUntil?: number;
}

export interface Bar {
  arrivals: Arrival[];
  next: number;
  bar: number;
  /** Can pour once here (after dashing over). */
  readyAt: number;
  lives: number;
  served: number;
  customers: Customer[];
  drinks: Mover[];
  glasses: Mover[];
  oops: number;
}

export const newBar = (seed: number): Bar => ({ arrivals: arrivalsFor(seed), next: 0, bar: 0, readyAt: 0, lives: LIVES, served: 0, customers: [], drinks: [], glasses: [], oops: 0 });

/** Dashes to a bar (if not there) and pours a drink down it. */
export function pour(b: Bar, bar: number, ms: number) {
  if (bar !== b.bar) {
    b.bar = bar;
    b.readyAt = ms + DASH_MS;
  }
  b.drinks.push({ bar, x: BAR_END - 20, speed: DRINK_SPEED });
}

function lose(b: Bar) {
  b.lives--;
  b.oops++;
}

/** Moves the bar on by `dt` seconds to `ms` into the round. Returns true when the last life's gone. */
export function stepBar(b: Bar, dt: number, ms: number): boolean {
  while (b.next < b.arrivals.length && b.arrivals[b.next].at <= ms) {
    const a = b.arrivals[b.next++];
    b.customers.push({ bar: a.bar, x: BAR_START, speed: a.speed });
  }
  for (const c of b.customers) {
    if (c.slideTo !== undefined) {
      c.x = Math.max(c.slideTo, c.x - SLIDE_SPEED * dt);
      if (c.x > c.slideTo) continue;
      c.slideTo = undefined;
      c.drinkUntil = ms + DRINK_MS;
    } else if (c.drinkUntil !== undefined) {
      if (ms < c.drinkUntil) continue;
      c.drinkUntil = undefined;
      b.glasses.push({ bar: c.bar, x: c.x, speed: GLASS_SPEED });
    } else c.x += c.speed * dt;
  }
  // Pushed out of the door: gone, and they took the glass with them.
  b.customers = b.customers.filter((c) => c.x > BAR_START);
  for (const d of b.drinks) d.x -= d.speed * dt;
  for (const g of b.glasses) g.x += g.speed * dt;
  // A drink reaching the first thirsty customer on its bar serves them, and it slides them back.
  // Anyone already sliding or drinking lets it go past.
  b.drinks = b.drinks.filter((d) => {
    const thirsty = (c: Customer) => c.slideTo === undefined && c.drinkUntil === undefined;
    const front = b.customers.filter((c) => c.bar === d.bar && thirsty(c) && c.x >= d.x - 4).sort((p, q) => q.x - p.x)[0];
    if (front) {
      front.slideTo = front.x - PUSH_BACK;
      b.served++;
      return false;
    }
    if (d.x < BAR_START - 10) {
      lose(b);
      return false;
    }
    return true;
  });
  // A customer at your end: a life, and that bar clears.
  for (let bar = 0; bar < BARS; bar++) {
    if (!b.customers.some((c) => c.bar === bar && c.x >= BAR_END)) continue;
    lose(b);
    b.customers = b.customers.filter((c) => c.bar !== bar);
  }
  // A glass reaching your end: caught if you're at that bar, else it's broken.
  b.glasses = b.glasses.filter((g) => {
    if (g.x < BAR_END) return true;
    if (g.bar !== b.bar) lose(b);
    return false;
  });
  return b.lives <= 0;
}

class BarDash extends BoardsGame<Bar, BarState, BarState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  protected newBoard(seed: number) {
    return newBar(seed);
  }

  protected stepBoard(b: Bar, dt: number, roundMs: number) {
    return stepBar(b, dt, roundMs);
  }

  protected boardInput(b: Bar, raw: unknown) {
    const input = raw as BarInput;
    if (input.type !== 'pour' || this.phase !== 'play' || !Number.isInteger(input.bar) || input.bar < 0 || input.bar >= BARS) return false;
    const ms = this.roundMs();
    if (ms < b.readyAt && input.bar === b.bar) return false;
    pour(b, input.bar, ms);
    return true;
  }

  protected boardScore(b: Bar) {
    return b.served;
  }

  protected hostState(b: Bar): BarState {
    const flat = (list: Mover[]) => list.flatMap((m) => [m.bar, Math.round(m.x)]);
    return { bar: b.bar, lives: b.lives, served: b.served, customers: flat(b.customers), drinks: flat(b.drinks), glasses: flat(b.glasses), oops: b.oops };
  }

  protected playerState(b: Bar): BarState {
    // The phone doesn't need everything that's moving (it's on the TV): just which bars have a glass coming.
    return { ...this.hostState(b), customers: [], drinks: [], glasses: [...new Set(b.glasses.map((g) => g.bar))].sort() };
  }
}

export const barDash: MiniGameDefinition = {
  info: BAR_DASH,
  create: (ctx, _modeId, options) => new BarDash(ctx, options.puzzles),
};
