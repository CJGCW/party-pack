// Microgames played by moving the phone: tilting, turning and gentle shaking.
// Each one also works by dragging a finger (see MotionInput), for phones without sensors.

import {
  H,
  LH,
  LW,
  PALETTE,
  W,
  byLevel,
  circle,
  clamp,
  dist,
  emoji,
  fillBg,
  label,
  pick,
  rand,
  randInt,
  roundRect,
  type MicrogameImpl,
  type Pointer,
} from './engine';

const wrap = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));

/** Places `count` points at least `gap` apart and away from `avoid`. */
function scatter(rng: () => number, count: number, gap: number, area: [number, number, number, number], avoid: { p: Pointer; r: number }[]) {
  const points: Pointer[] = [];
  for (let tries = 0; points.length < count && tries < 400; tries++) {
    const p = { x: rand(rng, area[0], area[2]), y: rand(rng, area[1], area[3]) };
    if (points.some((q) => dist(p.x, p.y, q.x, q.y) < gap)) continue;
    if (avoid.some((a) => dist(p.x, p.y, a.p.x, a.p.y) < a.r)) continue;
    points.push(p);
  }
  return points;
}

/** Tilt to roll the ball into the hole, around the traps. */
export const roll: MicrogameImpl = {
  create(ctx) {
    const holeR = byLevel(ctx, [30, 26, 22]);
    const TRAP_R = 24;
    const BALL_R = 16;
    const ball = { x: 180, y: 480, vx: 0, vy: 0 };
    const goal = { x: rand(ctx.rng, 70, 290), y: rand(ctx.rng, 100, 190) };
    const traps = scatter(ctx.rng, byLevel(ctx, [1, 2, 3]), 90, [50, 150, 310, 420], [
      { p: goal, r: 100 },
      { p: ball, r: 110 },
    ]);
    let fell: 'goal' | 'trap' | null = null;
    let fallT = 0;
    return {
      update(dt) {
        if (fell) {
          fallT += dt;
          return;
        }
        const tilt = ctx.input.tilt();
        ball.vx += tilt.x * 900 * dt;
        ball.vy += tilt.y * 900 * dt;
        const damp = Math.exp(-1.2 * dt);
        ball.vx *= damp;
        ball.vy *= damp;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.x < BALL_R || ball.x > W - BALL_R) {
          ball.vx *= -0.5;
          ball.x = clamp(ball.x, BALL_R, W - BALL_R);
        }
        if (ball.y < BALL_R || ball.y > H - BALL_R) {
          ball.vy *= -0.5;
          ball.y = clamp(ball.y, BALL_R, H - BALL_R);
        }
        if (dist(ball.x, ball.y, goal.x, goal.y) < holeR - 4) {
          fell = 'goal';
          Object.assign(ball, goal);
          ctx.win();
        } else {
          const trap = traps.find((t) => dist(ball.x, ball.y, t.x, t.y) < TRAP_R - 4);
          if (trap) {
            fell = 'trap';
            Object.assign(ball, trap);
            ctx.lose();
          }
        }
      },
      draw(g) {
        fillBg(g, '#2e8b57', '#1f6b42');
        circle(g, goal.x, goal.y, holeR, '#0b1f12');
        emoji(g, '🚩', goal.x + 14, goal.y - 34, 44);
        for (const t of traps) {
          circle(g, t.x, t.y, TRAP_R, '#3a0d1c');
          label(g, '✖', t.x, t.y, 22, PALETTE.danger);
        }
        const r = fell ? Math.max(0, BALL_R * (1 - fallT * 3)) : BALL_R;
        if (r > 0) {
          circle(g, ball.x + 3, ball.y + 4, r, 'rgba(0,0,0,0.25)');
          circle(g, ball.x, ball.y, r, '#ffffff');
          circle(g, ball.x - r * 0.3, ball.y - r * 0.3, r * 0.35, '#e8e8f0');
        }
        if (fell === 'goal') label(g, 'HOLE IN ONE!', 180, 300, 44, PALETTE.accent);
        if (fell === 'trap') label(g, 'TRAPPED!', 180, 300, 48, PALETTE.danger);
      },
    };
  },
};

/** Tilt to keep the drink on the tray as gusts of wind push it about. */
export const balance: MicrogameImpl = {
  survive: true,
  create(ctx) {
    const gustEvery = byLevel(ctx, [1.3, 1.0, 0.8]);
    const gustForce = byLevel(ctx, [260, 330, 400]);
    const TRAY_R = 130;
    const cx = 180;
    const cy = 300;
    const glass = { x: 0, y: 0, vx: 0, vy: 0 };
    let gust = { angle: 0, until: -1 };
    let nextGust = 0.6;
    let fallen = false;
    return {
      update(dt, t) {
        if (ctx.over) return;
        if (t >= nextGust) {
          gust = { angle: ctx.rng() * Math.PI * 2, until: t + 0.45 };
          nextGust = t + gustEvery * rand(ctx.rng, 0.8, 1.2);
        }
        const tilt = ctx.input.tilt();
        const blowing = t < gust.until;
        glass.vx += (tilt.x * 700 + (blowing ? Math.cos(gust.angle) * gustForce : 0)) * dt;
        glass.vy += (tilt.y * 700 + (blowing ? Math.sin(gust.angle) * gustForce : 0)) * dt;
        const damp = Math.exp(-1.5 * dt);
        glass.vx *= damp;
        glass.vy *= damp;
        glass.x += glass.vx * dt;
        glass.y += glass.vy * dt;
        if (Math.hypot(glass.x, glass.y) > TRAY_R - 18) {
          fallen = true;
          ctx.lose();
        }
      },
      draw(g, t) {
        fillBg(g, '#5ec8f2', '#bde8ff');
        circle(g, cx, cy + 8, TRAY_R + 6, 'rgba(0,0,0,0.2)');
        circle(g, cx, cy, TRAY_R + 6, '#9aa0ad');
        circle(g, cx, cy, TRAY_R - 4, '#c9ccd6');
        if (t < gust.until && !ctx.over) {
          const a = gust.angle;
          emoji(g, '💨', cx - Math.cos(a) * 180, cy - Math.sin(a) * 180, 70, { rot: a + Math.PI });
        }
        emoji(g, fallen ? '💦' : '🥤', cx + glass.x, cy + glass.y, fallen ? 70 : 64);
        if (fallen) label(g, 'SPILLED!', 180, 520, 44, PALETTE.danger);
      },
    };
  },
};

/** Tilt until the bubble sits in the middle ring, and hold it there. */
export const level: MicrogameImpl = {
  create(ctx) {
    const ringR = byLevel(ctx, [22, 17, 13]);
    const hold = byLevel(ctx, [0.7, 0.8, 0.9]);
    const R = 110;
    const a = ctx.rng() * Math.PI * 2;
    const m = rand(ctx.rng, 0.45, 0.7);
    // Where "level" is: the phone has to be tilted this much to centre the bubble.
    const off = { x: Math.cos(a) * m, y: Math.sin(a) * m };
    const bubble = { x: off.x * R, y: off.y * R };
    let held = 0;
    const cx = 180;
    const cy = 290;
    return {
      update(dt) {
        if (ctx.over) return;
        const tilt = ctx.input.tilt();
        // A bubble drifts to the high side, so it moves against the tilt.
        let tx = (off.x - tilt.x) * R;
        let ty = (off.y - tilt.y) * R;
        const d = Math.hypot(tx, ty);
        if (d > 125) {
          tx *= 125 / d;
          ty *= 125 / d;
        }
        const k = Math.min(1, dt * 9);
        bubble.x += (tx - bubble.x) * k;
        bubble.y += (ty - bubble.y) * k;
        held = Math.hypot(bubble.x, bubble.y) < ringR - 4 ? held + dt : 0;
        if (held >= hold) ctx.win();
      },
      draw(g) {
        fillBg(g, '#3b3185', '#1c1545');
        circle(g, cx, cy, 150, '#7a5a2a');
        circle(g, cx, cy, 140, '#c6e86a');
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 2;
        for (const r of [50, 90, 130]) {
          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(cx - 140, cy);
        g.lineTo(cx + 140, cy);
        g.moveTo(cx, cy - 140);
        g.lineTo(cx, cy + 140);
        g.stroke();
        // The target ring, filling as it's held.
        g.strokeStyle = PALETTE.bg;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(cx, cy, ringR, 0, Math.PI * 2);
        g.stroke();
        if (held > 0) {
          g.strokeStyle = PALETTE.danger;
          g.lineWidth = 8;
          g.beginPath();
          g.arc(cx, cy, ringR + 10, -Math.PI / 2, -Math.PI / 2 + (Math.min(1, held / hold) * Math.PI * 2));
          g.stroke();
        }
        circle(g, cx + bubble.x, cy + bubble.y, 16, 'rgba(255,255,255,0.75)');
        circle(g, cx + bubble.x - 5, cy + bubble.y - 5, 5, '#ffffff');
        if (ctx.over && held >= hold) label(g, 'LEVEL!', 180, 500, 52, PALETTE.accent);
        else if (!ctx.over) label(g, 'Get the bubble in the ring', 180, 500, 22, PALETTE.muted);
      },
    };
  },
};

const CLUTTER = ['📦', '🧸', '👟', '🎩', '📚', '🧦', '🎸', '🛋️', '🧺', '🎒'];

/** Tilt to sweep the flashlight around the dark room and find the cat. */
export const search: MicrogameImpl = {
  create(ctx) {
    const spotR = byLevel(ctx, [85, 70, 58]);
    const FIND = 0.35;
    const cat = { x: rand(ctx.rng, 50, W - 50), y: rand(ctx.rng, 90, H - 50) };
    while (dist(cat.x, cat.y, 180, 280) < 150) {
      cat.x = rand(ctx.rng, 50, W - 50);
      cat.y = rand(ctx.rng, 90, H - 50);
    }
    const things = scatter(ctx.rng, 9, 70, [40, 70, W - 40, H - 40], [{ p: cat, r: 70 }]).map((p) => ({ ...p, e: pick(ctx.rng, CLUTTER) }));
    const spot = { x: 180, y: 280 };
    let seen = 0;
    let found = false;
    return {
      update(dt) {
        if (ctx.over) return;
        const tilt = ctx.input.tilt();
        const tx = 180 + tilt.x * 170;
        const ty = 280 + tilt.y * 260;
        const k = Math.min(1, dt * 10);
        spot.x += (tx - spot.x) * k;
        spot.y += (ty - spot.y) * k;
        seen = dist(spot.x, spot.y, cat.x, cat.y) < spotR * 0.55 ? seen + dt : 0;
        if (seen >= FIND) {
          found = true;
          ctx.win();
        }
      },
      draw(g) {
        fillBg(g, '#8b7cf6', '#5b4bc4');
        for (let x = 0; x < W; x += 40) {
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fillRect(x, 0, 20, H);
        }
        for (const th of things) emoji(g, th.e, th.x, th.y, 50);
        emoji(g, '🐱', cat.x, cat.y, 46);
        if (!found) {
          // Darkness everywhere but the beam.
          g.beginPath();
          g.rect(0, 0, LW, LW);
          g.arc(spot.x, spot.y, spotR, 0, Math.PI * 2);
          g.fillStyle = 'rgba(5,3,15,0.96)';
          g.fill('evenodd');
          g.strokeStyle = 'rgba(255,240,180,0.5)';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(spot.x, spot.y, spotR, 0, Math.PI * 2);
          g.stroke();
        } else {
          label(g, 'FOUND YOU!', 180, 50, 44, PALETTE.accent);
        }
      },
    };
  },
};

/** Tilt left and right to ski between every pair of flags. */
export const ski: MicrogameImpl = {
  create(ctx) {
    const speed = byLevel(ctx, [240, 300, 360]);
    const gap = byLevel(ctx, [140, 115, 95]);
    const count = byLevel(ctx, [4, 5, 6]);
    const SKIER_Y = 160;
    const firstY = H + 30;
    const spacing = clamp(((ctx.durationMs / 1000 - 0.6) * speed - (firstY - SKIER_Y)) / (count - 1), 150, 320);
    const gates = Array.from({ length: count }, (_, i) => ({
      x: rand(ctx.rng, 80, W - 80),
      y: firstY + i * spacing,
      state: 'ahead' as 'ahead' | 'passed' | 'missed',
    }));
    const skier = { x: 180, lean: 0 };
    const trees = Array.from({ length: 8 }, (_, i) => ({ x: i % 2 ? rand(ctx.rng, 0, 30) : rand(ctx.rng, W - 30, W), y: rand(ctx.rng, 0, H) }));
    let passed = 0;
    return {
      update(dt) {
        if (ctx.over) return;
        const tilt = ctx.input.tilt();
        skier.lean = tilt.x;
        skier.x = clamp(skier.x + tilt.x * 380 * dt, 20, W - 20);
        for (const tr of trees) {
          tr.y -= speed * dt;
          if (tr.y < -40) tr.y += H + 80;
        }
        for (const gate of gates) {
          const before = gate.y;
          gate.y -= speed * dt;
          if (gate.state === 'ahead' && before > SKIER_Y && gate.y <= SKIER_Y) {
            if (Math.abs(skier.x - gate.x) < gap / 2 - 8) {
              gate.state = 'passed';
              passed++;
              if (passed === count) ctx.win();
            } else {
              gate.state = 'missed';
              ctx.lose();
            }
          }
        }
      },
      draw(g) {
        fillBg(g, '#f4f8ff', '#d6e6f5');
        for (const tr of trees) emoji(g, '🌲', tr.x, tr.y, 50);
        for (const gate of gates) {
          if (gate.y < -40 || gate.y > H + 60) continue;
          const color = gate.state === 'passed' ? PALETTE.correct : gate.state === 'missed' ? PALETTE.danger : PALETTE.blue;
          g.strokeStyle = color;
          g.lineWidth = 3;
          g.setLineDash([6, 6]);
          g.beginPath();
          g.moveTo(gate.x - gap / 2, gate.y);
          g.lineTo(gate.x + gap / 2, gate.y);
          g.stroke();
          g.setLineDash([]);
          for (const side of [-1, 1]) {
            roundRect(g, gate.x + (side * gap) / 2 - 3, gate.y - 40, 6, 44, 3, '#555');
            roundRect(g, gate.x + (side * gap) / 2 - (side < 0 ? 26 : 0), gate.y - 40, 26, 18, 3, color);
          }
        }
        emoji(g, '⛷️', skier.x, SKIER_Y - 10, 60, { rot: skier.lean * 0.4 });
        label(g, `${passed}/${count}`, 320, 40, 26, PALETTE.bg);
      },
    };
  },
};

/** Draws a little steering wheel turned by `angle`, as feedback for turn games. */
function drawWheel(g: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.strokeStyle = '#222';
  g.lineWidth = r * 0.22;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = r * 0.16;
  g.beginPath();
  g.moveTo(-r, 0);
  g.lineTo(r, 0);
  g.moveTo(0, 0);
  g.lineTo(0, r);
  g.stroke();
  circle(g, 0, -r, r * 0.16, PALETTE.danger);
  g.restore();
}

/** Phone sideways, turned like a steering wheel: weave between the cones. */
export const drive: MicrogameImpl = {
  survive: true,
  landscape: true,
  create(ctx) {
    const every = byLevel(ctx, [0.75, 0.6, 0.48]);
    const speed = byLevel(ctx, [300, 370, 440]);
    const ROAD_TOP = 50;
    const ROAD_BOTTOM = LH - 50;
    const car = { x: 110, y: LH / 2 };
    const cones: Pointer[] = [];
    let spawnIn = 0.5;
    let crashed = false;
    let wheel = 0;
    return {
      update(dt) {
        if (ctx.over) return;
        wheel = ctx.input.steer();
        // Clockwise steers right, which on this sideways road is down the screen.
        car.y = clamp(car.y + clamp(wheel / 0.6, -1, 1) * 420 * dt, ROAD_TOP + 22, ROAD_BOTTOM - 22);
        spawnIn -= dt;
        if (spawnIn <= 0) {
          spawnIn = every;
          // Aim some cones at where the car is, so sitting still doesn't work.
          const y = ctx.rng() < 0.5 ? car.y + rand(ctx.rng, -30, 30) : rand(ctx.rng, ROAD_TOP + 25, ROAD_BOTTOM - 25);
          cones.push({ x: LW + 40, y: clamp(y, ROAD_TOP + 25, ROAD_BOTTOM - 25) });
        }
        for (const c of cones) {
          c.x -= speed * dt;
          if (Math.abs(c.x - car.x) < 42 && Math.abs(c.y - car.y) < 32) {
            crashed = true;
            ctx.lose();
          }
        }
      },
      draw(g, t) {
        fillBg(g, '#4caf6a', '#3f8a46', LH);
        roundRect(g, 0, ROAD_TOP, LW, ROAD_BOTTOM - ROAD_TOP, 0, '#555a66');
        g.fillStyle = '#ffffff';
        const offset = ctx.over ? 0 : (t * speed) % 60;
        for (let x = -offset; x < LW; x += 60) g.fillRect(x, LH / 2 - 3, 32, 6);
        for (const c of cones) emoji(g, '🚧', c.x, c.y, 46);
        emoji(g, crashed ? '💥' : '🚗', car.x, car.y, 64, { flip: !crashed });
        drawWheel(g, LW - 50, LH - 44, 26, wheel);
      },
    };
  },
};

/** Turn the phone clockwise to tip the teapot and pour, then back to stop at the line. */
export const tea: MicrogameImpl = {
  create(ctx) {
    const rate = byLevel(ctx, [0.35, 0.45, 0.55]);
    const half = byLevel(ctx, [0.09, 0.07, 0.055]);
    const mid = rand(ctx.rng, 0.55, 0.8);
    const lo = mid - half;
    const hi = mid + half;
    const START = 0.3;
    const STOP_FOR = 0.3;
    const pot = { x: 120, y: 170 };
    const cup = { x: 205, y: 320, w: 120, h: 130 };
    let level = 0;
    let tip = 0;
    let stopped = 0;
    let verdict: 'spilled' | 'perfect' | null = null;
    const flow = () => clamp((tip - START) / 0.4, 0, 1);
    return {
      update(dt) {
        if (ctx.over) return;
        tip = ctx.input.steer();
        level += flow() * rate * dt;
        if (level > hi) {
          verdict = 'spilled';
          ctx.lose();
          return;
        }
        stopped = flow() === 0 ? stopped + dt : 0;
        if (level >= lo && stopped >= STOP_FOR) {
          verdict = 'perfect';
          ctx.win();
        }
      },
      draw(g) {
        fillBg(g, '#f2d29b', '#d9a86a');
        roundRect(g, 0, cup.y + cup.h, W, H, 0, '#a0662f');
        // Stream from the spout into the cup.
        const angle = clamp(tip, -0.2, 1);
        const spout = {
          x: pot.x + Math.cos(angle) * 125 + Math.sin(angle) * 40,
          y: pot.y + Math.sin(angle) * 125 - Math.cos(angle) * 40,
        };
        if (flow() > 0 && !ctx.over) {
          const w = 6 + flow() * 8;
          roundRect(g, spout.x - w / 2, spout.y, w, cup.y + cup.h - spout.y - level * cup.h, 4, '#a0522d');
        }
        // Teapot, tipping with the phone.
        g.save();
        g.translate(pot.x, pot.y);
        g.rotate(angle);
        g.fillStyle = PALETTE.blue;
        g.beginPath();
        g.moveTo(50, -10);
        g.lineTo(125, -45);
        g.lineTo(128, -32);
        g.lineTo(60, 20);
        g.fill();
        g.beginPath();
        g.ellipse(0, 0, 70, 54, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = PALETTE.blue;
        g.lineWidth = 12;
        g.beginPath();
        g.arc(-75, 0, 26, Math.PI * 0.5, Math.PI * 1.5);
        g.stroke();
        roundRect(g, -26, -64, 52, 14, 7, '#3a8fb8');
        circle(g, 0, -70, 8, '#3a8fb8');
        g.restore();
        // Cup and the target band.
        const fill = Math.min(level, 1.05);
        roundRect(g, cup.x + 4, cup.y + cup.h * (1 - fill), cup.w - 8, cup.h * fill - 4, 6, '#a0522d');
        g.fillStyle = 'rgba(255,209,102,0.35)';
        g.fillRect(cup.x - 14, cup.y + cup.h * (1 - hi), cup.w + 28, cup.h * (hi - lo));
        g.strokeStyle = '#ffffff';
        g.lineWidth = 6;
        g.strokeRect(cup.x, cup.y, cup.w, cup.h);
        g.beginPath();
        g.arc(cup.x + cup.w + 4, cup.y + 55, 24, -Math.PI / 2, Math.PI / 2);
        g.stroke();
        if (verdict === 'spilled') label(g, 'SPILLED!', 180, 520, 40, PALETTE.danger);
        else if (verdict === 'perfect') label(g, 'PERFECT CUP!', 180, 520, 38, PALETTE.accent);
        else label(g, level >= lo ? 'Now turn it back!' : 'Turn your phone clockwise', 180, 520, 24, '#ffffff');
      },
    };
  },
};

/** Turn the phone like a dial to bring the number to the top, and hold it there. */
export const dial: MicrogameImpl = {
  create(ctx) {
    const tol = byLevel(ctx, [0.13, 0.1, 0.075]);
    const hold = byLevel(ctx, [0.5, 0.6, 0.7]);
    const NUMBERS = 40;
    // Pick a number that needs a real turn, but not more than a comfortable one.
    let target = 0;
    let need = 0;
    for (let tries = 0; tries < 100; tries++) {
      target = randInt(ctx.rng, 0, NUMBERS - 1);
      need = wrap((-target / NUMBERS) * Math.PI * 2);
      if (Math.abs(need) > 0.5 && Math.abs(need) < 1.6) break;
    }
    let angle = 0;
    let held = 0;
    const cx = 180;
    const cy = 310;
    return {
      update(dt) {
        if (ctx.over) return;
        // The dial turns twice as far as the phone.
        angle = ctx.input.steer() * 2;
        held = Math.abs(wrap(angle - need)) < tol ? held + dt : 0;
        if (held >= hold) ctx.win();
      },
      draw(g) {
        fillBg(g, '#4a4570', '#2c2366');
        roundRect(g, 20, 110, 320, 400, 24, '#8d8fa0');
        roundRect(g, 36, 126, 288, 368, 18, '#a3a6b8');
        label(g, String(target), 180, 60, 56, PALETTE.accent);
        const aligned = Math.abs(wrap(angle - need)) < tol;
        // Marker at the top.
        g.beginPath();
        g.moveTo(cx - 12, cy - 152);
        g.lineTo(cx + 12, cy - 152);
        g.lineTo(cx, cy - 132);
        g.closePath();
        g.fillStyle = aligned ? PALETTE.correct : PALETTE.danger;
        g.fill();
        g.save();
        g.translate(cx, cy);
        g.rotate(angle);
        circle(g, 0, 0, 125, '#2a2a33');
        circle(g, 0, 0, 112, '#3d3d4a');
        for (let n = 0; n < NUMBERS; n++) {
          const a = (n / NUMBERS) * Math.PI * 2;
          g.save();
          g.rotate(a);
          g.fillStyle = '#ffffff';
          g.fillRect(-1.5, -112, 3, n % 5 === 0 ? 16 : 8);
          if (n % 5 === 0) label(g, String(n), 0, -82, 18, '#ffffff');
          g.restore();
        }
        circle(g, 0, 0, 30, '#55556a');
        g.restore();
        if (held > 0) {
          g.strokeStyle = PALETTE.correct;
          g.lineWidth = 8;
          g.beginPath();
          g.arc(cx, cy, 138, -Math.PI / 2, -Math.PI / 2 + Math.min(1, held / hold) * Math.PI * 2);
          g.stroke();
        }
        if (ctx.over && held >= hold) label(g, 'CLICK! OPEN!', 180, 535, 36, PALETTE.accent);
        else if (!ctx.over) label(g, 'Turn your phone to spin the dial', 180, 535, 20, PALETTE.muted);
      },
    };
  },
};

/** Shake gently to get the ketchup out of the bottle. */
export const ketchup: MicrogameImpl = {
  create(ctx) {
    const need = byLevel(ctx, [8, 11, 14]);
    const blobs = Array.from({ length: need }, () => ({ x: rand(ctx.rng, 120, 240), y: rand(ctx.rng, 400, 450), r: rand(ctx.rng, 10, 18) }));
    let shakes = 0;
    let wiggle = 0;
    return {
      update(dt) {
        wiggle = Math.max(0, wiggle - dt);
        if (ctx.over) return;
        const n = ctx.input.shakes();
        if (n > shakes) {
          shakes = n;
          wiggle = 0.25;
          if (shakes >= need) ctx.win();
        }
      },
      draw(g, t) {
        fillBg(g, '#ffe9b8', '#f4c77a');
        circle(g, 180, 450, 120, '#ffffff');
        emoji(g, '🍟', 180, 430, 130);
        for (const b of blobs.slice(0, Math.min(shakes, need))) circle(g, b.x, b.y, b.r, '#c0141e');
        // The bottle, upside down, jiggling with each shake.
        g.save();
        g.translate(180, 180);
        g.rotate(wiggle > 0 ? Math.sin(t * 50) * 0.18 : 0);
        roundRect(g, -45, -110, 90, 170, 26, '#d8232a');
        roundRect(g, -38, -60, 76, 50, 8, '#ffffff');
        label(g, 'KETCHUP', 0, -35, 15, '#d8232a');
        roundRect(g, -22, 56, 44, 34, 6, '#f5f5f5');
        g.restore();
        if (wiggle > 0 && !ctx.over) circle(g, 180, 300 + (0.25 - wiggle) * 300, 9, '#c0141e');
        label(g, `${Math.min(shakes, need)}/${need}`, 300, 50, 28, PALETTE.bg);
        if (ctx.over && shakes >= need) label(g, 'YUM!', 180, 320, 56, PALETTE.danger);
      },
    };
  },
};

/** Carry the egg on the spoon: it drifts, so tilt gently to keep it in the middle. No jiggling. */
export const spoon: MicrogameImpl = {
  survive: true,
  create(ctx) {
    const amp = byLevel(ctx, [0.35, 0.5, 0.65]);
    const maxJitter = byLevel(ctx, [3.2, 2.6, 2.1]);
    const p1 = ctx.rng() * Math.PI * 2;
    const p2 = ctx.rng() * Math.PI * 2;
    const egg = { x: 0, y: 0 };
    let shaky = 0;
    let dropped: 'rolled' | 'jiggled' | null = null;
    let wobble = 0;
    return {
      update(dt, t) {
        if (ctx.over) return;
        const tilt = ctx.input.tilt();
        // The spoon wanders on its own; tilting rolls the egg back.
        const drift = { x: amp * Math.sin(t * 1.3 + p1), y: amp * 0.6 * Math.sin(t * 0.9 + p2) };
        const k = Math.min(1, dt * 6);
        egg.x += (tilt.x + drift.x - egg.x) * k;
        egg.y += (tilt.y + drift.y - egg.y) * k;
        const jitter = ctx.input.jitter();
        wobble = jitter;
        shaky = jitter > maxJitter ? shaky + dt : 0;
        if (Math.hypot(egg.x, egg.y) > 1) {
          dropped = 'rolled';
          ctx.lose();
        } else if (shaky > 0.15) {
          dropped = 'jiggled';
          ctx.lose();
        }
      },
      draw(g, t) {
        fillBg(g, '#6fbf73', '#3f8a46');
        // Spoon.
        roundRect(g, 168, 330, 24, 230, 12, '#c9ccd6');
        g.beginPath();
        g.ellipse(180, 260, 90, 76, 0, 0, Math.PI * 2);
        g.fillStyle = '#dfe2ea';
        g.fill();
        g.beginPath();
        g.ellipse(180, 260, 74, 60, 0, 0, Math.PI * 2);
        g.fillStyle = Math.hypot(egg.x, egg.y) > 0.7 ? '#f3b3bd' : '#c9ccd6';
        g.fill();
        const shake = Math.min(6, wobble * 1.5);
        const ex = 180 + egg.x * 70 + (shake ? Math.sin(t * 70) * shake : 0);
        const ey = 255 + egg.y * 56;
        if (dropped) emoji(g, '🍳', 180 + egg.x * 120, 470, 70);
        else emoji(g, '🥚', ex, ey, 60);
        if (dropped === 'rolled') label(g, 'IT ROLLED OFF!', 180, 80, 36, PALETTE.danger);
        else if (dropped === 'jiggled') label(g, 'TOO JIGGLY!', 180, 80, 40, PALETTE.danger);
        else if (!ctx.over) label(g, 'Keep the egg in the middle', 180, 80, 22, '#ffffff');
      },
    };
  },
};
