import Phaser from 'phaser';
import { CELL, COLS, ROWS, SHELL_MS, castleOf, landOf, type SiegeView } from '../../../shared/games/castleSiege';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, burstConfetti, hex, text } from '../theme';

const MAP_X = (WIDTH - COLS * CELL) / 2 - 150;
const MAP_Y = 180;

/** The TV during Castle Siege: the whole map, everyone's walls and castle, shells arcing over in the fire. */
export class CastleSiegeScene extends Phaser.Scene {
  static readonly KEY = 'castle-siege';
  private view: SiegeView | null = null;
  private viewAt = 0;
  private g!: Phaser.GameObjects.Graphics;
  private headerText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private list!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private phaseKey = '';

  constructor() {
    super(CastleSiegeScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    addBackdrop(this);
    text(this, 60, 70, 'CASTLE SIEGE', 54, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5);
    this.headerText = text(this, WIDTH / 2, 70, '', 36);
    this.timerText = text(this, WIDTH - 120, 70, '', 64, COLORS.text, { fontStyle: '700' });
    this.phaseText = text(this, MAP_X + (COLS * CELL) / 2, 145, '', 52, COLORS.accent, { fontStyle: '700' });
    this.g = this.add.graphics();
    this.list = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);
    listen(this, 'gameView', (v: SiegeView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as SiegeView);
  }

  private applyView(v: SiegeView) {
    this.view = v;
    this.viewAt = performance.now();
    this.headerText.setText(`Round ${v.puzzleNumber} of ${v.totalPuzzles} · Siege ${Math.min(v.cycle, 4)} of 4`);
    this.phaseText.setText(v.phase === 'cannons' ? 'PLACE CANNONS!' : v.phase === 'fire' ? 'FIRE!' : v.phase === 'repair' ? 'REPAIR!' : '');
    const pk = `${v.puzzleNumber}|${v.phase}`;
    if (pk !== this.phaseKey) {
      this.phaseKey = pk;
      this.overlay.removeAll(true);
      if (v.phase === 'result') burstConfetti(this, WIDTH / 2, 360, 60);
      if (v.phase === 'gameEnd') showRoundScores(this, this.overlay, v.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
    }
    this.list.removeAll(true);
    v.players.forEach((p, i) => {
      const x = MAP_X + COLS * CELL + 40;
      const y = 220 + i * 90;
      this.list.add(this.add.rectangle(x, y, 300, 76, p.out ? 0x3a3350 : 0x2a2160, 0.95).setOrigin(0, 0.5).setStrokeStyle(3, hex(p.color)));
      this.list.add(text(this, x + 16, y - 14, p.name, 28, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
      const status = v.phase === 'result' || v.phase === 'gameEnd' ? `+${p.points}` : p.out ? 'FALLEN' : p.enclosed > 0 ? `walled in (${p.enclosed})` : 'OPEN!';
      this.list.add(text(this, x + 16, y + 18, status, 24, p.out || p.enclosed === 0 ? COLORS.danger : COLORS.text, { fontStyle: '700' }).setOrigin(0, 0.5));
    });
  }

  update(time: number) {
    const v = this.view;
    const g = this.g.clear();
    if (!v) return;
    const secs = Math.max(0, Math.ceil((v.msLeft - (performance.now() - this.viewAt)) / 1000));
    this.timerText.setText(v.phase === 'cannons' || v.phase === 'fire' || v.phase === 'repair' ? String(secs) : '');
    const n = v.players.length;
    const colors = v.players.map((p) => hex(p.color));
    for (const p of v.players) {
      const l = landOf(p.index, n);
      g.fillStyle(p.out ? 0x2a2440 : 0x4cae5c, 1).fillRect(MAP_X + l.x * CELL, MAP_Y + l.y * CELL, l.w * CELL, l.h * CELL);
      g.lineStyle(2, 0x140f2e, 0.6).strokeRect(MAP_X + l.x * CELL, MAP_Y + l.y * CELL, l.w * CELL, l.h * CELL);
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = v.walls[y * COLS + x];
        if (ch === '.') continue;
        g.fillStyle(0x140f2e, 1).fillRect(MAP_X + x * CELL, MAP_Y + y * CELL, CELL, CELL);
        g.fillStyle(0x9a93b8, 1).fillRect(MAP_X + x * CELL + 2, MAP_Y + y * CELL + 2, CELL - 4, CELL - 4);
        g.fillStyle(colors[Number(ch)] ?? 0xffffff, 1).fillRect(MAP_X + x * CELL + 2, MAP_Y + y * CELL + 2, CELL - 4, 5);
      }
    }
    for (const p of v.players) {
      const c = castleOf(p.index, n);
      const x = MAP_X + c.x * CELL;
      const y = MAP_Y + c.y * CELL;
      g.fillStyle(0x140f2e, 1).fillRect(x - 2, y - 2, CELL * 2 + 4, CELL * 2 + 4);
      g.fillStyle(p.out ? 0x555555 : hex(p.color), 1).fillRect(x, y, CELL * 2, CELL * 2);
      g.fillStyle(0x140f2e, 1).fillRect(x + 6, y - 8, 8, 8).fillRect(x + CELL * 2 - 14, y - 8, 8, 8);
    }
    for (let i = 0; i < v.cannons.length; i += 4) {
      const [owner, cx, cy] = v.cannons.slice(i, i + 4);
      const x = MAP_X + cx * CELL;
      const y = MAP_Y + cy * CELL;
      g.fillStyle(0x140f2e, 1).fillRect(x, y, CELL * 2, CELL * 2);
      g.fillStyle(colors[owner] ?? 0xffffff, 1).fillCircle(x + CELL, y + CELL, CELL * 0.62);
      g.fillStyle(0x140f2e, 1).fillCircle(x + CELL, y + CELL, CELL * 0.24);
    }
    // Shells in flight: an arc from the firing cannon to where it lands.
    const elapsed = performance.now() - this.viewAt;
    for (let i = 0; i < v.shells.length; i += 5) {
      const [fx, fy, tx, ty, left] = v.shells.slice(i, i + 5);
      const k = Math.min(1, 1 - (left - elapsed) / SHELL_MS);
      if (k < 0) continue;
      const x = MAP_X + (fx + (tx - fx) * k) * CELL + CELL / 2;
      const y = MAP_Y + (fy + (ty - fy) * k) * CELL + CELL / 2 - Math.sin(k * Math.PI) * 120;
      g.fillStyle(0x140f2e, 1).fillCircle(x, y, 9);
      g.fillStyle(0xffd166, 1).fillCircle(x, y, 6 + Math.sin(time / 50));
    }
  }
}
