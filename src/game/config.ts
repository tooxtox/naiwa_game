export const VIEW = { width: 960, height: 540 };
export const WORLD = { width: 1920, height: 1280, inset: 100, gravity: 0, verticalScale: .72 };
export const PLAYER = { maxHealth: 125, damage: 30, speed: 270, attackCooldown: 390, dashCooldown: 1450, dashDuration: 175, dashSpeed: 760, invulnerability: 850, critChance: .08 };
export const COMBO = { hitWindow: 1100 } as const;
export const GUARD = { duration: 650, perfectWindow: 180, cooldown: 2400, reduction: .8,
  counterEnemyRatio: .35, counterBossRatio: .06, counterRadius: 160,
  normalCounterMultiplier: .35, perfectDamageMultiplier: 1.6, parryToughness: 34 };
export const ULTIMATE = {
  maxCharge: 100, hitCharge: 3, killCharge: 20, eliteCharge: 30, parryCharge: 25, lockout: 1800,
  warrior: { pulses: 3, windup: 100, pulseInterval: 220, radius: 340, damageMultiplier: 16, bossHealthRatio: .3, enemyHealthRatio: .9 },
  mage: { windup: 600, radius: 360, damageMultiplier: 24, bossHealthRatio: .35, enemyHealthRatio: 1 },
  archer: { arrows: 9, interval: 55, damageMultiplier: 4, bossHealthRatioPerArrow: .04, enemyHealthRatioPerArrow: .22 },
} as const;
export const UPGRADE_RULES = { manualChoices: 10, firstKillThreshold: 4, killsPerUpgrade: 5, maxPerUpgrade: 5 };
export const CAMPAIGN = { maxWaves: 50, bossWaves: [10, 20, 30, 40, 50] as const, pressureStart: 35 };
export type BossWave = typeof CAMPAIGN.bossWaves[number];
export type BossSkill = 'charge' | 'ring' | 'fan' | 'meteor';
export type BossArt = 'repeater' | 'comment' | 'controller';
export interface BossDefinition {
  name:string; color:number; maxHealth:number; art:BossArt; tint:number;
  patterns:readonly [BossSkill,...BossSkill[]]; final:boolean; keepsDistance:boolean; projectileSpeed:number;
  chapter:string; approach:string;
}
/** Boss HP is authored independently of normal-enemy scaling and late-wave pressure. */
export const BOSSES:Record<BossWave,BossDefinition> = {
  10:{name:'复读机厂长',color:0xffb55c,maxHealth:10000,art:'repeater',tint:0xffffff,patterns:['charge','ring'],final:false,keepsDistance:false,projectileSpeed:245,chapter:'复读中继站',approach:'蛙友广场'},
  20:{name:'阴阳弹幕王',color:0xc398ff,maxHealth:25000,art:'comment',tint:0xffffff,patterns:['fan','meteor','fan','ring'],final:false,keepsDistance:true,projectileSpeed:260,chapter:'阴阳弹幕塔',approach:'弹幕中转站'},
  30:{name:'缓存堵塞者',color:0x83dfbd,maxHealth:60000,art:'controller',tint:0x94e6c6,patterns:['charge','meteor','ring'],final:false,keepsDistance:false,projectileSpeed:250,chapter:'缓存堵塞站',approach:'缓存迷宫'},
  40:{name:'热搜风暴',color:0xffc47a,maxHealth:150000,art:'comment',tint:0xffcd91,patterns:['fan','ring','meteor','fan'],final:false,keepsDistance:true,projectileSpeed:275,chapter:'热搜风暴眼',approach:'热搜频道'},
  50:{name:'红温总控',color:0xff718f,maxHealth:500000,art:'controller',tint:0xffffff,patterns:['charge','fan','meteor','ring'],final:true,keepsDistance:false,projectileSpeed:260,chapter:'红温总控室',approach:'红温机房'},
};
/** Short runs use their own HP budget instead of the campaign's late-game values. */
export const QUICK_BOSS_HEALTH = { base:14000, perChapter:600 } as const;
export const CLASS_IDS = ['warrior','mage','archer'] as const;
export type ClassId = typeof CLASS_IDS[number];
export interface PlayerStats {
  maxHealth:number; damage:number; speed:number; attackCooldown:number; dashCooldown:number; critChance:number;
  attackRange:number; projectileCount:number; projectileSpeed:number; splashRadius:number; pierceCount:number;
  lifeSteal:number; slowDuration:number; guardCooldown:number; guardReduction:number; ultimateMultiplier:number;
}
export interface ClassDefinition {
  id:ClassId; name:string; weapon:string; icon:string; color:number; role:string; description:string;
  attackName:string; ultimateName:string; ultimateDescription:string; stats:PlayerStats;
}
const common = { dashCooldown:1450, critChance:.08, projectileCount:1, projectileSpeed:0, splashRadius:0, pierceCount:1, lifeSteal:0, slowDuration:0, guardCooldown:GUARD.cooldown, guardReduction:GUARD.reduction, ultimateMultiplier:1 };
export const CLASSES:Record<ClassId,ClassDefinition> = {
  warrior:{id:'warrior',name:'近战',weapon:'奶盖铲',icon:'⚔',color:0xffd27b,role:'近身横扫 · 高生命',description:'奶蛙挥起奶盖铲回收近身噪声，靠吸血与大范围横扫续航。',attackName:'奶盖横扫',ultimateName:'快乐大回旋',ultimateDescription:'三段大范围回旋并清除弹幕，对 Boss 累计额外造成 30% 最大生命伤害。',stats:{...common,maxHealth:125,damage:30,speed:270,attackCooldown:390,attackRange:130}},
  mage:{id:'mage',name:'法师',weapon:'奶泡法杖',icon:'✦',color:0xbca2ff,role:'远程爆破 · 范围伤害',description:'发射追踪奶泡，搭配爆破、分裂与冰缓，把满屏坏情绪打包。',attackName:'奶泡弹',ultimateName:'奶泡天降',ultimateDescription:'锁定落点后大范围奶泡轰击，对 Boss 额外造成 35% 最大生命伤害。',stats:{...common,maxHealth:85,damage:24,speed:255,attackCooldown:580,attackRange:640,projectileSpeed:440,splashRadius:86}},
  archer:{id:'archer',name:'弓箭',weapon:'蛙友长弓',icon:'➶',color:0x83ead0,role:'高速射击 · 穿透成长',description:'把蛙友的支持化作高速箭矢，以穿透、多重箭和暴击打通频道。',attackName:'蛙友箭',ultimateName:'蛙友齐射',ultimateDescription:'九支追踪穿透终结箭越过掩体，每箭额外造成 Boss 4% 最大生命伤害。',stats:{...common,maxHealth:95,damage:20,speed:290,attackCooldown:350,attackRange:780,projectileSpeed:740,critChance:.15}},
};
export const isClassId=(id:unknown):id is ClassId=>typeof id==='string'&&CLASS_IDS.includes(id as ClassId);
export type EnemyKind = 'melee' | 'ranged' | 'elite';
export const ENEMY = {
  melee: { health: 56, damage: 12, speed: 115, color: 0xff7c91, range: 58, cooldown: 1300 },
  ranged: { health: 46, damage: 10, speed: 88, color: 0xbe92ff, range: 390, cooldown: 1950 },
  elite: { health: 172, damage: 19, speed: 97, color: 0xffb45e, range: 260, cooldown: 2300 },
};
/** Additive scaling keeps early waves gentle without exponential late-game HP. */
export const ENEMY_HEALTH_SCALING = { linearPerWave: .16, pressurePerWave: .025, pressureExponent: 1.5, lateHealthPerWaveSquared: .004, lateDamagePerWaveSquared: .00025 } as const;
export type RunMode='campaign'|'quick';
export interface RunSummary {
  combatSeconds:number; damageDealt:number; damageTaken:number; damagePrevented:number;
  perfectGuards:number; blocks:number; ultimates:number; bossBreaks:number; bossesDefeated:number;
  score:number; grade:'S'|'A'|'B'|'C'; criteria:string[]; build:string[];
  bossResults?:{wave:number;seconds:number;damageTaken:number;breaks:number}[];
}
export interface RunStats { seed:string; classId:ClassId; mode?:RunMode; wave:number; kills:number; upgrades:number; elapsed:number; bestCombo:number; summary?:RunSummary; }
export interface HUDState {
  health:number; maxHealth:number; wave:number; kills:number; remaining:number; progress:number; nextUpgrade:number;
  upgrades:number; autoUpgrades:boolean;
  pendingUpgrades:number; upgradesExhausted:boolean; waveCap:number;
  boss:{name:string;health:number;maxHealth:number;phase:number;toughness:number;maxToughness:number;broken:boolean}|null;
  dashRatio:number; attackRatio:number; guardRatio:number; guardActive:boolean; ultimateCharge:number; ultimateReady:boolean;
  elapsed:number; seed:string; combo:number; damage:number; speed:number; critChance:number; attackCooldown:number; dashCooldown:number; status:string;
  classId:ClassId; className:string; weaponName:string; ultimateName:string; attackRange:number; targetName:string;
}
