/** Shared safety rails for real combat and the repeatable balance report.
 * These budgets use the active run clock, never wall time, so pause is free.
 */
export const COMBAT_BALANCE = {
  hitChargeWindow: 500,
  hitChargeBudget: 12,
  leechWindow: 1000,
  leechHitsPerSecond: 5,
  leechHealthRatio: .12,
  ultimateBossCastCap: .42,
  mageSplitDamage: .7,
  archerSplitDamage: .55,
  ricochetReturnDuration: 120,
} as const;

interface Credit { at:number; amount:number; }

/** Small rolling window: no boundary can grant two full budgets at once. */
export class RollingCombatBudget {
  private readonly credits:Credit[]=[];
  take(now:number,requested:number,limit:number,window:number):number {
    if(!Number.isFinite(now)||!Number.isFinite(requested)||requested<=0||!Number.isFinite(limit)||limit<=0)return 0;
    while(this.credits.length&&this.credits[0].at<=now-window)this.credits.shift();
    const spent=this.credits.reduce((sum,credit)=>sum+credit.amount,0);
    const amount=Math.max(0,Math.min(requested,limit-spent));
    if(amount>0)this.credits.push({at:now,amount});
    return amount;
  }
  clear():void {this.credits.length=0;}
}

/** One context is shared by every pulse/projectile of a single ultimate cast. */
export class BossCastBudget {
  private readonly damage=new WeakMap<object,number>();
  take(target:object,maxHealth:number,fixed:number,healthDamage:number,breakMultiplier=1):{fixed:number;healthDamage:number} {
    const cap=Math.max(0,maxHealth)*COMBAT_BALANCE.ultimateBossCastCap;
    const used=this.damage.get(target)??0;
    const raw=Math.max(0,fixed)*breakMultiplier+Math.max(0,healthDamage);
    // Match Boss.hit integer damage while keeping the remaining cast cap strict.
    // e.g. 125000 * (.3 / 3) is 12499.999999999998, not one HP less per pulse.
    const accepted=Math.max(0,Math.min(Math.round(raw),Math.floor(cap-used)));
    const factor=raw>0?accepted/raw:0;
    this.damage.set(target,used+accepted);
    return {fixed:Math.max(0,fixed)*factor,healthDamage:Math.max(0,healthDamage)*factor};
  }
}

export function lifeStealBudget(maxHealth:number,lifeSteal:number):number {
  return Math.max(0,Math.min(maxHealth*COMBAT_BALANCE.leechHealthRatio,lifeSteal*COMBAT_BALANCE.leechHitsPerSecond));
}

/** Extra shots trade single-target efficiency for wider coverage. */
export function splitProjectileMultiplier(classId:'warrior'|'mage'|'archer',index:number,count:number):number {
  if(count<=1||index===Math.floor((count-1)/2)||classId==='warrior')return 1;
  return classId==='mage'?COMBAT_BALANCE.mageSplitDamage:COMBAT_BALANCE.archerSplitDamage;
}
