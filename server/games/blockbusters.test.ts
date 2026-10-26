import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardSize, neighbours, winningPath, type Team } from '../../shared/games/blockbusters';
import { answerLetter, isRightAnswer, pickLetters, questionsByLetter } from './blockbusters';
import { triviaBank } from './trivia';

/** A board from a picture: R and W are owned hexagons, anything else is open. Rows top to bottom. */
const board = (...rows: string[]) => rows.join('').split('').map((c): Team | null => (c === 'R' ? 'red' : c === 'W' ? 'white' : null));

describe('Blockbusters', () => {
  it('sizes the board by players: 4 by 4 when even, 5 by 4 when odd', () => {
    assert.deepEqual(boardSize(4), { cols: 4, rows: 4 });
    assert.deepEqual(boardSize(3), { cols: 5, rows: 4 });
  });

  it('finds neighbours in offset columns', () => {
    // 5 wide: cell 6 is column 1 (shifted down), row 1.
    assert.deepEqual(neighbours(6, 5, 4).sort((a, b) => a - b), [1, 5, 7, 10, 11, 12]);
    // Cell 7 is column 2 (not shifted), row 1.
    assert.deepEqual(neighbours(7, 5, 4).sort((a, b) => a - b), [1, 2, 3, 6, 8, 12]);
    // A corner has fewer.
    assert.deepEqual(neighbours(0, 5, 4).sort((a, b) => a - b), [1, 5]);
  });

  it('spots Red linking top to bottom', () => {
    const owners = board('.R...', '.R...', '..R..', '..R..');
    assert.deepEqual(winningPath(owners, 'red', 5, 4), [1, 6, 12, 17]);
    assert.equal(winningPath(owners, 'white', 5, 4), null);
  });

  it('spots White linking left to right', () => {
    const owners = board('.....', 'WW.WW', '..W..', '.....');
    assert.ok(winningPath(owners, 'white', 5, 4));
    assert.equal(winningPath(board('.....', 'WW.WW', '.....', '.....'), 'white', 5, 4), null);
  });

  it('always has a winner on a full board', () => {
    for (const { cols, rows } of [boardSize(3), boardSize(4)]) {
      for (let n = 0; n < 500; n++) {
        const owners = Array.from({ length: cols * rows }, (): Team => (Math.random() < 0.5 ? 'red' : 'white'));
        const red = winningPath(owners, 'red', cols, rows);
        const white = winningPath(owners, 'white', cols, rows);
        assert.ok(!!red !== !!white, `exactly one winner on ${cols}x${rows}: ${owners.join(',')}`);
      }
    }
  });

  it("takes the letter from the answer's first word", () => {
    assert.equal(answerLetter('The Lion King'), 'L');
    assert.equal(answerLetter('"Superman" by Lazlo Bane'), 'S');
    assert.equal(answerLetter('2001'), null);
  });

  it('picks different letters that all have questions', () => {
    const byLetter = questionsByLetter(triviaBank('general'));
    const letters = pickLetters(byLetter, 20);
    assert.equal(letters.length, 20);
    assert.equal(new Set(letters).size, 20);
    assert.ok(letters.every((l) => byLetter.has(l)));
  });

  it('accepts typed answers with small slips and short forms', () => {
    assert.ok(isRightAnswer('wellington', 'Wellington'));
    assert.ok(isRightAnswer('Welington', 'Wellington'));
    assert.ok(isRightAnswer('shakespeare', 'William Shakespeare'));
    assert.ok(isRightAnswer('pound sterling', 'The pound sterling'));
    assert.ok(isRightAnswer('superman', '"Superman" by Lazlo Bane'));
    assert.ok(!isRightAnswer('Auckland', 'Wellington'));
    assert.ok(!isRightAnswer('William', 'William Shakespeare'));
  });
});
