import { test, expect } from '@playwright/test';

const read = page => page.evaluate(() => {
  const s=window.__LUMENFALL__.scene.getScene('Game');
  if(!s.scene.isActive()||!s.player?.body)return {mode:'loading'};
  return {mode:s.mode,clock:s.clock,kills:s.stats.kills,count:s.upgrades.count,recordedUpgrades:s.stats.upgrades,automatic:s.upgrades.automatic,nextAt:s.upgrades.nextAt,stats:{...s.player.stats},attack:s.controls.attackHeld,seed:s.stats.seed,health:s.player.health,invulnerableUntil:s.player.invulnerableUntil,wave:s.waves.wave,remaining:s.waves.alive.length,nextWaveAt:s.waves.nextWaveAt};
});
async function start(page) {
  await page.goto('/');await page.getByTestId('class-warrior').click();await page.getByTestId('start').click();
  await expect.poll(async()=>(await read(page)).mode).toBe('playing');
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=s.clock+600000;
    s.waves.alive.forEach((e,i)=>{e.body.reset(1610,640+i*45);e.stun(s.clock,600000);});
  });
}

// Real actors and the real combat damage/kill callback avoid manufacturing upgrade counts.
// Their low first-wave HP keeps these progression tests independent of late-wave combat balance.
async function defeatFixtures(page,count) {
  return page.evaluate(async quantity=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts');
    const s=window.__LUMENFALL__.scene.getScene('Game');s.player.body.reset(960,640);
    const spawned=[];
    for(let i=0;i<quantity;i++) {
      const enemy=new Enemy(s,1040+(i%5)*3,640+Math.floor(i/5)*3,'melee',1,s.waves.nav);
      enemy.stun(s.clock,600000);s.waves.enemies.push(enemy);spawned.push(enemy);
    }
    for(let swing=0;swing<4&&spawned.some(e=>e.active);swing++)s.combat.attack(spawned,s.clock);
    return spawned.filter(e=>!e.active).length;
  },count);
}


// Exact-size wave fixtures make each of the first ten earned choices observable,
// while real actors, damage and wave completion still drive the game transition.
async function prepareWaveFixtures(page,count) {
  await page.evaluate(async quantity=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts');
    const s=window.__LUMENFALL__.scene.getScene('Game');
    s.waves.enemies.forEach(e=>e.active&&e.destroy());s.waves.enemies=[];s.player.body.reset(960,640);
    for(let i=0;i<quantity;i++) {
      const e=new Enemy(s,1040+(i%5)*3,640+Math.floor(i/5)*3,'melee',1,s.waves.nav);
      e.stun(s.clock,600000);s.waves.enemies.push(e);
    }
  },count);
}
async function defeatCurrentWave(page) {
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.player.body.reset(960,640);
    s.waves.alive.forEach((e,i)=>{e.body.reset(1040+(i%5)*3,640+Math.floor(i/5)*3);e.stun(s.clock,600000);});
    for(let swing=0;swing<80&&s.waves.alive.length;swing++)s.combat.attack(s.waves.enemies,s.clock);
  });
  await expect.poll(async()=>(await read(page)).remaining).toBe(0);
}
async function advanceWave(page) {
  const wave=(await read(page)).wave;
  await expect.poll(async()=>(await read(page)).nextWaveAt).toBeGreaterThan(0);
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.waves.nextWaveAt=s.clock;});
  await expect.poll(async()=>(await read(page)).wave).toBe(wave+1);
}

// Only secondary cases accelerate setup. Every choice still goes through the public
// candidate validation, cap checks and stat application; the main case uses all ten UI choices.
async function finishManualSetup(page) {
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');
    while(s.upgrades.count<10) {
      const choices=s.upgrades.choices(s.player.stats);
      if(!choices.length||!s.upgrades.choose(choices[0].id,s.player.stats))throw new Error('Legal manual setup failed');
    }
    s.stats.upgrades=s.upgrades.count;s.stats.kills=s.upgrades.nextAt-1;
  });
}

test('progression: first ten rewards are chosen after clearing their wave; later bonuses preserve live combat and restart resets manual choices',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page);const initial=await read(page);
  expect(initial.count).toBe(0);expect(initial.automatic).toBe(false);
  for(let earned=1;earned<=10;earned++) {
    const before=await read(page),needed=before.nextAt-before.kills;expect(needed).toBeGreaterThan(0);
    await prepareWaveFixtures(page,needed);await defeatCurrentWave(page);
    await expect(page.locator('.upgrade-dialog')).toBeVisible();await expect(page.locator('.upgrade-card')).toHaveCount(3);
    const choosing=await read(page);expect(choosing.count).toBe(earned-1);expect(choosing.mode).toBe('upgrade');
    await page.waitForTimeout(80);expect((await read(page)).clock).toBe(choosing.clock);
    await page.locator('.upgrade-card').first().click();
    await expect.poll(async()=>(await read(page)).count).toBe(earned);
    const selected=await read(page);expect(selected.stats).not.toEqual(choosing.stats);expect(selected.recordedUpgrades).toBe(earned);expect(selected.mode).toBe('playing');
    expect(selected.automatic).toBe(earned===10);
    await advanceWave(page);
  }
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=s.clock+5000;});
  await page.keyboard.down('KeyJ');
  for(const earned of [11,12]) {
    const before=await read(page),needed=before.nextAt-before.kills;
    await prepareWaveFixtures(page,needed);await defeatCurrentWave(page);
    await expect.poll(async()=>(await read(page)).count).toBe(earned);
    const after=await read(page);expect(after.mode).toBe('playing');expect(after.attack).toBe(true);expect(after.stats).not.toEqual(before.stats);expect(after.recordedUpgrades).toBe(earned);expect(after.invulnerableUntil).toBeGreaterThanOrEqual(before.invulnerableUntil);
    await expect(page.locator('.upgrade-dialog')).toHaveCount(0);await expect(page.locator('.upgrade-card')).toHaveCount(0);
    const barrage=page.getByTestId('auto-upgrade-barrage');
    const message=barrage.locator(`[data-upgrade-count="${earned}"]`);await expect(message).toBeVisible();
    expect(await message.getAttribute('data-upgrade-id')).toBeTruthy();
    await expect(page.locator('[data-field="upgradeMode"]')).toContainText('自动加成');
    await page.waitForTimeout(100);const ongoing=await read(page);expect(ongoing.clock).toBeGreaterThan(after.clock);expect(ongoing.attack).toBe(true);expect(ongoing.count).toBe(earned);
    if(earned===11)await advanceWave(page);
  }
  await page.screenshot({path:'artifacts/progression-auto-barrage.png'});
  await page.keyboard.up('KeyJ');
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=0;s.combat.hurt(9999,s.player.x+20,s.clock);});
  await expect(page.locator('.death-dialog')).toBeVisible();await page.getByTestId('restart').click();
  await expect.poll(async()=>(await read(page)).mode).toBe('playing');
  const restarted=await read(page);expect(restarted.count).toBe(0);expect(restarted.recordedUpgrades).toBe(0);expect(restarted.automatic).toBe(false);expect(restarted.stats).toEqual(initial.stats);expect(restarted.seed).not.toBe(initial.seed);
  const needed=restarted.nextAt-restarted.kills;await prepareWaveFixtures(page,needed);await defeatCurrentWave(page);
  await expect(page.locator('.upgrade-dialog')).toBeVisible();expect((await read(page)).count).toBe(0);expect(errors).toEqual([]);
});

test('progression: one multi-kill can earn successive manual choices, and a later multi-kill consumes all automatic thresholds',async({page})=>{
  await start(page);
  // Nine kills in one real Q cast cross both the four-kill and nine-kill boundaries.
  await page.evaluate(async()=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts');const s=window.__LUMENFALL__.scene.getScene('Game');
    for(let i=0;i<9;i++){const e=new Enemy(s,1040+i*2,640,'melee',1,s.waves.nav);e.stun(s.clock,600000);s.waves.enemies.push(e);}
    s.player.addUltimateCharge(100);
  });
  await page.keyboard.press('KeyQ');
  await expect.poll(async()=>(await read(page)).kills).toBe(9);
  // Four original enemies still live: passing two thresholds must not interrupt this fight.
  expect((await read(page)).remaining).toBe(4);expect((await read(page)).mode).toBe('playing');
  await expect(page.locator('.upgrade-dialog')).toHaveCount(0);
  const fighting=await read(page);await page.waitForTimeout(100);expect((await read(page)).clock).toBeGreaterThan(fighting.clock);
  await defeatCurrentWave(page);await expect(page.locator('.upgrade-dialog')).toBeVisible();
  expect((await read(page)).count).toBe(0);
  await page.locator('.upgrade-card').first().click();
  await expect.poll(async()=>(await read(page)).count).toBe(1);
  expect((await read(page)).mode).toBe('upgrade');await expect(page.locator('.upgrade-card')).toHaveCount(3);
  const second=await read(page);await page.waitForTimeout(80);expect((await read(page)).clock).toBe(second.clock);
  await page.locator('.upgrade-card').first().click();await expect.poll(async()=>(await read(page)).mode).toBe('playing');
  const selected=await read(page);expect(selected.count).toBe(2);expect(selected.kills).toBe(13);expect(selected.nextAt).toBe(14);
  await finishManualSetup(page);const before=await read(page);expect(before.count).toBe(10);expect(before.automatic).toBe(true);
  // Start one kill before the next threshold: 11 simultaneous kills owe three upgrades.
  expect(await defeatFixtures(page,11)).toBe(11);
  await expect.poll(async()=>(await read(page)).count).toBe(13);
  const after=await read(page);expect(after.recordedUpgrades).toBe(13);expect(after.kills).toBe(before.kills+11);expect(after.nextAt).toBe(before.nextAt+15);expect(after.mode).toBe('playing');expect(after.stats).not.toEqual(before.stats);
  await expect(page.locator('.upgrade-dialog')).toHaveCount(0);
  for(const count of [11,12,13])await expect(page.getByTestId('auto-upgrade-barrage').locator(`[data-upgrade-count="${count}"]`)).toBeVisible();
});

test('progression: paused and dead scenes cannot award automatic bonuses or show new reward messages',async({page})=>{
  await start(page);await finishManualSetup(page);
  // A life-steal fixture also catches late combat callbacks healing a dead hero.
  await page.evaluate(()=>{const p=window.__LUMENFALL__.scene.getScene('Game').player;p.stats.lifeSteal=Math.max(2,p.stats.lifeSteal);});
  await page.getByTestId('pause').click();const paused=await read(page);expect(paused.mode).toBe('paused');
  await defeatFixtures(page,1);await page.waitForTimeout(120);
  const frozen=await read(page);expect(frozen.mode).toBe('paused');expect(frozen.clock).toBe(paused.clock);expect(frozen.count).toBe(10);expect(frozen.kills).toBe(paused.kills);expect(frozen.stats).toEqual(paused.stats);
  await expect(page.getByTestId('auto-upgrade-barrage').locator('[data-upgrade-count]')).toHaveCount(0);
  await page.getByTestId('resume').click();expect(await defeatFixtures(page,1)).toBe(1);
  await expect.poll(async()=>(await read(page)).count).toBe(11);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.stats.kills=s.upgrades.nextAt-1;
    s.player.invulnerableUntil=0;s.combat.hurt(9999,s.player.x+20,s.clock);
  });
  await expect(page.locator('.death-dialog')).toBeVisible();const dead=await read(page);
  await defeatFixtures(page,1);await page.waitForTimeout(120);
  const stillDead=await read(page);expect(stillDead.mode).toBe('dead');expect(stillDead.health).toBe(0);expect(stillDead.clock).toBe(dead.clock);expect(stillDead.count).toBe(dead.count);expect(stillDead.kills).toBe(dead.kills);expect(stillDead.stats).toEqual(dead.stats);
  await expect(page.getByTestId('auto-upgrade-barrage').locator('[data-upgrade-count="12"]')).toHaveCount(0);
});

test('progression: every blessing stops at five picks, maxed blessings leave the cards and the exhausted pool keeps the thresholds moving',async({page})=>{
  await start(page);
  // Leave a single blessing inside the pool so the cap can be observed through real card choices.
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');
    for(const id of ['vitality','haste','dash','speed','crit','warrior-range','warrior-leech','warrior-guard'])s.upgrades.levels.set(id,5);
  });
  for(let round=1;round<=5;round++) {
    const before=await read(page),needed=before.nextAt-before.kills;
    await prepareWaveFixtures(page,needed);await defeatCurrentWave(page);
    await expect(page.locator('.upgrade-dialog')).toBeVisible();
    await expect(page.locator('.upgrade-card')).toHaveCount(1);
    await expect(page.getByTestId('upgrade-power')).toBeVisible();
    await expect(page.locator('.upgrade-card .card-bottomline')).toContainText(`/ ${5}`);
    await page.getByTestId('upgrade-power').click();
    await expect.poll(async()=>(await read(page)).count).toBe(round);
    await advanceWave(page);
  }
  const after=await read(page);
  expect(after.count).toBe(5);
  expect(after.stats.damage).toBe(30+8*5);
  // The sixth reward has no blessing left: the dialog stays closed and the threshold still moves.
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),toast=s.hud.toast.bind(s.hud);window.capNotices=0;
    s.hud.toast=(message,...args)=>{if(message.includes('祝福已达上限'))window.capNotices++;toast(message,...args);};
  });
  const needed=after.nextAt-after.kills;
  await prepareWaveFixtures(page,needed+5);await defeatCurrentWave(page);
  await expect(page.locator('.upgrade-dialog')).toHaveCount(0);
  await expect(page.locator('.lumen-toast')).toContainText('祝福已达上限');
  const exhausted=await read(page);
  expect(exhausted.count).toBe(5);
  expect(exhausted.nextAt).toBe(after.nextAt+10);
  expect(await page.evaluate(()=>window.capNotices)).toBe(1);
  await advanceWave(page);await prepareWaveFixtures(page,5);await defeatCurrentWave(page);
  await expect.poll(async()=>(await read(page)).nextAt).toBe(after.nextAt+15);
  expect(await page.evaluate(()=>window.capNotices)).toBe(1);
});

test('difficulty: actual early and late regular waves gain smooth health across all enemy types',async({page})=>{
  await start(page);
  const samples=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),samples=[];
    for(let wave=1;wave<=30;wave++) {
      s.waves.enemies.forEach(e=>e.active&&e.destroy());s.waves.wave=wave-1;s.waves.start(960,640);
      samples.push({wave,enemies:s.waves.alive.map(e=>({kind:e.kind,health:e.health,maxHealth:e.maxHealth}))});
    }
    s.waves.enemies.forEach(e=>e.active&&e.destroy());s.waves.wave=98;s.waves.start(960,640);
    samples.push({wave:99,enemies:s.waves.alive.map(e=>({kind:e.kind,health:e.health,maxHealth:e.maxHealth}))});
    return samples;
  });
  const base={melee:56,ranged:46,elite:172}, previous={};
  const checkpoints={1:{melee:56,ranged:46},5:{melee:103,ranged:85,elite:316},10:{melee:174,ranged:143,elite:536},20:{melee:342,ranged:281,elite:1051},30:{melee:534,ranged:439,elite:1642}};
  for(const sample of samples) {
    expect(sample.enemies.length).toBeGreaterThanOrEqual(4);
    const values={};
    for(const enemy of sample.enemies) {
      const n=sample.wave-1,pressure=Math.max(0,sample.wave-35),expected=Math.round(base[enemy.kind]*(1+.16*n+.025*n**1.5+.004*pressure**2));
      expect(enemy.health).toBe(expected);expect(enemy.maxHealth).toBe(expected);values[enemy.kind]=enemy.maxHealth;
    }
    if(checkpoints[sample.wave])expect(values).toMatchObject(checkpoints[sample.wave]);
    for(const [kind,health] of Object.entries(values)) {
      if(previous[kind]) {expect(health).toBeGreaterThan(previous[kind]);if(sample.wave<=30)expect(health/previous[kind]).toBeLessThan(1.21);}
      previous[kind]=health;
    }
  }
  expect(previous.melee).toBeGreaterThan(534);expect(previous.ranged).toBeGreaterThan(439);expect(previous.elite).toBeGreaterThan(1642);
});
