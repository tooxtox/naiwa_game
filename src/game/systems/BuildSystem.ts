import type { ClassId } from '../config';

export type CoreId = 'warrior-counter'|'warrior-whirlwind'|'mage-freeze'|'mage-chain'|'archer-overpierce'|'archer-ricochet';
export interface CoreDefinition { id:CoreId; classId:ClassId; name:string; icon:string; tag:string; description:string; }
export const CORE_DEFINITIONS:readonly CoreDefinition[] = [
  {id:'warrior-counter',classId:'warrior',name:'奶盖反击',icon:'⬡',tag:'反击流',description:'完美格挡释放强化冲击波；格挡成功后短暂强化攻击，完美格挡额外削韧。'},
  {id:'warrior-whirlwind',classId:'warrior',name:'快乐旋风',icon:'◎',tag:'旋风流',description:'连续命中逐渐扩大横扫；积累足够命中后自动释放一次环斩。'},
  {id:'mage-freeze',classId:'mage',name:'冰奶封存',icon:'❄',tag:'冰冻流',description:'普通攻击叠加寒霜，满层短暂冻结；Boss 冻结时长削弱且有独立冷却。'},
  {id:'mage-chain',classId:'mage',name:'快乐连锁',icon:'✺',tag:'连锁流',description:'奶泡爆破向邻近未命中目标追加有限连锁，不会重复引爆同一目标。'},
  {id:'archer-overpierce',classId:'archer',name:'频道贯通',icon:'➶',tag:'穿透流',description:'箭矢获得额外穿透；每穿过一个目标，后续命中伤害逐步增加。'},
  {id:'archer-ricochet',classId:'archer',name:'蛙友弹射',icon:'⌁',tag:'弹射流',description:'箭矢命中后转向邻近未命中目标；限制次数、距离及同箭重复命中。'},
];
const SUPPORT_REQUIREMENTS:Readonly<Record<string,CoreId>>={
  'warrior-counter-force':'warrior-counter','warrior-guard-flow':'warrior-counter',
  'warrior-vortex':'warrior-whirlwind','warrior-momentum':'warrior-whirlwind',
  'mage-cold-front':'mage-freeze','mage-snowball':'mage-freeze',
  'mage-chain-reach':'mage-chain','mage-chain-charge':'mage-chain',
  'archer-spine':'archer-overpierce','archer-needle':'archer-overpierce',
  'archer-bounce-range':'archer-ricochet','archer-bounce-charge':'archer-ricochet',
};

/** Stable, bounded combat parameters. Rebuilt only when a permanent upgrade changes. */
export interface BuildEffects {
  counterShockwaveRadius:number; counterDamageMultiplier:number; guardBuffMultiplier:number; guardBuffDuration:number; parryToughnessBonus:number;
  whirlwindRangeBonus:number; whirlwindThreshold:number; whirlwindDamageMultiplier:number;
  frostStacks:number; frostSlowMultiplier:number; frostFreezeDuration:number; frostBossFreezeDuration:number; frostCooldown:number; frostBossCooldown:number;
  chainBounces:number; chainRadius:number; chainDamageMultiplier:number;
  pierceBonus:number; pierceDamageStep:number; pierceDamageCap:number;
  ricochetBounces:number; ricochetRadius:number; ricochetDamageMultiplier:number;
}

/** Build state contains no Phaser objects, timers or enemy references. */
export class BuildSystem {
  private readonly levels=new Map<string,number>();
  private cached:BuildEffects|null=null;
  private hitStreak=0;
  private lastHit=-Infinity;
  private buffUntil=-Infinity;
  private lastSpin=-Infinity;
  constructor(readonly classId:ClassId) {}
  levelOf(id:string):number {return this.levels.get(id)??0;}
  rank(id:string):number {return this.levelOf(id);}
  has(id:string):boolean {return this.levelOf(id)>0;}
  get cores():readonly CoreDefinition[] {return CORE_DEFINITIONS.filter(core=>core.classId===this.classId);}
  /** Returns false for foreign routes, invalid ranks or already capped cores. */
  learnCore(id:string):boolean {
    if(!this.cores.some(core=>core.id===id)||this.levelOf(id)>=3)return false;
    this.levels.set(id,this.levelOf(id)+1);this.cached=null;return true;
  }
  learnSupport(id:string):boolean {
    const required=SUPPORT_REQUIREMENTS[id];
    if(!required||!this.has(required)||this.levelOf(id)>=8)return false;
    this.levels.set(id,this.levelOf(id)+1);this.cached=null;return true;
  }
  effects():Readonly<BuildEffects> {
    if(this.cached)return this.cached;
    const n=(id:string):number=>this.levelOf(id);
    const counter=n('warrior-counter'),spin=n('warrior-whirlwind'),frost=n('mage-freeze'),chain=n('mage-chain'),pierce=n('archer-overpierce'),bounce=n('archer-ricochet');
    this.cached={
      counterShockwaveRadius:counter?180+counter*20+n('warrior-counter-force')*8:0,
      counterDamageMultiplier:counter?1.5+counter*.45+n('warrior-counter-force')*.2:1,
      guardBuffMultiplier:counter?1.18+counter*.07+n('warrior-guard-flow')*.035:1,
      guardBuffDuration:counter?2200+counter*300+n('warrior-guard-flow')*250:0,
      parryToughnessBonus:counter?12+counter*6:0,
      whirlwindRangeBonus:spin?16+spin*8+n('warrior-vortex')*3:0,
      whirlwindThreshold:spin?Math.max(5,10-spin-Math.floor(n('warrior-momentum')/3)):0,
      whirlwindDamageMultiplier:spin?1.1+spin*.35+n('warrior-vortex')*.025+n('warrior-momentum')*.12:0,
      frostStacks:frost?(frost>=3?2:3):0,
      frostSlowMultiplier:frost?Math.max(.35,.6-frost*.05-n('mage-snowball')*.015):1,
      frostFreezeDuration:frost?650+frost*180+n('mage-cold-front')*80:0,
      frostBossFreezeDuration:frost?140+frost*45+n('mage-cold-front')*15:0,
      frostCooldown:2400,
      frostBossCooldown:5000,
      chainBounces:chain?Math.min(4,chain+1):0,
      chainRadius:chain?150+chain*20+n('mage-chain-reach')*12:0,
      chainDamageMultiplier:chain?Math.min(.85,.35+chain*.1+n('mage-chain-charge')*.025):0,
      pierceBonus:pierce?1:0,
      pierceDamageStep:pierce?.12+pierce*.06+n('archer-spine')*.03+n('archer-needle')*.015:0,
      pierceDamageCap:pierce?Math.min(3,1.45+pierce*.2+n('archer-spine')*.08+n('archer-needle')*.06):1,
      ricochetBounces:bounce?Math.min(3,bounce):0,
      ricochetRadius:bounce?210+bounce*30+n('archer-bounce-range')*15:0,
      ricochetDamageMultiplier:bounce?Math.min(.95,.5+bounce*.1+n('archer-bounce-charge')*.025):0,
    };
    return this.cached;
  }
  guardSuccess(now:number,perfect:boolean):void {
    const effects=this.effects();
    if(effects.guardBuffDuration)this.buffUntil=Math.max(this.buffUntil,now+effects.guardBuffDuration+(perfect?600:0));
  }
  attackMultiplier(now:number):number {return now<this.buffUntil?this.effects().guardBuffMultiplier:1;}
  /** One event per actual normal-attack hit. Ring attacks must not feed their own meter. */
  registerHit(now:number):{rangeBonus:number;spin:boolean} {
    const effects=this.effects();
    if(!effects.whirlwindThreshold)return {rangeBonus:0,spin:false};
    this.hitStreak=now-this.lastHit<=1600?Math.min(effects.whirlwindThreshold,this.hitStreak+1):1;
    this.lastHit=now;
    const spin=this.hitStreak>=effects.whirlwindThreshold&&now-this.lastSpin>=650;
    if(spin){this.hitStreak=0;this.lastSpin=now;}
    return {rangeBonus:this.rangeBonus(now),spin};
  }
  rangeBonus(now:number):number {
    return now-this.lastHit<=1600?this.effects().whirlwindRangeBonus*Math.min(1,this.hitStreak/4):0;
  }
  resetCombat():void {this.hitStreak=0;this.lastHit=-Infinity;this.buffUntil=-Infinity;this.lastSpin=-Infinity;}
  summary():string[] {
    return this.cores.filter(core=>this.has(core.id)).map(core=>`${core.name} ${this.levelOf(core.id)}/3 · ${core.tag}`);
  }
}
