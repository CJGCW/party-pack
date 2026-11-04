import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { BALLS, SPARE_BONUS, STRIKE_BONUS, frameScore, type BowlHostView } from '../../shared/games/strikeZone';
import type { GameContext, MiniGame } from './MiniGame';
import { bowl, newLane, nextBall, sitsOut, strikeZone } from './strikeZone';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  for (const g of running.splice(0)) g.dispose();
  mock.timers.reset();
});

describe('Strike Zone', () => {
  it('scores frames with bonuses for strikes and spares', () => {
    assert.equal(frameScore([10, null]), 10 + STRIKE_BONUS);
    assert.equal(frameScore([6, 4]), 10 + SPARE_BONUS);
    assert.equal(frameScore([6, 3]), 9);
    assert.equal(frameScore([null, null]), 0);
  });

  it('a straight ball down the middle knocks pins over; a gutter ball none', () => {
    const l = newLane();
    nextBall(l);
    assert.ok(bowl(l, { x: 0, angle: 0, power: 0.8, spin: 0 }) >= 5);
    const g = newLane();
    nextBall(g);
    assert.equal(bowl(g, { x: 0.4, angle: 0.1, power: 0.5, spin: 1 }), 0);
    assert.deepEqual(g.frames[0], [0, null]);
  });

  it('the second ball goes at what is left; a strike sits the second ball out; a new frame sets them all up', () => {
    const l = newLane();
    nextBall(l);
    const first = bowl(l, { x: 0.3, angle: 0, power: 0.6, spin: 0 });
    nextBall(l);
    assert.equal(l.pins.filter((p) => p.body).length, 10 - first);
    const second = bowl(l, { x: 0, angle: 0, power: 0.8, spin: 0 });
    assert.ok(first + second <= 10);
    nextBall(l);
    assert.equal(l.pins.filter((p) => p.body).length, 10);
    // Pretend the next frame's first ball was a strike.
    l.frames[1][0] = 10;
    nextBall(l);
    assert.ok(sitsOut(l));
  });

  it('three frames of two balls; strikers sit out; most pins scores most', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as BowlHostView;
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as BowlHostView),
      sendPlayer: () => {},
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = strikeZone.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    for (let v = 0; v < BALLS && host.phase === 'aim'; v++) {
      game.onInput('p0', { type: 'fire', x: 0, angle: 0, power: 0.8, spin: 0 });
      game.onInput('p1', { type: 'fire', x: 0.45, angle: 0.1, power: 0.5, spin: 1 });
      assert.equal(host.phase, 'fly');
      mock.timers.tick(host.msLeft + 1);
    }
    assert.equal(host.phase, 'result');
    const [a, b] = host.boards;
    assert.ok(a.boardScore > b.boardScore);
    assert.equal(a.place, 1);
  });
});
