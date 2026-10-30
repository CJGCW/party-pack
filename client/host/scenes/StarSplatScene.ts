import Phaser from 'phaser';
import {
  LEVELS,
  PAINTS,
  TOTAL_STARS,
  shapePoints,
  starPoints,
  wallSize,
  type Ball,
  type SplatHostView,
  type SplatPlayerProgress,
} from '../../../shared/games/starSplat';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, burstConfetti, hex, panel, text } from '../theme';

/** The wall sits in this box (centred), with the players' cards below. */
const WALL_BOX = { x: 60, y: 140, w: WIDTH - 120, h: 470 };
const CARDS_TOP = 660;
const CARD_H = 170;
const CARDS_PER_ROW = 4;
const SECTION_GAP = 18;

/**
 * The TV during Star Splat: the wall with its stars, and how everyone's doing. Nobody's throws
 * show until the reveal (they'd give the pattern away); then the TV shows the rule, the ball that
 * hits each star, and everyone's points.
 */
export class StarSplatScene extends Phaser.Scene {
  static readonly KEY = 'star-splat';

  private view: SplatHostView | null = null;
  private phaseKey = '';
  private phaseEndsAt = 0;
  /** Stars each player had when their card was last drawn, so new ones can pop in. */
  private starsShown = new Map<string, number>();
  private headerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private wallLayer!: Phaser.GameObjects.Container;
  private cardLayer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(StarSplatScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    addBackdrop(this);
    text(this, 230, 70, 'STAR SPLAT', 54, COLORS.accent, { fontStyle: '700' });
    this.headerText = text(this, WIDTH / 2, 70, '', 40);
    this.timerText = text(this, WIDTH - 150, 70, '', 64, COLORS.text, { fontStyle: '700' });
    this.wallLayer = this.add.container(0, 0);
    this.cardLayer = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: SplatHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as SplatHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  update() {
    const v = this.view;
    if (!v) return;
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    this.timerText.setText(v.phase === 'play' ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '').setColor(secs <= 15 ? COLORS.danger : COLORS.text);
  }

  private applyView(view: SplatHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.headerText.setText(`Wall ${view.puzzleNumber} of ${view.totalPuzzles} · ${LEVELS[view.level - 1].name}`);
    const key = `${view.puzzleNumber}|${view.phase}`;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      this.overlay.removeAll(true);
      if (view.phase === 'play') this.starsShown.clear();
      this.drawWall(view);
      if (view.phase === 'reveal' && view.players.some((p) => p.finishMs !== null)) burstConfetti(this, WIDTH / 2, 300, 70);
      if (view.phase === 'gameEnd') {
        showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
      }
    }
    this.drawCards(view);
  }

  /** The wall: dark bricks, star bricks lighter with their stars; at the reveal, the ball that hits each. */
  private drawWall(view: SplatHostView) {
    this.wallLayer.removeAll(true);
    const { rows, cols, sections } = wallSize(view.level);
    const box = WALL_BOX;
    const cell = Math.floor(Math.min((box.w - SECTION_GAP * (sections - 1)) / cols, box.h / rows));
    const wallW = cols * cell + SECTION_GAP * (sections - 1);
    const x0 = box.x + (box.w - wallW) / 2;
    const y0 = box.y + (box.h - rows * cell) / 2;
    const at = (c: number) => {
      const col = c % cols;
      return { x: x0 + col * cell + Math.floor(col / 5) * SECTION_GAP, y: y0 + Math.floor(c / cols) * cell };
    };

    const g = this.add.graphics();
    this.wallLayer.add(g);
    for (let s = 0; s < sections; s++) {
      const { x } = at(s * 5);
      g.fillStyle(0x0c0920, 1).fillRoundedRect(x - 6, y0 - 6, 5 * cell + 12, rows * cell + 12, 10);
    }
    const answers = new Map(view.answers?.map((a) => [a.cell, a.ball]) ?? []);
    for (let c = 0; c < rows * cols; c++) {
      const { x, y } = at(c);
      const target = view.targets.find((t) => t.cell === c);
      g.fillStyle(target ? 0x3b3185 : 0x241d55, 1).fillRoundedRect(x + 2, y + 2, cell - 4, cell - 4, Math.max(3, cell * 0.12));
      if (!target) continue;
      const answer = answers.get(c);
      if (answer) this.ball(g, answer, x + cell / 2, y + cell * 0.42, cell * 0.3);
      this.wallLayer.add(
        text(this, x + cell / 2, y + (answer ? cell * 0.84 : cell / 2), '★'.repeat(target.stars), answer ? cell * 0.22 : cell * (target.stars === 3 ? 0.26 : 0.32), COLORS.accent, { fontStyle: '700' }),
      );
    }
  }

  /** A ball: a circle of its colour with its shape on it. */
  private ball(g: Phaser.GameObjects.Graphics, ball: Ball, x: number, y: number, r: number) {
    g.fillStyle(0x140f2e, 1).fillCircle(x, y, r + 3);
    g.fillStyle(hex(PAINTS[ball.color]), 1).fillCircle(x, y, r);
    const pts = shapePoints(ball.shape).map(([px, py]) => new Phaser.Math.Vector2(x + px * r * 1.25, y + py * r * 1.25));
    g.fillStyle(ball.inner === undefined ? 0xffffff : hex(PAINTS[ball.inner]), 1).fillPoints(pts, true);
    g.lineStyle(2, 0x140f2e, 1).strokePoints(pts, true);
  }

  /** A card per player: stars filled, balls left, and at the reveal their points. */
  private drawCards(view: SplatHostView) {
    this.cardLayer.removeAll(true);
    const players = view.phase === 'play' ? view.players : [...view.players].sort((a, b) => b.points - a.points);
    const perRow = Math.min(CARDS_PER_ROW, Math.max(1, players.length));
    const cardW = (WIDTH - 120 - (perRow - 1) * 24) / perRow;
    const shown = players.length > CARDS_PER_ROW ? CARD_H * 0.92 : CARD_H;
    players.forEach((p, i) => {
      const x = 60 + (i % perRow) * (cardW + 24);
      const y = CARDS_TOP + Math.floor(i / perRow) * (shown + 16);
      this.card(view, p, x, y, cardW, shown);
    });
  }

  private card(view: SplatHostView, p: SplatPlayerProgress, x: number, y: number, w: number, h: number) {
    const o = this.cardLayer;
    o.add(panel(this, x, y, w, h));
    o.add(text(this, x + 24, y + 36, p.name, 36, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
    // A row of stars, empty until they're earned; any just earned pop in.
    const step = Math.min(34, (w - 48) / TOTAL_STARS);
    const r = step * 0.46;
    const earnedBefore = this.starsShown.get(p.id) ?? 0;
    const row = this.add.graphics();
    for (let i = 0; i < TOTAL_STARS; i++) {
      const cx = x + 24 + step * (i + 0.5);
      const cy = y + 86;
      const pts = starPoints(r).map(([px, py]) => new Phaser.Math.Vector2(cx + px, cy + py));
      if (i >= p.stars) row.lineStyle(2, hex(COLORS.muted), 0.7).strokePoints(pts, true);
      else if (i < earnedBefore) row.fillStyle(0xffd166, 1).fillPoints(pts, true);
      else {
        const star = this.add.graphics({ x: cx, y: cy });
        star.fillStyle(0xffd166, 1).fillPoints(starPoints(r).map(([px, py]) => new Phaser.Math.Vector2(px, py)), true);
        star.setScale(2.2).setAlpha(0);
        this.tweens.add({ targets: star, scale: 1, alpha: 1, duration: 350, delay: (i - earnedBefore) * 70, ease: 'Back.easeOut' });
        o.add(star);
      }
    }
    o.add(row);
    this.starsShown.set(p.id, p.stars);
    let status = `${p.ballsLeft} balls left`;
    let color: string = COLORS.muted;
    if (view.phase !== 'play') {
      status = `+${p.points.toLocaleString()}`;
      color = COLORS.text;
    } else if (p.finishMs !== null) {
      status = `All stars in ${(p.finishMs / 1000).toFixed(1)}s!`;
      color = COLORS.accent;
    } else if (p.done) status = 'Done';
    o.add(text(this, x + 24, y + h - 34, status, 30, color, { fontStyle: '700' }).setOrigin(0, 0.5));
  }
}
