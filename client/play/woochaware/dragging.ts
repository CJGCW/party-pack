// Microgames played by dragging, swiping or rubbing.

import {
  H,
  PALETTE,
  W,
  byLevel,
  circle,
  clamp,
  dist,
  distToSegment,
  emoji,
  fillBg,
  label,
  pick,
  rand,
  randInt,
  roundRect,
  inkSprite,
  type MicrogameImpl,
  type Pointer,
} from './engine';
import noseUrl from './img/nose.png';

/** Drag the carrot up out of the ground. It sinks back if you let go. */
export const pull: MicrogameImpl = {
  create(ctx) {
    const resist = byLevel(ctx, [0.55, 0.45, 0.38]);
    const slide = byLevel(ctx, [30, 60, 90]);
    const NEEDED = 200;
    const GROUND = 330;
    let pulled = 0;
    let last: Pointer | null = null;
    let flyT = -1;
    return {
      update(dt) {
        if (flyT >= 0) flyT += dt;
        else if (!last) pulled = Math.max(0, pulled - slide * dt);
      },
      draw(g) {
        fillBg(g, '#5ec8f2', '#bde8ff');
        const fly = flyT >= 0 ? flyT * 600 : 0;
        const top = GROUND - 30 - pulled - fly;
        // Carrot: leaves on top, root pointing down.
        g.save();
        g.translate(180, top);
        if (flyT >= 0) g.rotate(flyT * 6);
        for (const a of [-0.5, 0, 0.5]) {
          g.save();
          g.rotate(a);
          roundRect(g, -8, -70, 16, 70, 8, PALETTE.correct);
          g.restore();
        }
        g.beginPath();
        g.moveTo(-34, 0);
        g.lineTo(34, 0);
        g.lineTo(0, 210);
        g.closePath();
        g.fillStyle = '#f08a24';
        g.fill();
        g.restore();
        // Ground in front of the buried part.
        roundRect(g, 0, GROUND, W, H - GROUND, 0, '#7a4a25');
        for (let i = 0; i < 14; i++) circle(g, (i * 53) % W, GROUND + 30 + ((i * 97) % 180), 6, '#5c3418');
        if (!ctx.over) label(g, 'Drag up!', 180, 520, 26, PALETTE.accent);
      },
      down(p) {
        last = p;
      },
      move(p) {
        if (!last) return;
        const dy = last.y - p.y;
        last = p;
        if (dy > 0) pulled += dy * resist;
        if (pulled >= NEEDED) {
          flyT = 0;
          ctx.win();
        }
      },
      up() {
        last = null;
      },
    };
  },
};

const FRUITS = ['🍉', '🍊', '🍎', '🍍', '🥝', '🍋', '🍑'];

/** Fruit is tossed up; swipe through every piece before it falls. */
export const slice: MicrogameImpl = {
  create(ctx) {
    const count = byLevel(ctx, [2, 3, 4]);
    const gap = byLevel(ctx, [0.6, 0.45, 0.35]);
    const fruits = Array.from({ length: count }, (_, i) => ({
      emoji: pick(ctx.rng, FRUITS),
      launchAt: 0.3 + i * gap,
      x: rand(ctx.rng, 70, W - 70),
      y: H + 40,
      vx: rand(ctx.rng, -50, 50),
      vy: -rand(ctx.rng, 640, 720),
      launched: false,
      cut: -1,
    }));
    let last: Pointer | null = null;
    const trail: { x: number; y: number; age: number }[] = [];
    return {
      update(dt, t) {
        for (const f of fruits) {
          if (!f.launched) {
            if (t >= f.launchAt) f.launched = true;
            else continue;
          }
          f.vy += 700 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          if (f.cut >= 0) f.cut += dt;
          else if (f.vy > 0 && f.y > H + 40 && !ctx.over) ctx.lose();
        }
        for (const p of trail) p.age += dt;
        while (trail.length && trail[0].age > 0.15) trail.shift();
      },
      draw(g) {
        fillBg(g, '#3b2a1a', '#1f150c');
        for (const f of fruits) {
          if (!f.launched) continue;
          if (f.cut < 0) emoji(g, f.emoji, f.x, f.y, 70);
          else {
            const spread = f.cut * 120;
            emoji(g, f.emoji, f.x - spread, f.y, 70, { rot: -f.cut * 4, alpha: 0.8 });
            emoji(g, f.emoji, f.x + spread, f.y, 70, { rot: f.cut * 4, alpha: 0.8 });
          }
        }
        if (trail.length > 1) {
          g.strokeStyle = '#ffffff';
          g.lineWidth = 6;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(trail[0].x, trail[0].y);
          for (const p of trail) g.lineTo(p.x, p.y);
          g.stroke();
        }
      },
      down(p) {
        last = p;
      },
      move(p) {
        if (last) {
          for (const f of fruits) {
            if (f.launched && f.cut < 0 && distToSegment({ x: f.x, y: f.y }, last, p) < 38) f.cut = 0;
          }
          if (fruits.every((f) => f.cut >= 0)) ctx.win();
        }
        trail.push({ x: p.x, y: p.y, age: 0 });
        last = p;
      },
      up() {
        last = null;
      },
    };
  },
};

/** Follow the path from start to star without straying off it. */
export const trace: MicrogameImpl = {
  create(ctx) {
    const tol = byLevel(ctx, [30, 24, 19]);
    const bends = byLevel(ctx, [3, 4, 5]);
    // Zig-zag waypoints from the bottom to the top, smoothed into a curve.
    const way: Pointer[] = [{ x: 180, y: 510 }];
    for (let i = 1; i <= bends; i++) way.push({ x: i % 2 ? rand(ctx.rng, 50, 120) : rand(ctx.rng, 240, 310), y: 510 - (i * 420) / (bends + 1) });
    way.push({ x: rand(ctx.rng, 120, 240), y: 80 });
    const path: Pointer[] = [];
    for (let i = 0; i < way.length - 1; i++) {
      const p0 = way[Math.max(0, i - 1)];
      const p1 = way[i];
      const p2 = way[i + 1];
      const p3 = way[Math.min(way.length - 1, i + 2)];
      for (let s = 0; s < 20; s++) {
        const u = s / 20;
        const u2 = u * u;
        const u3 = u2 * u;
        path.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
        });
      }
    }
    path.push(way[way.length - 1]);
    let progress = 0;
    let tracing = false;
    let offAt: Pointer | null = null;
    const strokePath = (g: CanvasRenderingContext2D, upTo: number) => {
      g.beginPath();
      g.moveTo(path[0].x, path[0].y);
      for (let i = 1; i <= upTo; i++) g.lineTo(path[i].x, path[i].y);
      g.stroke();
    };
    return {
      draw(g, t) {
        fillBg(g, '#2c2366', '#140f2e');
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.strokeStyle = PALETTE.panelLight;
        g.lineWidth = tol * 2;
        strokePath(g, path.length - 1);
        g.strokeStyle = PALETTE.accent;
        g.lineWidth = 10;
        strokePath(g, progress);
        emoji(g, '⭐', path[path.length - 1].x, path[path.length - 1].y, 50);
        const at = path[progress];
        if (!ctx.over) circle(g, at.x, at.y, 14 + Math.sin(t * 8) * 3, PALETTE.danger);
        if (offAt) emoji(g, '❌', offAt.x, offAt.y, 40);
        if (!ctx.over && !tracing) label(g, progress === 0 ? 'Start at the dot' : 'Keep going from the dot', 180, 540, 22, PALETTE.muted);
      },
      down(p) {
        if (dist(p.x, p.y, path[progress].x, path[progress].y) < tol + 16) tracing = true;
      },
      move(p) {
        if (!tracing) return;
        // Look a little behind and ahead, so you can't skip across a bend.
        let best = progress;
        let bestD = Infinity;
        for (let i = Math.max(0, progress - 6); i <= Math.min(path.length - 1, progress + 10); i++) {
          const d = dist(p.x, p.y, path[i].x, path[i].y);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (bestD > tol) {
          offAt = p;
          ctx.lose();
          return;
        }
        progress = Math.max(progress, best);
        if (progress >= path.length - 2) ctx.win();
      },
      up() {
        tracing = false;
      },
    };
  },
};

/** Drag the bone away from the dog, but freeze whenever it looks. */
export const sneak: MicrogameImpl = {
  create(ctx) {
    const awayRange = byLevel(ctx, [[1.0, 1.7], [0.8, 1.4], [0.6, 1.1]] as const);
    const warnFor = byLevel(ctx, [0.45, 0.35, 0.28]);
    let state: 'away' | 'warn' | 'look' = 'away';
    let until = rand(ctx.rng, 0.9, 1.4);
    const bone = { x: 180, y: 250 };
    let holding = false;
    let last: Pointer | null = null;
    let caught = false;
    const GOAL = 470;
    return {
      update(_dt, t) {
        if (ctx.over) return;
        if (t >= until) {
          if (state === 'away') {
            state = 'warn';
            until = t + warnFor;
          } else if (state === 'warn') {
            state = 'look';
            until = t + rand(ctx.rng, 0.7, 1.2);
          } else {
            state = 'away';
            until = t + rand(ctx.rng, awayRange[0], awayRange[1]);
          }
        }
      },
      draw(g) {
        fillBg(g, '#6fbf73', '#3f8a46');
        roundRect(g, 60, GOAL, 240, 80, 20, 'rgba(0,0,0,0.2)');
        label(g, 'SAFE', 180, GOAL + 40, 26, '#ffffff');
        // The dog faces left when looking at you, right when looking away.
        const looking = state === 'look' || caught;
        emoji(g, '🐕', 180, 140, 120, { flip: !looking });
        if (caught) label(g, 'WOOF!', 180, 60, 48, PALETTE.danger);
        else if (state === 'look') label(g, '!', 250, 70, 64, PALETTE.danger);
        else if (state === 'warn') label(g, '?', 250, 70, 56, PALETTE.accent);
        else label(g, '♪', 110, 80, 40, '#ffffff');
        emoji(g, '🦴', bone.x, bone.y, 64, { rot: -0.4 });
        if (holding && !ctx.over) emoji(g, '✋', bone.x + 20, bone.y + 28, 50);
      },
      down(p) {
        if (dist(p.x, p.y, bone.x, bone.y) < 70) {
          holding = true;
          last = p;
        }
      },
      move(p) {
        if (!holding || !last) return;
        const moved = dist(p.x, p.y, last.x, last.y);
        bone.x = clamp(bone.x + p.x - last.x, 30, W - 30);
        bone.y = clamp(bone.y + p.y - last.y, 200, H - 30);
        last = p;
        if (state === 'look' && moved > 3) {
          caught = true;
          ctx.lose();
          return;
        }
        if (bone.y > GOAL + 20) ctx.win();
      },
      up() {
        holding = false;
        last = null;
      },
    };
  },
};

/** Slide the basket under every egg. Drop one and you lose. */
export const catchEggs: MicrogameImpl = {
  create(ctx) {
    const count = byLevel(ctx, [3, 4, 5]);
    const speed = byLevel(ctx, [230, 290, 350]);
    const spacing = ((ctx.durationMs / 1000) * 0.75) / count;
    const eggs = Array.from({ length: count }, (_, i) => ({ x: rand(ctx.rng, 40, W - 40), y: 90, at: 0.3 + i * spacing, state: 'wait' as 'wait' | 'fall' | 'caught' | 'broken' }));
    let basket = 180;
    let caught = 0;
    let hen = eggs[0].x;
    return {
      update(dt, t) {
        const next = eggs.find((e) => e.state === 'wait');
        if (next) hen += clamp(next.x - hen, -500 * dt, 500 * dt);
        for (const e of eggs) {
          if (e.state === 'wait' && t >= e.at) e.state = 'fall';
          if (e.state !== 'fall') continue;
          e.y += speed * dt;
          if (e.y >= 490) {
            if (Math.abs(e.x - basket) < 52) {
              e.state = 'caught';
              caught++;
              if (caught === count) ctx.win();
            } else if (!ctx.over) {
              e.state = 'broken';
              e.y = 525;
              ctx.lose();
            }
          }
        }
      },
      draw(g) {
        fillBg(g, '#ffe9b8', '#f4c77a');
        roundRect(g, 0, 530, W, 30, 0, '#7a4a25');
        emoji(g, '🐔', hen, 60, 64);
        for (const e of eggs) {
          if (e.state === 'fall') emoji(g, '🥚', e.x, e.y, 44);
          if (e.state === 'broken') emoji(g, '🍳', e.x, e.y, 54);
        }
        emoji(g, '🧺', basket, 500, 92);
        label(g, `${caught}/${count}`, 320, 60, 28, PALETTE.bg);
      },
      down(p) {
        basket = clamp(p.x, 40, W - 40);
      },
      move(p) {
        basket = clamp(p.x, 40, W - 40);
      },
    };
  },
};

/** Rub the grime off the plate. */
export const scrub: MicrogameImpl = {
  create(ctx) {
    const brush = byLevel(ctx, [36, 31, 27]);
    const cx = 180;
    const cy = 290;
    const STEP = 14;
    const cells: { x: number; y: number; r: number; dirty: boolean }[] = [];
    for (let x = cx - 126; x <= cx + 126; x += STEP)
      for (let y = cy - 126; y <= cy + 126; y += STEP)
        if (dist(x, y, cx, cy) < 118) cells.push({ x: x + rand(ctx.rng, -3, 3), y: y + rand(ctx.rng, -3, 3), r: rand(ctx.rng, 8, 12), dirty: true });
    let sponge: Pointer | null = null;
    let last: Pointer | null = null;
    const clean = (p: Pointer) => {
      for (const c of cells) if (c.dirty && dist(p.x, p.y, c.x, c.y) < brush) c.dirty = false;
    };
    const cleaned = () => cells.filter((c) => !c.dirty).length / cells.length;
    return {
      draw(g, t) {
        fillBg(g, '#5ec8f2', '#2b7fa8');
        circle(g, cx, cy, 150, '#e8e8f0');
        circle(g, cx, cy, 122, '#ffffff');
        for (const c of cells) if (c.dirty) circle(g, c.x, c.y, c.r, '#8a6a3a');
        if (ctx.over && cleaned() >= 0.92) emoji(g, '✨', cx + 90, cy - 100 + Math.sin(t * 6) * 6, 54);
        if (sponge && !ctx.over) emoji(g, '🧽', sponge.x, sponge.y, 64);
        label(g, `${Math.round(cleaned() * 100)}%`, 180, 500, 30, PALETTE.text);
      },
      down(p) {
        sponge = last = p;
        clean(p);
      },
      move(p) {
        // Clean along the stroke, not just where the finger landed.
        const steps = Math.ceil(dist(p.x, p.y, last!.x, last!.y) / 8);
        for (let i = 1; i <= steps; i++) clean({ x: last!.x + ((p.x - last!.x) * i) / steps, y: last!.y + ((p.y - last!.y) * i) / steps });
        sponge = last = p;
        if (cleaned() >= 0.92) ctx.win();
      },
      up() {
        sponge = null;
      },
    };
  },
};

/** Circle your finger around the pizza to spin it. */
export const twirl: MicrogameImpl = {
  create(ctx) {
    const turns = byLevel(ctx, [2.5, 3.5, 4.5]);
    const cx = 180;
    const cy = 290;
    let total = 0;
    let lastAngle: number | null = null;
    const toppings = Array.from({ length: 9 }, () => ({ a: ctx.rng() * Math.PI * 2, d: rand(ctx.rng, 0.2, 0.75) }));
    const progress = () => Math.min(1, Math.abs(total) / (turns * Math.PI * 2));
    return {
      draw(g) {
        fillBg(g, '#2c2366', '#140f2e');
        const r = 70 + progress() * 70;
        g.strokeStyle = 'rgba(255,255,255,0.18)';
        g.setLineDash([10, 12]);
        g.lineWidth = 4;
        g.beginPath();
        g.arc(cx, cy, 160, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.save();
        g.translate(cx, cy);
        g.rotate(total);
        circle(g, 0, 0, r, '#f2d29b');
        circle(g, 0, 0, r * 0.82, '#d9452b');
        circle(g, 0, 0, r * 0.75, '#ffd98a');
        for (const tp of toppings) circle(g, Math.cos(tp.a) * tp.d * r, Math.sin(tp.a) * tp.d * r, r * 0.11, '#a3202a');
        g.restore();
        label(g, `${Math.round(progress() * 100)}%`, 180, 500, 30);
        if (!ctx.over) label(g, 'Draw circles around it!', 180, 70, 24, PALETTE.muted);
      },
      down(p) {
        lastAngle = dist(p.x, p.y, cx, cy) > 25 ? Math.atan2(p.y - cy, p.x - cx) : null;
      },
      move(p) {
        if (dist(p.x, p.y, cx, cy) < 25) return;
        const a = Math.atan2(p.y - cy, p.x - cx);
        if (lastAngle !== null) {
          let d = a - lastAngle;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          total += d;
        }
        lastAngle = a;
        if (progress() >= 1) ctx.win();
      },
      up() {
        lastAngle = null;
      },
    };
  },
};

/** Drag back and forth to saw through the log. */
export const saw: MicrogameImpl = {
  create(ctx) {
    const need = byLevel(ctx, [6, 8, 10]);
    let strokes = 0;
    let dir = 0;
    let travel = 0;
    let last: Pointer | null = null;
    let offset = 0;
    let splitT = -1;
    return {
      update(dt) {
        if (splitT >= 0) splitT += dt;
      },
      draw(g) {
        fillBg(g, '#6fbf73', '#3f8a46');
        const depth = (strokes / need) * 90;
        const split = splitT >= 0 ? Math.min(60, splitT * 200) : 0;
        // Log, in two halves once cut.
        for (const side of [-1, 1]) {
          const x0 = side < 0 ? 30 - split : 180 + split;
          roundRect(g, x0, 280, 150, 90, 6, '#a0662f');
        }
        g.beginPath();
        g.ellipse(30 - split, 325, 22, 45, 0, 0, Math.PI * 2);
        g.fillStyle = '#e0b07a';
        g.fill();
        // Cut.
        roundRect(g, 176, 280, 8, depth, 2, '#3b2412');
        if (splitT < 0) {
          // Saw blade riding in the cut.
          const x = 180 + offset;
          roundRect(g, x - 110, 200 + depth, 220, 44, 4, '#c9ccd6');
          for (let i = -110; i < 110; i += 14) {
            g.beginPath();
            g.moveTo(x + i, 244 + depth);
            g.lineTo(x + i + 7, 256 + depth);
            g.lineTo(x + i + 14, 244 + depth);
            g.fillStyle = '#c9ccd6';
            g.fill();
          }
          roundRect(g, x + 100, 190 + depth, 50, 60, 12, '#7a1f3a');
        }
        label(g, `${strokes}/${need}`, 180, 470, 30);
        if (!ctx.over) label(g, 'Drag left and right!', 180, 120, 24, PALETTE.text);
      },
      down(p) {
        last = p;
      },
      move(p) {
        if (!last) return;
        const dx = p.x - last.x;
        last = p;
        offset = clamp(offset + dx, -70, 70);
        if (dx === 0) return;
        const d = Math.sign(dx);
        if (d !== dir) {
          if (dir !== 0 && travel >= 60) strokes++;
          dir = d;
          travel = 0;
        }
        travel += Math.abs(dx);
        if (strokes >= need) {
          splitT = 0;
          ctx.win();
        }
      },
      up() {
        last = null;
      },
    };
  },
};

/** Drag the marble out of the maze without crossing a wall. */
export const maze: MicrogameImpl = {
  create(ctx) {
    const [cols, rows] = byLevel(ctx, [[4, 5], [5, 6], [6, 7]] as const);
    const left = 20;
    const top = 100;
    const cw = 320 / cols;
    const ch = 420 / rows;
    // walls[c][r] = [north, east, south, west]
    const walls = Array.from({ length: cols }, () => Array.from({ length: rows }, () => [true, true, true, true]));
    const seen = Array.from({ length: cols }, () => Array<boolean>(rows).fill(false));
    const stack: [number, number][] = [[0, 0]];
    seen[0][0] = true;
    const dirs: [number, number, number, number][] = [
      [0, -1, 0, 2],
      [1, 0, 1, 3],
      [0, 1, 2, 0],
      [-1, 0, 3, 1],
    ];
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const options = dirs.filter(([dc, dr]) => {
        const nc = c + dc;
        const nr = r + dr;
        return nc >= 0 && nr >= 0 && nc < cols && nr < rows && !seen[nc][nr];
      });
      if (!options.length) {
        stack.pop();
        continue;
      }
      const [dc, dr, wall, opposite] = pick(ctx.rng, options);
      walls[c][r][wall] = false;
      walls[c + dc][r + dr][opposite] = false;
      seen[c + dc][r + dr] = true;
      stack.push([c + dc, r + dr]);
    }
    const marble = { x: left + cw / 2, y: top + ch / 2 };
    const radius = Math.min(cw, ch) * 0.28;
    const cellOf = (p: Pointer) => [Math.floor((p.x - left) / cw), Math.floor((p.y - top) / ch)] as const;
    let holding = false;
    let bumped: Pointer | null = null;
    /** Can the marble go from cell a to the neighbouring cell b? */
    const open = (ac: number, ar: number, bc: number, br: number) => {
      const d = dirs.find(([dc, dr]) => ac + dc === bc && ar + dr === br);
      return !!d && !walls[ac][ar][d[2]];
    };
    return {
      draw(g) {
        fillBg(g, '#2c2366', '#140f2e');
        roundRect(g, left + (cols - 1) * cw + 4, top + (rows - 1) * ch + 4, cw - 8, ch - 8, 10, 'rgba(76,175,106,0.5)');
        emoji(g, '🏁', left + (cols - 0.5) * cw, top + (rows - 0.5) * ch, Math.min(cw, ch) * 0.6);
        g.strokeStyle = PALETTE.muted;
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        for (let c = 0; c < cols; c++)
          for (let r = 0; r < rows; r++) {
            const x = left + c * cw;
            const y = top + r * ch;
            const [n, e, s, w] = walls[c][r];
            if (n) {
              g.moveTo(x, y);
              g.lineTo(x + cw, y);
            }
            if (e) {
              g.moveTo(x + cw, y);
              g.lineTo(x + cw, y + ch);
            }
            if (s) {
              g.moveTo(x, y + ch);
              g.lineTo(x + cw, y + ch);
            }
            if (w) {
              g.moveTo(x, y);
              g.lineTo(x, y + ch);
            }
          }
        g.stroke();
        circle(g, marble.x, marble.y, radius, PALETTE.accent);
        circle(g, marble.x - radius * 0.3, marble.y - radius * 0.3, radius * 0.3, 'rgba(255,255,255,0.6)');
        if (bumped) emoji(g, '💥', bumped.x, bumped.y, 50);
        if (!ctx.over && !holding) label(g, 'Drag the marble to the flag', 180, 70, 22, PALETTE.muted);
      },
      down(p) {
        holding = dist(p.x, p.y, marble.x, marble.y) < Math.max(40, radius * 2);
      },
      move(p) {
        if (!holding) return;
        // Walk from the marble to the finger in small steps, checking every cell boundary crossed.
        const steps = Math.max(1, Math.ceil(dist(p.x, p.y, marble.x, marble.y) / 4));
        const from = { ...marble };
        for (let i = 1; i <= steps; i++) {
          const q = { x: from.x + ((p.x - from.x) * i) / steps, y: from.y + ((p.y - from.y) * i) / steps };
          const [ac, ar] = cellOf(marble);
          const [bc, br] = cellOf(q);
          if (bc < 0 || br < 0 || bc >= cols || br >= rows || ((ac !== bc || ar !== br) && !open(ac, ar, bc, br))) {
            bumped = q;
            ctx.lose();
            return;
          }
          marble.x = q.x;
          marble.y = q.y;
        }
        const [c, r] = cellOf(marble);
        if (c === cols - 1 && r === rows - 1) ctx.win();
      },
      up() {
        holding = false;
      },
    };
  },
};

/** Keep the umbrella over them as they wander. Too much sun and they burn. */
export const shade: MicrogameImpl = {
  survive: true,
  create(ctx) {
    const speed = byLevel(ctx, [80, 120, 160]);
    const cover = byLevel(ctx, [56, 46, 38]);
    const limit = byLevel(ctx, [0.9, 0.7, 0.5]);
    const person = { x: rand(ctx.rng, 100, 260), dir: ctx.rng() < 0.5 ? -1 : 1 };
    let turnIn = rand(ctx.rng, 0.6, 1.2);
    let umbrella = person.x;
    let burn = 0;
    return {
      update(dt) {
        if (ctx.over) return;
        turnIn -= dt;
        if (turnIn <= 0) {
          person.dir *= -1;
          turnIn = rand(ctx.rng, 0.5, 1.3);
        }
        person.x += person.dir * speed * dt;
        if (person.x < 40 || person.x > W - 40) {
          person.dir *= -1;
          person.x = clamp(person.x, 40, W - 40);
        }
        if (Math.abs(umbrella - person.x) > cover) burn += dt;
        else burn = Math.max(0, burn - dt * 0.5);
        if (burn >= limit) ctx.lose();
      },
      draw(g, t) {
        fillBg(g, '#ffb347', '#ffe9b8');
        emoji(g, '☀️', 180, 70, 110, { rot: t });
        roundRect(g, 0, 500, W, 60, 0, '#f2d29b');
        const covered = Math.abs(umbrella - person.x) <= cover;
        // Shade on the sand.
        g.beginPath();
        g.ellipse(umbrella, 505, 70, 12, 0, 0, Math.PI * 2);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fill();
        emoji(g, ctx.over && !covered ? '🥵' : '🚶', person.x, 450, 90, { flip: person.dir > 0 });
        if (burn > 0) circle(g, person.x, 420, 26, `rgba(255,60,60,${Math.min(0.6, burn / limit)})`);
        emoji(g, '⛱️', umbrella, 340, 150);
        // Burn meter.
        roundRect(g, 60, 150, 240, 18, 9, 'rgba(0,0,0,0.25)');
        roundRect(g, 60, 150, Math.max(18, 240 * Math.min(1, burn / limit)), 18, 9, PALETTE.danger);
        label(g, 'SUNBURN', 180, 185, 18, PALETTE.bg);
      },
      down(p) {
        umbrella = clamp(p.x, 30, W - 30);
      },
      move(p) {
        umbrella = clamp(p.x, 30, W - 30);
      },
    };
  },
};

/** Drag to dodge the falling rocks. Survive to win. */
export const dodge: MicrogameImpl = {
  survive: true,
  create(ctx) {
    const every = byLevel(ctx, [0.45, 0.33, 0.25]);
    const speed = byLevel(ctx, [260, 330, 400]);
    const me = { x: 180, y: 470 };
    const rocks: { x: number; y: number; r: number; spin: number }[] = [];
    let spawnIn = 0.4;
    let last: Pointer | null = null;
    let hit = false;
    return {
      update(dt) {
        if (ctx.over) return;
        spawnIn -= dt;
        if (spawnIn <= 0) {
          spawnIn = every;
          rocks.push({ x: rand(ctx.rng, 20, W - 20), y: -30, r: rand(ctx.rng, 18, 28), spin: rand(ctx.rng, -4, 4) });
        }
        for (const r of rocks) {
          r.y += speed * dt;
          if (dist(r.x, r.y, me.x, me.y) < r.r + 22) {
            hit = true;
            ctx.lose();
          }
        }
      },
      draw(g, t) {
        fillBg(g, '#8a6a3a', '#4a3216');
        for (const r of rocks) {
          g.save();
          g.translate(r.x, r.y);
          g.rotate(r.spin * t);
          g.beginPath();
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const rr = r.r * (0.8 + ((i * 37) % 10) / 40);
            g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          g.closePath();
          g.fillStyle = '#8d8d8d';
          g.fill();
          g.restore();
        }
        emoji(g, hit ? '😵' : '🏃', me.x, me.y, 60);
      },
      down(p) {
        last = p;
      },
      move(p) {
        if (!last) return;
        // Move relative to the finger, so it doesn't hide the runner.
        me.x = clamp(me.x + p.x - last.x, 20, W - 20);
        me.y = clamp(me.y + p.y - last.y, 280, H - 30);
        last = p;
      },
      up() {
        last = null;
      },
    };
  },
};

/** Drag the barcode over the red laser and hold it there. */
export const scan: MicrogameImpl = {
  create(ctx) {
    const tol = byLevel(ctx, [26, 20, 15]);
    const HOLD = 0.35;
    const laser = { x: 180, y: 400 };
    const item = { x: rand(ctx.rng, 90, 270), y: rand(ctx.rng, 140, 230) };
    const bars = Array.from({ length: 16 }, () => randInt(ctx.rng, 1, 4));
    const color = pick(ctx.rng, [PALETTE.danger, PALETTE.blue, PALETTE.purple, PALETTE.correct]);
    let last: Pointer | null = null;
    let aligned = 0;
    let beeped = false;
    const onLaser = () => Math.abs(item.x - laser.x) < tol && Math.abs(item.y - laser.y) < tol;
    return {
      update(dt) {
        if (ctx.over) return;
        aligned = onLaser() ? aligned + dt : 0;
        if (aligned >= HOLD) {
          beeped = true;
          ctx.win();
        }
      },
      draw(g) {
        fillBg(g, '#3b3185', '#1c1545');
        // Scanner glass with its laser.
        roundRect(g, 70, laser.y - 50, 220, 100, 12, '#111');
        g.fillStyle = onLaser() || beeped ? PALETTE.correct : PALETTE.danger;
        g.fillRect(80, laser.y - 2, 200, 4);
        // Item with a barcode in the middle.
        roundRect(g, item.x - 70, item.y - 55, 140, 110, 12, color);
        roundRect(g, item.x - 44, item.y - 22, 88, 44, 4, '#ffffff');
        let x = item.x - 38;
        for (const b of bars) {
          g.fillStyle = '#111';
          g.fillRect(x, item.y - 16, b, 32);
          x += b + 2;
        }
        if (beeped) label(g, 'BEEP!', 180, 90, 56, PALETTE.accent);
        else if (!ctx.over) label(g, 'Drag the barcode onto the laser', 180, 520, 22, PALETTE.muted);
      },
      down(p) {
        if (Math.abs(p.x - item.x) < 90 && Math.abs(p.y - item.y) < 75) last = p;
      },
      move(p) {
        if (!last) return;
        item.x = clamp(item.x + p.x - last.x, 60, W - 60);
        item.y = clamp(item.y + p.y - last.y, 60, H - 60);
        last = p;
      },
      up() {
        last = null;
      },
    };
  },
};

/** Black-outline drawing on a white card, like a quick sketch. */
const INK = '#141414';
const PAPER = '#ffffff';
const FRAME = '#3a7bd5';

/** The blue frame and white card the line-art microgames are drawn on. */
function sketchCard(g: CanvasRenderingContext2D) {
  fillBg(g, FRAME);
  roundRect(g, 14, 14, W - 28, H - 28, 18, '#9cc0ee');
  roundRect(g, 22, 22, W - 44, H - 44, 14, PAPER);
}

/** Text in ink, with a white edge so it reads over the drawing. */
function inkLabel(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = INK) {
  g.save();
  g.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = size / 5;
  g.lineJoin = 'round';
  g.strokeStyle = PAPER;
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
  g.restore();
}

/** Line-art nose (black on white), loaded early so it's ready by the first round. */
inkSprite(noseUrl);

/** Get your fingertip into a nostril. The nose won't keep still. */
export const pickNose: MicrogameImpl = {
  create(ctx) {
    const sway = byLevel(ctx, [0, 30, 45]);
    const bob = byLevel(ctx, [0, 0, 24]);
    /** How much of a nostril counts as a hit: smaller at higher levels. */
    const hitScale = byLevel(ctx, [1, 0.8, 0.65]);
    const phase = ctx.rng() * Math.PI * 2;
    /** Where the fingertip rests before you touch the screen. */
    const REST = { x: 180, y: 440 };
    /** The fingertip sits this far above your touch, so your own finger doesn't hide it. */
    const LIFT = 60;
    const NOSE_Y = 255;
    // Positions within nose.png, as fractions of its width and height.
    const IMG_NOSE_WIDTH = 1110 / 1920;
    const IMG_ANCHOR = { x: 0.5, y: 1470 / 1920 };
    const IMG_NOSTRILS = [
      { x: 660 / 1920, y: 1475 / 1920 },
      { x: 1265 / 1920, y: 1470 / 1920 },
    ];
    const IMG_NOSTRIL_HALF = { x: 95 / 1920, y: 50 / 1920 };
    /** The nose is drawn this wide on the card. */
    const NOSE_WIDTH = 290;
    let nose = { x: 180, y: NOSE_Y };
    let tip: Pointer = { ...REST };
    let inside = false;
    let winT = 0;
    /** The image's drawn size (it's square unless the file says otherwise). */
    const drawnSize = () => {
      const sprite = inkSprite(noseUrl);
      const w = NOSE_WIDTH / IMG_NOSE_WIDTH;
      return { w, h: sprite ? (w * sprite.height) / sprite.width : w };
    };
    const nostrils = () => {
      const { w, h } = drawnSize();
      return IMG_NOSTRILS.map((n) => ({ x: nose.x + (n.x - IMG_ANCHOR.x) * w, y: nose.y + (n.y - IMG_ANCHOR.y) * h }));
    };
    const touch = (p: Pointer) => {
      tip = { x: clamp(p.x, 40, W - 40), y: clamp(p.y - LIFT, 60, H - 60) };
      const { w, h } = drawnSize();
      const rx = IMG_NOSTRIL_HALF.x * w * hitScale;
      const ry = IMG_NOSTRIL_HALF.y * h * hitScale;
      const hit = nostrils().find((n) => ((tip.x - n.x) / (rx + 4)) ** 2 + ((tip.y - n.y) / (ry + 8)) ** 2 <= 1);
      if (hit) {
        inside = true;
        tip = { x: hit.x, y: hit.y };
        ctx.win();
      }
    };
    const drawNose = (g: CanvasRenderingContext2D) => {
      const sprite = inkSprite(noseUrl);
      if (!sprite) return;
      const { w, h } = drawnSize();
      g.save();
      g.beginPath();
      g.roundRect(22, 22, W - 44, H - 44, 14);
      g.clip();
      g.drawImage(sprite, nose.x - IMG_ANCHOR.x * w, nose.y - IMG_ANCHOR.y * h, w, h);
      g.restore();
    };
    /** An upright finger from the bottom of the card, its tip at (x, y). */
    const drawFinger = (g: CanvasRenderingContext2D, x: number, y: number) => {
      const r = 22;
      const bottom = H;
      g.save();
      g.beginPath();
      g.roundRect(22, 22, W - 44, H - 44, 14);
      g.clip();
      g.beginPath();
      g.moveTo(x - r, bottom);
      g.lineTo(x - r, y + r);
      g.arc(x, y + r, r, Math.PI, 0);
      g.lineTo(x + r, bottom);
      g.fillStyle = PAPER;
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.lineJoin = 'round';
      g.stroke();
      // Fingernail.
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(x - 11, y + 8, 22, 26, 9);
      g.stroke();
      // Knuckle creases.
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x - 7, y + 66);
      g.lineTo(x + 7, y + 66);
      g.moveTo(x - 5, y + 74);
      g.lineTo(x + 5, y + 74);
      g.stroke();
      g.beginPath();
      g.arc(x, y + 116, 9, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      g.restore();
    };
    return {
      update(dt, t) {
        if (inside) winT += dt;
        if (ctx.over) return;
        nose = { x: 180 + Math.sin(t * 2.2 + phase) * sway, y: NOSE_Y + Math.sin(t * 3.1) * bob };
      },
      draw(g, t) {
        sketchCard(g);
        drawNose(g);
        if (inside) {
          // The finger goes up the nostril: only the part below the nostril shows,
          // with the nostril and the nose's outline drawn back over it.
          g.save();
          g.beginPath();
          g.rect(0, tip.y, W, H);
          g.clip();
          drawFinger(g, tip.x, tip.y - 34);
          g.restore();
          drawNose(g);
          const shake = Math.sin(t * 40) * 3;
          inkLabel(g, '!!', nose.x + 118 + shake, nose.y - 120, 44);
          if (winT > 0.1) inkLabel(g, 'GOT IT!', tip.x < 180 ? 262 : 98, 360, 40);
        } else {
          drawFinger(g, tip.x, tip.y);
        }
      },
      down: touch,
      move: touch,
    };
  },
};

/** Drag the zipper all the way up. Stray off the track and it slips. */
export const zip: MicrogameImpl = {
  create(ctx) {
    const sway = byLevel(ctx, [0, 25, 45]);
    const grip = byLevel(ctx, [60, 46, 36]);
    const TOP = 150;
    const BOTTOM = 500;
    let zipY = BOTTOM;
    let holding = false;
    let slips = 0;
    let trackX = 180;
    return {
      update(_dt, t) {
        trackX = 180 + Math.sin(t * 2.5) * sway;
      },
      draw(g) {
        fillBg(g, '#2c2366', '#140f2e');
        // Two halves of the jacket, opening wider at the bottom the lower the zipper is.
        const openW = 8 + ((zipY - TOP) / (BOTTOM - TOP)) * 70;
        for (const side of [-1, 1]) {
          g.beginPath();
          g.moveTo(trackX, TOP - 20);
          g.lineTo(trackX + side * 150, TOP - 20);
          g.lineTo(trackX + side * 150, BOTTOM + 40);
          g.lineTo(trackX + side * openW, BOTTOM + 40);
          g.lineTo(trackX, zipY);
          g.closePath();
          g.fillStyle = PALETTE.danger;
          g.fill();
        }
        // Teeth above the pull.
        g.strokeStyle = '#ddd';
        g.lineWidth = 6;
        g.setLineDash([4, 4]);
        g.beginPath();
        g.moveTo(trackX, TOP);
        g.lineTo(trackX, zipY);
        g.stroke();
        g.setLineDash([]);
        roundRect(g, trackX - 14, zipY - 8, 28, 48, 8, '#c9ccd6');
        circle(g, trackX, zipY + 30, 6, '#555');
        if (zipY <= TOP + 4) label(g, 'ZIPPED!', 180, 80, 48, PALETTE.accent);
        else if (slips > 0 && !holding && !ctx.over) label(g, 'It slipped! Grab it again', 180, 90, 22, PALETTE.accent);
      },
      down(p) {
        holding = Math.abs(p.x - trackX) < 50 && Math.abs(p.y - (zipY + 16)) < 60;
      },
      move(p) {
        if (!holding) return;
        if (Math.abs(p.x - trackX) > grip) {
          holding = false;
          slips++;
          return;
        }
        zipY = clamp(Math.min(zipY, p.y - 16), TOP, BOTTOM);
        if (zipY <= TOP + 4) ctx.win();
      },
      up() {
        holding = false;
      },
    };
  },
};
