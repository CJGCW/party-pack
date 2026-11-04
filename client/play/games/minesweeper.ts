import { BOOM, COLS, FLAGGED, HIDDEN, ROWS, type MineInput, type MinePlayerView } from '../../../shared/games/minesweeper';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/** Holding a square this long flags it instead of uncovering it. */
const HOLD_MS = 350;
const NUMBER_COLORS = ['', '#5ec8f2', '#4cd37a', '#ff5d73', '#b48cff', '#ff9f43', '#7fe0d0', '#ffffff', '#b8b0e8'];

/** Your field: tap a square to uncover it, hold it to flag it (or tap Flag mode). The server holds the mines. */
export function createMinesweeper(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: MinePlayerView | null = null;
  let phaseEndsAt = 0;
  let lockedUntil = 0;
  let cell = 0;
  let flagMode = false;
  let press: { cell: number; timer: ReturnType<typeof setTimeout> } | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const statusEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board' }, canvas);
  const flagBtn = h('button', { class: 'secondary', type: 'button' }, '🚩 Flag mode: off') as HTMLButtonElement;
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), statusEl, boardEl, flagBtn, infoEl));
  const ctx = canvas.getContext('2d')!;

  flagBtn.addEventListener('click', () => {
    flagMode = !flagMode;
    flagBtn.textContent = `🚩 Flag mode: ${flagMode ? 'on' : 'off'}`;
  });

  const act = (type: MineInput['type'], c: number) => {
    navigator.vibrate?.(type === 'flag' ? 30 : 8);
    send({ type, cell: c } satisfies MineInput);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!view?.state || view.phase !== 'play' || !isPlaying(view) || performance.now() < lockedUntil) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / cell);
    const row = Math.floor((e.clientY - r.top) / cell);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    const c = row * COLS + col;
    const timer = setTimeout(() => {
      press = null;
      act('flag', c);
    }, HOLD_MS);
    press = { cell: c, timer };
  });
  const lift = () => {
    if (!press) return;
    clearTimeout(press.timer);
    act(flagMode ? 'flag' : 'reveal', press.cell);
    press = null;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', () => {
    if (press) clearTimeout(press.timer);
    press = null;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function draw() {
    const s = view?.state;
    if (!s) return;
    const box = boardEl.getBoundingClientRect();
    cell = Math.floor(Math.min(box.width / COLS, box.height / ROWS));
    const w = cell * COLS;
    const hgt = cell * ROWS;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hgt}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(cell * 0.6)}px Fredoka, sans-serif`;
    s.squares.forEach((sq, c) => {
      const x = (c % COLS) * cell;
      const y = Math.floor(c / COLS) * cell;
      const covered = sq === HIDDEN || sq === FLAGGED;
      ctx.fillStyle = covered ? ((c + Math.floor(c / COLS)) % 2 ? '#4a3f9a' : '#433892') : sq === BOOM ? '#5a1f3a' : '#1f1848';
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      if (sq === FLAGGED) ctx.fillText('🚩', x + cell / 2, y + cell / 2 + 1);
      else if (sq === BOOM) ctx.fillText('💣', x + cell / 2, y + cell / 2 + 1);
      else if (sq > 0) {
        ctx.fillStyle = NUMBER_COLORS[sq];
        ctx.fillText(String(sq), x + cell / 2, y + cell / 2 + 2);
      }
    });
  }

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    boardEl.hidden = !v.state || v.phase === 'gameEnd';
    flagBtn.hidden = !playing;
    infoEl.hidden = playing || v.phase === 'result';
    const info = boardsInfo(v, 'race', { ended: (o) => (o.endedAtMs !== null ? `Cleared in ${(o.endedAtMs / 1000).toFixed(1)}s!` : '') });
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
    const locked = Math.ceil((lockedUntil - performance.now()) / 1000);
    if (!s) statusEl.textContent = '';
    else if (view.phase === 'result') statusEl.textContent = `${view.endedAtMs !== null ? `Cleared in ${(view.endedAtMs / 1000).toFixed(1)}s` : `${s.uncovered} of ${s.safe} uncovered`} · +${view.points} points`;
    else if (locked > 0 && view.phase === 'play') statusEl.textContent = `💥 Boom! Wait ${locked}s…`;
    else statusEl.textContent = `${s.uncovered} of ${s.safe} uncovered · tap to dig, hold to flag`;
    statusEl.classList.toggle('bad', locked > 0);
  }
  const interval = setInterval(tick, 200);
  const onResize = () => draw();
  window.addEventListener('resize', onResize);

  return {
    update(raw) {
      const booms = view?.state?.booms ?? 0;
      view = raw as MinePlayerView;
      const now = performance.now();
      phaseEndsAt = now + view.msLeft;
      lockedUntil = now + (view.state?.lockedMs ?? 0);
      // A buzz for a new mine hit.
      if ((view.state?.booms ?? 0) > booms) navigator.vibrate?.([80, 40, 80]);
      render();
    },
    destroy() {
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
    },
  };
}
