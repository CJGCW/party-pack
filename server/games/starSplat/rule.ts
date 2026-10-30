import { SHAPES, TARGET_STARS, wallSize, type Answers, type Ball, type Target } from '../../../shared/games/starSplat';

type Feature = 'color' | 'shape' | 'inner';
type Dim = 'section' | 'row' | 'col';

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A wall's hidden rule. Each of the ball's features picks one of the wall's dimensions (row and
 * column; from Hard up, section, row and column within the section), each value to its own place
 * in a random order. From Medium, the column also shifts one along with each row down (a Latin
 * square), so the same shape lands in a different column on every row.
 */
export class Rule {
  readonly rows: number;
  readonly cols: number;
  /** Which feature picks which dimension. */
  readonly dims: Map<Dim, Feature>;
  /** Each feature's values, in the order of the places they pick. */
  readonly orders: Map<Feature, number[]>;
  readonly shifts: boolean;

  constructor(
    readonly level: number,
    random = Math.random,
  ) {
    const size = wallSize(level);
    this.rows = size.rows;
    this.cols = size.cols;
    const features: Feature[] = level >= 3 ? ['color', 'shape', 'inner'] : ['color', 'shape'];
    const dims: Dim[] = level >= 3 ? ['section', 'row', 'col'] : ['row', 'col'];
    const assigned = shuffled(features, random);
    this.dims = new Map(dims.map((d, i) => [d, assigned[i]]));
    this.orders = new Map(features.map((f) => [f, shuffled([0, 1, 2, 3, 4], random)]));
    this.shifts = level === 2 || level === 4;
  }

  /** Where the feature puts a ball along a dimension (0 to 4). */
  private place(dim: Dim, ball: Ball) {
    const feature = this.dims.get(dim)!;
    return this.orders.get(feature)!.indexOf(ball[feature] ?? 0);
  }

  /** The brick a ball hits (row * cols + col). */
  cellFor(ball: Ball) {
    const row = this.place('row', ball);
    let col = this.place('col', ball);
    if (this.shifts) col = (col + row) % 5;
    const section = this.dims.has('section') ? this.place('section', ball) : 0;
    return row * this.cols + section * 5 + col;
  }

  /** Every ball there is at this level. */
  allBalls(): Ball[] {
    const balls: Ball[] = [];
    for (let color = 0; color < 5; color++)
      for (let shape = 0; shape < SHAPES.length; shape++) {
        if (this.level >= 3) for (let inner = 0; inner < 5; inner++) balls.push({ color, shape, inner });
        else balls.push({ color, shape });
      }
    return balls;
  }

  /** Eight different bricks to aim for, with their stars. */
  pickTargets(random = Math.random): Target[] {
    const cells = shuffled(
      Array.from({ length: this.rows * this.cols }, (_, i) => i),
      random,
    );
    return TARGET_STARS.map((stars, i) => ({ cell: cells[i], stars }));
  }

  /** A ball that hits each target, for the reveal. */
  answersFor(targets: Target[]): Answers {
    const balls = this.allBalls();
    return targets.map((t) => ({ cell: t.cell, ball: balls.find((b) => this.cellFor(b) === t.cell)! }));
  }
}
