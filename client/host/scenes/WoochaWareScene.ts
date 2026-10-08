import Phaser from 'phaser';
import { PLAY_GRACE_MS, controlsHint, findMicrogame, type WoochaHostPlayer, type WoochaHostView } from '../../../shared/games/woochaware';
import { listen, net } from '../net';
import { showRoundScores } from '../roundScores';
import { COLORS, HEIGHT, WIDTH, addBackdrop, burstConfetti, hex, panel, text } from '../theme';

const FUSE_W = 1400;

/**
 * The TV during WoochaWare: everyone plays on their phone, so this shows the
 * command big, a burning fuse while they play, and who made it.
 */
export class WoochaWareScene extends Phaser.Scene {
  static readonly KEY = 'woochaware';

  private view: WoochaHostView | null = null;
  private phaseKey = '';
  private playEndsAt = 0;
  private headerText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private commandText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private howText!: Phaser.GameObjects.Text;
  private fuse!: Phaser.GameObjects.Graphics;
  private spark!: Phaser.GameObjects.Text;
  private playersRow!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;

  constructor() {
    super(WoochaWareScene.KEY);
  }

  create() {
    this.view = null;
    this.phaseKey = '';
    addBackdrop(this);

    text(this, 200, 60, 'WOOCHAWARE', 52, COLORS.accent, { fontStyle: '700' });
    this.headerText = text(this, WIDTH / 2, 60, '', 40);
    this.levelText = text(this, WIDTH - 170, 60, '', 44, COLORS.text, { fontStyle: '700' });
    this.commandText = text(this, WIDTH / 2, 420, '', 200, COLORS.accent, { fontStyle: '700' }).setStroke('#140f2e', 18);
    this.nameText = text(this, WIDTH / 2, 590, '', 52, COLORS.muted);
    this.statusText = text(this, WIDTH / 2, 720, '', 56, COLORS.text, { fontStyle: '700' });
    this.howText = text(this, WIDTH / 2, 670, '', 44, COLORS.accent, { fontStyle: '700' });
    this.fuse = this.add.graphics();
    this.spark = text(this, 0, 0, '🔥', 64).setVisible(false);
    this.playersRow = this.add.container(WIDTH / 2, 960);
    this.overlay = this.add.container(0, 0).setDepth(50);

    listen(this, 'gameView', (v: WoochaHostView) => this.applyView(v));
    if (net.gameView) this.applyView(net.gameView as WoochaHostView);
  }

  update() {
    this.fuse.clear();
    if (this.view?.phase !== 'play') {
      this.spark.setVisible(false);
      return;
    }
    const left = Phaser.Math.Clamp((this.playEndsAt - performance.now()) / this.view.durationMs, 0, 1);
    const x0 = WIDTH / 2 - FUSE_W / 2;
    const y = 250;
    this.fuse.fillStyle(COLORS.empty, 1);
    this.fuse.fillRoundedRect(x0, y - 12, FUSE_W, 24, 12);
    this.fuse.fillStyle(left < 0.3 ? hex(COLORS.danger) : hex(COLORS.accent), 1);
    if (left > 0) this.fuse.fillRoundedRect(x0, y - 12, Math.max(24, FUSE_W * left), 24, 12);
    this.spark.setVisible(left > 0).setPosition(x0 + FUSE_W * left, y - 10);
  }

  private applyView(view: WoochaHostView) {
    this.view = view;
    const info = findMicrogame(view.microgameId);
    this.headerText.setText(
      view.practice
        ? `PRACTICE  ·  ${info?.name ?? ''}`
        : `Microgame ${view.round + 1} of ${view.totalRounds}  ·  Stage ${view.stage} of ${view.totalStages}`,
    );
    this.levelText.setText(`SPEED ${view.level}`);
    this.renderPlayers(view.players, view.phase);

    const key = `${view.round}|${view.phase}`;
    if (key === this.phaseKey) {
      if (view.phase === 'play') this.showProgress(view);
      return;
    }
    this.phaseKey = key;
    this.overlay.removeAll(true);
    this.tweens.killTweensOf(this.commandText);

    if (view.phase === 'intro') {
      this.commandText.setText(info?.command ?? '').setPosition(WIDTH / 2, 420).setAlpha(0).setScale(0.4);
      this.tweens.add({ targets: this.commandText, alpha: 1, scale: 1, duration: 350, ease: 'Back.easeOut', delay: view.speedUp ? 700 : 0 });
      this.nameText.setText(info?.name ?? '');
      this.howText.setText(info ? controlsHint(info).toUpperCase() : '');
      this.statusText.setText('');
      if (view.speedUp) this.flashSpeedUp();
    } else if (view.phase === 'play') {
      this.playEndsAt = performance.now() + view.msLeft - PLAY_GRACE_MS;
      this.commandText.setAlpha(1).setScale(1);
      this.tweens.add({ targets: this.commandText, y: 400, duration: 200 });
      this.nameText.setText('Play on your phone!');
      this.howText.setText('');
      this.showProgress(view);
    } else if (view.phase === 'result') {
      const made = view.players.filter((p) => p.result).length;
      const total = view.players.length;
      this.nameText.setText('');
      this.statusText
        .setText(made === total ? 'EVERYONE MADE IT!' : made === 0 ? 'NOBODY MADE IT!' : `${made} of ${total} made it!`)
        .setColor(made > 0 ? COLORS.accent : COLORS.danger)
        .setScale(0.6);
      this.tweens.add({ targets: this.statusText, scale: 1, duration: 250, ease: 'Back.easeOut' });
      if (made === total && made > 0) burstConfetti(this, WIDTH / 2, 500, 50);
    } else if (view.phase === 'stageEnd') {
      this.showStageEnd(view);
    } else if (view.phase === 'gameEnd') {
      showRoundScores(this, this.overlay, view.players.map((p) => ({ name: p.name, color: p.color, points: p.gamePoints })));
    }
  }

  private showProgress(view: WoochaHostView) {
    const done = view.players.filter((p) => p.result !== null).length;
    this.statusText.setText(done > 0 ? `${done} of ${view.players.length} done` : '').setColor(COLORS.muted).setScale(1);
  }

  /** After each stage: how many each player won, and a speed-up warning. */
  private showStageEnd(view: WoochaHostView) {
    const o = this.overlay;
    o.add(this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0a0720, 0.88).setOrigin(0));
    o.add(text(this, WIDTH / 2, 160, `STAGE ${view.stage} COMPLETE`, 80, COLORS.accent, { fontStyle: '700' }));
    const sorted = [...view.players].sort((a, b) => b.stageWins - a.stageWins);
    const rowH = 74;
    const top = 290;
    o.add(panel(this, WIDTH / 2 - 520, top - 50, 1040, sorted.length * rowH + 40));
    sorted.forEach((p, i) => {
      const y = top + i * rowH;
      o.add(text(this, WIDTH / 2 - 440, y, p.name, 46, p.color, { fontStyle: '700' }).setOrigin(0, 0.5));
      const stars = '★'.repeat(p.stageWins) + '☆'.repeat(Math.max(0, view.perStage - p.stageWins));
      o.add(text(this, WIDTH / 2 + 440, y, stars, 46, COLORS.accent).setOrigin(1, 0.5));
    });
  }

  /** Before a faster microgame. */
  private flashSpeedUp() {
    const speed = text(this, WIDTH / 2, 420, 'SPEED UP!', 160, COLORS.danger, { fontStyle: '700' }).setStroke('#140f2e', 16);
    this.overlay.add(speed);
    speed.setScale(0.5);
    this.tweens.add({ targets: speed, scale: 1.1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: speed, alpha: 0, delay: 600, duration: 150 });
  }

  /** Players along the bottom: playing, ✓ or ✗. */
  private renderPlayers(players: WoochaHostPlayer[], phase: WoochaHostView['phase']) {
    this.playersRow.removeAll(true);
    const w = 210;
    const gap = 16;
    const startX = -((players.length - 1) * (w + gap)) / 2;
    players.forEach((p, i) => {
      const x = startX + i * (w + gap);
      const g = this.add.graphics();
      const showResult = (phase === 'play' || phase === 'result') && p.result !== null;
      const fill = showResult ? (p.result ? COLORS.correct : hex(COLORS.danger)) : hex(p.color);
      g.fillStyle(fill, 1);
      g.fillRoundedRect(x - w / 2, -50, w, 100, 18);
      if (showResult) {
        g.lineStyle(6, hex(p.color), 1);
        g.strokeRoundedRect(x - w / 2, -50, w, 100, 18);
      }
      const name = text(this, x, -16, p.name, 28, '#140f2e', { fontStyle: '700' });
      let status = p.score.toLocaleString();
      if (phase === 'play') status = p.result === null ? 'playing…' : p.result ? '✓' : '✗';
      else if (phase === 'result') status = p.result ? '✓' : '✗';
      const sub = text(this, x, 22, status, 30, '#140f2e', { fontStyle: '700' });
      this.playersRow.add([g, name, sub]);
    });
  }
}
