import { test, expect } from '@playwright/test';

async function modules(page) {await page.goto('/');await expect.poll(()=>page.evaluate(()=>Boolean(window.__LUMENFALL__))).toBe(true);}

for(const classId of ['warrior','mage','archer']) {
  test(`build ${classId}: boss core choices are class-specific, bounded and independent of kill reward thresholds`,async({page})=>{
    await modules(page);
    const result=await page.evaluate(async classId=>{
      const {UpgradeSystem}=await import('/src/game/systems/UpgradeSystem.ts');
      const {CLASSES}=await import('/src/game/config.ts');
      let seed=39;const frac=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const random={frac,integerInRange:(min,max)=>min+Math.floor(frac()*(max-min+1))};
      const upgrades=new UpgradeSystem(random,classId),stats={...CLASSES[classId].stats};
      const before={count:upgrades.count,next:upgrades.nextAt,stats:{...stats}};
      const first=upgrades.coreChoices(stats),foreign=upgrades.chooseCore('not-a-core',stats);
      const picked=[];
      for(let i=0;i<6;i++){
        const choice=upgrades.coreChoices(stats)[0];picked.push(choice);
        if(!upgrades.chooseCore(choice.id,stats))throw new Error('Core choice rejected');
        if(upgrades.chooseCore(choice.id,stats))throw new Error('Old offering accepted twice');
      }
      return {before,first,foreign,picked,after:{count:upgrades.count,next:upgrades.nextAt,stats},remaining:upgrades.coreChoices(stats),summary:upgrades.summary(),acquired:upgrades.acquired()};
    },classId);
    expect(result.first).toHaveLength(2);expect(result.foreign).toBe(false);
    expect(result.first.every(choice=>choice.id.startsWith(classId)&&choice.category==='core'&&choice.rarity==='core'&&choice.maxLevel===3)).toBe(true);
    expect(result.after).toEqual(result.before);expect(result.remaining).toHaveLength(0);
    expect(result.picked.map(choice=>choice.level)).toEqual([1,2,3,1,2,3]);
    expect(result.summary).toHaveLength(2);expect(result.acquired).toHaveLength(2);
  });
}

test('build whirlwind: only actual hit events charge bounded ring attacks; timeout and combat reset clear transient state',async({page})=>{
  await modules(page);
  const result=await page.evaluate(async()=>{
    const {BuildSystem}=await import('/src/game/systems/BuildSystem.ts');const build=new BuildSystem('warrior');
    build.learnCore('warrior-whirlwind');const effects=build.effects(),same=effects===build.effects();
    const hits=[];for(let i=0;i<effects.whirlwindThreshold;i++)hits.push(build.registerHit(100+i*100));
    const afterSpin=build.rangeBonus(1000);for(let i=0;i<3;i++)build.registerHit(1100+i*100);
    const charged=build.rangeBonus(1300),expired=build.rangeBonus(3000);
    build.registerHit(3000);const resetStreak=build.rangeBonus(3000);
    build.learnCore('warrior-counter');build.guardSuccess(4000,false);const buff=build.attackMultiplier(4001),unbuffed=build.attackMultiplier(10000);
    build.resetCombat();return {same,hits,afterSpin,charged,expired,resetStreak,buff,unbuffed,reset:build.rangeBonus(4000),effects:build.effects()};
  });
  expect(result.same).toBe(true);expect(result.hits.filter(hit=>hit.spin)).toHaveLength(1);
  expect(result.afterSpin).toBe(0);expect(result.charged).toBeGreaterThan(0);expect(result.expired).toBe(0);
  expect(result.resetStreak).toBe(result.effects.whirlwindRangeBonus/4);expect(result.buff).toBeGreaterThan(1);expect(result.unbuffed).toBe(1);expect(result.reset).toBe(0);
});

test('build mechanisms: frost, chain, pierce and ricochet retain hard caps even after all support upgrades',async({page})=>{
  await modules(page);
  const result=await page.evaluate(async()=>{
    const {BuildSystem}=await import('/src/game/systems/BuildSystem.ts');
    const result={};
    const routes={
      mage:{cores:['mage-freeze','mage-chain'],supports:['mage-cold-front','mage-snowball','mage-chain-reach','mage-chain-charge']},
      archer:{cores:['archer-overpierce','archer-ricochet'],supports:['archer-spine','archer-needle','archer-bounce-range','archer-bounce-charge']},
    };
    for(const [id,route] of Object.entries(routes)){
      const build=new BuildSystem(id);for(let i=0;i<100;i++){route.cores.forEach(core=>build.learnCore(core));route.supports.forEach(support=>build.learnSupport(support));}
      result[id]={...build.effects(),coreLevels:route.cores.map(core=>build.rank(core)),supportLevels:route.supports.map(support=>build.rank(support))};
    }
    return result;
  });
  expect(result.mage.coreLevels).toEqual([3,3]);expect(result.mage.supportLevels).toEqual([8,8,8,8]);
  expect(result.mage.chainBounces).toBe(4);expect(result.mage.chainRadius).toBeLessThanOrEqual(306);expect(result.mage.chainDamageMultiplier).toBeLessThanOrEqual(.85);
  expect(result.mage.frostStacks).toBe(2);expect(result.mage.frostBossFreezeDuration).toBeLessThan(result.mage.frostFreezeDuration);expect(result.mage.frostBossCooldown).toBeGreaterThan(result.mage.frostCooldown);
  expect(result.archer.ricochetBounces).toBe(3);expect(result.archer.ricochetRadius).toBeLessThanOrEqual(420);expect(result.archer.ricochetDamageMultiplier).toBeLessThanOrEqual(.95);
  expect(result.archer.pierceDamageCap).toBeLessThanOrEqual(3);expect(result.archer.pierceBonus).toBe(1);
});

test('growth: supports require the chosen route, basic caps remain intact, and late-run growth outlasts 20-wave rewards',async({page})=>{
  await modules(page);
  const result=await page.evaluate(async()=>{
    const {UpgradeSystem}=await import('/src/game/systems/UpgradeSystem.ts');const {CLASSES}=await import('/src/game/config.ts');
    let seed=13;const frac=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const random={frac,integerInRange:(min,max)=>min+Math.floor(frac()*(max-min+1))};
    const upgrades=new UpgradeSystem(random,'warrior'),stats={...CLASSES.warrior.stats};const initial=[];
    for(let i=0;i<20;i++)initial.push(...upgrades.choices(stats).map(choice=>choice.id));
    upgrades.coreChoices(stats);upgrades.chooseCore('warrior-counter',stats);
    let supportPicks=0;const learned=[];
    for(let i=0;i<65;i++){
      const choices=upgrades.choices(stats);if(!choices.length)break;
      const choice=choices[0];if(choice.id==='warrior-counter-force'||choice.id==='warrior-guard-flow')supportPicks++;
      upgrades.choose(choice.id,stats);learned.push(choice.id);
    }
    return {initial,count:upgrades.count,learned,supportPicks,late:learned.some(id=>id.startsWith('mastery-')),levels:upgrades.acquired(),stats};
  });
  expect(result.initial.some(id=>id.includes('counter-force')||id.startsWith('mastery-'))).toBe(false);
  expect(result.count).toBeGreaterThan(60);expect(result.supportPicks).toBeGreaterThan(0);expect(result.late).toBe(true);
  for(const choice of result.levels)expect(choice.level).toBeLessThanOrEqual(choice.maxLevel);
  expect(result.stats.attackCooldown).toBeGreaterThanOrEqual(100);expect(result.stats.dashCooldown).toBeGreaterThanOrEqual(400);expect(result.stats.critChance).toBeLessThanOrEqual(.85);
});

test('auto growth: seeded auto rewards favor acquired core synergies without unlocking foreign routes',async({page})=>{
  await modules(page);
  const result=await page.evaluate(async()=>{
    const {UpgradeSystem}=await import('/src/game/systems/UpgradeSystem.ts');const {CLASSES}=await import('/src/game/config.ts');let seed=21;
    const frac=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const random={frac,integerInRange:(min,max)=>min+Math.floor(frac()*(max-min+1))};
    const upgrades=new UpgradeSystem(random,'mage'),stats={...CLASSES.mage.stats};upgrades.coreChoices(stats);upgrades.chooseCore('mage-freeze',stats);
    for(let i=0;i<10;i++){const choices=upgrades.choices(stats);upgrades.choose(choices[0].id,stats);}
    const picks=[];for(let i=0;i<20;i++){const choice=upgrades.chooseRandom(stats);if(choice)picks.push(choice);}
    return {picks,count:upgrades.count,frost:upgrades.build.levelOf('mage-cold-front')+upgrades.build.levelOf('mage-snowball'),chain:upgrades.build.levelOf('mage-chain-reach')};
  });
  expect(result.picks).toHaveLength(20);expect(result.count).toBe(30);expect(result.frost).toBeGreaterThan(4);expect(result.chain).toBe(0);
  expect(result.picks.every(choice=>choice.category==='basic'&&!choice.id.startsWith('warrior-')&&!choice.id.startsWith('archer-'))).toBe(true);
});
