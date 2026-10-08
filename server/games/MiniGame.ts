import type { GameInfo, PlayerInfo } from '../../shared/protocol';

/** What a running mini game is allowed to do to its room. */
export interface GameContext {
  /** Players currently in the room (including disconnected ones, check `connected`). */
  players(): PlayerInfo[];
  sendHost(view: unknown): void;
  sendPlayer(playerId: string, view: unknown): void;
  addScore(playerId: string, points: number): void;
  /** Ends the game and returns everyone to the lobby. */
  finish(): void;
}

export interface MiniGame {
  start(): void;
  onInput(playerId: string, input: unknown): void;
  /** Re-send current views, e.g. after the host or a player reconnects. */
  syncHost(): void;
  syncPlayer(playerId: string): void;
  /** Stop timers. Called whenever the game ends, normally or not. */
  dispose(): void;
}

/** Settings that apply to whichever game is played. */
export interface GameOptions {
  /** How many puzzles to play (Letter Drop puzzles, Word Rush words). */
  puzzles: number;
}

export interface MiniGameDefinition {
  info: GameInfo;
  /** `modeId` is always one of `info.modes`. */
  create(ctx: GameContext, modeId: string, options: GameOptions): MiniGame;
}
