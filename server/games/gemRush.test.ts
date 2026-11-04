import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SIZE, STONE, STONE_POINTS, linePoints, linesOn, movesOn } from '../../shared/games/gemRush';
import { addStones, newGems, swapGems, type Gems } from './gemRush';

/** A board with no lines: gems in a pattern that never lines up three, with a sequence that won't either. */
function plain(): Gems {
  const g = newGems(1);
  g.grid = g.grid.map((_, c) => (Math.floor(c / SIZE) + (c % SIZE) * 2) % 4);
  let n = 0;
  g.random = () => ((n++ * 0.37) % 1) * 0.66 + 0.34;
  return g;
}

describe('Gem Rush', () => {
  it('everyone starts on the same board, with a move to make and nothing lined up', () => {
    for (const seed of [1, 2, 3, 99]) {
      const a = newGems(seed);
      assert.deepEqual(a.grid, newGems(seed).grid);
      assert.equal(linesOn(a.grid).length, 0);
      assert.ok(movesOn(a.grid).length > 0);
    }
  });

  it('finds lines across and down, but not of stones', () => {
    const grid = new Array(SIZE * SIZE).fill(0).map((_, c) => (c % 2) + 2 * (Math.floor(c / SIZE) % 2));
    assert.equal(linesOn(grid).length, 0);
    grid[0] = grid[1] = grid[2] = 5;
    grid[SIZE * 3 + 7] = grid[SIZE * 4 + 7] = grid[SIZE * 5 + 7] = grid[SIZE * 6 + 7] = 4;
    assert.deepEqual(linesOn(grid), [[0, 1, 2], [SIZE * 3 + 7, SIZE * 4 + 7, SIZE * 5 + 7, SIZE * 6 + 7]]);
    grid[0] = grid[1] = grid[2] = STONE;
    assert.equal(linesOn(grid).length, 1);
  });

  it('a swap that makes no line goes back; one that does clears, falls and scores', () => {
    const g = plain();
    const before = [...g.grid];
    assert.equal(swapGems(g, 0, 1), null);
    assert.deepEqual(g.grid, before);
    assert.deepEqual(g.rejected, [0, 1]);
    assert.equal(swapGems(g, 0, 9), null, 'not neighbours');
    // Set up a line by hand: two 5s in the bottom row, and a third above the gap next to them.
    const row = SIZE * 7;
    g.grid[row] = g.grid[row + 1] = 5;
    g.grid[row + 2] = 1;
    g.grid[row + 3] = 1;
    g.grid[row - SIZE + 2] = 5;
    const stones = swapGems(g, row + 2, row - SIZE + 2);
    assert.ok(stones !== null);
    assert.ok(g.cleared[0].includes(row) && g.cleared[0].includes(row + 2));
    assert.ok(g.score >= linePoints(3, 1));
    assert.ok(g.steps.length >= 2);
    assert.equal(g.grid.length, SIZE * SIZE);
    assert.ok(g.grid.every((v) => v >= 0 && v <= STONE));
  });

  it('stones beside a line break; battle sends stones for chains and long lines', () => {
    const g = plain();
    const row = SIZE * 7;
    g.grid[row] = g.grid[row + 1] = 5;
    g.grid[row + 2] = 1;
    g.grid[row - SIZE + 2] = 5;
    g.grid[row - SIZE] = STONE;
    swapGems(g, row + 2, row - SIZE + 2);
    assert.ok(g.cleared[0].includes(row - SIZE), 'the stone broke');
    assert.ok(g.gained >= linePoints(3, 1) + STONE_POINTS);
    // A line of four sends one.
    const h = plain();
    h.grid[row] = h.grid[row + 1] = h.grid[row + 3] = 5;
    h.grid[row + 2] = 1;
    h.grid[row - SIZE + 2] = 5;
    assert.ok(swapGems(h, row + 2, row - SIZE + 2)! >= 1);
  });

  it('stones land near the top; a board with no moves left gets shuffled', () => {
    const g = newGems(5);
    addStones(g, 4);
    assert.equal(g.grid.filter((v) => v === STONE).length, 4);
    assert.ok(g.grid.every((v, c) => v !== STONE || c < SIZE * 3));
    assert.ok(movesOn(g.grid).length > 0);
  });
});
