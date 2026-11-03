import {test,expect} from '@playwright/test';

const read=page=>page.evaluate(()=>{
  const s=window.__LUMENFALL__.scene.getScene('Game');
  if(!s.scene.isActive()||!s.player?.body)return {mode:'loading'};
  const b=s.waves.boss;
  return {mode:s.mode,clock:s.clock,boss:b?{health:b.health,maxHealth:b.maxHealth,toughness:b.toughness,maxToughness:b.maxToughness,broken:b.broken,brokenUntil:b.brokenUntil,phase:b.bossPhase}:null};
});
async function start(page){
  await page.goto('/');await page.getByTestId('class-warrior').click();await page.getByTestId('start').click();
  await expect.poll(async()=>(await read(page)).mode).toBe('playing');
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=s.clock+600000;
    s.waves.alive.forEach(e=>e.stun(s.clock,600000));
  });
}
async function finalBoss(page){
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.player.body.reset(960,640);
    s.waves.wave=49;s.waves.start(960,640);s.stats.wave=50;
    const b=s.waves.boss;b.body.reset(1040,640);b.body.moves=false;b.nextSkill=s.clock+600000;
  });
}

test('boss resilience has a finite break, full recovery and a seven-second repeat-break lock',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {ResilienceSystem,RESILIENCE}=await import('/src/game/systems/ResilienceSystem.ts');
    const r=new ResilienceSystem(5),out={maximum:r.maximum,config:RESILIENCE};
    out.invalid=[r.damage(Infinity,100),r.damage(-30,100),r.damage(NaN,100)];
    out.partial=r.damage(60,100);out.afterPartial=r.remaining;
    out.broke=r.damage(1000,200);out.broken=r.broken;out.until=r.brokenUntil;
    r.tick(1999);out.justBefore=r.broken;
    r.tick(2000);out.recovered={broken:r.broken,remaining:r.remaining,protected:r.protected};
    out.blockedRepeat=r.damage(1000,8999);out.duringImmunity=r.remaining;
    out.afterImmunity=r.damage(1000,9000);return out;
  });
  expect(result.maximum).toBe(150);expect(result.invalid).toEqual([false,false,false]);
  expect(result.partial).toBe(false);expect(result.afterPartial).toBe(90);expect(result.broke).toBe(true);expect(result.broken).toBe(true);
  expect(result.until).toBe(2000);expect(result.justBefore).toBe(true);expect(result.recovered).toEqual({broken:false,remaining:150,protected:true});
  expect(result.blockedRepeat).toBe(false);expect(result.duringImmunity).toBe(150);expect(result.afterImmunity).toBe(true);
});

test('a real boss break cancels pending attacks, increases received damage and pauses with the run',async({page})=>{
  await start(page);await finalBoss(page);
  const result=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),b=s.waves.boss;
    let events=0;s.events.on('boss-break',()=>events++);
    b.skill='charge';b.castUntil=s.clock+500;b.rushUntil=s.clock+700;b.volleys=2;
    b.hit(100,0,s.clock);const ordinary=b.maxHealth-b.health;
    const broke=b.damageToughness(b.maxToughness,s.clock),before=b.health;
    b.hit(100,0,s.clock);s.pauseRun();
    return {ordinary,breakDamage:before-b.health,broke,events,castUntil:b.castUntil,rushUntil:b.rushUntil,volleys:b.volleys};
  });
  expect(result).toEqual({ordinary:100,breakDamage:135,broke:true,events:1,castUntil:0,rushUntil:0,volleys:0});
  const paused=await read(page);await page.waitForTimeout(250);expect((await read(page)).clock).toBe(paused.clock);expect((await read(page)).boss.broken).toBe(true);
  await page.getByTestId('resume').click();await expect.poll(async()=>(await read(page)).boss.broken,{timeout:3500}).toBe(false);
  const recovered=await read(page);expect(recovered.boss.toughness).toBe(recovered.boss.maxToughness);
  await page.screenshot({path:'artifacts/boss-resilience-recovered.png'});
});

test('real perfect-guard and ultimate hit paths both remove boss toughness and phases announce once',async({page})=>{
  await start(page);await finalBoss(page);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=0;
    window.depthPhases=[];s.events.on('boss-phase',b=>depthPhases.push(b.bossPhase));
  });
  await page.keyboard.press('Space');
  await expect.poll(()=>page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return s.player.guardUntil>s.clock;}),{intervals:[10]}).toBe(true);
  const parry=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),b=s.waves.boss,before=b.toughness;
    s.combat.hurt(30,b.x,s.clock,b.y,b);
    return {result:s.player.lastDamageResult,before,after:b.toughness,health:b.health,charge:s.player.ultimateCharge};
  });
  expect(parry.result).toBe('parried');expect(parry.after).toBeLessThan(parry.before);expect(parry.health).toBeGreaterThan(90000);expect(parry.charge).toBeGreaterThanOrEqual(25);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.player.guardUntil=0;s.player.ultimateCharge=100;
  });
  await page.keyboard.press('KeyQ');
  await expect.poll(async()=>(await read(page)).boss.toughness,{timeout:1500}).toBeLessThan(parry.after);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),b=s.waves.boss;
    s.combat.clear();b.hit(Math.max(0,b.health-b.maxHealth*.49),0,s.clock);
  });
  await expect.poll(async()=>(await read(page)).boss.phase).toBe(2);
  await page.waitForTimeout(80);expect(await page.evaluate(()=>window.depthPhases)).toEqual([2]);
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game'),b=s.waves.boss;b.hit(Math.max(0,b.health-b.maxHealth*.24),0,s.clock);});
  await expect.poll(async()=>(await read(page)).boss.phase).toBe(3);expect(await page.evaluate(()=>window.depthPhases)).toEqual([2,3]);
});

test('five chapter encounters change enemy composition while the 50-wave campaign retains all five guardians',async({page})=>{
  await start(page);
  const samples=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),out=[];
    for(let wave=1;wave<=50;wave++) {
      s.waves.start(960,640);
      const actual=s.waves.wave;if(actual!==wave+1&&wave!==50)throw new Error('Unexpected campaign advance');
      if([9,11,21,31,41].includes(actual))out.push({wave:actual,kinds:s.waves.alive.map(e=>e.kind)});
    }
    return {samples:out,wave:s.waves.wave,max:s.waves.maxWaves,finalBoss:s.waves.boss?.maxHealth,extra:s.waves.start(960,640)};
  });
  expect(samples.wave).toBe(50);expect(samples.max).toBe(50);expect(samples.finalBoss).toBe(100000);expect(samples.extra).toBe(false);
  const second=samples.samples.find(s=>s.wave===11),first=samples.samples.find(s=>s.wave===9),fifth=samples.samples.find(s=>s.wave===41);
  expect(second.kinds.filter(k=>k==='ranged').length).toBeGreaterThan(first.kinds.filter(k=>k==='ranged').length);
  expect(fifth.kinds.filter(k=>k==='elite').length).toBeGreaterThan(first.kinds.filter(k=>k==='elite').length);
});

test('chapter danger is telegraphed for 1450ms, pooled, dealt once and removed during boss fights',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const {ChapterSystem,CHAPTERS}=await import('/src/game/systems/ChapterSystem.ts');
    const s=window.__LUMENFALL__.scene.getScene('Game'),chapter=new ChapterSystem(s,s.mapPlatforms,'CHAPTER-TEST');
    s.player.body.reset(960,640);let damage=0,hits=0;const hurt=amount=>{damage+=amount;hits++;};
    chapter.setChapter(31);chapter.tick(0,s.player,hurt);chapter.tick(4200,s.player,hurt);
    const warning={active:chapter.hazards.filter(h=>h.active).length,damage,duration:chapter.hazards[0].impact-chapter.hazards[0].started};
    chapter.tick(5649,s.player,hurt);const before=damage;
    chapter.tick(5650,s.player,hurt);chapter.tick(5700,s.player,hurt);const after={damage,hits};
    chapter.tick(6000,s.player,hurt);const expired=chapter.hazards.filter(h=>h.active).length;
    chapter.setChapter(41);chapter.tick(10000,s.player,hurt);chapter.tick(14200,s.player,hurt);const finalCount=chapter.hazards.filter(h=>h.active).length;
    chapter.setChapter(50);chapter.tick(30000,s.player,hurt);const bossCount=chapter.hazards.filter(h=>h.active).length;
    const names=CHAPTERS.map(c=>c.name);chapter.destroy();return {warning,before,after,expired,finalCount,bossCount,names};
  });
  expect(result.warning).toEqual({active:1,damage:0,duration:1450});expect(result.before).toBe(0);expect(result.after).toEqual({damage:18,hits:1});
  expect(result.expired).toBe(0);expect(result.finalCount).toBe(2);expect(result.bossCount).toBe(0);
  expect(result.names).toEqual(['蛙友广场','弹幕频道','缓存迷宫','热搜风暴','红温总控']);
});

test('all three seeded cover layouts keep spawn points connected and the arrival foot space clear',async({page})=>{
  await start(page);
  const layouts=await page.evaluate(async()=>{
    const {MapGenerator}=await import('/src/game/systems/MapGenerator.ts');const {NavigationGrid}=await import('/src/game/systems/NavigationGrid.ts');
    const s=window.__LUMENFALL__.scene.getScene('Game'),out=[];
    for(const seed of ['DEPTH0','DEPTH1','DEPTH2']) {
      const before=new Set(s.children.list),map=new MapGenerator(s,seed).create(),nav=new NavigationGrid(map.platforms);
      const boxes=map.platforms.getChildren().map(o=>({left:o.body.left,right:o.body.right,top:o.body.top,bottom:o.body.bottom}));
      out.push({variant:map.layoutVariant,spawnCount:map.spawnPoints.length,unreachable:map.spawnPoints.filter(p=>nav.route(960,640,p.x,p.y).length===0).length,centralBlocked:boxes.some(b=>b.left<1010&&b.right>910&&b.top<690&&b.bottom>590)});
      map.platforms.clear(true,true);map.platforms.destroy();
      for(const object of s.children.list.slice())if(!before.has(object)&&object.scene)object.destroy();
    }
    return out;
  });
  expect(new Set(layouts.map(l=>l.variant)).size).toBe(3);
  for(const layout of layouts){expect(layout.spawnCount).toBeGreaterThan(15);expect(layout.unreachable).toBe(0);expect(layout.centralBlocked).toBe(false);}
});

test('quick challenge ends at its tenth wave with an adjusted seeded random guardian',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const {WaveSystem}=await import('/src/game/systems/WaveSystem.ts');const s=window.__LUMENFALL__.scene.getScene('Game');
    const quick=new WaveSystem(s,s.waves.random,s.mapPlatforms,s.waves.spawnPoints,'quick');
    const waves=[];for(let i=0;i<10;i++){quick.start(960,640);waves.push({wave:quick.wave,boss:quick.boss?.bossWave??null});}
    const b=quick.boss,health=b.maxHealth;b.hit(b.health,0,s.clock);
    const out={waves,health,maximum:quick.maxWaves,complete:quick.finalWaveCompleted,extra:quick.start(960,640)};
    quick.enemies.forEach(e=>e.active&&e.destroy());return out;
  });
  expect(result.maximum).toBe(10);expect(result.waves.map(w=>w.wave)).toEqual([1,2,3,4,5,6,7,8,9,10]);
  expect(result.waves.slice(0,9).every(w=>w.boss===null)).toBe(true);expect([10,20,30,40,50]).toContain(result.waves[9].boss);
  expect(result.health).toBeGreaterThanOrEqual(3500);expect(result.health).toBeLessThanOrEqual(5000);expect(result.complete).toBe(true);expect(result.extra).toBe(false);
});

test('maze chapter adds real cover safely, refreshes navigation and removes it for the storm',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const {ChapterSystem}=await import('/src/game/systems/ChapterSystem.ts');
    const s=window.__LUMENFALL__.scene.getScene('Game'),chapter=new ChapterSystem(s,s.mapPlatforms,'MAZE-TEST');
    s.player.body.reset(650,520);const before=s.mapPlatforms.getLength();
    const changed=chapter.setChapter(21,s.player);s.waves.refreshNavigation();
    const covers=s.mapPlatforms.getChildren().filter(o=>o.name==='naiwa-chapter-cover-body');
    const clearPlayer=covers.every(o=>Math.hypot(o.x-s.player.x,(o.y-s.player.y)/.72)>160);
    const reachable=s.waves.nav.route(960,640,1690,980).length>0;
    s.waves.wave=20;s.waves.start(960,640);
    const spawnSafe=s.waves.alive.every(e=>covers.every(o=>e.x<o.body.left-20||e.x>o.body.right+20||e.y<o.body.top-15||e.y>o.body.bottom+15));
    const blockedLine=!s.waves.nav.lineOfSight(1210,745,1370,745);
    const removed=chapter.setChapter(31,s.player);s.waves.refreshNavigation();
    const after=s.mapPlatforms.getLength();chapter.destroy();
    return {before,added:covers.length,changed,clearPlayer,reachable,spawnSafe,blockedLine,removed,after};
  });
  expect(result.changed).toBe(true);expect(result.added).toBe(2);expect(result.clearPlayer).toBe(true);
  expect(result.reachable).toBe(true);expect(result.spawnSafe).toBe(true);expect(result.blockedLine).toBe(true);
  expect(result.removed).toBe(true);expect(result.after).toBe(result.before);
});
