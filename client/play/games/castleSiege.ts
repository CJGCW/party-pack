import { COLS, PIECES, ROWS, castleOf, landOf, turned, type SiegeInput, type SiegeView } from '../../../shared/games/castleSiege';
import { h } from '../dom';
import type { Controller } from '../main';

const FINGER_CELLS = 3;

/**
 * The map. In the fire, all of it: tap a rival's land to shell it. In the cannon phase, your own
 * land, close up: tap inside your walls to place a cannon. In the repair, your own land again:
 * drag the next piece into place and lift your finger to put it down (Turn turns it).
 */
export function createCastleSiege(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: SiegeView | null = null;
  let phaseEndsAt = 0;
  let reloadedAt = 0;
  let ghost: { x: number; y: number } | null = null;
  /** The part of the map on show (cells), and how big a cell is on screen. */
  let area = { x: 0, y: 0, w: COLS, h: ROWS };
  let cell = 10;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const msgEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board pp-board' }, canvas);
  const turnBtn = h('button', { type: 'button', class: 'secondary' }, 'Turn') as HTMLButtonElement;
  const playEl = h('div', { class: 'pd-aim' }, boardEl, turnBtn);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd po' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), msgEl, playEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  const me = () => view?.players.find((p) => p.id === view?.you);
  /** While placing, the piece sits above your finger, so you can see it. */
  const ghostAt = (e: PointerEvent) => {
    const at = cellAt(e);
    return { x: at.x, y: at.y - FINGER_CELLS };
  };
  const cellAt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: area.x + Math.floor((e.clientX - r.left) / cell), y: area.y + Math.floor((e.clientY - r.top) / cell) };
  };

  canvas.addEventListener('pointerdown', (e) => {
    const v = view;
    if (!v || me()?.out) return;
    e.preventDefault();
    const at = cellAt(e);
    if (v.phase === 'cannons') {
      navigator.vibrate?.(10);
      send({ type: 'cannon', x: at.x, y: at.y } satisfies SiegeInput);
    } else if (v.phase === 'fire') {
      if (performance.now() < reloadedAt) return;
      navigator.vibrate?.(20);
      send({ type: 'fire', x: at.x, y: at.y } satisfies SiegeInput);
    } else if (v.phase === 'repair') {
      ghost = ghostAt(e);
      draw();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ghost) return;
    ghost = ghostAt(e);
    draw();
  });
  canvas.addEventListener('pointerup', () => {
    if (!ghost || view?.phase !== 'repair') return;
    send({ type: 'place', x: ghost.x, y: ghost.y } satisfies SiegeInput);
    navigator.vibrate?.(10);
    ghost = null;
  });
  turnBtn.addEventListener('click', () => send({ type: 'turn' } satisfies SiegeInput));

  function draw() {
    const v = view;
    if (!v) return;
    const n = v.players.length;
    const mine = me();
    area = (v.phase === 'repair' || v.phase === 'cannons') && mine ? landOf(mine.index, n) : { x: 0, y: 0, w: COLS, h: ROWS };
    const box = boardEl.getBoundingClientRect();
    cell = Math.max(4, Math.floor(Math.min(box.width / area.w, box.height / area.h)));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = area.w * cell * dpr;
    canvas.height = area.h * cell * dpr;
    canvas.style.width = `${area.w * cell}px`;
    canvas.style.height = `${area.h * cell}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Land, tinted by whose it is (rivals' brighter in the fire: that's where to aim).
    for (const p of v.players) {
      const l = landOf(p.index, n);
      ctx.fillStyle = p.id === v.you ? '#2a2160' : v.phase === 'fire' && !p.out ? '#3b3185' : '#241d55';
      ctx.fillRect((l.x - area.x) * cell, (l.y - area.y) * cell, l.w * cell, l.h * cell);
      const c = castleOf(p.index, n);
      ctx.fillStyle = p.out ? '#555' : p.color;
      ctx.fillRect((c.x - area.x) * cell, (c.y - area.y) * cell, cell * 2, cell * 2);
    }
    for (let y = area.y; y < area.y + area.h; y++) {
      for (let x = area.x; x < area.x + area.w; x++) {
        const ch = v.walls[y * COLS + x];
        if (ch === '.') continue;
        ctx.fillStyle = v.players.find((p) => p.index === Number(ch))?.color ?? '#fff';
        ctx.fillRect((x - area.x) * cell + 1, (y - area.y) * cell + 1, cell - 2, cell - 2);
      }
    }
    for (let i = 0; i < v.cannons.length; i += 4) {
      const [owner, x, y] = v.cannons.slice(i, i + 4);
      ctx.fillStyle = '#111';
      ctx.fillRect((x - area.x) * cell, (y - area.y) * cell, cell * 2, cell * 2);
      ctx.fillStyle = v.players.find((p) => p.index === owner)?.color ?? '#fff';
      ctx.beginPath();
      ctx.arc((x + 1 - area.x) * cell, (y + 1 - area.y) * cell, cell * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // The next piece: under the drag, else waiting in the corner.
    if (v.phase === 'repair' && v.piece !== undefined) {
      const at = ghost ?? { x: area.x + 3, y: area.y + 3 };
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (const [dx, dy] of turned(PIECES[v.piece], v.turns ?? 0)) ctx.fillRect((at.x + dx - area.x) * cell + 1, (at.y + dy - area.y) * cell + 1, cell - 2, cell - 2);
    }
  }

  function render() {
    if (!view) return;
    const v = view;
    const mine = me();
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles} · Siege ${Math.min(v.cycle, 4)}`;
    scoreEl.textContent = mine?.out ? 'OUT' : `${mine?.enclosed ?? 0} walled in`;
    const playing = (v.phase === 'cannons' || v.phase === 'fire' || v.phase === 'repair') && !mine?.out;
    playEl.hidden = !playing;
    infoEl.hidden = playing;
    turnBtn.hidden = v.phase !== 'repair';
    let title = '';
    const lines: string[] = [];
    if (mine?.out && (v.phase === 'cannons' || v.phase === 'fire' || v.phase === 'repair')) title = 'Your castle fell! Watch the TV.';
    else if (v.phase === 'result') {
      title = mine?.out ? 'Your castle fell' : 'Still standing!';
      lines.push(`+${(mine?.points ?? 0).toLocaleString()} points`);
    } else if (v.phase === 'gameEnd') {
      title = 'Round scores';
      lines.push(`You got +${(mine?.gamePoints ?? 0).toLocaleString()} this round. Look at the TV!`);
    }
    infoTitle.textContent = title;
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));
    draw();
  }

  function clock() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'cannons' || view.phase === 'fire' || view.phase === 'repair' ? `${secs}s` : '';
    timerEl.classList.toggle('low', secs <= 5);
    const mine = me();
    const toPlace = view.toPlace ?? 0;
    msgEl.textContent = view.phase === 'cannons' ? (toPlace ? `Tap inside your walls: ${toPlace} cannon${toPlace === 1 ? '' : 's'} to place` : 'Cannons ready!') : view.phase === 'fire' ? (performance.now() < reloadedAt ? 'Reloading…' : 'FIRE! Tap their walls.') : view.phase === 'repair' ? (mine && mine.enclosed > 0 ? 'Walled in! Strengthen it.' : 'Close the gaps in your wall!') : '';
  }
  const interval = setInterval(clock, 100);

  return {
    update(raw) {
      view = raw as SiegeView;
      phaseEndsAt = performance.now() + view.msLeft;
      reloadedAt = performance.now() + (view.reloadMs ?? 0);
      render();
      clock();
    },
    destroy() {
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
