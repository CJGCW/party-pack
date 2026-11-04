import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { FAST, WIND_MS, walked, windEnergy, type WindHostView } from '../../shared/games/windUp';
import type { GameContext, MiniGame } from './MiniGame';
import { maxEnergy, windUp } from './windUp';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  for (const g of running.splice(0)) g.dispose();
  mock.timers.reset();
});

describe('Wind-Up Race', () => {
  it('winding faster stores more, up to twice as much', () => {
    assert.equal(windEnergy(10, 0), 10);
    assert.equal(windEnergy(10, FAST), 20);
    assert.equal(windEnergy(10, FAST * 3), 20);
    assert.equal(walked(50, 0), 0);
    assert.equal(walked(50, 1), 50);
    assert.ok(walked(50, 0.5) > 25, 'quick at first');
  });

  it('wind for ten seconds; farther walks score more; nobody can claim more than is possible', () => {
    const room: PlayerInfo[] = ['A', 'B', 'C'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as WindHostView;
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as WindHostView),
      sendPlayer: () => {},
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = windUp.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    mock.timers.tick(WIND_MS / 2);
    game.onInput('p0', { type: 'aim', energy: 300 });
    game.onInput('p1', { type: 'aim', energy: 150 });
    game.onInput('p2', { type: 'aim', energy: 1e9 });
    mock.timers.tick(WIND_MS / 2 + 1);
    assert.equal(host.phase, 'fly');
    mock.timers.tick(host.msLeft + 1);
    assert.equal(host.phase, 'result');
    const [a, b, c] = host.boards;
    assert.ok(a.boardScore > b.boardScore && b.boardScore > 0);
    assert.ok(c.state.energy <= maxEnergy(WIND_MS / 2 + 500), 'capped');
  });
});
