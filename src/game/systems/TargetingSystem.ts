export interface TargetCandidate {x:number;y:number;active:boolean;state:string;}

/** Stable target priorities in ground space; no scene, physics or DOM dependency. */
export class TargetingSystem<T extends TargetCandidate> {
  target:T|null=null;
  private obstructedAt:number|null=null;
  choose(candidates:readonly T[],x:number,y:number,range:number,verticalScale:number,now:number,visible:(target:T)=>boolean):T|null {
    let best:T|null=null,bestTier=Infinity,bestDistance=Infinity;
    let currentTier=Infinity,currentDistance=Infinity;
    for(const target of candidates) {
      if(!target.active||target.state==='Dead')continue;
      const distance=Math.hypot(target.x-x,(target.y-y)/verticalScale),clear=visible(target);
      const tier=clear?(distance<=range?0:1):2;
      if(target===this.target){currentTier=tier;currentDistance=distance;}
      if(tier<bestTier||(tier===bestTier&&distance<bestDistance)){best=target;bestTier=tier;bestDistance=distance;}
    }
    if(this.target&&currentTier<Infinity) {
      if(currentTier===2)this.obstructedAt??=now;else this.obstructedAt=null;
      const stale=this.obstructedAt!==null&&now-this.obstructedAt>300;
      // An unobstructed enemy in reach always outranks cover/out-of-range targets.
      if(!stale&&currentTier===bestTier&&currentDistance<=range*1.25&&bestDistance>=currentDistance*.65)return this.target;
    }
    this.target=best;this.obstructedAt=bestTier===2?now:null;return best;
  }
  clear():void {this.target=null;this.obstructedAt=null;}
}
