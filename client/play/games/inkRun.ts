import { BOARD_W, PX } from '../../../shared/physPuzzle';
import { INK, INK_LEVELS, MAX_POINTS, type InkInput, type InkState } from '../../../shared/games/inkRun';
import type { Controller } from '../main';
import { createPuzzlePad } from '../physPuzzlePad';

/** Points closer than this (board pixels) to the last are skipped while drawing. */
const MIN_GAP = 6;

/** Drops points that don't change a line's shape much (Ramer–Douglas–Peucker), so a stroke stays small. */
function simplify(pts: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let far = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b.y - a.y) * pts[i].x - (b.x - a.x) * pts[i].y + b.x * a.y - b.y * a.x) / len;
    if (d > far) [far, at] = [d, i];
  }
  if (far <= tolerance) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(pts.slice(at), tolerance)];
}

const lengthOf = (pts: { x: number; y: number }[]) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0) / PX;

/** Draw on your level with a finger: what you draw drops into place. Run lets the ball go. */
export function createInkRun(root: HTMLElement, send: (input: unknown) => void): Controller {
  let drawing: { id: number; pts: { x: number; y: number }[] } | null = null;

  const pad = createPuzzlePad<InkState>(root, send, {
    levels: INK_LEVELS,
    buttons: [
      { label: 'Run', input: { type: 'run' } satisfies InkInput, show: (s) => !s.released },
      { label: 'Retry', input: { type: 'retry' } satisfies InkInput },
      { label: 'Clear', input: { type: 'clear' } satisfies InkInput },
    ],
    message: (s) => s.refused || `${INK_LEVELS[s.level].name} · ink ${Math.round((s.inkLeft / INK) * 100)}%`,
    overlay: (ctx, s) => {
      // The ink left, as a bar along the top, and the stroke being drawn.
      ctx.fillStyle = 'rgba(20, 15, 46, 0.25)';
      ctx.fillRect(10, 12, BOARD_W - 20, 14);
      const used = drawing ? lengthOf(drawing.pts) : 0;
      ctx.fillStyle = used > s.inkLeft ? '#ff5d73' : '#2a2160';
      ctx.fillRect(10, 12, (BOARD_W - 20) * Math.max(0, (s.inkLeft - used) / INK), 14);
      if (!drawing || drawing.pts.length < 2) return;
      ctx.beginPath();
      drawing.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = used > s.inkLeft ? '#ff5d73' : '#2a2160';
      ctx.stroke();
    },
  });

  pad.canvas.addEventListener('pointerdown', (e) => {
    if (!pad.canAct()) return;
    e.preventDefault();
    drawing = { id: e.pointerId, pts: [pad.boardPoint(e)] };
    try {
      pad.canvas.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic event (in testing) can't be captured.
    }
    pad.redraw();
  });
  pad.canvas.addEventListener('pointermove', (e) => {
    if (drawing?.id !== e.pointerId) return;
    const p = pad.boardPoint(e);
    const last = drawing.pts[drawing.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_GAP) return;
    drawing.pts.push(p);
    pad.redraw();
  });
  const finish = (e: PointerEvent) => {
    if (drawing?.id !== e.pointerId) return;
    const pts = simplify(drawing.pts, 3).slice(0, MAX_POINTS);
    drawing = null;
    pad.redraw();
    if (pts.length < 2 || lengthOf(pts) < 0.2) return;
    send({ type: 'stroke', points: pts.flatMap((p) => [Math.round(p.x), Math.round(p.y)]) } satisfies InkInput);
  };
  pad.canvas.addEventListener('pointerup', finish);
  pad.canvas.addEventListener('pointercancel', (e) => {
    if (drawing?.id === e.pointerId) drawing = null;
    pad.redraw();
  });
  return pad.controller;
}
