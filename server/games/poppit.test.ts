import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COLS, EMPTY, ROWS, STONE, groupAt, groupPoints, hasMoves, popAndSettle, stonesFor, type Grid } from '../../shared/games/poppit';
import { addStones, bunches, makeField, pop } from './poppit';

/** A grid from rows of letters (A, B, ... are colours; . is empty), padded with empties. */
function gridOf(rows: string[]): Grid {
  const grid: Grid = new Array(COLS * ROWS).fill(EMPTY);
  rows.forEach((row, r) => [...row].forEach((ch, c) => (grid[r * COLS + c] = ch === '.' ? EMPTY : ch.charCodeAt(0) - 65)));
  return grid;
}

describe('Poppit', () => {
  it('a bunch is the touching balloons of one colour; bigger bunches score far more', () => {
    const grid = gridOf(['AAB', 'ABB', 'CCB']);
    assert.deepEqual(groupAt(grid, 0).sort((a, b) => a - b), [0, 1, COLS]);
    assert.equal(groupAt(grid, 2).length, 4);
    assert.deepEqual([2, 3, 10].map(groupPoints), [2, 6, 90]);
  });

  it('balloons float up to fill gaps, and empty columns close up to the left', () => {
    const grid = gridOf(['AB.', 'CB.', 'AD.']);
    const gifts = grid.map(() => false);
    gifts[2 * COLS] = true;
    // Pop the two Bs: column 1 is just D, which floats up; nothing moves sideways.
    const { grid: after, gifts: afterGifts } = popAndSettle(grid, gifts, [1, 1 + COLS]);
    assert.deepEqual([after[0], after[COLS], after[2 * COLS]], [0, 2, 0]);
    assert.equal(after[1], 3, 'D floated to the top');
    assert.equal(afterGifts[2 * COLS], true, 'the gift stays with its balloon');
    // Empty a whole column: the ones to its right close up.
    const cleared = popAndSettle(gridOf(['ABC']), new Array(COLS * ROWS).fill(false), [1]);
    assert.deepEqual([cleared.grid[0], cleared.grid[1]], [0, 2]);
  });

  it('boards always have some big bunches, and the same seed gives everyone the same board', () => {
    for (let seed = 1; seed <= 20; seed++) assert.ok(bunches(makeField(seed).grid, 5) >= 4);
    assert.deepEqual(makeField(9).grid, makeField(9).grid);
  });

  it('popping scores and settles; a single balloon will not pop; the board ends with no pairs left', () => {
    const f = makeField(3);
    const single = f.grid.findIndex((_, c) => groupAt(f.grid, c).length === 1);
    if (single >= 0) assert.equal(pop(f, single), false);
    let pops = 0;
    while (hasMoves(f.grid) && pops < 200) {
      const c = f.grid.findIndex((_, i) => groupAt(f.grid, i).length >= 2);
      assert.equal(pop(f, c), true);
      pops++;
    }
    assert.ok(f.score > 0 && !hasMoves(f.grid));
  });

  it('duel: a bunch of 8 or more sends stones, which arrive under the balloons and can never pop', () => {
    assert.deepEqual([7, 8, 11, 12].map(stonesFor), [0, 4, 5, 6]);
    const grid = gridOf(['AAB', 'ABA', 'BAB']);
    assert.equal(addStones(grid, 3), 0);
    assert.equal(grid.filter((c) => c === STONE).length, 3);
    for (let col = 3; col < COLS; col++) assert.equal(grid[col], EMPTY, 'empty columns get none');
    assert.deepEqual(groupAt(gridOf(['EE']), 0), [], 'stones are never a bunch');
    assert.equal(hasMoves(gridOf(['EE', 'EE'])), false);
    // Stones float up with the rest.
    const { grid: after } = popAndSettle(gridOf(['AA', 'EB']), new Array(COLS * ROWS).fill(false), [0, 1]);
    assert.deepEqual([after[0], after[1]], [STONE, 1]);
  });
});
