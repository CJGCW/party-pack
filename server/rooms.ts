import type { Server, Socket } from 'socket.io';
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  PLAYER_COLORS,
  type ClientToServerEvents,
  type PlayerInfo,
  type RoomState,
  type ServerToClientEvents,
} from '../shared/protocol';
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

export class Room {
  readonly players = new Map<string, Player>();
  hostSocketId: string | null = null;
  game: MiniGame | null = null;
  gameId: string | null = null;
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

  state(): RoomState {
    return {
      code: this.code,
      joinUrl: this.joinUrl,
      phase: this.game ? 'game' : 'lobby',
      gameId: this.gameId,
      players: [...this.players.values()].map(publicPlayer),
      games: GAMES.map((g) => g.info),
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
      if (this.game) return 'A game is in progress. Wait for it to finish.';
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
      if (!this.game) this.players.delete(player.id);
      this.assignVip();
      this.broadcastState();
    }
    if (!this.hostSocketId && ![...this.players.values()].some((p) => p.connected)) {
      this.scheduleCleanup();
    }
  }

  /** The VIP (first connected player) can start games from their phone. */
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

  startGame(gameId: string): string | null {
    if (this.game) return 'A game is already running.';
    const def = findGame(gameId);
    if (!def) return 'Unknown game.';
    const count = [...this.players.values()].filter((p) => p.connected).length;
    if (count < def.info.minPlayers) return `Need at least ${def.info.minPlayers} player(s).`;
    if (count > def.info.maxPlayers) return `${def.info.name} allows at most ${def.info.maxPlayers} players.`;

    for (const p of this.players.values()) p.score = 0;
    this.gameId = gameId;
    const game = def.create({
      players: () => [...this.players.values()].map(publicPlayer),
      sendHost: (view) => this.io.to(this.hostChannel).emit('game:host', view),
      sendPlayer: (playerId, view) => {
        const socketId = this.players.get(playerId)?.socketId;
        if (socketId) this.io.to(socketId).emit('game:player', view);
      },
      addScore: (playerId, points) => {
        const p = this.players.get(playerId);
        if (p) p.score += points;
      },
      finish: () => {
        // Only end the game that is still current, in case it already ended.
        if (this.game === game) this.endGame();
      },
    });
    this.game = game;
    this.broadcastState();
    game.start();
    return null;
  }

  endGame() {
    this.game?.dispose();
    this.game = null;
    this.gameId = null;
    // Drop players who left mid-game now that we're back in the lobby.
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    this.assignVip();
    this.broadcastState();
  }

  handleInput(socket: ClientSocket, input: unknown) {
    const playerId = socket.data.playerId;
    if (this.game && playerId && this.players.has(playerId)) this.game.onInput(playerId, input);
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
