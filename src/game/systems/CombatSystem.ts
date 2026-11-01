import * as Phaser from 'phaser';
import { WORLD, ENEMY, CLASSES, ULTIMATE } from '../config';
import { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { Effects } from './Effects';
import type { AudioManager } from './AudioManager';

type ProjectileKind = 'magic' | 'arrow';
interface Projectile {
  image:Phaser.GameObjects.Image; active:boolean; kind:ProjectileKind;
  x:number; y:number; angle:number; speed:number; damage:number; traveled:number; range:number;
  born:number; pierces:number; critical:boolean; ultimate:boolean; splash:number;
  hit:Set<Enemy>; target:Enemy|null;
}
interface Solid {left:number;right:number;top:number;bottom:number;}
interface Ripple {x:number;y:number;born:number;duration:number;radius:number;color:number;}
interface Meteor {x:number;y:number;landAt:number;damage:number;radius:number;}

/** Floor-space combat: visuals are raised above the same 2.5D collision plane. */
export class CombatSystem {
  bullets:Phaser.Physics.Arcade.Group;
  target:Enemy|null=null;
  onKill:(enemy:Enemy)=>void=()=>{};
  onDamage:()=>void=()=>{};
  private readonly projectiles:Projectile[]=[];
  private readonly solids:Solid[]=[];
  private readonly telegraphs:Phaser.GameObjects.Graphics;
  private readonly targetMarker:Phaser.GameObjects.Graphics;
  private readonly ripples:Ripple[]=[];
  private readonly meteors:Meteor[]=[];
  private enemies:Enemy[]=[];
  private lastTick=0;

  constructor(private scene:Phaser.Scene,private player:Player,private effects:Effects,obstacles:Phaser.Physics.Arcade.StaticGroup,private audio:AudioManager|null=null) {
    this.bullets=scene.physics.add.group({defaultKey:'bullet',maxSize:48,allowGravity:false});
    this.bullets.createMultiple({key:'bullet',quantity:48,active:false,visible:false});
    this.bullets.children.forEach(child=>(child as Phaser.Physics.Arcade.Image).disableBody(true,true));
    obstacles.children.forEach(child=>{
      const body=(child as Phaser.Physics.Arcade.Image).body;
      if(body)this.solids.push({left:body.left,right:body.right,top:body.top,bottom:body.bottom});
    });
    scene.physics.add.collider(this.bullets,obstacles,bullet=>this.recycle(bullet as Phaser.Physics.Arcade.Image));
    scene.physics.add.overlap(player,this.bullets,(_p,bullet)=>{
      const b=bullet as Phaser.Physics.Arcade.Image;
      this.hurt(Number(b.getData('damage')),b.x,Number(b.getData('clock')),b.y);this.recycle(b);
    });
    this.makeProjectileTextures();
    for(let i=0;i<64;i++)this.projectiles.push({image:scene.add.image(-100,-100,'hero-arrow').setVisible(false),active:false,kind:'arrow',x:0,y:0,angle:0,speed:0,damage:0,traveled:0,range:0,born:0,pierces:1,critical:false,ultimate:false,splash:0,hit:new Set(),target:null});
    this.telegraphs=scene.add.graphics().setDepth(5000);
    this.targetMarker=scene.add.graphics();
  }

  /** Selection is strictly the closest living enemy, regardless of facing or cover. */
  acquireTarget(enemies:Enemy[]):Enemy|null {
    this.enemies=enemies;
    let closest:Enemy|null=null,nearest=Infinity;
    for(const enemy of enemies) {
      if(!enemy.active||enemy.state==='Dead')continue;
      const distance=Math.hypot(enemy.x-this.player.x,(enemy.y-this.player.y)/WORLD.verticalScale);
      if(distance<nearest){closest=enemy;nearest=distance;}
    }
    this.target=closest;return closest;
  }

  hurt(amount:number,sourceX:number,now:number,sourceY=this.player.y):void {
    const damaged=this.player.hurt(amount,sourceX,now,sourceY);
    const result=this.player.lastDamageResult;
    if(result==='parried') {
      this.effects.burst(this.player.x,this.player.y-24,0xa7f9ff,20,250);
      this.ripple(this.player.x,this.player.y,150,0xa7f9ff,now,420);
      this.clearHostile(this.player.x,this.player.y,165);
      for(const enemy of this.enemies)if(enemy.active&&this.distance(enemy.x,enemy.y,this.player.x,this.player.y)<150)enemy.stun(now,450);
      this.scene.cameras.main.shake(85,.002);return;
    }
    if(!damaged)return;
    this.effects.burst(this.player.x,this.player.y-26,result==='blocked'?0x8edfff:0xff758c,result==='blocked'?9:12,180);
    if(result==='blocked')this.ripple(this.player.x,this.player.y,56,0x8edfff,now,250);
    this.scene.cameras.main.shake(result==='blocked'?55:110,result==='blocked'?.001:.004);
    this.audio?.sfx(result==='blocked'?'guard':'hurt',result==='blocked'?.7:.85);
    this.onDamage();
  }

  fire(enemy:Enemy,spread:number,now:number):void {
    const b=this.bullets.get(enemy.x,enemy.y-8,'bullet') as Phaser.Physics.Arcade.Image|null;
    if(!b)return;
    b.enableBody(true,enemy.x,enemy.y-8,true,true);
    b.body!.setSize(11,11);b.setDepth(enemy.y+125).setTint(ENEMY[enemy.kind].color);
    const angle=Math.atan2((this.player.y-enemy.y)/WORLD.verticalScale,this.player.x-enemy.x)+spread;
    const speed=enemy.kind==='elite'?290:255;
    b.setVelocity(Math.cos(angle)*speed,Math.sin(angle)*speed*WORLD.verticalScale);
    b.setData({damage:enemy.damage,born:now,clock:now});
    this.audio?.sfx('enemy-shot',.35);
  }

  attack(enemies:Enemy[],now:number):void {
    if(this.player.dead)return;
    const p=this.player,target=this.acquireTarget(enemies);
    if(target) {
      p.attackAngle=Math.atan2((target.y-p.y)/WORLD.verticalScale,target.x-p.x);
      p.aimAngle=p.attackAngle;p.facing=Math.cos(p.attackAngle)<0?-1:1;
    }
    if(p.classId==='warrior'){this.melee(enemies,now);return;}
    const count=Math.min(7,Math.max(1,p.stats.projectileCount));
    for(let i=0;i<count;i++) {
      const spread=(i-(count-1)/2)*(p.classId==='mage'?.16:.105);
      const critical=Math.random()<p.stats.critChance;
      this.launch(p.classId==='mage'?'magic':'arrow',p.attackAngle+spread,p.stats.damage*(critical?2:1),now,false,critical,p.stats.pierceCount,p.stats.splashRadius,target);
    }
    this.audio?.sfx('shoot',.6);
    this.effects.burst(p.x+Math.cos(p.attackAngle)*35,p.y-28+Math.sin(p.attackAngle)*22,CLASSES[p.classId].color,4,75);
  }

  melee(enemies:Enemy[],now:number):void {
    const p=this.player,aimX=Math.cos(p.attackAngle),aimY=Math.sin(p.attackAngle);
    this.audio?.sfx('swing',.6);
    this.effects.burst(p.x+aimX*55,p.y-23+aimY*35,0xffd27b,4,90);
    for(const enemy of enemies) {
      if(!enemy.active||enemy.state==='Dead')continue;
      const dx=enemy.x-p.x,dy=(enemy.y-p.y)/WORLD.verticalScale,distance=Math.hypot(dx,dy);
      if(distance<=p.stats.attackRange&&(distance<25||(dx*aimX+dy*aimY)/distance>-.05)&&this.obstacleTime(p.x,p.y,enemy.x,enemy.y)===Infinity) {
        const critical=Math.random()<p.stats.critChance;
        this.damageEnemy(enemy,p.stats.damage*(critical?2:1)*(p.combo===3?1.3:1),Math.atan2(dy,dx),now,critical,false);
      }
    }
  }

  /** Player owns charge consumption. Ultimate hits intentionally grant no new charge. */
  ultimate(enemies:Enemy[],now:number):void {
    if(this.player.dead)return;
    const p=this.player,target=this.acquireTarget(enemies),multiplier=p.stats.ultimateMultiplier;
    if(target)p.attackAngle=Math.atan2((target.y-p.y)/WORLD.verticalScale,target.x-p.x);
    const color=CLASSES[p.classId].color;
    this.effects.burst(p.x,p.y-36,color,25,280);
    this.audio?.sfx('ultimate',.85);
    this.scene.cameras.main.shake(170,.004);
    if(p.classId==='warrior') {
      this.ripple(p.x,p.y,260,color,now,540);
      this.clearHostile(p.x,p.y,300);
      for(const enemy of enemies)if(enemy.active&&enemy.state!=='Dead'&&this.distance(enemy.x,enemy.y,p.x,p.y)<=260) {
        const angle=Math.atan2((enemy.y-p.y)/WORLD.verticalScale,enemy.x-p.x);
        this.damageEnemy(enemy,p.stats.damage*5.2*multiplier,angle,now,true,true);
        if(enemy.active)enemy.stun(now,620);
      }
    } else if(p.classId==='mage') {
      const x=target?.x??p.x+Math.cos(p.aimAngle)*180,y=target?.y??p.y+Math.sin(p.aimAngle)*130;
      if(this.meteors.length<6)this.meteors.push({x:Phaser.Math.Clamp(x,WORLD.inset,WORLD.width-WORLD.inset),y:Phaser.Math.Clamp(y,WORLD.inset,WORLD.height-WORLD.inset),landAt:now+500,damage:p.stats.damage*6*multiplier,radius:240});
      this.ripple(p.x,p.y,80,color,now,400);
    } else {
      for(let i=0;i<9;i++)this.launch('arrow',p.attackAngle+(i-4)*.105,p.stats.damage*2.7*multiplier,now,true,true,Math.max(3,p.stats.pierceCount),0,target);
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
    for(const projectile of this.projectiles)if(projectile.active)this.advance(projectile,delta/1000,now,enemies);
    for(let i=this.meteors.length-1;i>=0;i--) {
      const meteor=this.meteors[i];
      if(now<meteor.landAt)continue;
      this.meteors.splice(i,1);
      this.explode(meteor.x,meteor.y,meteor.radius,meteor.damage,now,true,true,enemies);
      this.clearHostile(meteor.x,meteor.y,meteor.radius);
      this.scene.cameras.main.shake(220,.007);
    }
    this.drawEffects(now);
    this.targetMarker.clear();
    if(this.target?.active&&this.target.state!=='Dead') {
      const pulse=.6+Math.sin(now*.008)*.15,color=CLASSES[this.player.classId].color;
      this.targetMarker.setPosition(this.target.x,this.target.y).setDepth(this.target.y+96);
      this.targetMarker.lineStyle(2,color,pulse).strokeEllipse(0,-1,this.target.kind==='elite'?70:51,this.target.kind==='elite'?35:25);
      this.targetMarker.fillStyle(color,pulse).fillTriangle(-6,-8,6,-8,0,-2);
    }
  }

  clear():void {
    this.bullets.children.forEach(child=>this.recycle(child as Phaser.Physics.Arcade.Image));
    for(const p of this.projectiles)this.release(p);
    this.meteors.length=0;this.ripples.length=0;this.telegraphs.clear();this.targetMarker.clear();this.target=null;
  }

  private launch(kind:ProjectileKind,angle:number,damage:number,now:number,ultimate:boolean,critical:boolean,pierces:number,splash:number,target:Enemy|null):void {
    const p=this.projectiles.find(item=>!item.active);if(!p)return;
    const stats=this.player.stats;
    p.active=true;p.kind=kind;p.x=this.player.x+Math.cos(angle)*29;p.y=this.player.y+Math.sin(angle)*20;
    p.angle=angle;p.damage=damage;p.speed=stats.projectileSpeed*(ultimate?1.2:1);p.range=stats.attackRange*(ultimate?1.35:1);
    p.traveled=0;p.born=now;p.pierces=Math.max(1,pierces);p.critical=critical;p.ultimate=ultimate;p.splash=splash;p.target=target;p.hit.clear();
    p.image.setTexture(kind==='magic'?'hero-magic':'hero-arrow').setPosition(p.x,p.y-25).setDepth(p.y+135).setVisible(true).setAlpha(1).setScale(ultimate?1.35:1).setRotation(Math.atan2(Math.sin(angle)*WORLD.verticalScale,Math.cos(angle)));
    p.image.setTint(kind==='magic'?0xcfb7ff:ultimate?0xf0ffb0:0xa1ffe3);
  }

  private advance(p:Projectile,dt:number,now:number,enemies:Enemy[]):void {
    if(now-p.born>3800||p.traveled>=p.range||this.outside(p.x,p.y)){this.release(p);return;}
    if(p.kind==='magic'&&p.target?.active&&p.target.state!=='Dead') {
      const desired=Math.atan2((p.target.y-p.y)/WORLD.verticalScale,p.target.x-p.x);
      const turn=Phaser.Math.Angle.Wrap(desired-p.angle);
      p.angle+=Phaser.Math.Clamp(turn,-3.5*dt,3.5*dt);
    }
    const step=p.speed*dt,tx=p.x+Math.cos(p.angle)*step,ty=p.y+Math.sin(p.angle)*step*WORLD.verticalScale;
    const obstacle=this.obstacleTime(p.x,p.y,tx,ty),hits:{enemy:Enemy;t:number}[]=[];
    for(const enemy of enemies) {
      if(!enemy.active||enemy.state==='Dead'||p.hit.has(enemy))continue;
      const t=this.hitTime(p.x,p.y,tx,ty,enemy.x,enemy.y,enemy.kind==='elite'?28:22);
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
      this.damageEnemy(hit.enemy,p.damage,p.angle,now,p.critical,p.ultimate);
      if(--p.pierces<=0){this.release(p);return;}
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

  private explode(x:number,y:number,radius:number,damage:number,now:number,critical:boolean,ultimate:boolean,enemies:Enemy[]):void {
    const color=ultimate?0xd8bbff:0xbba0ff;
    this.effects.burst(x,y-25,color,ultimate?32:12,ultimate?300:150);
    this.ripple(x,y,Math.max(24,radius),color,now,ultimate?600:260);
    for(const enemy of enemies)if(enemy.active&&enemy.state!=='Dead'&&this.distance(enemy.x,enemy.y,x,y)<=radius+(enemy.kind==='elite'?16:8)) {
      this.damageEnemy(enemy,damage,Math.atan2((enemy.y-y)/WORLD.verticalScale,enemy.x-x),now,critical,ultimate);
      if(ultimate&&enemy.active)enemy.stun(now,700);
    }
  }

  private damageEnemy(enemy:Enemy,amount:number,angle:number,now:number,critical:boolean,ultimate:boolean):void {
    if(!enemy.active||enemy.state==='Dead')return;
    const damage=Math.max(1,Math.round(amount)),dead=enemy.hit(damage,angle,now);
    const color=CLASSES[this.player.classId].color;
    this.effects.burst(enemy.x,enemy.y-26,critical?0xffe7a6:color,dead?16:5,dead?240:120);
    this.effects.number(enemy.x,enemy.y-20,damage,critical);
    if(dead)this.audio?.sfx('kill',.7);
    else this.audio?.sfx(critical?'crit':'hit',critical?.8:.5);
    if(!ultimate) {
      this.player.addUltimateCharge(ULTIMATE.hitCharge);
      if(!this.player.dead&&this.player.stats.lifeSteal>0)this.player.health=Math.min(this.player.stats.maxHealth,this.player.health+Math.round(this.player.stats.lifeSteal));
      if(!dead&&this.player.stats.slowDuration>0)enemy.applySlow(now,this.player.stats.slowDuration);
      if(dead)this.player.addUltimateCharge(enemy.kind==='elite'?ULTIMATE.eliteCharge:ULTIMATE.killCharge);
    }
    if(dead){this.onKill(enemy);enemy.destroy();}
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
      const t=Phaser.Math.Clamp(1-(m.landAt-now)/500,0,1),color=0xc4a4ff;
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
  private release(p:Projectile):void {p.active=false;p.image.setVisible(false);p.hit.clear();p.target=null;}
  private recycle(bullet:Phaser.Physics.Arcade.Image):void {bullet.disableBody(true,true);}
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
