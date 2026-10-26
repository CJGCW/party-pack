import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardPoints, dealBoard } from './concentration';

describe('Concentration', () => {
  it('deals each card exactly twice', () => {
    for (const size of [2, 4, 6, 10]) {
      const board = dealBoard(size);
      assert.equal(board.length, size * size);
      const counts = new Map<string, number>();
      for (const card of board) counts.set(card!, (counts.get(card!) ?? 0) + 1);
      assert.equal(counts.size, (size * size) / 2);
      assert.ok([...counts.values()].every((n) => n === 2));
    }
  });

  it('leaves the centre empty on odd boards', () => {
    for (const size of [3, 5, 7]) {
      const board = dealBoard(size);
      assert.equal(board.filter((c) => c === null).length, 1);
      assert.equal(board[Math.floor((size * size) / 2)], null);
    }
  });

  it('scores 300 for clearing plus up to 700 for time left, less a cost per guess', () => {
    assert.equal(boardPoints(100_000, 0, 100_000), 1000);
    assert.equal(boardPoints(55_000, 10, 100_000), 580);
    assert.equal(boardPoints(5_000, 30, 100_000), 300);
  });
});
