import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

// motion.ts listens for the phone's sensors as it loads, so it needs a window first.
Object.assign(globalThis, { window: { addEventListener: () => {} } });

const RAD = Math.PI / 180;
let motion: typeof import('./motion').motion;
let Steer: typeof import('./steer').Steer;

before(async () => {
  ({ motion } = await import('./motion'));
  ({ Steer } = await import('./steer'));
});

/** The readings for a phone leaning back `lean` degrees from upright, turned `turn` degrees clockwise like a wheel. */
function hold(lean: number, turn: number) {
  const up = {
    x: -Math.sin(turn * RAD) * Math.cos(lean * RAD),
    y: Math.cos(turn * RAD) * Math.cos(lean * RAD),
    z: Math.sin(lean * RAD),
  };
  motion.beta = Math.asin(up.y) / RAD;
  motion.gamma = Math.atan2(-up.x, up.z) / RAD;
  motion.orientationAt = performance.now();
}

function settled(steer: InstanceType<typeof Steer>) {
  let angle = 0;
  for (let i = 0; i < 60; i++) {
    motion.orientationAt = performance.now();
    angle = steer.angle();
  }
  return angle;
}

describe('steering by turning the phone', () => {
  for (const lean of [0, 30, 50]) {
    it(`goes right when turned clockwise and left when turned anticlockwise, leaning back ${lean}°`, () => {
      const right = new Steer(null);
      hold(lean, 0);
      right.angle();
      hold(lean, 30);
      assert.ok(settled(right) > 0.4);

      const left = new Steer(null);
      hold(lean, 0);
      left.angle();
      hold(lean, -30);
      assert.ok(settled(left) < -0.4);
    });
  }

  it('goes the same way lying flat, tilted to the right', () => {
    const steer = new Steer(null);
    motion.beta = motion.gamma = 0;
    motion.orientationAt = performance.now();
    steer.angle();
    motion.gamma = 12;
    assert.ok(settled(steer) > 0.4);
  });
});
