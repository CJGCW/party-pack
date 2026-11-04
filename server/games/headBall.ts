import {
  BALL_R,
  BOARD_W,
  DEAD_ZONE,
  HEAD_BALL,
  HEAD_R,
  HEAD_Y,
  MOVE_SPEED,
  ROUND_MS,
  STUN_MS,
  TICK_HZ,
  throwAt,
  throwsFor,
  type HeadState,
  type Throw,
} from '../../shared/games/headBall';
import type { TiltInput } from '../../shared/games/tileTilt';
import { BoardsGame } from './boards';
import type { GameContext, MiniGameDefinition } from './MiniGame';

export interface Header {
  throws: Throw[];
  x: number;
  tilt: number;
  headed: number;
  met: Set<number>;
  stunnedUntil: number;
  bonks: number;
}

export function newHeader(seed: number): Header {
  return { throws: throwsFor(seed), x: BOARD_W / 2, tilt: 0, headed: 0, met: new Set(), stunnedUntil: 0, bonks: 0 };
}

/** Moves the player on by `dt` seconds to `ms` into the round, heading balls and taking boots. */
export function stepHeader(h: Header, dt: number, ms: number) {
  const stunned = ms < h.stunnedUntil;
  if (!stunned && Math.abs(h.tilt) > DEAD_ZONE) h.x = Math.max(HEAD_R, Math.min(BOARD_W - HEAD_R, h.x + h.tilt * MOVE_SPEED * dt));
  for (const t of h.throws) {
    if (t.at > ms) break;
    if (h.met.has(t.id)) continue;
    const p = throwAt(t, ms)!;
    if (Math.hypot(p.x - h.x, p.y - HEAD_Y) > HEAD_R + BALL_R) continue;
    h.met.add(t.id);
    if (t.boot) h.stunnedUntil = ms + STUN_MS;
    else if (!stunned) {
      h.headed++;
      h.bonks++;
    }
  }
}

class HeadBall extends BoardsGame<Header, HeadState, HeadState> {
  constructor(ctx: GameContext, totalPuzzles: number) {
    super(ctx, totalPuzzles, { roundMs: ROUND_MS, scoring: 'best', tickHz: TICK_HZ, hostEveryTicks: 2 });
  }

  protected newBoard(seed: number) {
    return newHeader(seed);
  }

  protected stepBoard(h: Header, dt: number, roundMs: number) {
    stepHeader(h, dt, roundMs);
    return false;
  }

  protected boardInput(h: Header, raw: unknown) {
    const input = raw as TiltInput;
    if (input.type === 'tilt' && Number.isFinite(input.x)) h.tilt = Math.max(-1, Math.min(1, input.x));
    return false;
  }

  protected boardScore(h: Header) {
    return h.headed;
  }

  protected hostState(h: Header): HeadState {
    // Only recent throws matter to the TV (older ones have flown off).
    const ms = this.roundMs();
    const met = h.throws.filter((t) => h.met.has(t.id) && t.at > ms - 4_000).map((t) => t.id);
    return { x: Math.round(h.x), headed: h.headed, met, stunMs: Math.max(0, h.stunnedUntil - ms), bonks: h.bonks };
  }

  protected playerState(h: Header) {
    return this.hostState(h);
  }
}

export const headBall: MiniGameDefinition = {
  info: HEAD_BALL,
  create: (ctx, _modeId, options) => new HeadBall(ctx, options.puzzles),
};
