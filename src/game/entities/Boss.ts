import * as Phaser from 'phaser';
import { BOSSES, WORLD, type BossDefinition, type BossSkill, type BossWave } from '../config';
import { Enemy } from './Enemy';
import type { Player } from './Player';
import type { NavigationGrid } from '../systems/NavigationGrid';
import { getBossMaxHealth } from '../systems/DifficultySystem';
import { generateBossAssets, bossTexture } from '../graphics/ProceduralBossAssets';
import { RESILIENCE, ResilienceSystem } from '../systems/ResilienceSystem';

type Fire=(enemy:Enemy,spread:number)=>void;
type Hurt=(amount:number,x:number,y:number)=>void;
interface Hazard {x:number;y:number;radius:number;}

/** Guardians share floor navigation, but normal hits never cancel their telegraphed attacks. */
export class Boss extends Enemy {
  readonly bossName:string;
  bossPhase=1;
  private nextSkill=0;
  private castUntil=0;
  private castStarted=0;
  private skill:BossSkill='charge';
  private skillIndex=0;
  private lockedAngle=0;
  private rushUntil=0;
  private volleys=0;
  private nextVolley=0;
  private flashUntil=0;
  private hazardFlashUntil=0;
  private lastBossStun=-5000;
  private nextFreezeAt=0;
  private nextBossPath=0;
  private bossPath:{x:number;y:number}[]=[];
  private readonly hazards:Hazard[]=[];
  private readonly definition:BossDefinition;
  private readonly resilience:ResilienceSystem;

  constructor(scene:Phaser.Scene,x:number,y:number,readonly bossWave:BossWave,nav:NavigationGrid,quick=false) {
    super(scene,x,y,'elite',bossWave,nav);
    generateBossAssets(scene);
    this.definition=BOSSES[bossWave];
    this.resilience=new ResilienceSystem(quick?1:Math.ceil(bossWave/10));
    this.bossName=this.definition.name;
    this.maxHealth=this.health=quick?3600+Math.ceil(bossWave/10)*180:getBossMaxHealth(bossWave);
    this.damage=quick?25:Math.round(this.damage*.8);
    this.visual.setTexture(bossTexture(bossWave)).setTint(this.definition.tint).setDisplaySize(this.definition.final?178:160,this.definition.final?152:137);
    this.shadow.setDisplaySize(this.definition.final?105:94,35);
    // Keep the floor footprint narrow enough for the established navigation corridors.
    this.body.setSize(36,20).setOffset(16,55);
  }
  override get isBoss():boolean {return true;}
  override get hitRadius():number {return this.definition.final?42:37;}
  override get projectileSpeed():number {return this.definition.projectileSpeed+(this.bossPhase>=3?25:0);}
  override get projectileColor():number {return this.definition.color;}
  override setNavigation(nav:NavigationGrid):void {super.setNavigation(nav);this.bossPath.length=0;this.nextBossPath=0;}
  get maxToughness():number {return this.resilience.maximum;}
  get toughness():number {return this.resilience.remaining;}
  get brokenUntil():number {return this.resilience.brokenUntil;}
  get broken():boolean {return this.resilience.broken;}
  get resilienceProtected():boolean {return this.resilience.protected;}
  get resilienceProtectedUntil():number {return this.resilience.protectedUntil;}

  damageToughness(amount:number,now:number):boolean {
    if(!this.active||this.state==='Dead')return false;
    if(!this.resilience.damage(amount,now))return false;
    this.cancelPattern();
    this.stunUntil=this.brokenUntil;
    this.nextSkill=this.brokenUntil+850;
    this.setVelocity(0);this.state='Hurt';
    this.scene.events.emit('boss-break',this);
    return true;
  }

  private cancelPattern():void {
    this.castUntil=0;this.rushUntil=0;this.volleys=0;
    this.hazardFlashUntil=0;this.hazards.length=0;
  }

  override tick(now:number,player:Player,fire:Fire,hurt:Hurt):void {
    if(!this.active||this.state==='Dead'||player.dead)return;
    this.resilience.tick(now);
    const phase=this.definition.final&&this.health<=this.maxHealth*.25?3:this.health<=this.maxHealth*.5?2:1;
    if(phase!==this.bossPhase) {
      this.bossPhase=phase;this.cancelPattern();
      // The new phase always gives the player a breath before its first telegraph.
      this.nextSkill=Math.max(this.nextSkill,now+850);
      this.scene.events.emit('boss-phase',this);
    }
    const dx=player.x-this.x,dy=(player.y-this.y)/WORLD.verticalScale,distance=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
    const color=this.projectileColor;
    this.visual.setPosition(this.x,this.y+(this.definition.keepsDistance?Math.sin(now*.003)*4-5:0)).setDepth(this.y+100).setFlipX(dx<0);
    this.visual.setTint(now<this.flashUntil?0xffffff:this.definition.tint);
    this.shadow.setPosition(this.x,this.y-2).setDepth(this.y+98);
    this.tell.clear().setPosition(this.x,this.y).setDepth(this.y+97).setScale(1,WORLD.verticalScale);
    this.tell.lineStyle(this.bossPhase>1?3:1,color,this.bossPhase>1?.5:.2).strokeCircle(0,0,54+Math.sin(now*.003)*3);
    this.bar.clear().setDepth(this.y+180);
    this.bar.fillStyle(0x081321,.9).fillRect(this.x-45,this.y-151,90,5);
    this.bar.fillStyle(color).fillRect(this.x-45,this.y-151,90*Math.max(0,this.health)/this.maxHealth,5);
    this.bar.fillStyle(0x426258,.8).fillRect(this.x-45,this.y-142,90,4);
    this.bar.fillStyle(this.broken?0xffdf8a:this.resilience.protected?0x9da99b:0x76dfc1).fillRect(this.x-45,this.y-142,90*this.toughness/this.maxToughness,4);
    if(now<this.hazardFlashUntil)this.drawHazards(.5,true);
    if(this.broken) {
      this.state='Hurt';this.setVelocity(0);this.visual.setTint(0xffe6a5);
      this.tell.lineStyle(3,0xffdf8a,.85).strokeCircle(0,0,64);
      for(let i=0;i<3;i++) {
        const a=now*.003+i*Math.PI*2/3;
        this.tell.fillStyle(0xfff2c6,.9).fillCircle(Math.cos(a)*56,Math.sin(a)*56,4);
      }
      return;
    }
    if(now<this.stunUntil){this.state='Hurt';this.setVelocity(0);this.tell.lineStyle(3,0xa7f9ff,.8).strokeCircle(0,0,65);return;}
    if(this.volleys>0&&now>=this.nextVolley) {
      this.emitFan(player,fire,this.lockedAngle+(this.volleys%2?-.08:.08));
      this.volleys--;this.nextVolley=now+260;
    }
    if(now<this.rushUntil) {
      this.state='Attack';
      const speed=(this.bossPhase>=3?440:400)*(now<this.slowUntil?.8:1);
      this.setVelocity(Math.cos(this.lockedAngle)*speed,Math.sin(this.lockedAngle)*speed*WORLD.verticalScale);
      this.tell.lineStyle(3,color,.65).strokeCircle(0,0,62);
      if(distance<67)hurt(this.damage,this.x,this.y);
      return;
    }
    if(this.rushUntil>0){this.rushUntil=0;this.setVelocity(0);this.emitRing(player,fire,this.bossPhase>1?14:10);}
    if(this.castUntil>0) {
      this.state='Attack';this.setVelocity(0);
      this.drawCast(now);
      if(now>=this.castUntil)this.resolveSkill(now,player,fire,hurt);
      return;
    }
    const pattern=this.definition.patterns;
    const next=pattern[this.skillIndex%pattern.length];
    const range=next==='ring'?230:next==='charge'?490:650;
    if(now>=this.nextSkill&&distance<range&&this.nav.lineOfSight(this.x,this.y,player.x,player.y)) {
      this.skill=next;this.skillIndex++;this.lockedAngle=angle;
      this.castStarted=now;this.castUntil=now+(next==='meteor'?1150:next==='charge'?850:900)-(this.bossPhase>1?120:0);
      this.state='Attack';this.setVelocity(0);
      if(next==='meteor')this.prepareHazards(player);
      this.drawCast(now);return;
    }
    this.state='Chase';
    this.moveToward(now,player,distance,angle);
  }

  private moveToward(now:number,player:Player,distance:number,angle:number):void {
    let tx=player.x,ty=player.y;
    const mage=this.definition.keepsDistance;
    const next=this.definition.patterns[this.skillIndex%this.definition.patterns.length];
    if(mage&&distance<210) {
      tx=Phaser.Math.Clamp(this.x-Math.cos(angle)*130,WORLD.inset+35,WORLD.width-WORLD.inset-35);
      ty=Phaser.Math.Clamp(this.y-Math.sin(angle)*95,WORLD.inset+35,WORLD.height-WORLD.inset-35);
    } else if(mage&&distance<340&&next!=='ring'&&this.nav.lineOfSight(this.x,this.y,tx,ty)){this.setVelocity(0);return;}
    if(now>=this.nextBossPath||!this.bossPath.length){this.bossPath=this.nav.route(this.x,this.y,tx,ty);this.nextBossPath=now+650;}
    while(this.bossPath.length>1&&Math.hypot(this.bossPath[0].x-this.x,this.bossPath[0].y-this.y)<25)this.bossPath.shift();
    const point=this.bossPath[0];if(!point){this.setVelocity(0);return;}
    const a=Math.atan2((point.y-this.y)/WORLD.verticalScale,point.x-this.x),speed=(mage?110:135)*(now<this.slowUntil?.8:1);
    this.setVelocity(Math.cos(a)*speed,Math.sin(a)*speed*WORLD.verticalScale);
  }

  private resolveSkill(now:number,player:Player,fire:Fire,hurt:Hurt):void {
    this.castUntil=0;
    this.nextSkill=now+(this.bossPhase>=3?1000:this.bossPhase===2?1250:1550);
    if(this.skill==='charge'){this.rushUntil=now+640;return;}
    if(this.skill==='fan') {
      this.emitFan(player,fire,this.lockedAngle);
      this.volleys=this.bossPhase>=3?2:1;this.nextVolley=now+260;
    } else if(this.skill==='ring') {
      this.emitRing(player,fire,this.bossPhase>=3?18:this.bossPhase===2?14:10);
      if(Math.hypot(player.x-this.x,(player.y-this.y)/WORLD.verticalScale)<150) {
        hurt(Math.round(this.damage*1.1),this.x,this.y);
        // A perfect guard can synchronously kill and destroy the attacking boss.
        if(!this.active||this.state==='Dead')return;
      }
      this.hazards.length=0;this.hazards.push({x:this.x,y:this.y,radius:150});this.hazardFlashUntil=now+300;
    } else {
      for(const h of this.hazards)if(Math.hypot(player.x-h.x,(player.y-h.y)/WORLD.verticalScale)<h.radius) {
        hurt(Math.round(this.damage*1.15),h.x,h.y);
        if(!this.active||this.state==='Dead')return;
        break;
      }
      this.hazardFlashUntil=now+400;
      this.scene.events.emit('boss-impact',this);
    }
  }

  private prepareHazards(player:Player):void {
    this.hazards.length=0;
    this.hazards.push({x:player.x,y:player.y,radius:110});
    if(this.bossPhase>1)for(const side of [-1,1])this.hazards.push({x:Phaser.Math.Clamp(player.x+side*155,WORLD.inset+30,WORLD.width-WORLD.inset-30),y:player.y,radius:95});
  }
  private emitFan(player:Player,fire:Fire,angle:number):void {
    const aimed=Math.atan2((player.y-this.y)/WORLD.verticalScale,player.x-this.x),count=this.bossPhase>1?9:7;
    for(let i=0;i<count;i++)fire(this,angle-aimed+(i-(count-1)/2)*.17);
  }
  private emitRing(player:Player,fire:Fire,count:number):void {
    const aimed=Math.atan2((player.y-this.y)/WORLD.verticalScale,player.x-this.x);
    // Rotate rings away from the immediately preceding pattern; gaps stay visible.
    for(let i=0;i<count;i++)fire(this,i/count*Math.PI*2+.12*this.skillIndex-aimed);
  }
  private drawCast(now:number):void {
    const g=this.tell,color=this.projectileColor,t=Phaser.Math.Clamp((now-this.castStarted)/(this.castUntil-this.castStarted),0,1);
    const alpha=.15+t*.16;
    if(this.skill==='charge') {
      const a=this.lockedAngle,ex=Math.cos(a)*360,ey=Math.sin(a)*360;
      g.lineStyle(75,color,alpha*.5).lineBetween(0,0,ex,ey);
      g.lineStyle(2,color,.8).lineBetween(Math.cos(a+.18)*55,Math.sin(a+.18)*55,ex+Math.cos(a+Math.PI/2)*33,ey+Math.sin(a+Math.PI/2)*33);
      g.lineStyle(2,color,.8).lineBetween(Math.cos(a-.18)*55,Math.sin(a-.18)*55,ex-Math.cos(a+Math.PI/2)*33,ey-Math.sin(a+Math.PI/2)*33);
      g.fillStyle(color,.8).fillCircle(ex,ey,5);
    } else if(this.skill==='meteor')this.drawHazards(alpha,false);
    else if(this.skill==='fan') {
      const half=this.bossPhase>1?4:3;
      for(let i=-half;i<=half;i++){const a=this.lockedAngle+i*.17;g.lineStyle(i===0?3:1,color,.3+t*.35).lineBetween(Math.cos(a)*48,Math.sin(a)*48,Math.cos(a)*420,Math.sin(a)*420);}
      g.lineStyle(3,color,.8).strokeCircle(0,0,45+t*20);
    } else {
      g.fillStyle(color,alpha).fillCircle(0,0,150);
      g.lineStyle(3,color,.85).strokeCircle(0,0,150);
      g.lineStyle(2,0xffefcd,.7).strokeCircle(0,0,150*t);
    }
    g.lineStyle(2,0xffffff,.55).beginPath().arc(0,0,63,-Math.PI/2,-Math.PI/2+t*Math.PI*2).strokePath();
  }
  private drawHazards(alpha:number,impact:boolean):void {
    const g=this.tell,color=this.projectileColor;
    for(const h of this.hazards){const x=h.x-this.x,y=(h.y-this.y)/WORLD.verticalScale;
      g.fillStyle(color,alpha*(impact?.8:.5)).fillCircle(x,y,h.radius);
      g.lineStyle(impact?5:2,color,.9).strokeCircle(x,y,h.radius);
      g.lineStyle(2,0xffefdf,.65).lineBetween(x-18,y,x+18,y).lineBetween(x,y-18,x,y+18);
      if(impact){g.lineStyle(12,color,.45).lineBetween(x,y-170,x,y);g.fillStyle(0xfff1ed,.9).fillCircle(x,y,21);}
    }
  }
  override hit(amount:number,_angle:number,now:number):boolean {
    if(this.state==='Dead')return false;
    this.resilience.tick(now);
    const damage=Math.round(amount*(this.broken?RESILIENCE.brokenDamageMultiplier:1));
    this.health=Math.max(0,this.health-damage);this.flashUntil=now+75;
    if(this.health===0){this.state='Dead';this.body.enable=false;this.setVelocity(0);this.tell.clear();return true;}
    return false;
  }
  /** Frost has its own resistance, independent from short generic parry stuns. */
  freeze(now:number,duration:number):void {
    if(this.state==='Dead'||this.broken||now<this.nextFreezeAt)return;
    this.nextFreezeAt=now+5000;this.cancelPattern();
    this.stunUntil=Math.max(this.stunUntil,now+Phaser.Math.Clamp(duration,100,400));
    this.nextSkill=Math.max(this.nextSkill,this.stunUntil+500);this.setVelocity(0);
  }
  override stun(now:number,duration:number):void {
    if(this.state==='Dead'||now-this.lastBossStun<1800)return;
    this.lastBossStun=now;this.stunUntil=now+Math.min(220,duration);this.setVelocity(0);
  }
}
