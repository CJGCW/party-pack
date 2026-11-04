import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { COLS, DUEL_BUNCH, EMPTY, ROWS, STONE, groupAt, stonesFor, type PoppitPlayerView, type PoppitState } from '../../shared/games/poppit';
import type { PlayerInfo } from '../../shared/protocol';
import type { MiniGame } from './MiniGame';
import { makeField, poppit } from './poppit';

let game: MiniGame | null = null;
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
afterEach(() => {
  game?.dispose();
  mock.timers.reset();
  mock.restoreAll();
});

/** A value for Math.random that makes a round's field with a bunch big enough to send stones, and that bunch's biggest. */
function bigField() {
  for (let n = 1; n < 500; n++) {
    const r = n / 503;
    const { grid } = makeField(Math.floor(r * 2 ** 31));
    const cell = grid.findIndex((_, c) => groupAt(grid, c).length >= DUEL_BUNCH);
    if (cell >= 0) return { r, cell, size: groupAt(grid, cell).length };
  }
  throw new Error('no field with a big bunch');
}

function play(mode: string) {
  const room: PlayerInfo[] = ['A', 'B'].map((name, i) => ({ id: `p${i}`, name, color: '#fff', score: 0, connected: true, isVip: i === 0 }));
  const phones = new Map<string, PoppitPlayerView>();
  const big = bigField();
  mock.method(Math, 'random', () => big.r);
  game = poppit.create(
    { players: () => room, sendHost: () => {}, sendPlayer: (id, v) => phones.set(id, v as PoppitPlayerView), addScore: () => {}, finish: () => {}, showingQuestion: () => {} },
    mode,
    { puzzles: 1 },
  );
  game.start();
  mock.timers.tick(3_001);
  game.onInput('p0', { type: 'pop', cell: big.cell });
  const stones = (s: PoppitState | null | undefined) => s!.grid.filter((c) => c === STONE).length;
  const b = phones.get('p1')!.state;
  // The rival pops something, which makes room.
  game.onInput('p1', { type: 'pop', cell: big.cell });
  return { big, a: phones.get('p0')!.state, waiting: b, b: phones.get('p1')!.state, stones };
}

describe('Poppit: Duel', () => {
  it('a big pop sends stones to the rival, which wait for room, then arrive under their balloons', () => {
    const { big, a, waiting, b, stones } = play('duel');
    assert.equal(waiting!.incoming, stonesFor(big.size));
    assert.equal(stones(waiting), 0, 'a full board has no room');
    assert.equal(stones(b), stonesFor(big.size));
    assert.equal(b!.incoming, 0);
    assert.equal(stones(a), stonesFor(big.size), 'their pop was big too, and the first has room');
    for (let c = 0; c < COLS * ROWS; c++) if (b!.grid[c] === STONE && c >= COLS) assert.notEqual(b!.grid[c - COLS], EMPTY);
  });

  it('score attack sends none', () => {
    const { b, stones } = play('standard');
    assert.equal(stones(b), 0);
  });
});
