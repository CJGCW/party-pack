import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import type { GameContext } from './MiniGame';
import { TanksBoth } from './tankYard';

let game: TanksBoth | null = null;
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
afterEach(() => {
  game?.dispose();
  mock.timers.reset();
});

describe('Tank Yard: Both', () => {
  it('arena then gravity, numbered as one game, and it finishes after the last', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as { puzzleNumber: number; totalPuzzles: number; asGame?: string };
    let done = false;
    const ctx: GameContext = { players: () => room, sendHost: (v) => (host = v as typeof host), sendPlayer: () => {}, addScore: () => {}, finish: () => (done = true), showingQuestion: () => {} };
    game = new TanksBoth(ctx, 2);
    game.start();
    assert.deepEqual([host.puzzleNumber, host.totalPuzzles, host.asGame], [1, 2, undefined]);
    // Nobody's touched anything: run the clock on, a second at a time, until the next round's up.
    for (let s = 0; s < 400 && host.asGame === undefined; s++) mock.timers.tick(1000);
    assert.deepEqual([host.puzzleNumber, host.totalPuzzles, host.asGame], [2, 2, 'tank-gravity']);
    assert.equal(done, false);
    for (let s = 0; s < 400 && !done; s++) mock.timers.tick(1000);
    assert.ok(done);
  });
});
