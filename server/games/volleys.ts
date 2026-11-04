import { bestPoints } from '../../shared/boards';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { VolleyBoardView, VolleyHostView, VolleyPhase, VolleyPlayerView } from '../../shared/volleys';
import type { GameContext, MiniGame } from './MiniGame';

/** At the result, a little longer than other games: there's a board each to look at. */
const RESULT_MS = PUZZLE_RESULT_MS + 2_000;
/** Aim updates go to the TV at most this often (it shows everyone aiming). */
const AIM_SYNC_MS = 100;
/** After the last shot's played back, a moment to see where everything ended up. */
const FLY_TAIL_MS = 1_200;

export interface VolleyOptions {
  volleys: number;
  aimMs: number;
  /** Everyone starts each volley from the default aim (rather than where they last aimed). */
  freshAims?: boolean;
}

interface Entry<B, A> {
  board: B;
  /** The board's score before this volley's shot (shown until it's played back). */
  scoreBefore: number;
  aim: A;
  locked: boolean;
  place: number | null;
  points: number;
}

/**
 * Volleys (see shared/volleys.ts): a board per player, all from one seed. Each volley everyone
 * aims and fires on their phone; when they all have (or time's up) the game works out every shot
 * and records it, and the TV plays them back. After the round's volleys, each board's score as a
 * share of the best.
 *
 * `B` is a board, `S` what the TV gets of one, `P` what its player's phone gets, `A` an aim.
 */
export abstract class VolleyGame<B, S, P, A, R = null> implements MiniGame {
  protected phase: VolleyPhase = 'aim';
  protected puzzleIndex = 0;
  protected volleyIndex = 0;
  protected seed = 0;
  protected entries = new Map<string, Entry<B, A>>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private phaseMs = 0;
  private timer: NodeJS.Timeout | null = null;
  private aimSyncAt = 0;
  private aimSyncTimer: NodeJS.Timeout | null = null;

  constructor(
    protected readonly ctx: GameContext,
    protected readonly totalPuzzles: number,
    protected readonly options: VolleyOptions,
  ) {}

  /** A new board for player number `index` this round, from the round's seed. */
  protected abstract newBoard(seed: number, index: number): B;
  /** Where a player aims until they move it. */
  protected abstract defaultAim(): A;
  /** An aim from a phone's input (null if it's not one). */
  protected abstract readAim(input: unknown): A | null;
  /** Works out every board's shot (players who didn't fire shoot from where they were aiming). Returns how long the TV takes to play them back (ms). */
  protected abstract shoot(shots: { board: B; aim: A }[]): number;
  protected abstract boardScore(board: B): number;
  /** Whether a board takes a shot this volley (e.g. not the second ball of a frame after a strike). */
  protected shoots(_board: B): boolean {
    return true;
  }
  /** Called before each volley's aiming starts (e.g. to set the pins back up). */
  protected beforeVolley(_board: B): void {}
  /** Called as each round starts, before the boards are made. */
  protected beforeRound(): void {}
  /** What the whole round shares, for the TV (e.g. a world everyone's in). */
  protected roundState(): R {
    return null as R;
  }
  /** Extra fields for every view (e.g. `asGame`, to be shown with another game's screens). */
  protected viewExtras(): object {
    return {};
  }
  protected abstract hostState(board: B, aim: A): S;
  protected abstract playerState(board: B, aim: A): P;

  start() {
    this.startRound(0);
  }

  private setPhase(phase: VolleyPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseMs = ms;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startRound(index: number) {
    this.puzzleIndex = index;
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.beforeRound();
    this.entries = new Map(
      this.ctx.players().map((p, i) => [p.id, { board: this.newBoard(this.seed, i), scoreBefore: 0, aim: this.defaultAim(), locked: false, place: null, points: 0 }]),
    );
    this.startVolley(0);
  }

  private startVolley(index: number) {
    this.volleyIndex = index;
    for (const e of this.entries.values()) {
      this.beforeVolley(e.board);
      if (this.options.freshAims) e.aim = this.defaultAim();
      // Boards sitting this one out count as having fired.
      e.locked = !this.shoots(e.board);
    }
    if ([...this.entries.values()].every((e) => e.locked)) return this.setPhase('aim', 0, () => this.fly());
    this.setPhase('aim', this.options.aimMs, () => this.fly());
  }

  onInput(playerId: string, raw: unknown) {
    const e = this.entries.get(playerId);
    if (!e || e.locked || this.phase !== 'aim' || !raw) return;
    const aim = this.readAim(raw);
    if (aim === null) return;
    e.aim = aim;
    if ((raw as { type?: string }).type === 'fire') {
      e.locked = true;
      const here = new Set(this.ctx.players().filter((p) => p.connected).map((p) => p.id));
      if ([...this.entries].every(([id, o]) => o.locked || !here.has(id))) return this.fly();
      return this.syncAll();
    }
    this.syncHostSoon();
  }

  /** Aiming moves things on the TV; it hears about it at most every AIM_SYNC_MS. */
  private syncHostSoon() {
    if (this.aimSyncTimer) return;
    const wait = Math.max(0, this.aimSyncAt + AIM_SYNC_MS - Date.now());
    this.aimSyncTimer = setTimeout(() => {
      this.aimSyncTimer = null;
      this.aimSyncAt = Date.now();
      if (this.phase === 'aim') this.syncHost();
    }, wait);
  }

  private fly() {
    if (this.phase !== 'aim') return;
    const shooting = [...this.entries.values()].filter((e) => this.shoots(e.board));
    for (const e of this.entries.values()) {
      e.locked = true;
      e.scoreBefore = this.boardScore(e.board);
    }
    const playMs = this.shoot(shooting.map((e) => ({ board: e.board, aim: e.aim })));
    const last = this.volleyIndex >= this.options.volleys - 1;
    this.setPhase('fly', playMs + FLY_TAIL_MS, () => (last ? this.endRound() : this.startVolley(this.volleyIndex + 1)));
  }

  private endRound() {
    const entries = [...this.entries.entries()];
    const scores = new Map(entries.map(([id, e]) => [id, this.boardScore(e.board)]));
    const best = Math.max(0, ...scores.values());
    for (const [id, e] of entries) {
      e.place = 1 + entries.filter(([o]) => scores.get(o)! > scores.get(id)!).length;
      e.points = bestPoints(scores.get(id)!, best);
      if (e.points === 0) continue;
      this.gamePoints.set(id, (this.gamePoints.get(id) ?? 0) + e.points);
      this.ctx.addScore(id, e.points);
    }
    const isLast = this.puzzleIndex >= this.totalPuzzles - 1;
    this.setPhase('result', RESULT_MS, () => {
      if (!isLast) this.startRound(this.puzzleIndex + 1);
      // With a single round, round scores would just repeat the result, so skip them.
      else if (this.totalPuzzles === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  syncHost() {
    const boards: VolleyBoardView<S>[] = [...this.entries].map(([playerId, e]) => {
      const player = this.ctx.players().find((p) => p.id === playerId);
      return {
        playerId,
        name: player?.name ?? '',
        color: player?.color ?? '#ffffff',
        locked: e.locked,
        // While the shots play back, the score from before them (so it doesn't give the ending away).
        boardScore: this.phase === 'fly' ? e.scoreBefore : this.boardScore(e.board),
        place: e.place,
        points: e.points,
        state: this.hostState(e.board, e.aim),
      };
    });
    const view: VolleyHostView<S, R> = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      volley: this.volleyIndex + 1,
      totalVolleys: this.options.volleys,
      msLeft: this.msLeft(),
      phaseMs: this.phaseMs,
      seed: this.seed,
      boards,
      gamePoints: Object.fromEntries(this.gamePoints),
      round: this.roundState(),
    };
    this.ctx.sendHost({ ...view, ...this.viewExtras() });
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const e = this.entries.get(playerId);
    const all = [...this.entries.values()];
    const view: VolleyPlayerView<P> = {
      phase: this.phase,
      puzzleNumber: this.puzzleIndex + 1,
      totalPuzzles: this.totalPuzzles,
      volley: this.volleyIndex + 1,
      totalVolleys: this.options.volleys,
      msLeft: this.msLeft(),
      seed: this.seed,
      hasBoard: !!e,
      locked: e?.locked ?? false,
      lockedCount: all.filter((o) => o.locked).length,
      playing: all.length,
      boardScore: !e ? 0 : this.phase === 'fly' ? e.scoreBefore : this.boardScore(e.board),
      place: e?.place ?? null,
      points: e?.points ?? 0,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      state: e ? this.playerState(e.board, e.aim) : null,
    };
    this.ctx.sendPlayer(playerId, { ...view, ...this.viewExtras() });
  }

  protected syncAll() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.aimSyncTimer) clearTimeout(this.aimSyncTimer);
    this.timer = this.aimSyncTimer = null;
  }
}
