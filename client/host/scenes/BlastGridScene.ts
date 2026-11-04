import Phaser from 'phaser';
import type { ArenaEntry } from '../../../shared/arena';
import { CELL, type BlastWorld } from '../../../shared/games/blastGrid';
import { ArenaScene } from '../arenaScene';
import { hex } from '../theme';

/** Room for the biggest yard (17 × 13); smaller ones are scaled up to fill it. */
const WORLD_W = 17 * CELL;
const WORLD_H = 13 * CELL;
const POWER_COLORS: Record<string, number> = { b: 0x5ec8f2, f: 0xff9f43, s: 0x4cd37a };
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
    g.fillStyle(0x0c0920, 1).fillRect(0, 0, WORLD_W, WORLD_H);
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
          g.fillStyle(0x4a4470, 1).fillRect(p.x, p.y, s, s);
          g.fillStyle(0x6d6496, 1).fillRect(p.x + 3, p.y + 3, s - 6, s * 0.3);
          continue;
        }
        g.fillStyle((x + y) % 2 ? 0x3b9a4f : 0x42a858, 1).fillRect(p.x, p.y, s, s);
        if (c === '+') {
          g.fillStyle(0x6b4423, 1).fillRect(p.x + 3, p.y + 3, s - 6, s - 6);
          g.fillStyle(0xa8743f, 1).fillRect(p.x + 7, p.y + 7, s - 14, s - 14);
          g.lineStyle(4, 0x6b4423, 1).lineBetween(p.x + 8, p.y + 8, p.x + s - 8, p.y + s - 8).lineBetween(p.x + s - 8, p.y + 8, p.x + 8, p.y + s - 8);
        } else if (POWER_COLORS[c]) {
          const cx = p.x + s / 2;
          const cy = p.y + s / 2 + 3 * Math.sin(time / 200 + x + y);
          g.fillStyle(0x140f2e, 1).fillRoundedRect(cx - s * 0.32, cy - s * 0.32, s * 0.64, s * 0.64, 10);
          g.fillStyle(POWER_COLORS[c], 1).fillRoundedRect(cx - s * 0.27, cy - s * 0.27, s * 0.54, s * 0.54, 8);
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
      g.fillStyle(0x140f2e, 1).fillCircle(p.x, p.y, r + 3);
      g.fillStyle(0x2b2440, 1).fillCircle(p.x, p.y, r);
      g.lineStyle(4, hex(b.ownerColor), 1).strokeCircle(p.x, p.y, r);
      g.fillStyle(b.fuse > 0.75 ? 0xff5d73 : 0xffd166, 1).fillCircle(p.x + r * 0.6, p.y - r * 0.8, 5 + 3 * Math.sin(time / 60));
    }
    for (const i of curr.flames) {
      const p = at(i % cols, Math.floor(i / cols));
      g.fillStyle(0xff5d2a, 0.9).fillRect(p.x + 2, p.y + 2, s - 4, s - 4);
      g.fillStyle(0xffd166, 0.9).fillRect(p.x + s * 0.25, p.y + s * 0.25, s * 0.5, s * 0.5);
    }
    for (const b of curr.bombers) {
      if (!b.alive) continue;
      const was = prev.bombers.find((o) => o.playerId === b.playerId);
      const p = at((was ? lerp(was.x, b.x, t) : b.x) + 0.5, (was ? lerp(was.y, b.y, t) : b.y) + 0.5);
      const r = s * 0.36;
      g.fillStyle(0x000000, 0.3).fillEllipse(p.x, p.y + r * 0.9, r * 1.8, r * 0.6);
      g.fillStyle(0x140f2e, 1).fillCircle(p.x, p.y, r + 4);
      g.fillStyle(hex(b.color), 1).fillCircle(p.x, p.y, r);
      g.fillStyle(0xffffff, 1).fillCircle(p.x - r * 0.35, p.y - r * 0.15, r * 0.24).fillCircle(p.x + r * 0.35, p.y - r * 0.15, r * 0.24);
      g.fillStyle(0x140f2e, 1).fillCircle(p.x - r * 0.3, p.y - r * 0.12, r * 0.11).fillCircle(p.x + r * 0.4, p.y - r * 0.12, r * 0.11);
    }
  }
}
