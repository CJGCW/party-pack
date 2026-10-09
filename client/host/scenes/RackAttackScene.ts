import Phaser from 'phaser';
import {
  LETTER_VALUES,
  SIZE,
  premiumAt,
  type Placement,
  type RackHostPlayer,
  type RackHostView,
} from '../../../shared/games/rackAttack';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, burstConfetti, hex, panel, text } from '../theme';

const CELL = 76;
const GAP = 4;
const BOARD_X = 110;
const BOARD_Y = 150;
const PANEL_X = 1060;
const PANEL_W = 780;

const PREMIUM_COLOR = { TW: 0xa83250, DW: 0x8a3f86, TL: 0x2f6db5, DL: 0x3d5a99, STAR: 0x8a3f86 } as const;
const PREMIUM_LABEL = { TW: 'TRIPLE\nWORD', DW: 'DOUBLE\nWORD', TL: 'TRIPLE\nLETTER', DL: 'DOUBLE\nLETTER', STAR: '★' } as const;
const TILE = 0xf6e7b8;
const INK = '#140f2e';

/**
 * The TV during Rack Attack: the board everyone is playing on and the shared rack,
 * who has locked in, then everyone's play and the best one possible.
 */
export class RackAttackScene extends Phaser.Scene {
  static readonly KEY = 'rack-attack';

  private view: RackHostView | null = null;
  private renderKey = '';
  private phaseEndsAt = 0;
  private headerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private boardLayer!: Phaser.GameObjects.Container;
  private panelLayer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(RackAttackScene.KEY);
  }

  create() {
    this.view = null;
    this.renderKey = '';
    addBackdrop(this);
    text(this, 220, 70, 'RACK ATTACK', 54, COLORS.accent, { fontStyle: '700' });
    this.headerText = text(this, WIDTH / 2 + 250, 70, '', 40);
    this.timerText = text(this, WIDTH - 140, 70, '', 64, COLORS.text, { fontStyle: '700' });
    this.boardLayer = this.add.container(0, 0);
    this.panelLayer = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: RackHostView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as RackHostView);
  }

  update() {
    if (this.view?.phase !== 'play') {
      this.timerText.setText('');
      return;
    }
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    this.timerText.setText(String(secs)).setColor(secs <= 10 ? COLORS.danger : COLORS.text);
  }

  private applyView(view: RackHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.headerText.setText(`Board ${view.puzzleNumber} of ${view.totalPuzzles}`);
    this.renderPanel(view);

    const key = `${view.puzzleNumber}|${view.phase}`;
    if (key === this.renderKey) return;
    this.renderKey = key;
    this.overlay.removeAll(true);

    if (view.phase === 'gameEnd') {
      showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
      return;
    }
    // At the reveal, show the top play on the board in that player's colour (or the best possible, if nobody played).
    let shown: { tiles: Placement[]; color: number } | null = null;
    if (view.phase === 'reveal') {
      const top = this.topPlayer(view.players);
      if (top?.move) shown = { tiles: top.move.tiles, color: hex(top.color) };
      else if (view.best) shown = { tiles: view.best.tiles, color: COLORS.correct };
      if (top?.move && view.best && top.move.score >= view.best.score) burstConfetti(this, 540, 500, 70);
    }
    this.renderBoard(view.board, shown);
  }

  private topPlayer(players: RackHostPlayer[]) {
    return [...players].filter((p) => p.move && p.move.score > 0).sort((a, b) => b.move!.score - a.move!.score)[0];
  }

  private drawTile(container: Phaser.GameObjects.Container, x: number, y: number, size: number, letter: string, fill = TILE) {
    const g = this.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(x - size / 2, y - size / 2, size, size, size * 0.14);
    container.add(g);
    container.add(text(this, x, y + 2, letter, size * 0.56, INK, { fontStyle: '700' }));
    container.add(text(this, x + size * 0.32, y + size * 0.3, String(LETTER_VALUES[letter] ?? ''), size * 0.2, INK, { fontStyle: '700' }));
  }

  private renderBoard(board: string[][], shown: { tiles: Placement[]; color: number } | null) {
    this.boardLayer.removeAll(true);
    const placed = new Map(shown?.tiles.map((t) => [`${t.row},${t.col}`, t.letter]) ?? []);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.empty, 1);
    bg.fillRoundedRect(BOARD_X - 10, BOARD_Y - 10, SIZE * (CELL + GAP) + 16, SIZE * (CELL + GAP) + 16, 18);
    this.boardLayer.add(bg);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const x = BOARD_X + c * (CELL + GAP) + CELL / 2;
        const y = BOARD_Y + r * (CELL + GAP) + CELL / 2;
        const letter = board[r][c];
        const newLetter = placed.get(`${r},${c}`);
        if (letter) {
          this.drawTile(this.boardLayer, x, y, CELL, letter);
        } else if (newLetter && shown) {
          this.drawTile(this.boardLayer, x, y, CELL, newLetter, shown.color);
        } else {
          const p = premiumAt(r, c);
          const g = this.add.graphics();
          g.fillStyle(p ? PREMIUM_COLOR[p] : COLORS.panel, 1);
          g.fillRoundedRect(x - CELL / 2, y - CELL / 2, CELL, CELL, 8);
          this.boardLayer.add(g);
          if (p) {
            const label = PREMIUM_LABEL[p];
            this.boardLayer.add(
              text(this, x, y, label, p === 'STAR' ? 44 : 14, p === 'STAR' ? COLORS.accent : '#ffffffcc', { fontStyle: '700', align: 'center' }),
            );
          }
        }
      }
    }
  }

  /** The rack, and each player's status (or, at the reveal, their play and points). */
  private renderPanel(view: RackHostView) {
    this.panelLayer.removeAll(true);
    const o = this.panelLayer;
    o.add(panel(this, PANEL_X, 140, PANEL_W, 190));
    o.add(text(this, PANEL_X + PANEL_W / 2, 175, "EVERYONE'S TILES", 30, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(3));
    const size = 88;
    view.rack.forEach((l, i) => this.drawTile(o, PANEL_X + PANEL_W / 2 + (i - 3) * (size + 14), 265, size, l));

    const revealing = view.phase === 'reveal';
    const rows = [...view.players].sort((a, b) => (revealing ? (b.move?.score ?? -1) - (a.move?.score ?? -1) : 0));
    const top = 360;
    const rowH = Math.min(78, 520 / Math.max(1, rows.length));
    o.add(panel(this, PANEL_X, top, PANEL_W, rows.length * rowH + 30));
    rows.forEach((p, i) => {
      const y = top + 15 + i * rowH + rowH / 2;
      o.add(text(this, PANEL_X + 30, y, p.name, 34, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
      let status = p.submitted ? '✓ locked in' : 'thinking…';
      let color: string = p.submitted ? COLORS.accent : COLORS.muted;
      if (revealing) {
        status = p.move && p.move.score > 0 ? `${p.move.words.map((w) => w.word).join(' · ')}  ${p.move.score}  (+${p.points})` : 'no play';
        color = p.move && p.move.score > 0 ? COLORS.text : COLORS.muted;
      }
      o.add(text(this, PANEL_X + PANEL_W - 30, y, status, 28, color, { fontStyle: '700', wordWrap: { width: PANEL_W - 260 }, align: 'right' }).setOrigin(1, 0.5));
    });

    if (revealing && view.best) {
      const y = top + rows.length * rowH + 90;
      o.add(panel(this, PANEL_X, y - 45, PANEL_W, 120, COLORS.panelLight));
      o.add(text(this, PANEL_X + PANEL_W / 2, y - 12, 'BEST POSSIBLE PLAY', 26, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(3));
      o.add(
        text(this, PANEL_X + PANEL_W / 2, y + 32, `${view.best.words.map((w) => w.word).join(' · ')}  for ${view.best.score}`, 38, COLORS.accent, {
          fontStyle: '700',
          wordWrap: { width: PANEL_W - 40 },
          align: 'center',
        }),
      );
    }
  }
}
