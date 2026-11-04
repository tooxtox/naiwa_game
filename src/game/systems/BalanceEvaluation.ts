import { BOSSES, CLASSES, GUARD, ULTIMATE, type ClassId, type PlayerStats } from '../config';
import { BuildSystem, type CoreId } from './BuildSystem';
import { COMBAT_BALANCE, lifeStealBudget, splitProjectileMultiplier } from './CombatBalance';
import { RESILIENCE } from './ResilienceSystem';

export type BalanceStage='early'|'middle'|'late';
export const BALANCE_STAGES:readonly BalanceStage[]=['early','middle','late'];
export const BALANCE_ROUTES:Readonly<Record<ClassId,readonly CoreId[]>>={
  warrior:['warrior-counter','warrior-whirlwind'],
  mage:['mage-freeze','mage-chain'],
  archer:['archer-overpierce','archer-ricochet'],
};
const round=(n:number):number=>Math.round(n*100)/100;

/** Fixed, published snapshots. These isolate build power; they are not claims
 * about how many upgrades a human necessarily acquires by the indicated wave.
 */
export function balanceStats(classId:ClassId,stage:BalanceStage):PlayerStats {
  const stats={...CLASSES[classId].stats};
  const rank=stage==='early'?1:stage==='middle'?3:5;
  stats.damage+=8*rank;stats.maxHealth+=25*rank;
  for(let i=0;i<rank;i++)stats.attackCooldown=Math.max(100,Math.round(stats.attackCooldown*.86));
  stats.critChance=Math.min(.85,stats.critChance+.12*(stage==='early'?0:rank-1));
  if(stage!=='early') {
    if(classId==='warrior'){stats.lifeSteal=stage==='middle'?4:10;stats.attackRange+=20*(stage==='middle'?2:5);}
    else if(classId==='mage'){stats.projectileCount=stage==='middle'?2:3;stats.splashRadius+=25*(stage==='middle'?2:5);}
    else {stats.projectileCount=stage==='middle'?2:3;stats.pierceCount=stage==='middle'?2:4;}
  }
  if(stage==='late'){stats.damage+=30;stats.maxHealth+=90;stats.ultimateMultiplier=1.3;}
  return stats;
}

export function balanceBuild(classId:ClassId,core:CoreId,rank:number,stage:BalanceStage):BuildSystem {
  const build=new BuildSystem(classId);
  for(let i=0;i<rank;i++)build.learnCore(core);
  // Same support investment across both routes. All are legal existing ranks.
  const supports:Record<CoreId,readonly string[]>={
    'warrior-counter':['warrior-counter-force','warrior-guard-flow'],
    'warrior-whirlwind':['warrior-vortex','warrior-momentum'],
    'mage-freeze':['mage-cold-front','mage-snowball'],
    'mage-chain':['mage-chain-reach','mage-chain-charge'],
    'archer-overpierce':['archer-spine','archer-needle'],
    'archer-ricochet':['archer-bounce-range','archer-bounce-charge'],
  };
  const supportRank=stage==='early'?0:stage==='middle'?2:6;
  for(let i=0;i<supportRank;i++)for(const id of supports[core])build.learnSupport(id);
  return build;
}

export function ultimateTheory(classId:ClassId,stats:PlayerStats,maxHealth:number,broken=false,legacy=false):number {
  const cfg=ULTIMATE[classId];
  const flat=stats.damage*cfg.damageMultiplier*stats.ultimateMultiplier*(classId==='archer'?ULTIMATE.archer.arrows:1);
  const ratio=classId==='archer'?ULTIMATE.archer.bossHealthRatioPerArrow*ULTIMATE.archer.arrows:classId==='mage'?ULTIMATE.mage.bossHealthRatio:ULTIMATE.warrior.bossHealthRatio;
  const hp=maxHealth*ratio;
  const breakMultiplier=broken?RESILIENCE.brokenDamageMultiplier:1;
  return round(legacy?(flat+hp*stats.ultimateMultiplier)*breakMultiplier:Math.min(maxHealth*COMBAT_BALANCE.ultimateBossCastCap,flat*breakMultiplier+hp));
}

/** Analytical ideal-geometry estimates, separate from the real-engine fixture simulation.
 * Crits use expectation; every projectile is assumed to connect; no dodging,
 * cover, travel time, guard downtime, overkill or ultimate lockout is deducted.
 */
export function theoryRow(classId:ClassId,stage:BalanceStage,core:CoreId,rank:number) {
  const stats=balanceStats(classId,stage),build=balanceBuild(classId,core,rank,stage),effects=build.effects();
  const attacksPerSecond=1000/stats.attackCooldown;
  const hitsPerSecond=attacksPerSecond*stats.projectileCount;
  const damageShots=Array.from({length:stats.projectileCount},(_,i)=>splitProjectileMultiplier(classId,i,stats.projectileCount)).reduce((sum,n)=>sum+n,0);
  const baseDps=stats.damage*(1+stats.critChance)*attacksPerSecond*damageShots*(classId==='warrior'?1.1:1);
  const ringDps=effects.whirlwindThreshold?stats.damage*effects.whirlwindDamageMultiplier/Math.max(.65,effects.whirlwindThreshold/hitsPerSecond):0;
  const guardBuff=effects.guardBuffDuration?effects.guardBuffMultiplier:1;
  const chargePerSecond=Math.min(hitsPerSecond*ULTIMATE.hitCharge,COMBAT_BALANCE.hitChargeBudget*1000/COMBAT_BALANCE.hitChargeWindow);
  const bossHealth=BOSSES[stage==='early'?10:stage==='middle'?30:50].maxHealth;
  const leech=lifeStealBudget(stats.maxHealth,stats.lifeSteal);
  const extraPierce=effects.pierceBonus;
  let lineMultiplier=1;
  if(classId==='mage') {
    // The fixed line fixture spaces centres 108 units apart; a large explosion
    // can hit neighbours before the chain starts looking for unvisited actors.
    const initialTargets=Math.min(5,1+Math.floor(Math.max(0,stats.splashRadius+8-17)/108));
    lineMultiplier=initialTargets;
    for(let i=1;i<=Math.min(5-initialTargets,effects.chainBounces);i++)lineMultiplier+=Math.pow(effects.chainDamageMultiplier,i);
  } else if(classId==='archer') {
    lineMultiplier=0;
    const through=Math.min(5,stats.pierceCount+extraPierce);
    for(let i=0;i<through;i++)lineMultiplier+=Math.min(effects.pierceDamageCap,1+i*effects.pierceDamageStep);
    for(let i=1;i<=Math.min(5-through,effects.ricochetBounces);i++)lineMultiplier+=Math.pow(effects.ricochetDamageMultiplier,i)*Math.min(effects.pierceDamageCap,1+(through+i-1)*effects.pierceDamageStep);
  }
  return {
    classId,stage,core,rank,stats,effects,
    theory:{
      singleDps:round(baseDps+ringDps),
      legacyMultishotSingleDps:round(stats.damage*(1+stats.critChance)*hitsPerSecond*(classId==='warrior'?1.1:1)+ringDps),
      counterBuffDps:round((baseDps+ringDps)*guardBuff),
      clusteredFiveDps:round(classId==='archer'?baseDps*lineMultiplier:(baseDps+ringDps)*5),
      alignedFiveDps:round((baseDps+ringDps)*lineMultiplier),
      leechPerSecond:round(Math.min(hitsPerSecond*stats.lifeSteal,leech)),
      legacyFiveTargetLeechPerSecond:round(hitsPerSecond*5*stats.lifeSteal),
      chargePerSecond:round(chargePerSecond),chargeSecondsWithoutKillsOrParry:round(ULTIMATE.maxCharge/chargePerSecond),
      normalCounterDamage:round(stats.damage*GUARD.normalCounterMultiplier),
      perfectBossCounterDamage:round(bossHealth*GUARD.counterBossRatio+Math.min(180,stats.damage*GUARD.perfectDamageMultiplier)*effects.counterDamageMultiplier),
      parryToughness:GUARD.parryToughness+effects.parryToughnessBonus,
      frostBossDuration:effects.frostBossFreezeDuration,frostBossCooldown:effects.frostBossCooldown,
      ultimateBossDamage:ultimateTheory(classId,stats,bossHealth),
      brokenUltimateBossDamage:ultimateTheory(classId,stats,bossHealth,true),
      legacyBrokenUltimateBossDamage:ultimateTheory(classId,stats,bossHealth,true,true),
      lateForceMarginalDps:round((baseDps+ringDps)*6/stats.damage),
      lateFinaleMarginalBossDamage:round(ultimateTheory(classId,{...stats,ultimateMultiplier:stats.ultimateMultiplier+.06},bossHealth)-ultimateTheory(classId,stats,bossHealth)),
    },
  };
}

export function theoreticalBalanceReport() {
  const rows=[];
  for(const classId of ['warrior','mage','archer'] as const)for(const stage of BALANCE_STAGES)for(const core of BALANCE_ROUTES[classId])for(const rank of [0,1,3])rows.push(theoryRow(classId,stage,core,rank));
  return {kind:'analytical-scenario-estimates',rows};
}
