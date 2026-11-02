import * as Phaser from 'phaser';
import { PLAYER, WORLD, CLASSES, GUARD, ULTIMATE, type ClassId, type PlayerStats } from '../config';
import type { InputManager } from '../systems/InputManager';
import { animateHero, createHeroVisual } from '../graphics/HeroPresentation';
import { WeaponRenderer } from '../graphics/WeaponRenderer';

export type DamageResult = 'ignored' | 'blocked' | 'parried' | 'hit' | 'dead';
interface AimPoint { x:number; y:number; }

/** Ground collision stays independent of the animated hero and equipped weapon. */
export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  readonly classId:ClassId;
  stats:PlayerStats;
  health:number;
  facing=1;
  aimAngle=0;
  attackAngle=0;
  combo=0;
  didAttack=false;
  didUltimate=false;
  dead=false;
  invulnerableUntil=0;
  dashUntil=0;
  nextDash=0;
  nextAttack=0;
  guardUntil=0;
  perfectGuardUntil=0;
  nextGuard=0;
  ultimateCharge=0;
  ultimateUntil=0;
  nextUltimate=0;
  lastDamageResult:DamageResult='ignored';
  readonly visual:Phaser.GameObjects.Sprite;
  private readonly shadow:Phaser.GameObjects.Ellipse;
  private readonly slash:Phaser.GameObjects.Graphics;
  private readonly marker:Phaser.GameObjects.Graphics;
  private readonly shield:Phaser.GameObjects.Graphics;
  private readonly weapon:WeaponRenderer;
  private attackStarted=-1000;
  private hurtUntil=0;
  private lastAttack=-1000;
  private dashAngle=0;
  private currentTime=0;
  private guardCounterReady=false;

  constructor(scene:Phaser.Scene,x:number,y:number,classId:ClassId='warrior') {
    super(scene,x,y,'player');
    this.classId=classId;
    this.stats={...CLASSES[classId].stats};
    this.health=this.stats.maxHealth;
    scene.add.existing(this);scene.physics.add.existing(this);
    this.setOrigin(.5,1).setVisible(false).setCollideWorldBounds(true);
    this.body.setSize(24,14).setOffset(12,49).setAllowGravity(false).setMaxVelocity(900,900);
    this.shadow=scene.add.ellipse(x,y-3,48,19,0x020b18,.55);
    this.visual=createHeroVisual(scene,x,y);
    this.slash=scene.add.graphics();this.marker=scene.add.graphics();this.shield=scene.add.graphics();
    this.weapon=new WeaponRenderer(scene,classId);
  }

  get guarding():boolean {return !this.dead&&this.currentTime<this.guardUntil;}
  get ultimateReady():boolean {return !this.dead&&this.ultimateCharge>=ULTIMATE.maxCharge&&this.currentTime>=this.nextUltimate;}
  addUltimateCharge(amount:number):void {if(!this.dead)this.ultimateCharge=Phaser.Math.Clamp(this.ultimateCharge+amount,0,ULTIMATE.maxCharge);}

  /** The first accepted hit of a guard action releases its counter; empty guards do not. */
  consumeGuardCounter():boolean {
    if(!this.guardCounterReady||this.dead||(this.lastDamageResult!=='blocked'&&this.lastDamageResult!=='parried'))return false;
    this.guardCounterReady=false;
    return true;
  }

  tick(now:number,_delta:number,input:InputManager,target:AimPoint|null=null,combatEnabled=true):void {
    this.currentTime=now;this.didAttack=false;this.didUltimate=false;
    if(this.dead)return;
    const axisX=input.axisX,axisY=input.axisY,moving=Math.hypot(axisX,axisY)>.12;
    if(moving)this.aimAngle=Math.atan2(axisY,axisX);
    // Aim follows the nearest living target while firing; movement remains independent.
    if(target&&(input.attackHeld||this.guarding))this.aimAngle=Math.atan2((target.y-this.y)/WORLD.verticalScale,target.x-this.x);
    if(Math.abs(Math.cos(this.aimAngle))>.12)this.facing=Math.sign(Math.cos(this.aimAngle));
    const wantsGuard=input.consumeGuard(),wantsDash=input.consumeDash(),wantsUltimate=input.consumeUltimate();
    if(combatEnabled&&wantsUltimate&&this.ultimateReady) {
      if(target)this.aimAngle=Math.atan2((target.y-this.y)/WORLD.verticalScale,target.x-this.x);
      this.attackAngle=this.aimAngle;
      this.ultimateCharge=0;this.ultimateUntil=now+760;this.nextUltimate=now+ULTIMATE.lockout;
      this.invulnerableUntil=Math.max(this.invulnerableUntil,now+850);
      this.guardUntil=0;this.dashUntil=0;this.nextAttack=Math.max(this.nextAttack,now+650);
      this.guardCounterReady=false;
      this.didUltimate=true;
    }
    if(combatEnabled&&wantsGuard&&now>=this.nextGuard&&now>=this.dashUntil&&now>=this.ultimateUntil) {
      this.guardUntil=now+GUARD.duration;this.perfectGuardUntil=now+GUARD.perfectWindow;
      this.nextGuard=now+this.stats.guardCooldown;
      this.guardCounterReady=true;
      this.scene.events.emit('guard',this.x,this.y);
    }
    if(combatEnabled&&wantsDash&&now>=this.nextDash&&now>=this.ultimateUntil) {
      this.dashAngle=moving?Math.atan2(axisY,axisX):this.aimAngle;
      this.guardUntil=0;this.perfectGuardUntil=0;
      this.guardCounterReady=false;
      this.dashUntil=now+PLAYER.dashDuration;this.nextDash=now+this.stats.dashCooldown;
      this.invulnerableUntil=Math.max(this.invulnerableUntil,this.dashUntil+70);
      this.scene.events.emit('dash');
    }
    if(now<this.dashUntil)this.setVelocity(Math.cos(this.dashAngle)*PLAYER.dashSpeed,Math.sin(this.dashAngle)*PLAYER.dashSpeed*WORLD.verticalScale);
    else if(now>=this.hurtUntil) {
      const modifier=this.guarding ? .45 : now<this.ultimateUntil ? .65 : 1;
      this.setVelocity(axisX*this.stats.speed*modifier,axisY*this.stats.speed*WORLD.verticalScale*modifier);
    }
    if(combatEnabled&&input.attackHeld&&!this.guarding&&now>=this.ultimateUntil&&now>=this.nextAttack) {
      this.combo=now-this.lastAttack<1000?this.combo%3+1:1;
      this.attackAngle=this.aimAngle;this.lastAttack=now;this.attackStarted=now;
      this.nextAttack=now+this.stats.attackCooldown;this.didAttack=true;
    }
    if(now-this.lastAttack>1100)this.combo=0;
    const attackProgress=(now-this.attackStarted)/180;
    animateHero(this.visual,{
      angle:now<this.dashUntil?this.dashAngle:attackProgress<1?this.attackAngle:this.aimAngle,
      moving:moving&&!this.guarding,now,dash:now<this.dashUntil,attackProgress,hurt:now<this.hurtUntil,
    });
    const bob=moving&&!this.guarding?-Math.abs(Math.sin(now*.016))*1.3:0;
    this.visual.setPosition(this.x,this.y+bob).setDepth(this.y+100)
      .setAlpha(now<this.invulnerableUntil&&now>=this.dashUntil&&!this.guarding?(Math.floor(now/65)%2?.45:1):1);
    this.shadow.setPosition(this.x,this.y-3).setDepth(this.y+98).setScale(1).setAlpha(.5);
    const color=CLASSES[this.classId].color;
    this.marker.clear().setPosition(this.x,this.y).setDepth(this.y+99);
    this.marker.lineStyle(1,color,.4).strokeEllipse(0,-1,48,24).fillStyle(color,.85);
    const px=Math.cos(this.aimAngle)*35,py=Math.sin(this.aimAngle)*35*WORLD.verticalScale;
    this.marker.fillTriangle(px,py,px-Math.cos(this.aimAngle-.5)*9,py-Math.sin(this.aimAngle-.5)*7,px-Math.cos(this.aimAngle+.5)*9,py-Math.sin(this.aimAngle+.5)*7);
    this.slash.clear().setPosition(this.x,this.y-22).setDepth(this.y+130).setScale(1,WORLD.verticalScale);
    if(this.classId==='warrior'&&attackProgress>=0&&attackProgress<1) {
      const a=this.attackAngle-1.15+attackProgress*.7,radius=Math.min(100,this.stats.attackRange*.62);
      this.slash.lineStyle(this.combo===3?12:8,this.combo===3?0xffad5f:color,(1-attackProgress)*.9);
      this.slash.beginPath().arc(0,0,radius,a,a+1.9).strokePath();
      this.slash.lineStyle(2,0xffffff,1-attackProgress).beginPath().arc(0,0,radius+8,a,a+1.9).strokePath();
    }
    this.drawGuard(now);
    this.weapon.update(this.x,this.y,this.aimAngle,this.y+120,{attacking:attackProgress>=0&&attackProgress<1,guarding:this.guarding,ultimate:now<this.ultimateUntil,now});
  }

  private drawGuard(now:number):void {
    this.shield.clear().setPosition(this.x,this.y-33).setDepth(this.y+160);
    if(!this.guarding)return;
    const perfect=now<this.perfectGuardUntil,color=perfect?0xffedab:0x80eaff;
    this.shield.fillStyle(color,perfect?.12:.06).fillEllipse(0,0,87,79);
    this.shield.lineStyle(perfect?3:2,color,.9).strokeEllipse(0,0,87,79);
    this.shield.lineStyle(1,color,.3).strokeEllipse(0,0,96,87);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3+now*.001;
      this.shield.fillStyle(color,.9).fillCircle(Math.cos(a)*43,Math.sin(a)*39,2);
    }
  }

  hurt(amount:number,sourceX:number,now:number,sourceY=this.y):boolean {
    this.lastDamageResult='ignored';
    if(this.dead||now<this.invulnerableUntil)return false;
    let blocked=false;
    if(now<this.guardUntil) {
      if(now<this.perfectGuardUntil) {
        this.lastDamageResult='parried';this.perfectGuardUntil=0;
        this.invulnerableUntil=now+200;this.addUltimateCharge(ULTIMATE.parryCharge);
        this.scene.events.emit('parry',this.x,this.y);return false;
      }
      amount=Math.max(1,Math.ceil(amount*(1-this.stats.guardReduction)));
      blocked=true;
    }
    this.health=Math.max(0,this.health-amount);
    this.lastDamageResult=blocked?'blocked':'hit';
    this.invulnerableUntil=now+(blocked?220:PLAYER.invulnerability);
    if(!blocked) {
      this.hurtUntil=now+210;
      const angle=Math.atan2((this.y-sourceY)/WORLD.verticalScale,this.x-sourceX);
      this.setVelocity(Math.cos(angle)*260,Math.sin(angle)*260*WORLD.verticalScale);
    }
    this.visual.setTint(blocked?0x94eaff:0xff718c);
    this.scene.time.delayedCall(160,()=>this.active&&this.visual.clearTint());
    if(this.health<=0) {
      this.dead=true;this.lastDamageResult='dead';this.guardUntil=0;
      this.guardCounterReady=false;
      this.setVelocity(0);this.visual.setVisible(false);this.shadow.setVisible(false);this.body.enable=false;
      this.slash.clear();this.marker.clear();this.shield.clear();this.weapon.destroy();
    }
    return true;
  }

  override destroy(fromScene?:boolean):void {
    this.visual?.destroy();this.shadow?.destroy();this.slash?.destroy();this.marker?.destroy();this.shield?.destroy();this.weapon?.destroy();super.destroy(fromScene);
  }
}
