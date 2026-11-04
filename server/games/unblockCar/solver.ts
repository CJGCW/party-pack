import { SIZE, slide, solved, vehiclesIn, type Lot } from '../../../shared/games/unblockCar';

/** Every lot one slide (of any length) away. */
function nextLots(lot: Lot): Lot[] {
  const out: Lot[] = [];
  for (const v of vehiclesIn(lot)) {
    for (let to = 0; to + v.length <= SIZE; to++) {
      const next = slide(lot, v.id, to);
      if (next) out.push(next);
    }
  }
  return out;
}

/**
 * The fewest slides that solve a lot, and those slides as the lots in between (breadth first), or
 * null if it can't be solved (or takes more than `limit` slides).
 */
export function solve(lot: Lot, limit = 60): Lot[] | null {
  const parent = new Map<Lot, Lot | null>([[lot, null]]);
  let frontier = [lot];
  for (let depth = 0; depth <= limit && frontier.length; depth++) {
    const next: Lot[] = [];
    for (const l of frontier) {
      if (solved(l)) {
        const path = [l];
        for (let p = parent.get(l); p; p = parent.get(p)) path.unshift(p);
        return path;
      }
      for (const n of nextLots(l)) {
        if (parent.has(n)) continue;
        parent.set(n, l);
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}
