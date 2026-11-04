import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { HP, TANK_R, VOLLEYS, type GravityHostView, type Planet } from '../../shared/games/tankGravity';
import type { GameContext, MiniGame } from './MiniGame';
import { makePlanets, placeTank, volley, type GravityTank } from './tankGravity';
import { tankYard } from './tankYard';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  for (const g of running.splice(0)) g.dispose();
  mock.timers.reset();
});

const tank = (index: number, x: number, y: number): GravityTank => ({ index, x, y, up: -Math.PI / 2, hp: HP, hpBefore: HP, dealt: 0 });

describe('Tank Yard: Gravity', () => {
  it('planets are spread out, and every tank sits on one', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const planets = makePlanets(seed);
      assert.ok(planets.length >= 3);
      for (let i = 0; i < planets.length; i++) for (let j = i + 1; j < planets.length; j++) assert.ok(Math.hypot(planets[i].x - planets[j].x, planets[i].y - planets[j].y) > planets[i].r + planets[j].r);
      for (let i = 0; i < 8; i++) {
        const t = placeTank(planets, i, 8);
        assert.ok(planets.some((p) => Math.abs(Math.hypot(p.x - t.x, p.y - t.y) - p.r - TANK_R * 0.8) < 1), `seed ${seed} tank ${i}`);
      }
    }
  });

  it('a shell straight at a rival hits it; a blast hurts those near it; damage dealt counts', () => {
    // A tiny planet far off, so the shot flies almost straight.
    const planets: Planet[] = [{ x: 1500, y: 850, r: 5, color: 0 }];
    const a = tank(0, 300, 450);
    const b = tank(1, 700, 450);
    volley(planets, [a, b], new Map([[a, { angle: 0, power: 1 }]]));
    assert.ok(b.hp < HP);
    assert.equal(a.hp, HP);
    assert.equal(a.dealt, HP - b.hp);
  });

  it('a round is a few volleys; everyone fires at once; most damage scores most', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as GravityHostView & { asGame?: string };
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as typeof host),
      sendPlayer: () => {},
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = tankYard.create(ctx, 'gravity', { puzzles: 1 });
    running.push(game);
    game.start();
    assert.equal(host.asGame, 'tank-gravity');
    assert.ok(host.round.planets.length >= 3);
    for (let v = 0; v < VOLLEYS && host.phase === 'aim'; v++) {
      const [ta, tb] = host.boards.map((b) => b.state);
      // A aims at B; B lobs one weakly, which drops back onto its own planet.
      game.onInput('p0', { type: 'fire', angle: Math.atan2(tb.y - ta.y, tb.x - ta.x), power: 0.7 });
      game.onInput('p1', { type: 'fire', angle: tb.up, power: 0 });
      assert.equal(host.phase, 'fly');
      assert.ok(host.round.shot);
      mock.timers.tick(host.msLeft + 1);
    }
    assert.equal(host.phase, 'result');
    assert.equal(host.boards[1].boardScore, 0);
  });
});
