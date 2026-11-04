import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { PlayerInfo } from '../../shared/protocol';
import { CEILING_EVERY_MS, DEAD_ROW, SHOT_SPEED, START_ROWS, TICK_HZ, cellCenter, rowLength, type BubbleHostView } from '../../shared/games/bubbleBrawl';
import { READY_MS } from './boards';
import { bubbleBrawl, fireShot, newBubbles, stepBubbles, type Bubbles } from './bubbleBrawl';
import type { GameContext, MiniGame } from './MiniGame';

const DT = 1 / TICK_HZ;
const running: MiniGame[] = [];
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
afterEach(() => {
  for (const g of running.splice(0)) g.dispose();
  mock.timers.reset();
});

/** An empty board, for setting up by hand. */
function empty(): Bubbles {
  const b = newBubbles(1);
  b.grid = b.grid.map((row) => row.map(() => -1));
  return b;
}

/** Runs a board until its shot lands; returns what dropped. */
function land(b: Bubbles, ms = 1000) {
  let dropped = 0;
  for (let i = 0; i < 60 && b.shot; i++) dropped += stepBubbles(b, DT, ms).dropped;
  assert.equal(b.shot, null, 'landed');
  return dropped;
}

describe('Bubble Brawl', () => {
  it('everyone starts with the same cluster and the same bubbles coming', () => {
    const a = newBubbles(42);
    const b = newBubbles(42);
    assert.deepEqual(a.grid, b.grid);
    assert.deepEqual([a.current, a.next], [b.current, b.next]);
    assert.ok(a.grid.slice(0, START_ROWS).every((row, r) => row.length === rowLength(r) && row.every((c) => c >= 0)));
    assert.ok(a.grid.slice(START_ROWS).every((row) => row.every((c) => c < 0)));
  });

  it('three of a colour pop, and what hangs from them drops', () => {
    const b = empty();
    // Two reds on the ceiling with two blues hanging below them, and a green off to the side.
    b.grid[0][3] = 0;
    b.grid[0][4] = 0;
    b.grid[1][3] = 3;
    b.grid[2][3] = 3;
    b.grid[0][0] = 2;
    // A red shot coming up into the gap beside them.
    const at = cellCenter(1, 2);
    b.shot = { x: at.x, y: at.y + 40, vx: 0, vy: -SHOT_SPEED, color: 0 };
    const dropped = land(b);
    assert.equal(b.popped, 3);
    assert.equal(dropped, 2, 'the blues dropped');
    assert.equal(b.grid[0][0], 2, 'the green still hangs');
    assert.equal(b.grid.flat().filter((c) => c >= 0).length, 1);
  });

  it('a shot that does not make three just sticks', () => {
    const b = empty();
    b.grid[0][3] = 1;
    const at = cellCenter(1, 3);
    b.shot = { x: at.x, y: at.y + 40, vx: 0, vy: -SHOT_SPEED, color: 0 };
    assert.equal(land(b), 0);
    assert.equal(b.grid[1][3], 0);
  });

  it('garbage lands after your next shot; the ceiling comes down; over the line and you are out', () => {
    const b = newBubbles(3);
    b.incoming = 5;
    const before = b.grid.flat().filter((c) => c >= 0).length;
    fireShot(b);
    land(b);
    assert.equal(b.incoming, 0);
    assert.ok(b.grid.flat().filter((c) => c >= 0).length >= before + 5 - b.popped);
    const lowest = Math.max(...b.grid.map((row, r) => (row.some((c) => c >= 0) ? r : -1)));
    const { lost } = stepBubbles(b, DT, (DEAD_ROW - lowest) * CEILING_EVERY_MS);
    assert.ok(lost);
  });

  it('garbage goes round the rivals still in; the last one standing ends the round', () => {
    const room: PlayerInfo[] = ['A', 'B', 'C'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as BubbleHostView;
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as BubbleHostView),
      sendPlayer: () => {},
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = bubbleBrawl.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    mock.timers.tick(READY_MS);
    // Reaching inside: what A's drops would do.
    const inside = game as unknown as { entries: Map<string, { board: Bubbles }>; sendGarbage(from: Bubbles, n: number): string | null };
    const board = (id: string) => inside.entries.get(id)!.board;
    assert.deepEqual([1, 2, 3, 4].map(() => inside.sendGarbage(board('p0'), 2)).sort(), ['p1', 'p1', 'p2', 'p2']);
    assert.equal(board('p1').incoming + board('p2').incoming, 8);
    assert.equal(board('p0').incoming, 0, 'never to yourself');
    // Nobody fires: the ceiling comes down on everyone and they all go out together.
    for (let i = 0; i < 400 && host.phase === 'play'; i++) mock.timers.tick(500);
    assert.equal(host.phase, 'result');
  });

  it('with two left, the first out ends the round', () => {
    const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
    let host = {} as BubbleHostView;
    const ctx: GameContext = {
      players: () => room,
      sendHost: (v) => (host = v as BubbleHostView),
      sendPlayer: () => {},
      addScore: (id, points) => (room.find((p) => p.id === id)!.score += points),
      finish: () => {},
      showingQuestion: () => {},
    };
    const game = bubbleBrawl.create(ctx, 'standard', { puzzles: 1 });
    running.push(game);
    game.start();
    mock.timers.tick(READY_MS);
    const inside = game as unknown as { entries: Map<string, { board: Bubbles }> };
    // B's bubbles reach the line.
    const b = inside.entries.get('p1')!.board;
    b.grid[DEAD_ROW][0] = 1;
    mock.timers.tick(100);
    assert.equal(host.phase, 'result');
    assert.equal(host.boards[0].place, 1);
    assert.equal(host.boards[1].place, 2);
  });
});
