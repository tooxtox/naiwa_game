import { UPGRADE_RULES, type ClassId, type PlayerStats } from '../config';
import { BuildSystem, type CoreDefinition } from './BuildSystem';

export interface UpgradeChoice {
  id:string; name:string; description:string; icon:string; tag:string; level:number;
  category:'basic'|'core'; rarity:'common'|'rare'|'core'; maxLevel:number; value:string;
}
interface UpgradeDefinition {
  id:string; name:string; icon:string; tag:string;
  describe:(stats:PlayerStats)=>string;
  apply:(stats:PlayerStats)=>void;
  available?:(stats:PlayerStats)=>boolean;
  maxLevel?:number; requires?:string; affinity?:string; late?:boolean;
}
const percent = (value:number):number => Math.round(value * 100);
const interval = (value:number,factor:number,min:number):number => Math.max(min,Math.round(value * factor));
const shared:UpgradeDefinition[] = [
  { id:'power',name:'快乐加一',icon:'✦',tag:'攻击强化',describe:s=>`攻击力 ${s.damage} → ${s.damage+8} · 所有普通攻击获得强化`,apply:s=>{s.damage+=8;} },
  { id:'vitality',name:'奶香续杯',icon:'♥',tag:'生存强化',describe:s=>`最大生命 ${s.maxHealth} → ${s.maxHealth+25} · 立即恢复 25 生命`,apply:s=>{s.maxHealth+=25;} },
  { id:'haste',name:'蛙速上线',icon:'≋',tag:'攻击速度',describe:s=>`攻击间隔 ${s.attackCooldown} → ${interval(s.attackCooldown,.86,100)}ms · 更快连续攻击`,apply:s=>{s.attackCooldown=interval(s.attackCooldown,.86,100);},available:s=>s.attackCooldown>100 },
  { id:'dash',name:'滑走滑走',icon:'»',tag:'冲刺强化',describe:s=>`冲刺冷却 ${(s.dashCooldown/1000).toFixed(2)} → ${(interval(s.dashCooldown,.82,400)/1000).toFixed(2)}秒`,apply:s=>{s.dashCooldown=interval(s.dashCooldown,.82,400);},available:s=>s.dashCooldown>400 },
  { id:'speed',name:'快乐起步',icon:'↗',tag:'机动强化',describe:s=>`移动速度 ${s.speed} → ${Math.round(s.speed*1.12)} · 更灵活的走位`,apply:s=>{s.speed=Math.round(s.speed*1.12);} },
  { id:'crit',name:'绷不住了',icon:'◇',tag:'暴击强化',describe:s=>`暴击率 ${percent(s.critChance)}% → ${percent(Math.min(.85,s.critChance+.12))}% · 暴击造成双倍伤害`,apply:s=>{s.critChance=Math.min(.85,s.critChance+.12);},available:s=>s.critChance<.85 },
];
const routes:Record<ClassId,UpgradeDefinition[]> = {
  warrior:[
    {id:'warrior-range',name:'大勺开摆',icon:'⚔',tag:'近战 · 横扫',describe:s=>`横扫范围 ${s.attackRange} → ${s.attackRange+20} · 同时命中更多近身敌人`,apply:s=>{s.attackRange+=20;}},
    {id:'warrior-leech',name:'续一口奶',icon:'♥',tag:'近战 · 吸血',describe:s=>`命中回复生命 ${s.lifeSteal} → ${s.lifeSteal+2} · 每秒至多回复 ${Math.min(s.maxHealth*.12,(s.lifeSteal+2)*5).toFixed(1)}，需近身持续命中`,apply:s=>{s.lifeSteal+=2;}},
    {id:'warrior-guard',name:'奶盖护体',icon:'⬡',tag:'近战 · 格挡',describe:s=>`格挡冷却 ${(s.guardCooldown/1000).toFixed(2)} → ${(interval(s.guardCooldown,.85,600)/1000).toFixed(2)}秒 · 更频繁化解攻击`,apply:s=>{s.guardCooldown=interval(s.guardCooldown,.85,600);},available:s=>s.guardCooldown>600},
  ],
  mage:[
    {id:'mage-blast',name:'奶泡加量',icon:'✺',tag:'法师 · 爆破',describe:s=>`爆破半径 ${s.splashRadius} → ${s.splashRadius+25} · 奶泡弹命中时波及周围敌人`,apply:s=>{s.splashRadius+=25;}},
    {id:'mage-split',name:'双倍快乐',icon:'✧',tag:'法师 · 分裂',describe:s=>`奶泡 ${s.projectileCount} → ${Math.min(3,s.projectileCount+1)} 枚 · 主弹全伤、附弹 70% · 扩大覆盖，上限 3 枚`,apply:s=>{s.projectileCount=Math.min(3,s.projectileCount+1);},available:s=>s.projectileCount<3},
    {id:'mage-frost',name:'冰奶特调',icon:'❄',tag:'法师 · 冰缓',describe:s=>`命中减速时长 ${(s.slowDuration/1000).toFixed(1)} → ${(Math.min(2400,s.slowDuration+600)/1000).toFixed(1)}秒 · 抑制敌人移动`,apply:s=>{s.slowDuration=Math.min(2400,s.slowDuration+600);},available:s=>s.slowDuration<2400},
  ],
  archer:[
    {id:'archer-pierce',name:'频道直通',icon:'➶',tag:'弓箭 · 穿透',describe:s=>`单支箭最多命中 ${s.pierceCount} → ${Math.min(4,s.pierceCount+1)} 个敌人 · 上限 4 个`,apply:s=>{s.pierceCount=Math.min(4,s.pierceCount+1);},available:s=>s.pierceCount<4},
    {id:'archer-volley',name:'蛙友连线',icon:'⋙',tag:'弓箭 · 多重',describe:s=>`箭矢 ${s.projectileCount} → ${Math.min(3,s.projectileCount+1)} 支 · 主箭全伤、附箭 55% · 配合穿透覆盖，上限 3 支`,apply:s=>{s.projectileCount=Math.min(3,s.projectileCount+1);},available:s=>s.projectileCount<3},
    {id:'archer-precision',name:'快乐瞄准',icon:'◎',tag:'弓箭 · 精准',describe:s=>`暴击率 ${percent(s.critChance)}% → ${percent(Math.min(.85,s.critChance+.12))}% · 箭速 ${s.projectileSpeed} → ${s.projectileSpeed+60}`,apply:s=>{s.critChance=Math.min(.85,s.critChance+.12);s.projectileSpeed+=60;}},
  ],
};
const support=(id:string,name:string,icon:string,requires:string,description:string):UpgradeDefinition=>({
  id,name,icon,requires,affinity:requires,maxLevel:8,tag:'流派协同',describe:()=>description,apply:()=>{},
});
const supports:Record<ClassId,UpgradeDefinition[]>={
  warrior:[
    support('warrior-counter-force','反击加奶','⬡','warrior-counter','强化反击伤害倍率 +0.20 · 冲击波半径 +8'),
    support('warrior-guard-flow','从容接梗','✦','warrior-counter','格挡后攻击强化 +3.5% · 持续时间 +0.25 秒'),
    support('warrior-vortex','旋风扩容','◎','warrior-whirlwind','满层横扫额外范围 +3 · 环斩伤害倍率 +0.025'),
    support('warrior-momentum','快乐动能','»','warrior-whirlwind','环斩伤害倍率 +0.12 · 每 3 级减少 1 次触发命中（最低 5）'),
  ],
  mage:[
    support('mage-cold-front','冰奶续冻','❄','mage-freeze','冻结时长 +0.08 秒 · Boss 冻结 +0.015 秒'),
    support('mage-snowball','慢点红温','❆','mage-freeze','寒霜减速再提高 1.5% · 移速倍率最低 35%'),
    support('mage-chain-reach','连线扩容','⌁','mage-chain','连锁搜索半径 +12 · 连锁次数仍受核心等级限制'),
    support('mage-chain-charge','奶泡增压','✺','mage-chain','连锁伤害倍率 +0.025 · 最高为原始命中的 85%'),
  ],
  archer:[
    support('archer-spine','贯通增压','➶','archer-overpierce','每穿透伤害增幅 +3% · 总倍率上限 +0.08（最高 3 倍）'),
    support('archer-needle','直达快乐','↗','archer-overpierce','每穿透伤害增幅 +1.5% · 总倍率上限 +0.06（最高 3 倍）'),
    support('archer-bounce-range','群聊扩列','⌁','archer-ricochet','弹射搜索半径 +15 · 同支箭不会重复命中同一目标'),
    support('archer-bounce-charge','蛙友接力','✦','archer-ricochet','弹射伤害倍率 +0.025 · 单次最高保留 95% 伤害'),
  ],
};
// These become available after the opening choices, keeping late-run rewards useful
// without removing caps or letting early attack speed / movement grow indefinitely.
const mastery:UpgradeDefinition[]=[
  {id:'mastery-force',name:'快乐精炼',icon:'✦',tag:'后期 · 精炼',maxLevel:10,late:true,describe:s=>`攻击力 ${s.damage} → ${s.damage+6} · 后期稳定成长`,apply:s=>{s.damage+=6;}},
  {id:'mastery-vigor',name:'奶香珍藏',icon:'♥',tag:'后期 · 续航',maxLevel:10,late:true,describe:s=>`最大生命 ${s.maxHealth} → ${s.maxHealth+18}`,apply:s=>{s.maxHealth+=18;}},
  {id:'mastery-finale',name:'压轴好梗',icon:'★',tag:'后期 · 终结',maxLevel:10,late:true,describe:s=>`终结技固定伤害倍率 ${s.ultimateMultiplier.toFixed(2)} → ${(s.ultimateMultiplier+.06).toFixed(2)} · Boss 百分比伤害不变`,apply:s=>{s.ultimateMultiplier=Number((s.ultimateMultiplier+.06).toFixed(2));}},
];

/** Every offering includes a route upgrade; only the currently offered IDs can be applied. */
export class UpgradeSystem {
  private readonly levels=new Map<string,number>();
  private pending:UpgradeChoice[]=[];
  private completed=0;
  private readonly definitions:UpgradeDefinition[];
  private corePending:UpgradeChoice[]=[];
  private readonly obtained=new Map<string,UpgradeChoice>();
  readonly build:BuildSystem;
  nextAt:number=UPGRADE_RULES.firstKillThreshold;
  constructor(private readonly random:Phaser.Math.RandomDataGenerator,readonly classId:ClassId='warrior') {
    this.build=new BuildSystem(classId);
    this.definitions=[...shared,...routes[classId],...supports[classId],...mastery];
  }
  get count():number {return this.completed;}
  get automatic():boolean {return this.completed>=UPGRADE_RULES.manualChoices;}
  /** How often a single blessing may be taken during one run. */
  get limit():number {return UPGRADE_RULES.maxPerUpgrade;}
  /** How often a blessing was taken so far. */
  levelOf(id:string):number {return this.levels.get(id)??0;}
  /** True once a blessing reached its per-run cap. */
  isMaxed(id:string):boolean {return this.levelOf(id)>=(this.definitions.find(d=>d.id===id)?.maxLevel??UPGRADE_RULES.maxPerUpgrade);}
  /** True once every blessing of this route reached its cap. */
  get exhausted():boolean {return this.definitions.filter(d=>this.unlocked(d)).every(d=>this.isMaxed(d.id));}
  private unlocked(definition:UpgradeDefinition):boolean {
    if(definition.id==='mage-snowball'&&this.build.effects().frostSlowMultiplier<=.35001)return false;
    if(definition.id==='archer-bounce-charge'&&this.build.effects().ricochetDamageMultiplier>=.94999)return false;
    return (!definition.requires||this.build.has(definition.requires))&&(!definition.late||this.completed>=20);
  }
  hasAvailable(stats:PlayerStats):boolean {
    return this.definitions.some(d=>this.unlocked(d)&&!this.isMaxed(d.id)&&(!d.available||d.available(stats)));
  }
  choices(stats:PlayerStats):UpgradeChoice[] {
    // A blessing that reached its cap leaves the pool, so the pool shrinks over the run.
    const available=(d:UpgradeDefinition):boolean=>this.unlocked(d)&&!this.isMaxed(d.id)&&(!d.available||d.available(stats));
    const route=[...routes[this.classId],...supports[this.classId]].filter(available);
    const selected:UpgradeDefinition[]=[];
    if(route.length) selected.push(route[this.random.integerInRange(0,route.length-1)]);
    const pool=this.definitions.filter(d=>available(d)&&!selected.includes(d));
    while(selected.length<3&&pool.length) selected.push(pool.splice(this.random.integerInRange(0,pool.length-1),1)[0]);
    // Shuffle positions too, so route cards don't always occupy the first slot.
    for(let i=selected.length-1;i>0;i--){const j=this.random.integerInRange(0,i);[selected[i],selected[j]]=[selected[j],selected[i]];}
    this.pending=selected.map(d=>({id:d.id,name:d.name,icon:d.icon,tag:d.tag,description:d.describe(stats),value:d.describe(stats),level:(this.levels.get(d.id)??0)+1,maxLevel:d.maxLevel??5,category:'basic',rarity:d.requires||d.late?'rare':'common'}));
    return this.pending;
  }
  choose(id:string,stats:PlayerStats):boolean {
    if(!this.pending.some(choice=>choice.id===id)) return false;
    if(this.isMaxed(id)) return false;
    const definition=this.definitions.find(candidate=>candidate.id===id);
    if(!definition||definition.available&&!definition.available(stats)) return false;
    if(!this.unlocked(definition))return false;
    const chosen=this.pending.find(choice=>choice.id===id)!;
    definition.apply(stats);
    if(definition.requires)this.build.learnSupport(id);
    this.levels.set(id,(this.levels.get(id)??0)+1);
    this.pending=[];
    this.completed++;
    this.obtained.set(id,{...chosen});
    this.nextAt+=UPGRADE_RULES.killsPerUpgrade;
    return true;
  }
  /** Uses the same legal, class-specific offering and seeded randomness as manual choices. */
  chooseRandom(stats:PlayerStats):UpgradeChoice|null {
    if(!this.automatic)return null;
    const choices=this.choices(stats);
    if(!choices.length)return null;
    const weights=choices.map(choice=>this.definitions.find(d=>d.id===choice.id)?.affinity?5:1);
    let draw=this.random.frac()*weights.reduce((sum,weight)=>sum+weight,0),index=0;
    while(index<weights.length-1&&draw>=weights[index]){draw-=weights[index];index++;}
    const choice=choices[index];
    return this.choose(choice.id,stats)?choice:null;
  }
  /** Consumes a reward slot once every blessing reached its cap, so thresholds keep moving. */
  skipReward(count=1):void {this.nextAt+=UPGRADE_RULES.killsPerUpgrade*Math.max(1,Math.floor(count));}
  /** Boss rewards are independent from kill rewards and never silently spend one. */
  coreChoices(_stats:PlayerStats):UpgradeChoice[] {
    this.corePending=this.build.cores.filter(core=>this.build.levelOf(core.id)<3).map(core=>this.coreChoice(core));
    return this.corePending;
  }
  private coreChoice(core:CoreDefinition):UpgradeChoice {
    const level=this.build.levelOf(core.id)+1;
    return {id:core.id,name:core.name,icon:core.icon,tag:core.tag,description:this.describeCore(core.id,level),value:this.describeCore(core.id,level),level,maxLevel:3,category:'core',rarity:'core'};
  }
  private describeCore(id:string,level:number):string {
    if(id==='warrior-counter')return `看准前摇格挡：反击倍率 ${(1.5+level*.45).toFixed(2)} · 格挡后攻击 +${Math.round((.18+level*.07)*100)}% · 完美格挡额外削韧 ${12+level*6}；空挡不触发`;
    if(id==='warrior-whirlwind')return `持续近身：${10-level} 次命中触发 ${(1.1+level*.35).toFixed(2)} 倍环斩 · 满层横扫范围 +${16+level*8}；1.6 秒未命中失去层数`;
    if(id==='mage-freeze')return `控场留出走位：${level>=3?2:3} 层寒霜冻结 ${(650+level*180)/1000} 秒 · Boss ${(140+level*45)/1000} 秒，5 秒冷却；不直接追加伤害`;
    if(id==='mage-chain')return `分散群怪：追加 ${Math.min(4,level+1)} 次连锁 · 半径 ${150+level*20} · 逐跳保留 ${Math.round((.35+level*.1)*100)}%；仅跳向未命中目标，单体不追加`;
    if(id==='archer-overpierce')return `拉成一线：穿透 +1 · 后续每目标伤害 +${Math.round((.12+level*.06)*100)}% · 上限 ${(1.45+level*.2).toFixed(2)} 倍；首个目标不增伤`;
    return `应对散敌：弹射 ${level} 次 · 半径 ${210+level*30} · 每跳保留 ${Math.round((.5+level*.1)*100)}%；不重复同一目标，单体不追加`;
  }
  chooseCore(id:string,_stats:PlayerStats):boolean {
    const choice=this.corePending.find(candidate=>candidate.id===id);
    if(!choice||!this.build.learnCore(id))return false;
    this.obtained.set(id,{...choice});this.corePending=[];return true;
  }
  acquired():UpgradeChoice[] {return [...this.obtained.values()].map(choice=>({...choice}));}
  summary():string[] {return this.build.summary();}
}
