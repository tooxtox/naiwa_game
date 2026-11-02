import { test, expect } from '@playwright/test';

const read = page => page.evaluate(() => {
  const s=window.__LUMENFALL__.scene.getScene('Game'),p=s.player;
  if(!s.scene.isActive()||!p?.body)return {mode:'loading'};
  return {mode:s.mode,clock:s.clock,health:p.health,result:p.lastDamageResult,charge:p.ultimateCharge,guardUntil:p.guardUntil,nextGuard:p.nextGuard,invulnerableUntil:p.invulnerableUntil,dashUntil:p.dashUntil,kills:s.stats.kills,upgrades:s.upgrades.count,wave:s.waves.wave,claimed:s.rewardRoom?.claimed??false,targets:(window.guardTargets??[]).map(e=>({kind:e.kind,boss:e.isBoss,health:e.health,maxHealth:e.maxHealth,active:e.active,x:e.x,y:e.y})),bullets:s.combat.bullets.getChildren().filter(b=>b.active).length};
});
async function start(page,classId) {
  await page.goto('/');await page.getByTestId(`class-${classId}`).click();await page.getByTestId('start').click();
  await expect.poll(async()=>(await read(page)).mode).toBe('playing');
}

// Real Enemy actors retain their own tick/hit/death paths. Only their starting
// locations and attack schedule are fixed, so the live Phaser collision and input
// paths decide whether a block succeeds.
async function fixtures(page,kind='melee',killable=false) {
  return page.evaluate(async({kind,killable})=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts');
    const {Boss}=await import('/src/game/entities/Boss.ts');
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();
    s.waves.enemies.forEach(e=>e.active&&e.destroy());s.waves.enemies=[];
    s.player.body.reset(960,640);s.player.invulnerableUntil=0;
    // Guaranteed critical chance and a huge attack stat must not amplify a counter.
    s.player.stats.critChance=1;s.player.stats.damage=99999;s.player.combo=3;
    const specs=killable?[[kind,1020,640],['melee',1760,1100],['ranged',250,180],['elite',1740,190]]:[[kind,1020,640],['ranged',1760,1100],['elite',250,180]];
    window.guardTargets=specs.map(([type,x,y])=>{
      const e=new Enemy(s,x,y,type,1,s.waves.nav);e.stun(s.clock,600000);
      if(killable)e.health=e.maxHealth*.5;
      s.waves.enemies.push(e);return e;
    });
    if(!killable){const boss=new Boss(s,1740,180,50,s.waves.nav);boss.nextSkill=s.clock+600000;boss.body.moves=false;s.waves.enemies.push(boss);guardTargets.push(boss);}
    s.combat.acquireTarget(s.waves.enemies);
    return guardTargets.map(e=>({health:e.health,maxHealth:e.maxHealth,boss:e.isBoss}));
  },{kind,killable});
}
async function armMelee(page,delay=50) {
  await page.evaluate(delay=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),e=guardTargets[0];
    e.body.reset(s.player.x+58,s.player.y);e.stunUntil=0;e.hurtUntil=0;e.nextAttack=s.clock+10000;e.windupUntil=s.clock+delay;
  },delay);
}
const healths = state => state.targets.map(e=>e.health);

for(const classId of ['warrior','mage','archer']) {
  test(`${classId} keyboard: live melee parry hits every distant normal and elite for exactly half normal / 20% boss maximum HP once, while empty guard and dash do no damage`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,classId);
    const before=await fixtures(page),initial=await read(page);
    expect(Math.hypot(initial.targets[1].x-960,(initial.targets[1].y-640)/.72)).toBeGreaterThan(900);
    await page.keyboard.press('Space');await expect.poll(async()=>(await read(page)).guardUntil,{intervals:[10]}).toBeGreaterThan(initial.clock);
    await page.waitForTimeout(20);expect(healths(await read(page))).toEqual(before.map(e=>e.health));
    await armMelee(page,30);
    await expect.poll(async()=>(await read(page)).result,{intervals:[10],timeout:1000}).toBe('parried');
    const first=await read(page);expect(first.targets.at(-1)).toMatchObject({boss:true,maxHealth:100000,health:80000});expect(first.health).toBe(initial.health);expect(first.charge).toBe(25);
    expect(healths(first)).toEqual(before.map(e=>e.health-e.maxHealth*(e.boss?.2:.5)));
    // A second real hit is allowed after immunity expires, during the same 650ms
    // action. It must be a normal reduced block without a second global counter.
    await expect.poll(async()=>{const s=await read(page);return s.clock>=s.invulnerableUntil;},{intervals:[10]}).toBe(true);
    await armMelee(page,25);
    await expect.poll(async()=>(await read(page)).result,{intervals:[10],timeout:700}).toBe('blocked');
    const second=await read(page);expect(second.health).toBe(initial.health-3);expect(second.clock).toBeLessThan(second.guardUntil);expect(healths(second)).toEqual(healths(first));expect(second.charge).toBe(25);
    // K is a real dash input. A melee strike during its invulnerability must not
    // be reclassified as a block or cause global damage.
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=0;s.player.body.reset(960,640);s.player.aimAngle=0;});
    await page.keyboard.press('KeyK');await expect.poll(async()=>{const s=await read(page);return s.dashUntil>s.clock;},{intervals:[10]}).toBe(true);
    await armMelee(page,30);await page.waitForTimeout(75);
    const dashed=await read(page);expect(dashed.result).toBe('ignored');expect(dashed.health).toBe(second.health);expect(healths(dashed)).toEqual(healths(first));expect(dashed.guardUntil).toBe(0);expect(errors).toEqual([]);
  });

  test(`${classId} touch: a real hostile projectile crosses the perfect window, is ordinarily blocked and counters distant targets for exactly 50% normal / 20% boss`,async({browser})=>{
    const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,classId);
    const before=await fixtures(page,'ranged'),initial=await read(page);
    await page.getByTestId('touch-guard').tap();await expect(page.getByTestId('touch-guard')).toHaveAttribute('data-active','true');
    await page.evaluate(()=>{
      const s=window.__LUMENFALL__.scene.getScene('Game'),e=guardTargets[0];e.body.reset(s.player.x+90,s.player.y);s.combat.fire(e,0,s.clock);
    });
    expect((await read(page)).bullets).toBe(1);
    await expect.poll(async()=>(await read(page)).result,{intervals:[10],timeout:1200}).toBe('blocked');
    const blocked=await read(page);expect(blocked.targets.at(-1)).toMatchObject({boss:true,maxHealth:100000,health:80000});expect(blocked.health).toBe(initial.health-2);expect(blocked.charge).toBe(0);
    expect(healths(blocked)).toEqual(before.map(e=>e.health-e.maxHealth*(e.boss?.2:.5)));expect(blocked.bullets).toBe(0);
    await page.screenshot({path:`artifacts/guard-counter-touch-${classId}.png`});expect(errors).toEqual([]);await context.close();
  });
}

test('counter kills use the real kill credit, queue the earned upgrade and advance only after choosing it',async({page})=>{
  await start(page,'warrior');await fixtures(page,'melee',true);const initial=await read(page);
  await page.keyboard.press('Space');await expect.poll(async()=>(await read(page)).guardUntil,{intervals:[10]}).toBeGreaterThan(initial.clock);await armMelee(page,30);
  await expect(page.locator('.upgrade-dialog')).toBeVisible();
  const cleared=await read(page);expect(cleared.kills).toBe(4);expect(cleared.upgrades).toBe(0);expect(cleared.targets.every(e=>!e.active)).toBe(true);expect(cleared.wave).toBe(1);
  const before=await page.evaluate(()=>({...window.__LUMENFALL__.scene.getScene('Game').player.stats}));
  await page.locator('.upgrade-card').first().click();await expect.poll(async()=>(await read(page)).upgrades).toBe(1);
  expect(await page.evaluate(()=>({...window.__LUMENFALL__.scene.getScene('Game').player.stats}))).not.toEqual(before);
  await expect.poll(async()=>(await read(page)).wave,{timeout:5000}).toBe(2);expect((await read(page)).kills).toBe(4);
});

test('final guardian: five successful blocks of its real ring skill each remove exactly 20000 HP, award one kill and enter the reward room without wave 51',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,'warrior');
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.player.body.reset(960,640);s.waves.wave=49;s.waves.start(960,640);s.stats.wave=50;
    const b=s.waves.boss;b.body.reset(1040,640);b.stun(s.clock,600000);b.nextSkill=s.clock+600000;
    window.guardTargets=[b];s.player.invulnerableUntil=0;s.player.stats.critChance=1;s.player.stats.damage=99999;s.player.stats.maxHealth=2000;s.player.health=2000;
  });
  expect((await read(page)).targets[0].maxHealth).toBe(100000);
  for(let index=1;index<=5;index++) {
    if(index>1)await expect.poll(async()=>{const r=await read(page);return r.clock>=r.nextGuard;},{intervals:[25],timeout:3500}).toBe(true);
    const initial=await read(page);await page.keyboard.press('Space');await expect.poll(async()=>(await read(page)).guardUntil,{intervals:[10]}).toBeGreaterThan(initial.clock);
    await page.evaluate(()=>{
      const s=window.__LUMENFALL__.scene.getScene('Game'),b=guardTargets[0];s.player.body.reset(960,640);s.player.invulnerableUntil=0;
      b.body.reset(1040,640);b.stunUntil=0;b.rushUntil=0;b.volleys=0;b.skill='ring';b.castStarted=s.clock-300;b.castUntil=s.clock+40;
    });
    await expect.poll(async()=>(await read(page)).targets[0].health,{intervals:[10],timeout:1000}).toBe(100000-index*20000);
    if(index<5) {
      const r=await read(page);expect(r.kills).toBe(0);expect(r.targets[0].active).toBe(true);
      await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');guardTargets[0].stun(s.clock,600000);s.combat.clear();});
    }
  }
  await expect.poll(async()=>(await read(page)).mode,{timeout:5000}).toBe('reward');
  const reward=await read(page);expect(reward.kills).toBe(1);expect(reward.wave).toBe(50);expect(reward.claimed).toBe(false);
  const cap=await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return {started:s.waves.start(s.player.x,s.player.y),wave:s.waves.wave};});expect(cap).toEqual({started:false,wave:50});
  await page.getByTestId('claim-reward').click();await expect(page.getByTestId('victory')).toBeVisible();expect((await read(page)).claimed).toBe(true);await expect(page.getByTestId('run-medal')).toHaveCount(1);expect(errors).toEqual([]);
});
