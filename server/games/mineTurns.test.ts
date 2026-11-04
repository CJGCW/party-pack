import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { BOOM, COLS, HIDDEN, ROWS } from '../../shared/games/minesweeper';
import { TURN_MINES, TURN_MS, type TurnsView } from '../../shared/games/mineTurns';
import type { PlayerInfo } from '../../shared/protocol';
import type { GameContext } from './MiniGame';
import { MineTurns } from './mineTurns';
import { newSweeper } from './minesweeper';

let game: MineTurns | null = null;
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  mock.method(Math, 'random', () => 0.5);
});
afterEach(() => {
  game?.dispose();
  mock.timers.reset();
  mock.restoreAll();
});

/** A game with a known field (Math.random's pinned), and which squares are which. */
function setup() {
  const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
  const box = { host: {} as TurnsView, done: false };
  const ctx: GameContext = {
    players: () => room,
    sendHost: (v) => (box.host = v as TurnsView),
    sendPlayer: () => {},
    addScore: (id, p) => (room.find((o) => o.id === id)!.score += p),
    finish: () => (box.done = true),
    showingQuestion: () => {},
  };
  game = new MineTurns(ctx, 1);
  game.start();
  const s = newSweeper(Math.floor(0.5 * 2 ** 31), TURN_MINES);
  const mines = s.field.mines.flatMap((m, c) => (m ? [c] : []));
  const safe = s.field.mines.flatMap((m, c) => (!m && !s.uncovered[c] ? [c] : []));
  return { room, box, mines, safe };
}

describe('Mine Dash: Turns', () => {
  it('a field with the mines hidden, the opening uncovered', () => {
    const { box, mines } = setup();
    assert.equal(mines.length, TURN_MINES);
    assert.equal(box.host.squares.length, COLS * ROWS);
    for (const m of mines) assert.equal(box.host.squares[m], HIDDEN);
    assert.ok(box.host.squares.some((q) => q >= 0));
    assert.equal(box.host.turn, 'p0');
  });

  it('a mine is yours and you go again; a safe square passes the turn; only the turn player can tap', () => {
    const { box, mines, safe } = setup();
    game!.onInput('p1', { type: 'reveal', cell: mines[0] });
    assert.equal(box.host.mines.length, 0, 'not their turn');
    game!.onInput('p0', { type: 'reveal', cell: mines[0] });
    assert.deepEqual(box.host.mines, [{ cell: mines[0], by: 'p0' }]);
    assert.equal(box.host.squares[mines[0]], BOOM);
    assert.equal(box.host.turn, 'p0');
    game!.onInput('p0', { type: 'reveal', cell: mines[0] });
    assert.equal(box.host.mines.length, 1, 'already found');
    game!.onInput('p0', { type: 'reveal', cell: safe[0] });
    assert.equal(box.host.turn, 'p1');
    assert.ok(box.host.squares[safe[0]] >= 0);
  });

  it('a turn runs out and passes', () => {
    const { box } = setup();
    mock.timers.tick(TURN_MS + 1);
    assert.equal(box.host.turn, 'p1');
    mock.timers.tick(TURN_MS + 1);
    assert.equal(box.host.turn, 'p0');
  });

  it('it ends once the leader cannot be caught; points are your share of the mines found, and every mine shows', () => {
    const { box, mines, room } = setup();
    const needed = Math.ceil(TURN_MINES / 2);
    mines.slice(0, needed).forEach((cell) => game!.onInput('p0', { type: 'reveal', cell }));
    assert.equal(box.host.phase, 'result');
    assert.equal(room[0].score, 1000);
    assert.equal(room[1].score, 0);
    for (const m of mines) assert.equal(box.host.squares[m], BOOM);
  });
});
