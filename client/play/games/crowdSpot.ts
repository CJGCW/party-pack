import { EYES, FIELD_H, FIELD_W, HAT_COLORS, HAT_KINDS, MOUTHS, PERSON_R, SKINS, findFor, personAt, type Find, type Person, type SpotInput, type SpotPlayerView } from '../../../shared/games/crowdSpot';
import { serverNow } from '../../clock';
import { ordinal } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/** Draws one of the crowd on a canvas at (x, y), radius r. */
function drawPerson(ctx: CanvasRenderingContext2D, p: Person, x: number, y: number, r: number) {
  const circle = (cx: number, cy: number, rr: number, fill: string) => {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  circle(x, y, r + 3, '#140f2e');
  circle(x, y, r, SKINS[p.skin]);
  ctx.fillStyle = HAT_COLORS[p.hatColor];
  const kind = HAT_KINDS[p.hat];
  if (kind === 'cap') {
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.65, r * 0.8, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x, y - r * 0.55, r * 0.95, r * 0.18);
  } else if (kind === 'top') {
    ctx.fillRect(x - r * 0.55, y - r * 1.55, r * 1.1, r * 0.95);
    ctx.fillRect(x - r * 0.85, y - r * 0.68, r * 1.7, r * 0.18);
  } else if (kind === 'bow') {
    ctx.beginPath();
    ctx.moveTo(x + r * 0.35, y - r * 0.75);
    ctx.lineTo(x + r * 0.95, y - r * 1.05);
    ctx.lineTo(x + r * 0.95, y - r * 0.45);
    ctx.lineTo(x + r * 0.35, y - r * 0.75);
    ctx.lineTo(x - r * 0.25, y - r * 1.05);
    ctx.lineTo(x - r * 0.25, y - r * 0.45);
    ctx.fill();
  }
  const eyes = EYES[p.eyes];
  ctx.strokeStyle = ctx.fillStyle = '#140f2e';
  if (eyes === 'dots') {
    circle(x - r * 0.33, y - r * 0.05, r * 0.12, '#140f2e');
    circle(x + r * 0.33, y - r * 0.05, r * 0.12, '#140f2e');
  } else if (eyes === 'glasses') {
    ctx.lineWidth = r * 0.09;
    for (const dx of [-0.33, 0.33]) {
      ctx.beginPath();
      ctx.arc(x + r * dx, y - r * 0.05, r * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      circle(x + r * dx, y - r * 0.05, r * 0.07, '#140f2e');
    }
  } else ctx.fillRect(x - r * 0.62, y - r * 0.2, r * 1.24, r * 0.3);
  const mouth = MOUTHS[p.mouth];
  ctx.lineWidth = r * 0.09;
  if (mouth === 'smile') {
    ctx.beginPath();
    ctx.arc(x, y + r * 0.2, r * 0.32, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (mouth === 'o') circle(x, y + r * 0.45, r * 0.13, '#140f2e');
  else ctx.fillRect(x - r * 0.3, y + r * 0.42, r * 0.6, r * 0.08);
}

/** The crowd, drifting just as on the TV (on the server's clock): tap the one you're asked for. */
export function createCrowdSpot(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: SpotPlayerView | null = null;
  let phaseEndsAt = 0;
  let find: Find | null = null;
  let findKey = '';
  let frame = 0;
  let size = '';
  let scale = 1;
  /** Locked out (after a wrong tap) until then. */
  let lockedUntil = 0;
  const locked = () => performance.now() < lockedUntil;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const promptEl = h('div', { class: 'po-points' });
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board pp-board' }, canvas);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd po' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), promptEl, boardEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  const searching = () => !!view?.state && view.phase === 'aim' && view.hasBoard && !view.locked;
  const findMs = () => (view?.state ? serverNow() - view.state.startedAt : 0);

  canvas.addEventListener('pointerdown', (e) => {
    if (!searching() || locked()) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    navigator.vibrate?.(15);
    send({ type: 'tap', x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale, ms: Math.round(findMs()) } satisfies SpotInput);
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
    ctx.fillStyle = locked() ? '#5a2a3a' : '#2a2160';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    if (!find) return;
    const ms = findMs();
    for (const p of find.people) {
      const at = personAt(p, ms);
      drawPerson(ctx, p, at.x, at.y, PERSON_R);
    }
  }

  function loop() {
    if (searching()) draw();
    frame = requestAnimationFrame(loop);
  }

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles} · Find ${v.volley}/${v.totalVolleys}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    if (s) {
      const key = `${v.seed}|${s.find}`;
      if (key !== findKey) {
        findKey = key;
        find = findFor(v.seed, s.find);
      }
    }
    const on = searching();
    boardEl.hidden = !on;
    infoEl.hidden = on;
    promptEl.textContent = on ? (locked() ? 'Wrong one! Wait a moment…' : (find?.prompt ?? '')) : '';
    let title = '';
    const lines: string[] = [];
    if (!v.hasBoard) title = "You'll join in next round.";
    else if (v.phase === 'aim') title = `Found them in ${((s?.foundMs ?? 0) / 1000).toFixed(1)}s!`;
    else if (v.phase === 'fly') title = s?.found ? 'Found!' : 'They were there all along! Look at the TV.';
    else if (v.phase === 'result') {
      title = v.place === 1 ? 'Sharpest eyes!' : 'Round over';
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
    timerEl.classList.toggle('low', view.phase === 'aim' && secs <= 5);
    // The lock after a wrong tap wears off without a new view: redraw the prompt.
    render();
  }
  const interval = setInterval(clock, 250);
  loop();

  return {
    update(raw) {
      view = raw as SpotPlayerView;
      lockedUntil = performance.now() + (view.state?.lockedMs ?? 0);
      phaseEndsAt = performance.now() + view.msLeft;
      render();
    },
    destroy() {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
