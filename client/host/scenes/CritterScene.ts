import Phaser from 'phaser';
import { piecePrims, type CritterHostView, type CritterProgress, type Piece, type Prim, type StageGroup } from '../../../shared/critters';
import { GOLD, ball, glow } from '../art';
import { GameHud } from '../hud';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, burstConfetti, hex, panel, text } from '../theme';

/** The puzzle sits in this box (centred), with the players' cards below. */
const STAGE = { x: 60, y: 130, w: WIDTH - 120, h: 500 };
const GROUP_GAP = 70;
const LABEL_H = 56;
const MAX_CELL = 170;
const CARDS_TOP = 660;
const CARD_H = 170;
const CARDS_PER_ROW = 4;

/**
 * The TV for every Wumble puzzle: the puzzle's Wumbles and clues, and how everyone's doing. Nobody's
 * moves show (they'd give it away); at the reveal it shows the answer and everyone's points.
 */
export class CritterScene extends Phaser.Scene {
  static readonly KEY = 'critters';

  private view: CritterHostView | null = null;
  private phaseKey = '';
  private phaseEndsAt = 0;
  private hud!: GameHud;
  private stageLayer!: Phaser.GameObjects.Container;
  private cardLayer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(CritterScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    addBackdrop(this);
    this.hud = new GameHud(this, '');
    panel(this, STAGE.x - 24, STAGE.y - 4, STAGE.w + 48, STAGE.h + 8, 0x1a1442, 0.6);
    this.stageLayer = this.add.container(0, 0);
    this.cardLayer = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: CritterHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as CritterHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  update() {
    const v = this.view;
    if (!v) return;
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    this.hud.clock(v.phase === 'play' ? secs : null, 15, (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  }

  private applyView(view: CritterHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.hud.setTitle(view.title.toUpperCase());
    this.hud.setHeader(`Puzzle ${view.puzzleNumber} of ${view.totalPuzzles} · ${view.levelName}`);
    const key = `${view.puzzleNumber}|${view.phase}`;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      this.overlay.removeAll(true);
      this.drawStage(view.stage);
      if (view.phase === 'reveal' && view.players.some((p) => p.finishMs !== null)) burstConfetti(this, WIDTH / 2, 300, 70);
      if (view.phase === 'gameEnd') {
        showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
      }
    }
    this.drawCards(view);
  }

  /** The groups in a row, sized so the lot fits. */
  private drawStage(groups: StageGroup[]) {
    this.stageLayer.removeAll(true);
    const shape = groups.map((g) => {
      const cols = Math.max(1, Math.min(g.cols ?? g.pieces.length, g.pieces.length || 1));
      return { cols, rows: Math.ceil(g.pieces.length / cols), label: g.label };
    });
    const anyLabel = shape.some((s) => s.label);
    const room = STAGE.h - (anyLabel ? LABEL_H : 0);
    const cell = Math.floor(
      Math.min(
        MAX_CELL,
        (STAGE.w - GROUP_GAP * (groups.length - 1)) / shape.reduce((sum, s) => sum + s.cols, 0),
        room / Math.max(1, ...shape.map((s) => s.rows)),
      ),
    );
    const totalW = shape.reduce((sum, s) => sum + s.cols * cell, 0) + GROUP_GAP * (groups.length - 1);
    let x = STAGE.x + (STAGE.w - totalW) / 2;
    groups.forEach((group, i) => {
      const { cols, rows, label } = shape[i];
      const top = STAGE.y + (anyLabel ? LABEL_H : 0) + (room - rows * cell) / 2;
      if (label) this.stageLayer.add(text(this, x + (cols * cell) / 2, top - 30, label, 36, COLORS.muted, { fontStyle: '700' }));
      group.pieces.forEach((piece, n) => this.drawPiece(piece, x + ((n % cols) + 0.5) * cell, top + (Math.floor(n / cols) + 0.5) * cell, cell * 0.92));
      x += cols * cell + GROUP_GAP;
    });
  }

  private drawPiece(piece: Piece, x: number, y: number, size: number) {
    if (piece.k === 'e') {
      this.stageLayer.add(text(this, x, y, piece.e ?? '', size * 0.72));
      return;
    }
    const g = this.add.graphics({ x, y });
    g.setScale(size / 100);
    if (piece.on) {
      glow(g, 0, 0, 70, GOLD);
      g.lineStyle(5, GOLD, 1).strokeCircle(0, 0, 49);
    }
    for (const p of piecePrims(piece)) this.drawPrim(g, p);
    g.setAlpha(piece.dim ? 0.3 : 1);
    this.stageLayer.add(g);
  }

  private drawPrim(g: Phaser.GameObjects.Graphics, p: Prim) {
    const alpha = p.alpha ?? 1;
    if (p.t === 'circle') {
      if (p.fill) g.fillStyle(hex(p.fill), alpha).fillCircle(p.x, p.y, p.r);
      if (p.line) g.lineStyle(p.w ?? 1, hex(p.line), 1).strokeCircle(p.x, p.y, p.r);
      return;
    }
    const pts = p.pts.map(([x, y]) => new Phaser.Math.Vector2(x, y));
    if (p.fill) g.fillStyle(hex(p.fill), alpha).fillPoints(pts, true);
    if (p.line) g.lineStyle(p.w ?? 1, hex(p.line), 1).strokePoints(pts, !p.open);
  }

  private drawCards(view: CritterHostView) {
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

  /** A card per player: drawn pips for progress and hearts for tries, not numbers. */
  private card(view: CritterHostView, p: CritterProgress, x: number, y: number, w: number, h: number) {
    const o = this.cardLayer;
    o.add(panel(this, x, y, w, h));
    o.add(text(this, x + 24, y + 36, p.name, 36, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
    const pips = this.add.graphics();
    const step = Math.min(30, (w - 48) / Math.max(1, p.goal));
    for (let i = 0; i < p.goal; i++) {
      const cx = x + 24 + step * (i + 0.5);
      if (i < p.got) ball(pips, cx, y + 84, step * 0.34, GOLD);
      else pips.lineStyle(2, hex(COLORS.muted), 0.5).strokeCircle(cx, y + 84, step * 0.34);
    }
    o.add(pips);
    let status = '♥'.repeat(p.triesLeft);
    let color: string = COLORS.danger;
    if (view.phase !== 'play') {
      status = `+${p.points.toLocaleString()}`;
      color = COLORS.text;
    } else if (p.finishMs !== null) {
      status = `Solved in ${(p.finishMs / 1000).toFixed(1)}s!`;
      color = COLORS.accent;
    } else if (p.done) {
      status = 'Done';
      color = COLORS.muted;
    }
    o.add(text(this, x + 24, y + h - 34, status, p.triesMax > 12 && view.phase === 'play' && !p.done ? 22 : 30, color, { fontStyle: '700' }).setOrigin(0, 0.5));
  }
}
