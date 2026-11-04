import { CANVAS_H, CANVAS_W, INK_COLORS, INK_WIDTHS, type SketchInput, type SketchView } from '../../../shared/games/sketchIt';
import { h } from '../dom';
import type { Controller } from '../main';

/** The artist's ink goes to the server this often. */
const SEND_MS = 100;

/**
 * The artist gets the word and a canvas (with colours, sizes and Clear); everyone else gets a box
 * to type guesses in, with what they've tried.
 */
export function createSketchIt(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: SketchView | null = null;
  let phaseEndsAt = 0;
  let color = 0;
  let width = INK_WIDTHS[0];
  let strokeId = 0;
  let drawing: { id: number; pending: number[] } | null = null;
  let last: { x: number; y: number } | null = null;
  let turnKey = '';

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const wordEl = h('div', { class: 'po-points sk-word' });
  const canvas = h('canvas', { class: 'po-canvas sk-paper' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board pp-board' }, canvas);
  const swatches = INK_COLORS.map((c, i) => {
    const b = h('button', { type: 'button', class: 'sk-swatch' }) as HTMLButtonElement;
    b.style.background = c;
    b.addEventListener('click', () => {
      color = i;
      paintTools();
    });
    return b;
  });
  const sizes = INK_WIDTHS.map((w) => {
    const b = h('button', { type: 'button', class: 'secondary sk-size' }, w === INK_WIDTHS[0] ? 'thin' : w === INK_WIDTHS[1] ? 'thick' : 'fat') as HTMLButtonElement;
    b.addEventListener('click', () => {
      width = w;
      paintTools();
    });
    return b;
  });
  const clearBtn = h('button', { type: 'button', class: 'secondary' }, 'Clear') as HTMLButtonElement;
  const toolsEl = h('div', { class: 'pp-tray' }, ...swatches, ...sizes, clearBtn);
  const drawEl = h('div', { class: 'pd-aim' }, boardEl, toolsEl);
  const input = h('input', { type: 'text', class: 'sk-input', placeholder: 'Your guess', maxlength: '40', autocomplete: 'off' }) as HTMLInputElement;
  const guessBtn = h('button', { type: 'submit' }, 'Guess') as HTMLButtonElement;
  const missesEl = h('div', { class: 'pd-hint' });
  const guessForm = h('form', { class: 'sk-guess' }, input, guessBtn) as HTMLFormElement;
  const guessEl = h('div', { class: 'pd-aim' }, guessForm, missesEl);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), wordEl, drawEl, guessEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  const isArtist = () => !!view && view.artist === view.you;
  const canDraw = () => isArtist() && view?.phase === 'draw';

  function paintTools() {
    swatches.forEach((b, i) => b.classList.toggle('on', i === color));
    sizes.forEach((b, i) => b.classList.toggle('on', INK_WIDTHS[i] === width));
  }

  function sizeCanvas() {
    const box = boardEl.getBoundingClientRect();
    const scale = Math.min(box.width / CANVAS_W, box.height / CANVAS_H) || 0.3;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(CANVAS_W * scale * dpr);
    canvas.height = Math.round(CANVAS_H * scale * dpr);
    canvas.style.width = `${Math.round(CANVAS_W * scale)}px`;
    canvas.style.height = `${Math.round(CANVAS_H * scale)}px`;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.lineCap = ctx.lineJoin = 'round';
  }

  const point = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * CANVAS_W, y: ((e.clientY - r.top) / r.height) * CANVAS_H };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!canDraw()) return;
    e.preventDefault();
    const p = point(e);
    drawing = { id: ++strokeId, pending: [Math.round(p.x), Math.round(p.y)] };
    last = p;
    ctx.fillStyle = INK_COLORS[color];
    ctx.beginPath();
    ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic event (in testing) can't be captured.
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || !last) return;
    const p = point(e);
    if (Math.hypot(p.x - last.x, p.y - last.y) < 4) return;
    ctx.strokeStyle = INK_COLORS[color];
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawing.pending.push(Math.round(p.x), Math.round(p.y));
    last = p;
  });
  const lift = () => {
    flush();
    drawing = null;
    last = null;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);

  /** Sends the stroke's new points (keeping the last, so the next bit joins on). */
  function flush() {
    if (!drawing || drawing.pending.length < 2) return;
    send({ type: 'ink', id: drawing.id, color, width, points: drawing.pending } satisfies SketchInput);
    drawing.pending = drawing.pending.slice(-2);
  }
  const inkTimer = setInterval(() => drawing && drawing.pending.length > 2 && flush(), SEND_MS);

  clearBtn.addEventListener('click', () => {
    if (!canDraw()) return;
    sizeCanvas();
    send({ type: 'clear' } satisfies SketchInput);
  });
  guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || view?.phase !== 'draw') return;
    send({ type: 'guess', text } satisfies SketchInput);
    input.value = '';
  });

  function render() {
    if (!view) return;
    const v = view;
    const me = v.players.find((p) => p.id === v.you);
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles} · Turn ${v.turn}/${v.turns}`;
    scoreEl.textContent = `${me?.roundPoints ?? 0} this round`;
    const key = `${v.puzzleNumber}|${v.turn}`;
    if (key !== turnKey) {
      turnKey = key;
      if (isArtist()) requestAnimationFrame(sizeCanvas);
    }
    const artist = isArtist();
    const drawingNow = v.phase === 'draw';
    const got = me?.gotIt !== null && me?.gotIt !== undefined;
    drawEl.hidden = !(artist && drawingNow);
    guessEl.hidden = artist || !drawingNow || got;
    infoEl.hidden = (artist && drawingNow) || (!artist && drawingNow && !got);
    wordEl.textContent = drawingNow ? (artist ? `Draw: ${v.word}` : v.word) : '';
    missesEl.textContent = v.misses?.length ? `Not: ${v.misses.join(', ')}` : 'Watch the TV and type what you think it is.';
    const artistName = v.players.find((p) => p.id === v.artist)?.name ?? '';
    let title = '';
    const lines: string[] = [];
    if (drawingNow && got) title = 'You got it! Watch the others…';
    else if (v.phase === 'reveal') {
      title = `It was ${v.word}!`;
      lines.push(`+${me?.turnPoints ?? 0}`);
    } else if (v.phase === 'result') {
      title = 'Round over';
      lines.push(`+${(me?.points ?? 0).toLocaleString()} points`);
    } else if (v.phase === 'gameEnd') {
      title = 'Round scores';
      lines.push(`You got +${(me?.gamePoints ?? 0).toLocaleString()} this round. Look at the TV!`);
    }
    if (drawingNow && !artist && !got) lines.push(`${artistName} is drawing`);
    infoTitle.textContent = title;
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));
    paintTools();
  }

  function clock() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'draw' ? `${secs}s` : '';
    timerEl.classList.toggle('low', view.phase === 'draw' && secs <= 10);
  }
  const interval = setInterval(clock, 200);

  return {
    update(raw) {
      view = raw as SketchView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      clock();
    },
    destroy() {
      clearInterval(interval);
      clearInterval(inkTimer);
      root.replaceChildren();
    },
  };
}
