import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { LEADER_MAX, leaderPoints, similarity, type CopyView, type Trace } from '../../shared/games/copyCat';
import type { GameContext } from './MiniGame';
import { CopyCat } from './copyCat';

let game: CopyCat | null = null;
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  game?.dispose();
  mock.timers.reset();
});

/** A circle traced over `n` points, scaled, with the time stretched by `speed` (a quicker or slower copy). */
const circle = (n: number, r = 0.7, speed = 1): Trace => Array.from({ length: n }, (_, i) => [Math.cos(i * 0.2 * speed) * r, Math.sin(i * 0.2 * speed) * r]).flat();
const line = (n: number): Trace => Array.from({ length: n }, (_, i) => [-0.8 + (1.6 * i) / n, 0.5]).flat();

describe('Copy Cat', () => {
  it('a copy that matches scores high (even a bit quicker); a different move scores low', () => {
    const move = circle(80);
    assert.equal(similarity(move, move), 100);
    assert.ok(similarity(move, circle(70, 0.7, 80 / 70)) > 75, 'quicker copy');
    assert.ok(similarity(move, line(80)) < 40);
  });

  it('the leader scores most when about half copy it well', () => {
    assert.equal(leaderPoints(2, 4), LEADER_MAX);
    assert.equal(leaderPoints(0, 4), 0);
    assert.equal(leaderPoints(4, 4), 0);
  });

  it('a turn: the leader records, everyone watches then copies, and it scores', () => {
    const room: PlayerInfo[] = ['A', 'B', 'C'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as CopyView;
    const ctx: GameContext = { players: () => room, sendHost: (v) => (host = v as CopyView), sendPlayer: () => {}, addScore: () => {}, finish: () => {}, showingQuestion: () => {} };
    game = new CopyCat(ctx, 1);
    game.start();
    const leader = host.leader;
    const [good, bad] = ['p0', 'p1', 'p2'].filter((id) => id !== leader);
    game.onInput(good, { type: 'trace', trace: circle(80) });
    assert.equal(host.phase, 'lead', "copies don't count before the move");
    game.onInput(leader, { type: 'trace', trace: circle(80) });
    assert.equal(host.phase, 'show');
    mock.timers.tick(host.msLeft + 1);
    assert.equal(host.phase, 'copy');
    game.onInput(good, { type: 'trace', trace: circle(80) });
    game.onInput(bad, { type: 'trace', trace: line(80) });
    assert.equal(host.phase, 'score');
    const pts = (id: string) => host.players.find((p) => p.id === id)!.turnPoints;
    assert.ok(pts(good) > pts(bad));
    assert.equal(pts(leader), LEADER_MAX, 'one of two copied it');
  });
});
