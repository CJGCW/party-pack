import { CELL, COLS, ROWS, SKILLS, WALKERS, WALKER_LEVELS, type RescueInput, type RescuePlayerView, type Skill } from '../../../shared/games/walkerRescue';
import { boardsClock, boardsInfo, isPlaying } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

const SKILL_NAMES: Record<Skill, string> = { block: 'Block', dig: 'Dig', build: 'Build', float: 'Float' };
const W = COLS * CELL;
const H = ROWS * CELL;

/** Your level: pick a skill, then tap a walker to give it to them. */
export function createWalkerRescue(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: RescuePlayerView | null = null;
  let phaseEndsAt = 0;
  let chosen: Skill | null = null;
  let scale = 1;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const msgEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board pp-board' }, canvas);
  const trayEl = h('div', { class: 'pp-tray' });
  const playEl = h('div', { class: 'pd-aim' }, boardEl, trayEl);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd po' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), msgEl, playEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  canvas.addEventListener('pointerdown', (e) => {
    const s = view?.state;
    if (!s || !view || view.phase !== 'play' || !isPlaying(view)) return;
    e.preventDefault();
    if (!chosen) {
      msgEl.textContent = 'Pick a skill first!';
      return;
    }
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / scale / CELL;
    const y = (e.clientY - r.top) / scale / CELL;
    // The nearest walker within reach (fingers are big; walkers are small).
    const near = s.walkers
      .map((w) => ({ w, d: Math.hypot(w.x + 0.5 - x, w.y - 1 - y) }))
      .filter((o) => o.d < 5)
      .sort((a, b) => a.d - b.d)[0];
    if (!near) return;
    navigator.vibrate?.(15);
    send({ type: 'skill', skill: chosen, walker: near.w.id } satisfies RescueInput);
  });

  function draw() {
    const s = view?.state;
    if (!s) return;
    const box = boardEl.getBoundingClientRect();
    scale = Math.min(box.width / W, box.height / H) || 0.4;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    canvas.style.width = `${Math.round(W * scale)}px`;
    canvas.style.height = `${Math.round(H * scale)}px`;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.fillStyle = '#2a2160';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < s.grid.length; i++) {
      const ch = s.grid[i];
      if (ch === '.') continue;
      ctx.fillStyle = ch === 'S' ? '#7d7896' : '#8f5f34';
      ctx.fillRect((i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL);
    }
    const exit = WALKER_LEVELS[s.level].exit;
    ctx.fillStyle = '#4cd37a';
    ctx.fillRect(exit.x * CELL - 12, (exit.y - 3) * CELL, 24, 3 * CELL);
    for (const w of s.walkers) {
      ctx.fillStyle = w.doing === 'block' ? '#ff5d73' : w.doing === 'dig' ? '#ffd166' : w.doing === 'build' ? '#5ec8f2' : '#ffffff';
      ctx.fillRect(w.x * CELL + 1, (w.y - 1) * CELL - 4, CELL - 2, CELL + 4);
    }
  }

  function renderTray() {
    const s = view?.state;
    if (!s) return;
    trayEl.replaceChildren(
      ...SKILLS.filter((k) => s.skills[k] !== undefined).map((k) => {
        const left = s.skills[k] ?? 0;
        const b = h('button', { type: 'button', class: chosen === k ? 'on' : '' }, `${SKILL_NAMES[k]} ×${left}`) as HTMLButtonElement;
        b.disabled = left <= 0;
        b.addEventListener('click', () => {
          chosen = chosen === k ? null : k;
          msgEl.textContent = chosen ? `Tap a walker to ${SKILL_NAMES[chosen].toLowerCase()}` : '';
          renderTray();
        });
        return b;
      }),
    );
  }

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const playing = isPlaying(v);
    playEl.hidden = !playing;
    infoEl.hidden = playing;
    if (s) {
      if (chosen && (s.skills[chosen] ?? 0) <= 0) chosen = null;
      if (!chosen) msgEl.textContent = `${WALKER_LEVELS[s.level].name}: ${s.saved} of ${WALKERS} saved, ${s.lost} lost`;
    }
    renderTray();
    const info = boardsInfo(v, 'best', { ended: () => `${s?.saved ?? 0} saved!`, score: () => `${s?.saved ?? 0} saved` });
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

  return {
    update(raw) {
      view = raw as RescuePlayerView;
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
