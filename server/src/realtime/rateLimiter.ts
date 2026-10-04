/** Fenêtre glissante : au plus `limit` jetons par `windowMs`. */
export class RateLimiter {
  private readonly stamps: number[] = [];
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs = 60_000, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  private prune(): void {
    const min = this.now() - this.windowMs;
    while (this.stamps.length && this.stamps[0]! <= min) this.stamps.shift();
  }

  tryTake(): boolean {
    this.prune();
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(this.now());
    return true;
  }

  get remaining(): number {
    this.prune();
    return this.limit - this.stamps.length;
  }
}
