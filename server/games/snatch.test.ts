import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { GRACE_MS, GRABS, WON_MS, type SnatchView } from '../../shared/games/snatch';
import type { GameContext } from './MiniGame';
import { Snatch } from './snatch';

let game: Snatch | null = null;
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  game?.dispose();
  mock.timers.reset();
});

function setup(random: () => number) {
  const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
  const box = { view: {} as SnatchView };
  const ctx: GameContext = {
    players: () => room,
    sendHost: (v) => (box.view = v as SnatchView),
    sendPlayer: () => {},
    addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
    finish: () => {},
    showingQuestion: () => {},
  };
  game = new Snatch(ctx, 1, random);
  game.start();
  return { room, box };
}

describe('Snatch', () => {
  it('the earliest tap after the lift wins, even if it arrives second', () => {
    const { box } = setup(() => 0.5);
    const v = box.view;
    mock.timers.tick(v.revealAt - Date.now() + 200);
    // B tapped 150ms in, but its tap arrives after A's (tapped 180ms in).
    game!.onInput('p0', { type: 'tap', at: v.revealAt + 180 });
    game!.onInput('p1', { type: 'tap', at: v.revealAt + 150 });
    mock.timers.tick(GRACE_MS + 1);
    assert.equal(box.view.phase, 'won');
    assert.equal(box.view.winner, 'p1');
    assert.equal(box.view.reaction, 150);
  });

  it('tapping before the lift, or on a trap, locks you out of that grab', () => {
    // The second reveal is a trap (random is low then).
    const seq = [0.5, 0.5, 0.1, 0.1];
    let i = 0;
    const { box } = setup(() => seq[i++ % seq.length]);
    game!.onInput('p0', { type: 'tap', at: Date.now() });
    assert.ok(box.view.players[0].locked, 'too soon');
    // Nobody grabs the first treasure: on to grab 2, whose first reveal's a treasure again.
    mock.timers.tick(box.view.hideAt - Date.now() + 1);
    mock.timers.tick(WON_MS + 1);
    assert.equal(box.view.grab, 2);
  });

  it('seven grabs; most grabs scores the most', () => {
    const { box, room } = setup(() => 0.5);
    for (let g = 0; g < GRABS; g++) {
      const v = box.view;
      mock.timers.tick(v.revealAt - Date.now() + 100);
      game!.onInput(g < 5 ? 'p0' : 'p1', { type: 'tap', at: Date.now() });
      mock.timers.tick(GRACE_MS + 1);
      mock.timers.tick(WON_MS + 1);
    }
    assert.equal(box.view.phase, 'result');
    assert.deepEqual(box.view.players.map((p) => p.grabs), [5, 2]);
    assert.equal(room[0].score, 1000);
    assert.ok(room[1].score > 0 && room[1].score < 1000);
  });
});
