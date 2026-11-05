import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { BALLS, frameScores, type BowlHostView } from '../../shared/games/strikeZone';
import type { GameContext, MiniGame } from './MiniGame';
import { bowl, newLane, nextBall, sitsOut, strikeZone } from './strikeZone';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  for (const g of running.splice(0)) g.dispose();
  mock.timers.reset();
});

describe('Strike Zone', () => {
  it('scores as bowling does: a strike adds the next two balls, a spare the next one', () => {
    assert.deepEqual(frameScores([[6, 3], [1, 2], [3, 4, null]]), [9, 3, 7]);
    assert.deepEqual(frameScores([[10, null], [6, 3], [1, 1, null]]), [19, 9, 2]);
    assert.deepEqual(frameScores([[6, 4], [7, 1], [1, 1, null]]), [17, 8, 2]);
    assert.deepEqual(frameScores([[10, null], [10, null], [10, 10, 10]]), [30, 30, 30]);
    assert.deepEqual(frameScores([[10, null], [null, null], [null, null, null]]), [10, 0, 0]);
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

  it('the last frame pays for a strike or spare with bonus balls, on fresh pins', () => {
    const last = () => {
      const l = newLane();
      l.volley = 3;
      nextBall(l); // The last frame's first ball.
      return l;
    };
    const standing = (l: ReturnType<typeof newLane>) => l.pins.filter((p) => p.body).length;
    const open = last();
    open.frames[2][0] = 4;
    nextBall(open);
    assert.equal(sitsOut(open), false);
    open.frames[2][1] = 3;
    nextBall(open);
    assert.ok(sitsOut(open), 'nothing to pay for');

    const spare = last();
    spare.frames[2][0] = 4;
    nextBall(spare);
    spare.frames[2][1] = 6;
    nextBall(spare);
    assert.equal(sitsOut(spare), false);
    assert.equal(standing(spare), 10);

    const strike = last();
    strike.frames[2][0] = 10;
    nextBall(strike);
    assert.equal(sitsOut(strike), false, 'no sitting out a last-frame strike');
    assert.equal(standing(strike), 10);
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
    for (let v = 0; v < BALLS && host.phase === 'aim' && !host.boards.every((b) => b.locked); v++) {
      game.onInput('p0', { type: 'fire', x: 0, angle: 0, power: 0.8, spin: 0 });
      game.onInput('p1', { type: 'fire', x: 0.45, angle: 0.1, power: 0.5, spin: 1 });
      assert.equal(host.phase, 'fly');
      mock.timers.tick(host.msLeft + 1);
    }
    while (host.phase !== 'result') mock.timers.tick(host.msLeft + 1);
    const [a, b] = host.boards;
    assert.ok(a.boardScore > b.boardScore);
    assert.equal(a.place, 1);
  });
});
