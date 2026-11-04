import { BOOM, COLS, HIDDEN, ROWS } from '../../../shared/games/minesweeper';
import type { TurnsInput, TurnsView } from '../../../shared/games/mineTurns';
import { h } from '../dom';
import type { Controller } from '../main';

const NUMBER_COLORS = ['', '#5ec8f2', '#4cd37a', '#ff5d73', '#b48cff', '#ff9f43', '#7fe0d0', '#ffffff', '#b8b0e8'];

/** The shared field: on your turn, tap a square. You're after the mines (the TV shows the same field). */
export function createMineTurns(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: TurnsView | null = null;
  let turnEndsAt = 0;
  let cell = 0;
  let taps = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const statusEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board' }, canvas);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), statusEl, boardEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  const myTurn = () => view?.phase === 'play' && view.turn === view.you;

  canvas.addEventListener('pointerdown', (e) => {
    if (!myTurn()) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / cell);
    const row = Math.floor((e.clientY - r.top) / cell);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    navigator.vibrate?.(8);
    send({ type: 'reveal', cell: row * COLS + col } satisfies TurnsInput);
  });

  function draw() {
    const v = view;
    if (!v) return;
    const box = boardEl.getBoundingClientRect();
    cell = Math.max(10, Math.floor(Math.min(box.width / COLS, box.height / ROWS)));
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
    const owners = new Map(v.mines.map((m) => [m.cell, v.players.find((p) => p.id === m.by)?.color]));
    v.squares.forEach((sq, c) => {
      const x = (c % COLS) * cell;
      const y = Math.floor(c / COLS) * cell;
      ctx.fillStyle = sq === HIDDEN ? ((c + Math.floor(c / COLS)) % 2 ? '#4a3f9a' : '#433892') : sq === BOOM ? (owners.get(c) ?? '#5a1f3a') : '#1f1848';
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      if (sq === BOOM) ctx.fillText('💣', x + cell / 2, y + cell / 2 + 1);
      else if (sq > 0) {
        ctx.fillStyle = NUMBER_COLORS[sq];
        ctx.fillText(String(sq), x + cell / 2, y + cell / 2 + 2);
      }
      if (c === v.last) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
      }
    });
  }

  function render() {
    const v = view;
    if (!v) return;
    const mine = v.players.find((p) => p.id === v.you);
    const up = v.players.find((p) => p.id === v.turn);
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${mine?.found ?? 0} found`;
    boardEl.hidden = v.phase === 'gameEnd';
    statusEl.classList.toggle('bad', false);
    if (v.phase === 'play') statusEl.textContent = myTurn() ? `YOUR TURN! Find a mine (${v.left} left)` : `${up?.name ?? '…'}'s turn. ${v.left} mines left.`;
    else if (v.phase === 'result') statusEl.textContent = `You found ${mine?.found ?? 0}: +${(mine?.points ?? 0).toLocaleString()} points`;
    else statusEl.textContent = '';
    infoEl.hidden = v.phase !== 'gameEnd';
    infoTitle.textContent = 'Round scores';
    infoLines.replaceChildren(h('div', {}, `You got +${(mine?.gamePoints ?? 0).toLocaleString()} this round. Look at the TV!`));
    draw();
  }

  function clock() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((turnEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'play' ? `${secs}s` : '';
    timerEl.classList.toggle('low', myTurn() && secs <= 5);
  }
  const interval = setInterval(clock, 200);
  const onResize = () => draw();
  window.addEventListener('resize', onResize);

  return {
    update(raw) {
      view = raw as TurnsView;
      turnEndsAt = performance.now() + view.turnMs;
      if (view.taps !== taps) {
        taps = view.taps;
        if (view.lastHit && view.turn === view.you) navigator.vibrate?.([40, 30, 40]);
      }
      render();
      clock();
    },
    destroy() {
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
    },
  };
}
