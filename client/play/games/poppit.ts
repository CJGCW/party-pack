import { BALLOON_COLORS, COLS, EMPTY, GIFT_POINTS, ROWS, STONE, STONE_COLOR, groupAt, groupPoints, stonesFor, type PoppitInput, type PoppitPlayerView } from '../../../shared/games/poppit';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/**
 * Your balloons: tap a bunch to see what it's worth, tap it again to pop it. The server checks
 * the pop and sends the settled board back.
 */
export function createPoppit(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: PoppitPlayerView | null = null;
  let phaseEndsAt = 0;
  /** The bunch picked, waiting for a second tap. */
  let picked: number[] = [];
  let cell = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const pointsEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board' }, canvas);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd po' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), pointsEl, boardEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  function worth(group: number[]) {
    const gifts = new Set(view?.state?.gifts ?? []);
    return groupPoints(group.length) + group.filter((c) => gifts.has(c)).length * GIFT_POINTS;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const s = view?.state;
    if (!view || !s || view.phase !== 'play' || !isPlaying(view)) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / cell);
    const row = Math.floor((e.clientY - r.top) / cell);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
    const c = row * COLS + col;
    if (picked.includes(c)) {
      navigator.vibrate?.(25);
      send({ type: 'pop', cell: c } satisfies PoppitInput);
      picked = [];
    } else {
      const group = groupAt(s.grid, c);
      picked = group.length >= 2 ? group : [];
      if (picked.length) navigator.vibrate?.(8);
    }
    render();
  });

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
    ctx.fillStyle = '#241d55';
    ctx.fillRect(0, 0, w, hgt);
    const gifts = new Set(s.gifts);
    const pickedSet = new Set(picked);
    s.grid.forEach((color, c) => {
      if (color === EMPTY) return;
      const x = (c % COLS) * cell + cell / 2;
      const y = Math.floor(c / COLS) * cell + cell / 2;
      if (color === STONE) {
        ctx.fillStyle = STONE_COLOR;
        ctx.fillRect(x - cell * 0.42, y - cell * 0.42, cell * 0.84, cell * 0.84);
        ctx.strokeStyle = '#140f2e';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - cell * 0.42, y - cell * 0.42, cell * 0.84, cell * 0.84);
        return;
      }
      const lift = pickedSet.has(c) ? -cell * 0.08 : 0;
      ctx.beginPath();
      ctx.ellipse(x, y + lift, cell * 0.4, cell * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = BALLOON_COLORS[color];
      ctx.fill();
      ctx.lineWidth = pickedSet.has(c) ? 4 : 2;
      ctx.strokeStyle = pickedSet.has(c) ? '#ffffff' : '#140f2e';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x - cell * 0.12, y - cell * 0.15 + lift, cell * 0.08, cell * 0.11, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fill();
      if (gifts.has(c)) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 2, y - cell * 0.35 + lift, 4, cell * 0.7);
        ctx.fillRect(x - cell * 0.25, y - 2 + lift, cell * 0.5, 4);
      }
    });
  }

  function render() {
    if (!view) return;
    const v = view;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    boardEl.hidden = !v.state || v.phase === 'gameEnd' || (!playing && v.phase !== 'result');
    infoEl.hidden = playing;
    const stones = v.state?.duel ? stonesFor(picked.length) : 0;
    if (picked.length) pointsEl.textContent = `Pop ${picked.length} for +${worth(picked)}${stones ? ` and ${stones} stones` : ''}. Tap again!`;
    else pointsEl.textContent = v.state ? `Score: ${v.state.score.toLocaleString()}${v.state.incoming ? ` · ${v.state.incoming} stones coming!` : ''}` : '';
    const info = boardsInfo(v, 'best', { ended: () => 'All popped!', score: (o) => `${o.boardScore.toLocaleString()} points` });
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
      const next = raw as PoppitPlayerView;
      // Once the bunch picked has changed (a new board, or after a pop), nothing's picked any more; stones arriving don't change it.
      const still = next.state ? groupAt(next.state.grid, picked[0] ?? -1) : [];
      if (still.length !== picked.length || !picked.every((c) => still.includes(c))) picked = [];
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
