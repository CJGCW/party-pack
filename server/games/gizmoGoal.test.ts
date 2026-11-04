import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GIZMO_LEVELS, TURN_STEP } from '../../shared/games/gizmoGoal';
import { newGizmo, place, runGizmo, trayLeft } from './gizmoGoal';

describe('Gizmo Goal', () => {
  it('no level can be done without parts; each can with the right ones', () => {
    const solutions: [Parameters<typeof place>[1], number, number, number][][] = [
      [['plank', 0.6, 2.1, 10 * TURN_STEP]],
      [['fan', 3.8, 0.15, 0]],
      [
        ['bouncer', 3.4, 2.2, 0],
        ['plank', 3.0, 2.6, 10 * TURN_STEP],
      ],
    ];
    for (let level = 0; level < GIZMO_LEVELS.length; level++) {
      assert.equal(runGizmo(newGizmo(level)), false, `${GIZMO_LEVELS[level].name} needs parts`);
      const g = newGizmo(level);
      for (const [kind, x, y, a] of solutions[level]) assert.ok(place(g, kind, x, y, a), g.refused);
      assert.ok(runGizmo(g), `${GIZMO_LEVELS[level].name} solved`);
    }
  });

  it('only the parts in the tray, and not in the ground or on the ball', () => {
    const g = newGizmo(0);
    assert.equal(place(g, 'fan', 5, 3), false, 'no fans on this level');
    assert.equal(place(g, 'plank', 5, -0.5), false);
    assert.equal(place(g, 'plank', 1, 5.3), false, 'on the ball');
    assert.ok(place(g, 'plank', 5, 3));
    assert.ok(place(g, 'plank', 6, 3));
    assert.equal(place(g, 'plank', 7, 3), false, 'tray empty');
    assert.equal(trayLeft(g).plank, 0);
  });
});
