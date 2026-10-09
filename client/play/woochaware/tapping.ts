// Microgames played by tapping, holding or timing a single touch.

import {
  H,
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

/** Swat every fly as they zip around. */
export const swat: MicrogameImpl = {
  create(ctx) {
    const count = byLevel(ctx, [3, 4, 5]);
    const speed = byLevel(ctx, [120, 170, 220]);
    const flies = Array.from({ length: count }, () => ({
      x: rand(ctx.rng, 60, W - 60),
      y: rand(ctx.rng, 140, H - 100),
      angle: ctx.rng() * Math.PI * 2,
      turnIn: 0,
      splat: -1,
    }));
    let swatAt: Pointer | null = null;
    let swatT = 0;
    return {
      update(dt) {
        swatT = Math.max(0, swatT - dt);
        for (const f of flies) {
          if (f.splat >= 0) {
            f.splat += dt;
            continue;
          }
          f.turnIn -= dt;
          if (f.turnIn <= 0) {
            f.angle += rand(ctx.rng, -1.8, 1.8);
            f.turnIn = rand(ctx.rng, 0.2, 0.6);
          }
          f.x += Math.cos(f.angle) * speed * dt;
          f.y += Math.sin(f.angle) * speed * dt;
          if (f.x < 30 || f.x > W - 30) f.angle = Math.PI - f.angle;
          if (f.y < 70 || f.y > H - 30) f.angle = -f.angle;
          f.x = clamp(f.x, 30, W - 30);
          f.y = clamp(f.y, 70, H - 30);
        }
      },
      draw(g, t) {
        fillBg(g, '#ffe9b8', '#f4c77a');
        // Kitchen tiles.
        g.strokeStyle = 'rgba(0,0,0,0.06)';
        g.lineWidth = 2;
        for (let i = 0; i <= W; i += 45) g.strokeRect(i, 0, 45, H);
        for (let j = 0; j <= H; j += 45) g.strokeRect(0, j, W, 45);
        flies.forEach((f, i) => {
          if (f.splat >= 0) {
            if (f.splat < 0.3) emoji(g, '💥', f.x, f.y, 70);
            else circle(g, f.x, f.y, 9, 'rgba(40,30,20,0.5)');
          }
          else drawFly(g, f.x, f.y + Math.sin(t * 40 + i) * 3, f.angle, t * 60 + i);
        });
        if (swatT > 0 && swatAt) emoji(g, '🖐️', swatAt.x, swatAt.y, 90, { alpha: swatT / 0.25 });
        label(g, `${flies.filter((f) => f.splat >= 0).length}/${count}`, W / 2, 40, 28, PALETTE.bg);
      },
      down(p) {
        swatAt = p;
        swatT = 0.25;
        // One swat can get flies that are bunched together.
        let hit = false;
        for (const f of flies) {
          if (f.splat < 0 && dist(p.x, p.y, f.x, f.y) < 42) {
            f.splat = 0;
            hit = true;
          }
        }
        if (hit && flies.every((f) => f.splat >= 0)) ctx.win();
      },
    };
  },
};

/** A fly facing `angle`, drawn by hand (the fly emoji is missing on some phones). */
function drawFly(g: CanvasRenderingContext2D, x: number, y: number, angle: number, flap: number) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  // Buzzing wings.
  const spread = 0.5 + Math.sin(flap) * 0.35;
  g.fillStyle = 'rgba(200,230,255,0.75)';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(-4, side * 11, 13, 7, side * spread, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#2a2a2a';
  g.beginPath();
  g.ellipse(-3, 0, 13, 9, 0, 0, Math.PI * 2);
  g.fill();
  circle(g, 11, 0, 7, '#2a2a2a');
  circle(g, 14, -4, 3.5, '#c0392b');
  circle(g, 14, 4, 3.5, '#c0392b');
  g.restore();
}

/** Tap as fast as you can to blow the balloon up until it pops. */
export const pump: MicrogameImpl = {
  create(ctx) {
    const needed = byLevel(ctx, [10, 14, 18]);
    const leak = byLevel(ctx, [0, 0.05, 0.12]);
    let p = 0;
    let plunge = 0;
    let popped = false;
    let popT = 0;
    return {
      update(dt) {
        if (popped) popT += dt;
        else p = Math.max(0, p - leak * dt);
        plunge = Math.max(0, plunge - dt * 5);
      },
      draw(g) {
        fillBg(g, '#2c2366', '#140f2e');
        const r = 30 + p * 110;
        const cy = 250 - p * 40;
        // Hose from the pump to the balloon.
        g.strokeStyle = '#555';
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(180, 440);
        g.quadraticCurveTo(80, 420, 180, cy + r);
        g.stroke();
        if (popped) {
          emoji(g, '💥', 180, cy, 150 + popT * 200, { alpha: Math.max(0, 1 - popT * 1.5) });
          label(g, 'POP!', 180, cy, 64, PALETTE.accent);
        } else {
          circle(g, 180, cy, r, PALETTE.danger);
          circle(g, 180 - r * 0.35, cy - r * 0.4, r * 0.18, 'rgba(255,255,255,0.45)');
          // Shake as it gets close.
          if (p > 0.8) label(g, '!!', 180 + r + 20, cy - r, 36, PALETTE.accent);
        }
        // Pump.
        const handleY = 400 + plunge * 34;
        roundRect(g, 176, handleY, 8, 70, 3, '#888');
        roundRect(g, 130, handleY - 12, 100, 18, 8, PALETTE.accent);
        roundRect(g, 150, 440, 60, 90, 10, PALETTE.blue);
        label(g, `${Math.round(p * 100)}%`, 180, 485, 22);
      },
      down() {
        if (popped) return;
        p += 1 / needed;
        plunge = 1;
        if (p >= 1) {
          popped = true;
          ctx.win();
        }
      },
    };
  },
};

/** It pours on its own, a little faster or slower as it goes; tap to stop it between the lines. */
export const pour: MicrogameImpl = {
  create(ctx) {
    const rate = byLevel(ctx, [0.36, 0.48, 0.6]);
    const wobble = byLevel(ctx, [0.2, 0.28, 0.35]);
    const half = byLevel(ctx, [0.075, 0.058, 0.045]);
    const mid = rand(ctx.rng, 0.55, 0.8);
    const lo = mid - half;
    const hi = mid + half;
    // Two slow waves with random phases, so the flow speeds up and eases off unpredictably.
    const p1 = ctx.rng() * Math.PI * 2;
    const p2 = ctx.rng() * Math.PI * 2;
    const flow = (t: number) => rate * (1 + wobble * (0.6 * Math.sin(t * 2.3 + p1) + 0.4 * Math.sin(t * 5.1 + p2)));
    let level = 0;
    let pouring = true;
    let verdict: 'spilled' | 'short' | 'perfect' | null = null;
    return {
      update(dt, t) {
        if (!pouring || ctx.over) return;
        level += flow(t) * dt;
        if (level > hi) {
          pouring = false;
          verdict = 'spilled';
          ctx.lose();
        }
      },
      draw(g) {
        const glass = { x: 110, y: 170, w: 140, h: 320 };
        fillBg(g, '#3b3185', '#1c1545');
        // Tap.
        roundRect(g, 150, 40, 120, 34, 10, '#9aa');
        roundRect(g, 160, 70, 26, 40, 6, '#9aa');
        if (pouring && !ctx.over) roundRect(g, 166, 110, 14, glass.y + glass.h - 110 - level * glass.h, 6, '#f4a640');
        // Drink.
        const fill = Math.min(level, 1.05);
        roundRect(g, glass.x + 6, glass.y + glass.h * (1 - fill), glass.w - 12, glass.h * fill - 6, 8, '#f4a640');
        // A thin froth line right on the true level, so what you see is what's scored.
        if (fill > 0.02) roundRect(g, glass.x + 6, glass.y + glass.h * (1 - fill) - 2, glass.w - 12, 4, 2, '#fff6dc');
        // Glass.
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 6;
        g.strokeRect(glass.x, glass.y, glass.w, glass.h);
        // Target band.
        g.fillStyle = 'rgba(255,209,102,0.25)';
        g.fillRect(glass.x - 20, glass.y + glass.h * (1 - hi), glass.w + 40, glass.h * (hi - lo));
        g.strokeStyle = PALETTE.accent;
        g.lineWidth = 3;
        g.setLineDash([8, 6]);
        for (const v of [lo, hi]) {
          g.beginPath();
          g.moveTo(glass.x - 20, glass.y + glass.h * (1 - v));
          g.lineTo(glass.x + glass.w + 20, glass.y + glass.h * (1 - v));
          g.stroke();
        }
        g.setLineDash([]);
        if (verdict === 'spilled') label(g, 'SPILLED!', 180, 530, 34, PALETTE.danger);
        else if (verdict === 'short') label(g, 'NOT ENOUGH!', 180, 530, 34, PALETTE.danger);
        else if (verdict === 'perfect') label(g, 'PERFECT!', 180, 530, 34, PALETTE.accent);
        else if (!ctx.over) label(g, 'Tap to stop in the lines!', 180, 530, 24, PALETTE.muted);
      },
      down() {
        if (!pouring) return;
        pouring = false;
        // A hair of leeway on the bottom line.
        if (level >= lo - 0.006) {
          verdict = 'perfect';
          ctx.win();
        } else {
          verdict = 'short';
          ctx.lose();
        }
      },
    };
  },
};

/** Tap the phone that's ringing. */
export const answer: MicrogameImpl = {
  create(ctx) {
    const count = byLevel(ctx, [3, 4, 6]);
    // Two columns; an odd one out sits centred on the last row.
    const rows = Math.ceil(count / 2);
    const cellW = W / 2;
    const cellH = (H - 120) / rows;
    const box = Math.min(cellW, cellH) - 30;
    const phones = Array.from({ length: count }, (_, i) => {
      const row = Math.floor(i / 2);
      const alone = count % 2 === 1 && i === count - 1;
      return { x: alone ? W / 2 : cellW * ((i % 2) + 0.5), y: 90 + cellH * (row + 0.5) };
    });
    let ringing = randInt(ctx.rng, 0, count - 1);
    // At level 3 the ring hops to another phone part way through.
    const hopAt = ctx.level >= 3 ? rand(ctx.rng, 0.9, 1.6) : Infinity;
    let hopped = false;
    let tapped = -1;
    return {
      update(_dt, t) {
        if (!hopped && t >= hopAt && !ctx.over) {
          hopped = true;
          ringing = (ringing + 1 + randInt(ctx.rng, 0, count - 2)) % count;
        }
      },
      draw(g, t) {
        fillBg(g, '#2c2366', '#140f2e');
        phones.forEach((ph, i) => {
          const isRinging = i === ringing && !ctx.over;
          const shake = isRinging ? Math.sin(t * 60) * 0.18 : 0;
          const fill = i === tapped ? (i === ringing ? PALETTE.correct : PALETTE.danger) : isRinging ? '#5b4fb0' : PALETTE.panelLight;
          roundRect(g, ph.x - box / 2, ph.y - box / 2, box, box, 20, fill);
          emoji(g, '☎️', ph.x, ph.y + 4, box * 0.5, { rot: shake });
          if (isRinging) {
            // Ring marks either side of the handset, inside its box.
            g.strokeStyle = PALETTE.accent;
            g.lineWidth = 4;
            g.lineCap = 'round';
            const pulse = (t * 3) % 1;
            for (const s of [-1, 1]) {
              for (const r of [box * 0.3, box * 0.38]) {
                g.globalAlpha = 1 - pulse * 0.6;
                g.beginPath();
                g.arc(ph.x, ph.y + 4, r + pulse * 4, s < 0 ? Math.PI * 0.8 : -Math.PI * 0.2, s < 0 ? Math.PI * 1.2 : Math.PI * 0.2);
                g.stroke();
              }
            }
            g.globalAlpha = 1;
          }
        });
      },
      down(p) {
        const i = phones.findIndex((ph) => Math.abs(p.x - ph.x) < box / 2 + 8 && Math.abs(p.y - ph.y) < box / 2 + 8);
        if (i < 0) return;
        tapped = i;
        if (i === ringing) ctx.win();
        else ctx.lose();
      },
    };
  },
};

/** Pairs that look alike: one of the second hides among the first (or the other way round). */
const LOOKALIKES: [string, string][] = [
  ['😀', '😃'],
  ['🙂', '🙃'],
  ['🍎', '🍅'],
  ['🐶', '🐺'],
  ['🌲', '🌳'],
  ['🍊', '🍑'],
  ['🐢', '🐊'],
  ['🚗', '🚙'],
  ['⭐', '🌟'],
  ['🌕', '🌝'],
  ['😺', '😸'],
  ['🐭', '🐹'],
];

/** Tap the one that's different. */
export const odd: MicrogameImpl = {
  create(ctx) {
    const n = byLevel(ctx, [3, 4, 5]);
    let [common, rare] = pick(ctx.rng, LOOKALIKES);
    if (ctx.rng() < 0.5) [common, rare] = [rare, common];
    const target = randInt(ctx.rng, 0, n * n - 1);
    const size = Math.min(320 / n, 400 / n);
    const left = (W - size * n) / 2;
    const top = 110 + (420 - size * n) / 2;
    let tapped = -1;
    return {
      draw(g) {
        fillBg(g, '#3b3185', '#1c1545');
        for (let i = 0; i < n * n; i++) {
          const cx = left + (i % n) * size + size / 2;
          const cy = top + Math.floor(i / n) * size + size / 2;
          if (i === tapped) circle(g, cx, cy, size * 0.48, i === target ? PALETTE.correct : PALETTE.danger);
          else if (ctx.over && i === target) circle(g, cx, cy, size * 0.48, PALETTE.correct);
          emoji(g, i === target ? rare : common, cx, cy, size * 0.7);
        }
      },
      down(p) {
        const col = Math.floor((p.x - left) / size);
        const row = Math.floor((p.y - top) / size);
        if (col < 0 || row < 0 || col >= n || row >= n) return;
        tapped = row * n + col;
        if (tapped === target) ctx.win();
        else ctx.lose();
      },
    };
  },
};

/** Tap every target. They drift at higher levels. */
export const targets: MicrogameImpl = {
  create(ctx) {
    const count = byLevel(ctx, [3, 5, 6]);
    const r = byLevel(ctx, [34, 30, 26]);
    const speed = byLevel(ctx, [0, 60, 100]);
    const list: { x: number; y: number; vx: number; vy: number; hit: number }[] = [];
    for (let tries = 0; list.length < count && tries < 200; tries++) {
      const x = rand(ctx.rng, 50, W - 50);
      const y = rand(ctx.rng, 120, H - 60);
      if (list.every((o) => dist(o.x, o.y, x, y) > r * 2.6)) {
        const a = ctx.rng() * Math.PI * 2;
        list.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, hit: -1 });
      }
    }
    return {
      update(dt) {
        for (const o of list) {
          if (o.hit >= 0) {
            o.hit += dt;
            continue;
          }
          o.x += o.vx * dt;
          o.y += o.vy * dt;
          if (o.x < r || o.x > W - r) o.vx *= -1;
          if (o.y < 100 || o.y > H - r) o.vy *= -1;
        }
      },
      draw(g) {
        fillBg(g, '#7a1f3a', '#3a0d1c');
        for (let i = 0; i < W; i += 60) {
          g.fillStyle = 'rgba(255,255,255,0.05)';
          g.fillRect(i, 0, 30, H);
        }
        for (const o of list) {
          if (o.hit < 0) emoji(g, '🎯', o.x, o.y, r * 2.2);
          else if (o.hit < 0.4) emoji(g, '💥', o.x, o.y, r * 2.4, { alpha: 1 - o.hit / 0.4 });
        }
        label(g, `${list.filter((o) => o.hit >= 0).length}/${list.length}`, W / 2, 80, 30, PALETTE.accent);
      },
      down(p) {
        const o = list.find((t) => t.hit < 0 && dist(p.x, p.y, t.x, t.y) < r + 10);
        if (!o) return;
        o.hit = 0;
        if (list.every((t) => t.hit >= 0)) ctx.win();
      },
    };
  },
};

/** The cannon swings; tap to fire when it's aimed at the target. One shot. */
export const cannon: MicrogameImpl = {
  create(ctx) {
    const swing = byLevel(ctx, [2.0, 2.8, 3.6]);
    const r = byLevel(ctx, [36, 29, 23]);
    const target = { x: rand(ctx.rng, 60, W - 60), y: 120 };
    const base = { x: 180, y: 500 };
    const phase = ctx.rng() * Math.PI * 2;
    let angle = -Math.PI / 2;
    let ball: { x: number; y: number; vx: number; vy: number } | null = null;
    let outcome: 'hit' | 'miss' | null = null;
    return {
      update(dt, t) {
        if (!ball) angle = -Math.PI / 2 + Math.sin(t * swing + phase) * 0.9;
        if (ball && !outcome) {
          const prevY = ball.y;
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;
          if (prevY > target.y && ball.y <= target.y) {
            // Where it crossed the target's height.
            const u = (prevY - target.y) / (prevY - ball.y);
            const crossX = ball.x - ball.vx * dt * (1 - u);
            if (Math.abs(crossX - target.x) < r) {
              outcome = 'hit';
              ctx.win();
            }
          }
          if (!outcome && (ball.y < 0 || ball.x < -20 || ball.x > W + 20)) {
            outcome = 'miss';
            ctx.lose();
          }
        }
      },
      draw(g) {
        fillBg(g, '#5ec8f2', '#bde8ff');
        roundRect(g, 0, 520, W, 40, 0, '#4caf6a');
        if (outcome === 'hit') emoji(g, '💥', target.x, target.y, r * 3);
        else {
          circle(g, target.x, target.y, r, '#ffffff');
          circle(g, target.x, target.y, r * 0.66, PALETTE.danger);
          circle(g, target.x, target.y, r * 0.33, '#ffffff');
        }
        // Aim guide.
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.setLineDash([6, 10]);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(base.x, base.y);
        g.lineTo(base.x + Math.cos(angle) * 220, base.y + Math.sin(angle) * 220);
        g.stroke();
        g.setLineDash([]);
        g.save();
        g.translate(base.x, base.y);
        g.rotate(angle);
        roundRect(g, 0, -18, 90, 36, 10, '#333');
        g.restore();
        circle(g, base.x, base.y, 34, '#555');
        if (ball && outcome !== 'hit') circle(g, ball.x, ball.y, 12, '#222');
        if (outcome === 'miss') label(g, 'MISSED!', 180, 300, 48, PALETTE.danger);
      },
      down() {
        if (ball) return;
        ball = { x: base.x + Math.cos(angle) * 90, y: base.y + Math.sin(angle) * 90, vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900 };
      },
    };
  },
};

/** Tap to drop the sliding block onto the tower. Overhangs get trimmed; miss it and you lose. */
export const stack: MicrogameImpl = {
  create(ctx) {
    const need = byLevel(ctx, [4, 5, 6]);
    const speed = byLevel(ctx, [170, 230, 290]);
    const blockH = 38;
    const colors = [PALETTE.danger, PALETTE.accent, PALETTE.correct, PALETTE.blue, PALETTE.purple, PALETTE.pink];
    const placed: { x: number; w: number }[] = [{ x: 80, w: 200 }];
    let moving = { x: 0, w: 200, dir: 1 };
    let falling: { x: number; w: number; y: number; vy: number } | null = null;
    const topY = () => 520 - placed.length * blockH;
    return {
      update(dt) {
        if (!ctx.over) {
          moving.x += moving.dir * speed * dt;
          if (moving.x < 0) moving.dir = 1;
          if (moving.x + moving.w > W) moving.dir = -1;
        }
        if (falling) {
          falling.vy += 1400 * dt;
          falling.y += falling.vy * dt;
        }
      },
      draw(g) {
        fillBg(g, '#2c2366', '#140f2e');
        roundRect(g, 40, 520, 280, 40, 6, '#4a4570');
        placed.forEach((b, i) => roundRect(g, b.x, 520 - (i + 1) * blockH, b.w, blockH - 3, 6, colors[i % colors.length]));
        if (!ctx.over) roundRect(g, moving.x, topY() - blockH, moving.w, blockH - 3, 6, colors[placed.length % colors.length]);
        if (falling) roundRect(g, falling.x, falling.y, falling.w, blockH - 3, 6, 'rgba(255,255,255,0.5)');
        label(g, `${placed.length - 1}/${need}`, 180, 70, 34, PALETTE.accent);
      },
      down() {
        const top = placed[placed.length - 1];
        const left = Math.max(top.x, moving.x);
        const right = Math.min(top.x + top.w, moving.x + moving.w);
        const y = topY() - blockH;
        if (right - left < 6) {
          falling = { x: moving.x, w: moving.w, y, vy: 0 };
          ctx.lose();
          return;
        }
        // The overhang falls off.
        if (moving.x < left) falling = { x: moving.x, w: left - moving.x, y, vy: 0 };
        else if (moving.x + moving.w > right) falling = { x: right, w: moving.x + moving.w - right, y, vy: 0 };
        placed.push({ x: left, w: right - left });
        if (placed.length - 1 >= need) {
          ctx.win();
          return;
        }
        const fromLeft = placed.length % 2 === 0;
        moving = { x: fromLeft ? 0 : W - (right - left), w: right - left, dir: fromLeft ? 1 : -1 };
      },
    };
  },
};

/** Tap to jump each time the rope comes round. Survive to win. */
export const jump: MicrogameImpl = {
  survive: true,
  create(ctx) {
    const period = byLevel(ctx, [1.15, 0.95, 0.8]);
    const AIR = 0.45;
    const FEET = 515;
    // The rope first sweeps under the feet at t = 1s.
    const ropeAngle = (t: number) => Math.PI + (2 * Math.PI * (t - 1)) / period;
    let air = -1;
    let prevAngle = ropeAngle(0);
    let angle = prevAngle;
    let tripped = false;
    const height = () => (air < 0 ? 0 : 4 * 80 * (air / AIR) * (1 - air / AIR));
    return {
      update(dt, t) {
        if (air >= 0) {
          air += dt;
          if (air >= AIR) air = -1;
        }
        if (tripped || ctx.over) return;
        prevAngle = angle;
        angle = ropeAngle(t);
        // Did the rope pass the bottom of its swing this frame?
        const turns = (a: number) => Math.floor((a - Math.PI) / (2 * Math.PI));
        if (turns(angle) > turns(prevAngle) && height() < 22) {
          tripped = true;
          ctx.lose();
        }
      },
      draw(g) {
        fillBg(g, '#5ec8f2', '#bde8ff');
        roundRect(g, 0, 520, W, 40, 0, '#4caf6a');
        const depth = -Math.cos(angle); // 1 at the feet, -1 overhead
        const midY = 380 + depth * 140;
        const behind = Math.sin(angle) < 0;
        const drawRope = () => {
          g.strokeStyle = '#ff5d73';
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(60, 380);
          g.quadraticCurveTo(180, 2 * midY - 380, 300, 380);
          g.stroke();
        };
        if (behind) drawRope();
        emoji(g, tripped ? '😵' : '🧍', 180, FEET - 50 - height(), 100, { rot: tripped ? Math.PI / 2 : 0 });
        if (!behind) drawRope();
        emoji(g, '🧒', 40, 420, 70);
        emoji(g, '🧒', 320, 420, 70, { flip: true });
      },
      down() {
        if (air < 0) air = 0;
      },
    };
  },
};

/** Tap the ball to keep it in the air. Survive to win. */
export const bounce: MicrogameImpl = {
  survive: true,
  create(ctx) {
    const gravity = byLevel(ctx, [700, 850, 1000]);
    const kick = byLevel(ctx, [560, 620, 690]);
    const r = 36;
    const ball = { x: 180, y: 130, vx: rand(ctx.rng, -60, 60), vy: 0, spin: 0 };
    let landed = false;
    return {
      update(dt) {
        if (landed) return;
        ball.vy += gravity * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.spin += ball.vx * dt * 0.03;
        if (ball.x < r || ball.x > W - r) {
          ball.vx *= -1;
          ball.x = clamp(ball.x, r, W - r);
        }
        if (ball.y < r) {
          ball.vy = Math.abs(ball.vy);
          ball.y = r;
        }
        if (ball.y > 520 - r && !ctx.over) {
          landed = true;
          ball.y = 520 - r;
          ctx.lose();
        }
      },
      draw(g) {
        fillBg(g, '#5ec8f2', '#bde8ff');
        roundRect(g, 0, 520, W, 40, 0, '#4caf6a');
        emoji(g, '⚽', ball.x, ball.y, r * 2.1, { rot: ball.spin });
        if (landed) label(g, 'DROPPED IT!', 180, 260, 44, PALETTE.danger);
      },
      down(p) {
        if (dist(p.x, p.y, ball.x, ball.y) > r + 34) return;
        ball.vy = -kick;
        ball.vx = clamp((ball.x - p.x) * 5, -220, 220);
      },
    };
  },
};

/** Swipe up to flip the pancake while it's golden. Raw or burnt loses. */
export const flip: MicrogameImpl = {
  create(ctx) {
    const window = byLevel(ctx, [1.3, 1.0, 0.75]);
    const goldenAt = rand(ctx.rng, 1.2, Math.max(1.3, ctx.durationMs / 1000 - window - 0.5));
    let now = 0;
    let start: Pointer | null = null;
    let flipT = -1;
    let verdict: 'raw' | 'burnt' | 'perfect' | null = null;
    const golden = () => now >= goldenAt && now <= goldenAt + window;
    const color = () => {
      if (now < goldenAt) return mix('#f6e7b8', '#e9c46a', now / goldenAt);
      if (now <= goldenAt + window) return '#d99a2b';
      return mix('#d99a2b', '#3b2412', Math.min(1, (now - goldenAt - window) / 0.4));
    };
    return {
      update(dt, t) {
        if (flipT < 0) now = t;
        else flipT += dt;
        if (!ctx.over && now > goldenAt + window) {
          verdict = 'burnt';
          ctx.lose();
        }
      },
      draw(g) {
        fillBg(g, '#3b3185', '#1c1545');
        // Stove flame.
        emoji(g, '🔥', 180, 470, 70);
        // Pan.
        roundRect(g, 250, 382, 110, 18, 8, '#222');
        g.beginPath();
        g.ellipse(160, 390, 120, 34, 0, 0, Math.PI * 2);
        g.fillStyle = '#333';
        g.fill();
        // Pancake: tossed up while flipping.
        const lift = flipT >= 0 ? Math.sin(Math.min(1, flipT / 0.6) * Math.PI) * 180 : 0;
        const squash = flipT >= 0 ? Math.cos(Math.min(1, flipT / 0.6) * Math.PI * 2) : 1;
        g.beginPath();
        g.ellipse(160, 380 - lift, 85, Math.max(4, Math.abs(26 * squash)), 0, 0, Math.PI * 2);
        g.fillStyle = color();
        g.fill();
        if (golden() && flipT < 0) emoji(g, '✨', 240, 330, 40);
        if (verdict === 'raw') label(g, 'STILL RAW!', 180, 180, 48, PALETTE.danger);
        if (verdict === 'burnt') label(g, 'BURNT!', 180, 180, 56, PALETTE.danger);
        if (verdict === 'perfect') label(g, 'PERFECT!', 180, 180, 56, PALETTE.accent);
        if (!ctx.over) label(g, 'Swipe up to flip', 180, 540, 22, PALETTE.muted);
      },
      down(p) {
        start = p;
      },
      move(p) {
        if (!start || flipT >= 0 || start.y - p.y < 50) return;
        flipT = 0;
        verdict = golden() ? 'perfect' : 'raw';
        if (verdict === 'perfect') ctx.win();
        else ctx.lose();
      },
      up() {
        start = null;
      },
    };
  },
};

/** Blend two #rrggbb colours. */
function mix(a: string, b: string, u: number): string {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const k = clamp(u, 0, 1);
  return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * k)).join(',')})`;
}
