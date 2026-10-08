import type { Server, Socket } from 'socket.io';
import {
  DEFAULT_ROUNDS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  PLAYER_COLORS,
  type ClientToServerEvents,
  type PlayerInfo,
  type RoomState,
  type ServerToClientEvents,
  type SessionSettings,
  type WheelEntry,
} from '../shared/protocol';
import { config } from './config';
import { GAMES, findGame } from './games';
import type { MiniGame } from './games/MiniGame';

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
const SPIN_MS = 6_000;
const SPIN_RESULT_MS = 3_000;
/** Final results screen at the end of a session. */
const RESULTS_MS = 15_000;

/** Every game/mode combination, each a possible slice on the wheel. */
const WHEEL_ENTRIES: WheelEntry[] = GAMES.flatMap((g) =>
  g.info.modes.map((m) => ({
    id: `${g.info.id}:${m.id}`,
    gameId: g.info.id,
    modeId: m.id,
    label: g.info.modes.length > 1 ? `${g.info.name} · ${m.name}` : g.info.name,
  })),
);

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
  settings: SessionSettings = { enabled: WHEEL_ENTRIES.map((e) => e.id), rounds: DEFAULT_ROUNDS };
  private session: Session | null = null;
  private spin: { entries: WheelEntry[]; targetIndex: number; endsAt: number } | null = null;
  private resultsEndAt = 0;
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
      wheelEntries: WHEEL_ENTRIES,
      settings: this.settings,
      session: this.session ? { round: this.session.round, totalRounds: this.session.totalRounds } : null,
      spin: this.spin
        ? {
            entries: this.spin.entries,
            targetIndex: this.spin.targetIndex,
            spinMs: SPIN_MS,
            stopsInMs: Math.max(0, this.spin.endsAt - SPIN_RESULT_MS - Date.now()),
            msLeft: Math.max(0, this.spin.endsAt - Date.now()),
          }
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
    const current = players.find((p) => p.isVip && p.connected);
    for (const p of players) p.isVip = false;
    const vip = current ?? players.find((p) => p.connected);
    if (vip) vip.isVip = true;
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
    if (enabled.length === 0) return 'Pick at least one game.';
    if (!(rounds >= MIN_ROUNDS && rounds <= MAX_ROUNDS)) return `Rounds must be ${MIN_ROUNDS}-${MAX_ROUNDS}.`;
    this.settings = { enabled: [...new Set(enabled)], rounds };
    this.broadcastState();
    return null;
  }

  startSession(): string | null {
    if (config.debugMode) return 'Debug mode is on: pick a game instead.';
    if (this.busy) return 'A game is already running.';
    const players = this.connectedCount();
    // Only games that suit this many players can go on the wheel.
    const pool = WHEEL_ENTRIES.filter((e) => {
      if (!this.settings.enabled.includes(e.id)) return false;
      const info = findGame(e.gameId)!.info;
      return players >= info.minPlayers && players <= info.maxPlayers;
    });
    if (players === 0) return 'Need at least 1 player.';
    if (pool.length === 0) return 'None of the chosen games work with this many players.';

    for (const p of this.players.values()) p.score = 0;
    this.session = { round: 0, totalRounds: this.settings.rounds, pool };
    this.nextRound();
    return null;
  }

  /** Spins the wheel for the next round, then starts whichever game it lands on. */
  private nextRound() {
    const session = this.session!;
    session.round++;
    const targetIndex = Math.floor(Math.random() * session.pool.length);
    this.spin = { entries: session.pool, targetIndex, endsAt: Date.now() + SPIN_MS + SPIN_RESULT_MS };
    this.setPhaseTimer(SPIN_MS + SPIN_RESULT_MS, () => {
      const entry = this.spin!.entries[targetIndex];
      this.spin = null;
      const error = this.launchGame(entry.gameId, entry.modeId);
      // E.g. players left during the spin so the game no longer fits: end the session.
      if (error) this.returnToLobby();
    });
    this.broadcastState();
  }

  /** Debug mode only: play one specific game. */
  startGame(gameId: string, modeId?: string): string | null {
    if (!config.debugMode) return 'Spin the wheel to pick a game.';
    if (this.busy) return 'A game is already running.';
    for (const p of this.players.values()) p.score = 0;
    return this.launchGame(gameId, modeId);
  }

  private launchGame(gameId: string, modeId?: string): string | null {
    const def = findGame(gameId);
    if (!def) return 'Unknown game.';
    const mode = modeId ? def.info.modes.find((m) => m.id === modeId) : def.info.modes[0];
    if (!mode) return 'Unknown game mode.';
    const count = this.connectedCount();
    if (count < def.info.minPlayers) return `Need at least ${def.info.minPlayers} player(s).`;
    if (count > def.info.maxPlayers) return `${def.info.name} allows at most ${def.info.maxPlayers} players.`;

    this.gameId = gameId;
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
      },
      mode.id,
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
    const session = this.session;
    if (session && session.round < session.totalRounds && this.connectedCount() > 0) {
      this.nextRound();
    } else if (session) {
      this.showResults();
    } else {
      this.returnToLobby();
    }
  }

  private showResults() {
    this.session = null;
    this.resultsEndAt = Date.now() + RESULTS_MS;
    this.setPhaseTimer(RESULTS_MS, () => this.returnToLobby());
    this.broadcastState();
  }

  /** Abandons whatever is running (game, spin, session) and goes back to the lobby. */
  returnToLobby() {
    this.clearPhaseTimer();
    this.game?.dispose();
    this.game = null;
    this.gameId = null;
    this.session = null;
    this.spin = null;
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
