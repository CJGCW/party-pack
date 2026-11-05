import Phaser from 'phaser';
import { COLORS, ensureFxTextures, text } from './theme';

// The TV's effects, for any scene: bursts of sparks, shockwave rings, pop-up text and impacts.
// Everything's in screen pixels, so a board or world converts its own units first. Glows are
// additive, so they brighten what's under them rather than cover it.

const sparks = new WeakMap<Phaser.Scene, Phaser.GameObjects.Particles.ParticleEmitter>();

/** The scene's one spark emitter: shared, so a busy scene doesn't pile up emitters. */
function sparkEmitter(scene: Phaser.Scene) {
  let emitter = sparks.get(scene);
  // A restarted scene has destroyed the old one.
  if (!emitter?.scene) {
    ensureFxTextures(scene);
    emitter = scene.add
      .particles(0, 0, 'fx-glow', {
        speed: { min: 80, max: 460 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.16, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 260, max: 620 },
        gravityY: 260,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(60);
    sparks.set(scene, emitter);
  }
  return emitter;
}

/** A burst of sparks. */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, count = 24) {
  sparkEmitter(scene).setParticleTint(color).explode(count, x, y);
}

/** A shockwave: a ring that spreads and fades. */
export function shockwave(scene: Phaser.Scene, x: number, y: number, color: number, radius = 160) {
  const ring = scene.add.circle(x, y, radius).setStrokeStyle(10, color, 0.9).setDepth(60).setScale(0.15).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
}

/** Words that pop up, rise and fade (points, "OUT!"…). */
export function popText(scene: Phaser.Scene, x: number, y: number, message: string, color: string = COLORS.accent, size = 44) {
  const t = text(scene, x, y, message, size, color, { fontStyle: '700', stroke: '#140f2e', strokeThickness: size * 0.14 }).setDepth(61).setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: y - size * 1.6, alpha: 0, delay: 500, duration: 500, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
}

/** A big moment: a shake of the screen, and a flash of `color` if it's big enough to want one. */
export function impact(scene: Phaser.Scene, strength = 0.004, color?: number) {
  const cam = scene.cameras.main;
  cam.shake(180, strength);
  if (color !== undefined) cam.flash(160, (color >> 16) & 255, (color >> 8) & 255, color & 255);
}

/** A soft shadow and a glow of the player's colour behind a rounded box (a board or a world). */
export function boxGlow(scene: Phaser.Scene, x: number, y: number, w: number, h: number, corner: number, color: number) {
  const g = scene.add.graphics();
  for (let i = 4; i >= 1; i--) g.fillStyle(0x05030f, 0.1).fillRoundedRect(x - i * 3, y - i * 3 + 7, w + i * 6, h + i * 6, corner + i * 3);
  for (let i = 3; i >= 1; i--) g.lineStyle(i * 3, color, 0.09).strokeRoundedRect(x - 1, y - 1, w + 2, h + 2, corner);
  return g;
}

/** The card a board's result sits on. */
export function resultCard(scene: Phaser.Scene, w: number, h: number, stroke: number, glow: boolean) {
  const g = scene.add.graphics();
  const corner = h * 0.14;
  if (glow) for (let i = 3; i >= 1; i--) g.lineStyle(h * 0.035 * i, stroke, 0.12).strokeRoundedRect(-w / 2, -h / 2, w, h, corner);
  g.fillStyle(0x0a0720, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, corner);
  g.fillStyle(0xffffff, 0.06).fillRoundedRect(-w / 2, -h / 2, w, h * 0.42, { tl: corner, tr: corner, bl: 0, br: 0 });
  g.lineStyle(h * 0.02, stroke, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, corner);
  return g;
}
