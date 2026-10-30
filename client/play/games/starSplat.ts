import {
  LEVELS,
  PAINTS,
  PAINT_NAMES,
  SHAPES,
  TOTAL_STARS,
  shapePoints,
  starPoints,
  wallSize,
  type Ball,
  type SplatInput,
  type SplatPlayerView,
} from '../../../shared/games/starSplat';
import { h } from '../dom';
import type { Controller } from '../main';

const SVG = 'http://www.w3.org/2000/svg';
/** On the phone, a brick is this many units across; Hard walls show their five sections three to a row. */
const CELL = 10;
const SECTION_GAP = 5;
const SECTIONS_PER_ROW = 3;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: SVGElement[]) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

/** A ball: a circle of its colour with its shape on it (in the shape's colour, or white). */
export function ballSvg(ball: Ball, cx: number, cy: number, r: number, extra: Record<string, string | number> = {}) {
  const points = shapePoints(ball.shape)
    .map(([x, y]) => `${(cx + x * r * 1.25).toFixed(2)},${(cy + y * r * 1.25).toFixed(2)}`)
    .join(' ');
  return svg(
    'g',
    extra,
    svg('circle', { cx, cy, r, fill: PAINTS[ball.color], stroke: '#140f2e', 'stroke-width': r * 0.12 }),
    svg('polygon', { points, fill: ball.inner === undefined ? '#ffffff' : PAINTS[ball.inner], stroke: '#140f2e', 'stroke-width': r * 0.1, 'stroke-linejoin': 'round' }),
  );
}

/**
 * Pick a colour and a shape (and from Hard up, the shape's colour) and throw: the ball lands where
 * the wall's hidden rule puts it, and every throw stays on the wall to work the rule out from.
 */
export function createStarSplat(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: SplatPlayerView | null = null;
  let phaseEndsAt = 0;
  let wallKey = '';
  /** Stars shown last time, so any just earned pop in. */
  let starsShown = 0;
  const pick: Required<Ball> = { color: 0, shape: 0, inner: 1 };
  /** Waiting for the server to say where the last throw landed. */
  let throwing = false;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const starsEl = h('div', { class: 'sp-stars' });
  const ballsEl = h('div', { class: 'sp-balls' });
  const statsEl = h('div', { class: 'sp-stats' }, starsEl, ballsEl);
  const wallEl = h('div', { class: 'sp-wall' });
  const statusEl = h('div', { class: 'ra-status' });
  const colorRow = h('div', { class: 'sp-row' });
  const shapeRow = h('div', { class: 'sp-row' });
  const innerRow = h('div', { class: 'sp-row' });
  const innerLabel = h('div', { class: 'sp-label' }, 'Shape colour');
  const previewEl = h('div', { class: 'sp-preview' });
  const throwBtn = h('button', { class: 'sp-throw', type: 'button' }, 'Throw!') as HTMLButtonElement;
  const launcherEl = h(
    'div',
    { class: 'sp-launcher' },
    h('div', { class: 'sp-label' }, 'Colour'),
    colorRow,
    h('div', { class: 'sp-label' }, 'Shape'),
    shapeRow,
    innerLabel,
    innerRow,
    h('div', { class: 'sp-fire' }, previewEl, throwBtn),
  );
  root.append(h('div', { class: 'ra sp' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), statsEl, wallEl, statusEl, launcherEl));

  /** A row of buttons, one per option, re-drawn to show what's picked. */
  function optionButtons(row: HTMLElement, key: keyof Ball, draw: (i: number) => SVGElement, label: (i: number) => string) {
    row.replaceChildren(
      ...Array.from({ length: 5 }, (_, i) => {
        const btn = h('button', { type: 'button', class: `sp-option${pick[key] === i ? ' on' : ''}`, 'aria-label': label(i) }) as HTMLButtonElement;
        btn.append(svg('svg', { viewBox: '-1 -1 2 2' }, draw(i)));
        btn.addEventListener('click', () => {
          pick[key] = i;
          render();
        });
        return btn;
      }),
    );
  }

  throwBtn.addEventListener('click', () => {
    if (!view || view.phase !== 'play' || view.done || throwing) return;
    throwing = true;
    // If the server doesn't answer (it ignores a throw it can't take), don't stay stuck.
    setTimeout(() => {
      throwing = false;
      render();
    }, 1500);
    navigator.vibrate?.(20);
    const ball: Ball = view.level >= 3 ? { ...pick } : { color: pick.color, shape: pick.shape };
    send({ type: 'throw', ball } satisfies SplatInput);
    render();
  });

  /** Where a brick is drawn: Hard walls wrap their sections three to a row. */
  function brickAt(cell: number, cols: number) {
    const row = Math.floor(cell / cols);
    const col = cell % cols;
    const section = Math.floor(col / 5);
    const x0 = (section % SECTIONS_PER_ROW) * (5 * CELL + SECTION_GAP);
    const y0 = Math.floor(section / SECTIONS_PER_ROW) * (5 * CELL + SECTION_GAP);
    return { x: x0 + (col % 5) * CELL, y: y0 + row * CELL };
  }

  function drawWall(v: SplatPlayerView) {
    const { rows, cols, sections } = wallSize(v.level);
    const across = Math.min(sections, SECTIONS_PER_ROW);
    const down = Math.ceil(sections / SECTIONS_PER_ROW);
    const width = across * 5 * CELL + (across - 1) * SECTION_GAP;
    const height = down * rows * CELL + (down - 1) * SECTION_GAP;
    const root = svg('svg', { viewBox: `-1 -1 ${width + 2} ${height + 2}` });

    for (let s = 0; s < sections; s++) {
      const { x, y } = brickAt(s * 5, cols);
      root.append(svg('rect', { x: x - 0.6, y: y - 0.6, width: 5 * CELL + 1.2, height: rows * CELL + 1.2, rx: 1.5, fill: '#0c0920' }));
    }
    const last = v.hits[v.hits.length - 1];
    const hitAt = new Map(v.hits.map((hit) => [hit.cell, hit]));
    const answers = new Map(v.answers?.map((a) => [a.cell, a.ball]) ?? []);
    for (let cell = 0; cell < rows * cols; cell++) {
      const { x, y } = brickAt(cell, cols);
      const target = v.targets.find((t) => t.cell === cell);
      const hit = hitAt.get(cell);
      root.append(svg('rect', { x: x + 0.4, y: y + 0.4, width: CELL - 0.8, height: CELL - 0.8, rx: 1, fill: target ? (hit ? '#6b5320' : '#3b3185') : '#241d55' }));
      if (hit) root.append(ballSvg(hit.ball, x + CELL / 2, y + CELL / 2, CELL * 0.36, hit === last ? { class: 'sp-last' } : {}));
      else if (answers.has(cell)) root.append(ballSvg(answers.get(cell)!, x + CELL / 2, y + CELL / 2, CELL * 0.36, { opacity: 0.45 }));
      // The brick's stars: empty until it's hit, then filled. Under a ball, they sit along the bottom.
      if (target) {
        const r = hit ? 1.05 : 1.35;
        const cy = y + (hit ? CELL * 0.86 : CELL / 2);
        for (let i = 0; i < target.stars; i++) {
          const cx = x + CELL / 2 + (i - (target.stars - 1) / 2) * r * 2.1;
          const points = starPoints(r).map(([px, py]) => `${(cx + px).toFixed(2)},${(cy + py).toFixed(2)}`).join(' ');
          root.append(svg('polygon', hit ? { points, fill: '#ffd166', stroke: '#140f2e', 'stroke-width': 0.25 } : { points, fill: 'none', stroke: '#ffffff', 'stroke-width': 0.3 }));
        }
      }
    }
    wallEl.replaceChildren(root);
    wallEl.classList.toggle('sp-big', sections > 1);
  }

  function render() {
    if (!view) return;
    const v = view;
    const key = `${v.puzzleNumber}|${v.level}`;
    if (key !== wallKey) {
      wallKey = key;
      throwing = false;
      starsShown = 0;
    }
    headerEl.textContent = `Wall ${v.puzzleNumber}/${v.totalPuzzles} · ${LEVELS[v.level - 1].name}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    // Every star on the wall, empty until it's earned; any just earned pop in.
    if (v.stars < starsShown) starsShown = 0;
    starsEl.replaceChildren(
      svg(
        'svg',
        { viewBox: `0 0 ${TOTAL_STARS * 2.2} 2.2` },
        ...Array.from({ length: TOTAL_STARS }, (_, i) => {
          const points = starPoints(1).map(([px, py]) => `${(i * 2.2 + 1.1 + px).toFixed(2)},${(1.1 + py).toFixed(2)}`).join(' ');
          const earned = i < v.stars;
          return svg('polygon', {
            points,
            fill: earned ? '#ffd166' : 'none',
            stroke: earned ? '#ffd166' : '#b8b0e8',
            'stroke-width': 0.12,
            'stroke-linejoin': 'round',
            ...(earned && i >= starsShown ? { class: 'sp-star-new', style: `animation-delay: ${(i - starsShown) * 70}ms` } : {}),
          });
        }),
      ),
    );
    starsShown = v.stars;
    ballsEl.textContent = `${v.ballsLeft} of ${v.ammo} balls left`;
    drawWall(v);

    const hard = v.level >= 3;
    optionButtons(colorRow, 'color', (i) => svg('circle', { r: 0.8, fill: PAINTS[i] }), (i) => PAINT_NAMES[i]);
    optionButtons(
      shapeRow,
      'shape',
      (i) => svg('polygon', { points: shapePoints(i).map(([x, y]) => `${x * 1.3},${y * 1.3}`).join(' '), fill: '#ffffff' }),
      (i) => SHAPES[i],
    );
    optionButtons(innerRow, 'inner', (i) => svg('circle', { r: 0.8, fill: PAINTS[i] }), (i) => `${PAINT_NAMES[i]} shape`);
    innerRow.hidden = innerLabel.hidden = !hard;
    previewEl.replaceChildren(svg('svg', { viewBox: '-1 -1 2 2' }, ballSvg(hard ? pick : { color: pick.color, shape: pick.shape }, 0, 0, 0.9)));

    const playing = v.phase === 'play' && !v.done;
    launcherEl.hidden = !playing;
    throwBtn.disabled = throwing;

    const last = v.hits[v.hits.length - 1];
    const lastTarget = last && v.targets.find((t) => t.cell === last.cell);
    const firstHit = last && lastTarget && v.hits.findIndex((h) => h.cell === last.cell) === v.hits.length - 1;
    if (v.phase === 'play') {
      if (v.finishMs !== null) setStatus(`Every star filled in ${(v.finishMs / 1000).toFixed(1)}s! Waiting for everyone else…`, 'good');
      else if (v.done) setStatus('Out of balls. Waiting for everyone else…');
      else if (!last) setStatus('Pick a colour and a shape and throw. Where it lands depends on both: work out the pattern!');
      else if (firstHit) setStatus('Hit!', 'good');
      else if (lastTarget) setStatus('Already hit that one.');
      else setStatus('Missed: it stays on the wall to help you work out the pattern.');
    } else if (v.phase === 'reveal') {
      setStatus(`+${v.points.toLocaleString()} points. Faded balls show what would have hit the stars you missed.`, v.points ? 'good' : '');
    } else setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
  }

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `ra-status ${kind}`;
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    const timed = view.phase === 'play' && !view.done;
    timerEl.textContent = timed ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    timerEl.classList.toggle('low', timed && secs <= 15);
  }
  const interval = setInterval(tick, 250);

  return {
    update(raw) {
      const next = raw as SplatPlayerView;
      // A throw has landed when the server has one more on the wall (or the wall's moved on).
      if (!view || next.hits.length !== view.hits.length || next.puzzleNumber !== view.puzzleNumber) throwing = false;
      view = next;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
