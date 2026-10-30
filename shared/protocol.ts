// Messages shared between the server, the host screen and the phone controllers.

import type { MicrogameInfo } from './games/woochaware';

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
  /**
   * Choices the VIP makes in the lobby instead of one wheel slice per mode: the game gets a
   * single slice, and when it comes up its mode is the chosen option ids joined with '-' (so
   * there must be a mode for every combination). "Both"/"Any" picks one at random each time.
   */
  choices?: GameChoice[];
  /**
   * Not on the wheel: when it's on in the lobby, it's played after every wheel game, with that
   * round's winners and losers (see GameOptions.roundResult).
   */
  afterRounds?: boolean;
  /**
   * With afterRounds: it's only played after a round someone calls it for. Once the wheel stops,
   * players get a moment to call one of these options (each at most once a round), using up one
   * of their calls for the session. The calls made reach the game as GameOptions.calls.
   */
  calls?: CallInfo;
}

export interface CallInfo {
  /** What can be called, e.g. two kinds of round. */
  options: { id: string; label: string }[];
  /** Calls each player gets per session (the server can override it: MiniGameDefinition.callsPerPlayer). */
  perPlayer: number;
}

/** While the wheel's result shows: players calling the after-round game (see GameInfo.calls). */
export interface CallState {
  /** What can be called this round (the lobby choices may leave some out). */
  options: { id: string; label: string }[];
  /** What's been called, and by whom. */
  called: { playerId: string; option: string }[];
  /** Players who can call this round (still here, with calls left). */
  eligible: string[];
  /** Players who've called or said no this round. */
  decided: string[];
  /** Calls each player has left this session. */
  left: Record<string, number>;
}

/** One row of a game's lobby choices, e.g. Easy / Hard. */
export interface GameChoice {
  id: string;
  options: { id: string; label: string }[];
  /** Adds a "Neither"/"None" option, which takes the game off the wheel (and hides the rows after it). */
  canTurnOff?: boolean;
}

/** A choice row's value: one of its option ids, or this for "Both"/"Any". */
export const ANY_OPTION = 'any';

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

/** One slice of the game wheel: a game played in a particular mode, or a group of games. */
export interface WheelEntry {
  /** "gameId:modeId", or for a group, the competitive game's id. */
  id: string;
  gameId: string;
  /** Empty for a group: the group settings pick the mode when the wheel lands on it. */
  modeId: string;
  label: string;
  /**
   * Several games on one slice (e.g. Trivia: Trivia, Team Trivia, Pick 'Em and Team Pick 'Em).
   * `settings.groups[id]` picks competitive or co-op, and which topics and formats can come up.
   */
  group?: { topics: { id: string; label: string }[]; formats: GroupFormat[] };
  /** A game with lobby choices (one slice for all its modes); `settings.choices[id]` has the VIP's picks. */
  choices?: GameChoice[];
  /** Played after every round instead of being on the wheel (GameInfo.afterRounds). */
  afterRounds?: boolean;
}

/**
 * One way to play a group's topics, e.g. Questions (Trivia / Team Trivia) or Pick 'Em lists
 * (Pick 'Em / Team Pick 'Em). Its games' modes are topics, with the same ids across formats.
 */
export interface GroupFormat {
  /** The competitive game's id. */
  id: string;
  label: string;
  competitive: string;
  coop: string;
  /** The topics this format has questions for. */
  topics: string[];
}

/** Competitive, co-op, or either at random each time. */
export type PlayStyle = 'competitive' | 'coop' | 'both';

export interface GroupSettings {
  style: PlayStyle;
  /** Topic (mode) ids and format ids; one of each is picked at random each time. */
  topics: string[];
  formats: string[];
}

/** What the VIP has chosen for the next session. */
export interface SessionSettings {
  /** Wheel entry ids that can come up. */
  enabled: string[];
  /** Per group slice (keyed by its entry id). Missing ones are left as they are. */
  groups: Record<string, GroupSettings>;
  /** Per slice with choices (keyed by its entry id): choice id → option id or ANY_OPTION. */
  choices: Record<string, Record<string, string>>;
  rounds: number;
  /** How many puzzles each game has, whichever game the wheel picks. */
  puzzlesPerRound: number;
  /** Games played away from the app (board games, cards…), each a slice of its own (see shared/games/external.ts). */
  externalGames: string[];
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
  /** Milliseconds until the chosen game starts (spin plus a pause to show it, or the time to call). */
  msLeft: number;
  /** Present when there's an after-round game players can call this round. */
  call: CallState | null;
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
  /** WoochaWare debug: the VIP picks a single microgame to practise from `microgames`. */
  woochaDebug: boolean;
  /** Every WoochaWare microgame (for the WoochaWare debug list). */
  microgames: MicrogameInfo[];
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
  /**
   * Debug mode only: VIP (or host) starts one specific mini game. In WoochaWare debug,
   * `microgameId` picks the WoochaWare microgame to practise.
   */
  'room:startGame': (req: { gameId: string; modeId?: string; microgameId?: string }, ack: Ack) => void;
  /** Host screen or VIP phone abandons the current game or session. */
  'room:backToLobby': () => void;
  /** Mini-game specific input from a phone. */
  'game:input': (input: unknown) => void;
  /** VIP: flag (or unflag) the question on screen for review. */
  'game:flag': (req: { key: string; flagged: boolean }, ack: Ack) => void;
  /** A player held down "I give up" (in games whose views offer it: see GiveUpView). */
  'game:giveUp': () => void;
  /** After the wheel stops: call the after-round game with one of its options, or (null) say no (see GameInfo.calls). */
  'room:call': (req: { option: string | null }, ack: Ack) => void;
}

/**
 * Fields a trivia or word game's player view adds for the phone's "I give up" button, which
 * the phone shows (and handles) for every game alike: hold it down to forfeit this puzzle.
 */
export interface GiveUpView {
  /** Giving up is allowed right now. */
  canGiveUp?: boolean;
  /** This player has given up on the puzzle in play (false again once it's over). */
  gaveUp?: boolean;
}

/** The question on screen in a trivia-style game, which the VIP can flag for review. */
export interface FlaggableQuestion {
  key: string;
  flagged: boolean;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  /** The question on screen that can be flagged, or null when there isn't one. */
  'game:flaggable': (question: FlaggableQuestion | null) => void;
  'room:closed': (reason: string) => void;
  /** This player joined again from another tab or device, so this connection is closed. */
  'player:replaced': () => void;
  /** Mini-game specific view for the host screen. */
  'game:host': (view: unknown) => void;
  /** Mini-game specific view for one player. */
  'game:player': (view: unknown) => void;
}
