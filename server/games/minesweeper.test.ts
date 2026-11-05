import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COLS, MINES, MINE_LOCK_MS, ROWS, neighbours } from '../../shared/games/minesweeper';
import { makeMinefield, newSweeper, reveal } from './minesweeper';

describe('Mine Dash chords', () => {
  it('a number with the right flags round it digs the rest', () => {
    for (let seed = 1; seed < 50; seed++) {
      const s = newSweeper(seed);
      const c = s.uncovered.findIndex((up, i) => up && s.field.counts[i] > 0 && neighbours(i).some((n) => !s.uncovered[n] && !s.field.mines[n]));
      if (c < 0) continue;
      const before = s.count;
      assert.equal(reveal(s, c, 0), false, 'not enough flags');
      for (const n of neighbours(c)) if (s.field.mines[n]) s.flagged[n] = true;
      assert.ok(reveal(s, c, 0));
      assert.ok(s.count > before);
      assert.equal(s.booms, 0);
      return;
    }
    assert.fail('no board to test');
  });

  it('a wrong flag digs up a mine', () => {
    for (let seed = 1; seed < 200; seed++) {
      const s = newSweeper(seed);
      for (let c = 0; c < COLS * ROWS; c++) {
        if (!s.uncovered[c] || !s.field.counts[c]) continue;
        const covered = neighbours(c).filter((n) => !s.uncovered[n]);
        const safe = covered.filter((n) => !s.field.mines[n]);
        const mines = covered.filter((n) => s.field.mines[n]);
        if (!safe.length || !mines.length) continue;
        // As many flags as the number says, but one on a safe square instead of a mine.
        for (const n of [safe[0], ...mines.slice(1)]) s.flagged[n] = true;
        reveal(s, c, 0);
        assert.equal(s.booms, 1);
        return;
      }
    }
    assert.fail('no board to test');
  });
});

describe('Mine Dash', () => {
  it('the same seed gives the same field, with the right number of mines and an opening with none round it', () => {
    const a = makeMinefield(4);
    assert.deepEqual(a, makeMinefield(4));
    assert.equal(a.mines.filter(Boolean).length, MINES);
    assert.equal(a.counts[a.opening], 0);
    assert.ok(!a.mines[a.opening]);
    for (let c = 0; c < COLS * ROWS; c++) assert.equal(a.counts[c], neighbours(c).filter((n) => a.mines[n]).length);
  });

  it('starts with the opening uncovered; a mine locks the board; uncovering every safe square finishes', () => {
    const s = newSweeper(7);
    assert.ok(s.count > 1, 'the opening spreads');
    const mine = s.field.mines.indexOf(true);
    assert.equal(reveal(s, mine, 1000), true);
    assert.equal(s.booms, 1);
    // Locked: nothing happens until the wait's over.
    const safe = s.field.mines.findIndex((m, c) => !m && !s.uncovered[c]);
    assert.equal(reveal(s, safe, 1000 + MINE_LOCK_MS - 1), false);
    let result: 'done' | boolean = false;
    for (let c = 0; c < COLS * ROWS; c++) if (!s.field.mines[c] && !s.uncovered[c]) result = reveal(s, c, 1000 + MINE_LOCK_MS);
    assert.equal(result, 'done');
  });
});
