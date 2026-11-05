import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { CANNON_MS, FIRE_MS, REPAIR_MS, RING, SHELL_MS, cannonsEarned, castleOf, type SiegeView } from '../../shared/games/castleSiege';
import type { GameContext } from './MiniGame';
import { CastleSiege, blast, cannonFits, enclosure, placePiece, startWalls } from './castleSiege';

let game: CastleSiege | null = null;
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  game?.dispose();
  mock.timers.reset();
});

describe('Castle Siege', () => {
  it('castles start walled in; a hole in the wall lets the outside in', () => {
    const walls = startWalls(2);
    assert.ok(enclosure(walls, 0, 2) > 0);
    assert.ok(enclosure(walls, 1, 2) > 0);
    const c = castleOf(0, 2);
    blast(walls, c.x - RING, c.y);
    assert.equal(enclosure(walls, 0, 2), 0);
    assert.ok(enclosure(walls, 1, 2) > 0, 'the other is fine');
  });

  it('a piece fills a gap (only on open ground in your own land)', () => {
    const walls = startWalls(2);
    const c = castleOf(0, 2);
    // Knock a single cell out, by hand.
    walls[c.y][c.x - RING] = -1;
    assert.equal(enclosure(walls, 0, 2), 0);
    assert.equal(placePiece(walls, 0, 2, 0, 0, c.x + 25, c.y), false, 'not in your land');
    assert.equal(placePiece(walls, 0, 2, 0, 0, c.x, c.y), false, 'not on the castle');
    assert.ok(placePiece(walls, 0, 2, 0, 0, c.x - RING, c.y));
    assert.ok(enclosure(walls, 0, 2) > 0);
  });

  it('more land walled in earns more cannons; a cannon has to fit inside your walls', () => {
    assert.ok(cannonsEarned(120) > cannonsEarned(60));
    const walls = startWalls(2);
    const c = castleOf(0, 2);
    assert.ok(cannonFits(walls, 0, 2, [], c.x - 2, c.y));
    assert.equal(cannonFits(walls, 0, 2, [], c.x - 8, c.y), false, 'outside the wall');
    assert.equal(cannonFits(walls, 0, 2, [], c.x - RING, c.y), false, 'on the wall');
    assert.equal(cannonFits(walls, 0, 2, [], c.x, c.y), false, 'on the castle');
    assert.equal(cannonFits(walls, 0, 2, [{ x: c.x - 2, y: c.y, hp: 3, reloadAt: 0 }], c.x - 2, c.y + 1), false, 'on another cannon');
    assert.equal(cannonFits(walls, 1, 2, [], c.x - 2, c.y), false, "in a rival's land");
  });

  it('each cannon reloads on its own, and a rival shell can knock one out', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as SiegeView;
    const ctx: GameContext = { players: () => room, sendHost: (v) => (host = v as SiegeView), sendPlayer: () => {}, addScore: () => {}, finish: () => {}, showingQuestion: () => {} };
    game = new CastleSiege(ctx, 1);
    game.start();
    assert.equal(host.phase, 'cannons');
    const mine = castleOf(0, 2);
    game.onInput('p0', { type: 'cannon', x: mine.x - 2, y: mine.y });
    assert.equal(host.cannons.length / 4, 1);
    mock.timers.tick(CANNON_MS + 1);
    assert.equal(host.phase, 'fire');
    const earned = cannonsEarned(enclosure(startWalls(2), 0, 2));
    assert.equal(host.cannons.length / 4, earned * 2, 'the rest went in by themselves');
    // Every loaded cannon fires once, then it's empty.
    for (let i = 0; i < earned + 2; i++) game.onInput('p1', { type: 'fire', x: mine.x - 2, y: mine.y });
    assert.equal(host.shells.length / 5, earned);
    const hp = () => host.cannons.findIndex((_, i, a) => i % 4 === 0 && a[i] === 0 && a[i + 1] === mine.x - 2 && a[i + 2] === mine.y);
    assert.ok(hp() >= 0);
    mock.timers.tick(SHELL_MS + 1);
    assert.equal(host.cannons[hp() + 3], 3 - earned, 'hit');
  });

  it('cannons, fire, then repair; a castle left open is out, and the last one standing wins', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as SiegeView;
    const ctx: GameContext = { players: () => room, sendHost: (v) => (host = v as SiegeView), sendPlayer: () => {}, addScore: (id, p) => (room.find((o) => o.id === id)!.score += p), finish: () => {}, showingQuestion: () => {} };
    game = new CastleSiege(ctx, 1);
    game.start();
    mock.timers.tick(CANNON_MS + 1);
    assert.equal(host.phase, 'fire');
    // A shells B's wall.
    const c = castleOf(1, 2);
    game.onInput('p0', { type: 'fire', x: c.x - RING, y: c.y });
    game.onInput('p0', { type: 'fire', x: 2, y: 2 });
    assert.equal(host.shells.length / 5, 1, "can't fire at your own land");
    mock.timers.tick(SHELL_MS + 1);
    assert.equal(host.players[1].enclosed, 0, 'B is open');
    mock.timers.tick(FIRE_MS);
    assert.equal(host.phase, 'repair');
    // B doesn't repair.
    mock.timers.tick(REPAIR_MS + 1);
    assert.equal(host.phase, 'result');
    assert.ok(host.players[1].out);
    assert.equal(room[0].score, 1000);
    assert.ok(room[1].score < 1000);
  });
});
