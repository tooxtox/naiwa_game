import { test, expect } from '@playwright/test';

async function start(page, mode='campaign') {
  await page.goto('/');
  await page.getByTestId(`mode-${mode}`).click();
  await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.__LUMENFALL__?.scene.getScene('Game').player?.body))).toBe(true);
  await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').pauseRun());
}

test('all five real guardians spawn at the stronger campaign and independent quick HP budgets',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const {Boss}=await import('/src/game/entities/Boss.ts');
    const {getBossMaxHealth}=await import('/src/game/systems/DifficultySystem.ts');
    const s=window.__LUMENFALL__.scene.getScene('Game');
    return [10,20,30,40,50].map(wave=>{
      const campaign=new Boss(s,1100,640,wave,s.waves.nav),quick=new Boss(s,1100,640,wave,s.waves.nav,true);
      const sample={wave,campaign:campaign.health,campaignMax:campaign.maxHealth,quick:quick.health,quickMax:quick.maxHealth,
        campaignConfigured:getBossMaxHealth(wave),quickConfigured:getBossMaxHealth(wave,true),quickDamage:quick.damage};
      campaign.destroy();quick.destroy();return sample;
    });
  });
  const hp=[10000,25000,60000,150000,500000];
  expect(result).toEqual(hp.map((health,index)=>({wave:(index+1)*10,campaign:health,campaignMax:health,
    campaignConfigured:health,quick:14600+index*600,quickMax:14600+index*600,quickConfigured:14600+index*600,quickDamage:25})));
});

for(const mode of ['campaign','quick']) {
  test(`${mode}: real wave spawning and respawning keep authored HP; the final guardian still enters its later phases`,async({page})=>{
    await start(page,mode);
    const result=await page.evaluate(async()=>{
      const {getBossMaxHealth}=await import('/src/game/systems/DifficultySystem.ts');
      const s=window.__LUMENFALL__.scene.getScene('Game'),w=s.waves,cap=w.maxWaves;
      w.wave=cap-1;w.start(960,640);
      const first=w.boss,expected=getBossMaxHealth(first.bossWave,w.mode==='quick');
      first.hit(100,0,1000);const damaged=first.health;
      w.wave=cap-1;w.start(960,640);
      const boss=w.boss,spawned=boss.health,phases=[];
      boss.hit(Math.ceil(boss.maxHealth*.51),0,2000);boss.tick(2000,s.player,()=>{},()=>{});phases.push(boss.bossPhase);
      boss.hit(Math.ceil(boss.maxHealth*.25),0,3000);boss.tick(3000,s.player,()=>{},()=>{});phases.push(boss.bossPhase);
      const alive=boss.active&&boss.state!=='Dead',dead=boss.hit(boss.health,0,4000);
      return {expected,damaged,spawned,oldDestroyed:!first.active,phases,final:boss.bossWave===50,alive,dead,remaining:boss.health,completed:w.finalWaveCompleted};
    });
    expect(result.spawned).toBe(result.expected);expect(result.damaged).toBe(result.expected-100);
    expect(result.oldDestroyed).toBe(true);expect(result.phases).toEqual([2,result.final?3:2]);
    expect(result.alive).toBe(true);expect(result.dead).toBe(true);expect(result.remaining).toBe(0);expect(result.completed).toBe(true);
  });
}
