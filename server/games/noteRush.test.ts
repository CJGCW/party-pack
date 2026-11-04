import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HIT_POINTS, LANES, ROUND_MS, STRAY_COST, chartFor } from '../../shared/games/noteRush';
import { newPlayer, tapNote } from './noteRush';

describe('Note Rush', () => {
  it('everyone gets the same chart, busier each round', () => {
    const a = chartFor(9, 0);
    assert.deepEqual(a, chartFor(9, 0));
    assert.ok(a.every((n) => n.lane >= 0 && n.lane < LANES && n.at > 0 && n.at < ROUND_MS));
    assert.ok(chartFor(9, 3).length > a.length);
  });

  it('taps are judged by how close to a note they are; stray taps cost a little', () => {
    const p = newPlayer(9, 0);
    const [first, second] = p.chart;
    assert.equal(tapNote(p, first.lane, first.at + 20), 'perfect');
    assert.equal(p.points, HIT_POINTS.perfect);
    assert.equal(tapNote(p, first.lane, first.at), 'stray', 'already hit');
    assert.equal(p.points, HIT_POINTS.perfect - STRAY_COST);
    assert.equal(tapNote(p, second.lane, second.at - 120), 'ok');
    assert.equal(p.combo, 1);
  });

  it('hitting every note dead on scores the most', () => {
    const p = newPlayer(4, 1);
    for (const n of p.chart) tapNote(p, n.lane, n.at);
    assert.equal(p.hit.size, p.chart.length);
    assert.equal(p.best, p.chart.length);
    assert.ok(p.points >= p.chart.length * HIT_POINTS.perfect);
  });
});
