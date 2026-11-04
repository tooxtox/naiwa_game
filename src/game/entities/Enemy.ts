import * as Phaser from 'phaser';
import { ENEMY, WORLD, type EnemyKind } from '../config';
import type { Player } from './Player';
import type { NavigationGrid } from '../systems/NavigationGrid';
import { getEnemyMaxHealth, getEnemyDamage } from '../systems/DifficultySystem';
import { ENEMY_TACTICS, encounterSide } from '../systems/EnemyTactics';
import { getPreferences } from '../systems/Preferences';
export type EnemyState = 'Idle' | 'Chase' | 'Attack' | 'Hurt' | 'Dead';
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  private static readonly squads=new WeakMap<Phaser.Scene,Set<Enemy>>();
  declare body: Phaser.Physics.Arcade.Body;
  state: EnemyState = 'Idle';
  health: number;
  maxHealth: number;
  damage: number;
  readonly visual: Phaser.GameObjects.Image;
  protected readonly shadow: Phaser.GameObjects.Ellipse;
  protected readonly tell: Phaser.GameObjects.Graphics;
  protected readonly bar: Phaser.GameObjects.Graphics;
  private readonly speed: number;
  private nextAttack = 0;
  private windupUntil = 0;
  private hurtUntil = 0;
  private rushingUntil = 0;
  private rushAngle = 0;
  protected slowUntil = 0;
  protected slowMultiplier=.55;
  protected stunUntil = 0;
  private nextPath = 0;
  private path: {x:number;y:number}[] = [];
  private encounterChapter=1;
  private encounterSlot=0;
  private enteredEncounter=false;
  private readonly squad:Set<Enemy>;
  enraged=false;

  constructor(scene: Phaser.Scene, x: number, y: number, public kind: EnemyKind, wave: number, protected nav: NavigationGrid) {
    super(scene, x, y, `enemy-${kind}`);
    let squad=Enemy.squads.get(scene);
    if(!squad){squad=new Set();Enemy.squads.set(scene,squad);}
    this.squad=squad;this.squad.add(this);
    scene.add.existing(this); scene.physics.add.existing(this);
    const cfg = ENEMY[kind];
    this.maxHealth = this.health = getEnemyMaxHealth(kind, wave);
    this.damage = getEnemyDamage(kind, wave);
    this.speed = cfg.speed * (1 + Math.min(wave - 1, 12) * .035);
    this.setOrigin(.5, 1).setVisible(false).setCollideWorldBounds(true);
    const bw = kind === 'elite' ? 36 : 25, bh = kind === 'elite' ? 19 : 14;
    this.body.setSize(bw, bh).setOffset((this.width - bw)/2, this.height - bh - 1).setAllowGravity(false);
    this.visual = scene.add.image(x, y, `enemy-${kind}`).setOrigin(.5, 1);
    this.shadow = scene.add.ellipse(x, y - 2, kind === 'elite' ? 55 : 37, kind === 'elite' ? 23 : 15, 0x030b17, .48);
    this.tell = scene.add.graphics(); this.bar = scene.add.graphics();
  }

  get isBoss():boolean {return false;}
  get hitRadius():number {return this.kind==='elite'?28:22;}
  get projectileSpeed():number {return this.kind==='elite'?290:255;}
  get projectileColor():number {return ENEMY[this.kind].color;}
  /** Wave composition may change, while all enemies still use the same foot grid. */
  configureEncounter(chapter:number,slot:number):void {
    this.encounterChapter=Math.min(5,Math.max(1,chapter));this.encounterSlot=slot;
  }
  setNavigation(nav:NavigationGrid):void {this.nav=nav;this.path.length=0;this.nextPath=0;}

  tick(now: number, player: Player, fire: (enemy: Enemy, spread: number) => void, hurt: (amount: number, x: number, y: number) => void): void {
    if (!this.active || this.state === 'Dead') return;
    if(!this.enteredEncounter) {
      this.enteredEncounter=true;
      this.nextAttack=Math.max(this.nextAttack,now+(this.encounterSlot%5)*140);
    }
    if(this.kind==='elite'&&!this.enraged&&this.health<=this.maxHealth*.5) {
      this.enraged=true;this.nextAttack=Math.max(this.nextAttack,now+450);
      this.scene.events.emit('elite-enraged',this);
    }
    const dx = player.x - this.x, dy = (player.y - this.y) / WORLD.verticalScale, distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    this.visual.setPosition(this.x, this.y + (this.kind === 'ranged' ? Math.sin(now * .004) * 3 - 4 : 0)).setDepth(this.y + 100).setFlipX(dx < 0);
    this.shadow.setPosition(this.x, this.y - 2).setDepth(this.y + 98);
    this.tell.clear().setPosition(this.x, this.y - 2).setDepth(this.y + 97).setScale(1, WORLD.verticalScale);
    this.bar.clear().setDepth(this.y + 140);
    if(this.enraged)this.tell.lineStyle(2,0xffd18a,.5).strokeCircle(0,0,34);
    if (this.health < this.maxHealth) {
      this.bar.fillStyle(0x081321, .9).fillRect(this.x - 22, this.y - this.height - 9, 44, 4);
      this.bar.fillStyle(ENEMY[this.kind].color).fillRect(this.x - 22, this.y - this.height - 9, 44 * this.health/this.maxHealth, 4);
    }
    if (now < this.stunUntil) {
      this.state = 'Hurt'; this.setVelocity(0);
      this.visual.setTint(0xa9f9ff);
      this.tell.lineStyle(2, 0xa9f9ff, .8).strokeCircle(0, 0, 27);
      return;
    }
    if (now < this.slowUntil) this.visual.setTint(0x8bd8ff);
    else if (now >= this.hurtUntil && !this.windupUntil) this.visual.clearTint();
    if (now < this.hurtUntil) { this.state = 'Hurt'; return; }
    if (now < this.rushingUntil) {
      this.state = 'Attack';
      const rushSpeed = ENEMY_TACTICS.rushSpeed * (now < this.slowUntil ? this.slowMultiplier : 1);
      this.setVelocity(Math.cos(this.rushAngle)*rushSpeed, Math.sin(this.rushAngle)*rushSpeed*WORLD.verticalScale);
      this.tell.lineStyle(2, 0xffb55e, .65).strokeCircle(0, 0, ENEMY_TACTICS.rushRadius);
      if (distance < ENEMY_TACTICS.rushRadius&&this.nav.lineOfSight(this.x,this.y,player.x,player.y)) hurt(this.damage, this.x, this.y);
      return;
    }
    if (this.windupUntil > 0) {
      this.state = 'Attack'; this.setVelocity(0);
      const color = ENEMY[this.kind].color;
      const radius=this.kind === 'melee' ? ENEMY_TACTICS.meleeRadius : 37;
      this.tell.lineStyle(2, color, .8).strokeCircle(0, 0, radius);
      this.tell.fillStyle(color, .12).fillCircle(0, 0, radius);
      if (this.kind === 'elite') {
        const length=ENEMY_TACTICS.rushSpeed*ENEMY_TACTICS.rushDuration/1000,r=ENEMY_TACTICS.rushRadius;
        const ex=Math.cos(this.rushAngle)*length,ey=Math.sin(this.rushAngle)*length,px=-Math.sin(this.rushAngle)*r,py=Math.cos(this.rushAngle)*r;
        this.tell.lineStyle(r*2, color, .11).lineBetween(0, 0, ex, ey);
        this.tell.fillStyle(color,.08).fillCircle(0,0,r).fillCircle(ex,ey,r);
        this.tell.lineStyle(2, color, .8).lineBetween(px,py,ex+px,ey+py).lineBetween(-px,-py,ex-px,ey-py).strokeCircle(0,0,r).strokeCircle(ex,ey,r);
        // The three shots share the charge direction and are visible before release.
        for(const spread of [-.36,0,.36])this.tell.lineStyle(1,color,.45).lineBetween(0,0,Math.cos(this.rushAngle+spread)*315,Math.sin(this.rushAngle+spread)*315);
      } else if(this.kind==='ranged') {
        const spread=this.encounterChapter>=2&&this.encounterSlot%2===1?.32:.18;
        for(const offset of [-spread,0,spread]) {
          const a=this.rushAngle+offset;
          this.tell.lineStyle(offset===0?2:1,color,.48).lineBetween(Math.cos(a)*38,Math.sin(a)*38,Math.cos(a)*390,Math.sin(a)*390);
        }
      }
      this.visual.setTint(!getPreferences().reducedMotion&&now % 160 < 80 ? 0xffffff : color);
      if (now >= this.windupUntil) {
        this.windupUntil = 0; this.visual.clearTint(); this.nextAttack = now + ENEMY[this.kind].cooldown*(this.enraged?.85:1);
        if (this.kind === 'melee') { if (distance < ENEMY_TACTICS.meleeRadius&&this.nav.lineOfSight(this.x,this.y,player.x,player.y)) hurt(this.damage, this.x, this.y); }
        else if (this.kind === 'ranged') {
          // Wide, visibly separated lanes alternate with the familiar aimed fan.
          const spread=this.encounterChapter>=2&&this.encounterSlot%2===1?.32:.18;
          const lockedSpread=this.rushAngle-angle;
          fire(this,lockedSpread-spread);fire(this,lockedSpread);fire(this,lockedSpread+spread);
        }
        else {
          this.rushingUntil=now+ENEMY_TACTICS.rushDuration;
          // Combat.fire aims at the player; convert back to the already locked telegraph.
          const lockedSpread=this.rushAngle-angle;
          fire(this,lockedSpread-.36);fire(this,lockedSpread);fire(this,lockedSpread+.36);
        }
      }
      return;
    }
    if (distance > 1500) { this.state = 'Idle'; this.setVelocity(0); return; }
    if (distance < ENEMY[this.kind].range && now >= this.nextAttack && this.nav.lineOfSight(this.x, this.y, player.x, player.y)) {
      this.windupUntil = now + (this.kind === 'melee' ? ENEMY_TACTICS.meleeWindup : this.kind === 'elite' ? ENEMY_TACTICS.eliteWindup : ENEMY_TACTICS.rangedWindup);
      this.rushAngle = angle;
      this.state = 'Attack'; this.setVelocity(0); return;
    }
    this.state = 'Chase';
    let targetX = player.x, targetY = player.y;
    if(this.encounterChapter===3&&this.kind==='ranged'&&distance>340&&!this.nav.lineOfSight(this.x,this.y,player.x,player.y)) {
      const flank=angle+(this.encounterSlot%2?1:-1)*1.1;
      targetX=Phaser.Math.Clamp(player.x-Math.cos(flank)*300,WORLD.inset+35,WORLD.width-WORLD.inset-35);
      targetY=Phaser.Math.Clamp(player.y-Math.sin(flank)*220,WORLD.inset+35,WORLD.height-WORLD.inset-35);
    }
    if (this.kind === 'ranged' && distance < 205) {
      targetX = Phaser.Math.Clamp(this.x - Math.cos(angle)*150, WORLD.inset+25, WORLD.width-WORLD.inset-25);
      targetY = Phaser.Math.Clamp(this.y - Math.sin(angle)*110, WORLD.inset+25, WORLD.height-WORLD.inset-25);
    } else if (this.kind === 'ranged' && distance < 335 && this.nav.lineOfSight(this.x,this.y,player.x,player.y)) {
      // Recover while moving across the player's aim, never firing during movement.
      const side=encounterSide(this.encounterSlot);
      targetX=this.x-Math.sin(angle)*side*110;targetY=this.y+Math.cos(angle)*side*80;
      if(!this.nav.clearLine(this.x,this.y,targetX,targetY)){targetX=this.x+Math.sin(angle)*side*90;targetY=this.y-Math.cos(angle)*side*65;}
    } else if(this.kind==='melee'&&distance<260&&distance>95) {
      // Slightly different approach lanes prevent every melee body sharing one dot.
      const offset=encounterSide(this.encounterSlot)*Math.min(70,distance*.26);
      const tx=player.x-Math.sin(angle)*offset,ty=player.y+Math.cos(angle)*offset*WORLD.verticalScale;
      if(this.nav.clearLine(this.x,this.y,tx,ty)){targetX=tx;targetY=ty;}
    } else if(this.kind==='melee'&&distance<95&&now<this.nextAttack) {
      const side=encounterSide(this.encounterSlot);
      targetX=this.x-Math.sin(angle)*side*65;targetY=this.y+Math.cos(angle)*side*47;
    }
    if (now >= this.nextPath) {
      this.path = this.nav.route(this.x, this.y, targetX, targetY);
      // An unreachable target used to run a complete A* search every frame.
      const blocked=this.body.blocked.up||this.body.blocked.down||this.body.blocked.left||this.body.blocked.right;
      this.nextPath = now + (blocked?ENEMY_TACTICS.blockedPathInterval:ENEMY_TACTICS.pathInterval)+(this.encounterSlot%5)*31;
    }
    while(this.path.length > 1 && Phaser.Math.Distance.Between(this.x,this.y,this.path[0].x,this.path[0].y)<23)this.path.shift();
    const point=this.path[0];
    if(!point){this.setVelocity(0);return;}
    const moveAngle=Math.atan2((point.y-this.y)/WORLD.verticalScale,point.x-this.x);
    const moveSpeed = this.speed * (this.enraged?1.2:1) * (now < this.slowUntil ? this.slowMultiplier : 1);
    let vx=Math.cos(moveAngle),vy=Math.sin(moveAngle);
    for(const other of this.squad) {
      if(other===this||!other.active||other.state==='Dead'||other.isBoss)continue;
      const ox=this.x-other.x,oy=(this.y-other.y)/WORLD.verticalScale,d=Math.hypot(ox,oy);
      if(d>=ENEMY_TACTICS.separationRadius)continue;
      const weight=(1-d/ENEMY_TACTICS.separationRadius)*ENEMY_TACTICS.separationStrength;
      if(d>.1){vx+=ox/d*weight;vy+=oy/d*weight;}
      else {vy+=encounterSide(this.encounterSlot)*weight;}
    }
    const length=Math.max(1,Math.hypot(vx,vy));
    this.setVelocity(vx/length*moveSpeed,vy/length*moveSpeed*WORLD.verticalScale);
  }

  applySlow(now:number,duration:number,multiplier=.55):void {
    if(this.state==='Dead')return;
    const strength=Phaser.Math.Clamp(multiplier,.35,1);
    this.slowMultiplier=now<this.slowUntil?Math.min(this.slowMultiplier,strength):strength;
    this.slowUntil=Math.max(this.slowUntil,now+duration);
  }

  stun(now:number,duration:number):void {
    if(this.state==='Dead')return;
    this.stunUntil=Math.max(this.stunUntil,now+duration);
    this.windupUntil=0;this.rushingUntil=0;this.setVelocity(0);
    this.nextAttack=Math.max(this.nextAttack,this.stunUntil+250);
  }

  hit(amount: number, angle: number, now: number): boolean {
    if (this.state === 'Dead') return false;
    this.health -= amount; this.hurtUntil = now + 140;
    this.windupUntil = 0; this.rushingUntil = 0; this.nextPath = 0;
    this.nextAttack = Math.max(this.nextAttack, now + 260);
    const knockback=this.kind==='elite'?85:170;
    this.visual.setTint(0xffffff);
    this.setVelocity(Math.cos(angle)*knockback,Math.sin(angle)*knockback*WORLD.verticalScale);
    this.scene.time.delayedCall(110, () => this.active && this.visual.clearTint());
    if (this.health <= 0) { this.state='Dead'; this.body.enable=false; return true; }
    return false;
  }
  override destroy(fromScene?: boolean): void {
    this.squad?.delete(this);
    this.visual?.destroy(); this.shadow?.destroy(); this.tell?.destroy(); this.bar?.destroy(); super.destroy(fromScene);
  }
}
