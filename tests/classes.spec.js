import { test, expect } from '@playwright/test';

const read = page => page.evaluate(() => {
  const s=window.__LUMENFALL__.scene.getScene('Game'), p=s.player;
  if(!s.scene.isActive()||!p?.body)return {mode:'loading'};
  return {mode:s.mode,clock:s.clock,classId:p.classId,health:p.health,stats:{...p.stats},seed:s.stats.seed,kills:s.stats.kills,charge:p.ultimateCharge,guardUntil:p.guardUntil,nextGuard:p.nextGuard,perfectGuardUntil:p.perfectGuardUntil,nextUltimate:p.nextUltimate,ultimateUntil:p.ultimateUntil,result:p.lastDamageResult,attackAngle:p.attackAngle,aim:p.aimAngle,vx:p.body.velocity.x,targetHealth:window.fixtureTarget?.health,targetAlive:window.fixtureTarget?.active,projectileTextures:s.children.list.filter(o=>o.visible&&['hero-magic','hero-arrow'].includes(o.texture?.key)).map(o=>o.texture.key)};
});
async function start(page, classId='warrior') {
  await page.goto('/');
  await page.getByTestId(`class-${classId}`).click();
  await expect(page.getByTestId(`class-${classId}`)).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('start').click();
  await expect.poll(async()=>(await read(page)).mode).toBe('playing');
}

const expected = {
  warrior:{health:125,damage:30,speed:270,attackCooldown:390,attackRange:130},
  mage:{health:85,damage:24,speed:255,attackCooldown:580,attackRange:640},
  archer:{health:95,damage:20,speed:290,attackCooldown:350,attackRange:780},
};
for (const classId of ['warrior','mage','archer']) {
  test(`${classId}: selected weapon really attacks, ultimate kills, route upgrade changes stats and restart resets the run`, async ({page}) => {
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await start(page,classId); const initial=await read(page);
    expect(initial.classId).toBe(classId);expect(initial.health).toBe(expected[classId].health);
    for(const key of ['damage','speed','attackCooldown','attackRange'])expect(initial.stats[key]).toBe(expected[classId][key]);
    // Stationary real enemies isolate weapon reach and damage from random navigation.
    const targetBefore=await page.evaluate(id=>{
      const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.player.body.reset(960,640);s.player.invulnerableUntil=s.clock+20000;
      s.waves.alive.forEach((e,i)=>{e.stun(s.clock,20000);e.body.reset(i===0?960+(id==='warrior'?90:300):1550,640+i*40);});
      window.fixtureTarget=s.waves.alive[0];return fixtureTarget.health;
    },classId);
    await page.keyboard.down('KeyJ');await page.waitForTimeout(65);await page.keyboard.up('KeyJ');
    if(classId!=='warrior') {
      const fired=await read(page);
      expect(fired.projectileTextures).toContain(classId==='mage'?'hero-magic':'hero-arrow');
      expect(fired.targetHealth).toBe(targetBefore); // A visible shot has travel time across 300 floor units.
    }
    await expect.poll(async()=>(await read(page)).targetHealth,{timeout:1800}).toBeLessThan(targetBefore);
    expect((await read(page)).charge).toBeGreaterThan(0);
    const notReady=await read(page);await page.keyboard.press('KeyQ');await page.waitForTimeout(30);
    expect((await read(page)).nextUltimate).toBe(notReady.nextUltimate);
    // Charge fixture only supplies the meter; Q must consume it and real class-specific combat must earn four kills.
    await page.evaluate(()=>{
      const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.player.body.reset(960,640);
      s.waves.alive.forEach((e,i)=>{e.body.reset(1080+i*4,640);e.stun(s.clock,20000);});
      s.player.addUltimateCharge(100);
    });
    await page.keyboard.press('KeyQ');
    await expect.poll(async()=>(await read(page)).charge).toBe(0);
    await expect.poll(async()=>(await read(page)).mode,{timeout:2500}).toBe('upgrade');
    const upgraded=await read(page);expect(upgraded.kills).toBe(4);expect(upgraded.nextUltimate).toBeGreaterThan(upgraded.clock);
    await expect(page.locator('.upgrade-card')).toHaveCount(3);
    const route=page.locator(`[data-testid^="upgrade-${classId}-"]`).first();await expect(route).toBeVisible();
    const routeId=(await route.getAttribute('data-testid')).replace('upgrade-','');
    expect(await page.locator(`[data-testid^="upgrade-${classId==='warrior'?'mage':'warrior'}-"]`).count()).toBe(0);
    const frozen=upgraded.clock;await page.waitForTimeout(150);expect((await read(page)).clock).toBe(frozen);
    await page.screenshot({path:`artifacts/${classId}-route-upgrade.png`});
    await route.click();await expect.poll(async()=>(await read(page)).mode).toBe('playing');
    const after=await read(page);
    const fields={ 'warrior-range':'attackRange','warrior-leech':'lifeSteal','warrior-guard':'guardCooldown','mage-blast':'splashRadius','mage-split':'projectileCount','mage-frost':'slowDuration','archer-pierce':'pierceCount','archer-volley':'projectileCount','archer-precision':'projectileSpeed' };
    expect(after.stats[fields[routeId]]).not.toBe(upgraded.stats[fields[routeId]]);
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=0;s.combat.hurt(999,s.player.x+20,s.clock);});
    await expect(page.locator('.death-dialog')).toBeVisible();
    await page.getByTestId('restart').click();await expect.poll(async()=>(await read(page)).mode).toBe('playing');
    const restarted=await read(page);expect(restarted.classId).toBe(classId);expect(restarted.stats).toEqual(initial.stats);expect(restarted.charge).toBe(0);expect(restarted.kills).toBe(0);expect(restarted.seed).not.toBe(initial.seed);
    expect(errors).toEqual([]);
  });
}

test('auto-target: the nearest enemy behind the hero is attacked while moving in the opposite direction', async ({page}) => {
  await start(page);
  const baseline=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.player.body.reset(960,640);s.player.aimAngle=0;s.player.facing=1;
    s.waves.alive.forEach((e,i)=>{e.body.reset(i===0?890:i===1?1070:1500,640+i*2);e.stun(s.clock,20000);});
    window.fixtureTarget=s.waves.alive[0];return {near:fixtureTarget.health,front:s.waves.alive[1].health};
  });
  await page.keyboard.down('KeyD');await page.keyboard.down('KeyJ');await page.waitForTimeout(70);
  const fired=await read(page);expect(fired.vx).toBeGreaterThan(0);expect(Math.cos(fired.attackAngle)).toBeLessThan(-.95);expect(fired.targetHealth).toBeLessThan(baseline.near);
  const frontHealth=await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').waves.enemies[1].health);expect(frontHealth).toBe(baseline.front);
  await page.keyboard.up('KeyJ');await page.keyboard.up('KeyD');
});

test('guard: precise parry prevents damage and charges 25; later block reduces 80%; cooldown rejects another guard', async ({page}) => {
  await start(page); const initial=await read(page);
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.waves.alive.forEach(e=>e.stun(s.clock,20000));});
  await page.keyboard.press('Space');await expect.poll(async()=>(await read(page)).guardUntil).toBeGreaterThan(initial.clock);
  const guarding=await read(page);expect(guarding.perfectGuardUntil).toBeGreaterThan(guarding.clock);
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.hurt(20,s.player.x+50,s.clock,s.player.y);});
  let result=await read(page);expect(result.result).toBe('parried');expect(result.health).toBe(initial.health);expect(result.charge).toBe(25);
  await page.waitForTimeout(250);
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.hurt(20,s.player.x+50,s.clock,s.player.y);});
  result=await read(page);expect(result.result).toBe('blocked');expect(result.health).toBe(initial.health-4);expect(result.guardUntil).toBeGreaterThan(result.clock);
  await page.waitForTimeout(480);await page.keyboard.press('KeyL');await page.waitForTimeout(30);
  result=await read(page);expect(result.guardUntil).toBe(guarding.guardUntil);expect(result.guardUntil).toBeLessThan(result.clock);expect(result.nextGuard).toBe(guarding.nextGuard);
  expect(await page.evaluate(()=>({jumpMethod:'consumeJump' in window.__LUMENFALL__.scene.getScene('Game').controls,jumpField:'jumps' in window.__LUMENFALL__.scene.getScene('Game').player}))).toEqual({jumpMethod:false,jumpField:false});
});

test('ultimate readiness: a refilled meter respects the skill lockout and becomes ready without charge changing', async ({page}) => {
  await start(page);
  const lockout=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');
    s.waves.alive.forEach(e=>e.stun(s.clock,10000));
    s.player.addUltimateCharge(100);s.player.nextUltimate=s.clock+500;
    return s.player.nextUltimate;
  });
  const button=page.getByTestId('touch-ultimate');
  await expect(button).toHaveAttribute('data-charge','100');
  await expect(button).toHaveAttribute('data-ready','false');
  await expect(button).not.toHaveClass(/is-ready/);
  await expect(button).toHaveAttribute('aria-label','终结技能，冷却中');
  await expect(button.locator('.touch-charge')).toHaveText('冷却中');
  await page.keyboard.press('KeyQ');
  const locked=await read(page);expect(locked.charge).toBe(100);expect(locked.nextUltimate).toBe(lockout);
  await expect(button).toHaveAttribute('data-ready','true');
  await expect(button).toHaveAttribute('data-charge','100');
  await expect(button).toHaveClass(/is-ready/);
  await expect(button.locator('.touch-charge')).toHaveText('就绪');
  await page.keyboard.press('KeyQ');
  await expect.poll(async()=>(await read(page)).charge).toBe(0);
});

for(const [width,height] of [[568,320],[932,430]]) {
  test(`mobile ${width}×${height}: all four actions fit without overlaps and class cards remain usable`,async({browser})=>{
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});const page=await context.newPage();
    await page.goto('/');
    for(const name of ['warrior','mage','archer']) {
      const button=page.getByTestId(`class-${name}`);await expect(button).toBeVisible();await button.tap();await expect(button).toHaveAttribute('aria-pressed','true');
    }
    await page.getByTestId('start').tap();await expect.poll(async()=>(await read(page)).mode).toBe('playing');
    const boxes=[];
    for(const action of ['attack','guard','dash','ultimate']) {
      const b=await page.getByTestId(`touch-${action}`).boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(90);expect(b.x+b.width).toBeLessThanOrEqual(width);expect(b.y+b.height).toBeLessThanOrEqual(height);boxes.push(b);
    }
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);}
    await page.screenshot({path:`artifacts/classes-mobile-${width}.png`});await context.close();
  });
}
