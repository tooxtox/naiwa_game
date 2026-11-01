import { ENEMY, ENEMY_HEALTH_SCALING, CAMPAIGN, BOSSES, type EnemyKind, type BossWave } from '../config';

const normalizedWave=(wave:number):number=>Number.isFinite(wave)?Math.max(1,Math.floor(wave)):1;
const latePressure=(wave:number):number=>Math.pow(Math.max(0,normalizedWave(wave)-CAMPAIGN.pressureStart),2);

/** Recalculate from base HP on spawn; never multiply the previous wave's HP. */
export function getEnemyHealthMultiplier(wave:number):number {
  const completedWaves=normalizedWave(wave)-1;
  const {linearPerWave,pressurePerWave,pressureExponent}=ENEMY_HEALTH_SCALING;
  return 1+linearPerWave*completedWaves+pressurePerWave*Math.pow(completedWaves,pressureExponent)+ENEMY_HEALTH_SCALING.lateHealthPerWaveSquared*latePressure(wave);
}

export function getEnemyDamageMultiplier(wave:number):number {
  return 1+(normalizedWave(wave)-1)*.1+ENEMY_HEALTH_SCALING.lateDamagePerWaveSquared*latePressure(wave);
}

export function getEnemyDamage(kind:EnemyKind,wave:number):number {
  return Math.round(ENEMY[kind].damage*getEnemyDamageMultiplier(wave));
}

export function getBossMaxHealth(wave:BossWave):number {
  return Math.round(getEnemyMaxHealth('elite',wave)*BOSSES[wave].healthMultiplier);
}

export function getEnemyMaxHealth(kind:EnemyKind,wave:number):number {
  return Math.round(ENEMY[kind].health*getEnemyHealthMultiplier(wave));
}
