import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { COPTER_R, COPTER_X, ROUND_MS, TICK_HZ, blockAt, caveAt, speedAt, type CaveHostView } from '../../shared/games/caveFlyer';
import type { PlayerInfo } from '../../shared/protocol';
import { READY_MS } from './boards';
import { caveFlyer, flyCopter, type Copter } from './caveFlyer';
import type { GameContext, MiniGame } from './MiniGame';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
afterEach(() => {
  running.splice(0).forEach((g) => g.dispose());
  mock.timers.reset();
});

function copter(seed: number): Copter {
  const cave = caveAt(seed, COPTER_X);
  return { seed, distance: 0, y: (cave.top + cave.bottom) / 2, vy: 0, holding: false, started: true };
}

/** A careful pilot: tries every hold/let-go pattern over the next ~0.7 s and takes the first step of the safest. */
function plan(c: Copter, ms: number) {
  const steps = 4;
  const per = 5;
  let best = -1;
  let choice = false;
  for (let mask = 0; mask < 1 << steps; mask++) {
    const t = { ...c };
    let clearance = Infinity;
    for (let i = 0; i < steps * per && clearance >= 0; i++) {
      t.holding = !!(mask & (1 << Math.floor(i / per)));
      if (flyCopter(t, 1 / TICK_HZ, speedAt(ms + (i * 1000) / TICK_HZ))) clearance = -1;
      else {
        const cave = caveAt(t.seed, t.distance + COPTER_X);
        clearance = Math.min(clearance, t.y - cave.top, cave.bottom - t.y);
      }
    }
    if (clearance > best) {
      best = clearance;
      choice = !!(mask & 1);
    }
  }
  return choice;
}

describe('Cave Flyer', () => {
  it('everyone flies the same cave', () => {
    assert.deepEqual(caveAt(5, 12_345), caveAt(5, 12_345));
    assert.notDeepEqual(caveAt(5, 12_345), caveAt(6, 12_345));
  });

  it('blocks always leave a way past wider than the copter', () => {
    for (let seed = 1; seed <= 5; seed++) {
      for (let n = 0; n < 60; n++) {
        const b = blockAt(seed, n);
        if (!b) continue;
        const cave = caveAt(seed, b.x);
        assert.ok(Math.max(b.top - cave.top, cave.bottom - b.bottom) > COPTER_R * 4, `seed ${seed} block ${n}`);
      }
    }
  });

  it('a copter hovers at the start until its player holds, or for two seconds', () => {
    const c = { ...copter(3), started: false };
    for (let ms = 0; ms < 1_500; ms += 1000 / TICK_HZ) flyCopter(c, 1 / TICK_HZ, speedAt(ms), ms);
    assert.equal(c.vy, 0);
    let ms = 1_500;
    while (!flyCopter(c, 1 / TICK_HZ, speedAt(ms), ms)) ms += 1000 / TICK_HZ;
    assert.ok(ms > 2_000 && ms < 4_000);
  });

  it("a copter that's left alone falls and crashes; a careful one gets well into the round", () => {
    const idle = copter(3);
    let crashedAt = 0;
    while (!flyCopter(idle, 1 / TICK_HZ, speedAt(crashedAt))) crashedAt += 1000 / TICK_HZ;
    assert.ok(crashedAt < 2_000);

    for (const seed of [1, 2]) {
      const c = copter(seed);
      let ok = true;
      for (let tick = 0; tick < 40 * TICK_HZ && ok; tick++) {
        const ms = (tick * 1000) / TICK_HZ;
        c.holding = plan(c, ms);
        ok = !flyCopter(c, 1 / TICK_HZ, speedAt(ms));
      }
      assert.ok(ok, `seed ${seed}: crashed before 40s`);
    }
  });

  it('the last one flying scores the most; a crash ends your run', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as CaveHostView;
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as CaveHostView),
      sendPlayer: () => {},
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = caveFlyer.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    mock.timers.tick(READY_MS);
    // B holds all the way up into the roof; A hovers, pulsing the climb.
    game.onInput('p1', { type: 'hold', down: true });
    for (let ms = 0; ms < 6_000 && host.phase === 'play'; ms += 100) {
      game.onInput('p0', { type: 'hold', down: (ms / 100) % 2 === 0 });
      mock.timers.tick(100);
    }
    const [a, b] = host.boards;
    assert.ok(b.endedAtMs !== null && b.endedAtMs < 2_000, 'B hit the roof');
    assert.ok(a.endedAtMs === null || a.endedAtMs > b.endedAtMs!, 'A lasted longer');
    // Run out the round (A may crash on the way).
    for (let ms = 6_000; ms < ROUND_MS + 1_000 && host.phase === 'play'; ms += 100) {
      game.onInput('p0', { type: 'hold', down: (ms / 100) % 2 === 0 });
      mock.timers.tick(100);
    }
    assert.equal(host.phase, 'result');
    const [endA, endB] = host.boards;
    assert.equal(endA.place, 1);
    assert.equal(endB.place, 2);
    assert.ok(endA.points > endB.points);
    assert.equal(room[1].score, endB.points);
  });
});
