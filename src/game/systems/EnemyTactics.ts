/** Floor-space distances: drawings and damage checks deliberately share them. */
export const ENEMY_TACTICS = {
  meleeRadius: 82,
  meleeWindup: 440,
  rangedWindup: 640,
  eliteWindup: 740,
  rushSpeed: 460,
  rushDuration: 460,
  rushRadius: 63,
  pathInterval: 650,
  blockedPathInterval: 180,
  separationRadius: 63,
  separationStrength: .72,
} as const;

/** Alternating handedness is deterministic and never follows visual randomness. */
export function encounterSide(slot: number): number { return slot % 2 === 0 ? 1 : -1; }

