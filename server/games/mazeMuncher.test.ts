import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COLS, DIRS, DOT_POINTS, MAZE, PELLET_POINTS, ROWS, TICK_HZ, isWall, type Dir } from '../../shared/games/mazeMuncher';
import { newMuncher, stepMuncher, targetFor } from './mazeMuncher';

const DT = 1 / TICK_HZ;

describe('Maze Muncher', () => {
  it('every dot in the maze can be reached from the start', () => {
    const start = { x: MAZE[9].indexOf('P'), y: 9 };
    const seen = new Set([`${start.x},${start.y}`]);
    const todo = [start];
    while (todo.length) {
      const { x, y } = todo.pop()!;
      for (const [dx, dy] of Object.values(DIRS)) {
        const k = `${x + dx},${y + dy}`;
        if (isWall(x + dx, y + dy) || seen.has(k)) continue;
        seen.add(k);
        todo.push({ x: x + dx, y: y + dy });
      }
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ('.o'.includes(MAZE[y][x])) assert.ok(seen.has(`${x},${y}`), `dot at ${x},${y}`);
  });

  it('moving eats dots; a swipe turns at the next junction', () => {
    const m = newMuncher(1);
    m.ghosts = [];
    for (let i = 0; i < 10; i++) stepMuncher(m, DT, i * 50);
    assert.ok(m.points >= DOT_POINTS * 2, `${m.points}`);
    m.next = 'up';
    const x = m.x;
    for (let i = 0; i < 40; i++) stepMuncher(m, DT, 1000 + i * 50);
    assert.ok(m.y < 9 || m.x !== x);
  });

  it('a power pellet scares the ghosts (and is counted to send a rival a ghost); a scared ghost can be eaten', () => {
    const m = newMuncher(1);
    // Next to the top-left pellet, heading for it.
    Object.assign(m, { x: 2, y: 1, dir: 'left' as Dir });
    m.ghosts = [{ x: 3, y: 3, dir: 'up', kind: 0, scared: false, releaseAt: 0 }];
    let pellets = 0;
    for (let i = 0; i < 6; i++) pellets += stepMuncher(m, DT, i * 50).pellets;
    assert.equal(pellets, 1);
    assert.ok(m.points >= PELLET_POINTS);
    assert.ok(m.ghosts[0].scared);
    Object.assign(m.ghosts[0], { x: m.x, y: m.y });
    const before = m.points;
    stepMuncher(m, DT, 400);
    assert.ok(m.points >= before + 200, 'ate the ghost');
  });

  it('each ghost hunts its own way: the third pincers you with the first', () => {
    const m = newMuncher(1);
    Object.assign(m, { x: 10, y: 10, dir: 'right' });
    const ghost = (kind: number, x: number, y: number) => ({ x, y, dir: 'up' as Dir, kind, scared: false, releaseAt: 0 });
    m.ghosts = [ghost(0, 4, 10), ghost(1, 1, 1), ghost(2, 1, 1), ghost(3, 1, 1)];
    const chasing = 10_000; // Not a scatter spell.
    assert.deepEqual([targetFor(m, m.ghosts[0], chasing).x, targetFor(m, m.ghosts[0], chasing).y], [10, 10]);
    assert.equal(targetFor(m, m.ghosts[1], chasing).x, 14, 'four ahead');
    // Two ahead of the player is (12, 10); the first ghost is 8 behind that, so 8 beyond it.
    assert.deepEqual([targetFor(m, m.ghosts[3], chasing).x, targetFor(m, m.ghosts[3], chasing).y], [20, 10]);
  });

  it('caught by a ghost: a life, and back to the start', () => {
    const m = newMuncher(1);
    Object.assign(m.ghosts[0], { x: m.x, y: m.y });
    stepMuncher(m, DT, 0);
    assert.equal(m.lives, 2);
  });
});
