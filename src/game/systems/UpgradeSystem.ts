import { UPGRADE_RULES, type ClassId, type PlayerStats } from '../config';

export interface UpgradeChoice { id:string; name:string; description:string; icon:string; tag:string; level:number; }
interface UpgradeDefinition {
  id:string; name:string; icon:string; tag:string;
  describe:(stats:PlayerStats)=>string;
  apply:(stats:PlayerStats)=>void;
  available?:(stats:PlayerStats)=>boolean;
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
    {id:'warrior-leech',name:'续一口奶',icon:'♥',tag:'近战 · 吸血',describe:s=>`命中回复生命 ${s.lifeSteal} → ${s.lifeSteal+2} · 每个受击目标独立触发`,apply:s=>{s.lifeSteal+=2;}},
    {id:'warrior-guard',name:'奶盖护体',icon:'⬡',tag:'近战 · 格挡',describe:s=>`格挡冷却 ${(s.guardCooldown/1000).toFixed(2)} → ${(interval(s.guardCooldown,.85,600)/1000).toFixed(2)}秒 · 更频繁化解攻击`,apply:s=>{s.guardCooldown=interval(s.guardCooldown,.85,600);},available:s=>s.guardCooldown>600},
  ],
  mage:[
    {id:'mage-blast',name:'奶泡加量',icon:'✺',tag:'法师 · 爆破',describe:s=>`爆破半径 ${s.splashRadius} → ${s.splashRadius+25} · 奶泡弹命中时波及周围敌人`,apply:s=>{s.splashRadius+=25;}},
    {id:'mage-split',name:'双倍快乐',icon:'✧',tag:'法师 · 分裂',describe:s=>`每次施法弹数 ${s.projectileCount} → ${Math.min(3,s.projectileCount+1)} · 上限 3 枚`,apply:s=>{s.projectileCount=Math.min(3,s.projectileCount+1);},available:s=>s.projectileCount<3},
    {id:'mage-frost',name:'冰奶特调',icon:'❄',tag:'法师 · 冰缓',describe:s=>`命中减速时长 ${(s.slowDuration/1000).toFixed(1)} → ${(Math.min(2400,s.slowDuration+600)/1000).toFixed(1)}秒 · 抑制敌人移动`,apply:s=>{s.slowDuration=Math.min(2400,s.slowDuration+600);},available:s=>s.slowDuration<2400},
  ],
  archer:[
    {id:'archer-pierce',name:'频道直通',icon:'➶',tag:'弓箭 · 穿透',describe:s=>`单支箭最多命中 ${s.pierceCount} → ${Math.min(4,s.pierceCount+1)} 个敌人 · 上限 4 个`,apply:s=>{s.pierceCount=Math.min(4,s.pierceCount+1);},available:s=>s.pierceCount<4},
    {id:'archer-volley',name:'蛙友连线',icon:'⋙',tag:'弓箭 · 多重',describe:s=>`每次射击箭数 ${s.projectileCount} → ${Math.min(3,s.projectileCount+1)} · 上限 3 支`,apply:s=>{s.projectileCount=Math.min(3,s.projectileCount+1);},available:s=>s.projectileCount<3},
    {id:'archer-precision',name:'快乐瞄准',icon:'◎',tag:'弓箭 · 精准',describe:s=>`暴击率 ${percent(s.critChance)}% → ${percent(Math.min(.85,s.critChance+.12))}% · 箭速 ${s.projectileSpeed} → ${s.projectileSpeed+60}`,apply:s=>{s.critChance=Math.min(.85,s.critChance+.12);s.projectileSpeed+=60;}},
  ],
};

/** Every offering includes a route upgrade; only the currently offered IDs can be applied. */
export class UpgradeSystem {
  private readonly levels=new Map<string,number>();
  private pending:UpgradeChoice[]=[];
  private completed=0;
  private readonly definitions:UpgradeDefinition[];
  nextAt:number=UPGRADE_RULES.firstKillThreshold;
  constructor(private readonly random:Phaser.Math.RandomDataGenerator,readonly classId:ClassId='warrior') {
    this.definitions=[...shared,...routes[classId]];
  }
  get count():number {return this.completed;}
  get automatic():boolean {return this.completed>=UPGRADE_RULES.manualChoices;}
  /** How often a single blessing may be taken during one run. */
  get limit():number {return UPGRADE_RULES.maxPerUpgrade;}
  /** How often a blessing was taken so far. */
  levelOf(id:string):number {return this.levels.get(id)??0;}
  /** True once a blessing reached its per-run cap. */
  isMaxed(id:string):boolean {return this.levelOf(id)>=UPGRADE_RULES.maxPerUpgrade;}
  /** True once every blessing of this route reached its cap. */
  get exhausted():boolean {return this.definitions.every(d=>this.isMaxed(d.id));}
  hasAvailable(stats:PlayerStats):boolean {
    return this.definitions.some(d=>!this.isMaxed(d.id)&&(!d.available||d.available(stats)));
  }
  choices(stats:PlayerStats):UpgradeChoice[] {
    // A blessing that reached its cap leaves the pool, so the pool shrinks over the run.
    const available=(d:UpgradeDefinition):boolean=>!this.isMaxed(d.id)&&(!d.available||d.available(stats));
    const route=routes[this.classId].filter(available);
    const selected:UpgradeDefinition[]=[];
    if(route.length) selected.push(route[this.random.integerInRange(0,route.length-1)]);
    const pool=this.definitions.filter(d=>available(d)&&!selected.includes(d));
    while(selected.length<3&&pool.length) selected.push(pool.splice(this.random.integerInRange(0,pool.length-1),1)[0]);
    // Shuffle positions too, so route cards don't always occupy the first slot.
    for(let i=selected.length-1;i>0;i--){const j=this.random.integerInRange(0,i);[selected[i],selected[j]]=[selected[j],selected[i]];}
    this.pending=selected.map(d=>({id:d.id,name:d.name,icon:d.icon,tag:d.tag,description:d.describe(stats),level:(this.levels.get(d.id)??0)+1}));
    return this.pending;
  }
  choose(id:string,stats:PlayerStats):boolean {
    if(!this.pending.some(choice=>choice.id===id)) return false;
    if(this.isMaxed(id)) return false;
    const definition=this.definitions.find(candidate=>candidate.id===id);
    if(!definition||definition.available&&!definition.available(stats)) return false;
    definition.apply(stats);
    this.levels.set(id,(this.levels.get(id)??0)+1);
    this.pending=[];
    this.completed++;
    this.nextAt+=UPGRADE_RULES.killsPerUpgrade;
    return true;
  }
  /** Uses the same legal, class-specific offering and seeded randomness as manual choices. */
  chooseRandom(stats:PlayerStats):UpgradeChoice|null {
    if(!this.automatic)return null;
    const choices=this.choices(stats);
    if(!choices.length)return null;
    const choice=choices[this.random.integerInRange(0,choices.length-1)];
    return this.choose(choice.id,stats)?choice:null;
  }
  /** Consumes a reward slot once every blessing reached its cap, so thresholds keep moving. */
  skipReward(count=1):void {this.nextAt+=UPGRADE_RULES.killsPerUpgrade*Math.max(1,Math.floor(count));}
}
