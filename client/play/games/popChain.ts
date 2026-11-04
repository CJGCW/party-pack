import { DOT_R, FIELD_H, FIELD_W, dotAt, dotsFor, type Dot, type PopInput, type PopPlayerView } from '../../../shared/games/popChain';
import { serverNow } from '../../clock';
import { ordinal } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

const DOT_COLORS = ['#ff5d73', '#ffd166', '#4cd37a', '#5ec8f2', '#b48cff'];

/** The field, drifting (on the server's clock, so it's where everyone else sees it): tap once to set off your blast. */
export function createPopChain(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: PopPlayerView | null = null;
  let phaseEndsAt = 0;
  let dots: Dot[] = [];
  let dotsKey = '';
  let frame = 0;
  let size = '';
  let scale = 1;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const msgEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board pp-board' }, canvas);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd po' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), msgEl, boardEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  const canTap = () => !!view?.state && view.phase === 'aim' && view.hasBoard && !view.locked;
  const fieldMs = () => (view?.state ? serverNow() - view.state.startedAt : 0);

  canvas.addEventListener('pointerdown', (e) => {
    if (!canTap()) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    navigator.vibrate?.(30);
    send({ type: 'fire', x: Math.round((e.clientX - r.left) / scale), y: Math.round((e.clientY - r.top) / scale), at: Math.round(fieldMs()) } satisfies PopInput);
  });

  function draw() {
    const box = boardEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const key = `${box.width}x${box.height}x${dpr}`;
    if (key !== size) {
      size = key;
      scale = Math.min(box.width / FIELD_W, box.height / FIELD_H);
      canvas.width = Math.round(FIELD_W * scale * dpr);
      canvas.height = Math.round(FIELD_H * scale * dpr);
      canvas.style.width = `${Math.round(FIELD_W * scale)}px`;
      canvas.style.height = `${Math.round(FIELD_H * scale)}px`;
    }
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.fillStyle = '#0c0920';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    const t = fieldMs();
    for (const d of dots) {
      const p = dotAt(d, t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = DOT_COLORS[d.color];
      ctx.fill();
    }
  }

  function loop() {
    if (canTap()) draw();
    frame = requestAnimationFrame(loop);
  }

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles} · Field ${v.volley}/${v.totalVolleys}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    if (s) {
      const key = `${v.seed}|${s.field}`;
      if (key !== dotsKey) {
        dotsKey = key;
        dots = dotsFor(v.seed, s.field);
      }
    }
    const tapping = canTap();
    boardEl.hidden = !tapping;
    infoEl.hidden = tapping;
    msgEl.textContent = tapping ? 'Tap where (and when) to set off your blast!' : '';
    let title = '';
    const lines: string[] = [];
    if (!v.hasBoard) title = "You'll get a field next round.";
    else if (v.phase === 'aim') title = `Set off! ${v.lockedCount} of ${v.playing} ready`;
    else if (v.phase === 'fly') title = 'Watch the chains on the TV!';
    else if (v.phase === 'result') {
      title = v.place === 1 ? 'Biggest chains!' : 'Round over';
      lines.push(`${v.boardScore} popped`);
      if (v.place !== null) lines.push(`${ordinal(v.place)} place`);
      lines.push(`+${v.points.toLocaleString()} points`);
    } else {
      title = 'Round scores';
      lines.push(`You got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`);
    }
    infoTitle.textContent = title;
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));
  }

  function clock() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'aim' ? `${secs}s` : '';
    timerEl.classList.toggle('low', view.phase === 'aim' && secs <= 3);
  }
  const interval = setInterval(clock, 200);
  loop();

  return {
    update(raw) {
      view = raw as PopPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      clock();
    },
    destroy() {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
