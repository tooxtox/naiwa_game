import type { BossWave, ClassId } from '../config';
import { Enemy } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
import type { GameScene } from '../scenes/GameScene';
import { balanceBuild, balanceStats, type BalanceStage } from './BalanceEvaluation';
import type { CoreId } from './BuildSystem';
import type { NavigationGrid } from './NavigationGrid';
import { splitProjectileMultiplier } from './CombatBalance';

export interface BalanceScenario {
  classId:ClassId;stage:BalanceStage;core:CoreId;rank:number;
  formation:'single'|'cluster'|'line'|'boss';
  duration?:number;parry?:boolean;ultimates?:boolean;
  legacyMultishot?:boolean;
}

/** DEV-only fixed-target harness. It calls the real damage, projectile, build,
 * frost, stagger and death paths at 60 simulation steps/second. Enemy locomotion,
 * incoming attacks, obstacles, human aiming and reaction time are excluded.
 * Never import this module from production entry points.
 */
export function runEngineBalance(scene:GameScene,options:BalanceScenario) {
  if(scene.player.classId!==options.classId)throw new Error('Start the matching class before a balance fixture.');
  const p=scene.player,combat=scene.combat,stats=balanceStats(options.classId,options.stage);
  const originalRandom=Math.random,callbacks={hit:combat.onHit,kill:combat.onKill,damage:combat.onDamage};
  const launch=Reflect.get(combat,'launch') as (...args:unknown[])=>void;
  let launchIndex=0;
  if(options.legacyMultishot)Reflect.set(combat,'launch',(...args:unknown[])=>{
    // Counterfactual replay: restore ONLY the old full-damage extra shots.
    // Damage resolution, geometry, pools, RNG and all other 1.1 rules stay real.
    if(!args[4])args[2]=Number(args[2])/splitProjectileMultiplier(options.classId,launchIndex++%stats.projectileCount,stats.projectileCount);
    launch.apply(combat,args);
  });
  let seed=0x110F20;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  combat.onHit=()=>{};combat.onKill=()=>{};combat.onDamage=()=>{};
  const originals=scene.waves.enemies;
  combat.clear();Reflect.set(combat,'lastTick',0);Reflect.set(combat,'solids',[]);
  // Expire the bounded effect pools before starting another fixture.
  scene.effects.tick(10000);
  for(const enemy of originals)if(enemy.active)enemy.destroy();
  scene.waves.enemies=[];
  p.stats={...stats};p.health=10;p.dead=false;p.combo=0;p.ultimateCharge=0;
  p.guardUntil=0;p.perfectGuardUntil=0;p.invulnerableUntil=0;p.nextUltimate=0;
  p.body.enable=true;p.body.reset(960,640);p.attackAngle=0;p.aimAngle=0;
  combat.build=balanceBuild(options.classId,options.core,options.rank,options.stage);
  const nav=Reflect.get(scene.waves,'nav') as NavigationGrid;
  const targets:Enemy[]=[];
  const bossWave:BossWave=options.stage==='early'?10:options.stage==='middle'?30:50;
  if(options.formation==='boss')targets.push(new Boss(scene,1050,640,bossWave,nav));
  else {
    const count=options.formation==='single'?1:5;
    for(let i=0;i<count;i++) {
      const x=options.formation==='line'?1050+i*108:1050+(i%2)*28;
      const y=options.formation==='cluster'?640+(Math.floor(i/2)-1)*22:640;
      const enemy=new Enemy(scene,x,y,'melee',1,nav);enemy.health=enemy.maxHealth=100000000;
      targets.push(enemy);
    }
  }
  scene.waves.enemies=targets;
  let damage=0,hits=0,heal=0,breaks=0,parries=0,casts=0,firstCharge:number|null=null;
  let bossDefeatedAt:number|null=null,nextAttack=1000,nextParry=4500,attackIndex=0;
  const phases:number[]=[];
  const resolved=(event:{damage:number}):void=>{damage+=event.damage;hits++;};
  const broken=():void=>{breaks++;};
  const phase=(boss:Boss):void=>{phases.push(boss.bossPhase);};
  scene.events.on('combat-resolved-hit',resolved);
  scene.events.on('boss-break',broken);scene.events.on('boss-phase',phase);
  const duration=options.duration??(options.formation==='boss'?180000:12000),step=1000/60;
  let elapsed=0;
  try {
    for(let frame=0;frame<=Math.ceil(duration/step);frame++) {
      elapsed=Math.min(duration,frame*step);const now=1000+elapsed;
      p.health=10;Reflect.set(p,'currentTime',now);
      const boss=targets[0] instanceof Boss?targets[0]:null;
      if(boss?.active)boss.tick(now,p,()=>{},()=>{});
      if(options.parry&&boss?.active&&now>=nextParry) {
        p.guardUntil=now+650;p.perfectGuardUntil=now+180;p.invulnerableUntil=0;
        Reflect.set(p,'guardCounterReady',true);
        combat.acquireTarget(targets,now);combat.hurt(25,boss.x,now,boss.y,boss);
        p.guardUntil=0;p.perfectGuardUntil=0;parries++;nextParry+=6000;
      }
      if(firstCharge===null&&p.ultimateCharge>=100)firstCharge=elapsed;
      if(options.ultimates&&p.ultimateCharge>=100&&now>=p.nextUltimate) {
        p.ultimateCharge=0;p.nextUltimate=now+1800;
        combat.ultimate(targets,now);nextAttack=Math.max(nextAttack,now+650);casts++;
      }
      if(now>=nextAttack&&targets.some(e=>e.active&&e.state!=='Dead')) {
        p.attackStep=attackIndex++%3+1;combat.attack(targets,now);nextAttack=now+stats.attackCooldown;
      }
      combat.tick(now,targets);scene.effects.tick(step);
      heal+=Math.max(0,p.health-10);
      if(boss&&!boss.active){bossDefeatedAt=elapsed;break;}
    }
    return {
      ...options,kind:'real-engine-fixed-target',durationMs:Math.round(elapsed),damage,hits,
      dps:Math.round(damage/Math.max(.001,elapsed/1000)*100)/100,
      healingPerSecond:Math.round(heal/Math.max(.001,elapsed/1000)*100)/100,
      firstChargeMs:firstCharge===null?null:Math.round(firstCharge),
      remainingCharge:p.ultimateCharge,parries,ultimates:casts,breaks,bossPhases:phases,
      bossDefeatedMs:bossDefeatedAt===null?null:Math.round(bossDefeatedAt),
      bossHealth:targets[0] instanceof Boss?targets[0].maxHealth:null,
      remainingBossHealth:targets[0] instanceof Boss?targets[0].health:null,
      activeProjectiles:(Reflect.get(combat,'projectiles') as {active:boolean}[]).filter(v=>v.active).length,
      activeChains:(Reflect.get(combat,'chains') as unknown[]).length,
      guardDamage:Math.round(stats.damage*.35),
      note:'60Hz fixed targets, seeded crits, no cover or incoming damage; automatic ultimate/parry only where explicitly enabled; not human playtime.',
    };
  } finally {
    scene.events.off('combat-resolved-hit',resolved);
    scene.events.off('boss-break',broken);scene.events.off('boss-phase',phase);
    combat.clear();scene.effects.tick(10000);
    for(const enemy of targets)if(enemy.active)enemy.destroy();
    scene.waves.enemies=[];
    combat.onHit=callbacks.hit;combat.onKill=callbacks.kill;combat.onDamage=callbacks.damage;
    Math.random=originalRandom;
    Reflect.set(combat,'launch',launch);
    scene.physics.pause();
  }
}
