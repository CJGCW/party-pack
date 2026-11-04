import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CALL_MS_MIN, LAYOUTS, TICK_HZ, TILE_COLORS, tileAt } from '../../shared/games/hexHeat';
import { callMs, colorFloor, heatOn, newFloor } from './hexHeat';

describe('Hexagon Heat', () => {
  it('every colour is on at least two tiles, every call; calls get quicker', () => {
    for (const layout of LAYOUTS) {
      for (let n = 0; n < 20; n++) {
        const colors = colorFloor(3, n, layout.tiles.length);
        for (let c = 0; c < TILE_COLORS.length; c++) assert.ok(colors.filter((x) => x === c).length >= 2);
      }
    }
    assert.ok(callMs(5) < callMs(0));
    assert.equal(callMs(100), CALL_MS_MIN);
  });

  it('when the floor drops, only those on the colour called stay in', () => {
    const f = newFloor(9, ['on', 'off'], LAYOUTS[0]);
    const right = f.colors.indexOf(f.called);
    const wrong = f.colors.findIndex((c) => c !== f.called);
    const [on, off] = f.rollers;
    Object.assign(on, { x: f.layout.tiles[right].x, y: f.layout.tiles[right].y });
    Object.assign(off, { x: f.layout.tiles[wrong].x, y: f.layout.tiles[wrong].y });
    assert.equal(tileAt(f.layout, on.x, on.y), right);
    let out: string[] = [];
    for (let ms = 0; ms <= callMs(0) + 200; ms += 1000 / TICK_HZ) out = out.concat(heatOn(f, 1 / TICK_HZ, ms));
    assert.equal(f.stage, 'drop');
    assert.deepEqual(out, ['off']);
  });

  it('rolling off the floor altogether drops you', () => {
    const f = newFloor(1, ['a'], LAYOUTS[1]);
    f.rollers[0].tilt = { x: 1, y: 0 };
    let out: string[] = [];
    for (let i = 0; i < TICK_HZ * 3 && !out.length; i++) out = heatOn(f, 1 / TICK_HZ, 0);
    assert.deepEqual(out, ['a']);
  });
});
