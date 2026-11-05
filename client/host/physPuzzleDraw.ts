// Drawing a physics puzzle (see shared/physPuzzle.ts) on the TV, in board pixels.

import Phaser from 'phaser';
import { DANGER, GOLD, GOOD, GRASS, INK, SKY, WOOD, ball, duskSky } from './art';
import { BOARD_H, BOARD_W, TOP, toBoard, type PieceView, type PuzzleLevel } from '../../shared/physPuzzle';

const COLORS: Record<PieceView['kind'], number> = { ball: DANGER, stroke: 0xe8e4ff, plank: WOOD, bouncer: GOOD, fan: SKY };

export function drawLevel(g: Phaser.GameObjects.Graphics, level: PuzzleLevel) {
  duskSky(g, 0, TOP, BOARD_W, BOARD_H - TOP);
  const goal = level.goal;
  const a = toBoard(goal.x, goal.y + goal.h);
  const b = toBoard(goal.x + goal.w, goal.y);
  g.fillStyle(GOLD, 0.3).fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  const pole = toBoard(goal.x + goal.w / 2, goal.y);
  g.fillStyle(INK, 1).fillRect(pole.x - 2, pole.y - 60, 4, 60);
  g.fillStyle(GOLD, 1).fillTriangle(pole.x + 2, pole.y - 60, pole.x + 34, pole.y - 48, pole.x + 2, pole.y - 36);
  for (const outline of level.ground) {
    const pts = outline.map(([x, y]) => {
      const p = toBoard(x, y);
      return new Phaser.Math.Vector2(p.x, p.y);
    });
    g.fillStyle(GRASS, 1).fillPoints(pts, true);
    g.lineStyle(5, INK, 1).strokePoints(pts, true);
  }
}

export function drawPieces(g: Phaser.GameObjects.Graphics, pieces: PieceView[]) {
  for (const p of pieces) {
    const c = Math.cos(p.a);
    const s = Math.sin(p.a);
    if (p.kind === 'fan') g.fillStyle(SKY, 0.18).fillRect(p.x - p.r, p.y - p.r * 7.5, p.r * 2, p.r * 7.5);
    if (p.r && p.kind !== 'fan') {
      ball(g, p.x, p.y, p.r, COLORS[p.kind]);
    }
    for (const poly of p.polys) {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < poly.length; i += 2) pts.push(new Phaser.Math.Vector2(p.x + poly[i] * c - poly[i + 1] * s, p.y + poly[i] * s + poly[i + 1] * c));
      g.fillStyle(COLORS[p.kind], 1).fillPoints(pts, true);
      g.lineStyle(2, INK, 1).strokePoints(pts, true);
    }
  }
}
