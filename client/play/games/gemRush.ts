import { GEM_COLORS, SIZE, gemOutline, type GemInput, type GemPlayerView } from '../../../shared/games/gemRush';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/** How long each step of a move shows (the swap, each clear, each fall), and a rejected swap's wiggle. */
const STEP_MS = 150;
const WIGGLE_MS = 220;
/** A finger moving this share of a cell is a swipe. */
const SWIPE = 0.35;

/**
 * Your gems: swipe across from one to a neighbour to swap them (swiping only; a tap does nothing). The
 * server checks the move and sends back each step (clear, fall, refill), which plays through.
 */
export function createGemRush(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: GemPlayerView | null = null;
  let phaseEndsAt = 0;
  let cell = 0;
  let moveId = -1;
  /** What's on screen: the grid, and cells flashing (cleared) or swapped (wiggling). */
  let shown = '';
  let flashing: number[] = [];
  let touch: { cell: number; x: number; y: number } | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const pointsEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board pp-board' }, canvas);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd po' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), pointsEl, boardEl, infoEl, statsEl));
  const ctx = canvas.getContext('2d')!;

  const cellAt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / cell);
    const row = Math.floor((e.clientY - r.top) / cell);
    return col < 0 || col >= SIZE || row < 0 || row >= SIZE ? -1 : row * SIZE + col;
  };
  const canPlay = () => !!view?.state && view.phase === 'play' && isPlaying(view);

  function trySwap(a: number, b: number) {
    touch = null;
    navigator.vibrate?.(8);
    send({ type: 'swap', a, b } satisfies GemInput);
    draw();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!canPlay()) return;
    e.preventDefault();
    const c = cellAt(e);
    if (c < 0) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Fine without: a touch stays with the canvas anyway.
    }
    touch = { cell: c, x: e.clientX, y: e.clientY };
    draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touch) return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * SWIPE) return;
    const from = touch.cell;
    const col = from % SIZE;
    const to = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? (col < SIZE - 1 ? from + 1 : -1) : col > 0 ? from - 1 : -1) : dy > 0 ? from + SIZE : from - SIZE;
    touch = null;
    if (to >= 0 && to < SIZE * SIZE) trySwap(from, to);
    else draw();
  });
  // Lifted before it was a swipe: nothing happens.
  const endTouch = () => {
    touch = null;
    draw();
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  /** Plays a new move through: the swap, then each clear flashing and the board after it. */
  function play(v: GemPlayerView) {
    const s = v.state!;
    for (const t of timers) clearTimeout(t);
    timers = [];
    flashing = [];
    if (s.rejected) {
      // Swapped, then back.
      const [a, b] = s.rejected;
      const g = [...s.grid];
      [g[a], g[b]] = [g[b], g[a]];
      shown = g.join('');
      timers.push(setTimeout(() => ((shown = s.grid), draw()), WIGGLE_MS));
      navigator.vibrate?.([20, 40, 20]);
      return;
    }
    if (!s.steps.length) {
      shown = s.grid;
      return;
    }
    let at = 0;
    s.steps.forEach((grid, i) => {
      timers.push(setTimeout(() => ((shown = grid), (flashing = s.cleared[i] ?? []), draw()), at));
      at += STEP_MS * (s.cleared[i] ? 2 : 1);
      if (s.cleared[i]) timers.push(setTimeout(() => ((flashing = []), draw()), at - STEP_MS));
    });
    timers.push(setTimeout(() => ((shown = s.grid), (flashing = []), draw()), at));
  }

  function draw() {
    if (!shown) return;
    const box = boardEl.getBoundingClientRect();
    cell = Math.floor(Math.min(box.width, box.height) / SIZE);
    const w = cell * SIZE;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${w}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let c = 0; c < SIZE * SIZE; c++) {
      ctx.fillStyle = (Math.floor(c / SIZE) + c) % 2 ? '#241d55' : '#2a2160';
      ctx.fillRect((c % SIZE) * cell, Math.floor(c / SIZE) * cell, cell, cell);
    }
    const flash = new Set(flashing);
    for (let c = 0; c < SIZE * SIZE; c++) {
      const ch = shown[c];
      const x = (c % SIZE) * cell + cell / 2;
      const y = Math.floor(c / SIZE) * cell + cell / 2;
      if (c === touch?.cell) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
      }
      const stone = ch === 'S';
      const r = cell * 0.4 * (flash.has(c) ? 1.2 : 1);
      ctx.beginPath();
      gemOutline(stone ? 99 : Number(ch)).forEach(([px, py], i) => (i ? ctx.lineTo(x + px * r, y + py * r) : ctx.moveTo(x + px * r, y + py * r)));
      ctx.closePath();
      ctx.fillStyle = flash.has(c) ? '#ffffff' : stone ? '#7d7896' : GEM_COLORS[Number(ch)];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#140f2e';
      ctx.stroke();
      if (!stone && !flash.has(c)) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    boardEl.hidden = !s || v.phase === 'gameEnd' || (!playing && v.phase !== 'result');
    infoEl.hidden = playing;
    pointsEl.textContent = s ? `Score: ${s.score.toLocaleString()}${s.gained ? ` (+${s.gained})` : ''}` : '';
    const info = boardsInfo(v, 'best', { score: (o) => `${o.boardScore.toLocaleString()} points` });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
    statsEl.textContent = s?.battle && v.phase !== 'gameEnd' ? `${s.stonesSent} stone${s.stonesSent === 1 ? '' : 's'} sent` : '';
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
      const next = raw as GemPlayerView;
      const s = next.state;
      if (s && (s.moveId !== moveId || !shown || next.seed !== view?.seed)) {
        moveId = s.moveId;
        if (next.seed === view?.seed) play(next);
        else shown = s.grid;
      }
      view = next;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      for (const t of timers) clearTimeout(t);
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
    },
  };
}
