import * as Phaser from 'phaser';
import { WORLD, CLASSES, ULTIMATE, GUARD } from '../config';
import { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { Effects } from './Effects';
import type { AudioManager } from './AudioManager';
import { Boss } from '../entities/Boss';
import { TargetingSystem } from './TargetingSystem';
import { HitStop, cameraShake } from './CombatFeedback';
import type { BuildSystem } from './BuildSystem';
import { BossCastBudget, COMBAT_BALANCE, RollingCombatBudget, lifeStealBudget, splitProjectileMultiplier } from './CombatBalance';
import { RESILIENCE } from './ResilienceSystem';

type ProjectileKind = 'magic' | 'arrow';
interface Projectile {
  image:Phaser.GameObjects.Image; active:boolean; kind:ProjectileKind;
  x:number; y:number; angle:number; speed:number; damage:number; traveled:number; range:number;
  born:number; pierces:number; critical:boolean; ultimate:boolean; splash:number;
  bossHealthRatio:number; enemyHealthRatio:number;
  castBudget:BossCastBudget|null;
  hit:Set<Enemy>; target:Enemy|null;
  hits:number; bounces:number;
}
interface Solid {left:number;right:number;top:number;bottom:number;}
interface Ripple {x:number;y:number;born:number;duration:number;radius:number;color:number;}
interface Meteor {x:number;y:number;born:number;landAt:number;damage:number;radius:number;bossHealthRatio:number;enemyHealthRatio:number;castBudget:BossCastBudget;}
interface Spin {nextAt:number;left:number;damage:number;bossHealthRatio:number;enemyHealthRatio:number;castBudget:BossCastBudget;}
interface Volley {nextAt:number;left:number;damage:number;bossHealthRatio:number;enemyHealthRatio:number;castBudget:BossCastBudget;}

/** Floor-space combat: visuals are raised above the same 2.5D collision plane. */
export class CombatSystem {
  bullets:Phaser.Physics.Arcade.Group;
  target:Enemy|null=null;
  onKill:(enemy:Enemy)=>void=()=>{};
  onHit:()=>void=()=>{};
  onDamage:()=>void=()=>{};
  private readonly projectiles:Projectile[]=[];
  private readonly solids:Solid[]=[];
  private readonly telegraphs:Phaser.GameObjects.Graphics;
  private readonly targetMarker:Phaser.GameObjects.Graphics;
  private readonly ripples:Ripple[]=[];
  private readonly meteors:Meteor[]=[];
  private readonly spins:Spin[]=[];
  private readonly volleys:Volley[]=[];
  private enemies:Enemy[]=[];
  private lastTick=0;
  private readonly targeting=new TargetingSystem<Enemy>();
  readonly hitStop=new HitStop();
  build:BuildSystem|null=null;
  private readonly frost=new WeakMap<Enemy,{stacks:number;expires:number;immuneUntil:number}>();
  private readonly chains:{x:number;y:number;damage:number;nextAt:number;left:number;visited:Set<Enemy>}[]=[];
  private readonly hitCharge=new RollingCombatBudget();
  private readonly leech=new RollingCombatBudget();

  constructor(private scene:Phaser.Scene,private player:Player,private effects:Effects,obstacles:Phaser.Physics.Arcade.StaticGroup,private audio:AudioManager|null=null) {
    this.bullets=scene.physics.add.group({defaultKey:'bullet',maxSize:96,allowGravity:false});
    this.bullets.createMultiple({key:'bullet',quantity:96,active:false,visible:false});
    this.bullets.children.forEach(child=>(child as Phaser.Physics.Arcade.Image).disableBody(true,true));
    this.refreshObstacles(obstacles);
    scene.physics.add.collider(this.bullets,obstacles,bullet=>this.recycle(bullet as Phaser.Physics.Arcade.Image));
    scene.physics.add.overlap(player,this.bullets,(_p,bullet)=>{
      const b=bullet as Phaser.Physics.Arcade.Image;
      this.hurt(Number(b.getData('damage')),b.x,Number(b.getData('clock')),b.y,(b.getData('owner') as Enemy|null)??null);this.recycle(b);
    });
    this.makeProjectileTextures();
    for(let i=0;i<64;i++)this.projectiles.push({image:scene.add.image(-100,-100,'hero-arrow').setVisible(false),active:false,kind:'arrow',x:0,y:0,angle:0,speed:0,damage:0,traveled:0,range:0,born:0,pierces:1,critical:false,ultimate:false,splash:0,bossHealthRatio:0,enemyHealthRatio:0,castBudget:null,hit:new Set(),target:null,hits:0,bounces:0});
    this.telegraphs=scene.add.graphics().setDepth(5000);
    this.targetMarker=scene.add.graphics();
  }

  /** Cover only changes between waves. Keep projectile and targeting geometry in sync. */
  refreshObstacles(obstacles:Phaser.Physics.Arcade.StaticGroup):void {
    this.solids.length=0;
    obstacles.children.forEach(child=>{
      const body=(child as Phaser.Physics.Arcade.Image).body;
      if(body&&body.enable)this.solids.push({left:body.left,right:body.right,top:body.top,bottom:body.bottom});
    });
    this.targeting.clear();this.target=null;
  }

  /** Clear targets in reach take priority; hysteresis keeps equally good targets stable. */
  acquireTarget(enemies:Enemy[],now=this.lastTick):Enemy|null {
    this.enemies=enemies;
    this.target=this.targeting.choose(enemies,this.player.x,this.player.y,this.player.stats.attackRange,WORLD.verticalScale,now,e=>this.obstacleTime(this.player.x,this.player.y,e.x,e.y)===Infinity);
    return this.target;
  }

  hurt(amount:number,sourceX:number,now:number,sourceY=this.player.y,attacker:Enemy|null=null):void {
    const previousHealth=this.player.health;
    const damaged=this.player.hurt(amount,sourceX,now,sourceY);
    const result=this.player.lastDamageResult;
    if(result!=='ignored') {
      const damage=Math.max(0,previousHealth-this.player.health);
      const prevented=result==='parried'?Math.max(0,amount):result==='blocked'?Math.max(0,amount-Math.max(1,Math.ceil(amount*(1-this.player.stats.guardReduction)))):0;
      this.scene.events.emit('combat-resolved-defense',{damage,prevented,result});
    }
    if(result==='parried') {
      this.effects.burst(this.player.x,this.player.y-24,0xa7f9ff,20,250);
      this.ripple(this.player.x,this.player.y,150,0xa7f9ff,now,420);
      this.clearHostile(this.player.x,this.player.y,165);
      for(const enemy of this.enemies)if(enemy.active&&this.distance(enemy.x,enemy.y,this.player.x,this.player.y)<150)enemy.stun(now,450);
      this.guardCounter(now,attacker,sourceX,sourceY,true);
      this.impactStop(now,42);cameraShake(this.scene,85,.0025);return;
    }
    if(!damaged)return;
    this.effects.burst(this.player.x,this.player.y-26,result==='blocked'?0x8edfff:0xff758c,result==='blocked'?9:12,180);
    if(result==='blocked') {
      this.ripple(this.player.x,this.player.y,56,0x8edfff,now,250);
      this.audio?.action(this.player.classId,'guard',.85);
      this.guardCounter(now,attacker,sourceX,sourceY,false);
    }
    cameraShake(this.scene,result==='blocked'?55:110,result==='blocked'?.001:.003);
    if(result!=='blocked')this.audio?.sfx('hurt',.85);
    this.onDamage();
  }

  /** Reprisal targets the actual attacker plus close neighbours, never unrelated distant actors. */
  private guardCounter(now:number,attacker:Enemy|null,sourceX:number,sourceY:number,perfect:boolean):void {
    if(!this.player.consumeGuardCounter())return;
    const p=this.player,color=perfect?0xffdb86:0xa0dabc,cfg=this.build?.effects();
    this.build?.guardSuccess(now,perfect);
    const liveAttacker=attacker?.active&&attacker.state!=='Dead'?attacker:null;
    const tx=liveAttacker?.x??sourceX,ty=liveAttacker?.y??sourceY;
    const angle=Math.atan2((ty-p.y)/WORLD.verticalScale,tx-p.x);
    p.playCounter(now,angle);
    const radius=perfect?Math.max(GUARD.counterRadius,cfg?.counterShockwaveRadius??0):GUARD.counterRadius*.65;
    this.ripple(p.x,p.y,radius,color,now,perfect?420:240);
    this.effects.skill('counter',p.x,p.y-24,angle,color,p.classId,liveAttacker?this.distance(p.x,p.y,tx,ty):0);
    if(liveAttacker)this.counterHit(liveAttacker,now,perfect);
    for(const enemy of this.enemies) {
      if(enemy===liveAttacker||!enemy.active||enemy.state==='Dead'||this.distance(enemy.x,enemy.y,p.x,p.y)>radius||this.obstacleTime(p.x,p.y,enemy.x,enemy.y)!==Infinity)continue;
      this.counterHit(enemy,now,perfect);
    }
  }

  private counterHit(enemy:Enemy,now:number,perfect:boolean):void {
    const ratio=enemy.isBoss?GUARD.counterBossRatio:GUARD.counterEnemyRatio;
    const angle=Math.atan2((enemy.y-this.player.y)/WORLD.verticalScale,enemy.x-this.player.x);
    if(perfect&&enemy instanceof Boss)enemy.damageToughness(GUARD.parryToughness+(this.build?.effects().parryToughnessBonus??0),now);
    const multiplier=perfect?(this.build?.effects().counterDamageMultiplier??1):1;
    const flat=Math.min(180,this.player.stats.damage*GUARD.perfectDamageMultiplier);
    // A core amplifies the shockwave, never multiplies the boss's percentage HP.
    const healthDamage=perfect&&enemy.isBoss?enemy.maxHealth*ratio:0;
    const amount=perfect?enemy.isBoss?flat*multiplier:(enemy.maxHealth*ratio+flat)*multiplier:this.player.stats.damage*GUARD.normalCounterMultiplier;
    this.damageEnemy(enemy,amount,angle,now,false,'counter',healthDamage);
  }

  fire(enemy:Enemy,spread:number,now:number):void {
    const b=this.bullets.get(enemy.x,enemy.y-8,'bullet') as Phaser.Physics.Arcade.Image|null;
    if(!b)return;
    b.enableBody(true,enemy.x,enemy.y-8,true,true);
    b.body!.setSize(enemy.isBoss?13:11,enemy.isBoss?13:11);b.setDepth(enemy.y+125).setTint(enemy.projectileColor).setScale(enemy.isBoss?1.25:1);
    const angle=Math.atan2((this.player.y-enemy.y)/WORLD.verticalScale,this.player.x-enemy.x)+spread;
    const speed=enemy.projectileSpeed;
    b.setVelocity(Math.cos(angle)*speed,Math.sin(angle)*speed*WORLD.verticalScale);
    b.setData({damage:enemy.damage,born:now,clock:now,owner:enemy});
    this.audio?.sfx('enemy-shot',.35);
  }

  attack(enemies:Enemy[],now:number):void {
    if(this.player.dead)return;
    const p=this.player,target=this.acquireTarget(enemies);
    if(target) {
      p.attackAngle=Math.atan2((target.y-p.y)/WORLD.verticalScale,target.x-p.x);
      p.aimAngle=p.attackAngle;p.facing=Math.cos(p.attackAngle)<0?-1:1;
    }
    this.effects.skill('attack',p.x,p.y-24,p.attackAngle,CLASSES[p.classId].color,p.classId,Math.min(110,p.stats.attackRange*.7));
    if(p.classId==='warrior'){this.melee(enemies,now);return;}
    const count=Math.min(7,Math.max(1,p.stats.projectileCount));
    for(let i=0;i<count;i++) {
      const spread=(i-(count-1)/2)*(p.classId==='mage'?.16:.105);
      const critical=Math.random()<p.stats.critChance;
      this.launch(p.classId==='mage'?'magic':'arrow',p.attackAngle+spread,p.stats.damage*(critical?2:1)*(this.build?.attackMultiplier(now)??1)*splitProjectileMultiplier(p.classId,i,count),now,false,critical,p.stats.pierceCount,p.stats.splashRadius,target);
    }
    this.audio?.action(p.classId,'attack',.72);
    this.effects.burst(p.x+Math.cos(p.attackAngle)*35,p.y-28+Math.sin(p.attackAngle)*22,CLASSES[p.classId].color,4,75);
  }

  melee(enemies:Enemy[],now:number):void {
    const p=this.player,aimX=Math.cos(p.attackAngle),aimY=Math.sin(p.attackAngle);
    this.audio?.action(p.classId,'attack',.72);
    this.effects.burst(p.x+aimX*55,p.y-23+aimY*35,0xffd27b,4,90);
    for(const enemy of enemies) {
      if(!enemy.active||enemy.state==='Dead')continue;
      const dx=enemy.x-p.x,dy=(enemy.y-p.y)/WORLD.verticalScale,distance=Math.hypot(dx,dy);
      if(distance<=p.stats.attackRange+(this.build?.rangeBonus(now)??0)&&(distance<25||(dx*aimX+dy*aimY)/distance>-.05)&&this.obstacleTime(p.x,p.y,enemy.x,enemy.y)===Infinity) {
        const critical=Math.random()<p.stats.critChance;
        this.damageEnemy(enemy,p.stats.damage*(critical?2:1)*(p.attackStep===3?1.3:1)*(this.build?.attackMultiplier(now)??1),Math.atan2(dy,dx),now,critical,'attack');
      }
    }
  }

  /** Player owns charge consumption. Ultimate hits intentionally grant no new charge. */
  ultimate(enemies:Enemy[],now:number):void {
    if(this.player.dead)return;
    const p=this.player,target=this.acquireTarget(enemies),multiplier=p.stats.ultimateMultiplier,castBudget=new BossCastBudget();
    if(target)p.attackAngle=Math.atan2((target.y-p.y)/WORLD.verticalScale,target.x-p.x);
    const color=CLASSES[p.classId].color;
    this.effects.burst(p.x,p.y-36,color,25,280);
    this.audio?.sfx('ultimate',.85);
    cameraShake(this.scene,170,.004);
    if(p.classId==='warrior') {
      const cfg=ULTIMATE.warrior;
      this.effects.skill('ultimate',p.x,p.y-24,p.attackAngle,color,p.classId,cfg.radius);
      if(this.spins.length<3)this.spins.push({nextAt:now+cfg.windup,left:cfg.pulses,damage:p.stats.damage*cfg.damageMultiplier*multiplier/cfg.pulses,bossHealthRatio:cfg.bossHealthRatio/cfg.pulses,enemyHealthRatio:cfg.enemyHealthRatio*multiplier/cfg.pulses,castBudget});
    } else if(p.classId==='mage') {
      const cfg=ULTIMATE.mage;
      const x=target?.x??p.x+Math.cos(p.aimAngle)*180,y=target?.y??p.y+Math.sin(p.aimAngle)*130;
      const tx=Phaser.Math.Clamp(x,WORLD.inset,WORLD.width-WORLD.inset),ty=Phaser.Math.Clamp(y,WORLD.inset,WORLD.height-WORLD.inset);
      if(this.meteors.length<6)this.meteors.push({x:tx,y:ty,born:now,landAt:now+cfg.windup,damage:p.stats.damage*cfg.damageMultiplier*multiplier,radius:cfg.radius,bossHealthRatio:cfg.bossHealthRatio,enemyHealthRatio:cfg.enemyHealthRatio*multiplier,castBudget});
      this.effects.skill('ultimate',tx,ty-24,p.attackAngle,color,p.classId,cfg.radius);
      this.ripple(p.x,p.y,80,color,now,400);
    } else {
      const cfg=ULTIMATE.archer;
      this.effects.skill('ultimate',p.x,p.y-24,p.attackAngle,color,p.classId,160);
      if(this.volleys.length<3)this.volleys.push({nextAt:now,left:cfg.arrows,damage:p.stats.damage*cfg.damageMultiplier*multiplier,bossHealthRatio:cfg.bossHealthRatioPerArrow,enemyHealthRatio:cfg.enemyHealthRatioPerArrow*multiplier,castBudget});
      this.ripple(p.x,p.y,110,color,now,350);
    }
  }

  tick(now:number,enemies=this.enemies):void {
    this.enemies=enemies;
    const delta=this.lastTick?Math.min(40,Math.max(0,now-this.lastTick)):16;
    this.lastTick=now;
    this.bullets.children.forEach(child=>{
      const b=child as Phaser.Physics.Arcade.Image;
      if(b.active){b.setData('clock',now);b.setDepth(b.y+135);if(now-Number(b.getData('born'))>5000||this.outside(b.x,b.y))this.recycle(b);}
    });
    this.tickUltimates(now,enemies);
    for(const projectile of this.projectiles)if(projectile.active)this.advance(projectile,delta/1000,now,enemies);
    for(let i=this.meteors.length-1;i>=0;i--) {
      const meteor=this.meteors[i];
      if(now<meteor.landAt)continue;
      this.meteors.splice(i,1);
      this.explode(meteor.x,meteor.y,meteor.radius,meteor.damage,now,true,true,enemies,meteor.bossHealthRatio,meteor.enemyHealthRatio,meteor.castBudget);
      this.clearHostile(meteor.x,meteor.y,meteor.radius);
      cameraShake(this.scene,180,.004);
    }
    this.tickChains(now);this.drawEffects(now);
    this.targetMarker.clear();
    if(this.target?.active&&this.target.state!=='Dead') {
      const pulse=.6+Math.sin(now*.008)*.15,color=CLASSES[this.player.classId].color;
      this.targetMarker.setPosition(this.target.x,this.target.y).setDepth(this.target.y+96);
      this.targetMarker.lineStyle(2,color,pulse).strokeEllipse(0,-1,this.target.hitRadius*2.5,this.target.hitRadius*1.25);
      this.targetMarker.fillStyle(color,pulse).fillTriangle(-6,-8,6,-8,0,-2);
    }
  }

  clear():void {
    this.bullets.children.forEach(child=>this.recycle(child as Phaser.Physics.Arcade.Image));
    for(const p of this.projectiles)this.release(p);
    this.meteors.length=0;this.spins.length=0;this.volleys.length=0;this.ripples.length=0;this.chains.length=0;this.telegraphs.clear();this.targetMarker.clear();this.target=null;this.targeting.clear();this.hitStop.clear();
    this.build?.resetCombat();
    this.hitCharge.clear();this.leech.clear();
  }

  private tickUltimates(now:number,enemies:Enemy[]):void {
    const p=this.player;
    for(let i=this.spins.length-1;i>=0;i--) {
      const spin=this.spins[i],cfg=ULTIMATE.warrior;
      while(spin.left>0&&now>=spin.nextAt) {
        this.explode(p.x,p.y,cfg.radius,spin.damage,now,true,true,enemies,spin.bossHealthRatio,spin.enemyHealthRatio,spin.castBudget);
        this.clearHostile(p.x,p.y,cfg.radius+30);
        spin.left--;spin.nextAt+=cfg.pulseInterval;
      }
      if(!spin.left)this.spins.splice(i,1);
    }
    for(let i=this.volleys.length-1;i>=0;i--) {
      const volley=this.volleys[i],cfg=ULTIMATE.archer;
      while(volley.left>0&&now>=volley.nextAt) {
        const target=this.acquireTarget(enemies);
        const angle=target?Math.atan2((target.y-p.y)/WORLD.verticalScale,target.x-p.x):p.attackAngle;
        this.launch('arrow',angle+(volley.left%2?.08:-.08),volley.damage,now,true,true,Math.max(3,p.stats.pierceCount),0,target,volley.bossHealthRatio,volley.enemyHealthRatio,volley.castBudget);
        this.effects.skill('attack',p.x,p.y-24,angle,CLASSES.archer.color,'archer',110);
        volley.left--;volley.nextAt+=cfg.interval;
      }
      if(!volley.left)this.volleys.splice(i,1);
    }
  }

  private launch(kind:ProjectileKind,angle:number,damage:number,now:number,ultimate:boolean,critical:boolean,pierces:number,splash:number,target:Enemy|null,bossHealthRatio=0,enemyHealthRatio=0,castBudget:BossCastBudget|null=null):void {
    const p=this.projectiles.find(item=>!item.active);if(!p)return;
    const stats=this.player.stats;
    p.active=true;p.kind=kind;p.x=this.player.x+Math.cos(angle)*29;p.y=this.player.y+Math.sin(angle)*20;
    p.angle=angle;p.damage=damage;p.speed=stats.projectileSpeed*(ultimate?1.3:1);p.range=stats.attackRange*(ultimate?1.6:1);
    p.traveled=0;p.born=now;p.pierces=Math.min(7,Math.max(1,pierces+(ultimate?0:this.build?.effects().pierceBonus??0)));p.critical=critical;p.ultimate=ultimate;p.splash=splash;p.target=target;p.hit.clear();
    p.bossHealthRatio=bossHealthRatio;p.enemyHealthRatio=enemyHealthRatio;
    p.castBudget=castBudget;
    p.hits=0;p.bounces=ultimate?0:this.build?.effects().ricochetBounces??0;
    p.image.setTexture(kind==='magic'?'hero-magic':'hero-arrow').setPosition(p.x,p.y-25).setDepth(p.y+135).setVisible(true).setAlpha(1).setScale(ultimate?1.35:1).setRotation(Math.atan2(Math.sin(angle)*WORLD.verticalScale,Math.cos(angle)));
    p.image.setTint(kind==='magic'?0xcfb7ff:ultimate?0xf0ffb0:0xa1ffe3);
  }

  private advance(p:Projectile,dt:number,now:number,enemies:Enemy[]):void {
    if(now-p.born>3800||p.traveled>=p.range||this.outside(p.x,p.y)){this.release(p);return;}
    if((p.kind==='magic'||p.ultimate)&&p.target?.active&&p.target.state!=='Dead'&&!p.hit.has(p.target)) {
      const desired=Math.atan2((p.target.y-p.y)/WORLD.verticalScale,p.target.x-p.x);
      const turn=Phaser.Math.Angle.Wrap(desired-p.angle);
      const turnRate=p.ultimate?8:3.5;
      p.angle+=Phaser.Math.Clamp(turn,-turnRate*dt,turnRate*dt);
    }
    const step=p.speed*dt,tx=p.x+Math.cos(p.angle)*step,ty=p.y+Math.sin(p.angle)*step*WORLD.verticalScale;
    const obstacle=p.ultimate?Infinity:this.obstacleTime(p.x,p.y,tx,ty),hits:{enemy:Enemy;t:number}[]=[];
    for(const enemy of enemies) {
      if(!enemy.active||enemy.state==='Dead'||p.hit.has(enemy))continue;
      const t=this.hitTime(p.x,p.y,tx,ty,enemy.x,enemy.y,enemy.hitRadius);
      if(t<=1&&t<obstacle)hits.push({enemy,t});
    }
    hits.sort((a,b)=>a.t-b.t);
    for(const hit of hits) {
      p.hit.add(hit.enemy);
      const hx=p.x+(tx-p.x)*hit.t,hy=p.y+(ty-p.y)*hit.t;
      if(p.kind==='magic') {
        this.explode(hx,hy,p.splash,p.damage,now,p.critical,p.ultimate,enemies);
        this.release(p);return;
      }
      const build=this.build?.effects(),pierceBoost=p.ultimate?1:Math.min(build?.pierceDamageCap??1,1+p.hits*(build?.pierceDamageStep??0));
      const healthDamage=hit.enemy.maxHealth*(hit.enemy.isBoss?p.bossHealthRatio:p.enemyHealthRatio);
      this.damageEnemy(hit.enemy,p.damage*pierceBoost,p.angle,now,p.critical,p.ultimate?'ultimate':'attack',healthDamage,p.castBudget);
      p.hits++;
      if(--p.pierces<=0) {
        const next=p.bounces>0?this.bounceTarget(hx,hy,p.hit,build?.ricochetRadius??0):null;
        if(next) {
          p.bounces--;p.pierces=1;p.damage*=build?.ricochetDamageMultiplier??.8;p.target=next;
          p.angle=Math.atan2((next.y-hy)/WORLD.verticalScale,next.x-hx);
          p.x=hx+Math.cos(p.angle)*4;p.y=hy+Math.sin(p.angle)*4*WORLD.verticalScale;p.traveled+=step;
          p.image.setPosition(p.x,p.y-25);this.ripple(hx,hy,30,0x87d6ac,now,180);return;
        }
        this.release(p);return;
      }
    }
    if(obstacle<=1) {
      const x=p.x+(tx-p.x)*obstacle,y=p.y+(ty-p.y)*obstacle;
      if(p.kind==='magic')this.explode(x,y,p.splash,p.damage,now,p.critical,p.ultimate,enemies);
      else this.effects.burst(x,y-24,0xa1ffe3,3,70);
      this.release(p);return;
    }
    p.x=tx;p.y=ty;p.traveled+=step;
    p.image.setPosition(tx,ty-25).setDepth(ty+135).setRotation(Math.atan2(Math.sin(p.angle)*WORLD.verticalScale,Math.cos(p.angle)));
    if(p.kind==='magic')p.image.setScale(1+Math.sin(now*.025)*.13);
  }

  private explode(x:number,y:number,radius:number,damage:number,now:number,critical:boolean,ultimate:boolean,enemies:Enemy[],bossHealthRatio=0,enemyHealthRatio=0,castBudget:BossCastBudget|null=null):void {
    const color=ultimate?CLASSES[this.player.classId].color:0xbba0ff;
    this.effects.burst(x,y-25,color,ultimate?32:12,ultimate?300:150);
    this.ripple(x,y,Math.max(24,radius),color,now,ultimate?600:260);
    this.effects.skill('impact',x,y-24,0,color,this.player.classId,radius);
    const chain=!ultimate&&this.player.classId==='mage'&&(this.build?.effects().chainBounces??0)>0&&this.chains.length<8?new Set<Enemy>():null;
    for(const enemy of enemies)if(enemy.active&&enemy.state!=='Dead'&&this.distance(enemy.x,enemy.y,x,y)<=radius+(enemy.isBoss?enemy.hitRadius*.6:enemy.kind==='elite'?16:8)&&
      (ultimate||this.obstacleTime(x,y,enemy.x,enemy.y)===Infinity)) {
      chain?.add(enemy);
      const healthDamage=enemy.maxHealth*(enemy.isBoss?bossHealthRatio:enemyHealthRatio);
      this.damageEnemy(enemy,damage,Math.atan2((enemy.y-y)/WORLD.verticalScale,enemy.x-x),now,critical,ultimate?'ultimate':'attack',healthDamage,castBudget);
      if(ultimate&&enemy.active)enemy.stun(now,700);
    }
    if(chain?.size)this.chains.push({x,y,damage:damage*(this.build?.effects().chainDamageMultiplier??.7),nextAt:now+110,left:this.build!.effects().chainBounces,visited:chain});
  }

  private damageEnemy(enemy:Enemy,amount:number,angle:number,now:number,critical:boolean,source:'attack'|'ultimate'|'counter'|'build',healthDamage=0,castBudget:BossCastBudget|null=null):void {
    if(!enemy.active||enemy.state==='Dead')return;
    if(source==='ultimate'&&enemy instanceof Boss)enemy.damageToughness(this.player.classId==='warrior'?15:this.player.classId==='mage'?45:5,now);
    const previousHealth=enemy.health;
    if(enemy instanceof Boss&&source==='ultimate'&&castBudget) {
      const accepted=castBudget.take(enemy,enemy.maxHealth,amount,healthDamage,enemy.broken?RESILIENCE.brokenDamageMultiplier:1);
      amount=accepted.fixed;healthDamage=accepted.healthDamage;
    }
    if(amount+healthDamage<=0)return;
    const dead=enemy instanceof Boss?enemy.hit(amount,angle,now,healthDamage):enemy.hit(Math.max(1,Math.round(amount+healthDamage)),angle,now);
    const damage=Math.max(0,Math.round(previousHealth-Math.max(0,enemy.health)));
    if(damage<=0)return;
    this.scene.events.emit('combat-resolved-hit',{damage,boss:enemy.isBoss,source:source==='build'?'attack':source});
    this.player.registerHit(now);this.onHit();
    const color=CLASSES[this.player.classId].color;
    this.effects.burst(enemy.x,enemy.y-26,critical?0xffe7a6:color,dead?16:5,dead?240:120);
    this.effects.number(enemy.x,enemy.y-20,damage,critical);
    this.effects.skill('impact',enemy.x,enemy.y-24,angle,critical?0xffe7a6:color,this.player.classId,source==='ultimate'?90:38);
    if(dead&&enemy.isBoss) {
      this.effects.bossDeath(enemy.x,enemy.y,enemy.projectileColor,enemy.visual);
      cameraShake(this.scene,180,.004);
    }
    if(dead)this.audio?.sfx('kill',.7);
    else this.audio?.sfx(critical?'crit':'hit',critical?.8:.5);
    if(critical||dead||source==='ultimate'){this.impactStop(now,dead&&enemy.isBoss?45:critical?28:dead?20:16);cameraShake(this.scene,critical?65:45,critical?.0015:.0008);}
    if(source==='attack') {
      this.player.addUltimateCharge(this.hitCharge.take(now,ULTIMATE.hitCharge,COMBAT_BALANCE.hitChargeBudget,COMBAT_BALANCE.hitChargeWindow));
      if(!this.player.dead&&this.player.stats.lifeSteal>0) {
        const recovered=this.leech.take(now,Math.min(damage,this.player.stats.lifeSteal),lifeStealBudget(this.player.stats.maxHealth,this.player.stats.lifeSteal),COMBAT_BALANCE.leechWindow);
        this.player.health=Math.min(this.player.stats.maxHealth,this.player.health+recovered);
      }
      if(!dead&&this.player.stats.slowDuration>0)enemy.applySlow(now,this.player.stats.slowDuration);
      if(dead)this.player.addUltimateCharge(enemy.kind==='elite'?ULTIMATE.eliteCharge:ULTIMATE.killCharge);
      if(!dead&&this.player.classId==='mage')this.applyFrost(enemy,now);
      const momentum=this.build?.registerHit(now);
      if(momentum?.spin)this.whirlwind(now);
    }
    if(dead){this.onKill(enemy);enemy.destroy();}
  }

  private impactStop(now:number,duration:number):void {
    this.hitStop.request(now,duration);
    if(this.hitStop.remaining>0)this.scene.physics.pause();
  }

  private whirlwind(now:number):void {
    const p=this.player,cfg=this.build!.effects(),radius=p.stats.attackRange+cfg.whirlwindRangeBonus;
    this.ripple(p.x,p.y,radius,0xffd27b,now,350);this.effects.skill('impact',p.x,p.y-24,0,0xffd27b,'warrior',radius);
    for(const enemy of this.enemies)if(enemy.active&&enemy.state!=='Dead'&&this.distance(p.x,p.y,enemy.x,enemy.y)<=radius&&this.obstacleTime(p.x,p.y,enemy.x,enemy.y)===Infinity) {
      if(enemy instanceof Boss)enemy.damageToughness(8,now);
      this.damageEnemy(enemy,p.stats.damage*cfg.whirlwindDamageMultiplier,Math.atan2((enemy.y-p.y)/WORLD.verticalScale,enemy.x-p.x),now,false,'build');
    }
  }

  private applyFrost(enemy:Enemy,now:number):void {
    const cfg=this.build?.effects();if(!cfg?.frostStacks)return;
    let status=this.frost.get(enemy);
    if(!status){status={stacks:0,expires:0,immuneUntil:0};this.frost.set(enemy,status);}
    if(now<status.immuneUntil)return;
    status.stacks=now>status.expires?1:status.stacks+1;status.expires=now+2500;
    enemy.applySlow(now,900,cfg.frostSlowMultiplier);
    if(status.stacks>=cfg.frostStacks) {
      status.stacks=0;status.immuneUntil=now+(enemy.isBoss?cfg.frostBossCooldown:cfg.frostCooldown);
      if(enemy instanceof Boss)enemy.freeze(now,cfg.frostBossFreezeDuration);else enemy.stun(now,cfg.frostFreezeDuration);
      if(enemy instanceof Boss)enemy.damageToughness(10,now);
      this.ripple(enemy.x,enemy.y,enemy.hitRadius+20,0x8cdbef,now,350);
      this.effects.skill('guard',enemy.x,enemy.y-24,0,0x8cdbef,'mage',45);
    }
  }

  private bounceTarget(x:number,y:number,visited:Set<Enemy>,range:number):Enemy|null {
    let next:Enemy|null=null,closest=range;
    for(const enemy of this.enemies) {
      if(!enemy.active||enemy.state==='Dead'||visited.has(enemy))continue;
      const distance=this.distance(x,y,enemy.x,enemy.y);
      if(distance<closest&&this.obstacleTime(x,y,enemy.x,enemy.y)===Infinity){next=enemy;closest=distance;}
    }
    return next;
  }

  private tickChains(now:number):void {
    for(let i=this.chains.length-1;i>=0;i--) {
      const chain=this.chains[i];if(now<chain.nextAt)continue;
      const cfg=this.build!.effects(),next=this.bounceTarget(chain.x,chain.y,chain.visited,cfg.chainRadius);
      if(!next||chain.left<=0){this.chains.splice(i,1);continue;}
      chain.visited.add(next);chain.x=next.x;chain.y=next.y;chain.left--;chain.nextAt=now+120;
      this.effects.burst(next.x,next.y-24,0xbc9be5,7,100);this.ripple(next.x,next.y,42,0xbc9be5,now,230);
      this.damageEnemy(next,chain.damage,0,now,false,'build');chain.damage*=cfg.chainDamageMultiplier;
      if(chain.left<=0)this.chains.splice(i,1);
    }
  }

  private drawEffects(now:number):void {
    const g=this.telegraphs;g.clear();
    for(let i=this.ripples.length-1;i>=0;i--) {
      const r=this.ripples[i],t=(now-r.born)/r.duration;
      if(t>=1){this.ripples.splice(i,1);continue;}
      const radius=r.radius*(.25+.75*t),alpha=(1-t)*.85;
      g.fillStyle(r.color,alpha*.09).fillEllipse(r.x,r.y,radius*2,radius*2*WORLD.verticalScale);
      g.lineStyle(6*(1-t)+1,r.color,alpha).strokeEllipse(r.x,r.y,radius*2,radius*2*WORLD.verticalScale);
      g.lineStyle(1,0xffffff,alpha*.8).strokeEllipse(r.x,r.y,radius*1.75,radius*1.75*WORLD.verticalScale);
    }
    for(const m of this.meteors) {
      const t=Phaser.Math.Clamp((now-m.born)/(m.landAt-m.born),0,1),color=0xc4a4ff;
      g.fillStyle(color,.08+t*.12).fillEllipse(m.x,m.y,m.radius*2,m.radius*2*WORLD.verticalScale);
      g.lineStyle(3,color,.7).strokeEllipse(m.x,m.y,m.radius*2,m.radius*2*WORLD.verticalScale);
      g.lineStyle(2,0xffffff,.8).strokeEllipse(m.x,m.y,m.radius*2*t,m.radius*2*t*WORLD.verticalScale);
      g.lineStyle(2,color,.55).lineBetween(m.x-24,m.y,m.x+24,m.y).lineBetween(m.x,m.y-17,m.x,m.y+17);
      const dropY=m.y-25-(1-t)*380;
      g.lineStyle(16,color,.3).lineBetween(m.x,dropY-90,m.x,dropY);
      g.fillStyle(color,.65).fillCircle(m.x,dropY,22+t*12);
      g.fillStyle(0xffffff,.9).fillCircle(m.x,dropY,10+t*7);
    }
  }

  private ripple(x:number,y:number,radius:number,color:number,now:number,duration:number):void {
    if(this.ripples.length>=16)this.ripples.shift();
    this.ripples.push({x,y,radius,color,born:now,duration});
  }
  private clearHostile(x:number,y:number,radius:number):void {
    this.bullets.children.forEach(child=>{const b=child as Phaser.Physics.Arcade.Image;if(b.active&&this.distance(b.x,b.y,x,y)<radius)this.recycle(b);});
  }
  private release(p:Projectile):void {p.active=false;p.image.setVisible(false);p.hit.clear();p.target=null;p.castBudget=null;}
  private recycle(bullet:Phaser.Physics.Arcade.Image):void {bullet.setData('owner',null);bullet.disableBody(true,true);}
  private outside(x:number,y:number):boolean {return x<WORLD.inset||x>WORLD.width-WORLD.inset||y<WORLD.inset||y>WORLD.height-WORLD.inset;}
  private distance(x:number,y:number,tx:number,ty:number):number {return Math.hypot(x-tx,(y-ty)/WORLD.verticalScale);}

  /** Earliest segment / circle contact, so fast arrows cannot tunnel through actors. */
  private hitTime(x:number,y:number,tx:number,ty:number,cx:number,cy:number,radius:number):number {
    const dx=tx-x,dy=(ty-y)/WORLD.verticalScale,ox=x-cx,oy=(y-cy)/WORLD.verticalScale;
    const c=ox*ox+oy*oy-radius*radius;if(c<=0)return 0;
    const a=dx*dx+dy*dy;if(a<.001)return Infinity;
    const b=2*(ox*dx+oy*dy),d=b*b-4*a*c;
    if(d<0)return Infinity;
    const t=(-b-Math.sqrt(d))/(2*a);return t>=0&&t<=1?t:Infinity;
  }

  /** Slab intersection against the cached, static cover rectangles. */
  private obstacleTime(x:number,y:number,tx:number,ty:number):number {
    let nearest=Infinity;
    for(const b of this.solids) {
      const dx=tx-x,dy=ty-y;let lo=0,hi=1;
      if(Math.abs(dx)<.001){if(x<b.left-2||x>b.right+2)continue;}
      else {const a=(b.left-2-x)/dx,z=(b.right+2-x)/dx;lo=Math.max(lo,Math.min(a,z));hi=Math.min(hi,Math.max(a,z));}
      if(Math.abs(dy)<.001){if(y<b.top-2||y>b.bottom+2)continue;}
      else {const a=(b.top-2-y)/dy,z=(b.bottom+2-y)/dy;lo=Math.max(lo,Math.min(a,z));hi=Math.min(hi,Math.max(a,z));}
      if(lo<=hi&&hi>=0&&lo<=1)nearest=Math.min(nearest,Math.max(0,lo));
    }
    return nearest;
  }

  private makeProjectileTextures():void {
    const g=this.scene.make.graphics({x:0,y:0});
    if(!this.scene.textures.exists('hero-arrow')) {
      g.lineStyle(5,0x82e7c4,.14).lineBetween(4,8,29,8);
      g.lineStyle(2,0xffffff).lineBetween(4,8,29,8);
      g.fillStyle(0xffffff).fillTriangle(32,8,23,3,23,13);
      g.fillStyle(0xc7ffe4).fillTriangle(8,8,2,3,2,6).fillTriangle(8,8,2,13,2,10);
      g.generateTexture('hero-arrow',34,16);g.clear();
    }
    if(!this.scene.textures.exists('hero-magic')) {
      g.fillStyle(0xc2a1ff,.07).fillCircle(18,18,18);
      g.fillStyle(0xc2a1ff,.15).fillCircle(18,18,13);
      g.fillStyle(0xc2a1ff,.75).fillCircle(18,18,8);
      g.lineStyle(1,0xf0ddff,.9).strokeCircle(18,18,10);
      g.fillStyle(0xffffff).fillTriangle(18,9,23,18,18,27).fillTriangle(18,9,13,18,18,27);
      g.generateTexture('hero-magic',36,36);
    }
    g.destroy();
  }
}
