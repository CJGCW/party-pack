import Phaser from 'phaser';
import type { ArenaEntry } from '../../../shared/arena';
import { CELL, type BlastWorld } from '../../../shared/games/blastGrid';
import { FIRE, FLOOR_A, FLOOR_B, FLOOR_DARK, GOLD, GOOD, INK, SKY, STONE, WOOD, ball, block, glow, shade, softShadow } from '../art';
import { ArenaScene } from '../arenaScene';
import { burst, impact } from '../fx';
import { hex } from '../theme';

/** Room for the biggest yard (17 × 13); smaller ones are scaled up to fill it. */
const WORLD_W = 17 * CELL;
const WORLD_H = 13 * CELL;
const POWER_COLORS: Record<string, number> = { b: SKY, f: FIRE, s: GOOD };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The TV during Blast Grid: the yard (walls, crates, power-ups), bombs ticking, flames and everyone walking about. */
export class BlastGridScene extends ArenaScene<BlastWorld> {
  static readonly KEY = 'blast-grid';
  protected readonly title = 'BLAST GRID';
  protected readonly scoring = 'survival';
  protected readonly worldW = WORLD_W;
  protected readonly worldH = WORLD_H;

  constructor() {
    super(BlastGridScene.KEY);
  }

  protected statusText(p: ArenaEntry) {
    if (p.endedAtMs !== null) return `out ${Math.floor(p.endedAtMs / 1000)}s`;
    return `${p.score} crate${p.score === 1 ? '' : 's'}`;
  }

  protected drawStatic(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(FLOOR_DARK, 1).fillRect(0, 0, WORLD_W, WORLD_H);
  }

  /** A square of the world on screen, with the same sums as drawing it. */
  private cellOnScreen(world: BlastWorld, cell: number) {
    const s = Math.min(WORLD_W / world.cols, WORLD_H / world.rows);
    const x = (WORLD_W - world.cols * s) / 2 + ((cell % world.cols) + 0.5) * s;
    const y = (WORLD_H - world.rows * s) / 2 + (Math.floor(cell / world.cols) + 0.5) * s;
    return this.screenOf(x, y);
  }

  /** New flames throw sparks, and each new blast gives the screen a thump. */
  protected onUpdate(prev: BlastWorld, next: BlastWorld) {
    const was = new Set(prev.flames);
    const fresh = next.flames.filter((c) => !was.has(c));
    if (!fresh.length) return;
    for (const c of fresh.slice(0, 8)) {
      const at = this.cellOnScreen(next, c);
      burst(this, at.x, at.y, FIRE, 8);
    }
    impact(this, 0.003);
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: BlastWorld, curr: BlastWorld, t: number, time: number) {
    const { cols, rows } = curr;
    const s = Math.min(WORLD_W / cols, WORLD_H / rows);
    const ox = (WORLD_W - cols * s) / 2;
    const oy = (WORLD_H - rows * s) / 2;
    const at = (x: number, y: number) => ({ x: ox + x * s, y: oy + y * s });
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = curr.cells[y * cols + x];
        const p = at(x, y);
        if (c === '#') {
          g.fillStyle(FLOOR_DARK, 1).fillRect(p.x, p.y, s, s);
          block(g, p.x + 1, p.y + 1, s - 2, s - 2, STONE);
          continue;
        }
        g.fillStyle((x + y) % 2 ? FLOOR_A : FLOOR_B, 1).fillRect(p.x, p.y, s, s);
        if (c === '+') {
          block(g, p.x + 2, p.y + 2, s - 4, s - 4, WOOD);
          g.lineStyle(s * 0.05, shade(WOOD, -0.45), 1).lineBetween(p.x + s * 0.2, p.y + s * 0.2, p.x + s * 0.8, p.y + s * 0.72).lineBetween(p.x + s * 0.8, p.y + s * 0.2, p.x + s * 0.2, p.y + s * 0.72);
        } else if (POWER_COLORS[c]) {
          const cx = p.x + s / 2;
          const cy = p.y + s / 2 + 3 * Math.sin(time / 200 + x + y);
          glow(g, cx, cy, s * 0.7, POWER_COLORS[c]);
          block(g, cx - s * 0.32, cy - s * 0.32, s * 0.64, s * 0.64, POWER_COLORS[c]);
          g.fillStyle(0xffffff, 1);
          if (c === 'b') g.fillCircle(cx, cy + 2, s * 0.13).fillRect(cx - 2, cy - s * 0.18, 4, s * 0.1);
          else if (c === 'f') g.fillTriangle(cx, cy - s * 0.18, cx - s * 0.12, cy + s * 0.14, cx + s * 0.12, cy + s * 0.14);
          else g.fillTriangle(cx - s * 0.14, cy - s * 0.14, cx + s * 0.16, cy, cx - s * 0.14, cy + s * 0.14);
        }
      }
    }
    for (const b of curr.bombs) {
      const p = at(b.x + 0.5, b.y + 0.5);
      const pulse = 1 + 0.08 * Math.sin(time / (140 - 100 * b.fuse));
      const r = s * 0.34 * pulse;
      softShadow(g, p.x, p.y + r * 0.95, r * 1.8, r * 0.6);
      ball(g, p.x, p.y, r, 0x3a3358);
      g.lineStyle(s * 0.05, hex(b.ownerColor), 1).strokeCircle(p.x, p.y, r * 0.62);
      g.lineStyle(s * 0.05, INK, 1).lineBetween(p.x + r * 0.5, p.y - r * 0.7, p.x + r * 0.75, p.y - r * 1);
      const spark = b.fuse > 0.75 ? 0xff5d73 : GOLD;
      glow(g, p.x + r * 0.78, p.y - r * 1.05, s * 0.32, spark);
      g.fillStyle(spark, 1).fillCircle(p.x + r * 0.78, p.y - r * 1.05, s * 0.06 + 2 * Math.sin(time / 60));
    }
    for (const i of curr.flames) {
      const p = at(i % cols, Math.floor(i / cols));
      const flicker = 1 + 0.06 * Math.sin(time / 40 + i);
      const [cx, cy] = [p.x + s / 2, p.y + s / 2];
      glow(g, cx, cy, s * 0.95, FIRE);
      g.fillStyle(FIRE, 0.95).fillRoundedRect(p.x + 1, p.y + 1, s - 2, s - 2, s * 0.22);
      g.fillStyle(GOLD, 1).fillCircle(cx, cy, s * 0.34 * flicker);
      g.fillStyle(0xffffff, 0.9).fillCircle(cx, cy, s * 0.17 * flicker);
    }
    for (const b of curr.bombers) {
      if (!b.alive) continue;
      const was = prev.bombers.find((o) => o.playerId === b.playerId);
      const p = at((was ? lerp(was.x, b.x, t) : b.x) + 0.5, (was ? lerp(was.y, b.y, t) : b.y) + 0.5);
      const r = s * 0.36;
      softShadow(g, p.x, p.y + r * 0.95, r * 1.9, r * 0.6);
      ball(g, p.x, p.y, r, hex(b.color));
      g.fillStyle(0xffffff, 1).fillCircle(p.x - r * 0.35, p.y - r * 0.05, r * 0.26).fillCircle(p.x + r * 0.35, p.y - r * 0.05, r * 0.26);
      g.fillStyle(INK, 1).fillCircle(p.x - r * 0.3, p.y, r * 0.13).fillCircle(p.x + r * 0.4, p.y, r * 0.13);
    }
  }
}
