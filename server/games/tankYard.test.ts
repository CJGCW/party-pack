import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BLOCK, HIT_SAFE_MS, HITS, LAYOUTS, RELOAD_MS, TANK_R, TICK_HZ } from '../../shared/games/tankYard';
import { fire, newYard, roll, type Yard } from './tankYard';

const DT = 1 / TICK_HZ;
const TICK_MS = 1000 / TICK_HZ;

function ticks(y: Yard, from: number, n: number) {
  const out: string[] = [];
  let ms = from;
  for (let i = 0; i < n; i++) {
    ms += TICK_MS;
    out.push(...roll(y, DT, ms));
  }
  return { ms, out };
}

describe('Tank Yard', () => {
  it('every yard is 16 × 9, walled round, with eight starts well apart, all reachable', () => {
    for (const rows of LAYOUTS) {
      assert.equal(rows.length, 9);
      for (const row of rows) assert.equal(row.length, 16, row);
      assert.ok(rows[0].split('').every((c) => c === '#') && rows[8].split('').every((c) => c === '#'));
      assert.ok(rows.every((row) => row[0] === '#' && row[15] === '#'));
      const starts: [number, number][] = [];
      for (let n = 1; n <= 8; n++) {
        const y = rows.findIndex((row) => row.includes(String(n)));
        assert.ok(y >= 0, `start ${n}`);
        starts.push([rows[y].indexOf(String(n)), y]);
      }
      for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) assert.ok(Math.hypot(starts[i][0] - starts[j][0], starts[i][1] - starts[j][1]) >= 2, `starts ${i + 1} and ${j + 1} too close`);
      // Flood from the first start: every open cell's reachable.
      const seen = new Set([starts[0].join()]);
      const todo = [starts[0]];
      while (todo.length) {
        const [x, y] = todo.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${x + dx},${y + dy}`;
          if (rows[y + dy][x + dx] !== '#' && !seen.has(k)) seen.add(k) && todo.push([x + dx, y + dy]);
        }
      }
      const open = rows.join('').split('').filter((c) => c !== '#').length;
      assert.equal(seen.size, open);
    }
  });

  it('a tank turns to face the stick, then drives; walls stop it', () => {
    const y = newYard(0, ['a']);
    const t = y.tanks[0];
    Object.assign(t, { x: 150, y: 150, heading: 0 });
    t.stick = { x: 0, y: 1 };
    ticks(y, 0, 30);
    assert.ok(Math.abs(t.heading - Math.PI / 2) < 0.01, 'facing down');
    assert.ok(t.y > 200);
    t.stick = { x: -1, y: 0 };
    ticks(y, 0, 60);
    assert.ok(Math.abs(t.x - (BLOCK + TANK_R)) < 1, `against the left wall at ${t.x}`);
  });

  it('shells bounce once off a wall, then burst; three hits put a tank out', () => {
    const y = newYard(0, ['shooter', 'target']);
    const [a, b] = y.tanks;
    // Fire at the wall to the left: it comes back past the shooter (who's moved) and bursts on the right.
    Object.assign(a, { x: 450, y: 150, heading: Math.PI });
    Object.assign(b, { x: 1300, y: 750 });
    fire(y, a, 0);
    a.y = 250;
    let { ms } = ticks(y, 0, 25);
    assert.equal(y.shells[0].bounces, 1);
    assert.ok(y.shells[0].vx > 0, 'coming back');
    ({ ms } = ticks(y, ms, 60));
    assert.equal(y.shells.length, 0, 'gone after its second wall');
    // Three shots straight at the target, spaced out past its safe time.
    Object.assign(a, { x: 1000, y: 750, heading: 0 });
    let out: string[] = [];
    for (let shot = 0; shot < HITS; shot++) {
      ms += Math.max(RELOAD_MS, HIT_SAFE_MS);
      assert.ok(fire(y, a, ms));
      const r = ticks(y, ms, 30);
      out = out.concat(r.out);
      ms = r.ms;
    }
    assert.equal(b.hits, HITS);
    assert.deepEqual(out, ['target']);
  });
});
