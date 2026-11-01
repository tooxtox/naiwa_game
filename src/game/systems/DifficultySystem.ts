import { ENEMY, ENEMY_HEALTH_SCALING, type EnemyKind } from '../config';

/** Recalculate from base HP on spawn; never multiply the previous wave's HP. */
export function getEnemyHealthMultiplier(wave:number):number {
  const completedWaves=Number.isFinite(wave)?Math.max(0,Math.floor(wave)-1):0;
  const {linearPerWave,pressurePerWave,pressureExponent}=ENEMY_HEALTH_SCALING;
  return 1+linearPerWave*completedWaves+pressurePerWave*Math.pow(completedWaves,pressureExponent);
}

export function getEnemyMaxHealth(kind:EnemyKind,wave:number):number {
  return Math.round(ENEMY[kind].health*getEnemyHealthMultiplier(wave));
}
