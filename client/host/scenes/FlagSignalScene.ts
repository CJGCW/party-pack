import Phaser from 'phaser';
import { DANGER, GOLD, INK, SKY, playerCard, shade, softShadow } from '../art';
import { addHudBar } from '../hud';
import { levelAt, sequenceFor, type Dir, type FlagHostView } from '../../../shared/games/flagSignal';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, text } from '../theme';

/** Where each signal's flag points, from the referee's shoulder. */
const ARM: Record<Dir, [number, number]> = { up: [0, -1], down: [0.35, 1], left: [-1, -0.25], right: [1, -0.25] };

/**
 * The TV during Flag Signal: the referee in the middle, waving the round's sequence (worked out
 * from the seed and the round's clock), and everyone's progress along the bottom.
 */
export class FlagSignalScene extends Phaser.Scene {
  static readonly KEY = 'flag-signal';
  private view: FlagHostView | null = null;
  private viewAt = 0;
  private seq: Dir[] = [];
  private seed = -1;
  private g!: Phaser.GameObjects.Graphics;
  private headerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private list!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private phaseKey = '';

  constructor() {
    super(FlagSignalScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    addBackdrop(this);
    addHudBar(this);
    text(this, 60, 70, 'FLAG SIGNAL', 54, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5);
    this.headerText = text(this, WIDTH / 2, 70, '', 40);
    this.timerText = text(this, WIDTH - 140, 70, '', 64, COLORS.text, { fontStyle: '700' });
    this.g = this.add.graphics();
    this.stageText = text(this, WIDTH / 2, 190, '', 56, COLORS.accent, { fontStyle: '700' });
    this.list = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);
    listen(this, 'gameView', (v: FlagHostView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as FlagHostView);
  }

  private applyView(v: FlagHostView) {
    this.view = v;
    this.viewAt = performance.now();
    if (v.seed !== this.seed) {
      this.seed = v.seed;
      this.seq = sequenceFor(v.seed);
    }
    this.headerText.setText(`Round ${v.puzzleNumber} of ${v.totalPuzzles}`);
    const key = `${v.puzzleNumber}|${v.phase}`;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      this.overlay.removeAll(true);
      if (v.phase === 'result' && v.boards.some((b) => b.endedAtMs === null)) burstConfetti(this, WIDTH / 2, 360, 60);
      if (v.phase === 'gameEnd') showRoundScores(this, this.overlay, v.boards.map((b) => ({ name: b.name, color: b.color, points: v.gamePoints[b.playerId] ?? 0 })));
    }
    this.list.removeAll(true);
    const w = Math.min(260, (WIDTH - 120) / Math.max(1, v.boards.length));
    v.boards.forEach((b, i) => {
      const x = WIDTH / 2 + (i - (v.boards.length - 1) / 2) * w;
      const y = HEIGHT - 130;
      const out = b.endedAtMs !== null;
      const s = b.state;
      this.list.add(playerCard(this, x, y, w - 16, 110, out ? 0x3a3350 : 0x2c2366, hex(b.color)));
      this.list.add(text(this, x, y - 24, b.name, 30, b.color, { fontStyle: '700' }));
      const line = v.phase === 'result' || v.phase === 'gameEnd' ? `+${b.points}` : out ? 'OUT' : s.stage === 'answer' ? `${s.done}/${s.need}` : `${b.boardScore} done`;
      this.list.add(text(this, x, y + 22, line, 30, out ? COLORS.danger : s.done === s.need && s.stage === 'answer' ? COLORS.accent : COLORS.text, { fontStyle: '700' }));
    });
  }

  update(time: number) {
    const v = this.view;
    const g = this.g.clear();
    if (!v) return;
    const ms = v.phase === 'play' ? v.roundMs + (performance.now() - this.viewAt) : 0;
    const at = v.phase === 'play' ? levelAt(ms) : null;
    const secs = Math.max(0, Math.ceil((v.msLeft - (performance.now() - this.viewAt)) / 1000));
    this.timerText.setText(v.phase === 'play' || v.phase === 'ready' ? String(secs) : '');
    this.stageText.setText(!at ? '' : at.stage === 'show' ? `WATCH! ${at.k} signal${at.k === 1 ? '' : 's'}` : at.stage === 'answer' ? 'YOUR TURN!' : '');
    // The referee: a round body, and two arms; the flag arm points at the signal being shown.
    const [cx, cy] = [WIDTH / 2, 520];
    const dir = at?.stage === 'show' ? this.seq[at.signal] : null;
    const bob = Math.sin(time / 300) * 4;
    softShadow(g, cx, cy + 180, 230, 34);
    g.fillStyle(INK, 1).fillEllipse(cx, cy + 40 + bob, 232, 262);
    g.fillStyle(shade(0xf2f2f2, -0.25), 1).fillEllipse(cx, cy + 40 + bob, 214, 244);
    g.fillStyle(0xf2f2f2, 1).fillEllipse(cx - 2, cy + 30 + bob, 194, 216);
    g.fillStyle(GOLD, 1).fillRect(cx - 105, cy + 10 + bob, 210, 22);
    g.fillStyle(INK, 1).fillCircle(cx - 34, cy - 30 + bob, 10).fillCircle(cx + 34, cy - 30 + bob, 10);
    const arm = (side: number, d: [number, number] | null, color: number) => {
      const sx = cx + side * 100;
      const sy = cy + bob;
      const [dx, dy] = d ?? [side * 0.6, 0.8];
      const ex = sx + dx * 150;
      const ey = sy + dy * 150;
      g.lineStyle(22, INK, 1).lineBetween(sx, sy, ex, ey);
      g.lineStyle(14, 0xf2f2f2, 1).lineBetween(sx, sy, ex, ey);
      // The flag on the end.
      g.fillStyle(color, 1).fillTriangle(ex, ey, ex + (dy === 0 ? 0 : 60) * Math.sign(dx || 1), ey - 30, ex + 70 * (dx || 0.3), ey + 40 * (dy || 0.3));
    };
    const side = dir === 'left' ? -1 : 1;
    arm(side, dir ? ARM[dir] : null, DANGER);
    arm(-side, null, SKY);
    // And in words, as each signal shows.
    if (dir) {
      const arrows: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };
      this.stageText.setText(`${arrows[dir]}  ${dir.toUpperCase()}  ${arrows[dir]}`);
    }
  }
}
