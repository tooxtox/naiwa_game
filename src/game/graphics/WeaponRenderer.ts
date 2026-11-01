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
      // A heavy asymmetric blade with a dark silhouette and bright cutting edge.
      g.fillStyle(0x07131d,.85).fillTriangle(5,-7,44,-8,56,0).fillTriangle(5,-7,56,0,9,9);
      g.fillStyle(0xffd796).fillTriangle(9,-4,43,-5,52,0).fillTriangle(9,-4,52,0,11,5);
      g.fillStyle(0xfff4d5).fillTriangle(13,-3,44,-4,49,-1);
      g.fillStyle(0x9c713f).fillTriangle(14,0,51,0,11,5);
      g.lineStyle(2,0xffffff,.6).lineBetween(14,-4,43,-5).lineBetween(43,-5,52,0);
      g.lineStyle(5,0x1a2534).lineBetween(-10,0,9,0);
      g.lineStyle(3,0x997344).lineBetween(-9,0,7,0);
      g.lineStyle(2,0xffe0a0).lineBetween(-6,-2,-6,2).lineBetween(0,-2,0,2);
      g.lineStyle(5,0x172638).lineBetween(8,-10,8,10);
      g.lineStyle(2,0xe2bb78).lineBetween(8,-10,8,10);
      g.fillStyle(0xb2fff0).fillCircle(8,0,3);
      if(pose.attacking)g.lineStyle(3,0xffeab6,.75).lineBetween(16,-10,44,-10);
    } else if(this.classId==='mage') {
      g.lineStyle(6,0x0b1529).lineBetween(-18,3,32,0);
      g.lineStyle(3,0x726b9e).lineBetween(-18,3,30,0);
      g.lineStyle(1,0xd8bdff,.9).lineBetween(-16,1,26,-2);
      g.lineStyle(3,0xd4b886).lineBetween(19,-7,29,-11).lineBetween(29,-11,36,-5).lineBetween(19,7,29,11).lineBetween(29,11,36,5);
      g.fillStyle(color,.12).fillCircle(32,0,15+Math.sin(pose.now*.006)*2);
      g.fillStyle(color,.9).fillTriangle(32,-8,38,0,32,8).fillTriangle(32,-8,26,0,32,8);
      g.fillStyle(0xffffff,.95).fillTriangle(32,-5,34,0,32,5);
      g.lineStyle(1,0xeedfff,.8).strokeCircle(32,0,11);
      g.fillStyle(0xf4dfff,.9).fillCircle(32+Math.cos(pose.now*.004)*14,Math.sin(pose.now*.004)*14,1.8);
      if(pose.attacking)g.lineStyle(2,0xf4e7ff,.8).strokeCircle(32,0,18);
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
