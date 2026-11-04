import { RANGES, clampFace, faceGeometry, type Face, type FixInput, type FixPlayerView } from '../../../shared/games/faceFix';
import { ordinal } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

const SIZE = 240;
const W = 400;
const H = 440;
const SEND_MS = 150;

/** Your face: drag the eyes, nose and mouth; stretch it with the sliders; then lock it in. */
export function createFaceFix(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: FixPlayerView | null = null;
  let phaseEndsAt = 0;
  let face: Face | null = null;
  let faceKey = '';
  let dragging: { part: 'eyes' | 'nose' | 'mouth'; id: number } | null = null;
  let scale = 1;
  let sent = '';
  let timer: ReturnType<typeof setInterval> | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const canvas = h('canvas', { class: 'po-canvas' }) as HTMLCanvasElement;
  const boardEl = h('div', { class: 'po-board pp-board ff-board' }, canvas);
  const slider = (label: string, key: keyof Face) => {
    const input = h('input', { type: 'range', min: '0', max: '1000', class: 'ff-slider' }) as HTMLInputElement;
    input.addEventListener('input', () => {
      if (!face) return;
      const [lo, hi] = RANGES[key];
      face = { ...face, [key]: lo + (Number(input.value) / 1000) * (hi - lo) };
      draw();
    });
    return { key, input, el: h('label', { class: 'ff-row' }, h('span', {}, label), input) };
  };
  const sliders = [slider('Wide', 'w'), slider('Tall', 'h'), slider('Mouth', 'mouthW')];
  const lockBtn = h('button', { type: 'button' }, 'Lock it in') as HTMLButtonElement;
  const editEl = h('div', { class: 'pd-aim' }, boardEl, ...sliders.map((s) => s.el), lockBtn);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), editEl, infoEl));
  const ctx = canvas.getContext('2d')!;

  const editing = () => !!view?.state && view.phase === 'aim' && view.hasBoard && !view.locked;

  function syncSliders() {
    if (!face) return;
    for (const s of sliders) {
      const [lo, hi] = RANGES[s.key];
      s.input.value = String(Math.round(((face[s.key] - lo) / (hi - lo)) * 1000));
    }
  }

  function draw() {
    if (!face) return;
    const box = boardEl.getBoundingClientRect();
    scale = Math.min(box.width / W, box.height / H) || 1;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    canvas.style.width = `${Math.round(W * scale)}px`;
    canvas.style.height = `${Math.round(H * scale)}px`;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.fillStyle = '#2a2160';
    ctx.fillRect(0, 0, W, H);
    const geo = faceGeometry(face, W / 2, H / 2, SIZE);
    const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    };
    ellipse(W / 2, H / 2, geo.rx + 4, geo.ry + 4, '#140f2e');
    ellipse(W / 2, H / 2, geo.rx, geo.ry, '#f2c9a0');
    for (const e of geo.eyes) {
      ellipse(e.x, e.y, geo.eyeR * 1.6, geo.eyeR * 1.6, '#ffffff');
      ellipse(e.x, e.y, geo.eyeR, geo.eyeR, '#140f2e');
    }
    ctx.fillStyle = '#d9a066';
    ctx.beginPath();
    ctx.moveTo(geo.nose.x, geo.nose.y - SIZE * 0.08);
    ctx.lineTo(geo.nose.x - SIZE * 0.05, geo.nose.y + SIZE * 0.03);
    ctx.lineTo(geo.nose.x + SIZE * 0.05, geo.nose.y + SIZE * 0.03);
    ctx.fill();
    ellipse(geo.mouth.x, geo.mouth.y, geo.mouth.w / 2, SIZE * 0.035, '#c0392b');
  }

  const point = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!editing() || !face) return;
    e.preventDefault();
    const p = point(e);
    const geo = faceGeometry(face, W / 2, H / 2, SIZE);
    const near = [
      { part: 'eyes' as const, d: Math.min(...geo.eyes.map((o) => Math.hypot(o.x - p.x, o.y - p.y))) },
      { part: 'nose' as const, d: Math.hypot(geo.nose.x - p.x, geo.nose.y - p.y) },
      { part: 'mouth' as const, d: Math.hypot(geo.mouth.x - p.x, geo.mouth.y - p.y) },
    ].sort((a, b) => a.d - b.d)[0];
    dragging = { part: near.part, id: e.pointerId };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic event (in testing) can't be captured.
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || dragging.id !== e.pointerId || !face) return;
    const p = point(e);
    const geo = faceGeometry(face, W / 2, H / 2, SIZE);
    const y = (p.y - H / 2) / geo.ry;
    if (dragging.part === 'eyes') face = clampFace({ ...face, eyeY: y, eyeGap: Math.abs(p.x - W / 2) / geo.rx });
    else if (dragging.part === 'nose') face = clampFace({ ...face, noseY: y });
    else face = clampFace({ ...face, mouthY: y });
    draw();
  });
  const stop = () => (dragging = null);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  lockBtn.addEventListener('click', () => {
    if (!editing() || !face) return;
    navigator.vibrate?.(30);
    send({ type: 'fire', face } satisfies FixInput);
  });

  function sendFace() {
    if (!editing() || !face) return;
    const key = JSON.stringify(face);
    if (key === sent) return;
    sent = key;
    send({ type: 'aim', face } satisfies FixInput);
  }

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles} · Face ${v.volley}/${v.totalVolleys}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    if (s) {
      const key = `${v.seed}|${s.face}`;
      if (key !== faceKey) {
        faceKey = key;
        face = { ...s.start };
        syncSliders();
      }
    }
    const on = editing();
    if (on && !timer) {
      sent = '';
      timer = setInterval(sendFace, SEND_MS);
    } else if (!on && timer) {
      clearInterval(timer);
      timer = null;
    }
    editEl.hidden = !on;
    infoEl.hidden = on;
    let title = '';
    const lines: string[] = [];
    if (!v.hasBoard) title = "You'll get a face next round.";
    else if (v.phase === 'aim') title = `Locked in! ${v.lockedCount} of ${v.playing} done`;
    else if (v.phase === 'fly') title = `${s?.match ?? 0}% match!`;
    else if (v.phase === 'result') {
      title = v.place === 1 ? 'Best face fixer!' : 'Round over';
      if (v.place !== null) lines.push(`${ordinal(v.place)} place`);
      lines.push(`+${v.points.toLocaleString()} points`);
    } else {
      title = 'Round scores';
      lines.push(`You got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`);
    }
    infoTitle.textContent = title;
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));
    if (on) draw();
  }

  function clock() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'aim' ? `${secs}s` : '';
    timerEl.classList.toggle('low', view.phase === 'aim' && secs <= 5);
  }
  const interval = setInterval(clock, 200);

  return {
    update(raw) {
      view = raw as FixPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      clock();
    },
    destroy() {
      if (timer) clearInterval(timer);
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
