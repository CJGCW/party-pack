import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOARD_H, BRICK_H, BRICK_W, BRICKS_PER_ROW, COLS, PADDLE_Y, SERVE_MS, STEER_FULL, TICK_HZ, WALL_Y } from '../../shared/games/brickBash';
import { addGarbageRow, newBash, steer, stepBash, wallBottom, type Bash } from './brickBash';

const DT = 1 / TICK_HZ;
const TICK_MS = 1000 / TICK_HZ;

function run(b: Bash, from: number, ticks: number) {
  let ms = from;
  let send = 0;
  let ended = false;
  for (let i = 0; i < ticks && !ended; i++) {
    ms += TICK_MS;
    const r = stepBash(b, DT, ms);
    send += r.send;
    ended = r.ended;
  }
  return { ms, send, ended };
}

describe('Brick Bash', () => {
  it('everyone gets the same wall', () => {
    assert.deepEqual(newBash(9).wall, newBash(9).wall);
    assert.equal(newBash(9).wall[0].length, COLS);
  });

  it('the paddle follows the steering; the ball bounces off it', () => {
    const b = newBash(1);
    steer(b, STEER_FULL);
    run(b, 0, 10);
    assert.ok(b.paddle > 380, `paddle at ${b.paddle}`);
    // A ball dropping onto the paddle's right side goes back up and to the right.
    b.paddle = b.target = 240;
    b.ball = { x: b.paddle + 30, y: PADDLE_Y - 40, vx: 0, vy: 1 };
    run(b, 1000, 4);
    assert.ok(b.ball!.vy < 0 && b.ball!.vx > 0);
  });

  it('a ball hitting a brick smashes it (tough ones take two); every few sends a garbage row', () => {
    const b = newBash(1);
    b.wall = b.wall.map((row) => row.map(() => 0));
    const bottom = b.wall.length - 1;
    b.wall[bottom][4] = 2;
    const hitFromBelow = () => (b.ball = { x: 4.5 * BRICK_W, y: WALL_Y + (bottom + 1) * BRICK_H + 30, vx: 0, vy: -1 });
    hitFromBelow();
    run(b, 1000, 4);
    assert.equal(b.wall[bottom][4], 1);
    assert.ok(b.ball!.vy > 0, 'bounced back down');
    for (let c = 0; c < BRICKS_PER_ROW; c++) b.wall[bottom][c] = 1;
    let send = 0;
    for (let c = 0; c < BRICKS_PER_ROW; c++) {
      b.ball = { x: (c + 0.5) * BRICK_W, y: WALL_Y + (bottom + 1) * BRICK_H + 30, vx: 0, vy: -1 };
      send += run(b, 1000, 4).send;
    }
    assert.equal(b.smashed, BRICKS_PER_ROW);
    assert.equal(send, 1);
    assert.equal(run(b, 1000, 1).ended, false);
  });

  it('losing the ball means a wait for the next', () => {
    const b = newBash(1);
    b.ball = { x: 50, y: BOARD_H - 5, vx: 0, vy: 1 };
    b.paddle = b.target = 400;
    const { ms } = run(b, 1000, 3);
    assert.equal(b.ball, null);
    assert.equal(b.lost, 1);
    run(b, ms, Math.ceil(SERVE_MS / TICK_MS) - 3);
    assert.equal(b.ball, null, 'still waiting');
    run(b, ms + SERVE_MS - 3 * TICK_MS, 4);
    assert.ok(b.ball, 'served');
  });

  it('garbage rows push the wall down; past the line the run ends', () => {
    const b = newBash(1);
    const before = wallBottom(b);
    addGarbageRow(b);
    assert.equal(wallBottom(b), before + BRICK_H);
    b.incoming = 20;
    assert.equal(run(b, 1000, 1).ended, true);
  });

  it('clearing the wall ends the run', () => {
    const b = newBash(1);
    b.wall = b.wall.map((row) => row.map(() => 0));
    b.wall[0][0] = 1;
    b.ball = { x: BRICK_W / 2, y: WALL_Y + BRICK_H + 20, vx: 0, vy: -1 };
    assert.equal(run(b, 1000, 10).ended, true);
    assert.ok(b.cleared);
  });
});
