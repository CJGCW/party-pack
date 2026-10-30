import Phaser from 'phaser';
import { E, N, S, W, type Maze, type MazeHostPlayer, type MazeHostView } from '../../../shared/games/mazeRace';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, panel, text } from '../theme';

const LEFT_X = 80;
const LEFT_W = 940;
const PANEL_TOP = 160;
const PANEL_H = 860;
const MAZE_AREA = { x: 1080, y: 150, w: 760, h: 880 };
/** How long the trails take to draw in at the reveal. */
const TRAIL_DRAW_MS = 2_500;

function ordinal(n: number) {
  return `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
}

/**
 * The TV during Maze Race. Everyone's maze is on their own phone, so while they race the TV shows
 * the maze and how close each player is to the exit. At the reveal, everyone's trail draws in
 * over the maze, with the shortest way through.
 */
export class MazeRaceScene extends Phaser.Scene {
  static readonly KEY = 'maze-race';

  private view: MazeHostView | null = null;
  private renderKey = '';
  private phaseEndsAt = 0;
  private revealStartedAt = 0;
  private headerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private mazeLayer!: Phaser.GameObjects.Graphics;
  private trails!: Phaser.GameObjects.Graphics;
  private panelLayer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(MazeRaceScene.KEY);
  }

  create() {
    this.view = null;
    this.renderKey = '';
    addBackdrop(this);
    text(this, 230, 70, 'MAZE RACE', 54, COLORS.accent, { fontStyle: '700' });
    this.headerText = text(this, WIDTH / 2 - 100, 70, '', 40);
    this.timerText = text(this, WIDTH - 140, 70, '', 64, COLORS.text, { fontStyle: '700' });
    this.mazeLayer = this.add.graphics();
    this.trails = this.add.graphics();
    this.countdownText = text(this, MAZE_AREA.x + MAZE_AREA.w / 2, MAZE_AREA.y + MAZE_AREA.h / 2, '', 260, COLORS.accent, { fontStyle: '700' });
    this.panelLayer = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: MazeHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as MazeHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  update(now: number) {
    const v = this.view;
    if (!v) return;
    const left = Math.max(0, this.phaseEndsAt - performance.now());
    const secs = Math.ceil(left / 1000);
    this.timerText.setText(v.phase === 'race' ? String(secs) : '').setColor(secs <= 10 ? COLORS.danger : COLORS.text);
    this.countdownText.setText(v.phase === 'ready' ? String(Math.max(1, secs)) : '');
    if (v.phase === 'reveal') this.drawTrails(v, Math.min(1, (now - this.revealStartedAt) / TRAIL_DRAW_MS));
  }

  private applyView(view: MazeHostView) {
    const key = `${view.puzzleNumber}|${view.phase}`;
    const changed = key !== this.renderKey;
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.headerText.setText(`Maze ${view.puzzleNumber} of ${view.totalPuzzles}`);
    if (changed) {
      this.renderKey = key;
      this.overlay.removeAll(true);
      this.trails.clear();
      this.drawMaze(view.maze);
      if (view.phase === 'reveal') {
        this.revealStartedAt = this.time.now;
        if (view.players.some((p) => p.place === 1)) burstConfetti(this, LEFT_X + LEFT_W / 2, PANEL_TOP + 60, 60);
      }
      if (view.phase === 'gameEnd') {
        showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
      }
    }
    this.renderPlayers(view);
  }

  /** The maze's size and where it sits, filling the space on the right. */
  private layout(maze: Maze) {
    const cell = Math.floor(Math.min(MAZE_AREA.w / maze.cols, MAZE_AREA.h / maze.rows));
    const x = MAZE_AREA.x + (MAZE_AREA.w - cell * maze.cols) / 2;
    const y = MAZE_AREA.y + (MAZE_AREA.h - cell * maze.rows) / 2;
    return { cell, x, y };
  }

  private drawMaze(maze: Maze | null) {
    const g = this.mazeLayer.clear();
    if (!maze) return;
    const { cell, x: ox, y: oy } = this.layout(maze);
    g.fillStyle(COLORS.empty, 1).fillRect(ox, oy, cell * maze.cols, cell * maze.rows);
    const ex = maze.exit % maze.cols;
    const ey = Math.floor(maze.exit / maze.cols);
    g.fillStyle(COLORS.correct, 1).fillRect(ox + ex * cell, oy + ey * cell, cell, cell);
    g.fillStyle(hex(COLORS.accent), 0.5).fillRect(ox, oy, cell, cell);
    g.lineStyle(6, hex(COLORS.muted), 1);
    for (let c = 0; c < maze.open.length; c++) {
      const x = ox + (c % maze.cols) * cell;
      const y = oy + Math.floor(c / maze.cols) * cell;
      const o = maze.open[c];
      if (!(o & N)) g.lineBetween(x - 3, y, x + cell + 3, y);
      if (!(o & W)) g.lineBetween(x, y - 3, x, y + cell + 3);
      if (!(o & E) && c % maze.cols === maze.cols - 1) g.lineBetween(x + cell, y - 3, x + cell, y + cell + 3);
      if (!(o & S) && Math.floor(c / maze.cols) === maze.rows - 1) g.lineBetween(x - 3, y + cell, x + cell + 3, y + cell);
    }
  }

  /** At the reveal: the shortest way, then each player's trail, drawn in up to `t` (0 to 1) of the way. */
  private drawTrails(view: MazeHostView, t: number) {
    const maze = view.maze;
    const g = this.trails.clear();
    if (!maze) return;
    const { cell, x: ox, y: oy } = this.layout(maze);
    const runners = view.players.filter((p) => p.trail && p.trail.length > 1);
    const at = (c: number, offset: number) => ({
      x: ox + (c % maze.cols) * cell + cell / 2 + offset,
      y: oy + Math.floor(c / maze.cols) * cell + cell / 2 + offset,
    });
    const line = (cells: number[], upTo: number, offset: number) => {
      const n = Math.max(1, Math.round(cells.length * upTo));
      const first = at(cells[0], offset);
      g.beginPath();
      g.moveTo(first.x, first.y);
      for (let i = 1; i < n; i++) {
        const p = at(cells[i], offset);
        g.lineTo(p.x, p.y);
      }
      g.strokePath();
      return at(cells[n - 1], offset);
    };
    if (view.solution) {
      g.lineStyle(cell * 0.5, hex(COLORS.accent), 0.25);
      line(view.solution, 1, 0);
    }
    // Each player a little to one side of the others, so overlapping trails stay visible.
    const spread = Math.min(cell * 0.4, 6 * runners.length);
    runners.forEach((p, i) => {
      const offset = runners.length > 1 ? (i / (runners.length - 1) - 0.5) * spread : 0;
      g.lineStyle(5, hex(p.color), 0.85);
      const end = line(p.trail!, t, offset);
      g.fillStyle(hex(p.color), 1).fillCircle(end.x, end.y, cell * 0.22);
    });
  }

  /** Each player's progress to the exit, or their place once they're out; by points at the reveal. */
  private renderPlayers(view: MazeHostView) {
    this.panelLayer.removeAll(true);
    const o = this.panelLayer;
    o.add(panel(this, LEFT_X, PANEL_TOP, LEFT_W, PANEL_H));
    const revealing = view.phase === 'reveal';
    const order = (p: MazeHostPlayer) => (p.place ?? 100) * 10 - p.progress;
    const rows = revealing || view.phase === 'race' ? [...view.players].sort((a, b) => order(a) - order(b)) : view.players;
    const rowH = Math.min(100, (PANEL_H - 40) / Math.max(1, rows.length));
    const barX = LEFT_X + 300;
    const barW = LEFT_W - 300 - 200;
    rows.forEach((p, i) => {
      const y = PANEL_TOP + 20 + i * rowH + rowH / 2;
      o.add(text(this, LEFT_X + 36, y, p.name, 36, p.color, { fontStyle: '700' }).setOrigin(0, 0.5).setCrop(0, 0, 250, 60));
      const bar = this.add.graphics();
      bar.fillStyle(COLORS.empty, 1).fillRoundedRect(barX, y - 14, barW, 28, 14);
      if (view.phase !== 'ready' && p.progress > 0) bar.fillStyle(hex(p.color), 1).fillRoundedRect(barX, y - 14, Math.max(28, barW * p.progress), 28, 14);
      o.add(bar);
      let status = view.phase === 'ready' ? 'ready' : `${Math.round(p.progress * 100)}%`;
      let color: string = COLORS.muted;
      if (p.place !== null) {
        status = `${ordinal(p.place)} · ${(p.finishMs! / 1000).toFixed(1)}s`;
        color = COLORS.accent;
      } else if (p.gaveUp) status = 'gave up';
      if (revealing) {
        status = p.points ? `+${p.points}` : '0';
        color = p.place !== null ? COLORS.accent : COLORS.text;
      }
      o.add(text(this, LEFT_X + LEFT_W - 36, y, status, 32, color, { fontStyle: '700' }).setOrigin(1, 0.5));
    });
    if (view.phase === 'ready') o.add(text(this, LEFT_X + LEFT_W / 2, HEIGHT - 110, 'Same maze for everyone. Get ready on your phones!', 30, COLORS.muted));
  }
}
