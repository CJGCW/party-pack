import { pieceSegments, waterSegments, type Segment } from '../../../shared/games/pipeDraw';
import { COLS, ROWS, type PipeInput, type PipePlayerView } from '../../../shared/games/pipeFlow';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/**
 * Your grid: tap a square to lay the next piece there (the queue's at the top). Tapping a dry
 * piece swaps it, but locks you a moment. Keep ahead of the water.
 */
export function createPipeFlow(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: PipePlayerView | null = null;
  let phaseEndsAt = 0;
  let waterAt = 0;
  let lockedUntil = 0;
  let cell = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const queueCanvas = h('canvas', { class: 'pf-queue' }) as HTMLCanvasElement;
  const statusEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board' }, canvas);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), queueCanvas, statusEl, boardEl, infoEl));
  const ctx = canvas.getContext('2d')!;
  const qctx = queueCanvas.getContext('2d')!;

  canvas.addEventListener('pointerdown', (e) => {
    if (!view?.state || view.phase !== 'play' || !isPlaying(view) || performance.now() < lockedUntil) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / cell);
    const row = Math.floor((e.clientY - r.top) / cell);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    navigator.vibrate?.(10);
    send({ type: 'lay', cell: row * COLS + col } satisfies PipeInput);
  });

  function stroke(c: CanvasRenderingContext2D, segs: Segment[], width: number, color: string) {
    c.lineWidth = width;
    c.lineCap = 'round';
    c.strokeStyle = color;
    c.beginPath();
    for (const s of segs) {
      c.moveTo(s.x1, s.y1);
      c.lineTo(s.x2, s.y2);
    }
    c.stroke();
  }

  function sized(c: HTMLCanvasElement, w: number, hh: number) {
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(hh * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${hh}px`;
    c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    const s = view?.state;
    if (!s) return;
    const box = boardEl.getBoundingClientRect();
    cell = Math.floor(Math.min(box.width / COLS, box.height / ROWS));
    sized(canvas, cell * COLS, cell * ROWS);
    ctx.fillStyle = '#241d55';
    ctx.fillRect(0, 0, cell * COLS, cell * ROWS);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let c = 0; c < COLS * ROWS; c++) ctx.strokeRect((c % COLS) * cell, Math.floor(c / COLS) * cell, cell, cell);
    const pipes = s.pieces.flatMap((piece, c) => pieceSegments(piece, (c % COLS) * cell, Math.floor(c / COLS) * cell, cell));
    stroke(ctx, pipes, cell * 0.36, '#140f2e');
    stroke(ctx, pipes, cell * 0.28, '#8b8fa8');
    stroke(ctx, waterSegments(s, COLS, cell), cell * 0.17, '#5ec8f2');
    const sx = (s.source.cell % COLS) * cell + cell / 2;
    const sy = Math.floor(s.source.cell / COLS) * cell + cell / 2;
    ctx.fillStyle = '#2a6fb5';
    ctx.beginPath();
    ctx.arc(sx, sy, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // The queue: the next piece big, the rest smaller.
    const qh = Math.min(cell * 1.2, 70);
    sized(queueCanvas, qh * 4, qh);
    qctx.clearRect(0, 0, qh * 4, qh);
    s.queue.forEach((piece, i) => {
      const size = i === 0 ? qh : qh * 0.6;
      const x = i === 0 ? 0 : qh * 1.1 + (i - 1) * qh * 0.7;
      const y = (qh - size) / 2;
      qctx.fillStyle = i === 0 ? '#3b3185' : '#241d55';
      qctx.fillRect(x, y, size, size);
      const segs = pieceSegments(piece, x, y, size);
      stroke(qctx, segs, size * 0.36, '#140f2e');
      stroke(qctx, segs, size * 0.28, i === 0 ? '#ffd166' : '#8b8fa8');
    });
  }

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    boardEl.hidden = queueCanvas.hidden = !v.state || !playing;
    infoEl.hidden = playing;
    const info = boardsInfo(v, 'best', { ended: () => 'Spilled!', score: (o) => `${o.boardScore} squares filled` });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
    draw();
    tick();
  }

  function tick() {
    if (!view) return;
    const clock = boardsClock(view, phaseEndsAt);
    timerEl.textContent = clock.text;
    timerEl.classList.toggle('low', clock.low);
    const s = view.state;
    const now = performance.now();
    const locked = Math.ceil((lockedUntil - now) / 1000);
    const water = Math.ceil((waterAt - now) / 1000);
    if (!s || !isPlaying(view)) statusEl.textContent = '';
    else if (locked > 0) statusEl.textContent = `Swapped a piece: wait ${locked}s…`;
    else if (!s.filled.length && view.phase === 'play') statusEl.textContent = `Water in ${Math.max(0, water)}s! ${s.filled.length} filled`;
    else statusEl.textContent = `${s.filled.length} filled · lay the yellow piece next`;
    statusEl.classList.toggle('bad', locked > 0);
  }
  const interval = setInterval(tick, 200);
  const onResize = () => draw();
  window.addEventListener('resize', onResize);

  return {
    update(raw) {
      view = raw as PipePlayerView;
      const now = performance.now();
      phaseEndsAt = now + view.msLeft;
      waterAt = now + (view.state?.waterMs ?? 0);
      lockedUntil = now + (view.state?.lockedMs ?? 0);
      render();
    },
    destroy() {
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
    },
  };
}
