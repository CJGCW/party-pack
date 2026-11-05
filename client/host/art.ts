import Phaser from 'phaser';

// The house style, so every game looks like the same game: bright chunky pieces with a dark ink
// outline, lit from above (a highlight on top, a darker lip underneath), on dark purple floors
// that let players' colours stand out. Draw solid things with `block` and `ball`, and they'll
// match. All of it works in whatever units the Graphics is in.

type G = Phaser.GameObjects.Graphics;

export const INK = 0x140f2e;
/** Floors: a checker of these two, then the grid lines. */
export const FLOOR_A = 0x2a2360;
export const FLOOR_B = 0x312a6e;
export const FLOOR_DARK = 0x0f0b28;
export const STONE = 0x6d6496;
export const WOOD = 0xb9803f;
export const GOLD = 0xffd166;
export const DANGER = 0xff5d73;
export const GOOD = 0x6ee7b7;
export const SKY = 0x5ec8f2;
export const FIRE = 0xff8a3d;

/** A colour made darker (`by` below 0) or lighter (above 0), -1 to 1. */
export function shade(color: number, by: number) {
  const towards = by < 0 ? 0 : 255;
  const k = Math.abs(by);
  const mix = (c: number) => Math.round(c + (towards - c) * k);
  return (mix((color >> 16) & 255) << 16) | (mix((color >> 8) & 255) << 8) | mix(color & 255);
}

/** The shadow something casts on the floor. */
export function softShadow(g: G, x: number, y: number, w: number, h: number, alpha = 0.32) {
  g.fillStyle(0x05030f, alpha).fillEllipse(x, y, w, h);
}

/** A solid block: outline, body, lip underneath, light along the top. (x, y) is its top left. */
export function block(g: G, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
  const size = Math.min(w, h);
  const edge = Math.max(1.5, size * 0.05);
  const r = size * 0.16;
  const lip = size * 0.13;
  g.fillStyle(INK, alpha).fillRoundedRect(x, y, w, h, r);
  g.fillStyle(shade(color, -0.32), alpha).fillRoundedRect(x + edge, y + edge, w - edge * 2, h - edge * 2, r * 0.8);
  g.fillStyle(color, alpha).fillRoundedRect(x + edge, y + edge, w - edge * 2, h - edge * 2 - lip, r * 0.8);
  g.fillStyle(0xffffff, 0.32 * alpha).fillRoundedRect(x + edge * 2.4, y + edge * 2, w - edge * 4.8, size * 0.1, size * 0.05);
}

/** `block` without the curves, for things drawn by the hundred (walls). */
export function brick(g: G, x: number, y: number, w: number, h: number, color: number) {
  g.fillStyle(INK, 1).fillRect(x, y, w, h);
  g.fillStyle(shade(color, -0.32), 1).fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.fillStyle(color, 1).fillRect(x + 1.5, y + 1.5, w - 3, h - h * 0.2 - 3);
  g.fillStyle(0xffffff, 0.3).fillRect(x + 3, y + 3, w - 6, Math.max(1.5, h * 0.1));
}

/** A solid ball: outline, shaded body, a highlight up and to the left. */
export function ball(g: G, x: number, y: number, r: number, color: number, alpha = 1) {
  g.fillStyle(INK, alpha).fillCircle(x, y, r * 1.14);
  g.fillStyle(shade(color, -0.32), alpha).fillCircle(x, y, r);
  g.fillStyle(color, alpha).fillCircle(x - r * 0.08, y - r * 0.1, r * 0.86);
  g.fillStyle(0xffffff, 0.6 * alpha).fillEllipse(x - r * 0.34, y - r * 0.42, r * 0.56, r * 0.36);
}

/** A soft glow, faked in layers so it can be drawn every frame. */
export function glow(g: G, x: number, y: number, r: number, color: number, alpha = 1) {
  for (const [k, a] of [
    [1, 0.08],
    [0.72, 0.12],
    [0.46, 0.18],
  ]) {
    g.fillStyle(color, a * alpha).fillCircle(x, y, r * k);
  }
}

/** A floor of squares `cell` across, in the two floor colours. */
export function checkerFloor(g: G, x: number, y: number, cols: number, rows: number, cell: number, a = FLOOR_A, b = FLOOR_B) {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      g.fillStyle((col + row) % 2 ? a : b, 1).fillRect(x + col * cell, y + row * cell, cell, cell);
    }
  }
}

export const GRASS = 0x2f7d4f;
export const GRASS_DARK = 0x276b43;
export const SEA = 0x1f4f8f;

/** An outdoor sky: the house dusk, from top to bottom of `h`. */
export function duskSky(g: G, x: number, y: number, w: number, h: number) {
  g.fillGradientStyle(0x2a2360, 0x2a2360, 0x6a56b8, 0x6a56b8, 1).fillRect(x, y, w, h);
}

/** A player's card, centred on (x, y): a chunky panel with their colour along the top. */
export function playerCard(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill: number, color: number) {
  const g = scene.add.graphics();
  block(g, x - w / 2, y - h / 2, w, h, fill);
  g.fillStyle(color, 1).fillRoundedRect(x - w / 2 + 8, y - h / 2 + 5, w - 16, 6, 3);
  return g;
}

/** A dark floor with grid lines, a brighter one every `major`. */
export function gridFloor(g: G, w: number, h: number, cell: number, major: number, color = SKY) {
  g.fillGradientStyle(0x161045, 0x161045, FLOOR_DARK, FLOOR_DARK, 1);
  g.fillRect(0, 0, w, h);
  const lines = (step: number, alpha: number, width: number) => {
    g.lineStyle(width, color, alpha);
    for (let x = 0; x <= w; x += step) g.lineBetween(x, 0, x, h);
    for (let y = 0; y <= h; y += step) g.lineBetween(0, y, w, y);
  };
  lines(cell, 0.05, 1);
  lines(cell * major, 0.13, 2);
}
