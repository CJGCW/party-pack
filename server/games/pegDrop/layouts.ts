import { BOARD_LEFT, BOARD_RIGHT, LAUNCHER, PEG_R, type Peg } from '../../../shared/games/pegDrop';

// Peg layouts. Each pattern lays out points; whatever lands in the playing area, not too close
// to another peg, becomes a peg, and a share of them are picked at random to be gold.

const AREA = { left: BOARD_LEFT + 50, right: BOARD_RIGHT - 50, top: 300, bottom: 940 };
/** Centre to centre: room for the ball to get between two pegs. */
const MIN_GAP = PEG_R * 2 + 30;
const MAX_PEGS = 80;
const GOLD_SHARE = 0.25;
const CX = LAUNCHER.x;

type Point = [number, number];

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Points every `spacing` px along the arc of a circle (angles in radians, 0 = right, clockwise). */
function arc(cx: number, cy: number, r: number, from: number, to: number, spacing: number): Point[] {
  const n = Math.max(1, Math.floor((Math.abs(to - from) * r) / spacing));
  return range(n + 1).map((i) => {
    const a = from + ((to - from) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

export const PATTERNS: Record<string, () => Point[]> = {
  /** Staggered rows, the classic. */
  grid: () =>
    range(9).flatMap((row) =>
      range(13).map((col): Point => [AREA.left + 20 + col * 80 + (row % 2) * 40, AREA.top + row * 75]),
    ),
  /** Bowls opening upward, one inside another. */
  bowls: () => [250, 380, 510, 640].flatMap((r) => arc(CX, 260, r, 0.15, Math.PI - 0.15, 70)),
  /** Rows of waves, each a little out of step with the last. */
  waves: () =>
    range(7).flatMap((row) =>
      range(15).map((i): Point => {
        const x = AREA.left + i * 70;
        return [x, AREA.top + 20 + row * 95 + Math.sin(i * 0.7 + row * 1.3) * 30];
      }),
    ),
  /** Rings of pegs around open middles. */
  rings: () =>
    [
      [CX - 300, 440], [CX + 300, 440], [CX, 600], [CX - 330, 800], [CX + 330, 800],
    ].flatMap(([x, y]) => [...arc(x, y, 110, 0, Math.PI * 2 - 0.3, 60), [x, y] as Point]),
  /** Arrowheads pointing up, in rows. */
  chevrons: () =>
    range(4).flatMap((row) =>
      [-1, 0, 1].flatMap((col) =>
        range(9).map((i): Point => {
          const dx = (i - 4) * 38;
          return [CX + col * 340 + dx, AREA.top + 30 + row * 170 + Math.abs(dx) * 0.8];
        }),
      ),
    ),
  /** A spiral out from the middle. */
  spiral: () =>
    range(140).map((i): Point => {
      const a = i * 0.32;
      const r = 40 + i * 3.4;
      return [CX + Math.cos(a) * r * 1.4, 620 + Math.sin(a) * r];
    }),
};

export function makePegs(pattern = pick(Object.keys(PATTERNS))): Peg[] {
  const points: Point[] = [];
  for (const [x, y] of PATTERNS[pattern]()) {
    if (x < AREA.left || x > AREA.right || y < AREA.top || y > AREA.bottom) continue;
    if (points.some(([px, py]) => Math.hypot(px - x, py - y) < MIN_GAP)) continue;
    points.push([Math.round(x), Math.round(y)]);
  }
  // Too many: drop some at random, keeping the shape.
  while (points.length > MAX_PEGS) points.splice(Math.floor(Math.random() * points.length), 1);
  const goldCount = Math.round(points.length * GOLD_SHARE);
  const gold = new Set(shuffle(range(points.length)).slice(0, goldCount));
  return points.map(([x, y], i) => ({ x, y, gold: gold.has(i), gone: false }));
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
