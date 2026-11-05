import { BALL_R, LANE_HALF, MAX_ANGLE, frameScores, type BowlInput, type BowlPlayerView } from '../../../shared/games/strikeZone';
import { ordinal } from '../boards';
import { h } from '../dom';
import type { Controller } from '../main';

/** Aim updates go to the server at most this often. */
const SEND_MS = 80;
/** A finger moving up this far is a flick (before that, it's lining the ball up). */
const FLICK_PX = 30;
/** A flick this fast (px/ms) is full power. */
const FULL_SPEED = 2.6;
/** A flick that turns this much (radians) from its first half to its second is full spin. */
const FULL_TURN = 0.5;

/**
 * Your end of the lane: drag the ball left and right to line it up, then flick it up the lane.
 * A faster flick bowls harder; a flick that curves puts spin on the ball.
 */
export function createStrikeZone(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: BowlPlayerView | null = null;
  let phaseEndsAt = 0;
  /** The ball's spot on the line, -1 to 1 across the lane. */
  let across = 0;
  let touch: { id: number; startX: number; startAcross: number; path: { x: number; y: number; t: number }[]; flicking: boolean } | null = null;
  let sendTimer: ReturnType<typeof setInterval> | null = null;
  let sent = '';

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const canvas = h('canvas', { class: 'sz-lane' }) as HTMLCanvasElement;
  const laneEl = h('div', { class: 'sz-wrap' }, canvas);
  const hintEl = h('div', { class: 'pd-hint' });
  const aimEl = h('div', { class: 'pd-aim' }, laneEl, hintEl);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  const statsEl = h('div', { class: 'pd-stats' });
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), aimEl, infoEl, statsEl));
  const ctx = canvas.getContext('2d')!;

  const canAim = () => !!view?.state && view.phase === 'aim' && view.hasBoard && !view.locked && !view.state.sitting;
  const ballX = () => across * (LANE_HALF - BALL_R);

  function draw() {
    const box = laneEl.getBoundingClientRect();
    const w = Math.round(box.width);
    const hgt = Math.round(box.height);
    if (!w || !hgt) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = hgt * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hgt}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#3a3350';
    ctx.fillRect(0, 0, w, hgt);
    const laneW = w * 0.8;
    const left = (w - laneW) / 2;
    ctx.fillStyle = '#d9a45f';
    ctx.fillRect(left, 0, laneW, hgt);
    ctx.fillStyle = '#ff5d73';
    ctx.fillRect(left, hgt - 70, laneW, 5);
    // The ball where it's lined up, and the flick's trail.
    const bx = left + laneW / 2 + (across * (laneW / 2 - laneW * 0.1));
    ctx.beginPath();
    ctx.arc(bx, hgt - 40, laneW * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = getComputedStyle(root).getPropertyValue('--player') || '#ff5d73';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#140f2e';
    ctx.stroke();
    if (touch?.flicking && touch.path.length > 1) {
      ctx.beginPath();
      const r = canvas.getBoundingClientRect();
      touch.path.forEach((p, i) => (i ? ctx.lineTo(p.x - r.left, p.y - r.top) : ctx.moveTo(p.x - r.left, p.y - r.top)));
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!canAim()) return;
    e.preventDefault();
    touch = { id: e.pointerId, startX: e.clientX, startAcross: across, path: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }], flicking: false };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic event (in testing) can't be captured.
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (touch?.id !== e.pointerId) return;
    touch.path.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (!touch.flicking && touch.path[0].y - e.clientY > FLICK_PX) {
      // From here it's a flick: it starts where the finger turned up the lane.
      touch.flicking = true;
      touch.path = touch.path.slice(-2);
    }
    if (!touch.flicking) {
      const laneW = canvas.getBoundingClientRect().width * 0.8;
      across = Math.max(-1, Math.min(1, touch.startAcross + ((e.clientX - touch.startX) / laneW) * 2.2));
    }
    draw();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (touch?.id !== e.pointerId) return;
    const t = touch;
    touch = null;
    draw();
    if (!t.flicking || !canAim()) return;
    const path = t.path;
    const end = path[path.length - 1];
    // Speed over the last stretch of the flick.
    const recent = path.filter((p) => end.t - p.t <= 120);
    const from = recent[0] ?? path[0];
    const dt = Math.max(1, end.t - from.t);
    const speed = Math.hypot(end.x - from.x, end.y - from.y) / dt;
    if (speed < 0.3) return;
    // Its direction overall, and how much it turned between its halves.
    const mid = path[Math.floor(path.length / 2)];
    const start = path[0];
    const dir = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.x - a.x, a.y - b.y);
    const angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, dir(start, end) * 0.4));
    const turn = path.length >= 4 ? dir(mid, end) - dir(start, mid) : 0;
    const aim = { x: ballX(), angle, power: Math.min(1, speed / FULL_SPEED), spin: Math.max(-1, Math.min(1, turn / FULL_TURN)) };
    navigator.vibrate?.(40);
    send({ type: 'fire', ...aim } satisfies BowlInput);
  });
  canvas.addEventListener('pointercancel', () => {
    touch = null;
    draw();
  });

  /** Lining up moves the ball on the TV too. */
  function sendAim() {
    if (!canAim()) return;
    const key = ballX().toFixed(3);
    if (key === sent) return;
    sent = key;
    send({ type: 'aim', x: ballX(), angle: 0, power: 0.5, spin: 0 } satisfies BowlInput);
  }

  function render() {
    if (!view) return;
    const v = view;
    const s = v.state;
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    const aiming = canAim();
    if (aiming && !sendTimer) {
      sent = '';
      sendTimer = setInterval(sendAim, SEND_MS);
    } else if (!aiming && sendTimer) {
      clearInterval(sendTimer);
      sendTimer = null;
    }
    aimEl.hidden = !aiming;
    infoEl.hidden = aiming;
    if (s) hintEl.textContent = `Frame ${s.frame + 1}, ball ${s.ball + 1}. Drag the ball sideways to line it up, then flick it up the lane. Curve your flick for spin.`;
    let title = '';
    const lines: string[] = [];
    if (!v.hasBoard) title = "You'll get a lane next round.";
    else if (v.phase === 'aim') title = s?.sitting ? 'Sit this ball out.' : `Bowled! ${v.lockedCount} of ${v.playing} ready`;
    else if (v.phase === 'fly') title = 'Watch the TV!';
    else if (v.phase === 'result') {
      title = v.place === 1 ? 'Top of the round!' : 'Round over';
      lines.push(`${v.boardScore} pins`);
      if (v.place !== null) lines.push(`${ordinal(v.place)} place`);
      lines.push(`+${v.points.toLocaleString()} points`);
    } else {
      title = 'Round scores';
      lines.push(`You got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`);
    }
    infoTitle.textContent = title;
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));
    statsEl.textContent =
      s && v.phase !== 'gameEnd' && v.phase !== 'fly' ? frameScores(s.frames).map((score, i) => `F${i + 1}: ${s.frames[i][0] === null ? '–' : score}`).join(' · ') + ` · ${s.standing} standing` : '';
    draw();
  }

  function clock() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'aim' ? `${secs}s` : '';
    timerEl.classList.toggle('low', view.phase === 'aim' && secs <= 5);
  }
  const interval = setInterval(clock, 200);
  const onResize = () => draw();
  window.addEventListener('resize', onResize);

  return {
    update(raw) {
      view = raw as BowlPlayerView;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      clock();
    },
    destroy() {
      if (sendTimer) clearInterval(sendTimer);
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
    },
  };
}
