import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W, INK_COLORS, type SketchView } from '../../../shared/games/sketchIt';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, burstConfetti, hex, text } from '../theme';

/** The TV during Sketch It: the drawing as it's made, the word's blanks, and who's guessed it. */
export class SketchItScene extends Phaser.Scene {
  static readonly KEY = 'sketch-it';
  private view: SketchView | null = null;
  private canvas!: Phaser.GameObjects.Container;
  private g!: Phaser.GameObjects.Graphics;
  private headerText!: Phaser.GameObjects.Text;
  private wordText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private list!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private phaseKey = '';
  private phaseEndsAt = 0;
  private drawnKey = '';

  constructor() {
    super(SketchItScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = this.drawnKey = '';
    addBackdrop(this);
    text(this, 60, 70, 'SKETCH IT', 54, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5);
    this.headerText = text(this, WIDTH / 2, 70, '', 36);
    this.timerText = text(this, WIDTH - 120, 70, '', 64, COLORS.text, { fontStyle: '700' });
    this.wordText = text(this, 700, 150, '', 52, COLORS.accent, { fontStyle: '700' });
    const scale = Math.min(1200 / CANVAS_W, 800 / CANVAS_H);
    this.canvas = this.add.container(100, 200).setScale(scale);
    const paper = this.add.graphics().fillStyle(0xfffdf5, 1).fillRoundedRect(0, 0, CANVAS_W, CANVAS_H, 20);
    this.g = this.add.graphics();
    this.canvas.add([paper, this.g]);
    this.list = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);
    listen(this, 'gameView', (v: SketchView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as SketchView);
  }

  private applyView(v: SketchView) {
    this.view = v;
    this.phaseEndsAt = performance.now() + v.msLeft;
    const artist = v.players.find((p) => p.id === v.artist);
    this.headerText.setText(`Round ${v.puzzleNumber} of ${v.totalPuzzles} · ${artist?.name ?? ''} is drawing (${v.turn} of ${v.turns})`);
    this.wordText.setText(v.phase === 'draw' || v.phase === 'reveal' ? v.word : '');
    const pk = `${v.puzzleNumber}|${v.turn}|${v.phase}`;
    if (pk !== this.phaseKey) {
      this.phaseKey = pk;
      this.overlay.removeAll(true);
      if (v.phase === 'reveal' && v.players.some((p) => p.gotIt !== null)) burstConfetti(this, 700, 360, 40);
      if (v.phase === 'gameEnd') showRoundScores(this, this.overlay, v.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
    }
    // Redraw the drawing when it's changed (it only grows, or is cleared).
    const key = `${v.turn}|${v.strokes.length}|${v.strokes.reduce((n, s) => n + s.points.length, 0)}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      const g = this.g.clear();
      for (const s of v.strokes) {
        g.lineStyle(s.width, hex(INK_COLORS[s.color]), 1);
        if (s.points.length === 2) g.fillStyle(hex(INK_COLORS[s.color]), 1).fillCircle(s.points[0], s.points[1], s.width / 2);
        for (let i = 2; i < s.points.length; i += 2) {
          g.lineBetween(s.points[i - 2], s.points[i - 1], s.points[i], s.points[i + 1]);
          g.fillStyle(hex(INK_COLORS[s.color]), 1).fillCircle(s.points[i], s.points[i + 1], s.width / 2);
        }
      }
    }
    this.list.removeAll(true);
    v.players.forEach((p, i) => {
      const x = WIDTH - 340;
      const y = 220 + i * 86;
      const drawing = p.id === v.artist;
      this.list.add(this.add.rectangle(x, y, 300, 74, p.gotIt !== null ? 0x2f6e45 : 0x2a2160, 0.95).setOrigin(0, 0.5).setStrokeStyle(3, hex(p.color)));
      this.list.add(text(this, x + 16, y - 14, `${drawing ? '✎ ' : ''}${p.name}`, 28, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
      const right =
        v.phase === 'result' || v.phase === 'gameEnd' ? `+${p.points}` : v.phase === 'reveal' ? `+${p.turnPoints}` : p.gotIt !== null ? `got it! ${(p.gotIt / 1000).toFixed(0)}s` : drawing ? 'drawing' : '';
      this.list.add(text(this, x + 16, y + 18, right, 24, COLORS.text, { fontStyle: '700' }).setOrigin(0, 0.5));
    });
  }

  update() {
    const v = this.view;
    if (!v) return;
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    this.timerText.setText(v.phase === 'draw' ? String(secs) : '').setColor(secs <= 10 ? COLORS.danger : COLORS.text);
  }
}

