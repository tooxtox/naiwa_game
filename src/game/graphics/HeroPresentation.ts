import * as Phaser from 'phaser';

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
  if (!sprite.scene.textures.exists(HERO.texture)) {
    const north = Math.sin(pose.angle) < -.35 && sprite.scene.textures.exists('player-back');
    sprite.setTexture(north ? 'player-back' : 'player').setFlipX(Math.cos(pose.angle) < 0);
    return;
  }
  let frame = getHeroFrame(pose.angle, pose.now, pose.moving);
  const sideFacing = Math.abs(Math.sin(pose.angle)) <= .55;
  const attackProgress = pose.attackProgress;
  const attacking = attackProgress !== undefined && attackProgress >= 0 && attackProgress < 1;
  // The authored action poses face east. Keep the front / back silhouette when
  // acting vertically so repeated attacks never make the body turn sideways.
  if (sideFacing) {
    if (pose.hurt) frame = 15;
    else if (pose.dash) frame = 14;
    else if (attacking) frame = attackProgress < .25 ? 12 : 13;
  }
  sprite.setTexture(HERO.texture, frame).setFlipX(Math.cos(pose.angle) < -.1);
  // A small squash adds weight without moving the planted feet or the collider.
  const breath = !pose.moving && !pose.dash ? Math.sin(pose.now * .004) * .008 : 0;
  let stretch = 0;
  if (pose.hurt) stretch = -.045;
  else if (pose.dash) stretch = sideFacing ? -.045 : .05;
  else if (attacking) {
    const punch = attackProgress < .25 ? -.035 : Math.sin((attackProgress - .25) / .75 * Math.PI) * .055;
    stretch += punch * (sideFacing ? .45 : 1);
  }
  const scale = HERO.displayHeight / HERO.frameHeight;
  sprite.setScale(scale * (1 - breath - stretch * .35 - (pose.dash && !sideFacing ? .04 : 0)), scale * (1 + breath + stretch));
}
