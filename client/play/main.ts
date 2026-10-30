import { io, type Socket } from 'socket.io-client';
import { ANY_OPTION, MAX_NAME_LENGTH, MAX_PUZZLES, MAX_ROUNDS, MIN_PUZZLES, MIN_ROUNDS, type ClientToServerEvents, type FlaggableQuestion, type GiveUpView, type CallState, type GroupSettings, type RoomState, type PlayStyle, type WheelEntry, type ServerToClientEvents } from '../../shared/protocol';
import { CLUE_CREW } from '../../shared/games/clueCrew';
import { BLOCKBUSTERS } from '../../shared/games/blockbusters';
import { CONCENTRATION } from '../../shared/games/concentration';
import { EXTERNAL, MAX_EXTERNAL_GAMES, parseExternalGames } from '../../shared/games/external';
import { TWENTY_ONE } from '../../shared/games/twentyOne';
import { LONGEST_WORD } from '../../shared/games/longestWord';
import { MAZE_RACE } from '../../shared/games/mazeRace';
import { PEG_DROP } from '../../shared/games/pegDrop';
import { SPIRAL_SHOT } from '../../shared/games/spiralShot';
import { STAR_SPLAT } from '../../shared/games/starSplat';
import { PICK_EM, PICK_EM_COOP } from '../../shared/games/pickEm';
import { RACK_ATTACK } from '../../shared/games/rackAttack';
import { TOSS_UP } from '../../shared/games/tossUp';
import { TRIVIA, TRIVIA_QUEST } from '../../shared/games/trivia';
import { WOOCHAWARE } from '../../shared/games/woochaware';
import { WORDLE_RACE } from '../../shared/games/wordleRace';
import { PHONE_ADDONS } from './addons';
import { h } from './dom';
import { createGiveUpBar } from './giveUp';
import { needsMotionPermission, requestMotionPermission } from './motion';
import { renderServerPicker, serverLabel, serverUrl } from './server';
import { createBlockbusters } from './games/blockbusters';
import { createClueCrew } from './games/clueCrew';
import { createConcentration } from './games/concentration';
import { createExternal } from './games/external';
import { createTwentyOne } from './games/twentyOne';
import { createLongestWord } from './games/longestWord';
import { createMazeRace } from './games/mazeRace';
import { createPegDrop } from './games/pegDrop';
import { createSpiralShot } from './games/spiralShot';
import { createStarSplat } from './games/starSplat';
import { createPickEm } from './games/pickEm';
import { createPickEmCoop } from './games/pickEmCoop';
import { createRackAttack } from './games/rackAttack';
import { createTossUp } from './games/tossUp';
import { createTrivia } from './games/trivia';
import { createWoochaWare } from './games/woochaware';
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
  [TRIVIA.id]: createTrivia,
  [TRIVIA_QUEST.id]: createTrivia,
  [PICK_EM.id]: createPickEm,
  [PICK_EM_COOP.id]: createPickEmCoop,
  [CLUE_CREW.id]: createClueCrew,
  [BLOCKBUSTERS.id]: createBlockbusters,
  [CONCENTRATION.id]: createConcentration,
  [TWENTY_ONE.id]: createTwentyOne,
  [RACK_ATTACK.id]: createRackAttack,
  [LONGEST_WORD.id]: createLongestWord,
  [PEG_DROP.id]: createPegDrop,
  [MAZE_RACE.id]: createMazeRace,
  [SPIRAL_SHOT.id]: createSpiralShot,
  [STAR_SPLAT.id]: createStarSplat,
  [EXTERNAL.id]: createExternal,
  [WOOCHAWARE.id]: createWoochaWare,
};
// Machine-local add-on games (see ./addons).
for (const addOn of PHONE_ADDONS) CONTROLLERS[addOn.gameId] = addOn.create;

const SESSION_KEY = 'party-pack-session';
const JOINED_KEY = 'party-pack-joined';

const app = document.getElementById('app')!;
const server = serverUrl();
// The app connects to the server it's been given; until then it asks for one (see ./server).
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(server ?? '', {
  autoConnect: server !== null,
  // A wrong address in the app should say so soon, not after the default 20 seconds.
  ...(server ? { timeout: 5000 } : {}),
});
if (server === null) renderServerPicker(app);
else if (server) app.replaceChildren(h('div', { class: 'center' }, h('h2', {}, `Connecting to ${serverLabel(server)}…`)));

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
/** `ui` is whose screens are showing: usually the game itself, but a game can hand a question to another's (Trivia mixes in Pick 'Em lists). */
let controller: { gameId: string; ui: string; instance: Controller } | null = null;
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

// The app can't fall back on the page having loaded, so say when the server can't be reached.
// Socket.IO keeps retrying meanwhile, so this clears itself once the server's up.
if (server) {
  socket.on('connect_error', () => {
    if (server && !joined && !document.getElementById('server')) renderServerPicker(app, `Can’t reach ${serverLabel(server)}. Is the server running?`);
  });
}

socket.on('room:state', (state) => {
  room = state;
  render();
  renderFlag();
});

// ---- Flagging questions: in trivia-style games, the VIP can flag the question on screen for review. ----
let flaggable: FlaggableQuestion | null = null;
const flagBox = h('input', { type: 'checkbox' }) as HTMLInputElement;
const flagBar = h('label', { class: 'flag-bar', hidden: true }, flagBox, 'Flag this question');
document.body.append(flagBar);
flagBox.addEventListener('change', () => {
  if (!flaggable) return;
  const wanted = flagBox.checked;
  socket.emit('game:flag', { key: flaggable.key, flagged: wanted }, (res) => {
    // Didn't take (e.g. the next question already came up): show what the server has.
    if (!res.ok) flagBox.checked = !wanted;
  });
});
socket.on('game:flaggable', (question) => {
  flaggable = question;
  renderFlag();
});
/** Shown to the VIP while there's a question to flag. */
function renderFlag() {
  const isVip = !!room?.players.find((p) => p.id === playerId)?.isVip;
  const show = !!flaggable && isVip && room?.phase === 'game';
  flagBar.hidden = !show;
  document.body.classList.toggle('has-flag-bar', show);
  if (flaggable) flagBox.checked = flaggable.flagged;
}

const sendInput = (input: unknown) => socket.emit('game:input', input);
// Trivia and word games: hold down "I give up" to forfeit the puzzle (shown when the game's view allows it).
const giveUpBar = createGiveUpBar(() => socket.emit('game:giveUp'));
const uiFor = (view: unknown, gameId: string) => (view as { asGame?: string } | null)?.asGame ?? gameId;

socket.on('game:player', (view) => {
  giveUpBar.update(view as GiveUpView);
  if (!controller) {
    pendingView = view;
    return;
  }
  const ui = uiFor(view, controller.gameId);
  if (ui !== controller.ui && CONTROLLERS[ui]) {
    controller.instance.destroy();
    app.replaceChildren();
    controller = { ...controller, ui, instance: CONTROLLERS[ui](app, sendInput) };
  }
  controller.instance.update(view);
});

socket.on('room:closed', (reason) => {
  joined = null;
  playerId = null;
  room = null;
  flaggable = null;
  renderFlag();
  localStorage.removeItem(JOINED_KEY);
  giveUpBar.update(null);
  renderJoin(reason);
});

// Drop the game UI while offline; it's rebuilt from the server's view after rejoining,
// so a guess that was in flight can't leave the controller stuck waiting.
socket.on('disconnect', () => {
  giveUpBar.update(null);
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
    const ui = CONTROLLERS[uiFor(pendingView, room.gameId)] ? uiFor(pendingView, room.gameId) : room.gameId;
    const instance = CONTROLLERS[ui](app, sendInput);
    controller = { gameId: room.gameId, ui, instance };
    if (pendingView) instance.update(pendingView);
    pendingView = null;
    return;
  }

  controller?.instance.destroy();
  controller = null;
  giveUpBar.update(null);
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
        // iPhones only share motion sensors after a tap asks; Join is that tap.
        if (needsMotionPermission()) void requestMotionPermission();
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

  app.replaceChildren(
    h('h1', {}, 'PARTY PACK'),
    h('p', {}, 'Enter the code shown on the TV'),
    form,
    ...(server ? [h('button', { class: 'secondary server-link', onclick: () => renderServerPicker(app) }, `Server: ${serverLabel(server)}`)] : []),
  );
  (codeInput.value ? nameInput : codeInput).focus();
}

let spinTimer: ReturnType<typeof setTimeout> | null = null;

function renderLobby() {
  // Don't redraw under the VIP while they're typing the other games (it's saved, and redrawn, when they tap away).
  if (document.activeElement?.classList.contains('ext-input')) return;
  const player = me()!;
  const children: (Node | string)[] = [
    h('div', { class: 'badge' }, player.name),
    h('h2', {}, "You're in!"),
  ];
  // After a refresh the permission has to be asked for again, from a tap (WoochaWare and Peg Drop use it).
  if (needsMotionPermission() && room!.games.some((g) => [WOOCHAWARE.id, PEG_DROP.id, SPIRAL_SHOT.id].includes(g.id))) {
    children.push(
      h(
        'button',
        { class: 'secondary', onclick: () => requestMotionPermission().then(() => render()) },
        'Turn on motion controls',
      ),
    );
  }
  if (room!.woochaDebug) children.push(...microgamePicker(player.isVip));
  else if (room!.debugMode) children.push(...debugGamePicker(player.isVip));
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

  const toggles = wheelEntries.flatMap((entry) => {
    const on = settings.enabled.includes(entry.id);
    // A game whose choices include "Neither" has no toggle: that choice turns it off.
    if (entry.choices?.some((c) => c.canTurnOff)) return [choiceOptions(entry, on, true)];
    const toggle = h(
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
    const options = !on ? null : entry.group ? groupOptions(entry) : entry.choices ? choiceOptions(entry, on, false) : null;
    return options ? [toggle, options] : [toggle];
  });

  /**
   * A game's lobby choices (e.g. Easy / Hard / Both): a row of buttons each. With
   * `titled`, it stands in for the toggle, so it has the game's name, and a row with "Neither"
   * turns the game off (hiding the rows after it); picking anything else turns it back on.
   */
  function choiceOptions(entry: WheelEntry, on: boolean, titled: boolean) {
    const values = settings.choices[entry.id] ?? {};
    const choose = (choiceId: string, value: string) =>
      save({
        ...settings,
        enabled: on ? settings.enabled : [...settings.enabled, entry.id],
        choices: { ...settings.choices, [entry.id]: { ...values, [choiceId]: value } },
      });
    const turnOff = () => save({ ...settings, enabled: settings.enabled.filter((id) => id !== entry.id) });
    const button = (label: string, chosen: boolean, onclick: () => void) => h('button', { class: chosen ? 'on' : '', disabled: !isVip, onclick }, label);
    const rows: Node[] = [];
    for (const choice of entry.choices ?? []) {
      const value = values[choice.id] ?? ANY_OPTION;
      const two = choice.options.length === 2;
      if (choice.label) rows.push(h('div', { class: 'muted choice-label' }, choice.label));
      rows.push(
        h(
          'div',
          { class: 'segmented' },
          ...choice.options.map((o) => button(o.label, on && value === o.id, () => choose(choice.id, o.id))),
          !choice.noAny && button(two ? 'Both' : 'Any', on && value === ANY_OPTION, () => choose(choice.id, ANY_OPTION)),
          !!choice.canTurnOff && button(two ? 'Neither' : 'None', !on, turnOff),
        ),
      );
      if (choice.canTurnOff && !on) break;
    }
    return h(
      'div',
      { class: `group-options${titled ? ' titled' : ''}${on ? '' : ' off'}` },
      titled && h('div', { class: 'choice-title' }, entry.label),
      !!entry.afterRounds && h('div', { class: 'muted' }, 'Not on the wheel: played after every round.'),
      ...rows,
    );
  }

  /** Under a group's toggle (e.g. Trivia): competitive, co-op or both, and which topics if there's a choice. */
  function groupOptions(entry: WheelEntry) {
    const current = settings.groups[entry.id];
    const { style, topics, formats } = current;
    const modes = entry.group?.topics ?? [];
    const fmts = entry.group?.formats ?? [];
    const set = (next: Partial<GroupSettings>) => save({ ...settings, groups: { ...settings.groups, [entry.id]: { ...current, ...next } } });
    /** A row of on/off chips for a list of ids. */
    const chips = (items: { id: string; label: string }[], on: string[], key: 'topics' | 'formats') =>
      h(
        'div',
        { class: 'chips' },
        ...items.map((item) => {
          const chosen = on.includes(item.id);
          return h(
            'button',
            {
              class: `chip${chosen ? ' on' : ''}`,
              disabled: !isVip,
              onclick: () => set({ [key]: chosen ? on.filter((t) => t !== item.id) : [...on, item.id] }),
            },
            item.label,
          );
        }),
      );
    const styles: [PlayStyle, string][] = [['competitive', 'Competitive'], ['coop', 'Co-op'], ['both', 'Both']];
    // Only games with a co-op version get the competitive/co-op choice.
    const hasCoop = fmts.some((f) => f.coop !== f.competitive);
    if (!hasCoop && modes.length < 2 && fmts.length < 2) return null;
    return h(
      'div',
      { class: 'group-options' },
      hasCoop &&
      h(
        'div',
        { class: 'segmented' },
        ...styles.map(([id, label]) =>
          h(
            'button',
            {
              class: id === style ? 'on' : '',
              disabled: !isVip,
              onclick: () => set({ style: id }),
            },
            label,
          ),
        ),
      ),
      // Topics and formats only when there's a choice.
      modes.length > 1 && h('div', { class: 'muted' }, 'Topics: one is picked at random each time.'),
      modes.length > 1 && chips(modes, topics, 'topics'),
      fmts.length > 1 && h('div', { class: 'muted' }, 'Formats: with both on, Pick \'Em lists are mixed in with the questions.'),
      fmts.length > 1 && chips(fmts, formats, 'formats'),
    );
  }

  /** − value + control; only the VIP can press it. */
  const stepper = (value: number, min: number, max: number, unit: string, set: (n: number) => void) =>
    h(
      'div',
      { class: 'stepper' },
      h('button', { class: 'secondary', disabled: !isVip || value <= min, onclick: () => set(value - 1) }, '−'),
      h('div', { class: 'stepper-value' }, `${value} ${value === 1 ? unit : `${unit}s`}`),
      h('button', { class: 'secondary', disabled: !isVip || value >= max, onclick: () => set(value + 1) }, '+'),
    );

  // Games played away from the app: each name its own slice.
  const otherGames = isVip
    ? (() => {
        const box = h('textarea', { class: 'ext-input', rows: '3', placeholder: 'Catan, Uno, Charades' }) as HTMLTextAreaElement;
        box.value = settings.externalGames.join(', ');
        box.addEventListener('blur', () => {
          const externalGames = parseExternalGames(box.value);
          if (JSON.stringify(externalGames) !== JSON.stringify(settings.externalGames)) save({ ...settings, externalGames });
          else render();
        });
        return box;
      })()
    : h('div', {}, settings.externalGames.length ? settings.externalGames.join(', ') : 'None');

  const card = h(
    'div',
    { class: 'game-card' },
    h('h2', {}, 'Games on the wheel'),
    ...toggles,
    h('h2', {}, 'Other games'),
    h(
      'div',
      { class: 'muted' },
      `Games you play away from the app (board games, cards…), separated by commas, up to ${MAX_EXTERNAL_GAMES}. Each gets its own slice; when one comes up, the app waits until the VIP marks it finished. No points.`,
    ),
    otherGames,
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
  const call = spin.call ? callButtons(spin.call, spin.msLeft) : null;
  if (call) call.hidden = spin.stopsInMs > 0;
  app.replaceChildren(
    h(
      'div',
      { class: 'center' },
      session ? h('p', {}, `Round ${session.round} of ${session.totalRounds}`) : '',
      h('div', { class: 'spin-emoji' }, '🎡'),
      status,
      h('p', {}, 'Watch the TV!'),
      call ?? '',
    ),
  );
  // Only reveal the game (and the chance to call) once the wheel on the TV has stopped.
  if (spinTimer) clearTimeout(spinTimer);
  spinTimer = setTimeout(() => {
    status.textContent = `Next up: ${spin.entries[spin.targetIndex].label}`;
    if (call) call.hidden = false;
  }, spin.stopsInMs);
}

/** "Starting in 8s", counting down until it's gone from the page. */
function countdown(msLeft: number) {
  const endsAt = performance.now() + msLeft;
  const el = h('div', { class: 'muted' });
  const tick = () => (el.textContent = `Starting in ${Math.max(0, Math.ceil((endsAt - performance.now()) / 1000))}s`);
  tick();
  const timer = setInterval(() => (el.isConnected ? tick() : clearInterval(timer)), 250);
  return el;
}

/** After the wheel stops: call the after-round game for this round (see GameInfo.calls), or say no. */
function callButtons(call: CallState, msLeft: number): HTMLElement {
  const label = (id: string) => call.options.find((o) => o.id === id)?.label ?? id;
  const name = (id: string) => room!.players.find((p) => p.id === id)?.name ?? '?';
  const left = call.left[playerId!] ?? 0;
  const canCall = call.eligible.includes(playerId!) && !call.decided.includes(playerId!);
  const errorEl = h('div', { class: 'error' });
  const send = (option: string | null) =>
    socket.emit('room:call', { option }, (res) => {
      if (!res.ok) errorEl.textContent = res.error;
    });
  const children: (Node | string)[] = call.called.map((c) => h('div', { class: 'call-made' }, `${name(c.playerId)} called a ${label(c.option)}!`));
  if (canCall) {
    children.push(
      h('div', {}, `Call this round? You have ${left} ${left === 1 ? 'call' : 'calls'} left.`),
      ...call.options.map((o) =>
        h('button', { class: 'call-button', disabled: call.called.some((c) => c.option === o.id), onclick: () => send(o.id) }, o.label),
      ),
      h('button', { class: 'secondary', onclick: () => send(null) }, 'No thanks'),
      countdown(msLeft),
    );
  } else if (!call.called.length) {
    children.push(h('div', { class: 'muted' }, left > 0 || !call.eligible.includes(playerId!) ? 'Waiting to see if anyone calls this round…' : 'You have no calls left.'));
  }
  children.push(errorEl);
  return h('div', { class: 'call' }, ...children);
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

/** WoochaWare debug: only WoochaWare's microgames, each played once at every level. */
function microgamePicker(isVip: boolean): Node[] {
  if (!isVip) return [h('p', {}, 'WOOCHAWARE DEBUG · Waiting for the VIP to pick a microgame…')];
  const errorEl = h('div', { class: 'error' });
  const buttons = room!.microgames.map((m) =>
    h(
      'button',
      {
        class: 'mode-button',
        onclick: () =>
          socket.emit('room:startGame', { gameId: WOOCHAWARE.id, microgameId: m.id }, (res) => {
            if (!res.ok) errorEl.textContent = res.error;
          }),
      },
      h('span', {}, `${m.command} ${m.name}`),
      h('small', {}, m.hint),
    ),
  );
  return [
    h('p', {}, 'WOOCHAWARE DEBUG · Pick a microgame. It plays once at each level (1, 2, 3).'),
    errorEl,
    h('div', { class: 'game-card' }, ...buttons),
  ];
}
