import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { AIM_MS, SHOTS, type CastleHostView } from '../../shared/games/castleCrush';
import { trackAt } from '../../shared/volleys';
import { castleCrush, damage, fireAt, newCastle } from './castleCrush';
import type { GameContext, MiniGame } from './MiniGame';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  for (const g of running.splice(0)) g.dispose();
  mock.timers.reset();
});

describe('Castle Crush', () => {
  it('the same seed builds the same castle, and it stands up by itself', () => {
    const a = newCastle(5);
    const b = newCastle(5);
    assert.deepEqual(
      a.parts.map((p) => [p.kind, p.home]),
      b.parts.map((p) => [p.kind, p.home]),
    );
    // A shot straight up and weak lands nowhere near it.
    fireAt(a, { elevation: 1.35, power: 0 });
    assert.equal(damage(a), 0);
  });

  it('a good shot knocks blocks down; it is recorded, and the same shot does the same everywhere', () => {
    const aim = { elevation: 0.3, power: 0.7 };
    const a = newCastle(1);
    const b = newCastle(1);
    const rec = fireAt(a, aim);
    fireAt(b, aim);
    assert.ok(damage(a) > 0);
    assert.equal(damage(a), damage(b));
    assert.ok(rec.frames > 10);
    // The stone was recorded flying from the catapult.
    const stone = rec.tracks.find((t) => t.keys[0] === 1 || t.keys[0] === 0);
    assert.ok(stone);
    const start = trackAt(stone, stone.keys[0]);
    assert.ok(typeof start === 'object' && start.x < 200);
  });

  it('everyone aims and fires; the round is three shots; the most damage scores the most', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as CastleHostView;
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as CastleHostView),
      sendPlayer: () => {},
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = castleCrush.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    for (let shot = 0; shot < SHOTS; shot++) {
      assert.equal(host.phase, 'aim');
      assert.equal(host.volley, shot + 1);
      // A aims well; B lobs it straight up. Both firing ends the aiming early.
      game.onInput('p0', { type: 'fire', elevation: 0.3, power: 0.7 });
      assert.equal(host.phase, 'aim');
      game.onInput('p1', { type: 'fire', elevation: 1.35, power: 0 });
      assert.equal(host.phase, 'fly');
      assert.ok(host.boards[0].state.shot);
      mock.timers.tick(host.msLeft + 1);
    }
    assert.equal(host.phase, 'result');
    const [a, b] = host.boards;
    assert.ok(a.boardScore > 0);
    assert.equal(b.boardScore, 0);
    assert.equal(a.place, 1);
    assert.equal(room[0].score, 1000);
  });

  it('nobody firing: time runs out and everyone shoots where they were aiming', () => {
    const room: PlayerInfo[] = [{ id: 'p0', name: 'A', color: '#fff', score: 0, connected: true, isVip: true }];
    let host = {} as CastleHostView;
    const ctx: GameContext = { players: () => room, sendHost: (v) => (host = v as CastleHostView), sendPlayer: () => {}, addScore: () => {}, finish: () => {}, showingQuestion: () => {} };
    const game = castleCrush.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    game.onInput('p0', { type: 'aim', elevation: 0.3, power: 0.7 });
    mock.timers.tick(AIM_MS + 1);
    assert.equal(host.phase, 'fly');
    assert.equal(host.boards[0].state.shotsLeft, SHOTS - 1);
  });
});
