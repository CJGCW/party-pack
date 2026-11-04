import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OneEuro } from '../shared/oneEuro';

describe('One Euro filter (motion controls)', () => {
  // A reading every 16 ms (60 a second), with a little noise like a hand's.
  const noise = (i: number) => 0.02 * Math.sin(i * 2.3) * Math.cos(i * 0.7);

  it('takes most of the wobble out of a value held still', () => {
    const f = new OneEuro(1.2, 0.6);
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      const out = f.filter(noise(i), i * 16);
      if (i > 60) worst = Math.max(worst, Math.abs(out));
    }
    assert.ok(worst < 0.01, `still wobbling by ${worst}`);
  });

  it('keeps up with a fast turn (much closer than plain smoothing that steady)', () => {
    const f = new OneEuro(1.2, 0.6);
    // Plain smoothing as steady as the filter is when still.
    let plain = 0;
    const a = 1 / (1 + 1 / (2 * Math.PI * 1.2) / 0.016);
    let lagEuro = 0;
    let lagPlain = 0;
    for (let i = 0; i < 40; i++) {
      // A quick turn: 3 radians a second.
      const value = (i * 16 * 3) / 1000;
      const out = f.filter(value, i * 16);
      plain += a * (value - plain);
      lagEuro = value - out;
      lagPlain = value - plain;
    }
    assert.ok(lagEuro < lagPlain / 2, `lag ${lagEuro} vs ${lagPlain}`);
  });
});
