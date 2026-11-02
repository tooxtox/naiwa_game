import { test, expect } from '@playwright/test';

const read = page => page.evaluate(() => {
  const s=window.__LUMENFALL__.scene.getScene('Game'),p=s.player,b=s.waves?.boss;
  if(!s.scene.isActive()||!p?.body)return {mode:'loading'};
  return {mode:s.mode,clock:s.clock,wave:s.waves.wave,remaining:s.waves.alive.length,nextWaveAt:s.waves.nextWaveAt,health:p.health,x:p.x,y:p.y,seed:s.stats.seed,kills:s.stats.kills,claimed:s.rewardRoom?.claimed??false,boss:b?{name:b.bossName,wave:b.bossWave,health:b.health,maxHealth:b.maxHealth,damage:b.damage,phase:b.bossPhase,state:b.state,castUntil:b.castUntil,skill:b.skill,texture:b.visual.texture.key}:null};
});
async function start(page) {
  await page.goto('/');await page.getByTestId('class-warrior').click();await page.getByTestId('start').click();
  await expect.poll(async()=>(await read(page)).mode).toBe('playing');
}
async function spawnBoss(page,wave) {
  await page.evaluate(w=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.player.body.reset(960,640);
    s.player.stats.maxHealth=2000;s.player.health=2000;s.player.invulnerableUntil=0;
    s.waves.wave=w-1;s.waves.start(960,640);s.stats.wave=w;
    s.waves.boss.body.reset(1240,640);
  },wave);
  await expect.poll(async()=>(await read(page)).boss?.wave).toBe(wave);
}
async function damageBossTo(page,fraction) {
  return page.evaluate(targetFraction=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),b=s.waves.boss;
    if(!b)throw new Error('Boss missing before real combat fixture');
    s.player.invulnerableUntil=s.clock+600000;s.player.body.reset(960,640);
    for(let swing=0;swing<4000&&b.active&&b.health>b.maxHealth*targetFraction;swing++){
      b.body.reset(1040,640);s.combat.attack([b],s.clock);
    }
    return {health:b.health,maxHealth:b.maxHealth,active:b.active};
  },fraction);
}
async function advanceWave(page) {
  const wave=(await read(page)).wave;
  await expect.poll(async()=>(await read(page)).nextWaveAt).toBeGreaterThan(0);
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.waves.nextWaveAt=s.clock;});
  await expect.poll(async()=>(await read(page)).wave).toBe(wave+1);
}

// Observe the real wind-up, then the live physics bodies fired into the clear central aisle.
test('ranged enemies telegraph and fire an aimed three-projectile fan',async({page})=>{
  await start(page);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.player.body.reset(960,640);s.player.invulnerableUntil=s.clock+600000;
    s.waves.alive.forEach(e=>{if(e.kind==='ranged'){e.body.reset(1260,640);e.windupUntil=0;e.nextAttack=0;}else e.stun(s.clock,600000);});
  });
  const bullets=()=>page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').combat.bullets.getChildren().filter(b=>b.active).map(b=>({vx:b.body.velocity.x,vy:b.body.velocity.y})));
  await expect.poll(async()=>(await bullets()).length,{timeout:2000}).toBe(3);
  const fan=await bullets();expect(fan.every(b=>b.vx<0)).toBe(true);
  expect(fan.filter(b=>Math.abs(b.vy)<1)).toHaveLength(1);expect(fan.some(b=>b.vy>20)).toBe(true);expect(fan.some(b=>b.vy< -20)).toBe(true);
});

for(const wave of [10,20,30,40,50]) {
  test(`wave ${wave}: a real guardian attacks, takes damage and changes phase before the campaign continues`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await start(page);await spawnBoss(page,wave);
    const initial=await read(page);expect(initial.remaining).toBe(1);expect(initial.boss.phase).toBe(1);expect(initial.boss.health).toBe(initial.boss.maxHealth);
    const bossStats={10:{health:3000,damage:29},20:{health:7000,damage:44},30:{health:14000,damage:59},40:{health:28000,damage:74},50:{health:100000,damage:90}};
    expect(initial.boss.maxHealth).toBe(bossStats[wave].health);expect(initial.boss.damage).toBe(bossStats[wave].damage);
    await expect.poll(async()=>{const r=await read(page);return !!r.boss&&r.boss.castUntil>r.clock;},{timeout:1500}).toBe(true);
    const telegraph=await read(page);
    // A normal attack must hurt the guardian without cancelling its already visible wind-up.
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.body.reset(s.waves.boss.x-80,s.waves.boss.y);});
    await page.keyboard.down('KeyJ');await page.waitForTimeout(70);await page.keyboard.up('KeyJ');
    const hit=await read(page);expect(hit.boss.health).toBeLessThan(initial.boss.health);expect(hit.boss.castUntil).toBe(telegraph.boss.castUntil);
    await expect.poll(async()=>(await read(page)).health,{timeout:3500}).toBeLessThan(initial.health);
    const phaseTwo=await damageBossTo(page,.48);expect(phaseTwo.health).toBeGreaterThan(0);
    await expect.poll(async()=>(await read(page)).boss?.phase).toBe(2);
    if(wave===50){const phaseThree=await damageBossTo(page,.23);expect(phaseThree.health).toBeGreaterThan(0);await expect.poll(async()=>(await read(page)).boss?.phase).toBe(3);}
    await page.screenshot({path:`artifacts/guardian-${wave}-phase.png`});
    const defeated=await damageBossTo(page,0);expect(defeated.active).toBe(false);
    if(wave<50) {
      await advanceWave(page);const next=await read(page);expect(next.mode).toBe('playing');expect(next.boss).toBeNull();expect(next.remaining).toBeGreaterThan(1);
      const grown=await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').waves.alive.map(e=>({kind:e.kind,health:e.maxHealth,damage:e.damage})));
      for(const e of grown){const w=wave+1,m=w-1,pressure=Math.max(0,w-35),base={melee:56,ranged:46,elite:172}[e.kind],baseDamage={melee:12,ranged:10,elite:19}[e.kind];expect(e.health).toBe(Math.round(base*(1+.16*m+.025*m**1.5+.004*pressure**2)));expect(e.damage).toBe(Math.round(baseDamage*(1+.1*m+.00025*pressure**2)));}
    } else {
      await expect.poll(async()=>(await read(page)).mode).toBe('reward');
      const reward=await read(page);expect(reward.wave).toBe(50);expect(reward.remaining).toBe(0);expect(reward.claimed).toBe(false);
      const cannotStart=await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return {started:s.waves.start(s.player.x,s.player.y),wave:s.waves.wave};});
      expect(cannotStart).toEqual({started:false,wave:50});
      await page.keyboard.down('KeyD');await page.waitForTimeout(140);await page.keyboard.up('KeyD');
      expect((await read(page)).x).toBeGreaterThan(reward.x+15);
      await expect(page.getByTestId('claim-reward')).toBeVisible();await page.getByTestId('claim-reward').click();
      await expect(page.getByTestId('victory')).toBeVisible();const claimed=await read(page);expect(claimed.mode).toBe('victory');expect(claimed.claimed).toBe(true);
      await expect(page.getByTestId('run-medal')).toBeVisible();await expect(page.getByTestId('claim-reward')).toBeDisabled();
      await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').claimReward());
      expect(await page.getByTestId('run-medal').count()).toBe(1);expect((await read(page)).wave).toBe(50);
      await page.getByTestId('restart').click();await expect.poll(async()=>(await read(page)).mode).toBe('playing');
      const restarted=await read(page);expect(restarted.wave).toBe(1);expect(restarted.claimed).toBe(false);expect(restarted.health).toBe(125);expect(restarted.seed).not.toBe(initial.seed);
    }
    expect(errors).toEqual([]);
  });
}

test('late regular waves retain extra pressure after wave 35 and smooth growth across the first guardian',async({page})=>{
  await start(page);
  const samples=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');return [9,11,34,36,49].map(wave=>{
      s.waves.wave=wave-1;s.waves.start(960,640);return {wave,enemies:s.waves.alive.map(e=>({kind:e.kind,hp:e.maxHealth,damage:e.damage}))};
    });
  });
  for(const sample of samples)for(const enemy of sample.enemies){const n=sample.wave-1,a=Math.max(0,sample.wave-35),hp={melee:56,ranged:46,elite:172}[enemy.kind],damage={melee:12,ranged:10,elite:19}[enemy.kind];expect(enemy.hp).toBe(Math.round(hp*(1+.16*n+.025*n**1.5+.004*a*a)));expect(enemy.damage).toBe(Math.round(damage*(1+.1*n+.00025*a*a)));if(sample.wave>=49){expect(enemy.hp).toBeGreaterThan(Math.round(hp*(1+.16*n+.025*n**1.5)));expect(enemy.damage).toBeGreaterThanOrEqual(Math.round(damage*(1+.1*n)));if(enemy.kind==='elite')expect(enemy.damage).toBeGreaterThan(Math.round(damage*(1+.1*n)));}}
  const early=samples[0].enemies.find(e=>e.kind==='melee'),after=samples[1].enemies.find(e=>e.kind==='melee');expect(after.hp/early.hp).toBeLessThan(1.2);
});

test('reward room: approaching the real chest claims the medal once, pauses safely and returns to the menu',async({page})=>{
  await start(page);await spawnBoss(page,50);await damageBossTo(page,0);
  await expect.poll(async()=>(await read(page)).mode).toBe('reward');
  const entered=await read(page);await page.waitForTimeout(100);expect((await read(page)).clock).toBe(entered.clock);
  await page.keyboard.press('Escape');await expect(page.getByTestId('resume')).toBeVisible();expect((await read(page)).mode).toBe('paused');
  await page.getByTestId('resume').click();await expect.poll(async()=>(await read(page)).mode).toBe('reward');
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game'),chest=s.rewardRoom.chest;s.player.body.reset(chest.x,chest.y+125);});
  await page.keyboard.down('KeyW');await expect(page.getByTestId('victory')).toBeVisible();await page.keyboard.up('KeyW');
  const claimed=await read(page);expect(claimed.claimed).toBe(true);expect(claimed.mode).toBe('victory');expect(claimed.clock).toBe(entered.clock);
  const claimedAt=await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').rewardClaimedAt);
  expect(claimedAt).toBeGreaterThan(0);await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').claimReward());
  expect(await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').rewardClaimedAt)).toBe(claimedAt);
  await expect(page.getByTestId('run-medal')).toHaveCount(1);
  await page.getByTestId('menu').click();await expect(page.getByTestId('start')).toBeVisible();
});
