import Phaser from 'phaser';
import { BOOM, COLS, HIDDEN, ROWS } from '../../../shared/games/minesweeper';
import type { TurnsView } from '../../../shared/games/mineTurns';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, text } from '../theme';
import { NUMBER_COLORS } from './MinesweeperScene';

const CELL = 72;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;
const BOARD_X = WIDTH / 2 - BOARD_W - 40;
const BOARD_Y = (HEIGHT - BOARD_H) / 2 + 50;

/** The TV during Mine Dash's Turns mode: the one shared field, with who's up and who's found what. */
export class MineTurnsScene extends Phaser.Scene {
  static readonly KEY = 'mine-turns';
  private view: TurnsView | null = null;
  private viewAt = 0;
  private g!: Phaser.GameObjects.Graphics;
  private numbers: Phaser.GameObjects.Text[] = [];
  private headerText!: Phaser.GameObjects.Text;
  private leftText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private list!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private phaseKey = '';

  constructor() {
    super(MineTurnsScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    addBackdrop(this);
    text(this, 60, 70, 'MINE DASH', 54, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5);
    this.headerText = text(this, WIDTH / 2, 70, '', 36);
    this.timerText = text(this, WIDTH - 120, 70, '', 64, COLORS.text, { fontStyle: '700' });
    this.g = this.add.graphics();
    this.numbers = Array.from({ length: COLS * ROWS }, (_, c) => text(this, BOARD_X + (c % COLS) * CELL + CELL / 2, BOARD_Y + Math.floor(c / COLS) * CELL + CELL / 2 + 2, '', CELL * 0.55, COLORS.text, { fontStyle: '700' }));
    this.leftText = text(this, WIDTH / 2 + 240, BOARD_Y + 40, '', 44, COLORS.accent, { fontStyle: '700' });
    this.list = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);
    listen(this, 'gameView', (v: TurnsView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as TurnsView);
  }

  private applyView(v: TurnsView) {
    this.view = v;
    this.viewAt = performance.now();
    this.headerText.setText(`Round ${v.puzzleNumber} of ${v.totalPuzzles} · Find the mines!`);
    this.leftText.setText(v.phase === 'play' ? `${v.left} MINES LEFT` : 'FIELD CLEAR!');
    const pk = `${v.puzzleNumber}|${v.phase}`;
    if (pk !== this.phaseKey) {
      this.phaseKey = pk;
      this.overlay.removeAll(true);
      if (v.phase === 'result') burstConfetti(this, WIDTH / 2, 360, 60);
      if (v.phase === 'gameEnd') showRoundScores(this, this.overlay, v.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
    }
    this.list.removeAll(true);
    v.players.forEach((p, i) => {
      const x = WIDTH / 2 + 20;
      const y = BOARD_Y + 140 + i * 110;
      const up = p.id === v.turn;
      this.list.add(this.add.rectangle(x, y, 440, 92, up ? 0x3b3185 : 0x2a2160, 0.95).setOrigin(0, 0.5).setStrokeStyle(up ? 6 : 3, hex(p.color)));
      this.list.add(text(this, x + 20, y, p.name, 34, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
      const status = v.phase === 'result' || v.phase === 'gameEnd' ? `+${p.points}` : String(p.found);
      this.list.add(text(this, x + 420, y, status, 44, COLORS.text, { fontStyle: '700' }).setOrigin(1, 0.5));
    });
  }

  update(time: number) {
    const v = this.view;
    const g = this.g.clear();
    if (!v) return;
    const secs = Math.max(0, Math.ceil((v.turnMs - (performance.now() - this.viewAt)) / 1000));
    this.timerText.setText(v.phase === 'play' ? String(secs) : '');
    const owners = new Map(v.mines.map((m) => [m.cell, v.players.find((p) => p.id === m.by)?.color]));
    v.squares.forEach((sq, c) => {
      const x = BOARD_X + (c % COLS) * CELL;
      const y = BOARD_Y + Math.floor(c / COLS) * CELL;
      const owner = owners.get(c);
      g.fillStyle(sq === HIDDEN ? ((c + Math.floor(c / COLS)) % 2 ? 0x4a3f9a : 0x433892) : sq === BOOM ? (owner ? hex(owner) : 0x5a1f3a) : 0x1f1848, 1).fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      if (sq === HIDDEN) g.fillStyle(0xffffff, 0.08).fillRect(x + 4, y + 4, CELL - 8, 8);
      if (sq === BOOM) {
        g.fillStyle(0x140f2e, 1).fillCircle(x + CELL / 2, y + CELL / 2, CELL * 0.26);
        g.fillStyle(0xff9f43, 0.6 + 0.4 * Math.sin(time / 150)).fillCircle(x + CELL / 2 + 6, y + CELL / 2 - 6, CELL * 0.08);
      }
      const label = sq > 0 ? String(sq) : '';
      if (this.numbers[c].text !== label) this.numbers[c].setText(label).setColor(NUMBER_COLORS[sq] ?? COLORS.text);
      if (c === v.last) g.lineStyle(5, 0xffffff, 0.9).strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
    });
  }
}
