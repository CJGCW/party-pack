import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { COLS, ROUND_MS, slidePosition, stepMsFor, type StackHostView, type StackPlayerView } from '../../shared/games/stacker';
import type { PlayerInfo } from '../../shared/protocol';
import { READY_MS } from './boards';
import type { GameContext, MiniGame } from './MiniGame';
import { dropRow, positionsBetween, stacker, type Tower } from './stacker';

const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
afterEach(() => {
  running.splice(0).forEach((g) => g.dispose());
  mock.timers.reset();
});

describe('Stacker', () => {
  it('slides from the left, back and forth, a column a step', () => {
    const width = 3;
    const span = COLS - width;
    const at = (k: number) => slidePosition(width, 100, k * 100);
    assert.deepEqual(
      Array.from({ length: span * 2 + 2 }, (_, k) => at(k)),
      [0, 1, 2, 3, 4, 3, 2, 1, 0, 1],
    );
    assert.ok(stepMsFor(20) < stepMsFor(1));
  });

  it('a drop keeps what sits on the row below; the overhang falls; missing it all ends the tower', () => {
    const t: Tower = { rows: [[2, 3]], startedAt: 0, fell: null };
    assert.equal(dropRow(t, 2, 1000), true);
    assert.deepEqual(t.rows[1], [2, 3]);
    assert.equal(t.fell, null);
    assert.equal(dropRow(t, 3, 2000), true);
    assert.deepEqual(t.rows[2], [3, 2]);
    assert.deepEqual(t.fell, { n: 1, row: 2, col: 5, width: 1 });
    assert.equal(t.startedAt, 2000);
    assert.equal(dropRow(t, 0, 3000), false);
    assert.equal(t.rows.length, 3);
  });

  it('takes the column the phone saw if the row was there just now, otherwise where it really was', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    const views = new Map<string, StackPlayerView>();
    const ctx: GameContext = {
      players: () => room,
      sendHost: () => {},
      sendPlayer: (id, v) => views.set(id, v as StackPlayerView),
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = stacker.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    // No drops in the countdown.
    game.onInput('p0', { type: 'drop', row: 1, col: 2 });
    assert.equal(views.get('p0')!.state!.rows.length, 1);
    mock.timers.tick(READY_MS);

    const step = stepMsFor(1);
    // 2 steps in, the row's at column 2: right over the base. A says so; B claims column 4, where it never was.
    mock.timers.tick(step * 2 + 10);
    game.onInput('p0', { type: 'drop', row: 1, col: 2 });
    game.onInput('p1', { type: 'drop', row: 1, col: 4 });
    assert.deepEqual(views.get('p0')!.state!.rows[1], [2, 3]);
    assert.notDeepEqual(views.get('p1')!.state!.rows[1], [4, 3]);
    // A double tap for the same row does nothing.
    game.onInput('p0', { type: 'drop', row: 1, col: 2 });
    assert.equal(views.get('p0')!.state!.rows.length, 2);
    assert.ok(positionsBetween(3, step, 0, step * 2).has(2));
  });

  it('the tallest tower scores 1,000, others their share', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as StackHostView;
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as StackHostView),
      sendPlayer: () => {},
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = stacker.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    mock.timers.tick(READY_MS);
    // B drops each row straight away (at column 0), losing two blocks off the edge, then all of it.
    // A waits two steps, until the row's right over the one below, every time.
    game.onInput('p1', { type: 'drop', row: 1, col: 0 });
    game.onInput('p1', { type: 'drop', row: 2, col: 0 });
    for (let row = 1; row <= 3; row++) {
      mock.timers.tick(stepMsFor(row) * 2 + 10);
      game.onInput('p0', { type: 'drop', row, col: 2 });
    }
    mock.timers.tick(ROUND_MS);
    assert.equal(host.phase, 'result');
    const [a, b] = host.boards;
    assert.deepEqual([a.boardScore, b.boardScore], [3, 1]);
    assert.deepEqual([a.place, b.place], [1, 2]);
    assert.deepEqual([a.points, b.points], [1000, 330]);
    assert.notEqual(b.endedAtMs, null, "B's tower toppled");
  });
});
