/**
 * Damped harmonic spring (semi-implicit Euler). Stable at 60 Hz for the stiffness ranges used here.
 * `stiffness` is in 1/s² and `damping` in 1/s; a critically damped spring has damping = 2·√stiffness.
 */
export class Spring {
  value: number;
  velocity = 0;
  target: number;

  constructor(
    initial = 0,
    public stiffness = 220,
    public damping = 14,
  ) {
    this.value = initial;
    this.target = initial;
  }

  step(dt: number): number {
    const accel = this.stiffness * (this.target - this.value) - this.damping * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    return this.value;
  }

  impulse(v: number): void {
    this.velocity += v;
  }

  snap(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }

  /** True when the spring is at rest within `eps`. */
  settled(eps = 1e-3): boolean {
    return Math.abs(this.value - this.target) < eps && Math.abs(this.velocity) < eps;
  }
}

/** Two independent springs for a 2D point. */
export class Spring2 {
  readonly x: Spring;
  readonly y: Spring;

  constructor(x = 0, y = 0, stiffness = 220, damping = 14) {
    this.x = new Spring(x, stiffness, damping);
    this.y = new Spring(y, stiffness, damping);
  }

  setTarget(x: number, y: number): void {
    this.x.target = x;
    this.y.target = y;
  }

  step(dt: number): void {
    this.x.step(dt);
    this.y.step(dt);
  }

  snap(x: number, y: number): void {
    this.x.snap(x);
    this.y.snap(y);
  }

  settled(eps?: number): boolean {
    return this.x.settled(eps) && this.y.settled(eps);
  }
}
