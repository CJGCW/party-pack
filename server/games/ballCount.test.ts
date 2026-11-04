import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { BOXES, MAX_BALLS, MIN_BALLS, ballsFor, guessPoints, type CountHostView } from '../../shared/games/ballCount';
import type { GameContext, MiniGame } from './MiniGame';
import { ballCount } from './ballCount';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  for (const g of running.splice(0)) g.dispose();
  mock.timers.reset();
});

describe('Ball Count', () => {
  it('boxes hold between the least and the most, the same for everyone', () => {
    for (let s = 0; s < 50; s++) {
      const n = ballsFor(s * 7, s % 3);
      assert.ok(n >= MIN_BALLS && n <= MAX_BALLS);
      assert.equal(n, ballsFor(s * 7, s % 3));
    }
    assert.equal(guessPoints(8, 8), 100);
    assert.equal(guessPoints(6, 8), 75);
    assert.equal(guessPoints(30, 8), 0);
  });

  it('the closest guesses win', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as CountHostView;
    const ctx: GameContext = { players: () => room, sendHost: (v) => (host = v as CountHostView), sendPlayer: () => {}, addScore: (id, p) => (room.find((o) => o.id === id)!.score += p), finish: () => {}, showingQuestion: () => {} };
    const game = ballCount.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    for (let box = 0; box < BOXES; box++) {
      const actual = ballsFor(host.seed, box);
      game.onInput('p0', { type: 'fire', guess: actual });
      game.onInput('p1', { type: 'fire', guess: actual + 3 });
      assert.equal(host.phase, 'fly');
      assert.equal(host.boards[0].state.actual, actual);
      mock.timers.tick(host.msLeft + 1);
    }
    assert.equal(host.phase, 'result');
    assert.equal(host.boards[0].boardScore, 300);
    assert.equal(host.boards[0].place, 1);
  });
});
