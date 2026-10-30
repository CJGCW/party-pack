import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { AMMO, TOTAL_STARS, levelFor, wallSize, type SplatHostView, type SplatPlayerView } from '../../shared/games/starSplat';
import type { PlayerInfo } from '../../shared/protocol';
import type { GameContext, MiniGame } from './MiniGame';
import { starSplat } from './starSplat';
import { Rule } from './starSplat/rule';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  running.splice(0).forEach((g) => g.dispose());
  mock.timers.reset();
});

function play(players: number, modeId = '1', puzzles = 2) {
  const room: PlayerInfo[] = Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
  const views = new Map<string, SplatPlayerView>();
  let host = {} as SplatHostView;
  const ctx: GameContext = {
    players: () => room,
    sendHost: (v) => (host = v as SplatHostView),
    sendPlayer: (id, v) => views.set(id, v as SplatPlayerView),
    addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
    finish: () => {},
    showingQuestion: () => {},
  };
  const game = starSplat.create(ctx, modeId, { puzzles });
  running.push(game);
  game.start();
  // The game's rule, to aim with (the players don't get to see it).
  const rule = () => (game as unknown as { rule: Rule }).rule;
  return { game, view: (id: string) => views.get(id)!, host: () => host, room, rule };
}

describe('Star Splat', () => {
  it('at every level, every ball hits its own brick and every brick has a ball', () => {
    for (let level = 1; level <= 4; level++) {
      for (let i = 0; i < 10; i++) {
        const rule = new Rule(level);
        const { rows, cols } = wallSize(level);
        const cells = new Set(rule.allBalls().map((b) => rule.cellFor(b)));
        assert.equal(cells.size, rows * cols, `level ${level}`);
      }
    }
  });

  it('Easy keeps a shape in one column; Medium shifts it along a row at a time', () => {
    // On Easy one of the two always stays in a single column, on Medium neither does.
    const single = (rule: Rule) => {
      const balls = rule.allBalls();
      return [0, 1, 2, 3, 4].some(
        (v) => new Set(balls.filter((b) => b.shape === v).map((b) => rule.cellFor(b) % 5)).size === 1 || new Set(balls.filter((b) => b.color === v).map((b) => rule.cellFor(b) % 5)).size === 1,
      );
    };
    for (let i = 0; i < 10; i++) {
      assert.equal(single(new Rule(1)), true);
      assert.equal(single(new Rule(2)), false);
    }
  });

  it('Rising climbs a level each wall; a fixed level stays put', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => levelFor('rising', i)), [1, 2, 3, 4, 4, 4]);
    assert.deepEqual([0, 1, 2].map((i) => levelFor('3', i)), [3, 3, 3]);
  });

  it('fills a star brick once, counts misses, and stops at the last ball', () => {
    const g = play(2);
    const rule = g.rule();
    const balls = rule.allBalls();
    const targets = g.host().targets;
    const onTarget = balls.find((b) => rule.cellFor(b) === targets[0].cell)!;
    const miss = balls.find((b) => !targets.some((t) => t.cell === rule.cellFor(b)))!;
    g.game.onInput('p0', { type: 'throw', ball: onTarget });
    assert.equal(g.view('p0').stars, targets[0].stars);
    g.game.onInput('p0', { type: 'throw', ball: onTarget });
    assert.equal(g.view('p0').stars, targets[0].stars, 'no stars for hitting it again');
    for (let i = 0; i < 30; i++) g.game.onInput('p0', { type: 'throw', ball: miss });
    assert.equal(g.view('p0').hits.length, AMMO[0]);
    assert.equal(g.view('p0').done, true);
    // Nobody's throws are on the TV until the reveal.
    assert.equal(g.host().players[0].hits, null);
  });

  it('filling every star scores the most, faster scores more; the wall reveals when everyone is done', () => {
    const g = play(2);
    const rule = g.rule();
    const balls = rule.allBalls();
    const hitAll = (id: string) => {
      for (const t of g.host().targets) g.game.onInput(id, { type: 'throw', ball: balls.find((b) => rule.cellFor(b) === t.cell)! });
    };
    mock.timers.tick(10_000);
    hitAll('p0');
    assert.equal(g.view('p0').stars, TOTAL_STARS);
    assert.equal(g.host().phase, 'play');
    mock.timers.tick(50_000);
    hitAll('p1');
    assert.equal(g.host().phase, 'reveal');
    const [a, b] = g.host().players;
    assert.ok(a.points > b.points && b.points > 850, `${a.points} vs ${b.points}`);
    assert.equal(g.host().answers!.length, 8);
    assert.ok(g.host().players[0].hits!.length > 0);
  });

  it("a ball without the shape's colour doesn't count from Hard up", () => {
    const g = play(1, '3');
    g.game.onInput('p0', { type: 'throw', ball: { color: 0, shape: 0 } });
    assert.equal(g.view('p0').hits.length, 0);
    g.game.onInput('p0', { type: 'throw', ball: { color: 0, shape: 0, inner: 2 } });
    assert.equal(g.view('p0').hits.length, 1);
  });
});
