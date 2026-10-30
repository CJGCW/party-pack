import {
  MAX_AIM,
  CLEAR_CELEBRATION_MS,
  PEG_DROP,
  ballsPerPlayer,
  multiplierFor,
  playbackSeconds,
  type Peg,
  type PegHostView,
  type PegInput,
  type PegPhase,
  type PegPlayerView,
  type Shot,
} from '../../shared/games/pegDrop';
import { puzzlePoints } from '../../shared/scoring';
import { PUZZLE_RESULT_MS, ROUND_SCORES_MS } from '../../shared/timing';
import type { GameContext, MiniGame, MiniGameDefinition } from './MiniGame';
import { makePegs } from './pegDrop/layouts';
import { simulateShot } from './pegDrop/physics';

/** Time to aim before the ball fires itself. */
const AIM_MS = 20_000;
/** After the ball drops out: the hit pegs clear before the next turn. */
const SHOT_TAIL_MS = 1_500;
/** The board's scores: a little longer than other games' results, with a table to read. */
const BOARD_END_MS = PUZZLE_RESULT_MS + 2_000;
// Scoring on the shared scale: at the end of a board, the player with the most peg points
// scores 1,000 and everyone else their share of that.

class PegDrop implements MiniGame {
  private phase: PegPhase = 'aim';
  private boardIndex = 0;
  private pegs: Peg[] = [];
  /** Turn order for this board. */
  private order: string[] = [];
  private turn = 0;
  private shooterId = '';
  private angle = 0;
  private shotNumber = 0;
  private shot: Shot | null = null;
  private balls = new Map<string, number>();
  private boardPoints = new Map<string, number>();
  private lastPoints = new Map<string, number>();
  private gamePoints = new Map<string, number>();
  private phaseEndsAt = 0;
  private phaseMs = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly totalBoards: number,
  ) {}

  start() {
    this.startBoard(0);
  }

  private setPhase(phase: PegPhase, ms: number, next: () => void) {
    this.phase = phase;
    this.phaseMs = ms;
    this.phaseEndsAt = Date.now() + ms;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(next, ms);
    this.syncAll();
  }

  private startBoard(index: number) {
    this.boardIndex = index;
    this.pegs = makePegs();
    this.shotNumber = 0;
    this.shot = null;
    const players = this.ctx.players();
    const each = ballsPerPlayer(players.filter((p) => p.connected).length);
    // A different player goes first each board.
    const ids = players.map((p) => p.id);
    this.order = [...ids.slice(index % ids.length), ...ids.slice(0, index % ids.length)];
    this.balls = new Map(ids.map((id) => [id, each]));
    this.boardPoints = new Map(ids.map((id) => [id, 0]));
    this.lastPoints.clear();
    this.turn = -1;
    this.nextTurn();
  }

  /** On to the next player (in order) who's here and has a ball left; the board ends when nobody has. */
  private nextTurn() {
    const here = new Set(this.ctx.players().filter((p) => p.connected).map((p) => p.id));
    for (let i = 1; i <= this.order.length; i++) {
      const at = (this.turn + i) % this.order.length;
      const id = this.order[at];
      if (here.has(id) && (this.balls.get(id) ?? 0) > 0) {
        this.turn = at;
        this.shooterId = id;
        this.angle = 0;
        this.shot = null;
        return this.setPhase('aim', AIM_MS, () => this.fire());
      }
    }
    this.endBoard();
  }

  onInput(playerId: string, raw: unknown) {
    const input = raw as PegInput;
    if (this.phase !== 'aim' || playerId !== this.shooterId || !input) return;
    const angle = Number(input.angle);
    if (Number.isFinite(angle)) this.angle = Math.max(-MAX_AIM, Math.min(MAX_AIM, angle));
    if (input.type === 'fire') this.fire();
    // Aiming only moves the launcher on the TV.
    else if (input.type === 'aim') this.syncHost();
  }

  private fire() {
    if (this.phase !== 'aim') return;
    const shooter = this.shooterId;
    const shot = simulateShot(this.pegs, this.angle, this.shotNumber);
    this.shot = shot;
    this.balls.set(shooter, (this.balls.get(shooter) ?? 0) - (shot.caught ? 0 : 1));
    const playMs = Math.ceil(playbackSeconds(shot) * 1000) + SHOT_TAIL_MS + (shot.cleared ? CLEAR_CELEBRATION_MS : 0);
    this.setPhase('shot', playMs, () => {
      for (const hit of shot.hits) this.pegs[hit.peg].gone = true;
      this.boardPoints.set(shooter, (this.boardPoints.get(shooter) ?? 0) + shot.points);
      this.shotNumber++;
      if (shot.cleared || this.goldLeft() === 0) this.endBoard();
      else this.nextTurn();
    });
  }

  private endBoard() {
    const top = Math.max(0, ...this.boardPoints.values());
    for (const [id, raw] of this.boardPoints) {
      const points = top > 0 ? puzzlePoints(raw / top) : 0;
      this.lastPoints.set(id, points);
      if (points === 0) continue;
      this.gamePoints.set(id, (this.gamePoints.get(id) ?? 0) + points);
      this.ctx.addScore(id, points);
    }
    this.shot = null;
    const isLast = this.boardIndex >= this.totalBoards - 1;
    this.setPhase('boardEnd', BOARD_END_MS, () => {
      if (!isLast) this.startBoard(this.boardIndex + 1);
      // With a single board, round scores would just repeat the board's, so skip them.
      else if (this.totalBoards === 1) this.ctx.finish();
      else this.setPhase('gameEnd', ROUND_SCORES_MS, () => this.ctx.finish());
    });
  }

  private goldLeft() {
    return this.pegs.filter((p) => p.gold && !p.gone).length;
  }

  private goldTotal() {
    return this.pegs.filter((p) => p.gold).length;
  }

  private msLeft() {
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  /** Shots before this player's turn comes round (0 while it's theirs), or null with no balls left. */
  private turnsAway(playerId: string) {
    if (this.phase === 'aim' && playerId === this.shooterId) return 0;
    if ((this.balls.get(playerId) ?? 0) <= 0) return null;
    let away = 0;
    for (let i = 1; i <= this.order.length; i++) {
      const id = this.order[(this.turn + i) % this.order.length];
      // The shot being aimed or played counts as one.
      if (id === playerId) return away + 1;
      if ((this.balls.get(id) ?? 0) > 0) away++;
    }
    return null;
  }

  syncHost() {
    const view: PegHostView = {
      phase: this.phase,
      boardNumber: this.boardIndex + 1,
      totalBoards: this.totalBoards,
      pegs: this.pegs,
      shooterId: this.shooterId,
      angle: this.angle,
      shotNumber: this.shotNumber,
      shot: this.phase === 'shot' ? this.shot : null,
      msLeft: this.msLeft(),
      phaseMs: this.phaseMs,
      multiplier: multiplierFor(this.goldTotal() - this.goldLeft(), this.goldTotal()),
      goldLeft: this.goldLeft(),
      goldTotal: this.goldTotal(),
      players: this.ctx.players().map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        ballsLeft: this.balls.get(p.id) ?? 0,
        boardPoints: this.boardPoints.get(p.id) ?? 0,
        points: this.lastPoints.get(p.id) ?? 0,
        gamePoints: this.gamePoints.get(p.id) ?? 0,
      })),
    };
    this.ctx.sendHost(view);
  }

  syncPlayer(playerId: string) {
    const player = this.ctx.players().find((p) => p.id === playerId);
    if (!player) return;
    const view: PegPlayerView = {
      phase: this.phase,
      boardNumber: this.boardIndex + 1,
      totalBoards: this.totalBoards,
      isShooter: playerId === this.shooterId,
      shooterName: this.ctx.players().find((p) => p.id === this.shooterId)?.name ?? '',
      turnsAway: this.turnsAway(playerId),
      ballsLeft: this.balls.get(playerId) ?? 0,
      boardPoints: this.boardPoints.get(playerId) ?? 0,
      points: this.lastPoints.get(playerId) ?? 0,
      gamePoints: this.gamePoints.get(playerId) ?? 0,
      score: player.score,
      msLeft: this.msLeft(),
      multiplier: multiplierFor(this.goldTotal() - this.goldLeft(), this.goldTotal()),
      goldLeft: this.goldLeft(),
    };
    this.ctx.sendPlayer(playerId, view);
  }

  private syncAll() {
    this.syncHost();
    for (const p of this.ctx.players()) this.syncPlayer(p.id);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const pegDrop: MiniGameDefinition = {
  info: PEG_DROP,
  create: (ctx, _modeId, options) => new PegDrop(ctx, options.puzzles),
};
