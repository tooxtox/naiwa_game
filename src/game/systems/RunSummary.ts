import { CLASSES, type ClassId, type RunMode, type RunSummary } from '../config';
import { maxWavesForMode } from './CampaignPacing';

export interface ResolvedHit {damage:number;boss:boolean;source:string;}
export interface ResolvedDefense {damage:number;prevented:number;result:string;}
const finite=(n:number):number=>Number.isFinite(n)?Math.max(0,n):0;
const clamp=(n:number):number=>Math.max(0,Math.min(1,n));

/** Actual resolved HP changes only. Scores never reward target hit count or repeatable combo farming. */
export class RunTelemetry {
  combatSeconds=0;
  damageDealt=0;
  damageTaken=0;
  damagePrevented=0;
  perfectGuards=0;
  blocks=0;
  ultimates=0;
  bossBreaks=0;
  bossesDefeated=0;
  private bossStart:{wave:number;seconds:number;damage:number;breaks:number}|null=null;
  readonly bossResults:{wave:number;seconds:number;damageTaken:number;breaks:number}[]=[];
  constructor(readonly classId:ClassId,readonly mode:RunMode) {}
  hit(data:ResolvedHit):void {this.damageDealt+=finite(data.damage);}
  defense(data:ResolvedDefense):void {
    this.damageTaken+=finite(data.damage);this.damagePrevented+=finite(data.prevented);
    if(data.result==='parried')this.perfectGuards++;
    else if(data.result==='blocked')this.blocks++;
  }
  beginBoss(wave:number):void {
    this.bossStart={wave,seconds:this.combatSeconds,damage:this.damageTaken,breaks:this.bossBreaks};
  }
  finishBoss():void {
    if(!this.bossStart)return;
    const b=this.bossStart;this.bossStart=null;this.bossesDefeated++;
    this.bossResults.push({wave:b.wave,seconds:Math.max(0,this.combatSeconds-b.seconds),damageTaken:Math.max(0,this.damageTaken-b.damage),breaks:Math.max(0,this.bossBreaks-b.breaks)});
  }
  snapshot(completedWave:number,elapsed:number,build:string[]):RunSummary {
    const cap=maxWavesForMode(this.mode);
    const completion=Math.round(60*clamp(finite(completedWave)/cap));
    // Normalized by initial career HP, so tank builds do not automatically earn safer scores.
    const defense=Math.round(20*(1-clamp(this.damageTaken/(CLASSES[this.classId].stats.maxHealth*3))));
    const precision=Math.min(10,this.perfectGuards*2);
    const target=this.mode==='quick'?360:1500;
    const pace=completedWave>=cap?Math.round(10*clamp(target/Math.max(target,finite(elapsed)))):0;
    const score=completion+defense+precision+pace;
    return {
      combatSeconds:this.combatSeconds,damageDealt:Math.round(this.damageDealt),damageTaken:Math.round(this.damageTaken),damagePrevented:Math.round(this.damagePrevented),
      perfectGuards:this.perfectGuards,blocks:this.blocks,ultimates:this.ultimates,bossBreaks:this.bossBreaks,bossesDefeated:this.bossesDefeated,
      score,grade:score>=90?'S':score>=75?'A':score>=60?'B':'C',build:build.slice(),bossResults:this.bossResults.map(b=>({...b})),
      criteria:[`进度 ${completion}/60：已完成 ${Math.min(cap,Math.max(0,completedWave))}/${cap} 波`,
        `防守 ${defense}/20：总受伤相对初始生命的 3 倍计算，上限 20 分`,
        `精准 ${precision}/10：每次完美格挡 2 分，最多 10 分`,
        `节奏 ${pace}/10：通关后按活跃用时计算，${this.mode==='quick'?'6':'25'} 分钟内满分，超时按比例递减`,
        '评级：S ≥90 · A ≥75 · B ≥60 · C <60；连击不参与评分'],
    };
  }
}
