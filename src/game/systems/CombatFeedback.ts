import type * as Phaser from 'phaser';
import { getPreferences } from './Preferences';

const shakes = new WeakMap<Phaser.Scene, number>();
/** Local, throttled feedback. Accessibility settings apply to every combat source. */
export function cameraShake(scene:Phaser.Scene,duration:number,intensity:number):void {
  if(getPreferences().reducedShake)return;
  const now=performance.now(),last=shakes.get(scene)??-1000;
  if(now-last<110)return;
  shakes.set(scene,now);
  scene.cameras.main.shake(Math.min(180,duration),Math.min(.004,intensity));
}

export class HitStop {
  remaining=0;
  private last=-1000;
  request(now:number,duration:number):void {
    if(getPreferences().reducedMotion||now-this.last<120)return;
    this.last=now;this.remaining=Math.max(this.remaining,Math.min(45,duration));
  }
  consume(delta:number):boolean {
    if(this.remaining<=0)return false;
    this.remaining=Math.max(0,this.remaining-delta);
    return this.remaining>0;
  }
  clear():void {this.remaining=0;}
}
