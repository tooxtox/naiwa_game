import * as Phaser from 'phaser';
import { WORLD, type ClassId } from '../config';
import { getPreferences } from './Preferences';

export type SkillEffectKind='attack'|'dash'|'guard'|'counter'|'ultimate'|'impact';
type EffectKind=SkillEffectKind|'boss-death';
interface Mote {image:Phaser.GameObjects.Image;vx:number;vy:number;life:number;maxLife:number;gravity:number;opacity:number;}
interface DamageLabel {text:Phaser.GameObjects.Text;life:number;startY:number;}
interface BossGhost {
  image:Phaser.GameObjects.Image;width:number;height:number;x:number;y:number;angle:number;flipX:boolean;
}
interface SkillVisual {
  graphics:Phaser.GameObjects.Graphics;kind:EffectKind;classId:ClassId;x:number;y:number;angle:number;
  color:number;radius:number;elapsed:number;duration:number;serial:number;ghost:BossGhost|null;
}
const TAU=Math.PI*2;
const LIFETIMES:Record<SkillEffectKind,number>={attack:320,dash:330,guard:650,counter:560,ultimate:1100,impact:300};
const PRIORITY:Record<EffectKind,number>={impact:0,attack:1,dash:2,guard:3,counter:4,ultimate:5,'boss-death':6};

/** All presentation advances on the scene's combat clock; pools never grow during play. */
export class Effects {
  private readonly pool:Mote[]=[];
  private readonly labels:DamageLabel[]=[];
  private readonly visuals:SkillVisual[]=[];
  private readonly bossGhosts:BossGhost[]=[];
  private labelIndex=0;
  private serial=0;
  private destroyed=false;

  constructor(private scene:Phaser.Scene) {
    for(let i=0;i<100;i++)this.pool.push({image:scene.add.image(-100,-100,'spark').setDepth(12).setVisible(false),vx:0,vy:0,life:0,maxLife:1,gravity:0,opacity:.8});
    for(let i=0;i<12;i++)this.labels.push({text:scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'19px',fontStyle:'bold',color:'#f4fff6',stroke:'#091627',strokeThickness:4}).setOrigin(.5).setDepth(15).setVisible(false),life:0,startY:0});
    // The last two slots are reserved for boss deaths, so combat bursts cannot evict them.
    for(let i=0;i<24;i++)this.visuals.push({graphics:scene.add.graphics().setName(`vfx-slot-${i}`).setVisible(false),kind:'impact',classId:'warrior',x:0,y:0,angle:0,color:0xffffff,radius:96,elapsed:0,duration:0,serial:0,ghost:null});
    for(let i=0;i<2;i++)this.bossGhosts.push({image:scene.add.image(-100,-100,'spark').setName(`vfx-boss-ghost-${i}`).setVisible(false),width:1,height:1,x:0,y:0,angle:0,flipX:false});
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN,this.destroy,this);
    scene.events.once(Phaser.Scenes.Events.DESTROY,this.destroy,this);
  }

  burst(x:number,y:number,color:number,count=10,power=140):void {
    if(this.destroyed)return;
    if(getPreferences().reducedMotion){count=Math.max(2,Math.ceil(count*.35));power*=.45;}
    let spawned=0;
    for(const mote of this.pool) {
      if(mote.life>0)continue;
      const angle=Math.random()*TAU,speed=(.3+Math.random()*.7)*power;
      mote.vx=Math.cos(angle)*speed;mote.vy=Math.sin(angle)*speed-40;
      mote.life=mote.maxLife=300+Math.random()*330;mote.gravity=220;mote.opacity=.8;
      mote.image.setTexture('spark').setOrigin(.5).setDepth(y+165).setFlipX(false).setRotation(0).setPosition(x,y).setVisible(true).setAlpha(.8).setTint(color).setScale(.5+Math.random()*.7);
      if(++spawned>=count)break;
    }
  }

  trail(x:number,y:number,facing:number,visual?:Phaser.GameObjects.Sprite):void {
    if(this.destroyed||getPreferences().reducedMotion)return;
    const mote=this.pool.find(m=>m.life<=0);if(!mote)return;
    mote.life=mote.maxLife=190;mote.vx=0;mote.vy=0;mote.gravity=0;mote.opacity=.32;
    if(visual) {
      mote.image.setTexture(visual.texture.key,visual.frame.name).setOrigin(visual.originX,visual.originY)
        .setDisplaySize(visual.displayWidth,visual.displayHeight).setFlipX(visual.flipX).setPosition(visual.x,visual.y).setRotation(visual.rotation);
    } else mote.image.setTexture('player').setOrigin(.5,1).setScale(1).setFlipX(facing<0).setPosition(x,y).setRotation(0);
    mote.image.setDepth(y+99).setVisible(true).setTint(0xffdc82).setAlpha(.32);
  }

  number(x:number,y:number,value:number,critical=false):void {
    if(this.destroyed)return;
    const label=this.labels[this.labelIndex++%this.labels.length];
    label.life=600;label.startY=y-32;
    label.text.setPosition(x,label.startY).setDepth(y+250).setText(critical?`${value}!`:`${value}`).setColor(critical?'#ffd29b':'#edfff9').setAlpha(1).setScale(critical?1.25:1).setVisible(true);
  }

  /** x/y are chest coordinates. Angles use the game's uncompressed floor direction. */
  skill(kind:SkillEffectKind,x:number,y:number,angle:number,color:number,classId:ClassId='warrior',radius=96):void {
    if(this.destroyed)return;
    let slot:SkillVisual|undefined;
    for(let i=0;i<22;i++)if(this.visuals[i].duration===0){slot=this.visuals[i];break;}
    if(!slot)for(let i=0;i<22;i++) {
      const candidate=this.visuals[i];
      if(!slot||PRIORITY[candidate.kind]<PRIORITY[slot.kind]||(PRIORITY[candidate.kind]===PRIORITY[slot.kind]&&candidate.serial<slot.serial))slot=candidate;
    }
    if(!slot||PRIORITY[slot.kind]>PRIORITY[kind]&&slot.duration>0)return;
    this.start(slot,kind,x,y,angle,color,classId,Phaser.Math.Clamp(radius,24,780),LIFETIMES[kind]);
  }

  /** Capture the image now: the enemy and its visual may be destroyed immediately after this call. */
  bossDeath(x:number,y:number,color:number,visual?:Phaser.GameObjects.Image):void {
    if(this.destroyed)return;
    const index=this.visuals[22].duration===0?0:this.visuals[23].duration===0?1:this.visuals[22].serial<this.visuals[23].serial?0:1;
    const slot=this.visuals[22+index],ghost=this.bossGhosts[index];
    this.start(slot,'boss-death',x,y,0,color,'warrior',145,1450);
    if(visual?.active&&visual.texture) {
      ghost.width=visual.displayWidth;ghost.height=visual.displayHeight;ghost.x=visual.x-x;ghost.y=visual.y-y;
      ghost.angle=visual.rotation;ghost.flipX=visual.flipX;
      ghost.image.setTexture(visual.texture.key,visual.frame.name).setOrigin(visual.originX,visual.originY)
        .setDisplaySize(ghost.width,ghost.height).setPosition(visual.x,visual.y).setRotation(ghost.angle)
        .setFlipX(ghost.flipX).setFlipY(visual.flipY).setTint(color).setAlpha(.85).setDepth(y+140).setVisible(true);
      slot.ghost=ghost;
    }
    this.burst(x,y-48,color,24,270);
    this.draw(slot);
  }

  private start(slot:SkillVisual,kind:EffectKind,x:number,y:number,angle:number,color:number,classId:ClassId,radius:number,duration:number):void {
    if(slot.ghost){slot.ghost.image.setVisible(false);slot.ghost=null;}
    slot.kind=kind;slot.classId=classId;slot.x=x;slot.y=y;slot.angle=angle;slot.color=color;slot.radius=radius;
    slot.elapsed=0;slot.duration=duration;slot.serial=++this.serial;
    slot.graphics.clear().setName(`vfx-${kind}`).setPosition(x,y).setDepth(y+(kind==='boss-death'?180:160)).setAlpha(1).setScale(1).setVisible(true)
      .setData({vfxKind:kind,classId,elapsed:0,duration,serial:slot.serial});
    this.draw(slot);
  }

  tick(delta:number):void {
    if(this.destroyed||delta<=0)return;
    const dt=delta/1000;
    for(const mote of this.pool)if(mote.life>0) {
      mote.life-=delta;mote.vy+=mote.gravity*dt;
      mote.image.x+=mote.vx*dt;mote.image.y+=mote.vy*dt;
      mote.image.setAlpha(Math.max(0,mote.life/mote.maxLife)*mote.opacity);
      if(mote.life<=0)mote.image.setVisible(false);
    }
    for(const label of this.labels)if(label.life>0) {
      label.life=Math.max(0,label.life-delta);
      const t=1-label.life/600;
      label.text.y=label.startY-48*(1-(1-t)*(1-t));
      label.text.setAlpha(Math.min(1,label.life/230));
      if(label.life===0)label.text.setVisible(false);
    }
    for(const slot of this.visuals)if(slot.duration>0) {
      slot.elapsed+=delta;slot.graphics.setData('elapsed',slot.elapsed);
      if(slot.elapsed>=slot.duration) {
        slot.graphics.clear().setVisible(false);slot.duration=0;
        if(slot.ghost){slot.ghost.image.setVisible(false);slot.ghost=null;}
      } else this.draw(slot);
    }
  }

  private draw(s:SkillVisual):void {
    const g=s.graphics,t=s.elapsed/s.duration,fade=1-t,c=s.color;
    g.clear();g.setAlpha(getPreferences().reducedMotion?.55:1);
    if(s.kind==='boss-death'){this.drawBossDeath(s,t);return;}
    if(s.kind==='ultimate'){this.drawUltimate(s,t);return;}
    if(s.kind==='attack'){this.drawAttack(s,t);return;}
    if(s.kind==='dash') {
      const ex=Math.cos(s.angle),ey=Math.sin(s.angle)*WORLD.verticalScale,px=-Math.sin(s.angle),py=Math.cos(s.angle)*WORLD.verticalScale;
      for(let i=0;i<7;i++) {
        const side=(i-3)*9,length=40+(i%3)*16,head=22+t*62;
        const x=-ex*head+px*side,y=22-ey*head+py*side;
        g.lineStyle(i===3?4:2,c,fade*(i%2?.65:.9)).lineBetween(x,y,x-ex*length,y-ey*length);
        if(i%2===0)g.lineStyle(1,0xfff6d6,fade*.75).lineBetween(x,y,x-ex*length*.7,y-ey*length*.7);
      }
      this.arc(g,0,22,26+t*34,14+t*17,s.angle+1.5,s.angle+4.8,3,c,fade*.7);
      return;
    }
    if(s.kind==='guard') {
      const open=Math.min(1,t*6),alpha=Math.min(1,fade*4),w=42*open,h=46*open;
      g.fillStyle(c,.05*alpha).fillEllipse(0,0,w*2,h*2);
      g.lineStyle(7,c,.1*alpha).strokeEllipse(0,0,w*2+7,h*2+7);
      g.lineStyle(2,c,.9*alpha).beginPath().moveTo(0,-h).lineTo(w*.85,-h*.52).lineTo(w*.72,h*.4).lineTo(0,h).lineTo(-w*.72,h*.4).lineTo(-w*.85,-h*.52).closePath().strokePath();
      this.arc(g,0,0,w+7,h+4,s.angle-1.15,s.angle+1.15,5,0xfff1bc,alpha*.9);
      for(let i=0;i<6;i++) {
        const a=i*TAU/6-.5+t*.4;
        this.diamond(g,Math.cos(a)*(w+8),Math.sin(a)*(h+6),3,c,alpha*.8);
      }
      g.lineStyle(2,0xffffff,alpha*.6).lineBetween(-7,-5,7,-5).lineBetween(0,-12,0,5);
      return;
    }
    if(s.kind==='counter') {
      const shock=Math.min(1,t*3),range=Math.min(s.radius,520),ex=Math.cos(s.angle),ey=Math.sin(s.angle)*WORLD.verticalScale;
      const head=range*Math.min(1,t*1.8),tail=Math.max(0,head-80);
      this.arc(g,0,0,28+shock*46,23+shock*31,s.angle-2.25,s.angle+2.25,6,c,fade*.65);
      this.arc(g,0,0,36+shock*46,28+shock*31,s.angle-1.6,s.angle+1.6,2,0xfff6d8,fade);
      g.lineStyle(13,c,.11*fade).lineBetween(ex*tail,ey*tail,ex*head,ey*head);
      g.lineStyle(4,c,fade).lineBetween(ex*tail,ey*tail,ex*head,ey*head);
      g.lineStyle(1,0xffffff,fade).lineBetween(ex*tail,ey*tail,ex*head,ey*head);
      this.star(g,ex*head,ey*head,10+Math.sin(t*Math.PI)*8,0xfff4cf,fade);
      if(t>.42)this.arc(g,ex*range,ey*range,6+(t-.42)*54,5+(t-.42)*36,0,TAU,2,c,fade);
      return;
    }
    if(s.radius>120) {
      // Ultimate pulses show their real floor footprint, without an opaque screen flash.
      const expand=1-Math.pow(1-t,3),r=s.radius*(.18+.82*expand);
      g.lineStyle(11,c,fade*.1).strokeEllipse(0,24,r*2,r*2*WORLD.verticalScale);
      g.lineStyle(3,c,fade*.85).strokeEllipse(0,24,r*2,r*2*WORLD.verticalScale);
      g.lineStyle(1,0xfff2d6,fade*.8).strokeEllipse(0,24,r*1.82,r*1.82*WORLD.verticalScale);
      if(s.classId==='warrior')this.cracks(g,r*.9,c,fade*.7);
      else for(let i=0;i<8;i++) {
        const a=i*TAU/8,x=Math.cos(a)*r*.8,y=24+Math.sin(a)*r*.8*WORLD.verticalScale;
        this.diamond(g,x,y,5+fade*4,c,fade);
      }
    }
    // Short, local hit confirmation accompanies the wider floor shock for a major hit.
    const r=10+t*28;
    this.arc(g,0,0,r,r*.75,-.8,1.4,3,c,fade);
    this.arc(g,0,0,r,r*.75,2.1,4.3,2,0xffefce,fade);
    for(let i=0;i<5;i++) {
      const a=i*TAU/5+s.angle,d=8+t*37;
      g.lineStyle(2,c,fade).lineBetween(Math.cos(a)*d,Math.sin(a)*d*.75,Math.cos(a)*(d+10),Math.sin(a)*(d+10)*.75);
    }
  }

  private drawAttack(s:SkillVisual,t:number):void {
    const g=s.graphics,c=s.color,fade=1-t,a=s.angle;
    if(s.classId==='warrior') {
      const r=Math.min(116,Math.max(52,s.radius*.7)),start=a-1.25+t*.8,end=start+1.95;
      this.arc(g,0,0,r,r*WORLD.verticalScale,start,end,17,c,fade*.12);
      this.arc(g,0,0,r,r*WORLD.verticalScale,start,end,8,c,fade*.85);
      this.arc(g,0,0,r+8,(r+8)*WORLD.verticalScale,start+.1,end,2,0xfff7ce,fade);
      this.arc(g,0,0,r-13,(r-13)*WORLD.verticalScale,start+.3,end-.15,2,0xffa85c,fade*.7);
      this.star(g,Math.cos(end)*r,Math.sin(end)*r*WORLD.verticalScale,8*fade,0xfff5c5,fade);
    } else if(s.classId==='mage') {
      const reach=24+t*54,x=Math.cos(a)*reach,y=Math.sin(a)*reach*WORLD.verticalScale;
      g.lineStyle(2,c,fade*.65).strokeEllipse(0,22,52+t*16,25+t*8);
      this.arc(g,x,y,15+t*11,12+t*8,-t*3,TAU-t*3,2,c,fade);
      for(let i=0;i<5;i++) {
        const orbit=i*TAU/5+t*3,r=11+t*15;
        const bx=x+Math.cos(orbit)*r,by=y+Math.sin(orbit)*r*.75;
        g.fillStyle(i%2?0xfff3d6:c,fade*.65).fillCircle(bx,by,3+i%3);
      }
      this.star(g,x,y,6,c,fade);
    } else {
      const ex=Math.cos(a),ey=Math.sin(a)*WORLD.verticalScale,px=-Math.sin(a),py=Math.cos(a)*WORLD.verticalScale,head=37+t*93,tail=head-40;
      g.lineStyle(8,c,fade*.12).lineBetween(ex*tail,ey*tail,ex*head,ey*head);
      g.lineStyle(3,c,fade).lineBetween(ex*tail,ey*tail,ex*head,ey*head);
      g.lineStyle(1,0xfff9d6,fade).lineBetween(ex*tail,ey*tail,ex*head,ey*head);
      g.fillStyle(0xfff3d6,fade).fillTriangle(ex*(head+8),ey*(head+8),ex*(head-3)+px*4,ey*(head-3)+py*4,ex*(head-3)-px*4,ey*(head-3)-py*4);
      this.arc(g,0,0,30+t*12,22+t*8,a-1.1,a+1.1,2,c,fade*.65);
    }
  }

  private drawUltimate(s:SkillVisual,t:number):void {
    const g=s.graphics,c=s.color,fade=1-t,r=Math.min(s.radius,400);
    if(s.classId==='warrior') {
      const expand=1-Math.pow(1-Math.min(1,t*2.7),3),spin=t*TAU*1.7;
      g.fillStyle(c,.045*fade).fillEllipse(0,24,r*2*expand,r*2*WORLD.verticalScale*expand);
      for(let i=0;i<3;i++) {
        const a=s.angle+spin+i*TAU/3;
        this.arc(g,0,15,r*expand,r*WORLD.verticalScale*expand,a,a+1.5,15,c,fade*.12);
        this.arc(g,0,15,r*expand,r*WORLD.verticalScale*expand,a,a+1.5,6,c,fade*.9);
        this.arc(g,0,15,r*expand+9,r*WORLD.verticalScale*expand+6,a+.2,a+1.5,2,0xfff3c4,fade);
      }
      if(t>.12)this.cracks(g,r*expand,c,Math.sin(Math.min(1,(t-.12)*2)*Math.PI)*.75);
      g.lineStyle(2,c,fade*.5).strokeEllipse(0,24,r*2*expand*.75,r*2*WORLD.verticalScale*expand*.75);
      this.star(g,0,-6,20*fade,0xfff1c2,fade*.6);
    } else if(s.classId==='mage') {
      const landing=600/s.duration,focus=t<landing,phase=focus?t/landing:(t-landing)/(1-landing),ring=focus?r*(.8+.2*phase):r*(.35+.65*(1-Math.pow(1-phase,3)));
      const alpha=focus?.55+phase*.35:(1-phase)*.9;
      g.fillStyle(c,.045*alpha).fillEllipse(0,24,ring*2,ring*2*WORLD.verticalScale);
      g.lineStyle(7,c,.13*alpha).strokeEllipse(0,24,ring*2,ring*2*WORLD.verticalScale);
      g.lineStyle(2,c,alpha).strokeEllipse(0,24,ring*2,ring*2*WORLD.verticalScale);
      g.lineStyle(1,0xfff1df,alpha*.8).strokeEllipse(0,24,ring*1.7,ring*1.7*WORLD.verticalScale);
      for(let i=0;i<8;i++) {
        const a=i*TAU/8+t*.8,x=Math.cos(a)*ring*.9,y=24+Math.sin(a)*ring*.9*WORLD.verticalScale;
        this.diamond(g,x,y,5,c,alpha);
        if(focus)g.lineStyle(1,c,alpha*.22).lineBetween(x,y,x*.25,24+(y-24)*.25);
      }
      if(focus) {
        const y=-185+phase*120;
        g.lineStyle(22,c,.12*phase).lineBetween(0,y-80,0,y);
        g.fillStyle(0xfff2e4,.8).fillCircle(0,y,10+phase*18);
        g.lineStyle(2,c,.9).strokeCircle(0,y,15+phase*21);
        for(let i=0;i<5;i++)g.fillStyle(c,.6).fillCircle(Math.cos(i*2+t*5)*(16+phase*15),y+Math.sin(i*2+t*5)*17,5+i%3*2);
      } else {
        const beam=(1-phase)*(1-phase);
        g.lineStyle(58,c,beam*.12).lineBetween(0,-230,0,18);
        g.lineStyle(15,0xfff0df,beam*.65).lineBetween(0,-230,0,18);
        this.star(g,0,5,45*(1-phase),0xfff5dd,1-phase);
        for(let i=0;i<11;i++) {
          const a=i*TAU/11,d=22+phase*r*.88;
          const x=Math.cos(a)*d,y=24+Math.sin(a)*d*WORLD.verticalScale-Math.sin(phase*Math.PI)*(20+i%3*9);
          g.fillStyle(i%3?c:0xfff4d9,(1-phase)*.7).fillCircle(x,y,4+(i%3)*3);
          g.lineStyle(1,0xfff1df,(1-phase)*.8).strokeCircle(x,y,5+(i%3)*3);
        }
      }
    } else {
      for(let i=0;i<9;i++) {
        const age=s.elapsed-i*55;if(age<0)continue;
        const progress=Math.min(1,age/700),travel=24+progress*Math.min(500,r*2),alpha=1-progress;
        const a=s.angle+(i-4)*.105,ex=Math.cos(a),ey=Math.sin(a)*WORLD.verticalScale,px=-Math.sin(a),py=Math.cos(a)*WORLD.verticalScale;
        const head=travel+(i%3)*15,tail=Math.max(12,head-70-t*60);
        g.lineStyle(10,c,alpha*.08).lineBetween(ex*tail,ey*tail,ex*head,ey*head);
        g.lineStyle(i===4?4:2,c,alpha*.85).lineBetween(ex*tail,ey*tail,ex*head,ey*head);
        g.lineStyle(1,0xfff6ce,alpha).lineBetween(ex*(head-40),ey*(head-40),ex*head,ey*head);
        g.fillStyle(0xfff6d2,alpha).fillTriangle(ex*(head+12),ey*(head+12),ex*(head-2)+px*5,ey*(head-2)+py*5,ex*(head-2)-px*5,ey*(head-2)-py*5);
      }
      this.arc(g,0,24,40+t*100,23+t*55,s.angle+1.3,s.angle+5,3,c,fade*.75);
      for(let i=0;i<5;i++)this.diamond(g,Math.cos(s.angle+Math.PI/2)*(i-2)*16,Math.sin(s.angle+Math.PI/2)*(i-2)*12,4,c,fade);
    }
  }

  private drawBossDeath(s:SkillVisual,t:number):void {
    const g=s.graphics,c=s.color,collapse=Math.min(1,t/.3),release=Math.max(0,(t-.23)/.77),fade=1-release;
    if(s.ghost) {
      const ghost=s.ghost,scale=1-collapse*.19-Math.max(0,t-.22)*.9;
      ghost.image.setPosition(s.x+ghost.x+Math.sin(t*95)*(1-collapse)*3,s.y+ghost.y-collapse*13)
        .setDisplaySize(ghost.width*Math.max(.05,scale),ghost.height*Math.max(.05,scale))
        .setRotation(ghost.angle+Math.sin(t*70)*.015*(1-collapse)).setAlpha(Math.max(0,1-t/.56)*.85);
      ghost.image.setTint(t<.19?c:0xffedce);
    }
    // Local fragments suggest the captured silhouette breaking apart, while the map stays legible.
    if(t<.38) {
      const height=s.ghost?.height??138,width=s.ghost?.width??160;
      g.lineStyle(2,0xffedce,(1-t/.38)*.9);
      for(let i=0;i<6;i++) {
        const x=(i/5-.5)*width*.7,y=-height*.25-(i%3)*height*.13;
        g.beginPath().moveTo(x-10,y-16).lineTo(x+4,y-5).lineTo(x-5,y+7).lineTo(x+9,y+22).strokePath();
      }
      this.arc(g,0,1,82*(1-collapse)+15,45*(1-collapse)+9,-t*6,TAU-t*6,3,c,.8);
    }
    if(t<.23)return;
    const shock=1-Math.pow(1-release,3),radius=25+shock*200;
    g.lineStyle(12,c,fade*.075).strokeEllipse(0,0,radius*2,radius*1.08);
    g.lineStyle(3,c,fade*.8).strokeEllipse(0,0,radius*2,radius*1.08);
    g.lineStyle(1,0xffefcb,fade*.8).strokeEllipse(0,0,radius*1.75,radius*.94);
    this.star(g,0,-46,40*Math.max(0,1-release*4),0xfff0c6,Math.max(0,1-release*3));
    for(let i=0;i<18;i++) {
      const a=i*TAU/18+.16*Math.sin(i*3),speed=85+(i%4)*35,d=18+release*speed;
      const x=Math.cos(a)*d,y=-48+Math.sin(a)*d*.62-Math.sin(release*Math.PI)*(36+i%3*14)+release*release*60;
      const size=(4+i%3*2)*(1-release*.6),rotation=a+release*(i%2?4:-3);
      const dx=Math.cos(rotation)*size,dy=Math.sin(rotation)*size;
      g.fillStyle(i%3===0?0xffe6a7:i%3===1?c:0xb5ffe6,fade*.9)
        .fillTriangle(x+dx,y+dy,x-dy*.6,y+dx*.6,x-dx,y-dy);
      if(i%3===0)g.lineStyle(1,c,fade*.4).lineBetween(x,y,x-Math.cos(a)*18,y-Math.sin(a)*10);
    }
    this.cracks(g,Math.min(140,radius*.7),c,fade*.5);
  }

  private arc(g:Phaser.GameObjects.Graphics,x:number,y:number,rx:number,ry:number,start:number,end:number,width:number,color:number,alpha:number):void {
    if(alpha<=0||rx<=0)return;
    const steps=Math.max(8,Math.ceil(Math.abs(end-start)*9));
    g.lineStyle(width,color,Math.min(1,alpha)).beginPath().moveTo(x+Math.cos(start)*rx,y+Math.sin(start)*ry);
    for(let i=1;i<=steps;i++) {const a=start+(end-start)*i/steps;g.lineTo(x+Math.cos(a)*rx,y+Math.sin(a)*ry);}
    g.strokePath();
  }

  private star(g:Phaser.GameObjects.Graphics,x:number,y:number,r:number,color:number,alpha:number):void {
    if(r<=0||alpha<=0)return;
    g.fillStyle(color,alpha).fillTriangle(x,y-r,x-r*.18,y,x+r*.18,y)
      .fillTriangle(x,y+r,x-r*.18,y,x+r*.18,y).fillTriangle(x-r,y,x,y-r*.18,x,y+r*.18)
      .fillTriangle(x+r,y,x,y-r*.18,x,y+r*.18);
  }

  private diamond(g:Phaser.GameObjects.Graphics,x:number,y:number,r:number,color:number,alpha:number):void {
    g.lineStyle(1,color,alpha).beginPath().moveTo(x,y-r).lineTo(x+r*.65,y).lineTo(x,y+r).lineTo(x-r*.65,y).closePath().strokePath();
  }

  private cracks(g:Phaser.GameObjects.Graphics,radius:number,color:number,alpha:number):void {
    if(alpha<=0)return;
    for(let i=0;i<8;i++) {
      const a=i*TAU/8+.16,cos=Math.cos(a),sin=Math.sin(a)*WORLD.verticalScale,side=i%2?1:-1;
      const x1=cos*radius*.28,y1=24+sin*radius*.28,x2=cos*radius*.55-side*8,y2=24+sin*radius*.55+side*6;
      g.lineStyle(2,color,alpha).beginPath().moveTo(cos*17,24+sin*17).lineTo(x1,y1).lineTo(x2,y2).lineTo(cos*radius,24+sin*radius).strokePath();
      g.lineStyle(1,color,alpha*.65).lineBetween(x2,y2,x2+Math.cos(a+side*.8)*radius*.18,y2+Math.sin(a+side*.8)*radius*.13);
    }
  }

  destroy():void {
    if(this.destroyed)return;
    this.destroyed=true;
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN,this.destroy,this);
    this.scene.events.off(Phaser.Scenes.Events.DESTROY,this.destroy,this);
    for(const mote of this.pool)mote.image.destroy();
    for(const label of this.labels)label.text.destroy();
    for(const slot of this.visuals)slot.graphics.destroy();
    for(const ghost of this.bossGhosts)ghost.image.destroy();
  }
}
