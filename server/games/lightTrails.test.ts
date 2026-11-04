import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { GRID_H, GRID_W, SHRINK_AT_MS, TICK_HZ, insetAt, startsFor, type TrailsHostView } from '../../shared/games/lightTrails';
import type { PlayerInfo } from '../../shared/protocol';
import { READY_MS } from './boards';
import { lightTrails, newGrid, ride, turn } from './lightTrails';
import type { GameContext, MiniGame } from './MiniGame';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
afterEach(() => {
  running.splice(0).forEach((g) => g.dispose());
  mock.timers.reset();
});

describe('Light Trails', () => {
  it('riders start apart, inside the walls, each heading along the ring', () => {
    for (let n = 1; n <= 8; n++) {
      const starts = startsFor(n);
      assert.equal(new Set(starts.map((s) => `${s.x},${s.y}`)).size, n);
      for (const s of starts) assert.ok(s.x > 0 && s.y > 0 && s.x < GRID_W - 1 && s.y < GRID_H - 1);
    }
  });

  it('turns are queued (two at most, never straight back) and taken a step at a time', () => {
    const g = newGrid(['a']);
    const r = g.riders[0];
    assert.equal(r.dir, 'right');
    turn(r, 'left');
    assert.deepEqual(r.queued, [], 'no turning straight back');
    turn(r, 'down');
    turn(r, 'left');
    turn(r, 'up');
    assert.deepEqual(r.queued, ['down', 'left'], 'a U-turn in two swipes; a third waits');
    ride(g, 0);
    assert.equal(r.dir, 'down');
    ride(g, 70);
    assert.equal(r.dir, 'left');
  });

  it('riding into a trail or a wall crashes; two into the same cell both crash', () => {
    const g = newGrid(['a', 'b']);
    const [a, b] = g.riders;
    // Put them nose to nose, two cells apart.
    Object.assign(a, { x: 50, y: 30, dir: 'right' });
    Object.assign(b, { x: 52, y: 30, dir: 'left' });
    assert.deepEqual(ride(g, 0).sort(), ['a', 'b']);
    const solo = newGrid(['c']);
    let out: string[] = [];
    for (let i = 0; i < 400 && !out.length; i++) out = ride(solo, 0);
    assert.deepEqual(out, ['c'], 'into the wall eventually');
    assert.equal(insetAt(SHRINK_AT_MS - 1), 0);
    assert.ok(insetAt(SHRINK_AT_MS + 5000) > 1);
  });

  it('the round ends when only one is left riding, who scores the most', () => {
    const room: PlayerInfo[] = ['A', 'B', 'C'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as TrailsHostView;
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as TrailsHostView),
      sendPlayer: () => {},
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = lightTrails.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    mock.timers.tick(READY_MS);
    // A weaves about; B and C ride straight on. Whoever's last riding wins.
    const dirs = ['down', 'left', 'up', 'right'] as const;
    for (let i = 0; i < 400 && host.phase === 'play'; i++) {
      if (i % 4 === 0) game.onInput('p0', { type: 'turn', dir: dirs[(i / 4) % 4] });
      mock.timers.tick(1000 / TICK_HZ);
    }
    assert.equal(host.phase, 'result');
    const winner = host.players.find((p) => p.place === 1)!;
    assert.equal(winner.endedAtMs, null);
    assert.equal(winner.points, 1000);
    assert.ok(host.players.filter((p) => p.endedAtMs !== null).length === 2);
  });
});
