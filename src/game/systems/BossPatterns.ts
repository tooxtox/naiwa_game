import type { BossSkill, BossWave } from '../config';

export const BOSS_ATTACK = {
  chargeRadius: 67,
  chargeDuration: 640,
  chargeSpeed: 400,
  finalChargeSpeed: 440,
  ringRadius: 150,
  meteorWindup: 1150,
  phaseBreath: 1000,
} as const;

const LATER_PATTERNS: Record<BossWave, readonly BossSkill[]> = {
  10: ['charge', 'charge', 'ring'],
  20: ['fan', 'meteor', 'ring', 'fan'],
  30: ['meteor', 'charge', 'ring', 'charge'],
  40: ['fan', 'meteor', 'fan', 'ring'],
  50: ['charge', 'meteor', 'fan', 'ring'],
};
const FINALE: readonly BossSkill[] = ['fan', 'meteor', 'charge', 'ring', 'fan', 'ring'];

/** The second half changes decisions as well as speed, with no extra simultaneous cast. */
export function bossPattern(wave: BossWave, phase: number, initial: readonly BossSkill[]): readonly BossSkill[] {
  return phase >= 3 ? FINALE : phase === 2 ? LATER_PATTERNS[wave] : initial;
}

export function bossFanOffsets(wave: BossWave, phase: number): number[] {
  const half = phase >= 3 ? 5 : phase > 1 ? 4 : 3;
  const leaveCenter = phase > 1 && (wave === 20 || wave === 50);
  const offsets: number[] = [];
  for (let i = -half; i <= half; i++) if (!leaveCenter || i !== 0) offsets.push(i * .17);
  return offsets;
}

/** A marked corridor in advanced rings gives a readable way out of the blast radius. */
export function bossRingOffsets(wave: BossWave, phase: number, serial: number): number[] {
  const count = phase >= 3 ? 18 : phase === 2 ? 14 : 10;
  const corridor = phase > 1 && (wave === 30 || wave === 40 || wave === 50);
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2 + .12 * serial;
    const relative = Math.atan2(Math.sin(angle), Math.cos(angle));
    if (!corridor || Math.abs(relative) >= .4) offsets.push(angle);
  }
  return offsets;
}
