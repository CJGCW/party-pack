import Phaser from 'phaser';
import type { ArenaEntry, ArenaHostView, ArenaScoring } from '../../shared/arena';
import { boxGlow, burst, impact, popText } from './fx';
import { GameHud } from './hud';
import { listen, net } from './net';
import { showRoundScores } from './roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, panel, text } from './theme';

/** The world fills this area; the players are listed beside it. */
const WORLD_AREA = { x: 30, y: 125, w: WIDTH - 420, h: HEIGHT - 145 };
const LIST = { x: WIDTH - 370, y: 125, w: 340, h: HEIGHT - 145 };

function ordinal(n: number) {
  return `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
}

/**
 * The TV for a shared arena game (see shared/arena.ts): the world, the players beside it, the
 * countdown, the result and round scores. A game says how big its world is and draws it; updates
 * come several times a second and each frame gets how far it is between the last two (`t`).
 */
export abstract class ArenaScene<S> extends Phaser.Scene {
  protected abstract readonly title: string;
  protected abstract readonly scoring: ArenaScoring;
  /** The world's size in its own units. */
  protected abstract readonly worldW: number;
  protected abstract readonly worldH: number;

  protected view: ArenaHostView<S> | null = null;
  protected prev: { at: number; world: S } | null = null;
  protected curr: { at: number; world: S } | null = null;
  /** The world's container (in world units) and how many screen pixels a unit is. */
  protected worldLayer!: Phaser.GameObjects.Container;
  protected worldScale = 1;
  private dynamic!: Phaser.GameObjects.Graphics;
  private staticG!: Phaser.GameObjects.Graphics;
  private listLayer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private hud!: GameHud;
  /** Who's been seen to go out this round. */
  private fallen = new Set<string>();
  private phaseKey = '';
  private roundKey = '';
  private listKey = '';
  private phaseEndsAt = 0;

  /** Draws what doesn't move (once a round). */
  protected abstract drawStatic(g: Phaser.GameObjects.Graphics, view: ArenaHostView<S>): void;
  /** Draws the world every frame, `t` of the way from `prev` to `curr`. */
  protected abstract drawWorld(g: Phaser.GameObjects.Graphics, prev: S, curr: S, t: number, time: number): void;
  /** A player's line in the list while playing. */
  protected statusText(p: ArenaEntry) {
    if (p.endedAtMs !== null) return `out ${Math.floor(p.endedAtMs / 1000)}s`;
    return this.scoring === 'best' ? String(p.score) : 'in';
  }
  /** Called with each new update while playing. */
  protected onUpdate(_prev: S, _next: S): void {}
  protected setup(): void {}

  create() {
    this.view = this.prev = this.curr = null;
    this.phaseKey = this.roundKey = this.listKey = '';
    addBackdrop(this);
    this.setup();
    this.worldScale = Math.min(WORLD_AREA.w / this.worldW, WORLD_AREA.h / this.worldH);
    const x = WORLD_AREA.x + (WORLD_AREA.w - this.worldW * this.worldScale) / 2;
    const y = WORLD_AREA.y + (WORLD_AREA.h - this.worldH * this.worldScale) / 2;
    boxGlow(this, x, y, this.worldW * this.worldScale, this.worldH * this.worldScale, 6, 0x8b7cf6);
    this.worldLayer = this.add.container(x, y).setScale(this.worldScale);
    const clip = this.make.graphics({}, false).fillStyle(0xffffff).fillRect(x, y, this.worldW * this.worldScale, this.worldH * this.worldScale);
    this.worldLayer.setMask(clip.createGeometryMask());
    this.staticG = this.add.graphics();
    this.dynamic = this.add.graphics();
    this.worldLayer.add([this.staticG, this.dynamic]);
    this.listLayer = this.add.container(0, 0);
    this.hud = new GameHud(this, this.title, x + (this.worldW * this.worldScale) / 2);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: ArenaHostView<S>) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as ArenaHostView<S>);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  private applyView(view: ArenaHostView<S>) {
    const now = performance.now();
    this.view = view;
    this.phaseEndsAt = now + view.msLeft;
    this.hud.setHeader(`Round ${view.puzzleNumber} of ${view.totalPuzzles}`);
    const roundKey = `${view.puzzleNumber}|${view.seed}`;
    const next = { at: now, world: view.world };
    if (roundKey !== this.roundKey) {
      this.roundKey = roundKey;
      this.fallen.clear();
      this.staticG.clear();
      this.drawStatic(this.staticG, view);
      this.prev = next;
    } else {
      if (this.curr && view.phase === 'play') this.onUpdate(this.curr.world, view.world);
      this.prev = this.curr ?? next;
    }
    this.curr = next;

    const phaseKey = `${view.puzzleNumber}|${view.phase}`;
    if (phaseKey !== this.phaseKey) {
      this.phaseKey = phaseKey;
      this.overlay.removeAll(true);
      if (view.phase === 'result') burstConfetti(this, LIST.x + LIST.w / 2, LIST.y + 80, 50);
      if (view.phase === 'gameEnd') showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: view.gamePoints[p.playerId] ?? 0 })));
    }
    this.markFallen(view);
    this.drawList(view);
  }

  /** Where a point in the world is on screen (effects are drawn in screen pixels). */
  protected screenOf(x: number, y: number) {
    return { x: this.worldLayer.x + x * this.worldScale, y: this.worldLayer.y + y * this.worldScale };
  }

  /** Anyone newly out gets a moment. */
  private markFallen(view: ArenaHostView<S>) {
    // At the result too: in a duel, the first one out ends the round there and then.
    if (view.phase !== 'play' && view.phase !== 'result') return;
    const x = WORLD_AREA.x + WORLD_AREA.w / 2;
    for (const p of view.players) {
      if (p.endedAtMs === null || this.fallen.has(p.playerId)) continue;
      this.fallen.add(p.playerId);
      popText(this, x, HEIGHT / 2, `${p.name} is out!`, p.color, 64);
      burst(this, x, HEIGHT / 2, hex(p.color), 36);
      impact(this, 0.005);
    }
  }

  /** The players, beside the world: still in first; at the result, by place with their points. */
  private drawList(view: ArenaHostView<S>) {
    const result = view.phase === 'result';
    const rows = [...view.players].sort((a, b) =>
      result ? (a.place ?? 99) - (b.place ?? 99) : (a.endedAtMs === null ? 0 : 1) - (b.endedAtMs === null ? 0 : 1) || b.score - a.score,
    );
    const key = JSON.stringify([view.phase, rows.map((p) => [p.playerId, p.endedAtMs, p.score, p.points])]);
    if (key === this.listKey) return;
    this.listKey = key;
    this.listLayer.removeAll(true);
    this.listLayer.add(panel(this, LIST.x, LIST.y, LIST.w, LIST.h));
    const rowH = Math.min(100, (LIST.h - 30) / Math.max(1, rows.length));
    rows.forEach((p, i) => {
      const y = LIST.y + 15 + i * rowH + rowH / 2;
      const out = p.endedAtMs !== null && view.phase === 'play';
      if (i) this.listLayer.add(this.add.rectangle(LIST.x + 20, y - rowH / 2, LIST.w - 40, 2, 0xffffff, 0.07).setOrigin(0, 0.5));
      const glow = this.add.image(LIST.x + 34, y, 'fx-glow').setDisplaySize(64, 64).setTint(hex(p.color)).setAlpha(out ? 0 : 0.55).setBlendMode(Phaser.BlendModes.ADD);
      const dot = this.add.circle(LIST.x + 34, y, 14, hex(p.color)).setAlpha(out ? 0.4 : 1);
      const name = text(this, LIST.x + 60, y, p.name, 34, out ? COLORS.muted : p.color, { fontStyle: '700' }).setOrigin(0, 0.5);
      const status = result ? `${ordinal(p.place ?? 1)} · +${p.points}` : this.statusText(p);
      const right = text(this, LIST.x + LIST.w - 24, y, status, 28, result ? COLORS.accent : out ? COLORS.danger : COLORS.muted, { fontStyle: '700' }).setOrigin(1, 0.5);
      this.listLayer.add([glow, dot, name, right]);
    });
  }

  update(time: number) {
    const v = this.view;
    if (!v || !this.prev || !this.curr) return;
    const now = performance.now();
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - now) / 1000));
    this.hud.clock(v.phase === 'play' ? secs : null);
    this.hud.countdown(v.phase === 'ready' ? Math.max(1, secs) : null);
    const span = Math.max(1, this.curr.at - this.prev.at);
    const t = Math.min(1, (now - this.curr.at) / span);
    this.drawWorld(this.dynamic.clear(), this.prev.world, this.curr.world, t, time);
  }
}
