import { PICK_POINTS, type PickInput, type PickPlayerView } from '../../../shared/games/pickEm';
import { h } from '../dom';
import type { Controller } from '../main';

export function createPickEm(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: PickPlayerView | null = null;
  let phaseEndsAt = 0;
  let questionKey = '';
  /** Options toggled on, before locking in. */
  let selected = new Set<number>();
  /** Sent but not yet confirmed by the server, so the tap feels instant. */
  let pendingLock: number[] | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const topicEl = h('div', { class: 'tu-category' });
  const questionEl = h('div', { class: 'tv-question' });
  const hintEl = h('div', { class: 'tv-multi' }, `Pick all that apply · ±${PICK_POINTS} each`);
  const gridEl = h('div', { class: 'pe-grid' });
  const statusEl = h('div', { class: 'tu-status' });
  const lockBtn = h('button', { class: 'tv-lock', type: 'button' }, 'Lock in');

  root.append(
    h('div', { class: 'tv' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), topicEl, questionEl, hintEl, gridEl, statusEl, lockBtn),
  );

  const locked = () => (view && view.myPicks.length > 0 ? view.myPicks : (pendingLock ?? []));
  const canPick = () => view?.phase === 'answering' && locked().length === 0;

  gridEl.addEventListener('pointerdown', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.pe-option');
    if (!btn || !canPick()) return;
    e.preventDefault();
    const i = Number(btn.dataset.index);
    if (selected.has(i)) selected.delete(i);
    else selected.add(i);
    render();
  });

  lockBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!canPick() || selected.size === 0) return;
    pendingLock = [...selected].sort((a, b) => a - b);
    send({ type: 'answer', indices: pendingLock } satisfies PickInput);
    render();
  });

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `tu-status ${kind}`;
  }

  function render() {
    if (!view) return;
    const v = view;
    const key = `${v.questionNumber}|${v.question}`;
    if (key !== questionKey) {
      questionKey = key;
      selected = new Set();
      pendingLock = null;
    }
    headerEl.textContent = `List ${v.questionNumber}/${v.totalQuestions}`;
    scoreEl.textContent = `${v.score.toLocaleString()} pts`;
    topicEl.textContent = v.topic;
    questionEl.textContent = v.question;
    hintEl.hidden = v.phase === 'gameEnd';

    const mine = locked();
    const picked = mine.length > 0 ? mine : [...selected];
    const revealing = v.phase === 'reveal' || v.phase === 'gameEnd';
    const correct = v.correctIndices ?? [];
    gridEl.hidden = v.phase === 'gameEnd' || v.options.length === 0;
    gridEl.replaceChildren(
      ...v.options.map((o, i) => {
        const isPicked = picked.includes(i);
        const isRight = correct.includes(i);
        let cls = 'pe-option';
        if (revealing) cls += isRight ? (isPicked ? ' right' : ' missed') : isPicked ? ' wrong' : ' dimmed';
        else if (isPicked) cls += ' picked';
        const btn = h('button', { class: cls, type: 'button' }, o);
        btn.dataset.index = String(i);
        return btn;
      }),
    );
    lockBtn.hidden = v.phase !== 'answering' || mine.length > 0;
    lockBtn.disabled = selected.size === 0;
    lockBtn.textContent = selected.size > 0 ? `Lock in ${selected.size}` : 'Lock in';

    switch (v.phase) {
      case 'question':
        setStatus('Read the question… the list is coming!');
        break;
      case 'answering':
        if (mine.length > 0) setStatus('Locked in! Waiting for everyone…');
        else setStatus('Tap every right answer, then lock in.');
        break;
      case 'reveal': {
        const missed = correct.filter((i) => !v.myPicks.includes(i)).length;
        if (v.myPicks.length === 0) setStatus(`Out of time. There were ${correct.length} right answers.`, 'bad');
        else
          setStatus(
            `${v.right} right, ${v.wrong} wrong${missed ? `, ${missed} missed` : ''}: ${v.points > 0 ? `+${v.points}` : 'no points'}`,
            v.points > 0 ? 'good' : 'bad',
          );
        break;
      }
      case 'gameEnd':
        setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
        break;
    }
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = view.phase === 'answering' ? `${secs}s` : '';
    timerEl.classList.toggle('low', view.phase === 'answering' && secs <= 5);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as PickPlayerView;
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
