import { test, expect } from '@playwright/test';

async function modules(page) {
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>Boolean(window.__LUMENFALL__))).toBe(true);
}
async function start(page,classId='warrior') {
  await modules(page);await page.getByTestId(`class-${classId}`).click();await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>{
    const s=window.__LUMENFALL__?.scene.getScene('Game');return s?.mode==='playing'&&Boolean(s.player?.body);
  })).toBe(true);
}

test('rolling combat budgets cap same-frame swarms, keep pause free and do not double-credit at a second boundary',async({page})=>{
  await modules(page);
  const result=await page.evaluate(async()=>{
    const {RollingCombatBudget,lifeStealBudget}=await import('/src/game/systems/CombatBalance.ts');
    const budget=new RollingCombatBudget(),values=[];
    for(let i=0;i<20;i++)values.push(budget.take(999,3,12,500));
    const sameClock=budget.take(999,3,12,500),beforeExpiry=budget.take(1498,3,12,500),afterExpiry=budget.take(1499,3,12,500);
    budget.clear();return {total:values.reduce((sum,n)=>sum+n,0),sameClock,beforeExpiry,afterExpiry,reset:budget.take(1499,3,12,500),heal:lifeStealBudget(125,10),weakHeal:lifeStealBudget(500,2)};
  });
  expect(result).toEqual({total:12,sameClock:0,beforeExpiry:0,afterExpiry:3,reset:3,heal:15,weakHeal:10});
});

test('an ultimate budget is shared by all pulses, per boss, integer-safe and allows flat broken damage',async({page})=>{
  await modules(page);
  const result=await page.evaluate(async()=>{
    const {BossCastBudget}=await import('/src/game/systems/CombatBalance.ts');const budget=new BossCastBudget(),a={},b={};
    let damage=0;for(let i=0;i<99;i++){const part=budget.take(a,100000,9000,4000,1.35);damage+=Math.round(part.fixed*1.35+part.healthDamage);}
    const other=budget.take(b,100000,100,6000,1.35),full=budget.take(a,100000,100,100);
    return {damage,other:Math.round(other.fixed*1.35+other.healthDamage),full};
  });
  expect(result.damage).toBe(42000);expect(result.other).toBe(6135);expect(result.full).toEqual({fixed:0,healthDamage:0});
});

test('published balance snapshots expose all six routes at early/middle/late and separate theory from legacy risk',async({page})=>{
  await modules(page);
  const result=await page.evaluate(async()=>{
    const {theoreticalBalanceReport,ultimateTheory,balanceStats}=await import('/src/game/systems/BalanceEvaluation.ts');
    const report=theoreticalBalanceReport();const late=balanceStats('mage','late');
    return {kind:report.kind,rows:report.rows,legacy:ultimateTheory('mage',late,100000,true,true),current:ultimateTheory('mage',late,100000,true)};
  });
  expect(result.kind).toBe('analytical-scenario-estimates');expect(result.rows).toHaveLength(54);
  expect(new Set(result.rows.map(r=>r.core)).size).toBe(6);expect(new Set(result.rows.map(r=>r.stage)).size).toBe(3);
  expect(result.legacy).toBeGreaterThan(result.current);expect(result.current).toBeLessThanOrEqual(42000);
  for(const row of result.rows){expect(row.theory.singleDps).toBeGreaterThan(0);expect(row.theory.chargePerSecond).toBeLessThanOrEqual(24);expect(row.theory.leechPerSecond).toBeLessThanOrEqual(row.stats.maxHealth*.12);}
});

for(const classId of ['warrior','mage','archer']) {
  test(`${classId}: real broken boss ultimate remains bounded even with extreme finality and every pulse/arrow landing`,async({page})=>{
    await start(page,classId);
    const result=await page.evaluate(async()=>{
      const s=window.__LUMENFALL__.scene.getScene('Game');
      s.scene.pause();s.physics.pause();s.combat.clear();s.waves.enemies.forEach(e=>e.active&&e.destroy());
      s.player.body.reset(960,640);s.player.stats.damage=100;s.player.stats.ultimateMultiplier=20;
      s.waves.wave=49;s.waves.start(960,640);const b=s.waves.boss;b.body.reset(1050,640);
      // Independent 100k damage-boundary fixture; authored campaign HP may vary.
      b.health=b.maxHealth=100000;b.damageToughness(b.maxToughness,1000);
      s.combat.ultimate([b],1000);for(let now=1000;now<=2400;now+=16)s.combat.tick(now,[b]);
      return {damage:b.maxHealth-b.health,health:b.health,charge:s.player.ultimateCharge,alive:b.active,toughness:b.toughness};
    });
    expect(result.damage).toBe(42000);expect(result.health).toBe(58000);expect(result.alive).toBe(true);expect(result.charge).toBe(0);
  });
}

test('real melee swarm cannot create unbounded lifesteal or charge, and damage stats exclude overkill',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts');const s=window.__LUMENFALL__.scene.getScene('Game');
    s.scene.pause();s.physics.pause();s.combat.clear();s.waves.enemies.forEach(e=>e.active&&e.destroy());s.waves.enemies=[];
    s.player.body.reset(960,640);s.player.health=10;s.player.stats.lifeSteal=10;s.player.stats.critChance=0;s.player.ultimateCharge=0;s.player.attackAngle=0;
    const enemies=Array.from({length:20},(_,i)=>{const e=new Enemy(s,1010+i%4,640,'melee',1,s.waves.nav);e.health=e.maxHealth=10000;return e;});
    s.waves.enemies=enemies;s.combat.acquireTarget(enemies,1000);s.combat.melee(enemies,1000);
    const first={heal:s.player.health-10,charge:s.player.ultimateCharge};
    s.combat.melee(enemies,1001);const immediate={heal:s.player.health-10,charge:s.player.ultimateCharge};
    let reported=0;s.events.on('combat-resolved-hit',e=>reported+=e.damage);
    const victim=enemies[0];victim.health=2;s.combat.onKill=()=>{};
    s.combat.damageEnemy(victim,999999,0,1002,false,'build');
    return {first,immediate,reported};
  });
  expect(result.first).toEqual({heal:15,charge:12});expect(result.immediate).toEqual(result.first);expect(result.reported).toBe(2);
});

test('real perfect counter keeps boss percentage fixed during break; ordinary death does not inflate prevention',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');
    s.scene.pause();s.physics.pause();s.combat.clear();s.waves.enemies.forEach(e=>e.active&&e.destroy());
    s.waves.wave=49;s.waves.start(960,640);const b=s.waves.boss;b.body.reset(1050,640);b.health=b.maxHealth=100000;s.player.stats.damage=100;
    b.damageToughness(b.maxToughness,1000);s.combat.counterHit(b,1000,true);
    const counterDamage=b.maxHealth-b.health,defense=[];s.events.on('combat-resolved-defense',e=>defense.push(e));
    s.combat.onDamage=()=>{};s.player.health=3;s.player.invulnerableUntil=0;s.player.guardUntil=0;s.combat.hurt(100,b.x,1001,b.y,b);
    return {counterDamage,defense};
  });
  expect(result.counterDamage).toBe(6216);expect(result.defense).toEqual([{damage:3,prevented:0,result:'dead'}]);
});

test('seeded engine harness reproduces both current and legacy multishot through real hit paths',async({page})=>{
  await start(page,'archer');
  const result=await page.evaluate(async()=>{
    const {runEngineBalance}=await import('/src/game/systems/BalanceHarness.ts');const s=window.__LUMENFALL__.scene.getScene('Game');s.scene.pause();s.physics.pause();
    const options={classId:'archer',stage:'late',core:'archer-overpierce',rank:3,formation:'single',duration:6000};
    const first=runEngineBalance(s,options),second=runEngineBalance(s,options),legacy=runEngineBalance(s,{...options,legacyMultishot:true});
    return {first,second,legacy};
  });
  expect(result.first).toEqual(result.second);expect(result.first.damage).toBeGreaterThan(0);expect(result.legacy.damage).toBeGreaterThan(result.first.damage*1.25);
  expect(result.first.firstChargeMs).toEqual(result.legacy.firstChargeMs);expect(result.first.note).toContain('not human playtime');
});

test('max combined pierce/ricochet never repeats a victim and bounded chain queue expires after clear',async({page})=>{
  await start(page,'archer');
  const result=await page.evaluate(async()=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts');const s=window.__LUMENFALL__.scene.getScene('Game');
    s.scene.pause();s.physics.pause();s.combat.clear();s.waves.enemies.forEach(e=>e.active&&e.destroy());
    s.player.body.reset(960,640);s.player.stats.critChance=0;s.player.stats.projectileCount=1;s.player.stats.pierceCount=4;
    for(let i=0;i<3;i++){s.upgrades.build.learnCore('archer-overpierce');s.upgrades.build.learnCore('archer-ricochet');}
    for(let i=0;i<8;i++){s.upgrades.build.learnSupport('archer-spine');s.upgrades.build.learnSupport('archer-bounce-charge');}
    const enemies=Array.from({length:10},(_,i)=>{const e=new Enemy(s,1040+i*65,640,'melee',1,s.waves.nav);e.health=e.maxHealth=100000;e.fixtureHits=[];const hit=e.hit.bind(e);e.hit=(amount,...rest)=>{e.fixtureHits.push(amount);return hit(amount,...rest);};return e;});
    s.waves.enemies=enemies;s.combat.attack(enemies,1000);for(let now=1000;now<5000;now+=16)s.combat.tick(now,enemies);
    const hits=enemies.map(e=>e.fixtureHits),pool=s.combat.projectiles.length;s.combat.clear();
    return {hits,pool,active:s.combat.projectiles.filter(p=>p.active).length,chains:s.combat.chains.length};
  });
  expect(result.hits.filter(h=>h.length).length).toBeLessThanOrEqual(8);expect(result.hits.every(h=>h.length<=1)).toBe(true);
  expect(result.hits.flat().every(d=>d<=60)).toBe(true);expect(result.pool).toBe(64);expect(result.active).toBe(0);expect(result.chains).toBe(0);
});
