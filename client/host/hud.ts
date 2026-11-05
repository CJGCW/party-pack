import Phaser from 'phaser';
import { burst, shockwave } from './fx';
import { COLORS, HEIGHT, WIDTH, hex, text } from './theme';

/** The bar across the top of the screen. */
export const HUD_H = 118;
const TIMER = { x: WIDTH - 140, y: 66, w: 170, h: 88 };

/**
 * The top of a game's screen, for the boards, arena and volleys scenes: its title, the round, the
 * clock (which pulses as time runs out) and the big countdown, ending in GO!
 */
export class GameHud {
  private titleText: Phaser.GameObjects.Text;
  private header: Phaser.GameObjects.Text;
  private timer: Phaser.GameObjects.Text;
  private timerBox: Phaser.GameObjects.Graphics;
  private count: Phaser.GameObjects.Text;
  private shownSecs: number | null = null;
  private shownCount: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    title: string,
    private readonly countX = WIDTH / 2,
  ) {
    const bar = scene.add.graphics();
    bar.fillGradientStyle(0x0a0720, 0x0a0720, 0x0a0720, 0x0a0720, 0.75, 0.75, 0, 0);
    bar.fillRect(0, 0, WIDTH, HUD_H);
    bar.fillGradientStyle(hex(COLORS.accent), 0xff5d73, hex(COLORS.accent), 0xff5d73, 0, 0.5, 0, 0.5);
    bar.fillRect(0, HUD_H - 3, WIDTH / 2, 3);
    bar.fillGradientStyle(0xff5d73, hex(COLORS.accent), 0xff5d73, hex(COLORS.accent), 0.5, 0, 0.5, 0);
    bar.fillRect(WIDTH / 2, HUD_H - 3, WIDTH / 2, 3);
    this.titleText = text(scene, 60, 62, title, 54, COLORS.accent, { fontStyle: '700' }).setOrigin(0, 0.5);
    this.header = text(scene, WIDTH / 2, 62, '', 40);
    this.timerBox = scene.add.graphics({ x: TIMER.x, y: TIMER.y }).setVisible(false);
    this.timerBox.fillStyle(0x0a0720, 0.7).fillRoundedRect(-TIMER.w / 2, -TIMER.h / 2, TIMER.w, TIMER.h, TIMER.h / 2);
    this.timerBox.lineStyle(3, 0xffffff, 0.18).strokeRoundedRect(-TIMER.w / 2, -TIMER.h / 2, TIMER.w, TIMER.h, TIMER.h / 2);
    this.timer = text(scene, TIMER.x, TIMER.y, '', 62, COLORS.text, { fontStyle: '700' });
    this.count = text(scene, countX, HEIGHT / 2, '', 280, COLORS.accent, { fontStyle: '700', stroke: '#140f2e', strokeThickness: 18 }).setDepth(40);
  }

  setHeader(value: string) {
    this.header.setText(value);
  }

  setTitle(value: string) {
    this.titleText.setText(value);
  }

  /** The clock: seconds left, or null to hide it. Goes red and pulses from `lowAt` down. */
  clock(secs: number | null, lowAt = 10, format: (secs: number) => string = String) {
    if (secs === this.shownSecs) return;
    this.shownSecs = secs;
    this.timerBox.setVisible(secs !== null);
    this.timer.setText(secs === null ? '' : format(secs));
    const low = secs !== null && secs <= lowAt;
    this.timer.setColor(low ? COLORS.danger : COLORS.text);
    if (low && secs > 0) {
      this.scene.tweens.killTweensOf(this.timer);
      this.timer.setScale(1.3);
      this.scene.tweens.add({ targets: this.timer, scale: 1, duration: 320, ease: 'Cubic.easeOut' });
    }
  }

  /** The big countdown: the number to show, or null once it's over (which shows GO!). */
  countdown(secs: number | null) {
    if (secs === this.shownCount) return;
    const counted = this.shownCount !== null;
    this.shownCount = secs;
    const { scene, count } = this;
    scene.tweens.killTweensOf(count);
    if (secs === null) {
      if (!counted) return count.setText('');
      count.setText('GO!').setColor('#6ee7b7').setAlpha(1).setScale(0.6);
      scene.tweens.add({ targets: count, scale: 1.25, alpha: 0, duration: 650, ease: 'Cubic.easeOut' });
      burst(scene, this.countX, HEIGHT / 2, 0x6ee7b7, 50);
      shockwave(scene, this.countX, HEIGHT / 2, 0x6ee7b7, 340);
      return;
    }
    count.setText(String(secs)).setColor(COLORS.accent).setAlpha(1).setScale(1.5);
    scene.tweens.add({ targets: count, scale: 1, duration: 420, ease: 'Back.easeOut' });
    shockwave(scene, this.countX, HEIGHT / 2, hex(COLORS.accent), 240);
  }
}
