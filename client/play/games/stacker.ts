import { COLS, slidePosition, type StackInput, type StackPlayerView } from '../../../shared/games/stacker';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/** The phone shows this many rows of your tower, scrolling as it grows. */
const VISIBLE_ROWS = 10;
const FALL_MS = 700;

/**
 * Your tower, drawn on the phone so the sliding row is exactly where you see it: tap anywhere on
 * it (or press space) to drop the row. The server checks the drop against when the row started.
 */
export function createStacker(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: StackPlayerView | null = null;
  let phaseEndsAt = 0;
  /** When this phone got the view (to work out how far the row has slid since). */
  let viewAt = 0;
  /** The row a drop was sent for, so a second tap waits for the server. */
  let dropped = -1;
  let falling: { row: number; col: number; width: number; at: number }[] = [];
  let lastFell = 0;
  let color = '#ffd166';
  let frame = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const canvas = h('canvas', { class: 'sk-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'sk-board' }, canvas);
  const hintEl = h('div', { class: 'sk-hint' }, 'Tap anywhere to drop');
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd sk' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), boardEl, hintEl, infoEl, statsEl));
  const ctx = canvas.getContext('2d')!;

  /** Where the sliding row is now (its left column), or null if there isn't one. */
  function slidingCol() {
    const s = view?.state;
    if (!view || !s?.sliding || view.phase !== 'play' || view.endedAtMs !== null) return null;
    return slidePosition(s.sliding.width, s.sliding.stepMs, s.sliding.ms + (performance.now() - viewAt));
  }

  function drop() {
    const s = view?.state;
    const col = slidingCol();
    if (!s || col === null || dropped === s.rows.length) return;
    dropped = s.rows.length;
    navigator.vibrate?.(15);
    send({ type: 'drop', row: s.rows.length, col } satisfies StackInput);
  }

  boardEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    drop();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    drop();
  };
  window.addEventListener('keydown', onKey);

  function draw() {
    frame = requestAnimationFrame(draw);
    const s = view?.state;
    if (!view || !s || boardEl.hidden) return;
    const box = boardEl.getBoundingClientRect();
    const cell = Math.floor(Math.min(box.width / COLS, box.height / VISIBLE_ROWS));
    const w = cell * COLS;
    const hgt = cell * VISIBLE_ROWS;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${hgt}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#241d55';
    ctx.fillRect(0, 0, w, hgt);

    const scroll = Math.max(0, s.rows.length - (VISIBLE_ROWS - 3));
    const y = (row: number) => (VISIBLE_ROWS - 1 - (row - scroll)) * cell;
    const blocks = (col: number, width: number, top: number, fill: string, alpha = 1) => {
      ctx.globalAlpha = alpha;
      for (let c = col; c < col + width; c++) {
        ctx.fillStyle = '#140f2e';
        ctx.fillRect(c * cell + 1, top + 1, cell - 2, cell - 2);
        ctx.fillStyle = fill;
        ctx.fillRect(c * cell + 3, top + 3, cell - 6, cell - 6);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(c * cell + 6, top + 5, cell - 12, Math.max(2, cell * 0.12));
      }
      ctx.globalAlpha = 1;
    };
    s.rows.forEach(([col, width], row) => blocks(col, width, y(row), row === 0 ? '#8b7cf6' : color));
    const col = slidingCol();
    if (col !== null && s.sliding) blocks(col, s.sliding.width, y(s.rows.length), '#ffd166');
    const now = performance.now();
    falling = falling.filter((f) => now - f.at < FALL_MS);
    for (const f of falling) {
      const p = (now - f.at) / FALL_MS;
      blocks(f.col, f.width, y(f.row) + p * p * cell * 6, '#ff5d73', 1 - p);
    }
  }
  frame = requestAnimationFrame(draw);

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    boardEl.hidden = !v.state || v.phase === 'gameEnd';
    hintEl.hidden = !playing;
    hintEl.textContent = v.phase === 'ready' ? 'Get ready…' : 'Tap anywhere to drop';
    infoEl.hidden = playing;
    const info = boardsInfo(v, 'best', {
      ended: () => 'Your tower toppled!',
      score: (o) => `${o.boardScore} ${o.boardScore === 1 ? 'row' : 'rows'} high`,
    });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
    statsEl.textContent = !v.state || v.phase === 'gameEnd' ? '' : `${v.boardScore} ${v.boardScore === 1 ? 'row' : 'rows'} high · ${v.going} of ${v.playing} still stacking`;
  }

  function tick() {
    if (!view) return;
    const clock = boardsClock(view, phaseEndsAt);
    timerEl.textContent = clock.text;
    timerEl.classList.toggle('low', clock.low);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as StackPlayerView;
      viewAt = performance.now();
      phaseEndsAt = viewAt + view.msLeft;
      const fell = view.state?.fell;
      if (fell && fell.n !== lastFell) {
        lastFell = fell.n;
        falling.push({ ...fell, at: viewAt });
      }
      if (!fell) lastFell = 0;
      // Your tower in your colour, as on the TV.
      color = document.documentElement.style.getPropertyValue('--player') || '#5ec8f2';
      render();
      tick();
    },
    destroy() {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      window.removeEventListener('keydown', onKey);
      root.replaceChildren();
    },
  };
}
