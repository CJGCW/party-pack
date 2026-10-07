// Messages shared between the server, the host screen and the phone controllers.

export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 12;

export const PLAYER_COLORS = [
  '#ff5d73', '#ffb347', '#ffe66d', '#6ee7b7',
  '#5ec8f2', '#8b7cf6', '#f472d0', '#c4c4c4',
];

export interface GameMode {
  id: string;
  name: string;
  description: string;
}

export interface GameInfo {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** Ways to play, e.g. difficulty. The first one is the default. */
  modes: GameMode[];
}

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  score: number;
  connected: boolean;
  isVip: boolean;
}

export type RoomPhase = 'lobby' | 'game';

export interface RoomState {
  code: string;
  joinUrl: string;
  phase: RoomPhase;
  gameId: string | null;
  players: PlayerInfo[];
  games: GameInfo[];
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'host:create': (req: { resumeCode?: string }, ack: Ack<{ code: string }>) => void;
  'player:join': (
    req: { code: string; name: string; sessionId: string },
    ack: Ack<{ playerId: string }>,
  ) => void;
  /** Host screen or VIP phone asks to start a mini game. */
  'room:startGame': (req: { gameId: string; modeId?: string }, ack: Ack) => void;
  /** Host screen or VIP phone asks to abandon the current game. */
  'room:backToLobby': () => void;
  /** Mini-game specific input from a phone. */
  'game:input': (input: unknown) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'room:closed': (reason: string) => void;
  /** This player joined again from another tab or device, so this connection is closed. */
  'player:replaced': () => void;
  /** Mini-game specific view for the host screen. */
  'game:host': (view: unknown) => void;
  /** Mini-game specific view for one player. */
  'game:player': (view: unknown) => void;
}
