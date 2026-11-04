import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { FRAME, GRID, ROUND_MS, SHELL_R, TICK_HZ, TILE, rollShell, type TiltHostView } from '../../shared/games/tileTilt';
import type { PlayerInfo } from '../../shared/protocol';
import { READY_MS } from './boards';
import type { GameContext, MiniGame } from './MiniGame';
import { newFrame, stepFrame, tileTilt, type Frame } from './tileTilt';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
afterEach(() => {
  running.splice(0).forEach((g) => g.dispose());
  mock.timers.reset();
});

/** A player who heads for the nearest face-down tile, easing off as they get there. */
function steerToNearest(f: Frame) {
  let best = -1;
  let bestD = Infinity;
  const centre = (i: number) => ({ x: FRAME.x + ((i % GRID) + 0.5) * TILE, y: FRAME.y + (Math.floor(i / GRID) + 0.5) * TILE });
  f.flipped.forEach((up, i) => {
    if (up) return;
    const c = centre(i);
    const d = Math.hypot(c.x - f.shell.x, c.y - f.shell.y);
    if (d < bestD) [best, bestD] = [i, d];
  });
  const c = centre(best);
  const want = Math.min(500, bestD * 3);
  const dx = (c.x - f.shell.x) / (bestD || 1);
  const dy = (c.y - f.shell.y) / (bestD || 1);
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return { x: clamp((dx * want - f.shell.vx) / 300), y: clamp((dy * want - f.shell.vy) / 300) };
}

describe('Tile Tilt', () => {
  it('the shell rolls downhill and bounces off the frame, never leaving it', () => {
    const s = { x: 500, y: 500, vx: 0, vy: 0 };
    for (let i = 0; i < 90; i++) rollShell(s, { x: 1, y: 0 }, 1 / TICK_HZ);
    assert.equal(s.x, FRAME.x + FRAME.size - SHELL_R, 'resting against the right side');
    assert.ok(Math.abs(s.y - 500) < 1);
    // A hand's tremble doesn't move it.
    const still = { x: 500, y: 500, vx: 0, vy: 0 };
    for (let i = 0; i < 90; i++) rollShell(still, { x: 0.03, y: -0.04 }, 1 / TICK_HZ);
    assert.deepEqual([still.x, still.y], [500, 500]);
  });

  it('flips the tiles the shell passes over; a careful player clears the frame well inside the round', () => {
    const f = newFrame();
    assert.equal(f.count, 1, 'the tile it starts on');
    let done = false;
    let ms = 0;
    for (; ms < ROUND_MS && !done; ms += 1000 / TICK_HZ) {
      f.tilt = steerToNearest(f);
      done = stepFrame(f, 1 / TICK_HZ);
    }
    assert.ok(done, `only ${f.count} flipped`);
    assert.ok(ms < 45_000, `took ${ms / 1000}s`);
  });

  it('finishing first scores the most; unfinished frames score for how much they flipped', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as TiltHostView;
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as TiltHostView),
      sendPlayer: () => {},
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = tileTilt.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    assert.equal(host.round.picture.length > 0, true);
    mock.timers.tick(READY_MS);
    // A steers well; B just tips one way and leaves it.
    const frames = (game as unknown as { entries: Map<string, { board: Frame }> }).entries;
    const a = frames.get('p0')!.board;
    game.onInput('p1', { type: 'tilt', x: 1, y: 1 });
    for (let ms = 0; ms < ROUND_MS && host.phase === 'play'; ms += 100) {
      game.onInput('p0', { type: 'tilt', ...steerToNearest(a) });
      mock.timers.tick(100);
    }
    assert.equal(host.phase, 'result');
    const [boardA, boardB] = host.boards;
    assert.notEqual(boardA.endedAtMs, null, 'A finished');
    assert.equal(boardB.endedAtMs, null);
    assert.ok(boardA.points > 300 && boardB.points > 0 && boardB.points < 300, `${boardA.points} vs ${boardB.points}`);
    assert.deepEqual([boardA.place, boardB.place], [1, 2]);
  });
});
