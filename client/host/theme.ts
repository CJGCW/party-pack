import Phaser from 'phaser';

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FONT = 'Fredoka, sans-serif';

export const COLORS = {
  bgTop: 0x221a52,
  bgBottom: 0x0f0b24,
  panel: 0x2c2366,
  panelLight: 0x3b3185,
  text: '#ffffff',
  muted: '#b8b0e8',
  accent: '#ffd166',
  danger: '#ff5d73',
  correct: 0x4caf6a,
  present: 0xe0b33a,
  absent: 0x4a4570,
  empty: 0x241d55,
};

export function hex(css: string): number {
  return Phaser.Display.Color.HexStringToColor(css).color;
}

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  size: number,
  color = COLORS.text,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
) {
  return scene.add
    .text(x, y, content, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: '600', ...style })
    .setOrigin(0.5);
}

/** Gradient background with slowly drifting blobs, shared by every scene. */
export function addBackdrop(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  g.fillGradientStyle(COLORS.bgTop, COLORS.bgTop, COLORS.bgBottom, COLORS.bgBottom, 1);
  g.fillRect(0, 0, WIDTH, HEIGHT);

  const blobColors = [0xff5d73, 0x5ec8f2, 0x8b7cf6, 0xffd166];
  for (let i = 0; i < 7; i++) {
    const blob = scene.add.circle(
      Phaser.Math.Between(0, WIDTH),
      Phaser.Math.Between(0, HEIGHT),
      Phaser.Math.Between(120, 260),
      blobColors[i % blobColors.length],
      0.07,
    );
    scene.tweens.add({
      targets: blob,
      x: blob.x + Phaser.Math.Between(-200, 200),
      y: blob.y + Phaser.Math.Between(-150, 150),
      duration: Phaser.Math.Between(6000, 11000),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color = COLORS.panel, alpha = 0.85) {
  const g = scene.add.graphics();
  g.fillStyle(color, alpha);
  g.fillRoundedRect(x, y, w, h, 24);
  return g;
}

/** Short banner that pops in, then fades out. */
export function toast(scene: Phaser.Scene, message: string, color = COLORS.danger) {
  const t = text(scene, WIDTH / 2, HEIGHT - 60, message, 34, color).setDepth(100).setAlpha(0);
  scene.tweens.add({ targets: t, alpha: 1, y: HEIGHT - 80, duration: 200, hold: 2200, yoyo: true, onComplete: () => t.destroy() });
}

export function burstConfetti(scene: Phaser.Scene, x: number, y: number, count = 60) {
  if (!scene.textures.exists('confetti')) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff);
    g.fillRect(0, 0, 10, 16);
    g.generateTexture('confetti', 10, 16);
    g.destroy();
  }
  const emitter = scene.add.particles(x, y, 'confetti', {
    speed: { min: 300, max: 750 },
    angle: { min: 200, max: 340 },
    gravityY: 900,
    rotate: { start: 0, end: 720 },
    lifespan: 2400,
    quantity: count,
    tint: [0xff5d73, 0xffd166, 0x6ee7b7, 0x5ec8f2, 0x8b7cf6, 0xf472d0],
    emitting: false,
  });
  emitter.setDepth(90);
  emitter.explode(count);
  scene.time.delayedCall(2600, () => emitter.destroy());
}
