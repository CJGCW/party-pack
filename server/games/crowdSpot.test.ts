import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { CROWD, FINDS, WRONG_MS, findFor, personAt, type SpotHostView } from '../../shared/games/crowdSpot';
import type { GameContext, MiniGame } from './MiniGame';
import { crowdSpot } from './crowdSpot';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  for (const g of running.splice(0)) g.dispose();
  mock.timers.reset();
});

const key = (p: { skin: number; hat: number; hatColor: number; eyes: number; mouth: number }) => `${p.skin}${p.hat}${p.hatColor}${p.eyes}${p.mouth}`;

describe('Crowd Spot', () => {
  it('the odd one out is the only one different; a description fits just one', () => {
    for (let seed = 1; seed < 30; seed++) {
      const odd = findFor(seed, 1);
      assert.equal(odd.people.length, CROWD);
      const keys = odd.people.map(key);
      assert.equal(keys.filter((k) => k === keys[odd.answer]).length, 1);
      assert.equal(new Set(keys).size, 2);
      const told = findFor(seed, 0);
      const t = told.people[told.answer];
      assert.equal(told.people.filter((p) => p.hat === t.hat && p.hatColor === t.hatColor && p.eyes === t.eyes).length, 1, told.prompt);
    }
  });

  it('tapping the right one scores (more for quick); a wrong tap locks you out a moment', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as SpotHostView;
    const ctx: GameContext = { players: () => room, sendHost: (v) => (host = v as SpotHostView), sendPlayer: () => {}, addScore: (id, p) => (room.find((o) => o.id === id)!.score += p), finish: () => {}, showingQuestion: () => {} };
    const game = crowdSpot.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    for (let n = 0; n < FINDS; n++) {
      const find = findFor(host.seed, n);
      mock.timers.tick(1000);
      const right = personAt(find.people[find.answer], 1000);
      const wrongOne = find.people.findIndex((p, i) => i !== find.answer && Math.hypot(personAt(p, 1000).x - right.x, personAt(p, 1000).y - right.y) > 100);
      const wrong = personAt(find.people[wrongOne], 1000);
      // B taps the wrong one first, and then can't tap for a moment.
      game.onInput('p1', { type: 'tap', x: wrong.x, y: wrong.y, ms: 1000 });
      assert.ok(host.boards[1].state.lockedMs > 0);
      game.onInput('p0', { type: 'tap', x: right.x, y: right.y, ms: 1000 });
      assert.ok(host.boards[0].state.found);
      mock.timers.tick(WRONG_MS + 1);
      const later = personAt(find.people[find.answer], 1000 + WRONG_MS + 1);
      game.onInput('p1', { type: 'tap', x: later.x, y: later.y, ms: 1000 + WRONG_MS + 1 });
      assert.equal(host.phase, 'fly');
      mock.timers.tick(host.msLeft + 1);
    }
    assert.equal(host.phase, 'result');
    assert.ok(host.boards[0].boardScore > host.boards[1].boardScore && host.boards[1].boardScore > 0);
  });
});
