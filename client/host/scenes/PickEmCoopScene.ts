import Phaser from 'phaser';
import { COOP_PENALTY_MS, type CoopTile, type PickCoopHostView } from '../../../shared/games/pickEm';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, hex, text } from '../theme';

const COLS = 3;
const TILE_W = 560;
const TILE_H = 100;
const GAP_X = 24;
const GAP_Y = 14;
const TILES_TOP = 372;
const INK = '#140f2e';
const PLAYERS_Y = 1010;

/**
 * The TV during Team Pick 'Em: the team's clock, the list filling in as answers are found
 * (each marked with who found it), and a feed of the latest picks and guesses.
 */
export class PickEmCoopScene extends Phaser.Scene {
  static readonly KEY = 'pick-em-coop';

  private view: PickCoopHostView | null = null;
  private phaseEndsAt = 0;
  private listKey = '';
  private penalties = 0;
  private foundCount = 0;
  private headerText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private topicText!: Phaser.GameObjects.Text;
  private questionText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private board!: Phaser.GameObjects.Container;
  private feedRow!: Phaser.GameObjects.Container;
  private playersRow!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(PickEmCoopScene.KEY);
  }

  create() {
    this.view = null;
    this.listKey = '';
    addBackdrop(this, { blobs: false });
    text(this, 80, 64, "TEAM PICK 'EM", 30, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5).setLetterSpacing(6);
    this.headerText = text(this, WIDTH / 2, 64, '', 30, COLORS.muted);
    this.clockText = text(this, WIDTH - 80, 64, '', 64, COLORS.text, { fontStyle: '700' }).setOrigin(1, 0.5);
    this.topicText = text(this, WIDTH / 2, 150, '', 26, COLORS.accent, { fontStyle: '700' }).setLetterSpacing(5);
    this.questionText = text(this, WIDTH / 2, 230, '', 52, COLORS.text, { fontStyle: '700', align: 'center', wordWrap: { width: 1600 } });
    this.progressText = text(this, WIDTH / 2, 324, '', 26, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(3);
    this.board = this.add.container(0, 0);
    this.feedRow = this.add.container(WIDTH / 2, 896);
    this.playersRow = this.add.container(WIDTH / 2, PLAYERS_Y);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: PickCoopHostView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as PickCoopHostView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  update() {
    if (this.view?.phase !== 'answering') {
      this.clockText.setText('');
      return;
    }
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    this.clockText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`).setColor(secs <= 20 ? COLORS.danger : COLORS.text);
  }

  private applyView(view: PickCoopHostView) {
    const key = `${view.questionNumber}|${view.question}`;
    const newList = key !== this.listKey;
    const phaseChanged = this.view?.phase !== view.phase;
    // Flash the clock for each new penalty, and pop the progress for each new find.
    if (!newList && view.phase === 'answering' && view.penalties > this.penalties) this.flashPenalty();
    const newFind = !newList && view.found > this.foundCount;
    this.listKey = key;
    this.penalties = view.penalties;
    this.foundCount = view.found;
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;

    this.headerText.setText(`${view.heading ?? `List ${view.questionNumber} of ${view.totalQuestions}`}   ·   ${view.packName}`);
    this.topicText.setText(view.topic.toUpperCase());
    this.questionText.setText(view.question);
    if (newList) {
      this.questionText.setScale(0.85).setAlpha(0);
      this.tweens.add({ targets: this.questionText, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    }
    this.renderProgress(view, newFind);
    this.renderBoard(view, phaseChanged && view.phase === 'answering');
    this.renderFeed(view);
    this.renderPlayers(view);

    this.overlay.removeAll(true);
    if (view.phase === 'gameEnd') {
      showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
    }
  }

  private renderProgress(view: PickCoopHostView, pop: boolean) {
    if (view.phase === 'question') {
      this.progressText.setText('GET READY…').setColor(COLORS.muted);
    } else if (view.phase === 'reveal') {
      this.progressText
        .setText(view.cleared ? `CLEARED!  ALL ${view.total} FOUND` : `OUT OF TIME  ·  ${view.found} OF ${view.total} FOUND`)
        .setColor(view.cleared ? COLORS.accent : COLORS.danger);
    } else {
      const hint = view.kind === 'typed' ? 'TYPE ANSWERS ON YOUR PHONE' : 'TAP THE RIGHT ONES ON YOUR PHONE';
      this.progressText.setText(`${view.found} / ${view.total} FOUND   ·   ${hint}   ·   WRONG COSTS ${COOP_PENALTY_MS / 1000} SEC`).setColor(COLORS.muted);
    }
    if (pop) this.tweens.add({ targets: this.progressText, scale: 1.12, duration: 140, yoyo: true });
  }

  private renderBoard(view: PickCoopHostView, dealIn: boolean) {
    this.board.removeAll(true);
    const totalW = COLS * TILE_W + (COLS - 1) * GAP_X;
    view.tiles.forEach((tile, i) => {
      const x = WIDTH / 2 - totalW / 2 + (i % COLS) * (TILE_W + GAP_X) + TILE_W / 2;
      const y = TILES_TOP + Math.floor(i / COLS) * (TILE_H + GAP_Y) + TILE_H / 2;
      const c = this.add.container(x, y);
      c.add(this.tileGraphics(tile));
      const label = tile.label ?? `${i + 1}`;
      const labelColor = tile.state === 'missed' ? COLORS.muted : tile.label === null ? COLORS.muted : COLORS.text;
      const labelY = tile.by ? -12 : 0;
      c.add(
        text(this, 0, labelY, label, 34, labelColor, { fontStyle: '700', align: 'center', wordWrap: { width: TILE_W - 60 } }).setAlpha(
          tile.label === null ? 0.35 : 1,
        ),
      );
      if (tile.by) c.add(text(this, 0, 30, tile.by.name, 20, tile.state === 'found' ? INK : COLORS.text, { fontStyle: '700' }).setLetterSpacing(2));
      this.board.add(c);
      if (dealIn) {
        c.setScale(0.7).setAlpha(0);
        this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, delay: i * 40, ease: 'Back.easeOut' });
      }
    });
  }

  private tileGraphics(tile: CoopTile) {
    const g = this.add.graphics();
    const x = -TILE_W / 2;
    const y = -TILE_H / 2;
    if (tile.state === 'found') {
      g.fillStyle(COLORS.correct, 1);
      g.fillRoundedRect(x, y, TILE_W, TILE_H, 18);
      // The finder's colour along the bottom edge.
      if (tile.by) {
        g.fillStyle(hex(tile.by.color), 1);
        g.fillRoundedRect(x, y + TILE_H - 10, TILE_W, 10, { tl: 0, tr: 0, bl: 18, br: 18 });
      }
    } else if (tile.state === 'wrong') {
      g.fillStyle(hex(COLORS.danger), 0.75);
      g.fillRoundedRect(x, y, TILE_W, TILE_H, 18);
    } else {
      g.fillStyle(tile.state === 'missed' ? COLORS.panel : COLORS.panelLight, 1);
      g.fillRoundedRect(x, y, TILE_W, TILE_H, 18);
      g.lineStyle(3, tile.state === 'missed' ? COLORS.correct : 0x5f57a0, 1);
      g.strokeRoundedRect(x, y, TILE_W, TILE_H, 18);
    }
    return g;
  }

  /** The latest picks and guesses, as a row of chips: name, what they tried, and how it went. */
  private renderFeed(view: PickCoopHostView) {
    this.feedRow.removeAll(true);
    if (view.phase !== 'answering') return;
    const items = view.feed.slice(-4);
    const chips = items.map((e) => {
      const mark = e.result === 'right' ? '✓' : e.result === 'wrong' ? `−${COOP_PENALTY_MS / 1000}s` : 'already tried';
      return { e, label: `${e.name}: ${e.answer ?? e.text}   ${mark}` };
    });
    const widths = chips.map((c) => Math.min(440, 40 + c.label.length * 13));
    const gap = 14;
    let x = -(widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)) / 2;
    chips.forEach(({ e, label }, i) => {
      const w = widths[i];
      const g = this.add.graphics();
      g.fillStyle(e.result === 'right' ? COLORS.correct : e.result === 'wrong' ? hex(COLORS.danger) : COLORS.panelLight, i === chips.length - 1 ? 1 : 0.7);
      g.fillRoundedRect(x, -24, w, 48, 24);
      g.fillStyle(hex(e.color), 1);
      g.fillCircle(x + 24, 0, 9);
      this.feedRow.add(g);
      this.feedRow.add(text(this, x + 42, 0, label, 22, COLORS.text, { fontStyle: '700', fixedWidth: w - 54 }).setOrigin(0, 0.5));
      x += w + gap;
    });
  }

  private flashPenalty() {
    const t = text(this, WIDTH - 140, 130, `−${COOP_PENALTY_MS / 1000}s`, 44, COLORS.danger, { fontStyle: '700' });
    this.tweens.add({ targets: t, y: 170, alpha: 0, duration: 1100, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
    this.cameras.main.shake(160, 0.003);
  }

  /** Players along the bottom: how many answers each has found for the team. */
  private renderPlayers(view: PickCoopHostView) {
    this.playersRow.removeAll(true);
    const w = 210;
    const gap = 16;
    const startX = -((view.players.length - 1) * (w + gap)) / 2;
    view.players.forEach((p, i) => {
      const x = startX + i * (w + gap);
      const g = this.add.graphics();
      g.fillStyle(hex(p.color), 1);
      g.fillRoundedRect(x - w / 2, -40, w, 80, 18);
      const status = view.phase === 'question' ? p.score.toLocaleString() : `${p.found} found`;
      this.playersRow.add([g, text(this, x, -12, p.name, 26, INK, { fontStyle: '700' }), text(this, x, 20, status, 22, INK, { fontStyle: '700' })]);
    });
  }
}
