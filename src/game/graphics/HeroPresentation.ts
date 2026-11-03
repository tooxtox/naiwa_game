import * as Phaser from 'phaser';
import type { ClassId } from '../config';

/** Art-only settings. The floor collider stays independent of sprite dimensions. */
export const HERO = {
  texture: 'mascot-hero',
  frameWidth: 320,
  frameHeight: 320,
  displayHeight: 104,
  footOriginY: .94,
} as const;

interface HeroPose {
  angle: number;
  moving: boolean;
  now: number;
  dash?: boolean;
  attackProgress?: number;
  classId?: ClassId;
  combo?: number;
  dashProgress?: number;
  guardProgress?: number;
  guardImpactProgress?: number;
  counterProgress?: number;
  ultimateProgress?: number;
  hurt?: boolean;
}

/** Rows: south walk, east walk, north walk, then windup / strike / dash / hurt. */
export function getHeroFrame(angle: number, time: number, moving: boolean): number {
  const vertical = Math.sin(angle);
  const row = vertical < -.55 ? 2 : vertical > .55 ? 0 : 1;
  return row * 4 + (moving ? Math.floor(time / 100) % 4 : 0);
}

export function createHeroVisual(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Sprite {
  const hasAtlas = scene.textures.exists(HERO.texture);
  const sprite = scene.add.sprite(x, y, hasAtlas ? HERO.texture : 'player', hasAtlas ? 0 : undefined);
  sprite.setOrigin(.5, hasAtlas ? HERO.footOriginY : 1);
  if (hasAtlas) sprite.setDisplaySize(HERO.displayHeight, HERO.displayHeight);
  return sprite;
}

/** Direct frame selection keeps animation tied to the game clock, including pause. */
export function animateHero(sprite: Phaser.GameObjects.Sprite, pose: HeroPose): void {
  const hasAtlas=sprite.scene.textures.exists(HERO.texture);
  if (!hasAtlas) {
    const north = Math.sin(pose.angle) < -.35 && sprite.scene.textures.exists('player-back');
    sprite.setTexture(north ? 'player-back' : 'player').setFlipX(Math.cos(pose.angle) < 0);
  }
  let frame = getHeroFrame(pose.angle, pose.now, pose.moving);
  const sideFacing = Math.abs(Math.sin(pose.angle)) <= .55;
  const attackProgress = pose.attackProgress;
  const attacking = attackProgress !== undefined && attackProgress >= 0 && attackProgress < 1;
  const guard=pose.guardProgress??-1,counter=pose.counterProgress??-1,ultimate=pose.ultimateProgress??-1;
  const guarding=guard>=0&&guard<1,countering=counter>=0&&counter<1,ulting=ultimate>=0&&ultimate<1;
  // The authored action poses face east. Keep the front / back silhouette when
  // acting vertically so repeated attacks never make the body turn sideways.
  if (sideFacing) {
    if (pose.hurt) frame = 15;
    else if (ulting) frame = ultimate < .35 ? 12 : 13;
    else if (countering) frame = counter < .24 ? 12 : 13;
    else if (pose.dash) frame = 14;
    else if (guarding) frame = 12;
    else if (attacking) frame = attackProgress < .25 ? 12 : 13;
  }
  if(hasAtlas)sprite.setTexture(HERO.texture, frame).setFlipX(Math.cos(pose.angle) < -.1);
  // A small squash adds weight without moving the planted feet or the collider.
  const breath = !pose.moving && !pose.dash ? Math.sin(pose.now * .004) * .008 : 0;
  let stretch = 0,tilt=0,offsetX=0,offsetY=0,width=0;
  const facing=Math.cos(pose.angle)<0?-1:1;
  if (pose.hurt) stretch = -.045;
  else if (pose.dash) stretch = sideFacing ? -.045 : .05;
  else if (attacking) {
    const punch = attackProgress < .25 ? -.035 : Math.sin((attackProgress - .25) / .75 * Math.PI) * .055;
    stretch += punch * (sideFacing ? .45 : 1);
    const drive=Math.sin(attackProgress*Math.PI);
    const direction=pose.combo===2?-1:1;
    tilt=(attackProgress<.25?-.08*(attackProgress/.25):Math.sin((attackProgress-.25)/.75*Math.PI)*.11)*facing*direction;
    offsetX=Math.cos(pose.angle)*drive*(pose.classId==='archer'?-3:3);
  }
  if(guarding&&!countering&&!ulting) {
    const raise=Math.min(1,guard/.17)*Math.min(1,(1-guard)/.17);
    const impactProgress=pose.guardImpactProgress??-1;
    const impact=impactProgress>=0&&impactProgress<1?Math.sin(impactProgress*Math.PI)*Math.exp(-impactProgress*2):0;
    stretch=-.025*raise-impact*.07;tilt=(-.035*raise-.12*impact)*facing;
    offsetX=-Math.cos(pose.angle)*impact*7;offsetY=raise*1.4+impact*2;
  }
  if(pose.dash&&!countering&&!ulting) {
    const drive=Math.sin((pose.dashProgress??.5)*Math.PI);
    tilt=.2*Math.cos(pose.angle)*drive;stretch=-.045-drive*.025;width=drive*.08;
    offsetX=Math.cos(pose.angle)*drive*5;offsetY=Math.sin(pose.angle)*drive*2;
  }
  if(countering&&!ulting) {
    const drive=Math.sin(counter*Math.PI);
    stretch=drive*.07;tilt=Math.sin(counter*Math.PI*2)*-.16*facing;
    offsetX=Math.cos(pose.angle)*drive*7;offsetY=-drive*3;
  }
  if(ulting) {
    const power=Math.sin(ultimate*Math.PI);
    if(pose.classId==='warrior') {
      tilt=Math.sin(ultimate*Math.PI*4)*.17;stretch=-power*.055;width=Math.sin(ultimate*Math.PI*4)*.12;
      offsetX=Math.sin(ultimate*Math.PI*4)*4;offsetY=-power*3;
    } else if(pose.classId==='mage') {
      stretch=power*.1;tilt=-Math.cos(pose.angle)*power*.07;width=-power*.045;offsetY=-power*11;
    } else {
      const release=Math.max(0,(ultimate-.6)/.4),kick=Math.sin(release*Math.PI);
      stretch=-power*.08;tilt=(-power*.08-kick*.12)*facing;width=power*.07;
      offsetX=-Math.cos(pose.angle)*(power*3+kick*7);offsetY=power*2;
    }
  }
  const scale = hasAtlas?HERO.displayHeight / HERO.frameHeight:1;
  sprite.setScale(scale * (1 - breath - stretch * .35 + width - (pose.dash && !sideFacing ? .04 : 0)), scale * (1 + breath + stretch))
    .setRotation(tilt).setData('poseOffsetX',offsetX).setData('poseOffsetY',offsetY)
    .setData('action',ulting?'ultimate':countering?'counter':pose.dash?'dash':guarding?'guard':attacking?'attack':'idle');
}
