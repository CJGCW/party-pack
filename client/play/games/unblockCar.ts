import { EXIT_ROW, SIZE, cellsOf, vehiclesIn, type UnblockInput, type UnblockPlayerView, type Vehicle } from '../../../shared/games/unblockCar';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

const VEHICLE_COLORS = ['#5ec8f2', '#ffd166', '#4cd37a', '#b48cff', '#ff9f43', '#7fe0d0', '#f472d0', '#c9b7ff'];
const colorOf = (id: string) => (id === 'A' ? '#ff5d73' : VEHICLE_COLORS[(id.charCodeAt(0) - 66) % VEHICLE_COLORS.length]);

/**
 * Your lot: drag a car or truck along its length to slide it (as far as the way's clear). Get
 * the red car out the exit on the right. The server checks each slide.
 */
export function createUnblockCar(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: UnblockPlayerView | null = null;
  let phaseEndsAt = 0;
  let cell = 0;
  /** The vehicle being dragged: how far it can go each way (in its own axis, top-left positions), and where it is now (fractional). */
  let drag: { v: Vehicle; min: number; max: number; startPx: number; from: number; at: number } | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const progressEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board' }, canvas);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), progressEl, boardEl, infoEl));
  const ctx = canvas.getContext('2d')!;
  /** The board's drawn with a border this many cells wide, for the exit to show. */
  const BORDER = 0.3;

  /** How far a vehicle could slide each way (its top-left's lowest and highest position). */
  function range(lot: string, v: Vehicle) {
    const occupied = (k: number) => {
      const c = v.across ? v.row * SIZE + k : k * SIZE + v.col;
      return lot[c] !== '.' && lot[c] !== v.id;
    };
    const from = v.across ? v.col : v.row;
    let min = from;
    while (min > 0 && !occupied(min - 1)) min--;
    let max = from;
    while (max + v.length < SIZE && !occupied(max + v.length)) max++;
    return { min, max };
  }

  const toCell = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { col: Math.floor((e.clientX - r.left) / cell - BORDER), row: Math.floor((e.clientY - r.top) / cell - BORDER) };
  };

  canvas.addEventListener('pointerdown', (e) => {
    const s = view?.state;
    if (!view || !s || view.phase !== 'play' || !isPlaying(view)) return;
    const { row, col } = toCell(e);
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return;
    const v = vehiclesIn(s.lot).find((o) => cellsOf(o).includes(row * SIZE + col));
    if (!v) return;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Fine without.
    }
    const { min, max } = range(s.lot, v);
    const from = v.across ? v.col : v.row;
    drag = { v, min, max, startPx: v.across ? e.clientX : e.clientY, from, at: from };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const moved = ((drag.v.across ? e.clientX : e.clientY) - drag.startPx) / cell;
    drag.at = Math.max(drag.min, Math.min(drag.max, drag.from + moved));
    draw();
  });
  const release = () => {
    if (!drag || !view?.state) return;
    const to = Math.round(drag.at);
    if (to !== drag.from) {
      navigator.vibrate?.(10);
      send({ type: 'slide', id: drag.v.id, to, number: view.state.number } satisfies UnblockInput);
      // Keep it where it was dropped until the server says.
      drag = { ...drag, at: to, from: to };
    } else drag = null;
    draw();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  function draw() {
    const s = view?.state;
    if (!s) return;
    const box = boardEl.getBoundingClientRect();
    cell = Math.floor(Math.min(box.width, box.height) / (SIZE + BORDER * 2));
    const size = cell * (SIZE + BORDER * 2);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#6b5a8a';
    ctx.fillRect(0, 0, size, size);
    const o = cell * BORDER;
    ctx.fillStyle = '#3d3a4f';
    ctx.fillRect(o, o, cell * SIZE, cell * SIZE);
    // The exit.
    ctx.fillRect(o + cell * SIZE, o + EXIT_ROW * cell + 4, o, cell - 8);
    ctx.fillStyle = '#4cd37a';
    ctx.beginPath();
    ctx.moveTo(o + cell * SIZE + 2, o + EXIT_ROW * cell + cell * 0.35);
    ctx.lineTo(o + cell * SIZE + o - 2, o + EXIT_ROW * cell + cell / 2);
    ctx.lineTo(o + cell * SIZE + 2, o + EXIT_ROW * cell + cell * 0.65);
    ctx.fill();
    for (const v of vehiclesIn(s.lot)) {
      const pos = drag && drag.v.id === v.id ? drag.at : v.across ? v.col : v.row;
      const x = o + (v.across ? pos : v.col) * cell + 4;
      const y = o + (v.across ? v.row : pos) * cell + 4;
      const w = (v.across ? v.length : 1) * cell - 8;
      const hh = (v.across ? 1 : v.length) * cell - 8;
      ctx.fillStyle = '#140f2e';
      ctx.beginPath();
      ctx.roundRect(x - 2, y - 2, w + 4, hh + 4, 12);
      ctx.fill();
      ctx.fillStyle = colorOf(v.id);
      ctx.beginPath();
      ctx.roundRect(x, y, w, hh, 10);
      ctx.fill();
      ctx.fillStyle = 'rgba(223,246,255,0.85)';
      if (v.across) ctx.fillRect(x + w - cell * 0.32, y + cell * 0.14, cell * 0.14, hh - cell * 0.28);
      else ctx.fillRect(x + cell * 0.14, y + cell * 0.14, w - cell * 0.28, cell * 0.14);
    }
  }

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    boardEl.hidden = !v.state || !playing;
    infoEl.hidden = playing;
    const s = v.state;
    progressEl.textContent = s && playing ? `Lot ${s.number} of ${s.total} · ${s.moves} moves (can be done in ${s.fewest}) · ${s.points} pts` : '';
    const info = boardsInfo(v, 'best', { ended: () => 'All clear!', score: (o) => `${(o.state as typeof s)?.solved ?? 0} lots, ${o.boardScore} points` });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
    draw();
  }

  function tick() {
    if (!view) return;
    const clock = boardsClock(view, phaseEndsAt);
    timerEl.textContent = clock.text;
    timerEl.classList.toggle('low', clock.low);
  }
  const interval = setInterval(tick, 200);
  const onResize = () => draw();
  window.addEventListener('resize', onResize);

  return {
    update(raw) {
      const next = raw as UnblockPlayerView;
      // The server's lot replaces anything dropped while waiting.
      if (next.state?.lot !== view?.state?.lot) drag = null;
      view = next;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
    },
  };
}
