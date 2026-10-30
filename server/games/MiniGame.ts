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
  /**
   * Trivia-style games: a question is now on screen (it stays current until the next one), so
   * the VIP can flag it for review. The answers only go to the review file, never to phones.
   */
  showingQuestion(question: QuestionForReview): void;
}

/** A question as saved for review if it's flagged. */
export interface QuestionForReview {
  /** E.g. the film or topic banner, or Blockbusters' initials. */
  banner?: string;
  question: string;
  answers: string[];
  wrong?: string[];
}

export interface MiniGame {
  start(): void;
  onInput(playerId: string, input: unknown): void;
  /** The player held down "I give up": they forfeit the puzzle or turn in play (see GiveUpView). */
  giveUp?(playerId: string): void;
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
  /** WoochaWare debug: practice just this microgame. */
  microgame?: string;
  /** Trivia: mix Pick 'Em lists in with the questions. */
  mixLists?: boolean;
  /** Games with lobby choices played after rounds: the choices as picked (choice id → option id or ANY_OPTION). */
  choices?: Record<string, string>;
  /** Games played after rounds: who won and who lost the round just played. */
  roundResult?: RoundResult;
  /** A game played away from the app: its name. */
  externalGame?: string;
  /** A callable game played after rounds (GameInfo.calls): the options players called this round. */
  calls?: string[];
}

/** The round just played: the players with the most points from it, and those with the fewest. */
export interface RoundResult {
  winners: string[];
  losers: string[];
}

export interface MiniGameDefinition {
  info: GameInfo;
  /** `modeId` is always one of `info.modes`. */
  create(ctx: GameContext, modeId: string, options: GameOptions): MiniGame;
  /** Games played after rounds: whether there's nothing to play for this round (e.g. nobody won), so it's skipped. */
  skipAfterRound?(options: GameOptions): boolean;
  /** Callable games (GameInfo.calls): calls each player gets, asked at the start of each session (e.g. read from a file). */
  callsPerPlayer?(): number;
  /** Callable games: which options can be called, given the lobby choices (all of them if missing). */
  callOptions?(choices: Record<string, string> | undefined): string[];
}
