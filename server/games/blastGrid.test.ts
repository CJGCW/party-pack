import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FALL_AT_MS, FALL_EVERY_MS, FLAME_MS, FUSE_MS, START_RANGE, TICK_HZ, isWall } from '../../shared/games/blastGrid';
import { dropBomb, newYard, run, type Yard } from './blastGrid';

const DT = 1 / TICK_HZ;
const TICK_MS = 1000 / TICK_HZ;

/** An empty yard (no crates), for setting up by hand. */
function emptyYard(players: string[]) {
  const y = newYard(1, players);
  y.cells = y.cells.map((c) => (c === '#' ? '#' : '.'));
  y.hidden.clear();
  return y;
}

function ticks(y: Yard, from: number, n: number) {
  const out: string[] = [];
  let ms = from;
  for (let i = 0; i < n; i++) {
    ms += TICK_MS;
    out.push(...run(y, DT, ms));
  }
  return { ms, out };
}

describe('Blast Grid', () => {
  it('the same seed lays out the same yard, with room round every start', () => {
    const a = newYard(7, ['a', 'b', 'c', 'd']);
    const b = newYard(7, ['a', 'b', 'c', 'd']);
    assert.deepEqual(a.cells, b.cells);
    assert.ok(a.cells.includes('+'), 'has crates');
    for (const p of a.bombers) {
      assert.equal(a.cells[p.y * a.cols + p.x], '.');
      const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => a.cells[(p.y + dy) * a.cols + p.x + dx] === '.');
      assert.ok(exits.length >= 2, 'two ways out');
    }
    assert.equal(newYard(1, Array.from({ length: 6 }, (_, i) => `p${i}`)).cols, 17, 'bigger yard for more players');
  });

  it('walks along open lanes and stops at pillars, sliding round corners', () => {
    const y = emptyYard(['a']);
    const b = y.bombers[0];
    b.stick = { x: 1, y: 0 };
    ticks(y, 0, 10);
    assert.ok(b.x > 2 && b.y === 1, `walked right to ${b.x}`);
    // Down from between columns: slides onto the nearest open column first.
    Object.assign(b, { x: 2.8, y: 1 });
    b.stick = { x: 0, y: 1 };
    ticks(y, 0, 10);
    assert.equal(b.x, 3);
    assert.ok(b.y > 1.5);
    // Into a pillar: stops in the middle of the cell before it.
    Object.assign(b, { x: 2, y: 1 });
    b.stick = { x: 0, y: 1 };
    ticks(y, 0, 10);
    assert.deepEqual([b.x, b.y], [2, 1]);
    assert.ok(isWall(2, 2, y.cols, y.rows));
  });

  it('a bomb blasts in a cross, smashes the first crate, and catches anyone in range', () => {
    const y = emptyYard(['bomber', 'victim', 'safe']);
    const [a, v, s] = y.bombers;
    Object.assign(a, { x: 1, y: 1 });
    Object.assign(v, { x: 1, y: 1 + START_RANGE });
    Object.assign(s, { x: 1 + START_RANGE + 2, y: 1 });
    y.cells[1 * y.cols + 3] = '+';
    y.cells[1 * y.cols + 4] = 'f';
    assert.ok(dropBomb(y, a, 0));
    assert.ok(!dropBomb(y, a, 0), 'one at a time');
    // The bomber can walk off it; it blocks everyone else.
    a.stick = { x: 1, y: 0 };
    ticks(y, 0, 6);
    assert.ok(a.x > 1);
    a.stick = { x: 0, y: 0 };
    Object.assign(a, { x: 1, y: 1 + START_RANGE + 2 });
    const { out } = ticks(y, 0, Math.ceil(FUSE_MS / TICK_MS) + 1);
    assert.deepEqual(out, ['victim']);
    assert.equal(y.cells[1 * y.cols + 3], '.', 'crate smashed');
    assert.equal(y.cells[1 * y.cols + 4], 'f', 'the crate shielded what was behind it');
    assert.equal(a.crates, 1);
  });

  it('bombs set each other off, and flames die down', () => {
    const y = emptyYard(['a', 'b']);
    const [a, b] = y.bombers;
    Object.assign(a, { x: 1, y: 1 });
    Object.assign(b, { x: 3, y: 1 });
    dropBomb(y, a, 0);
    dropBomb(y, b, 1000);
    Object.assign(a, { x: 1, y: 7 });
    Object.assign(b, { x: 7, y: 7 });
    const { ms } = ticks(y, 0, Math.ceil(FUSE_MS / TICK_MS) + 1);
    assert.equal(y.bombs.length, 0, 'both went off together');
    ticks(y, ms, Math.ceil(FLAME_MS / TICK_MS) + 1);
    assert.equal(y.flames.size, 0);
  });

  it('late on, blocks fall in from the edge and crush whoever is there', () => {
    const y = emptyYard(['a', 'b']);
    const [a, b] = y.bombers;
    Object.assign(a, { x: 1, y: 1 });
    Object.assign(b, { x: 5, y: 5 });
    const { out } = ticks(y, FALL_AT_MS - TICK_MS, 2);
    assert.deepEqual(out, ['a']);
    ticks(y, FALL_AT_MS, (10 * FALL_EVERY_MS) / TICK_MS);
    assert.ok(y.fallen >= 10);
    assert.equal(b.alive, true);
  });
});
