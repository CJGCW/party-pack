import Phaser from 'phaser';
import { PICK_POINTS, type PickHostPlayer, type PickHostView } from '../../../shared/games/pickEm';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, WIDTH, addBackdrop, hex, text } from '../theme';

const COLS = 3;
const TILE_W = 560;
const TILE_H = 100;
const GAP_X = 24;
const GAP_Y = 16;
const TILES_TOP = 450;

interface Tile {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
}

/** The TV during Pick 'Em: the question and its long list; at the reveal, the right ones light up. */
export class PickEmScene extends Phaser.Scene {
  static readonly KEY = 'pick-em';

  private view: PickHostView | null = null;
  private phaseKey = '';
  private phaseEndsAt = 0;
  private headerText!: Phaser.GameObjects.Text;
  private topicText!: Phaser.GameObjects.Text;
  private questionText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private tiles: Tile[] = [];
  private playersRow!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(PickEmScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    this.tiles = [];
    addBackdrop(this);

    text(this, 170, 60, "PICK 'EM", 56, COLORS.accent, { fontStyle: '700' });
    this.headerText = text(this, WIDTH / 2, 60, '', 42);
    this.timerText = text(this, WIDTH - 150, 60, '', 64, COLORS.text, { fontStyle: '700' });
    this.topicText = text(this, WIDTH / 2, 160, '', 40, COLORS.accent, { fontStyle: '700' }).setLetterSpacing(4);
    this.questionText = text(this, WIDTH / 2, 290, '', 62, COLORS.text, { fontStyle: '700', align: 'center', wordWrap: { width: 1600 } });
    this.hintText = text(this, WIDTH / 2, 395, `PICK ALL THAT APPLY  ·  +${PICK_POINTS} RIGHT  ·  −${PICK_POINTS} WRONG`, 30, COLORS.accent, {
      fontStyle: '700',
    }).setLetterSpacing(2);

    const totalW = COLS * TILE_W + (COLS - 1) * GAP_X;
    for (let i = 0; i < 12; i++) {
      const x = WIDTH / 2 - totalW / 2 + (i % COLS) * (TILE_W + GAP_X) + TILE_W / 2;
      const y = TILES_TOP + Math.floor(i / COLS) * (TILE_H + GAP_Y) + TILE_H / 2;
      const container = this.add.container(x, y).setAlpha(0);
      const bg = this.add.graphics();
      const label = text(this, -20, 0, '', 34, COLORS.text, { fontStyle: '700', align: 'center', wordWrap: { width: TILE_W - 120 } });
      const count = text(this, TILE_W / 2 - 40, 0, '', 34, COLORS.text, { fontStyle: '700' });
      container.add([bg, label, count]);
      this.tiles.push({ container, bg, label, count });
    }

    this.playersRow = this.add.container(WIDTH / 2, 1010);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: PickHostView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as PickHostView);
  }

  update() {
    if (this.view?.phase !== 'answering') {
      this.timerText.setText('');
      return;
    }
    const secs = Math.max(0, Math.ceil((this.phaseEndsAt - performance.now()) / 1000));
    this.timerText.setText(String(secs)).setColor(secs <= 5 ? COLORS.danger : COLORS.text);
  }

  private drawTile(i: number, state: 'normal' | 'right' | 'wrong') {
    const { bg } = this.tiles[i];
    bg.clear();
    bg.fillStyle(state === 'right' ? COLORS.correct : state === 'wrong' ? COLORS.panel : COLORS.panelLight, state === 'wrong' ? 0.6 : 1);
    bg.fillRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 20);
    if (state !== 'wrong') {
      bg.lineStyle(state === 'right' ? 6 : 3, state === 'right' ? 0xffffff : 0x5f57a0, 1);
      bg.strokeRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 20);
    }
  }

  private applyView(view: PickHostView) {
    this.view = view;
    this.phaseEndsAt = performance.now() + view.msLeft;
    this.headerText.setText(`List ${view.questionNumber} of ${view.totalQuestions}  ·  ${view.packName}`);
    this.topicText.setText(view.topic.toUpperCase());
    this.questionText.setText(view.question);
    this.hintText.setVisible(view.phase !== 'gameEnd');
    this.renderPlayers(view.players, view.phase);

    const key = `${view.questionNumber}|${view.phase}`;
    if (key === this.phaseKey) return;
    this.phaseKey = key;
    this.overlay.removeAll(true);

    if (view.phase === 'question') {
      for (const t of this.tiles) t.container.setAlpha(0);
      this.questionText.setScale(0.85).setAlpha(0);
      this.tweens.add({ targets: this.questionText, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    } else if (view.phase === 'answering') {
      this.tiles.forEach((tile, i) => {
        const option = view.options[i];
        if (option === undefined) {
          tile.container.setAlpha(0);
          return;
        }
        this.drawTile(i, 'normal');
        tile.label.setText(option).setAlpha(1);
        tile.count.setText('');
        tile.container.setScale(0.7).setAlpha(0);
        this.tweens.add({ targets: tile.container, scale: 1, alpha: 1, duration: 260, delay: i * 45, ease: 'Back.easeOut' });
      });
    } else if (view.phase === 'reveal') {
      view.options.forEach((_, i) => {
        const tile = this.tiles[i];
        const right = view.correctIndices?.includes(i) ?? false;
        tile.container.setAlpha(1).setScale(1);
        this.drawTile(i, right ? 'right' : 'wrong');
        tile.label.setAlpha(right ? 1 : 0.5);
        const n = view.counts?.[i] ?? 0;
        tile.count.setText(n > 0 ? `${n}` : '');
        if (right) this.tweens.add({ targets: tile.container, scale: 1.05, duration: 180, yoyo: true, delay: i * 30 });
      });
    } else if (view.phase === 'gameEnd') {
      showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
    }
  }

  /** Players along the bottom: a tick once they've locked in, then their haul at the reveal. */
  private renderPlayers(players: PickHostPlayer[], phase: PickHostView['phase']) {
    this.playersRow.removeAll(true);
    const w = 210;
    const gap = 16;
    const startX = -((players.length - 1) * (w + gap)) / 2;
    players.forEach((p, i) => {
      const x = startX + i * (w + gap);
      const g = this.add.graphics();
      g.fillStyle(hex(p.color), 1);
      g.fillRoundedRect(x - w / 2, -45, w, 90, 18);
      const name = text(this, x, -14, p.name, 28, '#140f2e', { fontStyle: '700' });
      let status = p.score.toLocaleString();
      if (phase === 'answering') status = p.answered ? '✓ locked in' : 'picking…';
      else if (phase === 'reveal') status = p.answered ? `${p.right}✓ ${p.wrong}✗  +${p.points}` : 'no picks';
      const sub = text(this, x, 20, status, 24, '#140f2e', { fontStyle: '700' });
      this.playersRow.add([g, name, sub]);
    });
  }
}
