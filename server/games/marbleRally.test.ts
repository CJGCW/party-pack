import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COURSES, ROUND_MS, TICK_HZ, marks, onTrack, tileAt } from '../../shared/games/marbleRally';
import { newMarble, rollMarble, type Marble } from './marbleRally';

const DT = 1 / TICK_HZ;

/** The track's tiles in order from the start to the finish (a walk along it). */
function route(rows: string[]) {
  const start = marks(rows, 'S')[0];
  const path = [{ x: Math.floor(start.x), y: Math.floor(start.y) }];
  const seen = new Set([`${path[0].x},${path[0].y}`]);
  for (;;) {
    const { x, y } = path[path.length - 1];
    const next = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].find(([nx, ny]) => onTrack(tileAt(rows, nx + 0.5, ny + 0.5)) && !seen.has(`${nx},${ny}`));
    if (!next) return path;
    seen.add(`${next[0]},${next[1]}`);
    path.push({ x: next[0], y: next[1] });
  }
}

/** A careful driver: steers for the middle of the next tile along, gently. Returns ms to finish, or null. */
function drive(m: Marble): number | null {
  const path = route(COURSES[m.course].rows);
  for (let ms = 0; ms < ROUND_MS; ms += 1000 / TICK_HZ) {
    const i = path.findIndex((p) => p.x === Math.floor(m.x) && p.y === Math.floor(m.y));
    const target = path[Math.min(path.length - 1, Math.max(0, i) + 1)];
    const dx = target.x + 0.5 - m.x;
    const dy = target.y + 0.5 - m.y;
    // Aim for a gentle speed towards it, braking against what's already going.
    m.tilt = { x: Math.max(-1, Math.min(1, dx * 1.2 - m.vx * 0.6)), y: Math.max(-1, Math.min(1, dy * 1.2 - m.vy * 0.6)) };
    if (rollMarble(m, DT, ms)) return ms;
  }
  return null;
}

describe('Marble Rally', () => {
  it('every course runs from the start to the finish', () => {
    for (const c of COURSES) {
      const path = route(c.rows);
      const end = path[path.length - 1];
      assert.equal(tileAt(c.rows, end.x + 0.5, end.y + 0.5), 'G', c.name);
    }
  });

  it('a careful driver finishes every course', () => {
    for (let course = 0; course < COURSES.length; course++) {
      const m = newMarble(course);
      const ms = drive(m);
      assert.ok(ms !== null, `${COURSES[course].name}: ${m.falls} falls`);
    }
  });

  it('rolling off the edge falls, and comes back at the last checkpoint', () => {
    const m = newMarble(0);
    m.tilt = { x: 0, y: -1 };
    let ms = 0;
    while (!m.fallingUntil && ms < 5000) rollMarble(m, DT, (ms += 33));
    assert.equal(m.falls, 1);
    m.tilt = { x: 0, y: 0 };
    rollMarble(m, DT, ms + 2000);
    assert.deepEqual({ x: m.x, y: m.y }, marks(COURSES[0].rows, 'S')[0]);
  });
});
