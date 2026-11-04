// Drawing a physics puzzle (see shared/physPuzzle.ts) on a phone's canvas, in board pixels.

import { BOARD_H, BOARD_W, TOP, toBoard, type PieceView, type PuzzleLevel } from '../../shared/physPuzzle';

export const PIECE_COLORS: Record<PieceView['kind'], string> = { ball: '#ff5d73', stroke: '#2a2160', plank: '#c8934f', bouncer: '#4cd37a', fan: '#5ec8f2' };

export function drawLevel(ctx: CanvasRenderingContext2D, level: PuzzleLevel) {
  ctx.fillStyle = '#bfe9ff';
  ctx.fillRect(0, TOP, BOARD_W, BOARD_H - TOP);
  // The goal: a flag over a glowing box.
  const g = level.goal;
  const a = toBoard(g.x, g.y + g.h);
  const b = toBoard(g.x + g.w, g.y);
  ctx.fillStyle = 'rgba(255, 209, 102, 0.35)';
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  const pole = toBoard(g.x + g.w / 2, g.y);
  ctx.fillStyle = '#140f2e';
  ctx.fillRect(pole.x - 2, pole.y - 60, 4, 60);
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(pole.x + 2, pole.y - 60);
  ctx.lineTo(pole.x + 34, pole.y - 48);
  ctx.lineTo(pole.x + 2, pole.y - 36);
  ctx.fill();
  for (const outline of level.ground) {
    ctx.beginPath();
    outline.forEach(([x, y], i) => {
      const p = toBoard(x, y);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = '#4cae5c';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#2f7a3b';
    ctx.stroke();
  }
}

export function drawPieces(ctx: CanvasRenderingContext2D, pieces: PieceView[], selected: number | null = null) {
  for (const p of pieces) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.fillStyle = PIECE_COLORS[p.kind];
    if (p.kind === 'fan') {
      // A fan blows upwards: its column of air, faintly.
      ctx.fillStyle = 'rgba(94, 200, 242, 0.18)';
      ctx.fillRect(-p.r, -p.r * 7.5, p.r * 2, p.r * 7.5);
      ctx.fillStyle = PIECE_COLORS.fan;
    }
    if (p.r && p.kind !== 'fan') {
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#140f2e';
      ctx.stroke();
    }
    for (const poly of p.polys) {
      ctx.beginPath();
      for (let i = 0; i < poly.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, poly[i], poly[i + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = p.id === selected ? 4 : 1.5;
      ctx.strokeStyle = p.id === selected ? '#ffffff' : '#140f2e';
      ctx.stroke();
    }
    ctx.restore();
  }
}
