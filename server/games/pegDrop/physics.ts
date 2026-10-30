import {
  BALL_R,
  BLUE_POINTS,
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  CATCHER,
  CLEAR_BONUS,
  GOLD_POINTS,
  GRAVITY,
  LAUNCHER,
  LAUNCH_SPEED,
  PEG_R,
  catcherX,
  multiplierFor,
  type Peg,
  type Shot,
} from '../../../shared/games/pegDrop';

// A shot is worked out in full the moment it's fired (fixed time steps, no randomness), and the
// TV plays the result back. So the server always knows the outcome and every TV sees the same.

const DT = 1 / 240;
/** Path points are kept every this many steps (60 a second). */
const RECORD_EVERY = 4;
const PEG_BOUNCE = 0.75;
const WALL_BOUNCE = 0.85;
const MAX_SPEED = 1400;
/** Ball stuck (not getting any lower) for this long: the pegs it has hit so far clear early. */
const STUCK_S = 1.5;
/** Getting this much lower than ever before counts as progress. */
const PROGRESS_PX = 25;
/** However it's going, a shot ends after this long. */
const MAX_SHOT_S = 25;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function simulateShot(pegs: Peg[], angle: number, number: number): Shot {
  const goldTotal = pegs.filter((p) => p.gold).length;
  let goldCleared = pegs.filter((p) => p.gold && p.gone).length;
  const solid = pegs.map((p) => !p.gone);
  const lit = new Set<number>();
  const shot: Shot = { angle, number, path: [], step: DT * RECORD_EVERY, hits: [], pops: [], endT: 0, caught: false, points: 0, cleared: false, clearT: null };

  let x = LAUNCHER.x;
  let y = LAUNCHER.y;
  let vx = Math.sin(angle) * LAUNCH_SPEED;
  let vy = Math.cos(angle) * LAUNCH_SPEED;
  let maxY = y;
  let progressT = 0;

  for (let step = 0; ; step++) {
    const t = step * DT;
    if (step % RECORD_EVERY === 0) shot.path.push(round1(x), round1(y));
    if (y > BOARD_BOTTOM + BALL_R || t > MAX_SHOT_S) {
      shot.endT = t;
      break;
    }

    vy += GRAVITY * DT;
    const speed = Math.hypot(vx, vy);
    if (speed > MAX_SPEED) {
      vx *= MAX_SPEED / speed;
      vy *= MAX_SPEED / speed;
    }
    const prevY = y;
    x += vx * DT;
    y += vy * DT;

    // Walls (the bottom is open).
    if (x < BOARD_LEFT + BALL_R) {
      x = BOARD_LEFT + BALL_R;
      vx = Math.abs(vx) * WALL_BOUNCE;
    } else if (x > BOARD_RIGHT - BALL_R) {
      x = BOARD_RIGHT - BALL_R;
      vx = -Math.abs(vx) * WALL_BOUNCE;
    }
    if (y < BOARD_TOP + BALL_R) {
      y = BOARD_TOP + BALL_R;
      vy = Math.abs(vy) * WALL_BOUNCE;
    }

    // Pegs.
    for (let i = 0; i < pegs.length; i++) {
      if (!solid[i]) continue;
      const dx = x - pegs[i].x;
      const dy = y - pegs[i].y;
      const dist = Math.hypot(dx, dy);
      if (dist >= BALL_R + PEG_R || dist === 0) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const vn = vx * nx + vy * ny;
      if (vn < 0) {
        vx -= (1 + PEG_BOUNCE) * vn * nx;
        vy -= (1 + PEG_BOUNCE) * vn * ny;
      }
      x = pegs[i].x + nx * (BALL_R + PEG_R);
      y = pegs[i].y + ny * (BALL_R + PEG_R);
      if (!lit.has(i)) {
        lit.add(i);
        if (pegs[i].gold) goldCleared++;
        const multiplier = multiplierFor(goldCleared, goldTotal);
        let points = (pegs[i].gold ? GOLD_POINTS : BLUE_POINTS) * multiplier;
        if (pegs[i].gold && goldCleared === goldTotal) {
          points += CLEAR_BONUS * multiplier;
          shot.cleared = true;
          shot.clearT = Math.round(t * 1000) / 1000;
        }
        shot.points += points;
        shot.hits.push({ t: Math.round(t * 1000) / 1000, peg: i, points, multiplier });
        progressT = t;
      }
    }

    // The bucket: falling into it catches the ball.
    if (prevY < CATCHER.y && y >= CATCHER.y && vy > 0 && Math.abs(x - catcherX(number, t)) < CATCHER.width / 2 - BALL_R / 2) {
      shot.path.push(round1(x), round1(y));
      shot.endT = t;
      shot.caught = true;
      break;
    }

    // Stuck: clear what it's hit so far, so it can fall.
    if (y > maxY + PROGRESS_PX) {
      maxY = y;
      progressT = t;
    } else if (t - progressT > STUCK_S) {
      const pegsToPop = [...lit].filter((i) => solid[i]);
      if (pegsToPop.length) {
        pegsToPop.forEach((i) => (solid[i] = false));
        shot.pops.push({ t, pegs: pegsToPop });
      }
      progressT = t;
    }
  }
  return shot;
}
