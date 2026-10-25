import { BOARD_COLS, MAX_CLUE_NUMBER, type CrewInput, type CrewPlayerView } from '../../../shared/games/clueCrew';
import { h } from '../dom';
import type { Controller } from '../main';

/**
 * Clue Crew on the phone: the board with your secret key (your targets and traps),
 * a clue box when it's your turn to give one, and voting when it's someone else's.
 */
export function createClueCrew(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: CrewPlayerView | null = null;
  let phaseEndsAt = 0;
  let number = 1;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const scoreEl = h('span');
  const turnEl = h('div', { class: 'cc-turn' });
  const boardEl = h('div', { class: 'cc-board' });
  const statusEl = h('div', { class: 'tu-status' });
  const legendEl = h('div', { class: 'cc-legend' }, h('span', { class: 'cc-dot target' }), 'Your targets', h('span', { class: 'cc-dot trap' }), 'Your traps');

  // The clue-giver's form: a word and a number.
  const clueInput = h('input', { class: 'cc-input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', maxlength: '20', placeholder: 'One-word clue' });
  const numberEl = h('div', { class: 'stepper-value' });
  const minus = h('button', { class: 'secondary', type: 'button' }, '−');
  const plus = h('button', { class: 'secondary', type: 'button' }, '+');
  minus.addEventListener('click', () => {
    number = Math.max(1, number - 1);
    render();
  });
  plus.addEventListener('click', () => {
    number = Math.min(MAX_CLUE_NUMBER, number + 1);
    render();
  });
  const giveBtn = h('button', { type: 'submit', class: 'cc-give' }, 'Give clue');
  const clueForm = h(
    'form',
    {
      class: 'cc-form',
      onsubmit: (e) => {
        e.preventDefault();
        const word = clueInput.value.trim();
        if (!word) return;
        send({ type: 'clue', word, number } satisfies CrewInput);
      },
    },
    clueInput,
    h('div', { class: 'stepper' }, minus, numberEl, plus),
    giveBtn,
  );
  const stopBtn = h('button', { class: 'secondary cc-stop', type: 'button' }, 'Stop guessing');
  stopBtn.addEventListener('click', () => {
    if (view?.phase === 'guess' && !view.isGiver) send({ type: 'stop' } satisfies CrewInput);
  });

  boardEl.style.gridTemplateColumns = `repeat(${BOARD_COLS}, 1fr)`;
  boardEl.addEventListener('pointerdown', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.cc-card');
    if (!card || !view || view.phase !== 'guess' || view.isGiver) return;
    const index = Number(card.dataset.index);
    if (view.cards[index].found) return;
    e.preventDefault();
    send({ type: 'vote', index } satisfies CrewInput);
  });

  root.append(
    h('div', { class: 'cc' }, h('div', { class: 'wr-top' }, headerEl, timerEl, scoreEl), turnEl, boardEl, legendEl, statusEl, clueForm, stopBtn),
  );

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `tu-status ${kind}`;
  }

  let lastTurnKey = '';

  function render() {
    if (!view) return;
    const v = view;
    // A new turn: clear the clue box.
    const turnKey = `${v.round}|${v.turn}`;
    if (turnKey !== lastTurnKey) {
      lastTurnKey = turnKey;
      clueInput.value = '';
      number = 1;
    }
    headerEl.textContent = `Round ${v.round}/${v.totalRounds}`;
    scoreEl.textContent = `${v.found}/${v.totalTargets} found`;

    turnEl.replaceChildren(
      h('span', { class: 'cc-giver' }, v.isGiver ? 'Your clue' : `${v.giverName}'s clue`),
      v.clue
        ? h('span', { class: 'cc-clue' }, `${v.clue.word} · ${v.clue.number}`)
        : h('span', { class: 'cc-waiting' }, v.isGiver ? 'Your turn to give one' : 'Thinking…'),
    );

    const voting = v.phase === 'guess' && !v.isGiver;
    boardEl.replaceChildren(
      ...v.cards.map((c, i) => {
        const kind = v.key[i];
        const lastPick = v.last?.index === i && v.phase === 'result';
        const cls = ['cc-card'];
        if (c.found) cls.push('found');
        else if (kind === 'target') cls.push('target');
        else if (kind === 'trap') cls.push('trap');
        if (voting && v.myVote === i) cls.push('voted');
        if (lastPick) cls.push(`picked-${v.last!.kind}`);
        const card = h('div', { class: cls.join(' ') }, h('span', { class: 'cc-word' }, c.word));
        if (v.phase === 'guess' && v.voteCounts[i] > 0) card.append(h('span', { class: 'cc-votes' }, String(v.voteCounts[i])));
        card.dataset.index = String(i);
        return card;
      }),
    );

    clueForm.hidden = !(v.phase === 'clue' && v.isGiver);
    numberEl.textContent = String(number);
    minus.disabled = number <= 1;
    plus.disabled = number >= MAX_CLUE_NUMBER;
    stopBtn.hidden = !voting;
    stopBtn.classList.toggle('voted', v.myVote === 'stop');

    switch (v.phase) {
      case 'clue':
        if (v.isGiver) setStatus(v.clueError ?? `Give a clue for your green words (${v.myTargetsLeft} left), and how many it's for. Steer clear of your red traps!`, v.clueError ? 'bad' : '');
        else setStatus(`${v.giverName} is thinking of a clue…`);
        break;
      case 'guess':
        if (v.isGiver) setStatus(`The others are guessing. ${v.guessesLeft} guess${v.guessesLeft === 1 ? '' : 'es'} left.`);
        else if (v.myVote !== null) setStatus('Vote in. Tap another word to change it.');
        else setStatus(`Tap the word you think ${v.giverName} means, or stop. ${v.guessesLeft} guess${v.guessesLeft === 1 ? '' : 'es'} left.`);
        break;
      case 'result': {
        const word = v.last?.index != null ? v.cards[v.last.index].word : '';
        if (v.last?.kind === 'target') setStatus(`${word}: found!`, 'good');
        else if (v.last?.kind === 'trap') setStatus(`${word} was one of ${v.isGiver ? 'your' : `${v.giverName}'s`} traps.`, 'bad');
        else if (v.last?.kind === 'neutral') setStatus(`${word} isn't one of ${v.isGiver ? 'your' : `${v.giverName}'s`} words. Turn over.`, 'bad');
        else setStatus('The team stopped. Next clue.');
        break;
      }
      case 'gameEnd':
        if (v.outcome === 'complete') setStatus(`Every word found! +${v.gamePoints.toLocaleString()} this round`, 'good');
        else if (v.outcome === 'trap') setStatus(`A trap ended it. +${v.gamePoints.toLocaleString()} this round`, 'bad');
        else setStatus(`Out of turns with ${v.totalTargets - v.found} to go. +${v.gamePoints.toLocaleString()} this round`, 'bad');
        break;
    }
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    const timed = view.phase === 'clue' || view.phase === 'guess';
    timerEl.textContent = timed ? `${secs}s` : '';
    timerEl.classList.toggle('low', timed && secs <= 10);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as CrewPlayerView;
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
