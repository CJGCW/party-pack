import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CALL_MS_MIN, LAYOUT, TICK_HZ, TILE_COLORS, tileAt } from '../../shared/games/hexHeat';
import { backMs, callMs, colorFloor, heatOn, newFloor, nextCall } from './hexHeat';

describe('Hot Hexes', () => {
  it('has one hex of each colour', () => {
    assert.equal(LAYOUT.tiles.length, TILE_COLORS.length);
    for (const tile of LAYOUT.tiles) assert.equal(tile.points.length, 6);
    for (let seed = 0; seed < 50; seed++) assert.deepEqual([...colorFloor(seed)].sort((a, b) => a - b), TILE_COLORS.map((_, i) => i));
  });

  it('the hexes stay put, and the colour called is random but never the same twice running', () => {
    for (let seed = 0; seed < 20; seed++) {
      const seen = new Set<number>();
      let last = -1;
      for (let n = 0; n < 40; n++) {
        const called = nextCall(seed, n, last);
        assert.notEqual(called, last);
        seen.add(called);
        last = called;
      }
      assert.ok(seen.size >= 5, 'it should get around the colours');
    }
    const f = newFloor(5, ['a']);
    const colors = [...f.colors];
    f.rollers[0].in = false;
    const called = [f.called];
    for (let ms = 0; ms < 30_000; ms += 1000 / TICK_HZ) {
      heatOn(f, 1 / TICK_HZ, ms);
      if (called.at(-1) !== f.called) called.push(f.called);
    }
    assert.deepEqual(f.colors, colors);
    assert.ok(called.length > 2);
  });

  it('calls come quicker through the round', () => {
    assert.ok(callMs(5) < callMs(0));
    assert.ok(backMs(5) < backMs(0));
    assert.equal(callMs(100), CALL_MS_MIN);
  });

  it('when the floor drops, only those on the colour called stay in', () => {
    const f = newFloor(9, ['on', 'off']);
    const right = f.colors.indexOf(f.called);
    const wrong = f.colors.findIndex((c) => c !== f.called);
    const [on, off] = f.rollers;
    Object.assign(on, { x: LAYOUT.tiles[right].x, y: LAYOUT.tiles[right].y });
    Object.assign(off, { x: LAYOUT.tiles[wrong].x, y: LAYOUT.tiles[wrong].y });
    assert.equal(tileAt(LAYOUT, on.x, on.y), right);
    let out: string[] = [];
    for (let ms = 0; ms <= callMs(0) + 200; ms += 1000 / TICK_HZ) out = out.concat(heatOn(f, 1 / TICK_HZ, ms));
    assert.equal(f.stage, 'drop');
    assert.deepEqual(out, ['off']);
  });

  it('rolling off the floor altogether drops you', () => {
    const f = newFloor(1, ['a']);
    f.rollers[0].tilt = { x: 1, y: 0 };
    let out: string[] = [];
    for (let i = 0; i < TICK_HZ * 3 && !out.length; i++) out = heatOn(f, 1 / TICK_HZ, 0);
    assert.deepEqual(out, ['a']);
  });
});
