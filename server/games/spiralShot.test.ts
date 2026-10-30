import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  BALL_D,
  CENTER,
  FIRE_MS,
  READY_MS,
  ROUND_MS,
  BALL_R,
  BOARD_SIZE,
  TICK_HZ,
  TRACKS,
  TURRET_R,
  trackPoint,
  type SpiralHostView,
  type SpiralPlayerView,
} from '../../shared/games/spiralShot';
import type { PlayerInfo } from '../../shared/protocol';
import type { GameContext, MiniGame } from './MiniGame';
import { spiralShot } from './spiralShot';
import { Board, seededRandom, type Marble } from './spiralShot/board';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
afterEach(() => {
  running.splice(0).forEach((g) => g.dispose());
  mock.timers.reset();
});

const SPIRAL = TRACKS[0];

/** A board on the spiral with just these marbles (head first), standing still. */
function boardWith(marbles: [number, number][]) {
  const b = new Board(SPIRAL, seededRandom(1), seededRandom(2));
  b.chain = marbles.map(([s, color], i): Marble => ({ id: 1000 + i, s, color }));
  return b;
}

/** Points the turret at the marble `s` along the track. */
function aimAt(b: Board, s: number) {
  const p = trackPoint(SPIRAL, s);
  b.angle = Math.atan2(p.x - CENTER.x, -(p.y - CENTER.y));
}

/** Steps the board with the chain standing still, for `seconds`. */
function wait(b: Board, seconds: number, fireMs = FIRE_MS) {
  for (let i = 0; i < seconds * TICK_HZ; i++) b.step(1 / TICK_HZ, 0, fireMs);
}

describe('Spiral Shot', () => {
  it('every track stays on the board, clear of the turret, and never runs close enough to itself for marbles to overlap', () => {
    for (const track of TRACKS) {
      const points = Array.from({ length: Math.ceil(track.length / 6) + 1 }, (_, i) => ({ s: Math.min(track.length, i * 6), ...trackPoint(track, Math.min(track.length, i * 6)) }));
      for (const p of points) {
        assert.ok(Math.hypot(p.x - CENTER.x, p.y - CENTER.y) > TURRET_R + BALL_R + 40, `${track.id}: too close to the turret at ${p.s}`);
        assert.ok(p.x > BALL_R && p.x < BOARD_SIZE - BALL_R && p.y > BALL_R && p.y < BOARD_SIZE - BALL_R, `${track.id}: off the board at ${p.s}`);
      }
      // Bits of track further apart along it than a few marbles must be at least two marbles apart on the board.
      for (let i = 0; i < points.length; i += 2) {
        for (let j = i + 2; j < points.length; j += 2) {
          if (points[j].s - points[i].s < BALL_D * 4) continue;
          const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
          assert.ok(d > BALL_D * 2, `${track.id}: runs into itself at ${points[i].s} and ${points[j].s}`);
        }
      }
    }
  });

  it('the spiral starts at the top and ends near the middle', () => {
    const start = trackPoint(SPIRAL, 0);
    const end = trackPoint(SPIRAL, SPIRAL.length);
    assert.ok(start.y < 100, 'starts at the top');
    assert.ok(Math.hypot(end.x - CENTER.x, end.y - CENTER.y) < 200, 'ends near the middle');
  });

  it('every board gets the same chain', () => {
    const colors = (b: Board) => b.chain.map((m) => m.color).join('');
    assert.equal(colors(new Board(SPIRAL, seededRandom(7), seededRandom(1))), colors(new Board(SPIRAL, seededRandom(7), seededRandom(99))));
  });

  it('a shot that makes three of a colour pops them', () => {
    // On the inner lap, nothing in the way: red, red, then others.
    const s = 2700;
    const b = boardWith([
      [s, 0],
      [s - BALL_D, 0],
      [s - 2 * BALL_D, 1],
      [s - 3 * BALL_D, 2],
    ]);
    b.current = 0;
    aimAt(b, s - BALL_D / 2);
    wait(b, 1.5);
    assert.equal(b.pops, 3);
    assert.deepEqual(
      b.chain.filter((m) => m.s > 1000).map((m) => m.color),
      [1, 2],
    );
  });

  it('a shot of another colour joins the chain without popping', () => {
    const s = 2700;
    const b = boardWith([
      [s, 0],
      [s - BALL_D, 1],
    ]);
    b.current = 2;
    aimAt(b, s);
    wait(b, 1.5);
    assert.equal(b.pops, 0);
    assert.equal(b.chain.filter((m) => m.s > 1000).length, 3);
  });

  it('a gap with matching marbles either side pulls shut, and pops if that makes three', () => {
    const s = 2700;
    const b = boardWith([
      [s, 3],
      [s - BALL_D, 0],
      // A gap, then a matching pair behind it.
      [s - BALL_D - 150, 0],
      [s - 2 * BALL_D - 150, 0],
      [s - 3 * BALL_D - 150, 1],
    ]);
    wait(b, 1.5, 1e9);
    assert.equal(b.pops, 3);
    assert.equal(b.bestCombo, 1);
  });

  it("the chain's head reaching the hole puts you out", () => {
    const b = new Board(SPIRAL, seededRandom(3), seededRandom(4));
    let out = false;
    for (let i = 0; i < 60 * TICK_HZ && !out; i++) out = b.step(1 / TICK_HZ, 200, 1e9);
    assert.equal(out, true);
  });

  it('turns and swaps for the players; survivors score 1,000, and going out earlier scores less', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    const views = new Map<string, SpiralPlayerView>();
    let host = {} as SpiralHostView;
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as SpiralHostView),
      sendPlayer: (id, v) => views.set(id, v as SpiralPlayerView),
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = spiralShot.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    assert.equal(host.phase, 'ready');
    assert.equal(host.boards.length, 2);

    const before = views.get('p0')!;
    game.onInput('p0', { type: 'swap' });
    assert.deepEqual([views.get('p0')!.current, views.get('p0')!.next], [before.next, before.current]);
    game.onInput('p0', { type: 'aim', angle: 1 });

    // A always clears their chain, so never goes out; B does nothing.
    const boards = (game as unknown as { entries: Map<string, { board: Board }> }).entries;
    const a = boards.get('p0')!.board;
    const step = a.step.bind(a);
    a.step = (dt, speed, fireMs) => {
      a.chain = [];
      return step(dt, speed, fireMs);
    };
    mock.timers.tick(READY_MS);
    assert.equal(host.phase, 'play');
    for (let ms = 0; ms < ROUND_MS && host.phase === 'play'; ms += 1000) mock.timers.tick(1000);
    assert.equal(host.phase, 'result');
    const [boardA, boardB] = host.boards;
    assert.equal(boardA.outAtMs, null);
    assert.equal(boardA.points, 1000);
    assert.equal(boardA.place, 1);
    assert.ok(boardB.outAtMs! > 10_000 && boardB.outAtMs! < ROUND_MS);
    assert.ok(boardB.points > 0 && boardB.points < 700);
    assert.equal(boardB.place, 2);
    assert.equal(room[0].score, 1000);
  });
});
