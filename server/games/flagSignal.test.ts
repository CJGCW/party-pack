import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { levelAt, levelTimes } from '../../shared/games/flagSignal';
import { newSignaller, stepSignaller, swipe } from './flagSignal';

describe('Flag Signal', () => {
  it('levels follow one another: show, then answer, then rest; each a signal longer', () => {
    const t1 = levelTimes(1);
    const t2 = levelTimes(2);
    assert.ok(t1.show < t1.answer && t1.answer < t1.end && t1.end < t2.show);
    assert.deepEqual(levelAt(t1.show + 1), { k: 1, stage: 'show', signal: 0 });
    assert.equal(levelAt(t1.answer + 1).stage, 'answer');
    assert.equal(levelAt(t2.show + 1).k, 2);
    assert.equal(levelAt(t2.answer - 300).signal, 1);
  });

  it('swiping the sequence back clears the level; a wrong swipe is out', () => {
    const s = newSignaller(7);
    stepSignaller(s, levelTimes(1).answer + 10);
    assert.ok(swipe(s, s.sequence[0]));
    assert.equal(s.cleared, 1);
    stepSignaller(s, levelTimes(2).answer + 10);
    assert.equal(s.level, 2);
    assert.ok(swipe(s, s.sequence[0]));
    const wrong = (['up', 'down', 'left', 'right'] as const).find((d) => d !== s.sequence[1])!;
    assert.equal(swipe(s, wrong), false);
  });

  it('not finishing in time is out', () => {
    const s = newSignaller(7);
    stepSignaller(s, levelTimes(1).answer + 10);
    assert.equal(stepSignaller(s, levelTimes(2).show + 10), true);
  });
});
