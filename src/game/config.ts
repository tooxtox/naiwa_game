export const VIEW = { width: 960, height: 540 };
export const WORLD = { width: 1920, height: 1280, inset: 100, gravity: 0, verticalScale: .72 };
export const PLAYER = { maxHealth: 125, damage: 30, speed: 270, attackCooldown: 390, dashCooldown: 1450, dashDuration: 175, dashSpeed: 760, invulnerability: 850, critChance: .08 };
export const GUARD = { duration: 650, perfectWindow: 180, cooldown: 2400, reduction: .8 };
export const ULTIMATE = { maxCharge: 100, hitCharge: 3, killCharge: 20, eliteCharge: 30, parryCharge: 25, lockout: 1800 };
export const UPGRADE_RULES = { manualChoices: 10, firstKillThreshold: 4, killsPerUpgrade: 5, maxPerUpgrade: 5 };
export const CAMPAIGN = { maxWaves: 100, bossWaves: [35, 75, 100] as const, pressureStart: 35, intermission: 2800 };
export type BossWave = typeof CAMPAIGN.bossWaves[number];
export const BOSSES:Record<BossWave,{name:string;color:number;healthMultiplier:number}> = {
  35:{name:'裂甲守卫',color:0xffb55c,healthMultiplier:3.5},
  75:{name:'星渊织法者',color:0xc398ff,healthMultiplier:3.8},
  100:{name:'永夜之核',color:0xff718f,healthMultiplier:3.2},
};
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
  warrior:{id:'warrior',name:'近战',weapon:'星陨刃',icon:'⚔',color:0xffd27b,role:'近身横扫 · 高生命',description:'重刃横扫最近敌人，以吸血与更大斩击范围成长。',attackName:'横扫',ultimateName:'星坠回旋',ultimateDescription:'大范围回旋斩，击退周围敌人并清除弹幕。',stats:{...common,maxHealth:125,damage:30,speed:270,attackCooldown:390,attackRange:130}},
  mage:{id:'mage',name:'法师',weapon:'星辉法杖',icon:'✦',color:0xbca2ff,role:'远程爆破 · 范围伤害',description:'魔法弹自动追击最近目标，爆破、分裂与冰缓形成法术路线。',attackName:'星辉弹',ultimateName:'陨星坠落',ultimateDescription:'锁定最近目标召唤陨星，短暂蓄力后造成巨额范围伤害。',stats:{...common,maxHealth:85,damage:24,speed:255,attackCooldown:580,attackRange:640,projectileSpeed:440,splashRadius:86}},
  archer:{id:'archer',name:'弓箭',weapon:'追光长弓',icon:'➶',color:0x83ead0,role:'高速射击 · 穿透成长',description:'箭矢瞄准最近敌人，逐步获得穿透、多重箭与精准暴击。',attackName:'追光箭',ultimateName:'万箭齐发',ultimateDescription:'朝最近敌人发射九支高伤穿透箭，贯穿前方战线。',stats:{...common,maxHealth:95,damage:20,speed:290,attackCooldown:350,attackRange:780,projectileSpeed:740,critChance:.15}},
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
export interface RunStats { seed:string; classId:ClassId; wave:number; kills:number; upgrades:number; elapsed:number; bestCombo:number; }
export interface HUDState {
  health:number; maxHealth:number; wave:number; kills:number; remaining:number; progress:number; nextUpgrade:number;
  upgrades:number; autoUpgrades:boolean;
  pendingUpgrades:number; upgradesExhausted:boolean; waveCap:number;
  boss:{name:string;health:number;maxHealth:number;phase:number}|null;
  dashRatio:number; attackRatio:number; guardRatio:number; guardActive:boolean; ultimateCharge:number; ultimateReady:boolean;
  elapsed:number; seed:string; combo:number; damage:number; speed:number; critChance:number; attackCooldown:number; dashCooldown:number; status:string;
  classId:ClassId; className:string; weaponName:string; ultimateName:string; attackRange:number; targetName:string;
}
