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

/** The soft shapes the backdrop and effects are made of, drawn once for the whole game. */
export function ensureFxTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists('fx-glow')) {
    const size = 256;
    const tex = scene.textures.createCanvas('fx-glow', size, size)!;
    const c = tex.getContext();
    const glow = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, size, size);
    tex.refresh();
  }
  if (!scene.textures.exists('fx-vignette')) {
    const [w, h] = [480, 270];
    const tex = scene.textures.createCanvas('fx-vignette', w, h)!;
    const c = tex.getContext();
    c.translate(w / 2, h / 2);
    c.scale(1, h / w);
    const shade = c.createRadialGradient(0, 0, w * 0.32, 0, 0, w * 0.72);
    shade.addColorStop(0, 'rgba(5,3,15,0)');
    shade.addColorStop(1, 'rgba(5,3,15,0.75)');
    c.fillStyle = shade;
    c.fillRect(-w, -w, w * 2, w * 2);
    tex.refresh();
  }
}

function isLight(css: string) {
  const c = Phaser.Display.Color.HexStringToColor(css);
  return 0.3 * c.red + 0.59 * c.green + 0.11 * c.blue > 110;
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
  // Bigger light text gets a soft shadow, to lift it off what's behind it. Outlined text has its
  // own edge, and dark text sits on something bright, where a shadow would only smudge it.
  const lifted: Phaser.Types.GameObjects.Text.TextStyle =
    size >= 28 && !style.stroke && isLight(color)
      ? { shadow: { offsetX: 0, offsetY: Math.round(size * 0.06), color: 'rgba(5,3,15,0.6)', blur: size * 0.1, fill: true }, padding: { x: 2, y: Math.ceil(size * 0.16) } }
      : {};
  return scene.add
    .text(x, y, content, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: '600', ...lifted, ...style })
    .setOrigin(0.5);
}

/**
 * The background every scene shares: a gradient, soft glows drifting about and a scatter of stars
 * (`blobs: false` keeps it still, for scenes full of reading), darker toward the edges. Each scene
 * fades in over it, so nothing cuts from one screen to the next.
 */
export function addBackdrop(scene: Phaser.Scene, { blobs = true } = {}) {
  ensureFxTextures(scene);
  scene.cameras.main.fadeIn(260, 15, 11, 36);
  const g = scene.add.graphics();
  g.fillGradientStyle(COLORS.bgTop, COLORS.bgTop, COLORS.bgBottom, COLORS.bgBottom, 1);
  g.fillRect(0, 0, WIDTH, HEIGHT);

  if (blobs) {
    const stars = scene.add.graphics();
    for (let i = 0; i < 70; i++) {
      stars.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.15, 0.6));
      stars.fillCircle(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(0, HEIGHT), Phaser.Math.FloatBetween(0.8, 2.2));
    }
    scene.tweens.add({ targets: stars, alpha: 0.55, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const blobColors = [0xff5d73, 0x5ec8f2, 0x8b7cf6, 0xffd166];
    for (let i = 0; i < 6; i++) {
      const size = Phaser.Math.Between(700, 1200);
      const blob = scene.add
        .image(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(0, HEIGHT), 'fx-glow')
        .setDisplaySize(size, size)
        .setTint(blobColors[i % blobColors.length])
        .setAlpha(0.13)
        .setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: blob,
        x: blob.x + Phaser.Math.Between(-220, 220),
        y: blob.y + Phaser.Math.Between(-160, 160),
        duration: Phaser.Math.Between(7000, 12000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
  scene.add.image(WIDTH / 2, HEIGHT / 2, 'fx-vignette').setDisplaySize(WIDTH, HEIGHT);
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color = COLORS.panel, alpha = 0.85) {
  const g = scene.add.graphics();
  const r = Math.min(24, h / 2, w / 2);
  // A soft shadow, the panel, light catching its top, and a fine edge.
  for (let i = 3; i >= 1; i--) g.fillStyle(0x05030f, 0.1).fillRoundedRect(x - i * 2, y - i * 2 + 6, w + i * 4, h + i * 4, r + i * 2);
  g.fillStyle(color, alpha).fillRoundedRect(x, y, w, h, r);
  g.fillStyle(0xffffff, 0.05).fillRoundedRect(x, y, w, Math.min(h, 56), { tl: r, tr: r, bl: 0, br: 0 });
  g.lineStyle(2, 0xffffff, 0.1).strokeRoundedRect(x, y, w, h, r);
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
