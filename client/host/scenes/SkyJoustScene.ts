import Phaser from 'phaser';
import type { ArenaEntry } from '../../../shared/arena';
import { LAVA_Y, LEDGES, RIDER_R, WORLD_H, WORLD_W, type JousterView, type JoustWorld } from '../../../shared/games/skyJoust';
import { FIRE, FLOOR_A, FLOOR_DARK, GOLD, INK, STONE, ball, block, shade } from '../art';
import { ArenaScene } from '../arenaScene';
import { burst, impact } from '../fx';
import { hex } from '../theme';

/** Wings stay up this long after a flap. */
const FLAP_MS = 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The TV during Sky Joust: the cave, its ledges and lava, and everyone flying (wrapping round the sides). */
export class SkyJoustScene extends ArenaScene<JoustWorld> {
  static readonly KEY = 'sky-joust';
  protected readonly title = 'SKY JOUST';
  protected readonly scoring = 'survival';
  protected readonly worldW = WORLD_W;
  protected readonly worldH = WORLD_H;
  private flappedAt = new Map<string, number>();
  /** When each rider was last seen going left (so they keep facing that way while still). */
  private facingLeft = new Map<string, boolean>();

  constructor() {
    super(SkyJoustScene.KEY);
  }

  protected statusText(p: ArenaEntry) {
    if (p.endedAtMs !== null) return `out ${Math.floor(p.endedAtMs / 1000)}s`;
    const r = this.curr?.world.riders.find((o) => o.playerId === p.playerId);
    return r ? '♥'.repeat(r.lives) : 'in';
  }

  protected onUpdate(prev: JoustWorld, next: JoustWorld) {
    for (const r of next.riders) {
      const was = prev.riders.find((o) => o.playerId === r.playerId);
      if (was && r.flaps > was.flaps) this.flappedAt.set(r.playerId, performance.now());
      // Knocked out of the air.
      if (was && !was.down && r.down) {
        const at = this.screenOf(was.x, was.y);
        burst(this, at.x, at.y, hex(r.color), 40);
        impact(this, 0.004);
      }
      if (r.vx < -20) this.facingLeft.set(r.playerId, true);
      else if (r.vx > 20) this.facingLeft.set(r.playerId, false);
    }
  }

  /** A dusky cave: stone ledges and the lava pool. */
  protected drawStatic(g: Phaser.GameObjects.Graphics) {
    this.flappedAt.clear();
    this.facingLeft.clear();
    g.fillGradientStyle(FLOOR_DARK, FLOOR_DARK, FLOOR_A, FLOOR_A, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    g.fillStyle(shade(STONE, -0.45), 1);
    for (let i = 0; i < 12; i++) g.fillTriangle(i * 140, 0, i * 140 + 70, 50 + (i % 3) * 30, i * 140 + 140, 0);
    for (const [left, top, width] of LEDGES) {
      block(g, left - 4, top - 4, width + 8, 32, STONE);
    }
  }

  protected drawWorld(g: Phaser.GameObjects.Graphics, prev: JoustWorld, curr: JoustWorld, t: number, time: number) {
    // The lava, bubbling.
    g.fillGradientStyle(FIRE, FIRE, 0xc23a1e, 0xc23a1e, 1);
    g.fillRect(0, LAVA_Y, WORLD_W, WORLD_H - LAVA_Y);
    g.fillStyle(FIRE, 0.14).fillRect(0, LAVA_Y - 46, WORLD_W, 46);
    g.fillStyle(GOLD, 1);
    for (let x = 0; x < WORLD_W; x += 40) g.fillCircle(x + 20, LAVA_Y + 4 + 6 * Math.sin(time / 300 + x * 0.05), 14);
    const now = performance.now();
    for (const r of curr.riders) {
      if (r.down) continue;
      const was = prev.riders.find((o) => o.playerId === r.playerId);
      let x = r.x;
      let y = r.y;
      if (was && !was.down) {
        // Interpolate the short way round the wrap.
        let dx = r.x - was.x;
        if (dx > WORLD_W / 2) dx -= WORLD_W;
        if (dx < -WORLD_W / 2) dx += WORLD_W;
        x = was.x + dx * t;
        y = lerp(was.y, r.y, t);
      }
      x = ((x % WORLD_W) + WORLD_W) % WORLD_W;
      const wingsUp = now - (this.flappedAt.get(r.playerId) ?? -Infinity) < FLAP_MS;
      // Drawn again on the far side when it's crossing the edge.
      for (const at of [x, x - WORLD_W, x + WORLD_W]) {
        if (at < -RIDER_R * 3 || at > WORLD_W + RIDER_R * 3) continue;
        this.drawRider(g, r, at, y, wingsUp, time);
      }
    }
  }

  private drawRider(g: Phaser.GameObjects.Graphics, r: JousterView, x: number, y: number, wingsUp: boolean, time: number) {
    const dir = this.facingLeft.get(r.playerId) ? -1 : 1;
    const color = hex(r.color);
    // Blink while safe after coming back.
    const alpha = r.safe ? 0.45 + 0.35 * Math.sin(time / 60) : 1;
    // The lance, pointing the way they face.
    g.lineStyle(6, 0xe8e0ff, alpha).lineBetween(x - dir * 10, y - 4, x + dir * (RIDER_R + 26), y - 10);
    // Wings: up after a flap, down otherwise.
    const wy = wingsUp ? -RIDER_R * 1.3 : RIDER_R * 0.6;
    g.fillStyle(0x140f2e, alpha).fillTriangle(x - dir * 4, y - 6, x - dir * RIDER_R * 1.4, y + wy - 4, x + dir * 12, y + 4);
    g.fillStyle(color, alpha * 0.8).fillTriangle(x - dir * 4, y - 4, x - dir * RIDER_R * 1.25, y + wy, x + dir * 8, y + 4);
    // The body and head.
    g.fillStyle(INK, alpha).fillEllipse(x, y, RIDER_R * 2 + 8, RIDER_R * 1.5 + 8);
    g.fillStyle(shade(color, -0.32), alpha).fillEllipse(x, y, RIDER_R * 2, RIDER_R * 1.5);
    g.fillStyle(color, alpha).fillEllipse(x, y - 3, RIDER_R * 1.8, RIDER_R * 1.2);
    g.fillStyle(0xffffff, 0.45 * alpha).fillEllipse(x - RIDER_R * 0.3, y - RIDER_R * 0.4, RIDER_R * 0.6, RIDER_R * 0.28);
    ball(g, x + dir * RIDER_R * 0.8, y - RIDER_R * 0.7, 12, color, alpha);
    g.fillStyle(GOLD, alpha).fillTriangle(x + dir * (RIDER_R * 0.8 + 8), y - RIDER_R * 0.75, x + dir * (RIDER_R * 0.8 + 22), y - RIDER_R * 0.6, x + dir * (RIDER_R * 0.8 + 8), y - RIDER_R * 0.5);
    g.fillStyle(INK, alpha).fillCircle(x + dir * (RIDER_R * 0.8 + 3), y - RIDER_R * 0.8, 3);
  }
}
