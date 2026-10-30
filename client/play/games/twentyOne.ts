import { cardLabel, parseCard } from '../../../shared/cards';
import { TARGET, totalLabel, type TwentyOneInput, type TwentyOnePlayerView, type TwentyOneSeat } from '../../../shared/games/twentyOne';
import { cardElement } from '../cards';
import { h } from '../dom';
import type { Controller } from '../main';

/** Twenty-One on the phone: your hand (the face-down card marked), Draw / Hold on your turn, and the table. */
export function createTwentyOne(root: HTMLElement, send: (input: unknown) => void): Controller {
  let view: TwentyOnePlayerView | null = null;
  let phaseEndsAt = 0;
  let myId: string | null = null;

  const headerEl = h('span');
  const timerEl = h('span', { class: 'wr-timer' });
  const totalEl = h('span');
  const handEl = h('div', { class: 'pcard-hand to-hand' });
  const noteEl = h('div', { class: 'to-note' }, 'The outlined card is face down: only you can see it.');
  const statusEl = h('div', { class: 'tu-status' });
  const drawBtn = h('button', {}, 'Draw') as HTMLButtonElement;
  const holdBtn = h('button', { class: 'secondary' }, 'Hold') as HTMLButtonElement;
  const buttonsEl = h('div', { class: 'to-buttons' }, drawBtn, holdBtn);
  const tableEl = h('div', { class: 'to-table' });
  root.append(h('div', { class: 'to' }, h('div', { class: 'wr-top' }, headerEl, timerEl, totalEl), handEl, noteEl, statusEl, buttonsEl, tableEl));

  const act = (type: TwentyOneInput['type']) => {
    if (!myTurn()) return;
    drawBtn.disabled = holdBtn.disabled = true;
    send({ type } satisfies TwentyOneInput);
  };
  drawBtn.addEventListener('click', () => act('draw'));
  holdBtn.addEventListener('click', () => act('hold'));

  /** Your seat: the one whose hole cards you were sent. */
  function mySeat(v: TwentyOnePlayerView): TwentyOneSeat | null {
    return v.seats.find((s) => s.id === myId) ?? null;
  }

  function myTurn() {
    return !!view && view.phase === 'playing' && view.turn !== null && view.turn === myId;
  }

  function setStatus(text: string, kind: '' | 'good' | 'bad' = '') {
    statusEl.textContent = text;
    statusEl.className = `tu-status ${kind}`;
  }

  const nameOf = (v: TwentyOnePlayerView, id: string | null) => v.seats.find((s) => s.id === id)?.name ?? 'Someone';

  function render() {
    if (!view) return;
    const v = view;
    const seat = mySeat(v);
    headerEl.textContent = `Hand ${v.hand}/${v.totalHands}`;
    totalEl.textContent = v.myTotal ? `Total ${totalLabel(v.myTotal)}` : '';

    // Your hand: the face-down card (outlined), then the face-up ones.
    const width = Math.min(window.innerWidth, 520) - 32;
    const cards = [...(v.myHole ? [v.myHole] : []), ...(seat?.up ?? [])];
    handEl.style.setProperty('--card-w', `${Math.floor(Math.min(110, width / Math.max(3, cards.length * 0.6 + 0.4)))}px`);
    handEl.replaceChildren(
      ...cards.map((id, i) => {
        const el = cardElement(parseCard(id));
        if (i === 0 && v.myHole && !(v.phase === 'handEnd' || v.phase === 'gameEnd' || seat?.status === 'bust')) el.classList.add('to-hole');
        return el;
      }),
    );
    noteEl.hidden = !v.myHole || v.phase === 'handEnd' || v.phase === 'gameEnd' || seat?.status === 'bust';

    const mine = myTurn();
    buttonsEl.hidden = !mine;
    drawBtn.disabled = holdBtn.disabled = !mine;

    if (!seat) setStatus('Sitting this hand out. Watch the TV!');
    else
      switch (v.phase) {
        case 'dealing':
          setStatus('Dealing… one card face down, one face up.');
          break;
        case 'playing':
          if (mine) setStatus(`Your turn: draw a card face up, or hold at ${v.myTotal!.total}.`, 'good');
          else if (seat.status === 'bust') setStatus(`Bust at ${v.myTotal!.total}. Better luck next hand.`, 'bad');
          else if (seat.status === 'held') setStatus(`You held at ${v.myTotal!.total}. Waiting for ${nameOf(v, v.turn)}…`);
          else setStatus(`${nameOf(v, v.turn)} is deciding…`);
          break;
        case 'handEnd':
          if (seat.winner) setStatus(`You win the hand with ${v.myTotal!.total}! +${seat.handPoints.toLocaleString()}`, 'good');
          else if (seat.status === 'bust') setStatus(`Bust at ${v.myTotal!.total}.`, 'bad');
          else setStatus(`${v.myTotal!.total}: not the closest to ${TARGET}. +${seat.handPoints.toLocaleString()}`);
          break;
        case 'gameEnd':
          setStatus(`Round scores: you got +${seat.gamePoints.toLocaleString()} this round. Look at the TV!`, 'good');
          break;
      }

    // Everyone else, as the TV shows them.
    tableEl.replaceChildren(
      ...v.seats
        .filter((s) => s.id !== myId)
        .map((s) => {
          const cardsText = [s.hole ?? '?', ...s.up].map((id) => (id === '?' ? '🂠' : cardLabel(parseCard(id)!))).join(' ');
          const totalText = s.total ? totalLabel(s.total) : `showing ${totalLabel(s.showing)}`;
          const state = s.status === 'bust' ? 'Bust' : s.winner ? 'Winner' : s.status === 'held' ? 'Held' : v.turn === s.id ? 'Deciding' : '';
          return h(
            'div',
            { class: `to-seat${v.turn === s.id ? ' turn' : ''}${s.status === 'bust' ? ' bust' : ''}` },
            h('span', { class: 'to-dot', style: `background:${s.color}` }),
            h('b', {}, s.name),
            h('span', { class: 'to-cards' }, cardsText),
            h('span', { class: 'to-state' }, [totalText, state].filter(Boolean).join(' · ')),
          );
        }),
    );
  }

  function tick() {
    if (!view) return;
    const secs = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
    timerEl.textContent = myTurn() ? `${secs}s` : '';
    timerEl.classList.toggle('low', myTurn() && secs <= 5);
  }
  const interval = setInterval(tick, 200);
  const onResize = () => render();
  window.addEventListener('resize', onResize);

  return {
    update(raw) {
      view = raw as TwentyOnePlayerView;
      myId = view.you;
      phaseEndsAt = performance.now() + view.msLeft;
      render();
      tick();
    },
    destroy() {
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
      root.replaceChildren();
    },
  };
}
