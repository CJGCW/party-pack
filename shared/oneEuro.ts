// Smoothing for noisy readings that also need to keep up when they change fast (motion controls).

/**
 * The One Euro filter (Casiez, Roussel and Vogel, 2012): a low-pass filter whose cutoff rises with
 * how fast the value's changing. `minCutoff` (Hz) sets the smoothing when still; `beta` how much
 * speed opens it up.
 */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private at = 0;

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.6,
    private readonly dCutoff = 1,
  ) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, now = performance.now()) {
    if (this.x === null) {
      this.x = value;
      this.at = now;
      return value;
    }
    const dt = Math.max(1e-3, (now - this.at) / 1000);
    this.at = now;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.dx = 0;
  }
}
