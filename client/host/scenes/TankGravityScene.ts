import Phaser from 'phaser';
import { FIRE, FLOOR_DARK, GOLD, GOOD, INK, ball, block, glow, shade } from '../art';
import { burst, impact } from '../fx';
import { BLAST_R, HP, SPACE_H, SPACE_W, TANK_R, shellSpeed, pull, type GravityHostView } from '../../../shared/games/tankGravity';
import { trackAt } from '../../../shared/volleys';
import { GameHud } from '../hud';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, text } from '../theme';

/** The space fills this much of the screen, the list of players the rest. */
const AREA = { x: 20, y: 130, w: WIDTH - 360, h: HEIGHT - 150 };
const BLAST_MS = 500;
/** While aiming, the guide shows the first this-many seconds of each shot. */
const GUIDE_S = 0.35;

/** The TV during Tank Yard's Gravity mode: the planets, everyone's tank aiming, then every shell flying at once. */
export class TankGravityScene extends Phaser.Scene {
  static readonly KEY = 'tank-gravity';
  private view: GravityHostView | null = null;
  private phaseKey = '';
  private phaseEndsAt = 0;
  private flyStartedAt = 0;
  private space!: Phaser.GameObjects.Container;
  private back!: Phaser.GameObjects.Graphics;
  private g!: Phaser.GameObjects.Graphics;
  private hud!: GameHud;
  /** Blasts already gone off this volley. */
  private blasted = 0;
  private listLayer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private planetsKey = '';

  constructor() {
    super(TankGravityScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = this.planetsKey = '';
    addBackdrop(this);
    const scale = Math.min(AREA.w / SPACE_W, AREA.h / SPACE_H);
    this.space = this.add.container(AREA.x + (AREA.w - SPACE_W * scale) / 2, AREA.y + (AREA.h - SPACE_H * scale) / 2).setScale(scale);
    this.back = this.add.graphics();
    this.g = this.add.graphics();
    this.space.add([this.back, this.g]);
    this.listLayer = this.add.container(0, 0);
    this.hud = new GameHud(this, 'TANK YARD: GRAVITY');
    this.overlay = this.add.container(0, 0).setDepth(50);
    listen(this, 'gameView', (v: GravityHostView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as GravityHostView);
  }

  private applyView(v: GravityHostView) {
    this.view = v;
    this.phaseEndsAt = performance.now() + v.msLeft;
    this.hud.setHeader(`Round ${v.puzzleNumber} of ${v.totalPuzzles} · Volley ${v.volley} of ${v.totalVolleys}`);
    const planetsKey = JSON.stringify(v.round.planets);
    if (planetsKey !== this.planetsKey) {
      this.planetsKey = planetsKey;
      this.drawSpace(v);
    }
    const phaseKey = `${v.puzzleNumber}|${v.volley}|${v.phase}`;
    if (phaseKey !== this.phaseKey) {
      this.phaseKey = phaseKey;
      this.overlay.removeAll(true);
      if (v.phase === 'fly') {
        this.flyStartedAt = performance.now();
        this.blasted = 0;
      }
      if (v.phase === 'result' && v.boards.some((b) => b.boardScore > 0)) burstConfetti(this, WIDTH / 2, 360, 60);
      if (v.phase === 'gameEnd') showRoundScores(this, this.overlay, v.boards.map((b) => ({ name: b.name, color: b.color, points: v.gamePoints[b.playerId] ?? 0 })));
    }
    this.drawList(v);
  }

  /** Stars and planets: once a round. */
  private drawSpace(v: GravityHostView) {
    const g = this.back.clear();
    g.fillStyle(FLOOR_DARK, 1).fillRect(0, 0, SPACE_W, SPACE_H);
    let seed = v.seed;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 160; i++) g.fillStyle(0xffffff, 0.2 + rand() * 0.6).fillCircle(rand() * SPACE_W, rand() * SPACE_H, rand() * 2 + 0.5);
    for (const p of v.round.planets) {
      glow(g, p.x, p.y, p.r * 1.9, p.color);
      ball(g, p.x, p.y, p.r, p.color);
      // Bands of weather.
      g.fillStyle(shade(p.color, -0.18), 0.6).fillEllipse(p.x, p.y + p.r * 0.32, p.r * 1.6, p.r * 0.2).fillEllipse(p.x + p.r * 0.1, p.y - p.r * 0.05, p.r * 1.3, p.r * 0.12);
    }
  }

  private drawList(v: GravityHostView) {
    this.listLayer.removeAll(true);
    const x = WIDTH - 320;
    v.boards.forEach((b, i) => {
      const y = 160 + i * 64;
      const dead = b.state.hp <= 0;
      const card = this.add.graphics();
      block(card, x, y - 28, 300, 56, 0x2c2366);
      this.listLayer.add(card);
      this.listLayer.add(text(this, x + 14, y - 10, b.name, 26, b.color, { fontStyle: '700' }).setOrigin(0, 0.5).setAlpha(dead ? 0.4 : 1));
      const right =
        v.phase === 'result' || v.phase === 'gameEnd' ? `${b.boardScore} dmg · +${b.points}` : v.phase === 'aim' && b.locked && !dead ? 'READY' : `${b.boardScore} dmg`;
      this.listLayer.add(text(this, x + 286, y - 10, right, 22, v.phase === 'aim' && b.locked ? COLORS.accent : COLORS.muted, { fontStyle: '700' }).setOrigin(1, 0.5));
      this.listLayer.add(this.add.rectangle(x + 14, y + 16, 272 * (b.state.hp / HP), 8, dead ? 0x555555 : GOOD).setOrigin(0, 0.5));
    });
  }

  update(time: number) {
    const v = this.view;
    if (!v) return;
    const now = performance.now();
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - now) / 1000));
    this.hud.clock(v.phase === 'aim' ? secs : null, 5);
    const g = this.g.clear();
    const rec = v.phase === 'fly' ? v.round.shot : null;
    const frame = rec ? ((now - this.flyStartedAt) / 1000) * rec.fps : 0;
    for (const b of v.boards) {
      const t = b.state;
      const color = hex(b.color);
      const alive = t.hp > 0;
      // The tank: a dome on its planet, its barrel where it's aiming.
      g.lineStyle(8, INK, 1).lineBetween(t.x, t.y, t.x + Math.cos(t.aim.angle) * (TANK_R + 14), t.y + Math.sin(t.aim.angle) * (TANK_R + 14));
      g.lineStyle(5, alive ? 0xdddddd : 0x555555, 1).lineBetween(t.x, t.y, t.x + Math.cos(t.aim.angle) * (TANK_R + 12), t.y + Math.sin(t.aim.angle) * (TANK_R + 12));
      ball(g, t.x, t.y, TANK_R, alive ? color : 0x444444);
      if (v.phase === 'aim' && alive) {
        // The first stretch of the shot, curving.
        let [x, y] = [t.x + Math.cos(t.aim.angle) * (TANK_R + 6), t.y + Math.sin(t.aim.angle) * (TANK_R + 6)];
        const speed = shellSpeed(t.aim.power);
        let [vx, vy] = [Math.cos(t.aim.angle) * speed, Math.sin(t.aim.angle) * speed];
        g.fillStyle(color, 0.8);
        for (let s = 0; s < GUIDE_S; s += 1 / 60) {
          const { ax, ay } = pull(v.round.planets, x, y);
          vx += ax / 60;
          vy += ay / 60;
          x += vx / 60;
          y += vy / 60;
          if (Math.round(s * 60) % 3 === 0) g.fillCircle(x, y, 3 + 1.5 * Math.sin(time / 120 + s * 30));
        }
      }
    }
    if (rec) {
      for (const track of rec.tracks) {
        const at = trackAt(track, frame);
        if (typeof at !== 'object') continue;
        glow(g, at.x, at.y, 26, GOLD);
        ball(g, at.x, at.y, 5, 0xffffff);
      }
      const b = v.round.blasts;
      for (let i = 0; i < b.length; i += 3) {
        const age = ((frame - b[i]) / rec.fps) * 1000;
        if (age < 0 || age > BLAST_MS) continue;
        const k = age / BLAST_MS;
        if (i / 3 >= this.blasted) {
          this.blasted = i / 3 + 1;
          const scale = this.space.scale;
          burst(this, this.space.x + b[i + 1] * scale, this.space.y + b[i + 2] * scale, FIRE, 40);
          impact(this, 0.005);
        }
        glow(g, b[i + 1], b[i + 2], BLAST_R * 1.6, FIRE, 1 - k);
        g.fillStyle(GOLD, 1 - k).fillCircle(b[i + 1], b[i + 2], BLAST_R * (0.3 + 0.7 * k));
        g.fillStyle(FIRE, (1 - k) * 0.8).fillCircle(b[i + 1], b[i + 2], BLAST_R * 0.6 * (0.3 + 0.7 * k));
      }
    }
  }
}
