/** Boss-only stagger state. This uses the run clock, so pause never consumes a break. */
export const RESILIENCE = {
  breakDuration: 1800,
  recoveryImmunity: 7000,
  brokenDamageMultiplier: 1.35,
} as const;

export class ResilienceSystem {
  readonly maximum: number;
  remaining: number;
  brokenUntil = 0;
  protectedUntil = 0;
  private now = 0;
  private recovering = false;

  constructor(chapter: number) {
    this.maximum = 100 + Math.min(5, Math.max(1, chapter)) * 10;
    this.remaining = this.maximum;
  }

  get broken(): boolean { return this.now < this.brokenUntil; }
  get protected(): boolean { return !this.broken && this.now < this.protectedUntil; }

  tick(now: number): void {
    this.now = now;
    if (this.recovering && now >= this.brokenUntil) {
      this.recovering = false;
      this.remaining = this.maximum;
      this.protectedUntil = this.brokenUntil + RESILIENCE.recoveryImmunity;
    }
  }

  damage(amount: number, now: number): boolean {
    this.tick(now);
    if (!Number.isFinite(amount) || amount <= 0 || this.broken || this.protected) return false;
    this.remaining = Math.max(0, this.remaining - amount);
    if (this.remaining > 0) return false;
    this.brokenUntil = now + RESILIENCE.breakDuration;
    this.recovering = true;
    return true;
  }
}
