import {test,expect} from '@playwright/test';

async function start(page,mode='campaign') {
  await page.goto('/');await page.getByTestId(`mode-${mode}`).click();await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>window.__LUMENFALL__?.scene.getScene('Game').player?.active??false)).toBe(true);
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=1e9;s.waves.alive.forEach(e=>e.stun(s.clock,1e9));});
}

test('quick challenge uses one five-chapter mapping for visuals, encounters, cover, projectiles and hazards',async({page})=>{
  await start(page,'quick');
  const rows=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),rows=[];
    s.player.body.reset(960,640);
    for(let wave=1;wave<=10;wave++) {
      s.combat.clear();s.waves.wave=wave-1;s.waves.start(960,640);
      rows.push({wave,chapter:s.waves.chapter,scene:s.chapters.chapter,theme:s.children.getByName('naiwa-chapter-decor').getData('theme'),
        encounter:[...new Set(s.waves.alive.filter(e=>!e.isBoss).map(e=>e.encounterChapter))],
        cover:s.mapPlatforms.getChildren().filter(e=>e.name==='naiwa-chapter-cover-body').length,
        solids:s.combat.solids.length,bodies:s.mapPlatforms.getLength(),
        safe:s.waves.alive.every(e=>s.mapPlatforms.getChildren().every(o=>e.x<o.body.left-20||e.x>o.body.right+20||e.y<o.body.top-15||e.y>o.body.bottom+15)),
        connected:s.waves.nav.route(960,640,1690,980).length>0});
    }
    return rows;
  });
  expect(rows.map(r=>r.chapter)).toEqual([1,1,2,2,3,3,4,4,5,5]);
  const names=['蛙友广场','弹幕频道','缓存迷宫','热搜风暴','红温总控'];
  for(const r of rows){expect(r.scene).toBe(r.chapter);expect(r.theme).toBe(names[r.chapter-1]);expect(r.encounter).toEqual(r.wave===10?[]:[r.chapter]);expect(r.safe).toBe(true);expect(r.connected).toBe(true);expect(r.solids).toBe(r.bodies);expect(r.cover).toBe(r.chapter===3?3:0);}
  expect(await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.chapters.tick(s.clock,s.player,()=>{});s.chapters.tick(s.clock+5000,s.player,()=>{});return s.chapters.hazards.some(h=>h.active);})).toBe(false);
});

for(const [mode,cap] of [['campaign',50],['quick',10]]) {
  test(`${mode}: final real kill skips all combat rewards, celebrates build and records exactly once`,async({page})=>{
    await start(page,mode);
    await page.evaluate(cap=>{
      const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.waves.wave=cap-1;s.waves.start(960,640);s.stats.wave=cap;
      s.stats.kills=s.upgrades.nextAt-1;s.player.body.reset(960,640);
      const b=s.waves.boss;b.health=1;b.body.reset(1040,640);b.body.moves=false;b.nextSkill=1e9;
      s.combat.attack([b],s.clock);
    },cap);
    await expect(page.locator('.upgrade-card')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').waves.nextWaveAt)).toBeGreaterThan(0);
    expect(await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return{mode:s.mode,core:s.pendingCore,count:s.upgrades.count,duration:s.waves.intermissionDuration,damage:s.telemetry.damageDealt};})).toEqual({mode:'playing',core:false,count:0,duration:1800,damage:1});
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.waves.nextWaveAt=s.clock;});
    await expect.poll(()=>page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').mode)).toBe('reward');
    const record=()=>page.evaluate(mode=>JSON.parse(localStorage.getItem('naiwa.records.v1'))[mode].warrior,mode);
    const first=await record();expect(first.wins).toBe(1);expect(first.runs).toBe(1);expect(first.bestScore).toBeGreaterThan(0);
    await page.getByTestId('claim-reward').click();await expect(page.getByTestId('victory')).toBeVisible();
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.claimReward();s.enterRewardRoom();s.saveRecord(true);});
    expect(await record()).toEqual(first);await expect(page.getByTestId('run-medal')).toHaveCount(1);
    const summary=await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').stats.summary);
    expect(summary.bossesDefeated).toBe(1);expect(summary.bossResults).toHaveLength(1);expect(summary.criteria.at(-1)).toContain('连击不参与评分');
  });
}

test('wave-end manual choices gate the short intermission and pause freezes its visual and clock',async({page})=>{
  await start(page);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.stats.kills=s.upgrades.nextAt-1;
    s.waves.alive.forEach(e=>{e.health=1;e.body.reset(1040,640);e.stun(s.clock,1e9);});
    s.combat.attack(s.waves.enemies,s.clock);
  });
  await expect(page.locator('.upgrade-card')).toHaveCount(3);
  const choosing=await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return{clock:s.clock,next:s.waves.nextWaveAt,wave:s.waves.wave};});
  expect(choosing.next).toBe(0);await page.waitForTimeout(100);
  expect(await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').clock)).toBe(choosing.clock);
  await page.locator('.upgrade-card').first().click();
  await expect.poll(()=>page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').waves.intermissionDuration)).toBe(900);
  await expect(page.getByTestId('intermission')).toBeVisible();await page.getByTestId('pause').click();
  const paused=await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return{clock:s.clock,deadline:s.waves.nextWaveAt};});
  await page.waitForTimeout(200);
  expect(await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return{clock:s.clock,deadline:s.waves.nextWaveAt};})).toEqual(paused);
  await page.getByTestId('resume').click();await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.waves.nextWaveAt=s.clock;});
  await expect.poll(()=>page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').waves.wave)).toBe(2);
});

test('authored intermissions distinguish chapter/boss transitions and reduce passive campaign waiting',async({page})=>{
  await page.goto('/');
  const r=await page.evaluate(async()=>{
    const {chapterForWave,intermissionForWave}=await import('/src/game/systems/CampaignPacing.ts');
    return {campaign:Array.from({length:50},(_,i)=>chapterForWave(i+1)),ordinary:intermissionForWave(1),chapter:intermissionForWave(2,'quick'),boss:intermissionForWave(9),after:intermissionForWave(10),final:intermissionForWave(50),
      fullWait:Array.from({length:49},(_,i)=>intermissionForWave(i+1)).reduce((a,b)=>a+b,0),quickWait:Array.from({length:9},(_,i)=>intermissionForWave(i+1,'quick')).reduce((a,b)=>a+b,0)};
  });
  expect(r.campaign).toEqual(Array.from({length:50},(_,i)=>Math.ceil((i+1)/10)));
  expect(r).toMatchObject({ordinary:900,chapter:1400,boss:2200,after:1800,final:1800,quickWait:11400});
  expect(r.fullWait).toBeLessThan(60000);expect(r.fullWait).toBeLessThan(49*2800*.5);
});

test('resolved damage, defense and normalized transparent grades preserve old career records',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const {RunTelemetry}=await import('/src/game/systems/RunSummary.ts');
    const {recordRun,readRecords,RECORDS_KEY}=await import('/src/game/systems/RunRecords.ts');
    const a=new RunTelemetry('warrior','quick');a.hit({damage:120,boss:true,source:'attack'});a.defense({damage:0,prevented:20,result:'parried'});
    a.beginBoss(10);a.combatSeconds=40;a.bossBreaks=1;a.finishBoss();a.finishBoss();
    const summary=a.snapshot(10,300,['旋风核心 2/3']);
    localStorage.setItem(RECORDS_KEY,JSON.stringify({version:1,quick:{warrior:{highestWave:4,runs:3,wins:0,bestCombo:20}}}));
    recordRun({seed:'report',classId:'warrior',mode:'quick',wave:10,kills:40,upgrades:5,elapsed:300,bestCombo:30,summary},true);
    return {summary,record:readRecords().quick.warrior};
  });
  expect(result.summary).toMatchObject({damageDealt:120,damageTaken:0,damagePrevented:20,perfectGuards:1,bossesDefeated:1,score:92,grade:'S'});
  expect(result.summary.bossResults).toEqual([{wave:10,seconds:40,damageTaken:0,breaks:1}]);
  expect(result.record).toMatchObject({runs:4,wins:1,highestWave:10,bestCombo:30,bestScore:92});
});

test('future record schemas are retained byte-for-byte while this session can still show its result',async({page})=>{
  await page.goto('/');
  const r=await page.evaluate(async()=>{
    const {recordRun,readRecords,RECORDS_KEY}=await import('/src/game/systems/RunRecords.ts');
    const raw=JSON.stringify({version:2,newProgress:{warrior:42},futurePayload:['retain me']});localStorage.setItem(RECORDS_KEY,raw);
    const stats={seed:'future',classId:'warrior',mode:'quick',wave:10,kills:30,upgrades:5,elapsed:100,bestCombo:20};
    recordRun(stats,true);const after=localStorage.getItem(RECORDS_KEY),memory=readRecords().quick.warrior;
    recordRun({...stats,classId:'mage'},true);const twice=localStorage.getItem(RECORDS_KEY);
    localStorage.removeItem(RECORDS_KEY);recordRun(stats,true);const recovered=JSON.parse(localStorage.getItem(RECORDS_KEY));
    return {raw,after,twice,memory,recovered};
  });
  expect(r.after).toBe(r.raw);expect(r.twice).toBe(r.raw);expect(r.memory.wins).toBe(1);
  expect(r.recovered.version).toBe(1);expect(r.recovered.quick.warrior.wins).toBe(2);
});

test('clearing a storm wave cancels all environmental danger and preserves the completed-wave record',async({page})=>{
  await start(page);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.waves.wave=30;s.waves.start(960,640);s.stats.wave=31;
    s.waves.enemies.forEach(e=>e.destroy());s.player.body.reset(960,640);s.player.health=1;s.player.invulnerableUntil=0;
    s.chapters.justChanged=false;s.chapters.nextHazardAt=s.clock;
    Object.assign(s.chapters.hazards[0],{active:true,x:960,y:640,started:s.clock-1500,impact:s.clock-50,ends:s.clock+500,hit:false});
  });
  await expect.poll(()=>page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').waves.nextWaveAt)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return{mode:s.mode,health:s.player.health,hazards:s.chapters.hazards.filter(h=>h.active).length};})).toEqual({mode:'playing',health:1,hazards:0});
  // A late owned projectile or explicit damage after a completed wave must not lose that wave's record.
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.hurt(100,s.player.x+50,s.clock);});
  await expect(page.locator('.death-dialog')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('naiwa.records.v1')).campaign.warrior.highestWave)).toBe(31);
});

test('fractional boss-health pulses round normally without leaking the shared cast ceiling',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {BossCastBudget}=await import('/src/game/systems/CombatBalance.ts');
    const budget=new BossCastBudget(),target={};let total=0;
    for(let i=0;i<3;i++){const hit=budget.take(target,125000,160,125000*(.3/3));total+=Math.round(hit.fixed+hit.healthDamage);}
    return {total,remaining:budget.take(target,125000,1e9,1e9)};
  });
  expect(result.total).toBe(37980);expect(Math.round(result.remaining.fixed+result.remaining.healthDamage)+result.total).toBe(52500);
});
