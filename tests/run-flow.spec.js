import { test,expect } from '@playwright/test';

const state=page=>page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return{mode:s.mode,wave:s.waves?.wave,remaining:s.waves?.alive.length,clock:s.clock,cap:s.waves?.maxWaves,kind:s.rewardKind};});
for(const [mode,cap] of [['campaign',50],['quick',10]]) {
  test(`${mode}: all ${cap} real waves, independent core choices, reward room, saved victory, death and same-mode restart`,async({page})=>{
    // Fifty real UI/physics transitions take longer than a short mechanic fixture on headless CI.
    test.setTimeout(mode==='campaign'?180000:60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await page.getByTestId(`mode-${mode}`).click();await page.getByTestId('start').click();
    await expect.poll(async()=>(await state(page)).wave).toBe(1);
    let coreChoices=0;
    for(let wave=1;wave<=cap;wave++) {
      expect((await state(page)).wave).toBe(wave);
      // HP/positions are fixtures. J, damage, kills, rewards, wave transitions,
      // layout refresh and records use the actual game integration throughout.
      await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=s.clock+600000;s.player.body.reset(960,640);s.player.nextAttack=0;s.player.guardUntil=0;s.waves.alive.forEach(e=>{e.health=1;e.body.reset(1040,640);e.body.moves=false;e.stun(s.clock,600000);});});
      await page.keyboard.press('KeyJ',{delay:40});
      await expect.poll(async()=>(await state(page)).remaining).toBe(0);
      await page.waitForTimeout(65);
      for(let choice=0;choice<12&&(await state(page)).mode==='upgrade';choice++) {
        const before=await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return{kind:s.rewardKind,nextAt:s.upgrades.nextAt,count:s.upgrades.count};});
        if(before.kind==='core')coreChoices++;
        await page.locator('.upgrade-card').first().click();
        if(before.kind==='core'){const after=await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return{nextAt:s.upgrades.nextAt,count:s.upgrades.count};});expect(after.nextAt).toBe(before.nextAt+5*(after.count-before.count));}
      }
      expect((await state(page)).mode).toBe('playing');
      await expect.poll(()=>page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').waves.nextWaveAt)).toBeGreaterThan(0);
      await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.waves.nextWaveAt=s.clock;});
      await expect.poll(async()=>{const s=await state(page);return wave===cap?s.mode==='reward':s.wave===wave+1;}).toBe(true);
    }
    // Intro + non-final guardians only; the final guardian celebrates the finished build.
    expect(coreChoices).toBe(mode==='campaign'?5:1);
    const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('naiwa.records.v1')));
    const beforeClaim=(await stored())[mode].warrior;expect(beforeClaim.highestWave).toBe(cap);expect(beforeClaim.wins).toBe(1);expect(beforeClaim.runs).toBe(1);expect(beforeClaim.fastestWin).toBeGreaterThan(0);expect(beforeClaim.bestCombo).toBeGreaterThan(3);
    await page.getByTestId('claim-reward').click();await expect(page.getByTestId('victory')).toBeVisible();expect((await stored())[mode].warrior).toEqual(beforeClaim);
    expect((await stored())[mode==='quick'?'campaign':'quick'].warrior.runs).toBe(0);
    await page.getByTestId('restart').click();await expect.poll(async()=>(await state(page)).wave).toBe(1);expect((await state(page)).cap).toBe(cap);
    await page.getByTestId('pause').click();const paused=await state(page);await page.waitForTimeout(70);expect((await state(page)).clock).toBe(paused.clock);await page.getByTestId('resume').click();
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=0;s.combat.hurt(9999,s.player.x+50,s.clock);});
    await expect(page.locator('.death-dialog')).toBeVisible();const end=(await stored())[mode].warrior;expect(end.runs).toBe(2);expect(end.wins).toBe(1);expect(end.highestWave).toBe(cap);expect(errors).toEqual([]);
  });
}
