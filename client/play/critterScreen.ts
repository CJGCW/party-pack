import { artDefs, wumbleSvg } from '../../shared/critterArt';
import type { SceneTheme } from '../../shared/sceneArt';
import { showBackdrop } from './backdrop';
import { piecePrims, type CritterPlayerView, type Piece, type Prim } from '../../shared/critters';
import { h } from './dom';
import type { Controller } from './main';

const SVG = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: (SVGElement | string)[]) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

function primEl(p: Prim): SVGElement {
  const paint = { fill: p.fill ?? 'none', 'fill-opacity': p.alpha ?? 1, stroke: p.line ?? 'none', 'stroke-width': p.w ?? 0, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  if (p.t === 'circle') return svgEl('circle', { cx: p.x, cy: p.y, r: p.r, ...paint });
  const points = p.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return svgEl(p.open ? 'polyline' : 'polygon', { points, ...paint });
}

/** The Wumbles' shading, put on the page once for every picture to share. */
let defsAdded = false;
function addArtDefs() {
  if (defsAdded) return;
  defsAdded = true;
  // Not display:none: gradients in a hidden SVG don't paint elsewhere in some browsers.
  const holder = svgEl('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden' });
  holder.innerHTML = `<defs>${artDefs()}</defs>`;
  document.body.append(holder);
}

/** A piece centred on x, y, `size` across. */
export function pieceAt(p: Piece, x: number, y: number, size: number, attrs: Record<string, string | number> = {}) {
  let inner: SVGElement[];
  if (p.k === 'w') {
    addArtDefs();
    const art = svgEl('g', { class: 'cw' });
    art.innerHTML = wumbleSvg(p.t!, { clock: performance.now() / 1000 });
    inner = [art];
  } else inner = p.k === 'e' ? [svgEl('text', { x: 0, y: 28, 'font-size': 76, 'text-anchor': 'middle' }, p.e ?? '')] : piecePrims(p).map(primEl);
  if (p.on) inner.unshift(svgEl('circle', { r: 49, fill: 'none', stroke: '#ffd166', 'stroke-width': 5 }));
  return svgEl('g', { transform: `translate(${x} ${y}) scale(${size / 100})`, ...(p.dim ? { opacity: 0.3 } : {}), ...attrs }, ...inner);
}

export function pieceIcon(p: Piece) {
  return svgEl('svg', { viewBox: '-52 -52 104 104' }, pieceAt({ ...p, on: false }, 0, 0, 100));
}

/** A piece on a button. */
export function tile(p: Piece, opts: { on?: boolean; dim?: boolean; good?: boolean; badge?: string; click?: () => void } = {}) {
  const btn = h('button', { type: 'button', class: `cr-tile${opts.on ? ' on' : ''}${opts.dim ? ' dim' : ''}${opts.good ? ' good' : ''}` });
  btn.append(pieceIcon(p));
  if (opts.badge) btn.append(h('span', { class: 'cr-badge' }, opts.badge));
  if (opts.click) btn.addEventListener('click', opts.click);
  else btn.disabled = true;
  return btn;
}

/** Things in rows, `cols` across. */
export function grid(cols: number, ...items: Node[]) {
  const el = h('div', { class: 'cr-grid', style: `--cols:${cols}` });
  el.append(...items);
  return el;
}

export interface CritterUi {
  /** Each game draws in here. */
  stage: HTMLElement;
  send(input: unknown): void;
  redraw(): void;
  /** What to say while nothing else needs saying. */
  hint: string;
}

/**
 * The screen every Wumble puzzle shares: the clock, drawn tries and progress, and what's just
 * happened. `make` is called once and returns what draws the puzzle in `ui.stage`, for each update.
 * `scene` is the storybook backdrop behind it all.
 */
export function critterScreen<S>(make: (ui: CritterUi) => (v: CritterPlayerView<S>) => void, scene: SceneTheme = 'glade') {
  return (root: HTMLElement, send: (input: unknown) => void): Controller => {
    const hideScene = showBackdrop(scene);
    let view: CritterPlayerView<S> | null = null;
    let phaseEndsAt = 0;

    const headerEl = h('span');
    const timerEl = h('span', { class: 'wr-timer' });
    const scoreEl = h('span');
    const pipsEl = h('div', { class: 'cr-pips' });
    const heartsEl = h('div', { class: 'cr-hearts' });
    const stage = h('div', { class: 'cr-stage' });
    const statusEl = h('div', { class: 'ra-status' });
    root.append(h('div', { class: 'ra cr' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), pipsEl, heartsEl, statusEl, stage));

    const ui: CritterUi = { stage, send, redraw: () => render(), hint: '' };
    let draw = make(ui);
    /** Each puzzle starts fresh, with nothing still picked from the last one. */
    let drawnPuzzle = 0;
    /** Progress last time, so a step forward cheers and a slip shakes heads. */
    let lastGot = 0;
    let lastTries = 0;
    let moodTimer: ReturnType<typeof setTimeout> | undefined;

    function mood(kind: 'cw-cheer' | 'cw-oops') {
      clearTimeout(moodTimer);
      stage.classList.remove('cw-cheer', 'cw-oops');
      void stage.offsetWidth;
      stage.classList.add(kind);
      moodTimer = setTimeout(() => stage.classList.remove(kind), 700);
    }

    function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
      statusEl.textContent = text;
      statusEl.className = `ra-status ${kind}`;
    }

    function render() {
      if (!view) return;
      const v = view;
      headerEl.textContent = `Puzzle ${v.puzzleNumber}/${v.totalPuzzles} · ${v.levelName}`;
      scoreEl.textContent = `${v.score.toLocaleString()} pts`;
      // Drawn, not counted: a pip for each thing to do, and a heart for each slip you can make.
      pipsEl.replaceChildren(...Array.from({ length: v.goal }, (_, i) => h('span', { class: i < v.got ? 'on' : '' })));
      heartsEl.replaceChildren(...Array.from({ length: v.triesMax }, (_, i) => h('span', { class: i < v.triesLeft ? 'on' : '' }, '♥')));
      if (v.puzzleNumber !== drawnPuzzle) {
        drawnPuzzle = v.puzzleNumber;
        draw = make(ui);
        lastGot = v.got;
        lastTries = v.triesLeft;
      }
      draw(v);
      if (v.got > lastGot) mood('cw-cheer');
      else if (v.triesLeft < lastTries) mood('cw-oops');
      lastGot = v.got;
      lastTries = v.triesLeft;
      if (v.phase === 'play') {
        if (v.finishMs !== null) setStatus(`Solved in ${(v.finishMs / 1000).toFixed(1)}s! Waiting for everyone else…`, 'good');
        else if (v.done) setStatus('Out of tries. Waiting for everyone else…');
        else if (v.note) setStatus(v.note.text, v.note.kind);
        else setStatus(ui.hint);
      } else if (v.phase === 'reveal') setStatus(`+${v.points.toLocaleString()} points.`, v.points ? 'good' : '');
      else setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
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
        view = raw as CritterPlayerView<S>;
        phaseEndsAt = performance.now() + view.msLeft;
        render();
        tick();
      },
      destroy() {
        clearInterval(interval);
        clearTimeout(moodTimer);
        hideScene();
        root.replaceChildren();
      },
    };
  };
}
