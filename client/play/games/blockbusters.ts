import { frameBands, type BlockbustersInput, type BlockbustersPlayerView, type Team } from '../../../shared/games/blockbusters';
import { h } from '../dom';
import type { Controller } from '../main';

const TEAM_NAME: Record<Team, string> = { red: 'RED', white: 'WHITE' };
/** What each team is trying to link. */
const TEAM_GOAL: Record<Team, string> = { red: 'top ↕ bottom', white: 'left ↔ right' };

/**
 * Blockbusters on the phone: the board (tap a letter when it's your team's pick), a buzzer while
 * a question is up, and the choices if you buzzed in first.
 */
export function createBlockbusters(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: BlockbustersPlayerView | null = null;
  let phaseEndsAt = 0;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const teamEl = h('span', { class: 'bb-team' });
  const boardEl = h('div', { class: 'bb-board' });
  const letterEl = h('div', { class: 'bb-letter' });
  const questionEl = h('div', { class: 'tv-question' });
  /** Read so far, and the rest kept invisible so the text doesn't jump around as it grows. */
  const readEl = h('span');
  const unreadEl = h('span', { class: 'bb-unread' });
  questionEl.append(readEl, unreadEl);
  let viewAt = 0;
  const buzzBtn = h('button', { class: 'bb-buzz', type: 'button' }, 'BUZZ');
  const inputEl = h('input', { class: 'pe-input', type: 'text', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'send', maxlength: '80', placeholder: 'Your answer' });
  const answerForm = h(
    'form',
    {
      class: 'pe-form',
      onsubmit: (e) => {
        e.preventDefault();
        const text = inputEl.value.trim();
        if (!text || view?.phase !== 'answer' || !view.isBuzzer) return;
        send({ type: 'answer', text } satisfies BlockbustersInput);
        inputEl.value = '';
      },
    },
    inputEl,
    h('button', { type: 'submit' }, 'Answer'),
  );
  const statusEl = h('div', { class: 'tu-status' });
  root.append(h('div', { class: 'bb' }, h('div', { class: 'wr-top' }, headerEl, timerEl, teamEl), boardEl, letterEl, questionEl, buzzBtn, answerForm, statusEl));

  boardEl.addEventListener('pointerdown', (e) => {
    const hex = (e.target as HTMLElement).closest<HTMLElement>('.bb-hex.pickable');
    if (!hex || !canPick()) return;
    e.preventDefault();
    send({ type: 'pick', index: Number(hex.dataset.index) } satisfies BlockbustersInput);
  });
  buzzBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (canBuzz()) send({ type: 'buzz' } satisfies BlockbustersInput);
  });

  const canPick = () => view?.phase === 'pick' && view.myTeam === view.control;
  const canBuzz = () => view?.phase === 'question' && !!view.myTeam && !view.lockedOut.includes(view.myTeam);

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `tu-status ${kind}`;
  }

  /** Flat-topped hexagons in columns, odd columns half a hexagon lower, sized to the phone. */
  /**
   * Like the show: Red's bands top and bottom, White's down the sides (meeting on the corner
   * diagonals) fill the notches round the outer hexagons; between hexagons the lines are dark.
   */
  function renderBoard(v: BlockbustersPlayerView) {
    const padRatio = 0.42;
    const width = Math.min(window.innerWidth, 520) - 40;
    const r = width / (1.5 * v.cols + 0.5 + padRatio * 2);
    const pad = r * padRatio;
    const hexH = Math.sqrt(3) * r;
    const height = hexH * (v.rows + 0.5) + pad * 2;
    boardEl.style.width = `${width}px`;
    boardEl.style.height = `${height}px`;
    const bands = frameBands(width, height);
    const pickable = canPick();
    const place = (el: HTMLElement, i: number) => {
      const col = i % v.cols;
      const row = Math.floor(i / v.cols);
      el.style.cssText = `left:${pad + col * 1.5 * r}px;top:${pad + row * hexH + (col % 2 ? hexH / 2 : 0)}px;width:${2 * r}px;height:${hexH}px;font-size:${r * 0.8}px`;
      return el;
    };
    boardEl.replaceChildren(
      ...(['top', 'bottom', 'left', 'right'] as const).map((side) => {
        const band = h('div', { class: `bb-band ${side}` });
        band.style.clipPath = `polygon(${bands[side].map(([x, y]) => `${x}px ${y}px`).join(', ')})`;
        return band;
      }),
      ...v.hexes.map((_, i) => place(h('div', { class: 'bb-hex-back' }), i)),
      ...v.hexes.map((hex, i) => {
        const cls = ['bb-hex'];
        if (hex.owner) cls.push(hex.owner);
        else if (pickable) cls.push('pickable');
        if (i === v.current && !hex.owner) cls.push('current');
        if (v.winningPath.includes(i)) cls.push('path');
        const el = place(h('div', { class: cls.join(' ') }, hex.letter), i);
        el.dataset.index = String(i);
        return el;
      }),
    );
  }

  function render() {
    if (!view) return;
    const v = view;
    const amBuzzer = v.isBuzzer;
    headerEl.textContent = `Board ${v.board}/${v.totalBoards}`;
    teamEl.textContent = v.myTeam ? `${TEAM_NAME[v.myTeam]} ${v.myTeam === 'red' ? '↕' : '↔'}` : 'Watching';
    teamEl.className = `bb-team ${v.myTeam ?? ''}`;

    const asking = v.phase === 'question' || v.phase === 'answer' || v.phase === 'result';
    renderBoard(v);
    boardEl.hidden = v.phase === 'question' || v.phase === 'answer' || v.phase === 'gameEnd';
    const letter = v.current !== null ? v.hexes[v.current].letter : '';
    letterEl.hidden = !asking;
    letterEl.textContent = letter;
    questionEl.hidden = !asking || !v.question;
    showQuestion();
    buzzBtn.hidden = v.phase !== 'question' || !v.myTeam;
    buzzBtn.disabled = !canBuzz();

    // The buzzer types their answer; keep the keyboard up.
    const typing = v.phase === 'answer' && amBuzzer;
    answerForm.hidden = !typing;
    if (typing && document.activeElement !== inputEl) inputEl.focus();
    if (!typing) inputEl.value = '';

    const mine = v.myTeam;
    switch (v.phase) {
      case 'pick':
        if (!mine) setStatus(`${TEAM_NAME[v.control]} is choosing a letter…`);
        else if (mine === v.control) setStatus(`Your team's pick: tap a letter. Link ${TEAM_GOAL[mine]}!`, 'good');
        else setStatus(`${TEAM_NAME[v.control]} is choosing a letter…`);
        break;
      case 'question':
        if (!mine) setStatus('Buzz in if you know it!');
        else if (v.lockedOut.includes(mine)) setStatus('Your team missed this one. Over to the others…', 'bad');
        else setStatus(v.lockedOut.length ? 'The other team missed it. Your chance: buzz!' : 'Know it? Buzz in!');
        break;
      case 'answer':
        if (amBuzzer) setStatus(`Type your answer: it starts with ${letter}.`, 'good');
        else setStatus(`${v.buzzer?.name} (${TEAM_NAME[v.buzzer!.team]}) buzzed in…`);
        break;
      case 'result':
        if (v.correct === null && !v.buzzer) setStatus(`Nobody got it. It was ${v.answer}.`, 'bad');
        else if (v.correct) setStatus(`${v.buzzer?.name} got it: ${v.answer}! ${TEAM_NAME[v.buzzer!.team]} takes ${letter}.`, 'good');
        else setStatus(`${v.buzzer?.name} ${v.guess ? `said "${v.guess}"` : 'ran out of time'}: not it.`, 'bad');
        break;
      case 'boardEnd':
        if (!v.winner) setStatus('The board is full: no winner this time.');
        else setStatus(v.winner === mine ? `Your team linked ${TEAM_GOAL[v.winner]}! You win the board.` : `${TEAM_NAME[v.winner]} wins the board.`, v.winner === mine ? 'good' : 'bad');
        break;
      case 'gameEnd':
        setStatus(`Round scores: you got +${v.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
        break;
    }
  }

  /** The question as far as it's been read, carrying on locally while it's being read. */
  function showQuestion() {
    const v = view;
    if (!v?.question) return;
    const read = v.reading ? Math.min(v.question.length, v.revealed + Math.floor((performance.now() - viewAt) / v.charMs)) : v.revealed;
    readEl.textContent = v.question.slice(0, read);
    unreadEl.textContent = v.question.slice(read);
  }
  const reader = setInterval(() => view?.reading && showQuestion(), 30);

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    const timed = ['pick', 'question', 'answer'].includes(view.phase);
    timerEl.textContent = timed ? `${secs}s` : '';
    timerEl.classList.toggle('low', timed && secs <= 3);
  }
  const interval = setInterval(tick, 200);

  return {
    update(raw) {
      view = raw as BlockbustersPlayerView;
      viewAt = performance.now();
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      clearInterval(reader);
      root.replaceChildren();
    },
  };
}
