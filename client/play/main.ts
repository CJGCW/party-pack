import { io, type Socket } from 'socket.io-client';
import { MAX_NAME_LENGTH, MAX_PUZZLES, MAX_ROUNDS, MIN_PUZZLES, MIN_ROUNDS, type ClientToServerEvents, type RoomState, type ServerToClientEvents } from '../../shared/protocol';
import { TOSS_UP } from '../../shared/games/tossUp';
import { WORDLE_RACE } from '../../shared/games/wordleRace';
import { h } from './dom';
import { createTossUp } from './games/tossUp';
import { createWordleRace } from './games/wordleRace';

/** A mini game's phone UI. */
export interface Controller {
  update(view: unknown): void;
  destroy(): void;
}
type ControllerFactory = (root: HTMLElement, send: (input: unknown) => void) => Controller;

/** Phone UI for each mini game, keyed by game id. Add new games here. */
const CONTROLLERS: Record<string, ControllerFactory> = {
  [WORDLE_RACE.id]: createWordleRace,
  [TOSS_UP.id]: createTossUp,
};

const SESSION_KEY = 'party-pack-session';
const JOINED_KEY = 'party-pack-joined';

const app = document.getElementById('app')!;
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();

// crypto.randomUUID isn't available on plain-http LAN pages, so roll our own id.
const sessionId =
  localStorage.getItem(SESSION_KEY) ??
  (() => {
    const id = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
    localStorage.setItem(SESSION_KEY, id);
    return id;
  })();

let joined: { code: string; name: string } | null = JSON.parse(localStorage.getItem(JOINED_KEY) ?? 'null');
let playerId: string | null = null;
let room: RoomState | null = null;
let controller: { gameId: string; instance: Controller } | null = null;
let pendingView: unknown = null;

function join(code: string, name: string, onError: (msg: string) => void) {
  socket.emit('player:join', { code, name, sessionId }, (res) => {
    if (!res.ok) {
      joined = null;
      localStorage.removeItem(JOINED_KEY);
      onError(res.error);
      return;
    }
    playerId = res.playerId;
    joined = { code: code.toUpperCase(), name };
    localStorage.setItem(JOINED_KEY, JSON.stringify(joined));
    // The room state usually arrives before this ack, when we didn't know our id yet.
    render();
  });
}

socket.on('connect', () => {
  // Rejoin automatically after a refresh, a dropped connection or the phone sleeping.
  if (joined) join(joined.code, joined.name, () => renderJoin());
  else renderJoin();
});

socket.on('room:state', (state) => {
  room = state;
  render();
});

socket.on('game:player', (view) => {
  if (controller) controller.instance.update(view);
  else pendingView = view;
});

socket.on('room:closed', (reason) => {
  joined = null;
  playerId = null;
  room = null;
  localStorage.removeItem(JOINED_KEY);
  renderJoin(reason);
});

// Drop the game UI while offline; it's rebuilt from the server's view after rejoining,
// so a guess that was in flight can't leave the controller stuck waiting.
socket.on('disconnect', () => {
  controller?.instance.destroy();
  controller = null;
  room = null;
  if (joined) app.replaceChildren(h('div', { class: 'center' }, h('h2', {}, 'Reconnecting…')));
});

// The server won't let two tabs play as the same player. The newest one wins.
socket.on('player:replaced', () => {
  socket.disconnect();
  app.replaceChildren(
    h(
      'div',
      { class: 'center' },
      h('h2', {}, "You're playing in another tab"),
      h('p', {}, 'Only one tab can control your player at a time.'),
      h('button', { onclick: () => socket.connect() }, 'Play here instead'),
    ),
  );
});

function me() {
  return room?.players.find((p) => p.id === playerId);
}

function render() {
  const player = me();
  if (!room || !player) return;
  document.documentElement.style.setProperty('--player', player.color);

  if (room.phase === 'game' && room.gameId && CONTROLLERS[room.gameId]) {
    if (controller?.gameId === room.gameId) return;
    controller?.instance.destroy();
    app.replaceChildren();
    const instance = CONTROLLERS[room.gameId](app, (input) => socket.emit('game:input', input));
    controller = { gameId: room.gameId, instance };
    if (pendingView) instance.update(pendingView);
    pendingView = null;
    return;
  }

  controller?.instance.destroy();
  controller = null;
  if (room.phase === 'spinning') renderSpinning();
  else if (room.phase === 'standings') renderStandings();
  else if (room.phase === 'results') renderResults();
  else renderLobby();
}

function renderJoin(error = '') {
  controller?.instance.destroy();
  controller = null;
  const params = new URLSearchParams(location.search);
  const codeInput = h('input', {
    id: 'code',
    maxlength: '4',
    autocomplete: 'off',
    autocapitalize: 'characters',
    placeholder: 'ABCD',
    value: params.get('code') ?? joined?.code ?? '',
  });
  const nameInput = h('input', {
    id: 'name',
    maxlength: String(MAX_NAME_LENGTH),
    autocomplete: 'off',
    autocapitalize: 'characters',
    placeholder: 'YOUR NAME',
    value: localStorage.getItem('party-pack-name') ?? '',
  });
  const errorEl = h('div', { class: 'error' }, error);
  const button = h('button', { type: 'submit' }, 'Play');

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        localStorage.setItem('party-pack-name', name);
        button.disabled = true;
        errorEl.textContent = '';
        join(codeInput.value.trim(), name, (msg) => {
          errorEl.textContent = msg;
          button.disabled = false;
        });
      },
    },
    h('label', { for: 'code' }, 'ROOM CODE'),
    codeInput,
    h('label', { for: 'name' }, 'NAME'),
    nameInput,
    button,
    errorEl,
  );

  app.replaceChildren(h('h1', {}, 'PARTY PACK'), h('p', {}, 'Enter the code shown on the TV'), form);
  (codeInput.value ? nameInput : codeInput).focus();
}

let spinTimer: ReturnType<typeof setTimeout> | null = null;

function renderLobby() {
  const player = me()!;
  const children: (Node | string)[] = [
    h('div', { class: 'badge' }, player.name),
    h('h2', {}, "You're in!"),
  ];
  if (room!.debugMode) children.push(...debugGamePicker(player.isVip));
  else children.push(...wheelSettings(player.isVip));
  app.replaceChildren(h('div', { class: 'center' }, ...children));
}

/** Normal mode: the VIP chooses what's on the wheel and how many rounds, then spins. */
function wheelSettings(isVip: boolean): Node[] {
  const { settings, wheelEntries } = room!;
  const errorEl = h('div', { class: 'error' });
  const save = (next: typeof settings) =>
    socket.emit('room:updateSettings', next, (res) => {
      if (!res.ok) errorEl.textContent = res.error;
    });

  const toggles = wheelEntries.map((entry) => {
    const on = settings.enabled.includes(entry.id);
    return h(
      'button',
      {
        class: `toggle${on ? ' on' : ''}`,
        disabled: !isVip,
        onclick: () => {
          const enabled = on ? settings.enabled.filter((id) => id !== entry.id) : [...settings.enabled, entry.id];
          save({ ...settings, enabled });
        },
      },
      h('span', { class: 'check' }, on ? '✓' : ''),
      entry.label,
    );
  });

  /** − value + control; only the VIP can press it. */
  const stepper = (value: number, min: number, max: number, unit: string, set: (n: number) => void) =>
    h(
      'div',
      { class: 'stepper' },
      h('button', { class: 'secondary', disabled: !isVip || value <= min, onclick: () => set(value - 1) }, '−'),
      h('div', { class: 'stepper-value' }, `${value} ${value === 1 ? unit : `${unit}s`}`),
      h('button', { class: 'secondary', disabled: !isVip || value >= max, onclick: () => set(value + 1) }, '+'),
    );

  const card = h(
    'div',
    { class: 'game-card' },
    h('h2', {}, 'Games on the wheel'),
    ...toggles,
    h('h2', {}, 'Rounds'),
    h('div', { class: 'muted' }, 'The wheel spins once per round.'),
    stepper(settings.rounds, MIN_ROUNDS, MAX_ROUNDS, 'round', (rounds) => save({ ...settings, rounds })),
    h('h2', {}, 'Puzzles per round'),
    h('div', { class: 'muted' }, 'Puzzles in Letter Drop, words in Word Rush.'),
    stepper(settings.puzzlesPerRound, MIN_PUZZLES, MAX_PUZZLES, 'puzzle', (puzzlesPerRound) =>
      save({ ...settings, puzzlesPerRound }),
    ),
  );

  if (!isVip) return [card, h('p', {}, 'Waiting for the VIP to spin the wheel…')];
  const spin = h(
    'button',
    {
      class: 'spin-button',
      onclick: () =>
        socket.emit('room:startSession', (res) => {
          if (!res.ok) errorEl.textContent = res.error;
        }),
    },
    'Spin the wheel!',
  );
  return [h('p', {}, "You're the VIP. Choose the games and rounds:"), card, spin, errorEl];
}

function renderSpinning() {
  const spin = room!.spin!;
  const session = room!.session;
  const status = h('h2', {}, 'Spinning the wheel…');
  app.replaceChildren(
    h(
      'div',
      { class: 'center' },
      session ? h('p', {}, `Round ${session.round} of ${session.totalRounds}`) : '',
      h('div', { class: 'spin-emoji' }, '🎡'),
      status,
      h('p', {}, 'Watch the TV!'),
    ),
  );
  // Only reveal the game once the wheel on the TV has stopped.
  if (spinTimer) clearTimeout(spinTimer);
  spinTimer = setTimeout(() => {
    status.textContent = `Next up: ${spin.entries[spin.targetIndex].label}`;
  }, spin.stopsInMs);
}

function renderStandings() {
  const { standings, session } = room!;
  const player = me()!;
  const ranked = [...room!.players].sort((a, b) => b.score - a.score);
  const place = ranked.findIndex((p) => p.id === playerId) + 1;
  const gained = player.score - (standings?.previousScores[player.id] ?? 0);
  app.replaceChildren(
    h(
      'div',
      { class: 'center' },
      h('h2', {}, session ? `Standings after round ${session.round} of ${session.totalRounds}` : 'Standings'),
      h('div', { class: 'big-place' }, `${place}${ordinalSuffix(place)} place`),
      h('div', { class: 'badge' }, `${player.score.toLocaleString()} pts`),
      h('p', {}, gained > 0 ? `+${gained.toLocaleString()} this round` : 'No points this round'),
      h('p', {}, 'Watch the TV!'),
    ),
  );
}

function renderResults() {
  const standings = [...room!.players].sort((a, b) => b.score - a.score);
  const place = standings.findIndex((p) => p.id === playerId) + 1;
  const player = me()!;
  app.replaceChildren(
    h(
      'div',
      { class: 'center' },
      h('h2', {}, 'Final results'),
      h('div', { class: 'big-place' }, place === 1 ? '🏆 1st!' : `${place}${ordinalSuffix(place)} place`),
      h('div', { class: 'badge' }, `${player.score.toLocaleString()} pts`),
      h('p', {}, 'Back to the lobby soon…'),
    ),
  );
}

function ordinalSuffix(n: number) {
  return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
}

/** Debug mode: the VIP starts one specific game, the way the lobby used to work. */
function debugGamePicker(isVip: boolean): Node[] {
  const children: Node[] = [];
  if (isVip) {
    const errorEl = h('div', { class: 'error' });
    children.push(h('p', {}, "DEBUG MODE · You're the VIP. Pick a game:"));
    for (const game of room!.games) {
      const modeButtons = game.modes.map((mode, i) =>
        h(
          'button',
          {
            class: `mode-button${i > 0 ? ' alt' : ''}`,
            onclick: () =>
              socket.emit('room:startGame', { gameId: game.id, modeId: mode.id }, (res) => {
                if (!res.ok) errorEl.textContent = res.error;
              }),
          },
          h('span', {}, mode.name),
          h('small', {}, mode.description),
        ),
      );
      children.push(
        h('div', { class: 'game-card' }, h('h2', {}, game.name), h('div', { class: 'muted' }, game.description), ...modeButtons),
      );
    }
    children.push(errorEl);
  } else {
    children.push(h('p', {}, 'Waiting for the VIP to pick a game…'));
  }
  return children;
}
