import Phaser from 'phaser';
import { CELL, COLS, ROWS, SHELL_MS, castleOf, landOf, type SiegeView } from '../../../shared/games/castleSiege';
import { GOLD, INK, STONE, ball, block, brick, glow, shade } from '../art';
import { burst, impact } from '../fx';
import { GameHud } from '../hud';
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
  private hud!: GameHud;
  private phaseText!: Phaser.GameObjects.Text;
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
    this.hud = new GameHud(this, 'CASTLE SIEGE');
    this.phaseText = text(this, MAP_X + (COLS * CELL) / 2, 145, '', 52, COLORS.accent, { fontStyle: '700' });
    this.g = this.add.graphics();
    this.list = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);
    listen(this, 'gameView', (v: SiegeView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as SiegeView);
  }

  private applyView(v: SiegeView) {
    // Shells gone since the last update have landed.
    if (this.view) {
      const flying = (s: number[]) => Array.from({ length: s.length / 5 }, (_, i) => `${s[i * 5 + 2]},${s[i * 5 + 3]}`);
      const still = new Set(flying(v.shells));
      for (const key of flying(this.view.shells)) {
        if (still.has(key)) continue;
        const [x, y] = key.split(',').map(Number);
        burst(this, MAP_X + (x + 0.5) * CELL, MAP_Y + (y + 0.5) * CELL, 0xff8a3d, 26);
        impact(this, 0.003);
      }
    }
    this.view = v;
    this.viewAt = performance.now();
    this.hud.setHeader(`Round ${v.puzzleNumber} of ${v.totalPuzzles} · Siege ${Math.min(v.cycle, 4)} of 4`);
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
      const card = this.add.graphics();
      block(card, x, y - 40, 300, 80, p.out ? 0x3a3350 : 0x2c2366);
      this.list.add(card);
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
    this.hud.clock(v.phase === 'cannons' || v.phase === 'fire' || v.phase === 'repair' ? secs : null, 5);
    const n = v.players.length;
    const colors = v.players.map((p) => hex(p.color));
    for (const p of v.players) {
      const l = landOf(p.index, n);
      const lx = MAP_X + l.x * CELL;
      const ly = MAP_Y + l.y * CELL;
      g.fillStyle(p.out ? 0x2a2440 : 0x2f7d4f, 1).fillRect(lx, ly, l.w * CELL, l.h * CELL);
      if (!p.out) {
        // Tufts of darker grass, in a fixed scatter.
        g.fillStyle(0x276b43, 1);
        for (let i = 0; i < 26; i++) g.fillRoundedRect(lx + ((i * 197) % (l.w * CELL - 40)) + 10, ly + ((i * 311) % (l.h * CELL - 30)) + 8, 26, 10, 5);
      }
      g.lineStyle(4, INK, 1).strokeRect(lx, ly, l.w * CELL, l.h * CELL);
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = v.walls[y * COLS + x];
        if (ch === '.') continue;
        brick(g, MAP_X + x * CELL, MAP_Y + y * CELL, CELL, CELL, STONE);
        g.fillStyle(colors[Number(ch)] ?? 0xffffff, 1).fillRect(MAP_X + x * CELL + 2, MAP_Y + y * CELL + 2, CELL - 4, 4);
      }
    }
    for (const p of v.players) {
      const c = castleOf(p.index, n);
      const x = MAP_X + c.x * CELL;
      const y = MAP_Y + c.y * CELL;
      const body = p.out ? 0x555555 : hex(p.color);
      block(g, x - 2, y - 2, CELL * 2 + 4, CELL * 2 + 4, body);
      // Battlements, and a door.
      for (const bx of [x - 2, x + CELL - 7, x + CELL * 2 - 12]) block(g, bx, y - 11, 14, 14, shade(body, 0.12));
      g.fillStyle(INK, 1).fillRoundedRect(x + CELL - 7, y + CELL * 0.9, 14, CELL * 1.1, { tl: 7, tr: 7, bl: 0, br: 0 });
    }
    for (let i = 0; i < v.cannons.length; i += 4) {
      const [owner, cx, cy] = v.cannons.slice(i, i + 4);
      const x = MAP_X + cx * CELL;
      const y = MAP_Y + cy * CELL;
      block(g, x, y, CELL * 2, CELL * 2, 0x4a4470);
      ball(g, x + CELL, y + CELL - 2, CELL * 0.56, colors[owner] ?? 0xffffff);
      g.fillStyle(INK, 1).fillCircle(x + CELL, y + CELL - 2, CELL * 0.22);
    }
    // Shells in flight: an arc from the firing cannon to where it lands.
    const elapsed = performance.now() - this.viewAt;
    for (let i = 0; i < v.shells.length; i += 5) {
      const [fx, fy, tx, ty, left] = v.shells.slice(i, i + 5);
      const k = Math.min(1, 1 - (left - elapsed) / SHELL_MS);
      if (k < 0) continue;
      const x = MAP_X + (fx + (tx - fx) * k) * CELL + CELL / 2;
      const y = MAP_Y + (fy + (ty - fy) * k) * CELL + CELL / 2 - Math.sin(k * Math.PI) * 120;
      glow(g, x, y, 30, GOLD);
      ball(g, x, y, 7 + Math.sin(time / 50), 0x3a3358);
    }
  }
}
