import Phaser from 'phaser';
import type { ExternalView } from '../../../shared/games/external';
import { listen, net } from '../net';
import { COLORS, HEIGHT, WIDTH, addBackdrop, panel, text } from '../theme';

/** The TV while a game's played away from the app: what to play, how long it's been, and who ends it. */
export class ExternalScene extends Phaser.Scene {
  static readonly KEY = 'external';

  private view: ExternalView | null = null;
  private startedAt = 0;
  private nameText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private noteText!: Phaser.GameObjects.Text;

  constructor() {
    super(ExternalScene.KEY);
  }

  create() {
    this.view = null;
    addBackdrop(this);
    panel(this, WIDTH / 2 - 760, HEIGHT / 2 - 300, 1520, 600);
    text(this, WIDTH / 2, HEIGHT / 2 - 210, 'TIME TO PLAY', 44, COLORS.muted, { fontStyle: '700' }).setLetterSpacing(6);
    this.nameText = text(this, WIDTH / 2, HEIGHT / 2 - 50, '', 130, COLORS.accent, {
      fontStyle: '700',
      align: 'center',
      wordWrap: { width: 1400 },
      stroke: '#140f2e',
      strokeThickness: 10,
    }).setTint(0xfff1a8, 0xfff1a8, 0xff9f1c, 0xff9f1c);
    this.tweens.add({ targets: this.nameText, scale: 1.04, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.clockText = text(this, WIDTH / 2, HEIGHT / 2 + 120, '', 64, COLORS.text, { fontStyle: '700' });
    this.noteText = text(this, WIDTH / 2, HEIGHT / 2 + 220, '', 34, COLORS.muted, { align: 'center', wordWrap: { width: 1400 } });

    listen(this, 'gameView', (v: ExternalView) => this.applyView(v));
    if (net.gameView) {
      try {
        this.applyView(net.gameView as ExternalView);
      } catch (err) {
        console.error(`[${this.scene.key}] couldn't show the current view:`, err);
      }
    }
  }

  private applyView(view: ExternalView) {
    this.view = view;
    this.startedAt = performance.now() - view.elapsedMs;
    this.nameText.setText(view.name);
    // A long name shrinks to fit.
    for (let size = 130; this.nameText.height > 300 && size > 50; size -= 10) this.nameText.setFontSize(size);
    this.noteText.setText(`Play it away from the app. When you're done, ${view.vipName || 'the VIP'} marks it finished on their phone.`);
  }

  update() {
    if (!this.view) return;
    const secs = Math.floor((performance.now() - this.startedAt) / 1000);
    this.clockText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
  }
}
