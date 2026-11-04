import {
  BALL_R,
  BALL_SPEED,
  BALL_SPEEDUP,
  BOARD_H,
  BOARD_W,
  BRICK_BASH,
  BRICK_H,
  BRICK_W,
  BRICKS_PER_ROW,
  COLS,
  DANGER_Y,
  MAX_BALL_SPEED,
  MAX_BOUNCE,
  PADDLE_W,
  PADDLE_Y,
  ROUND_MS,
  SERVE_MS,
  START_ROWS,
  STEER_FULL,
  TICK_HZ,
  TOP,
  WALL_Y,
  type BashBoardState,
  type BashInput,
  type BashPlayerState,
} from '../../shared/games/brickBash';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';
import { seededRandom } from './spiralShot/board';

/** The ball moves in this many small steps a tick, so it can't pass through a brick. */
const SUBSTEPS = 4;
/** How fast the paddle can slide (units a second). */
const PADDLE_SPEED = 1800;

/** A brick: hits left (1 or 2), or 'g' for garbage (one hit); 0 when it's gone. */
type Brick = 0 | 1 | 2 | 'g';

export interface Bash {
  wall: Brick[][];
  paddle: number;
  target: number;
  ball: { x: number; y: number; vx: number; vy: number } | null;
  /** When the next ball comes (ms into the round). */
  serveAt: number;
  smashed: number;
  lost: number;
  sent: number;
  /** Bricks towards the next garbage row. */
  toSend: number;
  incoming: number;
  cleared: boolean;
  serves: number;
}

/** Everyone's wall: the same from the seed (tougher bricks near the top, and a few gaps). */
export function newBash(seed: number): Bash {
  const random = seededRandom(seed);
  const wall: Brick[][] = Array.from({ length: START_ROWS }, (_, r) =>
    Array.from({ length: COLS }, () => (random() < 0.08 ? 0 : r < 2 || random() < 0.12 ? 2 : 1)),
  );
  return { wall, paddle: BOARD_W / 2, target: BOARD_W / 2, ball: null, serveAt: 0, smashed: 0, lost: 0, sent: 0, toSend: 0, incoming: 0, cleared: false, serves: 0 };
}

export const speedAt = (ms: number) => Math.min(MAX_BALL_SPEED, BALL_SPEED + (BALL_SPEEDUP * ms) / 1000);

export function steer(b: Bash, angle: number) {
  const s = Math.max(-1, Math.min(1, angle / STEER_FULL));
  b.target = BOARD_W / 2 + s * (BOARD_W / 2 - PADDLE_W / 2);
}

/** Pushes the wall down a row, with a new row of garbage on top. Returns true if it's reached the line. */
export function addGarbageRow(b: Bash) {
  b.wall.unshift(Array.from({ length: COLS }, (_, c) => ((c + b.wall.length) % 4 === 0 ? 0 : 'g')));
  return wallBottom(b) > DANGER_Y;
}

/** The bottom of the lowest brick left. */
export function wallBottom(b: Bash) {
  let lowest = -1;
  b.wall.forEach((row, r) => row.some((x) => x) && (lowest = r));
  return lowest < 0 ? WALL_Y : WALL_Y + (lowest + 1) * BRICK_H;
}

/**
 * Moves the board on by `dt` seconds, `ms` into the round. Returns rows of garbage to send, and
 * whether the run's over (wall cleared, or buried).
 */
export function stepBash(b: Bash, dt: number, ms: number): { send: number; ended: boolean } {
  let send = 0;
  const reach = PADDLE_SPEED * dt;
  b.paddle += Math.max(-reach, Math.min(reach, b.target - b.paddle));
  // Garbage that's come in lands now.
  while (b.incoming > 0) {
    b.incoming--;
    if (addGarbageRow(b)) return { send, ended: true };
  }
  if (!b.ball) {
    if (ms < b.serveAt) return { send, ended: false };
    // Off the paddle, up and a little to one side (alternating).
    const angle = (b.serves++ % 2 ? -1 : 1) * 0.35;
    b.ball = { x: b.paddle, y: PADDLE_Y - BALL_R - 2, vx: Math.sin(angle), vy: -Math.cos(angle) };
  }
  const ball = b.ball;
  const speed = speedAt(ms);
  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    const v = Math.hypot(ball.vx, ball.vy) || 1;
    [ball.vx, ball.vy] = [(ball.vx / v) * speed, (ball.vy / v) * speed];
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    if (ball.x < BALL_R) [ball.x, ball.vx] = [BALL_R, Math.abs(ball.vx)];
    if (ball.x > BOARD_W - BALL_R) [ball.x, ball.vx] = [BOARD_W - BALL_R, -Math.abs(ball.vx)];
    if (ball.y < TOP + BALL_R) [ball.y, ball.vy] = [TOP + BALL_R, Math.abs(ball.vy)];
    // The paddle: the ball comes off at an angle by where it hit.
    if (ball.vy > 0 && ball.y + BALL_R >= PADDLE_Y && ball.y - BALL_R < PADDLE_Y + 10 && Math.abs(ball.x - b.paddle) < PADDLE_W / 2 + BALL_R) {
      const off = Math.max(-1, Math.min(1, (ball.x - b.paddle) / (PADDLE_W / 2)));
      ball.vx = Math.sin(off * MAX_BOUNCE);
      ball.vy = -Math.cos(off * MAX_BOUNCE);
      ball.y = PADDLE_Y - BALL_R;
    }
    if (ball.y - BALL_R > BOARD_H) {
      b.ball = null;
      b.lost++;
      b.serveAt = ms + SERVE_MS;
      break;
    }
    // Bricks: the one it's overlapping most, bouncing off the side it came in by.
    const row = Math.floor((ball.y - WALL_Y) / BRICK_H);
    let hit: [number, number, number, number] | null = null;
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = Math.floor(ball.x / BRICK_W) - 1; c <= Math.floor(ball.x / BRICK_W) + 1; c++) {
        if (!b.wall[r]?.[c]) continue;
        const left = c * BRICK_W;
        const top = WALL_Y + r * BRICK_H;
        const nx = Math.max(left, Math.min(left + BRICK_W, ball.x));
        const ny = Math.max(top, Math.min(top + BRICK_H, ball.y));
        const d = Math.hypot(ball.x - nx, ball.y - ny);
        if (d < BALL_R && (!hit || d < hit[2])) hit = [r, c, d, Math.abs(ball.x - nx) > Math.abs(ball.y - ny) ? 0 : 1];
      }
    }
    if (hit) {
      const [r, c, , side] = hit;
      if (side === 0) ball.vx = -ball.vx;
      else ball.vy = -ball.vy;
      const brick = b.wall[r][c];
      b.wall[r][c] = brick === 2 ? 1 : 0;
      if (b.wall[r][c] === 0) {
        b.smashed++;
        if (++b.toSend >= BRICKS_PER_ROW) {
          b.toSend = 0;
          send++;
        }
      }
      if (b.wall.every((rw) => rw.every((x) => !x))) {
        b.cleared = true;
        return { send, ended: true };
      }
    }
  }
  return { send, ended: false };
}

class BrickBash extends BoardsGame<Bash, BashBoardState, BashPlayerState> {
  constructor(
    ctx: GameContext,
    totalPuzzles: number,
    private readonly garbage: boolean,
  ) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 1 });
  }

  protected newBoard(seed: number) {
    return newBash(seed);
  }

  protected stepBoard(b: Bash, dt: number, roundMs: number) {
    const { send, ended } = stepBash(b, dt, roundMs);
    if (this.garbage && send && this.sendGarbage(b, send)) b.sent += send;
    // Clearing the wall scores a bonus: a brick for every second left.
    if (b.cleared) b.smashed += Math.ceil((ROUND_MS - roundMs) / 1000);
    return ended;
  }

  protected receiveGarbage(b: Bash, rows: number) {
    b.incoming += rows;
  }

  protected boardInput(b: Bash, raw: unknown) {
    const input = raw as BashInput;
    if (input.type === 'steer' && Number.isFinite(input.angle)) steer(b, input.angle);
    return false;
  }

  protected boardScore(b: Bash) {
    return b.smashed;
  }

  protected hostState(b: Bash): BashBoardState {
    return {
      wall: b.wall.map((row) => row.map((x) => (x ? String(x) : '.')).join('')).join(''),
      paddle: Math.round(b.paddle),
      ball: b.ball ? [Math.round(b.ball.x), Math.round(b.ball.y)] : null,
      serveIn: b.ball ? 0 : Math.max(0, b.serveAt - this.roundMs()),
      smashed: b.smashed,
      incoming: b.incoming,
      cleared: b.cleared,
    };
  }

  protected playerState(b: Bash): BashPlayerState {
    return { smashed: b.smashed, lost: b.lost, sent: b.sent, garbage: this.garbage };
  }
}

export const brickBash: MiniGameDefinition = {
  info: BRICK_BASH,
  create: (ctx, modeId, options) => new BrickBash(ctx, options.puzzles, modeId === 'garbage'),
};
