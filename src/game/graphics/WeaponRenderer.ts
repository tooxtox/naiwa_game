import * as Phaser from 'phaser';
import { CLASSES, WORLD, type ClassId } from '../config';

/** Inactive actions use -1; active actions progress from zero to one on the game clock. */
export interface WeaponPose {
  attackProgress:number; combo:number; dashProgress:number; guardProgress:number;
  guardImpactProgress:number; counterProgress:number; ultimateProgress:number; now:number;
}
const clamp=(value:number):number=>Phaser.Math.Clamp(value,0,1);
const ease=(value:number):number=>{const t=clamp(value);return t*t*(3-2*t);};
const active=(value:number):boolean=>value>=0&&value<1;

/** Replaceable art layer. Poses move art around a floor anchor, never the collider. */
export class WeaponRenderer {
  private readonly weapon:Phaser.GameObjects.Graphics;
  private readonly guard:Phaser.GameObjects.Graphics;
  private destroyed=false;
  constructor(scene:Phaser.Scene,private readonly classId:ClassId) {
    this.weapon=scene.add.graphics().setName('player-weapon');
    this.guard=scene.add.graphics().setName('player-weapon-guard');
  }
  update(x:number,y:number,angle:number,depth:number,pose:WeaponPose):void {
    const color=CLASSES[this.classId].color;
    const attacking=active(pose.attackProgress),dashing=active(pose.dashProgress);
    const guarding=active(pose.guardProgress),countering=active(pose.counterProgress),ultimate=active(pose.ultimateProgress);
    let reach=22,lift=0,swing=0,size=1,squash=1,draw=0,pulse=0,arrowFlight=-1;
    let action='idle',progress=-1;
    if(attacking) {
      const t=pose.attackProgress;
      action='attack';progress=t;
      if(this.classId==='warrior') {
        const direction=pose.combo===2?-1:1;
        // Wind back, cut across the facing direction, then settle into the hand.
        const sweep=t<.24?-.3-.95*ease(t/.24):t<.69?-1.25+2.5*ease((t-.24)/.45):1.25*(1-ease((t-.69)/.31));
        swing=sweep*direction*(pose.combo===3?1.25:1);
        reach=22+(t<.24?-5*ease(t/.24):t<.69?-5+16*Math.sin((t-.24)/.45*Math.PI/2):11*(1-ease((t-.69)/.31)));
        lift=-Math.sin(t*Math.PI)*(pose.combo===3?8:3);
        size=1+Math.sin(t*Math.PI)*(pose.combo===3?.18:.07);
      } else if(this.classId==='mage') {
        const pull=ease(t/.3),release=ease((t-.3)/.26),recover=ease((t-.64)/.36);
        reach=22-15*pull+34*release-19*recover;
        swing=-.36*pull+.49*release-.13*recover;
        lift=-5*Math.sin(t*Math.PI);
        pulse=Math.sin(clamp((t-.26)/.5)*Math.PI);
        size=1+pulse*.13;
      } else {
        draw=t<.5?ease(t/.5):1-ease((t-.5)/.13);
        const recoil=Math.sin(clamp((t-.55)/.45)*Math.PI);
        reach=22-draw*4-recoil*8;swing=-.09*draw+.14*recoil;squash=1+draw*.06;
        arrowFlight=t>.5&&t<.8?(t-.5)/.3:-1;
      }
    }
    if(guarding&&!countering&&!ultimate) {
      const hold=ease(pose.guardProgress/.17)*(1-ease((pose.guardProgress-.83)/.17));
      const impact=active(pose.guardImpactProgress)?Math.sin(pose.guardImpactProgress*Math.PI)*Math.exp(-pose.guardImpactProgress*2):0;
      action='guard';progress=pose.guardProgress;
      reach=22-6*hold-7*impact;lift=-12*hold+4*impact;swing=-.8*hold+.22*impact;
      size=1;draw=0;pulse=impact;
    }
    if(dashing&&!countering&&!ultimate) {
      const tuck=Math.sin(pose.dashProgress*Math.PI);
      action='dash';progress=pose.dashProgress;
      reach=12-5*tuck;lift=4*tuck;swing=-1.7-.45*tuck;size=.88-.1*tuck;squash=.88;draw=0;
    }
    if(countering&&!ultimate) {
      const t=pose.counterProgress;
      action='counter';progress=t;
      swing=t<.22?-1.25*ease(t/.22):t<.65?-1.25+2.8*ease((t-.22)/.43):1.55*(1-ease((t-.65)/.35));
      reach=22+Math.sin(t*Math.PI)*17;lift=-Math.sin(t*Math.PI)*9;size=1+Math.sin(t*Math.PI)*.22;
      if(this.classId==='mage')pulse=Math.sin(t*Math.PI);
      if(this.classId==='archer')draw=t<.4?ease(t/.4):1-ease((t-.4)/.15);
    }
    if(ultimate) {
      const t=pose.ultimateProgress,power=Math.sin(t*Math.PI);
      action='ultimate';progress=t;size=1+power*.45;lift=-power*10;reach=22+power*15;
      if(this.classId==='warrior') {
        // Two complete turns, with a clear windup and decelerating recovery.
        swing=t<.16?-.9*ease(t/.16):t<.85?-.9+Math.PI*4*ease((t-.16)/.69):Math.PI*4-.9+.9*ease((t-.85)/.15);
        reach=22+power*21;
      } else if(this.classId==='mage') {
        swing=-1.05*Math.sin(t*Math.PI);lift=-power*32;pulse=power;
        reach=22-10*ease(t/.35)+22*ease((t-.58)/.2)-12*ease((t-.8)/.2);
      } else {
        draw=t<.6?ease(t/.6):1-ease((t-.6)/.12);
        const recoil=Math.sin(clamp((t-.65)/.35)*Math.PI);
        swing=-.15*draw+.28*recoil;reach=22-5*draw-13*recoil;squash=1+.15*draw;
        arrowFlight=t>.6&&t<.9?(t-.6)/.3:-1;pulse=power;
      }
    }
    const weaponAngle=angle+swing;
    const handX=x+Math.cos(weaponAngle)*reach,handY=y-35+Math.sin(weaponAngle)*reach*WORLD.verticalScale+lift;
    const rotation=Math.atan2(Math.sin(weaponAngle)*WORLD.verticalScale,Math.cos(weaponAngle));
    const g=this.weapon;
    g.clear().setPosition(handX,handY).setRotation(rotation).setScale(size,size*squash)
      .setDepth(depth+(Math.sin(weaponAngle)<-.45?-24:2));
    // Expose the rendered pose for deterministic multi-frame visual regression checks.
    g.setData('action',action).setData('progress',progress).setData('attackProgress',pose.attackProgress)
      .setData('combo',pose.combo).setData('draw',draw).setData('swing',swing);
    if(ultimate) {
      g.fillStyle(color,.1+Math.sin(pose.ultimateProgress*Math.PI)*.08).fillCircle(22,0,32);
      g.lineStyle(1,color,.55).strokeCircle(22,0,26+Math.sin(pose.ultimateProgress*Math.PI)*12);
    }
    if(this.classId==='warrior')this.drawSpatula(g,pulse,action==='attack'||countering||ultimate,pose.combo);
    else if(this.classId==='mage')this.drawStaff(g,color,pulse,pose.now);
    else this.drawBow(g,draw,arrowFlight,ultimate,pulse);
    this.drawGuard(x,y,angle,depth,pose,guarding);
  }
  private drawSpatula(g:Phaser.GameObjects.Graphics,pulse:number,striking:boolean,combo:number):void {
    g.lineStyle(7,0x3f6758).lineBetween(-10,0,24,0);
    g.lineStyle(4,0xb5dbb6).lineBetween(-9,-1,26,-1);
    g.fillStyle(0x665437).fillRoundedRect(20,-11,34,22,6);
    g.fillStyle(0xffd770).fillRoundedRect(22,-10,30,19,5);
    g.fillStyle(0xfff0b3).fillRoundedRect(24,-9,26,10,4);
    g.lineStyle(2,0xb89d53).lineBetween(28,5,46,5);
    g.fillStyle(0x537d5e).fillCircle(32,-3,2).fillCircle(42,-3,2);
    g.lineStyle(1,0x537d5e).lineBetween(34,1,40,1);
    g.lineStyle(2,0xefffe7).lineBetween(0,-3,0,3).lineBetween(7,-3,7,3);
    if(striking)g.lineStyle(combo===3?4:2,0xfff5ca,.8).lineBetween(27,-14,48,-14);
    if(pulse>0)g.lineStyle(2,0xbdfaff,pulse).strokeRoundedRect(18,-13,38,26,6);
  }
  private drawStaff(g:Phaser.GameObjects.Graphics,color:number,pulse:number,now:number):void {
    const foam=1+pulse*.65;
    g.lineStyle(6,0x4c3d69).lineBetween(-18,3,32,0);
    g.lineStyle(3,0xb9a0cf).lineBetween(-18,3,30,0);
    g.lineStyle(1,0xf8ebff,.9).lineBetween(-16,1,26,-2);
    g.fillStyle(color,.12+pulse*.12).fillCircle(32,0,18+pulse*14+Math.sin(now*.006)*2);
    g.fillStyle(0x654e80).fillRoundedRect(24,-10,18,22,4);
    g.fillStyle(0xe8c9df).fillRoundedRect(26,-8,14,17,3);
    g.fillStyle(0xffe9ba).fillRect(26,-1,14,9);
    g.lineStyle(2,0xb6d8bd).lineBetween(35,-10,38,-16);
    g.fillStyle(0xfff8e1).fillCircle(32-5*foam,-8-pulse*5,5*foam)
      .fillCircle(32,-10-pulse*8,6*foam).fillCircle(32+7*foam,-7-pulse*5,5*foam);
    g.fillStyle(0x775880).fillCircle(30,2,1.5).fillCircle(36,2,1.5);
    g.fillStyle(0xf4dfff,.9).fillCircle(32+Math.cos(now*.004)*(17+pulse*10),Math.sin(now*.004)*(17+pulse*10),2+pulse*2);
    if(pulse>0)g.lineStyle(2,0xf4e7ff,pulse*.8).strokeCircle(32,0,13+pulse*19);
  }
  private drawBow(g:Phaser.GameObjects.Graphics,draw:number,flight:number,ultimate:boolean,pulse:number):void {
    const tipX=-3+draw*6,tipY=25-draw*3,nock=-3-draw*20;
    // Limbs flex while the string and nocked arrow travel toward the drawing hand.
    for(const [width,color] of [[7,0x071a25],[3,0x83ead0]]) {
      g.lineStyle(width,color).beginPath().moveTo(tipX,-tipY).lineTo(9+draw*3,-17).lineTo(14,-7)
        .lineTo(14,7).lineTo(9+draw*3,17).lineTo(tipX,tipY).strokePath();
    }
    g.lineStyle(1.5,0xeeffe7,.9).lineBetween(tipX,-tipY,nock,0).lineBetween(nock,0,tipX,tipY);
    g.lineStyle(5,0xb9996a).lineBetween(14,-4,14,4);
    if(flight>=0) {
      const snap=Math.sin(flight*Math.PI*4)*(1-flight)*5;
      g.lineStyle(1,0xeeffe7,.45*(1-flight)).lineBetween(tipX,-tipY,-3+snap,0).lineBetween(-3+snap,0,tipX,tipY);
    }
    if(flight<0||flight<.75) {
      const arrowX=flight>=0?flight*65:nock+3,alpha=flight>=0?1-flight:1;
      g.lineStyle(2,0xeaffee,alpha).lineBetween(arrowX-10,0,arrowX+33,0);
      g.fillStyle(0xd9fff1,alpha).fillTriangle(arrowX+39,0,arrowX+30,-4,arrowX+30,4);
      g.lineStyle(2,0x89cfbd,alpha).lineBetween(arrowX-7,0,arrowX-12,-4).lineBetween(arrowX-7,0,arrowX-12,4);
      if(ultimate) {
        g.lineStyle(2,0xe1fff3,.7*pulse).lineBetween(arrowX-7,-7,arrowX+31,-13).lineBetween(arrowX-7,7,arrowX+31,13);
        g.fillStyle(0xd9fff1,.7*pulse).fillTriangle(arrowX+37,-14,arrowX+29,-16,arrowX+30,-10)
          .fillTriangle(arrowX+37,14,arrowX+29,16,arrowX+30,10);
      }
    }
    g.fillStyle(0xffe8a8).fillEllipse(nock-2,1,9+draw*2,7);
  }
  private drawGuard(x:number,y:number,angle:number,depth:number,pose:WeaponPose,guarding:boolean):void {
    const g=this.guard;
    g.clear().setVisible(guarding);
    if(!guarding)return;
    const rise=ease(pose.guardProgress/.17)*(1-ease((pose.guardProgress-.83)/.17));
    const impact=active(pose.guardImpactProgress)?Math.sin(pose.guardImpactProgress*Math.PI)*Math.exp(-pose.guardImpactProgress*2):0;
    const reach=24-8*impact;
    g.setPosition(x+Math.cos(angle)*reach,y-25+Math.sin(angle)*reach*WORLD.verticalScale-12*rise+7*impact)
      .setScale(.35+.65*rise+impact*.2,.3+.7*rise-impact*.15).setRotation(Math.cos(angle)*(-.14+.28*impact))
      .setDepth(depth+(Math.sin(angle)<-.45?-25:5));
    g.setData('progress',pose.guardProgress).setData('impactProgress',pose.guardImpactProgress);
    g.fillStyle(0x70dcff,.15+impact*.25).fillEllipse(0,0,46,58);
    g.lineStyle(3,0x95edff,.8).strokeEllipse(0,0,46,58);
    g.lineStyle(1,0xe8ffff,.7).strokeEllipse(0,0,36,47);
    g.lineStyle(2,0xc5f9ff,.9).lineBetween(-8,0,8,0).lineBetween(0,-8,0,8);
  }
  destroy():void {
    if(this.destroyed)return;
    this.destroyed=true;this.weapon.destroy();this.guard.destroy();
  }
}
