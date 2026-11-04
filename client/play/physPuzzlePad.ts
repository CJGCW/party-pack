// The phone for a physics puzzle (see shared/physPuzzle.ts): the player's copy of the level on a
// canvas, playing back each change the server sends, the round's clock and info, and buttons. Each
// game adds what touching the board does (drawing, placing parts).

import type { BoardsPlayerView } from '../../shared/boards';
import { BOARD_H, BOARD_W, piecesAt, type PuzzleLevel, type PuzzleState } from '../../shared/physPuzzle';
import { boardsClock, boardsInfo, isPlaying } from './boards';
import { h } from './dom';
import type { Controller } from './main';
import { drawLevel, drawPieces } from './physPuzzleDraw';

export interface PuzzlePad<S extends PuzzleState> {
  controller: Controller;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Board pixels from a pointer event. */
  boardPoint(e: PointerEvent): { x: number; y: number };
  /** True when the player can act (playing, nothing playing back). */
  canAct(): boolean;
  state(): S | null;
  redraw(): void;
  setMessage(text: string): void;
}

export interface PuzzlePadOptions<S extends PuzzleState> {
  levels: PuzzleLevel[];
  /** Buttons under the board. */
  buttons: { label: string; input: unknown; show?: (s: S) => boolean }[];
  /** The line above the board while playing. */
  message: (s: S) => string;
  /** Anything more to draw over the board (in board pixels). */
  overlay?: (ctx: CanvasRenderingContext2D, s: S) => void;
  /** Called with each new view. */
  onUpdate?: (s: S) => void;
}

export function createPuzzlePad<S extends PuzzleState>(root: HTMLElement, send: (input: unknown) => void, options: PuzzlePadOptions<S>): PuzzlePad<S> {
  let view: BoardsPlayerView<S> | null = null;
  let phaseEndsAt = 0;
  let moveId = -1;
  let playingFrom: number | null = null;
  let dirty = true;
  let size = '';
  let scale = 1;
  let frame = 0;
  let message = '';

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const msgEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas pp-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board pp-board' }, canvas);
  const buttons = options.buttons.map((b) => {
    const btn = h('button', { type: 'button' }, b.label) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      if (!pad.canAct()) return;
      navigator.vibrate?.(15);
      send(b.input);
    });
    return btn;
  });
  const buttonsEl = h('div', { class: 'pd-buttons pp-buttons' }, ...buttons);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd po' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), msgEl, boardEl, buttonsEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  function draw() {
    const s = view?.state;
    if (!s) return;
    const box = boardEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const key = `${box.width}x${box.height}x${dpr}`;
    if (key !== size) {
      size = key;
      scale = Math.min(box.width / BOARD_W, box.height / BOARD_H);
      canvas.width = Math.round(BOARD_W * scale * dpr);
      canvas.height = Math.round(BOARD_H * scale * dpr);
      canvas.style.width = `${Math.round(BOARD_W * scale)}px`;
      canvas.style.height = `${Math.round(BOARD_H * scale)}px`;
    }
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);
    drawLevel(ctx, options.levels[s.level]);
    const seconds = playingFrom === null ? null : (performance.now() - playingFrom) / 1000;
    drawPieces(ctx, piecesAt(s, seconds));
    if (seconds !== null && s.shot && seconds * s.shot.fps >= s.shot.frames) {
      playingFrom = null;
      render();
    }
    if (playingFrom === null) options.overlay?.(ctx, s);
  }

  function loop() {
    if (dirty || playingFrom !== null) {
      dirty = false;
      draw();
    }
    frame = requestAnimationFrame(loop);
  }

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    boardEl.hidden = !s || v.phase === 'gameEnd' || (!playing && v.phase !== 'result');
    buttonsEl.hidden = !playing || v.phase !== 'play';
    infoEl.hidden = playing;
    if (s) options.buttons.forEach((b, i) => (buttons[i].hidden = !!b.show && !b.show(s)));
    buttons.forEach((b) => (b.disabled = playingFrom !== null));
    msgEl.textContent = message || (s ? options.message(s) : '');
    const info = boardsInfo(v, 'race', { ended: () => 'You reached the flag!' });
    infoTitle.textContent = info.title;
    infoLines.replaceChildren(...info.lines.map((l) => h('div', {}, l)));
    dirty = true;
  }

  function tick() {
    if (!view) return;
    const clock = boardsClock(view, phaseEndsAt);
    timerEl.textContent = clock.text;
    timerEl.classList.toggle('low', clock.low);
  }
  const interval = setInterval(tick, 200);
  loop();

  const pad: PuzzlePad<S> = {
    canvas,
    ctx,
    boardPoint(e) {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    },
    canAct: () => !!view && view.phase === 'play' && isPlaying(view) && playingFrom === null,
    state: () => view?.state ?? null,
    redraw: () => (dirty = true),
    setMessage(text) {
      message = text;
      render();
    },
    controller: {
      update(raw) {
        const next = raw as BoardsPlayerView<S>;
        if (next.state && next.state.moveId !== moveId) {
          // A new change to play (not on a new round's level).
          playingFrom = next.state.moveId > 0 && next.seed === view?.seed && next.state.shot ? performance.now() : null;
          moveId = next.state.moveId;
        }
        view = next;
        message = '';
        phaseEndsAt = performance.now() + view.msLeft;
        if (next.state) options.onUpdate?.(next.state);
        render();
        tick();
      },
      destroy() {
        cancelAnimationFrame(frame);
        clearInterval(interval);
        root.replaceChildren();
      },
    },
  };
  return pad;
}
