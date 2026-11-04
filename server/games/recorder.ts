import type { Recording, Track } from '../../shared/volleys';

/** A thing being recorded: where it is now (in board units, angle in radians), or null once it's gone. */
export interface Recordable {
  id: number;
  read(): { x: number; y: number; a: number } | null;
}

type Key = { f: number; x: number; y: number; a: number };

/**
 * Records a shot as it's simulated (see shared/volleys.ts Recording): call `capture` each recorded
 * frame. A thing only gets a keyframe once it's moved (or turned) more than a little from its last
 * one, so what stays still costs nothing. When it starts moving, it gets a keyframe holding it
 * where it was on the frame before, so the TV doesn't slide it early.
 */
export class Recorder {
  private frame = 0;
  private tracks = new Map<number, Track>();
  /** Each thing's last keyframe (its first spot counts as one). */
  private last = new Map<number, Key>();

  constructor(
    readonly fps: number,
    /** Smallest move (board units) and turn (radians) worth a keyframe. */
    private readonly minMove = 1,
    private readonly minTurn = 0.02,
  ) {}

  capture(things: Recordable[]) {
    const f = this.frame++;
    for (const thing of things) {
      const at = thing.read();
      if (!at) {
        this.gone(thing.id, f);
        continue;
      }
      const now: Key = { f, x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10, a: Math.round(at.a * 1000) / 1000 };
      const last = this.last.get(thing.id);
      if (!last) {
        this.last.set(thing.id, now);
        // Something new appearing (a shot) starts here; what was on the board already starts where the board has it.
        if (f > 0) this.key(thing.id, now);
        continue;
      }
      if (Math.hypot(now.x - last.x, now.y - last.y) < this.minMove && Math.abs(now.a - last.a) < this.minTurn) continue;
      if (last.f < f - 1) this.key(thing.id, { ...last, f: f - 1 });
      this.key(thing.id, now);
      this.last.set(thing.id, now);
    }
  }

  private key(id: number, at: Key) {
    let track = this.tracks.get(id);
    if (!track) this.tracks.set(id, (track = { id, keys: [], goneAt: null }));
    const k = track.keys;
    // Don't repeat a keyframe already there.
    if (k.length && k[k.length - 4] === at.f) return;
    k.push(at.f, at.x, at.y, at.a);
  }

  /** Marks something gone from frame `f` (now, by default): a shot leaving the board, a block broken. */
  gone(id: number, f = this.frame) {
    let track = this.tracks.get(id);
    if (!track) this.tracks.set(id, (track = { id, keys: [], goneAt: null }));
    if (track.goneAt === null) track.goneAt = f;
  }

  finish(): Recording {
    return { fps: this.fps, frames: this.frame, tracks: [...this.tracks.values()] };
  }
}
