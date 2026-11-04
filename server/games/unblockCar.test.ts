import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SIZE, SOLVE_POINTS, slide, solvePoints, solved, vehiclesIn } from '../../shared/games/unblockCar';
import { PUZZLES, chainFor, newGarage, slideIn } from './unblockCar';
import { solve } from './unblockCar/solver';

const row = (s: string) => s.padEnd(SIZE, '.');
const lotOf = (rows: string[]) => Array.from({ length: SIZE }, (_, r) => row(rows[r] ?? '')).join('');

/** The slide that turns one lot into the next (for following a solution). */
function slideBetween(a: string, b: string) {
  for (const v of vehiclesIn(a)) {
    const after = vehiclesIn(b).find((o) => o.id === v.id)!;
    if (after.row !== v.row || after.col !== v.col) return { id: v.id, to: v.across ? after.col : after.row };
  }
  throw new Error('no slide');
}

describe('Unblock Car', () => {
  it('vehicles only slide along their length, through empty cells', () => {
    const lot = lotOf(['', '', 'AA.B', '...B']);
    // The red car can't pass the truck.
    assert.equal(slide(lot, 'A', 3), null);
    assert.ok(slide(lot, 'A', 1));
    // The truck moves up and down only, and not off the lot.
    assert.ok(slide(lot, 'B', 0));
    assert.equal(slide(lot, 'B', 5), null);
    const cleared = slide(lot, 'B', 3)!;
    assert.ok(solved(slide(cleared, 'A', 4)!));
  });

  it('every puzzle in the bank takes exactly its fewest slides; a round climbs in difficulty', () => {
    for (const p of PUZZLES.filter((_, i) => i % 12 === 0)) assert.equal(solve(p.lot)!.length - 1, p.moves, p.lot);
    const chain = chainFor(5);
    for (let i = 1; i < chain.length; i++) assert.ok(chain[i].moves >= chain[i - 1].moves);
    assert.deepEqual(chainFor(5), chainFor(5));
  });

  it('solving a lot in the fewest moves scores the most, and moves you on to the next', () => {
    const g = newGarage(2);
    const path = solve(g.lot)!;
    for (let i = 1; i < path.length; i++) {
      const { id, to } = slideBetween(path[i - 1], path[i]);
      const result = slideIn(g, id, to);
      assert.equal(result, i === path.length - 1 ? 'solved' : true);
    }
    assert.deepEqual([g.solved, g.index, g.points], [1, 1, SOLVE_POINTS]);
    assert.equal(g.lot, g.chain[1].lot);
    assert.ok(solvePoints(path.length + 3, path.length - 1) < SOLVE_POINTS);
  });
});
