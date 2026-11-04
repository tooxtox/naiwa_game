import { CAMPAIGN, type RunMode } from '../config';

/** Shared by encounter composition, scenery, cover and warnings. Quick visits all five chapters. */
export function chapterForWave(wave:number,mode:RunMode='campaign'):number {
  const normalized=Number.isFinite(wave)?Math.max(1,Math.floor(wave)):1;
  return Math.min(5,Math.ceil(normalized/(mode==='quick'?2:10)));
}

export function maxWavesForMode(mode:RunMode):number {return mode==='quick'?10:CAMPAIGN.maxWaves;}
export function isBossWave(wave:number,mode:RunMode='campaign'):boolean {
  return mode==='quick'?wave===10:(CAMPAIGN.bossWaves as readonly number[]).includes(wave);
}

export const PACING={ordinary:900,chapter:1400,bossEntrance:2200,bossCleared:1800,victory:1800} as const;

/** Starts only after earned choices are resolved; the caller supplies the pause-aware run clock. */
export function intermissionForWave(clearedWave:number,mode:RunMode='campaign'):number {
  if(clearedWave>=maxWavesForMode(mode))return PACING.victory;
  if(isBossWave(clearedWave,mode))return PACING.bossCleared;
  if(isBossWave(clearedWave+1,mode))return PACING.bossEntrance;
  if(chapterForWave(clearedWave,mode)!==chapterForWave(clearedWave+1,mode))return PACING.chapter;
  return PACING.ordinary;
}
