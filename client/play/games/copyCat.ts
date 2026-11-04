import { MOVE_MS, TRACE_HZ, type CopyInput, type CopyView } from '../../../shared/games/copyCat';
import { h } from '../dom';
import type { Controller } from '../main';
import { needsMotionPermission, requestMotionPermission, sensorsLive } from '../motion';
import { Steer } from '../steer';

/** Recording starts after a short count-in. */
const COUNT_IN_MS = 1_500;

/**
 * The leader records a move (tilting the phone about, or a finger on the pad without motion
 * sensors); once everyone's watched it on the TV, the others record their copy the same way.
 */
export function createCopyCat(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: CopyView | null = null;
  let phaseEndsAt = 0;
  let recording: { trace: number[]; timer: ReturnType<typeof setInterval> } | null = null;
  let counting: ReturnType<typeof setTimeout> | null = null;
  let sentKey = '';

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const msgEl = h('div', { class: 'po-points' });
  const padLabel = h('div', { class: 'cf-pad-label' });
  const pad = h('div', { class: 'cf-pad cc2-pad' }, padLabel);
  const recordBtn = h('button', { type: 'button' }, 'Record') as HTMLButtonElement;
  const permissionBtn = h('button', { class: 'secondary', type: 'button' }, 'Turn on motion') as HTMLButtonElement;
  const recordEl = h('div', { class: 'pd-aim' }, pad, recordBtn, permissionBtn);
  const infoTitle = h('div', { class: 'pd-info-title' });
  const infoLines = h('div', { class: 'pd-info-lines' });
  const infoEl = h('div', { class: 'pd-info' }, infoTitle, infoLines);
  root.append(h('div', { class: 'pd' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), msgEl, recordEl, infoEl));

  // Without sensors, a finger on the pad is the move (a full move is about this far from the middle).
  const steer = new Steer(pad, { dragPxFullTilt: 120 });

  /** It's my go (to lead, or to copy), and I haven't sent it yet. */
  const myGo = () => {
    if (!view) return false;
    const key = `${view.puzzleNumber}|${view.turn}|${view.phase}`;
    if (key === sentKey) return false;
    return (view.phase === 'lead' && view.leader === view.you) || (view.phase === 'copy' && view.leader !== view.you && !view.players.find((p) => p.id === view!.you)?.done);
  };

  function startRecording() {
    if (!myGo() || recording || counting) return;
    steer.recentre();
    padLabel.textContent = 'GET READY…';
    navigator.vibrate?.(30);
    counting = setTimeout(() => {
      counting = null;
      steer.recentre();
      const trace: number[] = [];
      padLabel.textContent = 'MOVE!';
      navigator.vibrate?.(60);
      const timer = setInterval(() => {
        const t = steer.tilt();
        trace.push(Math.round(t.x * 1000) / 1000, Math.round(t.y * 1000) / 1000);
        if (trace.length / 2 >= (MOVE_MS / 1000) * TRACE_HZ) finish();
      }, 1000 / TRACE_HZ);
      recording = { trace, timer };
    }, COUNT_IN_MS);
    render();
  }

  function finish() {
    if (!recording || !view) return;
    clearInterval(recording.timer);
    sentKey = `${view.puzzleNumber}|${view.turn}|${view.phase}`;
    send({ type: 'trace', trace: recording.trace } satisfies CopyInput);
    recording = null;
    navigator.vibrate?.([30, 50, 30]);
    render();
  }

  recordBtn.addEventListener('click', startRecording);
  permissionBtn.addEventListener('click', () => void requestMotionPermission().then(render));

  function render() {
    if (!view) return;
    const v = view;
    const me = v.players.find((p) => p.id === v.you);
    const leaderName = v.players.find((p) => p.id === v.leader)?.name ?? '';
    headerEl.textContent = `Round ${v.puzzleNumber}/${v.totalPuzzles} · Turn ${v.turn}/${v.turns}`;
    scoreEl.textContent = `${me?.roundPoints ?? 0} this round`;
    const go = myGo() || !!recording || !!counting;
    recordEl.hidden = !go;
    infoEl.hidden = go;
    recordBtn.hidden = !!recording || !!counting;
    permissionBtn.hidden = !needsMotionPermission();
    if (!recording && !counting) padLabel.textContent = sensorsLive() ? 'TAP RECORD, THEN MOVE YOUR PHONE' : 'TAP RECORD, THEN DRAG HERE';
    msgEl.textContent = go ? (v.phase === 'lead' ? 'Your move! Make it tricky, but not impossible.' : `Copy ${leaderName}'s move!`) : '';
    let title = '';
    const lines: string[] = [];
    if (v.phase === 'lead') title = `${leaderName} is making a move…`;
    else if (v.phase === 'show') title = `Watch ${leaderName}'s move on the TV!`;
    else if (v.phase === 'copy') title = v.leader === v.you ? 'They’re copying your move…' : 'Copied! Waiting for the others…';
    else if (v.phase === 'score') {
      title = v.leader === v.you ? 'How did they do?' : `${me?.match ?? 0}% match`;
      lines.push(`+${me?.turnPoints ?? 0}`);
    } else if (v.phase === 'result') {
      title = 'Round over';
      lines.push(`+${(me?.points ?? 0).toLocaleString()} points`);
    } else {
      title = 'Round scores';
      lines.push(`You got +${(me?.gamePoints ?? 0).toLocaleString()} this round. Look at the TV!`);
    }
    infoTitle.textContent = title;
    infoLines.replaceChildren(...lines.map((l) => h('div', {}, l)));
  }

  function clock() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'lead' || view.phase === 'copy' ? `${secs}s` : '';
  }
  const interval = setInterval(clock, 200);

  return {
    update(raw) {
      view = raw as CopyView;
      phaseEndsAt = performance.now() + view.msLeft;
      // Time's up mid-recording: what there is goes.
      if (recording && view.phase !== 'lead' && view.phase !== 'copy') finish();
      render();
      clock();
    },
    destroy() {
      if (recording) clearInterval(recording.timer);
      if (counting) clearTimeout(counting);
      clearInterval(interval);
      root.replaceChildren();
    },
  };
}
