import { test, expect } from '@playwright/test';

async function start(page,classId,cores,points) {
  await page.goto('/');await page.getByTestId(`class-${classId}`).click();await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>{
    const s=window.__LUMENFALL__?.scene.getScene('Game');return Boolean(s?.scene.isActive()&&s.player?.body&&s.combat?.build&&s.mode==='playing');
  })).toBe(true);
  await page.evaluate(async({cores,points})=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts');const s=window.__LUMENFALL__.scene.getScene('Game');
    s.combat.clear();s.waves.enemies.forEach(e=>e.active&&e.destroy());s.waves.enemies=[];
    s.player.body.reset(960,640);s.player.stats.critChance=0;s.player.invulnerableUntil=0;s.player.nextAttack=0;
    cores.forEach(id=>s.upgrades.build.learnCore(id));s.combat.build=s.upgrades.build;
    window.buildFixtures=points.map(([x,y])=>{
      const e=new Enemy(s,x,y,'melee',1,s.waves.nav);e.health=e.maxHealth=5000;e.fixtureHits=[];
      // Only enemy movement/AI is fixed: all inputs, collisions, projectile travel,
      // damage, build effects and hit callbacks remain the real game systems.
      e.tick=()=>{if(!e.active)return;e.body.reset(x,y);e.setVelocity(0);e.visual.setPosition(x,y);};
      const hit=e.hit.bind(e);e.hit=(amount,angle,now)=>{e.fixtureHits.push({amount,now});return hit(amount,angle,now);};
      s.waves.enemies.push(e);return e;
    });
  },{cores,points});
}
const read=page=>page.evaluate(()=>{
  const s=window.__LUMENFALL__.scene.getScene('Game');
  return {clock:s.clock,mode:s.mode,health:s.player.health,guard:s.player.lastDamageResult,buff:s.upgrades.build.attackMultiplier(s.clock),enemies:window.buildFixtures.map(e=>({health:e.health,hits:e.fixtureHits,stunUntil:e.stunUntil,slowUntil:e.slowUntil,slowMultiplier:e.slowMultiplier})),projectiles:s.combat.projectiles.filter(p=>p.active).length,chains:s.combat.chains.length};
});
async function shot(page) {await page.keyboard.down('KeyJ');await page.waitForTimeout(45);await page.keyboard.up('KeyJ');}

test('real counter build: a Space parry against an owned physical projectile empowers the next J attack',async({page})=>{
  await start(page,'warrior',['warrior-counter'],[[1050,640]]);
  await page.keyboard.press('Space');
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.fire(window.buildFixtures[0],0,s.clock);
    const b=s.combat.bullets.getChildren().find(b=>b.active);b.body.reset(s.player.body.center.x+20,s.player.body.center.y);b.setVelocity(-220,0);
  });
  await expect.poll(async()=>(await read(page)).guard).toBe('parried');
  const parried=await read(page);expect(parried.health).toBe(125);expect(parried.buff).toBeGreaterThan(1);expect(parried.enemies[0].hits.length).toBe(1);expect(parried.enemies[0].hits[0].amount).toBeGreaterThan(30);
  await page.waitForTimeout(740);await shot(page);
  await expect.poll(async()=>(await read(page)).enemies[0].hits.length).toBe(2);
  expect((await read(page)).enemies[0].hits[1].amount).toBe(Math.round(30*parried.buff));
});

test('real whirlwind build: repeated J hits trigger a finite extra ring without recursively charging itself',async({page})=>{
  await start(page,'warrior',['warrior-whirlwind'],[[1050,640]]);
  await page.evaluate(()=>{window.__LUMENFALL__.scene.getScene('Game').player.stats.attackCooldown=100;});
  await page.keyboard.down('KeyJ');
  await expect.poll(async()=>(await read(page)).enemies[0].hits.some(hit=>hit.amount===44)).toBe(true);
  await page.keyboard.up('KeyJ');const result=await read(page);
  const rings=result.enemies[0].hits.filter(hit=>hit.amount===44).length;
  const normalHits=result.enemies[0].hits.length-rings;
  expect(normalHits).toBeGreaterThanOrEqual(9);expect(rings).toBe(Math.floor(normalHits/9));
  await page.waitForTimeout(250);expect((await read(page)).enemies[0].hits.length).toBe(result.enemies[0].hits.length);
});

test('real frost build: successive mage projectiles stack frost, freeze once, and respect immunity',async({page})=>{
  await start(page,'mage',['mage-freeze'],[[1060,640]]);
  await page.evaluate(()=>{window.__LUMENFALL__.scene.getScene('Game').player.stats.attackCooldown=100;});
  await page.keyboard.down('KeyJ');
  await expect.poll(async()=>{const r=await read(page);return r.enemies[0].stunUntil>r.clock;}).toBe(true);
  const frozen=await read(page);expect(frozen.enemies[0].hits.length).toBeGreaterThanOrEqual(3);expect(frozen.enemies[0].slowMultiplier).toBeLessThanOrEqual(.65);
  await page.waitForTimeout(450);await page.keyboard.up('KeyJ');const later=await read(page);
  expect(later.enemies[0].hits.length).toBeGreaterThan(frozen.enemies[0].hits.length);expect(later.enemies[0].stunUntil).toBe(frozen.enemies[0].stunUntil);
});

test('real chain build: one mage explosion jumps twice, decays, never repeats a victim, and clears its queue',async({page})=>{
  await start(page,'mage',['mage-chain'],[[1060,640],[1150,640],[1240,640],[1370,640]]);
  await shot(page);await expect.poll(async()=>(await read(page)).enemies[2].hits.length).toBe(1);
  const result=await read(page);expect(result.enemies.map(e=>e.hits.map(hit=>hit.amount))).toEqual([[24],[11],[5],[]]);
  expect(result.chains).toBe(0);await page.waitForTimeout(250);expect((await read(page)).enemies.map(e=>e.hits.length)).toEqual([1,1,1,0]);
});

test('real pierce build: core grants a second hit and increases subsequent damage on the same arrow',async({page})=>{
  await start(page,'archer',['archer-overpierce'],[[1060,640],[1140,640],[1220,640]]);
  await shot(page);await expect.poll(async()=>(await read(page)).enemies[1].hits.length).toBe(1);
  const result=await read(page);expect(result.enemies.map(e=>e.hits.map(hit=>hit.amount))).toEqual([[20],[24],[]]);
  await page.waitForTimeout(250);expect((await read(page)).enemies.map(e=>e.hits.length)).toEqual([1,1,0]);
});

test('real ricochet build: one arrow turns through distinct victims and stops at its bounce cap',async({page})=>{
  await start(page,'archer',['archer-ricochet','archer-ricochet'],[[1060,640],[1140,680],[1220,640],[1320,680]]);
  await shot(page);await expect.poll(async()=>(await read(page)).enemies[2].hits.length).toBe(1);
  const result=await read(page);expect(result.enemies.map(e=>e.hits.map(hit=>hit.amount))).toEqual([[20],[14],[10],[]]);
  await page.waitForTimeout(300);expect((await read(page)).enemies.map(e=>e.hits.length)).toEqual([1,1,1,0]);expect((await read(page)).projectiles).toBe(0);
});

test('build lifecycle: pause freezes shots and core timers; clear releases pools and cancels queued damage',async({page})=>{
  await start(page,'mage',['mage-chain'],[[1160,640],[1250,640],[1340,640]]);
  await shot(page);await page.keyboard.press('Escape');await expect.poll(async()=>(await read(page)).mode).toBe('paused');
  const paused=await read(page);expect(paused.projectiles).toBe(1);await page.waitForTimeout(250);expect(await read(page)).toEqual(paused);
  await page.getByTestId('resume').click();await expect.poll(async()=>(await read(page)).enemies[0].hits.length).toBe(1);
  const afterClear=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();
    return {projectiles:s.combat.projectiles.filter(p=>p.active).length,chains:s.combat.chains.length,bullets:s.combat.bullets.getChildren().filter(b=>b.active).length,hits:window.buildFixtures.map(e=>e.fixtureHits.length)};
  });
  expect(afterClear.projectiles).toBe(0);expect(afterClear.chains).toBe(0);expect(afterClear.bullets).toBe(0);
  await page.waitForTimeout(400);expect((await read(page)).enemies.map(e=>e.hits.length)).toEqual(afterClear.hits);
});
