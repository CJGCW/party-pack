import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { FIRE_MS, REPAIR_MS, RING, SHELL_MS, castleOf, type SiegeView } from '../../shared/games/castleSiege';
import type { GameContext } from './MiniGame';
import { CastleSiege, blast, enclosure, placePiece, startWalls } from './castleSiege';

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

  it('fire, then repair; a castle left open is out, and the last one standing wins', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as SiegeView;
    const ctx: GameContext = { players: () => room, sendHost: (v) => (host = v as SiegeView), sendPlayer: () => {}, addScore: (id, p) => (room.find((o) => o.id === id)!.score += p), finish: () => {}, showingQuestion: () => {} };
    game = new CastleSiege(ctx, 1);
    game.start();
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
