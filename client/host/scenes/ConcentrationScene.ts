import Phaser from 'phaser';
import type { ConcentrationHostPlayer, ConcentrationHostView } from '../../../shared/games/concentration';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, hex, text } from '../theme';

const PANEL_W = 420;
const PANEL_GAP = 28;
const INK = '#140f2e';

/**
 * The TV during Concentration: a panel per player with their board as a grid of squares,
 * lit up as they find pairs. The cards themselves stay on the phones, since everyone has
 * the same board.
 */
export class ConcentrationScene extends Phaser.Scene {
  static readonly KEY = 'concentration';

  private view: ConcentrationHostView | null = null;
  private phaseEndsAt = 0;
  private headerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;
  private panels!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(ConcentrationScene.KEY);
  }

  create() {
    this.view = null;
    addBackdrop(this, { blobs: false });
    text(this, 80, 64, 'CONCENTRATION', 30, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5).setLetterSpacing(6);
    this.headerText = text(this, WIDTH / 2, 64, '', 30, COLORS.muted);
    this.timerText = text(this, WIDTH - 80, 64, '', 56, COLORS.text, { fontStyle: '700' }).setOrigin(1, 0.5);
    this.hintText = text(this, WIDTH / 2, 140, '', 28, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(3);
    this.bigText = text(this, WIDTH / 2, HEIGHT / 2, '', 120, COLORS.accent, { fontStyle: '700' }).setDepth(10);
    this.panels = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: ConcentrationHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as ConcentrationHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  update() {
    const v = this.view;
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    if (v?.phase === 'playing') {
      this.timerText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`).setColor(secs <= 10 ? COLORS.danger : COLORS.text);
    } else this.timerText.setText('');
    this.bigText.setText(v?.phase === 'countdown' ? String(Math.max(1, secs)) : '');
  }

  private applyView(view: ConcentrationHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.headerText.setText(`Board ${view.round} of ${view.totalRounds}   ·   ${view.size} × ${view.size}`);
    this.hintText.setText(
      view.phase === 'countdown'
        ? 'GET READY: SAME CARDS FOR EVERYONE'
        : view.phase === 'roundEnd'
          ? 'BOARD OVER'
          : `FIND EVERY PAIR  ·  EACH GUESS COSTS ${view.guessCostSeconds} SEC OF POINTS`,
    );
    this.renderPanels(view);
    this.overlay.removeAll(true);
    if (view.phase === 'gameEnd') {
      showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
    }
  }

  private renderPanels(view: ConcentrationHostView) {
    this.panels.removeAll(true);
    const players = view.players;
    const perRow = players.length <= 4 ? players.length : Math.ceil(players.length / 2);
    const rows = Math.ceil(players.length / Math.max(1, perRow));
    const panelH = rows === 1 ? 560 : 400;
    const top = rows === 1 ? 250 : 200;
    players.forEach((p, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, players.length - row * perRow);
      const col = i - row * perRow;
      const x = WIDTH / 2 - (inRow * PANEL_W + (inRow - 1) * PANEL_GAP) / 2 + col * (PANEL_W + PANEL_GAP);
      const y = top + row * (panelH + PANEL_GAP);
      this.panels.add(this.panel(p, view, x, y, panelH));
    });
  }

  private panel(p: ConcentrationHostPlayer, view: ConcentrationHostView, x: number, y: number, h: number) {
    const c = this.add.container(x, y);
    const done = p.finishRank !== null;
    const g = this.add.graphics();
    g.fillStyle(done ? COLORS.panelLight : COLORS.panel, 1);
    g.fillRoundedRect(0, 0, PANEL_W, h, 20);
    g.fillStyle(hex(p.color), 1);
    g.fillRoundedRect(0, 0, PANEL_W, 12, { tl: 20, tr: 20, bl: 0, br: 0 });
    c.add(g);
    c.add(text(this, 28, 46, p.name, 32, COLORS.text, { fontStyle: '700' }).setOrigin(0, 0.5));
    if (done) {
      const badge = this.add.graphics();
      badge.fillStyle(hex(COLORS.accent), 1);
      badge.fillRoundedRect(PANEL_W - 96, 26, 72, 40, 20);
      c.add([badge, text(this, PANEL_W - 60, 46, `#${p.finishRank}`, 26, INK, { fontStyle: '700' })]);
    }

    // The board as squares: lit for each card they've matched.
    const gridSize = h - 170;
    const gap = Math.max(3, Math.round(gridSize * 0.03));
    const cell = (gridSize - gap * (view.size - 1)) / view.size;
    const left = (PANEL_W - gridSize) / 2;
    const top = 84;
    const squares = this.add.graphics();
    p.matched.forEach((matched, i) => {
      if (i === view.blank) return;
      const sx = left + (i % view.size) * (cell + gap);
      const sy = top + Math.floor(i / view.size) * (cell + gap);
      squares.fillStyle(matched ? COLORS.correct : COLORS.empty, 1);
      squares.fillRoundedRect(sx, sy, cell, cell, Math.min(8, cell * 0.2));
    });
    c.add(squares);

    const line1 = `${p.pairsFound}/${view.totalPairs} pairs  ·  ${p.guesses} guesses`;
    c.add(text(this, PANEL_W / 2, h - 56, line1, 26, COLORS.text, { fontStyle: '700' }));
    const line2 = done ? `+${p.roundPoints.toLocaleString()}` : view.phase === 'roundEnd' ? 'Out of time' : '';
    c.add(text(this, PANEL_W / 2, h - 22, line2, 24, done ? COLORS.accent : COLORS.muted, { fontStyle: '700' }));
    return c;
  }
}
