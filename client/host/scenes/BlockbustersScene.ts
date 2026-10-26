import Phaser from 'phaser';
import type { BlockbustersHostView, Team } from '../../../shared/games/blockbusters';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, hex, text } from '../theme';

const RED = 0xff5d73;
const WHITE = 0xf2f0ff;
const INK = '#140f2e';
const TEAM_NAME: Record<Team, string> = { red: 'RED', white: 'WHITE' };
/** The board fills this box on the left of the screen. */
const BOARD_BOX = { x: 70, y: 150, w: 980, h: 840 };
const SIDE_X = 1130;
const SIDE_W = 720;

/**
 * The TV during Blockbusters: the hexagon board with each team's edges, the letter and question
 * in play, who's buzzed in, and the two teams.
 */
export class BlockbustersScene extends Phaser.Scene {
  static readonly KEY = 'blockbusters';

  private view: BlockbustersHostView | null = null;
  private phaseEndsAt = 0;
  private headerText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private board!: Phaser.GameObjects.Container;
  private side!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(BlockbustersScene.KEY);
  }

  create() {
    this.view = null;
    addBackdrop(this, { blobs: false });
    text(this, 80, 64, 'BLOCKBUSTERS', 30, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5).setLetterSpacing(6);
    this.headerText = text(this, WIDTH / 2, 64, '', 30, COLORS.muted);
    this.timerText = text(this, WIDTH - 80, 64, '', 56, COLORS.text, { fontStyle: '700' }).setOrigin(1, 0.5);
    this.board = this.add.container(0, 0);
    this.side = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: BlockbustersHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as BlockbustersHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  update() {
    const v = this.view;
    const timed = v && ['pick', 'question', 'answer'].includes(v.phase);
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    this.timerText.setText(timed ? String(secs) : '').setColor(secs <= 3 ? COLORS.danger : COLORS.text);
  }

  private applyView(view: BlockbustersHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.headerText.setText(`Board ${view.board} of ${view.totalBoards}   ·   ${view.topic}   ·   Red ${view.wins.red} – ${view.wins.white} White`);
    this.renderBoard(view);
    this.renderSide(view);
    this.overlay.removeAll(true);
    if (view.phase === 'gameEnd') {
      showRoundScores(this, this.overlay, view.players.filter((p) => p.team).map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
    }
  }

  /** Flat-topped hexagons in columns, odd columns half a hexagon lower, as on the show. */
  private renderBoard(view: BlockbustersHostView) {
    // The current hexagon pulses; stop it before redrawing (round scores add theirs afterwards).
    this.tweens.killAll();
    this.board.removeAll(true);
    const edge = 22;
    const r = Math.min((BOARD_BOX.w - edge * 2) / (1.5 * view.cols + 0.5), (BOARD_BOX.h - edge * 2) / (Math.sqrt(3) * (view.rows + 0.5)));
    const hexH = Math.sqrt(3) * r;
    const w = r * (1.5 * view.cols + 0.5);
    const hgt = hexH * (view.rows + 0.5);
    const left = BOARD_BOX.x + (BOARD_BOX.w - w) / 2;
    const top = BOARD_BOX.y + (BOARD_BOX.h - hgt) / 2;

    // Each team's edges: Red along the top and bottom, White down the sides.
    const g = this.add.graphics();
    g.fillStyle(RED, 1);
    g.fillRoundedRect(left - edge, top - edge, w + edge * 2, edge - 6, 6);
    g.fillRoundedRect(left - edge, top + hgt + 6, w + edge * 2, edge - 6, 6);
    g.fillStyle(WHITE, 1);
    g.fillRoundedRect(left - edge, top, edge - 6, hgt, 6);
    g.fillRoundedRect(left + w + 6, top, edge - 6, hgt, 6);
    this.board.add(g);

    const picking = view.phase === 'pick';
    view.hexes.forEach((hx, i) => {
      const col = i % view.cols;
      const row = Math.floor(i / view.cols);
      const cx = left + r + col * 1.5 * r;
      const cy = top + hexH / 2 + row * hexH + (col % 2 ? hexH / 2 : 0);
      const current = i === view.current && !hx.owner;
      const onPath = view.winningPath.includes(i);
      const fill = hx.owner === 'red' ? RED : hx.owner === 'white' ? WHITE : current ? hex(COLORS.accent) : COLORS.panelLight;
      const shape = this.add.graphics();
      const points = Array.from({ length: 6 }, (_, k) => {
        const a = (Math.PI / 3) * k;
        return new Phaser.Math.Vector2(cx + r * 0.94 * Math.cos(a), cy + r * 0.94 * Math.sin(a));
      });
      shape.fillStyle(fill, 1);
      shape.fillPoints(points, true);
      if (onPath || (picking && !hx.owner)) {
        shape.lineStyle(onPath ? 8 : 3, onPath ? hex(COLORS.accent) : 0x7d70d8, 1);
        shape.strokePoints(points, true);
      }
      this.board.add(shape);
      const letterColor = hx.owner || current ? INK : COLORS.accent;
      this.board.add(text(this, cx, cy, hx.letter, r * 0.8, letterColor, { fontStyle: '700' }));
      if (current && view.phase !== 'pick') {
        this.tweens.add({ targets: shape, alpha: 0.6, duration: 450, yoyo: true, repeat: -1 });
      }
    });
  }

  private renderSide(view: BlockbustersHostView) {
    this.side.removeAll(true);
    const letter = view.current !== null ? view.hexes[view.current].letter : null;
    const add = (o: Phaser.GameObjects.GameObject) => this.side.add(o);
    let y = 170;

    // What's happening now.
    const cardH = 430;
    const g = this.add.graphics();
    g.fillStyle(COLORS.panel, 1);
    g.fillRoundedRect(SIDE_X, y, SIDE_W, cardH, 24);
    add(g);
    const mid = SIDE_X + SIDE_W / 2;
    if (view.phase === 'pick') {
      const color = view.control === 'red' ? COLORS.danger : '#f2f0ff';
      add(text(this, mid, y + 150, `${TEAM_NAME[view.control]}`, 72, color, { fontStyle: '700' }).setLetterSpacing(6));
      add(text(this, mid, y + 240, 'is choosing a letter', 36, COLORS.text, { fontStyle: '700' }));
      add(text(this, mid, y + 300, view.control === 'red' ? 'Red links top to bottom' : 'White links left to right', 28, COLORS.muted));
    } else if (view.phase === 'boardEnd') {
      const color = view.winner === 'red' ? COLORS.danger : view.winner === 'white' ? '#f2f0ff' : COLORS.muted;
      add(text(this, mid, y + 170, view.winner ? `${TEAM_NAME[view.winner]} WINS` : 'NO WINNER', 72, color, { fontStyle: '700' }).setLetterSpacing(4));
      add(text(this, mid, y + 260, view.winner ? 'the board!' : 'The board is full.', 36, COLORS.text, { fontStyle: '700' }));
    } else if (letter) {
      add(text(this, mid, y + 60, `"${letter}"`, 56, COLORS.accent, { fontStyle: '700' }));
      add(text(this, mid, y + 190, view.question ?? '', 36, COLORS.text, { fontStyle: '700', align: 'center', wordWrap: { width: SIDE_W - 60 } }));
      let status = '';
      let statusColor: string = COLORS.muted;
      if (view.phase === 'question') {
        status = view.lockedOut.length ? `${TEAM_NAME[view.lockedOut[0] === 'red' ? 'white' : 'red']}, it's yours to buzz` : 'Buzz in on your phone!';
      } else if (view.phase === 'answer' && view.buzzer) {
        status = `${view.buzzer.name} (${TEAM_NAME[view.buzzer.team]}) is answering…`;
        statusColor = COLORS.accent;
      } else if (view.phase === 'result') {
        if (!view.buzzer) status = `Nobody got it: ${view.answer}`;
        else if (view.correct) {
          status = `${view.buzzer.name}: "${view.guess}"  ✓  ${view.answer}`;
          statusColor = COLORS.accent;
        } else {
          status = view.guess ? `${view.buzzer.name}: "${view.guess}"  ✗` : `${view.buzzer.name} ran out of time`;
          statusColor = COLORS.danger;
        }
      }
      add(text(this, mid, y + cardH - 50, status, 30, statusColor, { fontStyle: '700', align: 'center', wordWrap: { width: SIDE_W - 60 } }));
    }
    y += cardH + 30;

    // The teams.
    for (const team of ['red', 'white'] as Team[]) {
      const members = view.players.filter((p) => p.team === team);
      const h = 150;
      const box = this.add.graphics();
      box.fillStyle(team === 'red' ? RED : WHITE, team === view.control && view.phase === 'pick' ? 1 : 0.85);
      box.fillRoundedRect(SIDE_X, y, SIDE_W, h, 20);
      add(box);
      add(text(this, SIDE_X + 30, y + 36, `${TEAM_NAME[team]}  ·  ${view.wins[team]} board${view.wins[team] === 1 ? '' : 's'}`, 30, INK, { fontStyle: '700' }).setOrigin(0, 0.5));
      add(
        text(this, SIDE_X + 30, y + 100, members.map((m) => m.name).join('   ') || '—', 34, INK, { fontStyle: '700', wordWrap: { width: SIDE_W - 60 } }).setOrigin(0, 0.5),
      );
      y += h + 20;
    }
  }
}
