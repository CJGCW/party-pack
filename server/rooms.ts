import type { Server, Socket } from 'socket.io';
import {
  DEFAULT_PUZZLES,
  DEFAULT_ROUNDS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_PUZZLES,
  MAX_ROUNDS,
  MIN_PUZZLES,
  MIN_ROUNDS,
  PLAYER_COLORS,
  ANY_OPTION,
  type ClientToServerEvents,
  type PlayerInfo,
  type RoomState,
  type ServerToClientEvents,
  type SessionSettings,
  type GroupSettings,
  type GroupFormat,
  type PlayStyle,
  type WheelEntry,
  type CallState,
} from '../shared/protocol';
import { EXTERNAL, externalEntry, parseExternalGames } from '../shared/games/external';
import { PICK_EM, PICK_EM_COOP } from '../shared/games/pickEm';
import { TRIVIA, TRIVIA_QUEST } from '../shared/games/trivia';
import { STANDINGS_MS } from '../shared/timing';
import { MICROGAMES, WOOCHAWARE, findMicrogame } from '../shared/games/woochaware';
import { config } from './config';
import { removeFlag, saveFlag, type FlagRecord } from './flags';
import { GAMES, findGame } from './games';
import type { GameOptions, MiniGame, RoundResult } from './games/MiniGame';

export interface SocketData {
  roomCode?: string;
  role?: 'host' | 'player';
  playerId?: string;
}

export type IO = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
export type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

interface Player extends PlayerInfo {
  sessionId: string;
  socketId: string | null;
}

/** Rooms with no host and no connected players are removed after this long. */
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0

/** How long the wheel spins, then how long it shows the chosen game before starting it. */
const SPIN_MS = 2_000;
const SPIN_RESULT_MS = 3_000;
/** Instead, when players can call the after-round game: time to call (or not) once the wheel stops. */
const CALL_MS = 10_000;
/** Once everyone who can call has decided, a moment to see it before the game starts. */
const CALL_SETTLE_MS = 1_500;
/** Final results screen at the end of a session. */
const RESULTS_MS = 15_000;

/**
 * Games that share one slice. Each format is a competitive game and its co-op version (which
 * share question banks); the banks are topics, with the same ids in every format. The group
 * settings pick competitive or co-op, and which topics and formats can come up.
 */
const GROUPS = [
  {
    id: TRIVIA.id,
    label: 'Trivia',
    formats: [
      { competitive: TRIVIA, coop: TRIVIA_QUEST, label: 'Questions' },
      { competitive: PICK_EM, coop: PICK_EM_COOP, label: "Pick 'Em lists" },
    ],
  },
  // With themes on, Blockbusters is one slice with a choice of topics (it has no co-op version,
  // so no competitive/co-op choice). With them off it's an ordinary slice.
  ...(config.blockbustersThemes ? [blockbustersGroup()] : []),
];

function blockbustersGroup() {
  const info = findGame('blockbusters')!.info;
  return { id: info.id, label: info.name, formats: [{ competitive: info, coop: info, label: info.name }] };
}
type Group = (typeof GROUPS)[number];
const groupFormats = (group: Group): GroupFormat[] =>
  group.formats.map((f) => ({
    id: f.competitive.id,
    label: f.label,
    competitive: f.competitive.id,
    coop: f.coop.id,
    topics: f.competitive.modes.map((m) => m.id),
  }));
/** Every topic any format has, in order. */
const groupTopics = (group: Group) => {
  const topics = new Map<string, string>();
  for (const f of group.formats) for (const m of f.competitive.modes) if (!topics.has(m.id)) topics.set(m.id, m.name);
  return [...topics].map(([id, label]) => ({ id, label }));
};
const GROUPED_GAMES = new Set(GROUPS.flatMap((g) => g.formats.flatMap((f) => [f.competitive.id, f.coop.id])));
const PLAY_STYLES: PlayStyle[] = ['competitive', 'coop', 'both'];

/** Every game/mode combination, each a possible slice on the wheel, plus one slice per group or game with lobby choices. */
const WHEEL_ENTRIES: WheelEntry[] = GAMES.flatMap((g): WheelEntry[] => {
  const group = GROUPS.find((gr) => gr.id === g.info.id);
  if (group) {
    return [{ id: group.id, gameId: g.info.id, modeId: '', label: group.label, group: { topics: groupTopics(group), formats: groupFormats(group) } }];
  }
  if (g.info.choices) return [{ id: g.info.id, gameId: g.info.id, modeId: '', label: g.info.name, choices: g.info.choices, afterRounds: g.info.afterRounds }];
  if (GROUPED_GAMES.has(g.info.id)) return [];
  return g.info.modes.map((m) => ({
    id: `${g.info.id}:${m.id}`,
    gameId: g.info.id,
    modeId: m.id,
    // Name the mode unless it's the generic or only one (e.g. "Word Rush · Hard", but just "Letter Drop").
    label: m.id === 'standard' || g.info.modes.length === 1 ? g.info.name : `${g.info.name} · ${m.name}`,
  }));
});

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

interface Session {
  round: number;
  totalRounds: number;
  pool: WheelEntry[];
}

export class Room {
  readonly players = new Map<string, Player>();
  hostSocketId: string | null = null;
  game: MiniGame | null = null;
  gameId: string | null = null;
  settings: SessionSettings = {
    enabled: WHEEL_ENTRIES.map((e) => e.id),
    groups: Object.fromEntries(
      GROUPS.map((g) => [g.id, { style: 'both', topics: groupTopics(g).map((t) => t.id), formats: groupFormats(g).map((f) => f.id) }]),
    ),
    // "Both"/"Any" for every choice to start with.
    choices: Object.fromEntries(
      WHEEL_ENTRIES.flatMap((e) => (e.choices ? [[e.id, Object.fromEntries(e.choices.map((c) => [c.id, ANY_OPTION]))]] : [])),
    ),
    rounds: DEFAULT_ROUNDS,
    puzzlesPerRound: DEFAULT_PUZZLES,
    externalGames: [],
  };
  private session: Session | null = null;
  private spin: { entries: WheelEntry[]; targetIndex: number; stopsAt: number; endsAt: number; call: CallState | null } | null = null;
  /** A callable after-round game (GameInfo.calls): calls each player has left this session. */
  private callsLeft = new Map<string, number>();
  /** What was called for the round being played (the after-round game is only played if something was). */
  private roundCalls: string[] = [];
  private resultsEndAt = 0;
  private standings: { previousScores: Record<string, number>; endsAt: number } | null = null;
  /** The question on screen that the VIP can flag, saved as it would be; and whether it is flagged. */
  private flaggable: { record: Omit<FlagRecord, 'flaggedAt'>; flagged: boolean } | null = null;
  private nextFlagKey = 1;
  /** The current game is one played after a round (not a wheel game). */
  private afterRound = false;
  /** Scores when the current game started, so standings can show what changed. */
  private roundStartScores: Record<string, number> = {};
  private phaseTimer: NodeJS.Timeout | null = null;
  private nextPlayerId = 1;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly code: string,
    private readonly io: IO,
    private readonly joinUrl: string,
    private readonly onEmpty: (room: Room) => void,
  ) {}

  get hostChannel() {
    return `${this.code}:host`;
  }

  get playerChannel() {
    return `${this.code}:players`;
  }

  private get phase(): RoomState['phase'] {
    if (this.game) return 'game';
    if (this.spin) return 'spinning';
    if (this.standings) return 'standings';
    if (this.resultsEndAt > Date.now()) return 'results';
    return 'lobby';
  }

  /** True while anything other than the lobby is showing. */
  private get busy() {
    return this.phase !== 'lobby';
  }

  state(): RoomState {
    return {
      code: this.code,
      joinUrl: this.joinUrl,
      phase: this.phase,
      gameId: this.gameId,
      players: [...this.players.values()].map(publicPlayer),
      games: GAMES.map((g) => g.info),
      debugMode: config.debugMode,
      woochaDebug: config.woochaDebug,
      microgames: config.woochaware ? [...MICROGAMES] : [],
      wheelEntries: WHEEL_ENTRIES,
      settings: this.settings,
      session: this.session ? { round: this.session.round, totalRounds: this.session.totalRounds } : null,
      spin: this.spin
        ? {
            entries: this.spin.entries,
            targetIndex: this.spin.targetIndex,
            spinMs: SPIN_MS,
            stopsInMs: Math.max(0, this.spin.stopsAt - Date.now()),
            msLeft: Math.max(0, this.spin.endsAt - Date.now()),
            call: this.spin.call,
          }
        : null,
      standings: this.standings
        ? { previousScores: this.standings.previousScores, msLeft: Math.max(0, this.standings.endsAt - Date.now()) }
        : null,
      resultsMsLeft: Math.max(0, this.resultsEndAt - Date.now()),
    };
  }

  broadcastState() {
    const state = this.state();
    this.io.to(this.hostChannel).to(this.playerChannel).emit('room:state', state);
  }

  attachHost(socket: ClientSocket) {
    if (this.hostSocketId) this.io.sockets.sockets.get(this.hostSocketId)?.leave(this.hostChannel);
    this.hostSocketId = socket.id;
    socket.join(this.hostChannel);
    socket.data = { roomCode: this.code, role: 'host' };
    this.cancelCleanup();
    socket.emit('room:state', this.state());
    this.game?.syncHost();
  }

  addOrRejoinPlayer(socket: ClientSocket, rawName: string, sessionId: string): Player | string {
    let player = [...this.players.values()].find((p) => p.sessionId === sessionId);

    if (!player) {
      const name = rawName.trim().toUpperCase().slice(0, MAX_NAME_LENGTH);
      if (!name) return 'Enter a name.';
      if (this.players.size >= MAX_PLAYERS) return 'This room is full.';
      if (this.busy) return 'A game is in progress. Wait for it to finish.';
      if ([...this.players.values()].some((p) => p.name === name)) return 'That name is taken.';

      const usedColors = new Set([...this.players.values()].map((p) => p.color));
      player = {
        id: `p${this.nextPlayerId++}`,
        name,
        color: PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0],
        score: 0,
        connected: true,
        isVip: false,
        sessionId,
        socketId: null,
      };
      this.players.set(player.id, player);
    }

    const previous = player.socketId ? this.io.sockets.sockets.get(player.socketId) : undefined;
    if (previous && previous.id !== socket.id) {
      previous.emit('player:replaced');
      previous.disconnect(true);
    }
    player.socketId = socket.id;
    player.connected = true;
    socket.join(this.playerChannel);
    socket.data = { roomCode: this.code, role: 'player', playerId: player.id };
    this.assignVip();
    this.cancelCleanup();
    this.broadcastState();
    this.game?.syncPlayer(player.id);
    socket.emit('game:flaggable', this.flaggableView());
    return player;
  }

  handleDisconnect(socket: ClientSocket) {
    if (socket.id === this.hostSocketId) {
      this.hostSocketId = null;
    } else {
      const player = [...this.players.values()].find((p) => p.socketId === socket.id);
      if (!player) return;
      player.connected = false;
      player.socketId = null;
      // In the lobby, a player who leaves is simply removed.
      if (!this.busy) this.players.delete(player.id);
      this.assignVip();
      this.broadcastState();
    }
    if (!this.hostSocketId && ![...this.players.values()].some((p) => p.connected)) {
      this.scheduleCleanup();
    }
  }

  /** The VIP (first connected player) controls the lobby from their phone. */
  private assignVip() {
    const players = [...this.players.values()];
    const before = players.find((p) => p.isVip);
    const current = players.find((p) => p.isVip && p.connected);
    for (const p of players) p.isVip = false;
    const vip = current ?? players.find((p) => p.connected);
    if (vip) vip.isVip = true;
    // A game that shows who the VIP is (e.g. who marks an external game finished) needs to know.
    if (this.game && vip !== before) {
      this.game.syncHost();
      for (const p of players) this.game.syncPlayer(p.id);
    }
  }

  canControl(socket: ClientSocket): boolean {
    if (socket.id === this.hostSocketId) return true;
    const player = this.players.get(socket.data.playerId ?? '');
    return !!player?.isVip;
  }

  private connectedCount() {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  // ---- Settings and sessions -------------------------------------------------

  updateSettings(next: SessionSettings): string | null {
    if (this.busy) return 'A game is in progress.';
    const validIds = new Set(WHEEL_ENTRIES.map((e) => e.id));
    const enabled = Array.isArray(next?.enabled) ? next.enabled.filter((id) => validIds.has(id)) : [];
    const rounds = Math.round(Number(next?.rounds));
    const externalGames = Array.isArray(next?.externalGames) ? parseExternalGames(next.externalGames.map(String).join('\n')) : this.settings.externalGames;
    // Games played after rounds don't count: there has to be something on the wheel.
    if (!externalGames.length && !enabled.some((id) => !WHEEL_ENTRIES.find((e) => e.id === id)?.afterRounds)) return 'Pick at least one game.';
    if (!(rounds >= MIN_ROUNDS && rounds <= MAX_ROUNDS)) return `Rounds must be ${MIN_ROUNDS}-${MAX_ROUNDS}.`;
    // Older clients may not send this; keep the current value then.
    const puzzles = next?.puzzlesPerRound === undefined ? this.settings.puzzlesPerRound : Math.round(Number(next.puzzlesPerRound));
    if (!(puzzles >= MIN_PUZZLES && puzzles <= MAX_PUZZLES)) return `Puzzles must be ${MIN_PUZZLES}-${MAX_PUZZLES}.`;
    // Groups: keep the current choice for anything missing or invalid.
    const groups: Record<string, GroupSettings> = {};
    for (const g of GROUPS) {
      const current = this.settings.groups[g.id];
      const sent = next?.groups?.[g.id];
      const style = PLAY_STYLES.includes(sent?.style as PlayStyle) ? sent!.style : current.style;
      const allTopics = groupTopics(g).map((t) => t.id);
      const topics = Array.isArray(sent?.topics) ? allTopics.filter((t) => sent.topics.includes(t)) : current.topics;
      const allFormats = groupFormats(g).map((f) => f.id);
      const formats = Array.isArray(sent?.formats) ? allFormats.filter((f) => sent.formats.includes(f)) : current.formats;
      if (topics.length === 0) return `Pick at least one ${g.label} topic.`;
      if (formats.length === 0) return `Pick at least one ${g.label} format.`;
      groups[g.id] = { style, topics, formats };
    }
    // Lobby choices: the same, an option id or "any" per row.
    const choices: Record<string, Record<string, string>> = {};
    for (const e of WHEEL_ENTRIES) {
      if (!e.choices) continue;
      choices[e.id] = Object.fromEntries(
        e.choices.map((c) => {
          const sent = next?.choices?.[e.id]?.[c.id];
          const valid = sent === ANY_OPTION || c.options.some((o) => o.id === sent);
          return [c.id, valid ? sent! : this.settings.choices[e.id][c.id]];
        }),
      );
    }
    this.settings = { enabled: [...new Set(enabled)], groups, choices, rounds, puzzlesPerRound: puzzles, externalGames };
    this.broadcastState();
    return null;
  }

  startSession(): string | null {
    if (config.debugMode || config.woochaDebug) return 'Debug mode is on: pick a game instead.';
    if (this.busy) return 'A game is already running.';
    const players = this.connectedCount();
    // Only games that suit this many players can go on the wheel.
    const pool = [
      ...WHEEL_ENTRIES.filter((e) => {
        if (!this.settings.enabled.includes(e.id) || e.afterRounds) return false;
        const info = findGame(e.gameId)!.info;
        return players >= info.minPlayers && players <= info.maxPlayers;
      }),
      ...this.settings.externalGames.map(externalEntry),
    ];
    if (players === 0) return 'Need at least 1 player.';
    if (pool.length === 0) return 'None of the chosen games work with this many players.';

    for (const p of this.players.values()) p.score = 0;
    this.session = { round: 0, totalRounds: this.settings.rounds, pool };
    const callable = this.callable();
    const perPlayer = callable ? (callable.def.callsPerPlayer?.() ?? callable.def.info.calls!.perPlayer) : 0;
    this.callsLeft = new Map([...this.players.values()].map((p) => [p.id, perPlayer]));
    this.nextRound();
    return null;
  }

  /** The after-round game that's on, if players call it (GameInfo.calls), and what can be called given the lobby choices. */
  private callable() {
    const entry = WHEEL_ENTRIES.find((e) => e.afterRounds && this.settings.enabled.includes(e.id));
    const def = entry && findGame(entry.gameId);
    if (!entry || !def?.info.calls) return null;
    const allowed = def.callOptions?.(this.settings.choices[entry.id]) ?? def.info.calls.options.map((o) => o.id);
    const options = def.info.calls.options.filter((o) => allowed.includes(o.id));
    return options.length ? { entry, def, options } : null;
  }

  /** This round's chance to call the after-round game: who can (still here, with calls left). Null if nobody can. */
  private callState(): CallState | null {
    const callable = this.callable();
    if (!callable) return null;
    const eligible = [...this.players.values()].filter((p) => p.connected && (this.callsLeft.get(p.id) ?? 0) > 0).map((p) => p.id);
    if (!eligible.length) return null;
    return { options: callable.options, called: [], eligible, decided: [], left: Object.fromEntries(this.callsLeft) };
  }

  /** A player calls the after-round game for this round (or, with null, says no). */
  call(socket: ClientSocket, option: string | null): string | null {
    const id = socket.data.playerId;
    const spin = this.spin;
    const call = spin?.call;
    if (!spin || !call || !id) return 'There is nothing to call right now.';
    if (Date.now() < spin.stopsAt) return 'Wait for the wheel to stop.';
    if (!call.eligible.includes(id) || call.decided.includes(id)) return "You can't call this round.";
    if (option !== null) {
      if (!call.options.some((o) => o.id === option)) return 'Unknown call.';
      if (call.called.some((c) => c.option === option)) return 'That has already been called.';
      this.callsLeft.set(id, (this.callsLeft.get(id) ?? 0) - 1);
      call.left[id] = this.callsLeft.get(id)!;
      call.called.push({ playerId: id, option });
    }
    call.decided.push(id);
    // Everyone who can has decided, or there's nothing left to call: start soon.
    const done = call.eligible.every((p) => call.decided.includes(p)) || call.options.every((o) => call.called.some((c) => c.option === o.id));
    if (done && spin.endsAt - Date.now() > CALL_SETTLE_MS) {
      spin.endsAt = Date.now() + CALL_SETTLE_MS;
      this.setPhaseTimer(CALL_SETTLE_MS, () => this.startSpunGame());
    }
    this.broadcastState();
    return null;
  }

  /** Spins the wheel for the next round, then starts whichever game it lands on. */
  private nextRound() {
    const session = this.session!;
    session.round++;
    const targetIndex = Math.floor(Math.random() * session.pool.length);
    const call = this.callState();
    const now = Date.now();
    const showMs = call ? CALL_MS : SPIN_RESULT_MS;
    this.spin = { entries: session.pool, targetIndex, stopsAt: now + SPIN_MS, endsAt: now + SPIN_MS + showMs, call };
    this.setPhaseTimer(SPIN_MS + showMs, () => this.startSpunGame());
    this.broadcastState();
  }

  /** The wheel's done (and any calling): start the game it landed on. */
  private startSpunGame() {
    const spin = this.spin!;
    const entry = spin.entries[spin.targetIndex];
    // What was called carries over to after the round.
    this.roundCalls = spin.call?.called.map((c) => c.option) ?? [];
    this.spin = null;
    const { gameId, modeId, mixLists } = entry.group
      ? this.pickFromGroup(entry.id, entry.group)
      : { ...entry, modeId: entry.choices ? this.pickFromChoices(entry.id, entry.choices) : entry.modeId, mixLists: false };
    const error = this.launchGame(gameId, modeId, undefined, mixLists, undefined, gameId === EXTERNAL.id ? entry.label : undefined);
    // E.g. players left during the spin so the game no longer fits: end the session.
    if (error) this.returnToLobby();
  }

  /**
   * A group slice came up: one of the chosen topics, in one of the chosen formats that has it,
   * competitive or co-op per the settings.
   */
  private pickFromGroup(id: string, group: NonNullable<WheelEntry['group']>) {
    const { style, topics, formats } = this.settings.groups[id];
    const coop = style === 'both' ? Math.random() < 0.5 : style === 'coop';
    const chosen = group.formats.filter((f) => formats.includes(f.id));
    const pairs = chosen.flatMap((f) => topics.filter((t) => f.topics.includes(t)).map((topic) => ({ format: f, topic })));
    const { format, topic } = pick(pairs);
    // More than one format chosen, and the first (Questions) has this topic: its game, with
    // the others' lists mixed in.
    const [main] = group.formats;
    if (chosen.length > 1 && chosen[0] === main && main.topics.includes(topic)) {
      return { gameId: coop ? main.coop : main.competitive, modeId: topic, mixLists: true };
    }
    return { gameId: coop ? format.coop : format.competitive, modeId: topic, mixLists: false };
  }

  /** A slice with lobby choices came up: its mode is the chosen options (any "Both" picked at random), joined with '-'. */
  private pickFromChoices(id: string, choices: NonNullable<WheelEntry['choices']>) {
    return choices
      .map((c) => {
        const value = this.settings.choices[id]?.[c.id] ?? ANY_OPTION;
        return value === ANY_OPTION ? pick(c.options).id : value;
      })
      .join('-');
  }

  /** Debug mode only: play one specific game (or, in WoochaWare debug, one microgame). */
  startGame(gameId: string, modeId?: string, microgameId?: string): string | null {
    if (config.woochaDebug) {
      if (gameId !== WOOCHAWARE.id || !microgameId || !findMicrogame(microgameId)) return 'Pick a microgame.';
    } else if (!config.debugMode) {
      return 'Spin the wheel to pick a game.';
    }
    if (this.busy) return 'A game is already running.';
    for (const p of this.players.values()) p.score = 0;
    return this.launchGame(gameId, modeId, config.woochaDebug ? microgameId : undefined);
  }

  private launchGame(
    gameId: string,
    modeId?: string,
    microgameId?: string,
    mixLists = false,
    afterRound?: Pick<GameOptions, 'choices' | 'roundResult' | 'calls'>,
    externalGame?: string,
  ): string | null {
    const def = findGame(gameId);
    if (!def) return 'Unknown game.';
    const mode = modeId ? def.info.modes.find((m) => m.id === modeId) : def.info.modes[0];
    if (!mode) return 'Unknown game mode.';
    const count = this.connectedCount();
    if (count < def.info.minPlayers) return `Need at least ${def.info.minPlayers} player(s).`;
    if (count > def.info.maxPlayers) return `${def.info.name} allows at most ${def.info.maxPlayers} players.`;

    this.gameId = gameId;
    this.setFlaggable(null);
    // A game played after a round leaves the round's starting scores, so the standings still show the round.
    this.afterRound = !!afterRound;
    if (!afterRound) this.roundStartScores = Object.fromEntries([...this.players.values()].map((p) => [p.id, p.score]));
    const game = def.create(
      {
        players: () => [...this.players.values()].map(publicPlayer),
        sendHost: (view) => this.io.to(this.hostChannel).emit('game:host', view),
        sendPlayer: (playerId, view) => {
          const socketId = this.players.get(playerId)?.socketId;
          if (socketId) this.io.to(socketId).emit('game:player', view);
        },
        // Scores carry across every game in a session.
        addScore: (playerId, points) => {
          const p = this.players.get(playerId);
          if (p) p.score += points;
        },
        finish: () => {
          // Only end the game that is still current, in case it already ended.
          if (this.game === game) this.gameFinished();
        },
        showingQuestion: (question) => {
          if (this.game !== game) return;
          const id = `${this.code}-${Date.now().toString(36)}-${this.nextFlagKey++}`;
          this.setFlaggable({ id, game: def.info.name, mode: mode.name, ...question });
        },
      },
      mode.id,
      { puzzles: this.settings.puzzlesPerRound, microgame: microgameId, mixLists, externalGame, ...afterRound },
    );
    this.game = game;
    this.broadcastState();
    game.start();
    return null;
  }

  private gameFinished() {
    this.game?.dispose();
    this.game = null;
    this.gameId = null;
    this.setFlaggable(null);
    if (!this.session) return this.returnToLobby();
    // After a wheel game, any game that's played after rounds; then the standings.
    if (!this.afterRound && this.startAfterRound()) return;
    this.showStandings();
  }

  /** Starts the game played after rounds, if one is on and there's something to play for. */
  private startAfterRound() {
    const entry = WHEEL_ENTRIES.find((e) => e.afterRounds && this.settings.enabled.includes(e.id));
    if (!entry) return false;
    const def = findGame(entry.gameId)!;
    // A callable one is only played when someone called it this round.
    if (def.info.calls && !this.roundCalls.length) return false;
    const options = {
      puzzles: this.settings.puzzlesPerRound,
      choices: this.settings.choices[entry.id],
      roundResult: this.roundResult(),
      ...(def.info.calls ? { calls: this.roundCalls } : {}),
    };
    if (def.skipAfterRound?.(options)) return false;
    return this.launchGame(entry.gameId, undefined, undefined, false, options) === null;
  }

  /**
   * Who won and lost the round just played, by points from it: the most (if anyone scored), and
   * the fewest (unless everyone tied). Only players still here.
   */
  private roundResult(): RoundResult {
    const gains = [...this.players.values()].filter((p) => p.connected).map((p) => ({ id: p.id, gain: p.score - (this.roundStartScores[p.id] ?? 0) }));
    if (!gains.length) return { winners: [], losers: [] };
    const best = Math.max(...gains.map((g) => g.gain));
    const worst = Math.min(...gains.map((g) => g.gain));
    return {
      winners: best > 0 ? gains.filter((g) => g.gain === best).map((g) => g.id) : [],
      losers: worst < best ? gains.filter((g) => g.gain === worst).map((g) => g.id) : [],
    };
  }

  /** Running totals after a round, animated on the TV, then the next spin or the final results. */
  private showStandings() {
    this.standings = { previousScores: this.roundStartScores, endsAt: Date.now() + STANDINGS_MS };
    this.setPhaseTimer(STANDINGS_MS, () => {
      this.standings = null;
      const session = this.session!;
      if (session.round < session.totalRounds && this.connectedCount() > 0) this.nextRound();
      else this.showResults();
    });
    this.broadcastState();
  }

  private showResults() {
    this.session = null;
    this.resultsEndAt = Date.now() + RESULTS_MS;
    this.setPhaseTimer(RESULTS_MS, () => this.returnToLobby());
    this.broadcastState();
  }

  // ---- Flagging questions for review ------------------------------------------

  private flaggableView() {
    return this.flaggable ? { key: this.flaggable.record.id, flagged: this.flaggable.flagged } : null;
  }

  /** A new question on screen (or none): tell the phones, so the VIP's can offer to flag it. */
  private setFlaggable(record: Omit<FlagRecord, 'flaggedAt'> | null) {
    if (!record && !this.flaggable) return;
    this.flaggable = record ? { record, flagged: false } : null;
    this.io.to(this.playerChannel).emit('game:flaggable', this.flaggableView());
  }

  /** VIP only: flags (or unflags) the question on screen, saving it for review (or taking it out). */
  flagQuestion(socket: ClientSocket, key: string, flagged: boolean): string | null {
    if (!this.players.get(socket.data.playerId ?? '')?.isVip) return 'Only the VIP can flag questions.';
    const current = this.flaggable;
    if (!current || current.record.id !== key) return 'That question has gone.';
    if (current.flagged !== !!flagged) {
      if (flagged) saveFlag({ ...current.record, flaggedAt: new Date().toISOString() });
      else removeFlag(key);
      current.flagged = !!flagged;
    }
    this.io.to(this.playerChannel).emit('game:flaggable', this.flaggableView());
    return null;
  }

  /** Abandons whatever is running (game, spin, session) and goes back to the lobby. */
  returnToLobby() {
    this.clearPhaseTimer();
    this.game?.dispose();
    this.game = null;
    this.gameId = null;
    this.setFlaggable(null);
    this.session = null;
    this.spin = null;
    this.standings = null;
    this.resultsEndAt = 0;
    // Drop players who left mid-game now that we're back in the lobby.
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    this.assignVip();
    this.broadcastState();
  }

  handleInput(socket: ClientSocket, input: unknown) {
    const playerId = socket.data.playerId;
    if (this.game && playerId && this.players.has(playerId)) this.game.onInput(playerId, input);
  }

  handleGiveUp(socket: ClientSocket) {
    const playerId = socket.data.playerId;
    if (this.game && playerId && this.players.has(playerId)) this.game.giveUp?.(playerId);
  }

  private setPhaseTimer(ms: number, fn: () => void) {
    this.clearPhaseTimer();
    this.phaseTimer = setTimeout(fn, ms);
  }

  private clearPhaseTimer() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  private scheduleCleanup() {
    this.cancelCleanup();
    this.cleanupTimer = setTimeout(() => this.onEmpty(this), EMPTY_ROOM_TTL_MS);
  }

  private cancelCleanup() {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  close(reason: string) {
    this.cancelCleanup();
    this.clearPhaseTimer();
    this.game?.dispose();
    this.io.to(this.hostChannel).to(this.playerChannel).emit('room:closed', reason);
  }
}

function publicPlayer(p: Player): PlayerInfo {
  return { id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected, isVip: p.isVip };
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly io: IO,
    private readonly joinUrl: string,
  ) {}

  get(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  create(): Room {
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
    } while (this.rooms.has(code));

    const room = new Room(code, this.io, this.joinUrl, (r) => {
      r.close('Room expired.');
      this.rooms.delete(r.code);
    });
    this.rooms.set(code, room);
    return room;
  }
}
