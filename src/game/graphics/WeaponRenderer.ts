import * as Phaser from 'phaser';
import { CLASSES, WORLD, type ClassId } from '../config';

interface WeaponPose {attacking:boolean;guarding:boolean;ultimate:boolean;now:number;}

/** Replaceable art layer. Weapons follow the hero's floor anchor, never its collider. */
export class WeaponRenderer {
  private readonly weapon:Phaser.GameObjects.Graphics;
  private readonly guard:Phaser.GameObjects.Graphics;
  private destroyed=false;
  constructor(scene:Phaser.Scene,private readonly classId:ClassId) {
    this.weapon=scene.add.graphics();
    this.guard=scene.add.graphics();
  }

  update(x:number,y:number,angle:number,depth:number,pose:WeaponPose):void {
    const color=CLASSES[this.classId].color;
    const reach=pose.attacking?29:22;
    const handX=x+Math.cos(angle)*reach,handY=y-35+Math.sin(angle)*reach*WORLD.verticalScale;
    const rotation=Math.atan2(Math.sin(angle)*WORLD.verticalScale,Math.cos(angle));
    const g=this.weapon;
    g.clear().setPosition(handX,handY).setRotation(rotation).setDepth(depth+(Math.sin(angle)<-.45?-24:2));
    if(pose.ultimate) {
      g.fillStyle(color,.12).fillCircle(13,0,32);
      g.lineStyle(1,color,.6).strokeCircle(13,0,24+Math.sin(pose.now*.02)*3);
    }
    if(this.classId==='warrior') {
      // Naiwa's milk-cap spatula: a broad cream scoop with a mint smile, rather than a sword.
      g.lineStyle(7,0x3f6758).lineBetween(-10,0,24,0);
      g.lineStyle(4,0xb5dbb6).lineBetween(-9,-1,26,-1);
      g.fillStyle(0x665437).fillRoundedRect(20,-11,34,22,6);
      g.fillStyle(0xffd770).fillRoundedRect(22,-10,30,19,5);
      g.fillStyle(0xfff0b3).fillRoundedRect(24,-9,26,10,4);
      g.lineStyle(2,0xb89d53).lineBetween(28,5,46,5);
      g.fillStyle(0x537d5e).fillCircle(32,-3,2).fillCircle(42,-3,2);
      g.lineStyle(1,0x537d5e).lineBetween(34,1,40,1);
      g.lineStyle(2,0xefffe7).lineBetween(0,-3,0,3).lineBetween(7,-3,7,3);
      if(pose.attacking)g.lineStyle(3,0xfff5ca,.8).lineBetween(27,-14,48,-14);
    } else if(this.classId==='mage') {
      // A tilted cup of floating milk foam powers the staff, with the same combat anchor.
      g.lineStyle(6,0x4c3d69).lineBetween(-18,3,32,0);
      g.lineStyle(3,0xb9a0cf).lineBetween(-18,3,30,0);
      g.lineStyle(1,0xf8ebff,.9).lineBetween(-16,1,26,-2);
      g.fillStyle(color,.12).fillCircle(32,0,18+Math.sin(pose.now*.006)*2);
      g.fillStyle(0x654e80).fillRoundedRect(24,-10,18,22,4);
      g.fillStyle(0xe8c9df).fillRoundedRect(26,-8,14,17,3);
      g.fillStyle(0xffe9ba).fillRect(26,-1,14,9);
      g.lineStyle(2,0xb6d8bd).lineBetween(35,-10,38,-16);
      g.fillStyle(0xfff8e1).fillCircle(27,-8,5).fillCircle(33,-10,6).fillCircle(39,-7,5);
      g.fillStyle(0x775880).fillCircle(30,2,1.5).fillCircle(36,2,1.5);
      g.fillStyle(0xf4dfff,.9).fillCircle(32+Math.cos(pose.now*.004)*17,Math.sin(pose.now*.004)*17,2);
      if(pose.attacking)g.lineStyle(2,0xf4e7ff,.8).strokeCircle(32,0,21);
    } else {
      // Curved limbs and taut string keep the bow readable at the mobile scale.
      g.lineStyle(7,0x071a25).beginPath().moveTo(-3,-25).lineTo(9,-17).lineTo(14,-7).lineTo(14,7).lineTo(9,17).lineTo(-3,25).strokePath();
      g.lineStyle(3,0x83ead0).beginPath().moveTo(-3,-25).lineTo(9,-17).lineTo(14,-7).lineTo(14,7).lineTo(9,17).lineTo(-3,25).strokePath();
      g.lineStyle(1,0xeeffe7,.8).lineBetween(-3,-25,pose.attacking?-9:-3,0).lineBetween(pose.attacking?-9:-3,0,-3,25);
      g.lineStyle(5,0xb9996a).lineBetween(14,-4,14,4);
      g.lineStyle(2,0xeaffee).lineBetween(-10,0,33,0);
      g.fillStyle(0xd9fff1).fillTriangle(39,0,30,-4,30,4);
      g.lineStyle(2,0x89cfbd).lineBetween(-7,0,-12,-4).lineBetween(-7,0,-12,4);
      if(pose.attacking)g.lineStyle(2,0xb6ffdf,.5).lineBetween(29,-8,42,-8).lineBetween(29,8,42,8);
    }
    this.guard.clear().setPosition(x,y-25).setDepth(depth+4);
    if(pose.guarding) {
      const pulse=.65+Math.sin(pose.now*.018)*.12;
      const sx=Math.cos(angle)*32,sy=Math.sin(angle)*23;
      this.guard.fillStyle(0x70dcff,.12).fillEllipse(sx,sy,52,64);
      this.guard.lineStyle(3,0x95edff,pulse).strokeEllipse(sx,sy,52,64);
      this.guard.lineStyle(1,0xe8ffff,pulse*.8).strokeEllipse(sx,sy,42,53);
      this.guard.lineStyle(2,0xc5f9ff,pulse).lineBetween(sx-8,sy,sx+8,sy).lineBetween(sx,sy-8,sx,sy+8);
    }
  }

  destroy():void {
    if(this.destroyed)return;
    this.destroyed=true;this.weapon.destroy();this.guard.destroy();
  }
}
