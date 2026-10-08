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

export type RoomPhase = 'lobby' | 'spinning' | 'game' | 'standings' | 'results';

export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 10;
export const DEFAULT_ROUNDS = 3;

/** Puzzles (Letter Drop puzzles, Word Rush words) in each game. */
export const MIN_PUZZLES = 1;
export const MAX_PUZZLES = 10;
export const DEFAULT_PUZZLES = 3;

/** One slice of the game wheel: a game played in a particular mode. */
export interface WheelEntry {
  /** "gameId:modeId" */
  id: string;
  gameId: string;
  modeId: string;
  label: string;
}

/** What the VIP has chosen for the next session. */
export interface SessionSettings {
  /** Wheel entry ids that can come up. */
  enabled: string[];
  rounds: number;
  /** How many puzzles each game has, whichever game the wheel picks. */
  puzzlesPerRound: number;
}

export interface SpinState {
  /** The slices on the wheel, in order. */
  entries: WheelEntry[];
  /** Index into `entries` the wheel will stop on. */
  targetIndex: number;
  /** How long the wheel spins for. */
  spinMs: number;
  /** Milliseconds until the wheel stops (0 once it has stopped). */
  stopsInMs: number;
  /** Milliseconds until the chosen game starts (spin plus a pause to show it). */
  msLeft: number;
}

export interface StandingsState {
  /** Each player's total before the round that just ended, keyed by player id. */
  previousScores: Record<string, number>;
  /** Milliseconds until the next spin (or the final results). */
  msLeft: number;
}

export interface RoomState {
  code: string;
  joinUrl: string;
  phase: RoomPhase;
  gameId: string | null;
  players: PlayerInfo[];
  games: GameInfo[];
  /** Debug mode: the VIP picks a specific game instead of spinning the wheel. */
  debugMode: boolean;
  /** Every game/mode that can go on the wheel. */
  wheelEntries: WheelEntry[];
  settings: SessionSettings;
  /** Present while a multi-round session is running. */
  session: { round: number; totalRounds: number } | null;
  /** Present during the 'spinning' phase. */
  spin: SpinState | null;
  /** Present during the 'standings' phase, between rounds of a session. */
  standings: StandingsState | null;
  /** Milliseconds left on the final results screen, during 'results'. */
  resultsMsLeft: number;
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'host:create': (req: { resumeCode?: string }, ack: Ack<{ code: string }>) => void;
  'player:join': (
    req: { code: string; name: string; sessionId: string },
    ack: Ack<{ playerId: string }>,
  ) => void;
  /** VIP (or host) changes which games are on the wheel and how many rounds. */
  'room:updateSettings': (settings: SessionSettings, ack: Ack) => void;
  /** VIP (or host) starts a session: spin the wheel, play, repeat for each round. */
  'room:startSession': (ack: Ack) => void;
  /** Debug mode only: VIP (or host) starts one specific mini game. */
  'room:startGame': (req: { gameId: string; modeId?: string }, ack: Ack) => void;
  /** Host screen or VIP phone abandons the current game or session. */
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
