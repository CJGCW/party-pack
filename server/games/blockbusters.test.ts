import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardSize, neighbours, winningPath, type Team } from '../../shared/games/blockbusters';
import { answerInitials, isRightAnswer, pickLetters, questionsByInitials } from './blockbusters';

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

  it("takes the initials from the answer's words", () => {
    assert.equal(answerInitials('Albert Einstein'), 'AE');
    assert.equal(answerInitials('The Lion King'), 'LK');
    assert.equal(answerInitials('New York City'), 'NYC');
    assert.equal(answerInitials('Statue of Liberty'), 'SL');
    assert.equal(answerInitials('Vincent van Gogh'), 'VG');
    assert.equal(answerInitials('DNA | Deoxyribonucleic Acid'), 'DNA');
    assert.equal(answerInitials('H2O'), 'HO');
    assert.equal(answerInitials('X-Ray | X-Rays'), 'XR');
    assert.equal(answerInitials("Halley's Comet"), 'HC');
  });

  it('picks different initials that all have questions', () => {
    const byInitials = questionsByInitials('general');
    assert.ok(byInitials.size >= 40, `only ${byInitials.size} different initials`);
    const keys = pickLetters(byInitials, 20);
    assert.equal(keys.length, 20);
    assert.equal(new Set(keys).size, 20);
    assert.ok(keys.every((k) => byInitials.has(k)));
  });

  it('accepts the whole answer, any listed form, and small slips', () => {
    assert.ok(isRightAnswer('albert einstein', 'Albert Einstein'));
    assert.ok(isRightAnswer('Albert Einstien', 'Albert Einstein'));
    assert.ok(isRightAnswer('lion king', 'The Lion King'));
    assert.ok(isRightAnswer('spiderman', 'Spider-Man | Spiderman'));
    assert.ok(isRightAnswer('deoxyribonucleic acid', 'DNA | Deoxyribonucleic Acid'));
    assert.ok(!isRightAnswer('Einstein', 'Albert Einstein'));
    assert.ok(!isRightAnswer('Isaac Newton', 'Albert Einstein'));
  });
});
