import {test,expect} from '@playwright/test';

/**
 * The scene/physics clock is paused so the cases are deterministic. Enemy.hit,
 * upgrade eligibility, initial multishot, segment collisions, ricochet selection,
 * damage and projectile pooling are the real production implementations.
 * Enemy AI is not stepped; targets stay in their authored fixture positions.
 */
async function fixture(page,{count=1,rank=1,pierces=1,points=[[1060,640]],health=10000}={}) {
  await page.goto('/');
  await page.getByTestId('class-archer').click();await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>{
    const s=window.__LUMENFALL__?.scene.getScene('Game');
    return s?.mode==='playing'&&Boolean(s.player?.body&&s.combat?.build);
  })).toBe(true);
  await page.evaluate(async({count,rank,pierces,points,health})=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts');
    const s=window.__LUMENFALL__.scene.getScene('Game');
    s.scene.pause();s.physics.pause();s.combat.clear();
    s.waves.enemies.forEach(e=>e.active&&e.destroy());s.waves.enemies=[];
    s.combat.onKill=()=>{};
    s.player.body.reset(960,640);s.player.stats.critChance=0;
    s.player.stats.projectileCount=1;s.player.stats.pierceCount=pierces;
    s.player.stats.damage=20;s.player.attackAngle=0;
    for(let i=0;i<rank;i++)s.upgrades.build.learnCore('archer-ricochet');
    // Actually choose the existing multishot upgrade after learning ricochet.
    // Re-roll only the offering, not the production choose/apply operation.
    for(let i=1;i<count;i++) {
      let offered=false;
      for(let draw=0;draw<200&&!offered;draw++)offered=s.upgrades.choices(s.player.stats).some(c=>c.id==='archer-volley');
      if(!offered||!s.upgrades.choose('archer-volley',s.player.stats))throw new Error('Unable to apply legal multishot reward');
    }
    const obstacles=s.physics.add.staticGroup();s.combat.refreshObstacles(obstacles);
    const enemies=points.map(([x,y])=>{
      const e=new Enemy(s,x,y,'melee',1,s.waves.nav);e.health=e.maxHealth=health;e.fixtureHits=[];
      const hit=e.hit.bind(e);
      e.hit=(amount,angle,now)=>{e.fixtureHits.push({amount,now});return hit(amount,angle,now);};
      return e;
    });
    s.waves.enemies=enemies;
    window.ricochetFixture={scene:s,enemies,obstacles,now:1000};
  },{count,rank,pierces,points,health});
}

const read=page=>page.evaluate(()=>{
  const f=window.ricochetFixture;
  return {now:f.now,hits:f.enemies.map(e=>e.fixtureHits),active:f.scene.combat.projectiles.filter(p=>p.active).length,pool:f.scene.combat.projectiles.length};
});
async function attack(page) {
  return page.evaluate(()=>{
    const f=window.ricochetFixture;f.scene.combat.attack(f.enemies,f.now);
    return f.scene.combat.projectiles.filter(p=>p.active).length;
  });
}
async function advance(page,duration=1000) {
  await page.evaluate(duration=>{
    const f=window.ricochetFixture,end=f.now+duration;
    for(;f.now<end;f.now+=16)f.scene.combat.tick(f.now,f.enemies);
  },duration);
}

for(const count of [1,2,3]) {
  test(`${count}-arrow volley retains independent ricochet after choosing multishot and returns once on a single enemy`,async({page})=>{
    await fixture(page,{count});
    expect(await attack(page)).toBe(count);
    await advance(page,1600);const result=await read(page);
    expect(result.hits[0]).toHaveLength(count*2);
    const firstAt=result.hits[0][0].now;
    const immediate=result.hits[0].filter(h=>h.now<=firstAt+32);
    // The return is delayed instead of counting two damage calls in one impact.
    expect(immediate).toHaveLength(count);
    expect(immediate.map(h=>h.amount).sort((a,b)=>a-b)).toEqual([20,...Array(count-1).fill(11)].sort((a,b)=>a-b));
    expect(result.hits[0].filter(h=>h.now>firstAt+32)).toHaveLength(count);
    expect(result.active).toBe(0);expect(result.pool).toBe(64);
    await advance(page,5000);
    expect((await read(page)).hits[0]).toEqual(result.hits[0]);
  });
}

test('the initial return preserves the budget for a different target and never returns to the first target again',async({page})=>{
  await fixture(page,{points:[[1060,640],[1140,720]]});
  await attack(page);await advance(page,1800);const result=await read(page);
  expect(result.hits.map(h=>h.length)).toEqual([2,1]);
  expect(result.hits[0][1].now).toBeGreaterThan(result.hits[0][0].now+32);
  expect(result.hits[1][0].now).toBeGreaterThanOrEqual(result.hits[0][1].now);
  expect(result.hits[0][1].amount).toBeLessThan(result.hits[0][0].amount);
  expect(result.active).toBe(0);
});

test('an initial return remains valid next to the arena boundary when its visual orbit crosses the edge',async({page})=>{
  await fixture(page,{points:[[112,640]]});
  await page.evaluate(()=>window.ricochetFixture.scene.player.body.reset(200,640));
  await attack(page);await advance(page,1600);const result=await read(page);
  expect(result.hits[0].map(h=>h.amount)).toEqual([20,12]);
  expect(result.active).toBe(0);
});

for(const rank of [1,2,3]) {
  test(`rank ${rank} stops after its distinct-target budget while the first return stays free`,async({page})=>{
    await fixture(page,{rank,points:[[1060,640],[1130,720],[1210,700],[1290,760],[1380,730]]});
    await attack(page);await advance(page,2500);const result=await read(page);
    expect(result.hits.map(h=>h.length)).toEqual([2,...Array(rank).fill(1),...Array(4-rank).fill(0)]);
    expect(result.active).toBe(0);
  });
}

test('ricochet activates with spare penetration even when no enemy is on the forward trajectory',async({page})=>{
  await fixture(page,{pierces:4,points:[[1060,640],[1080,750]]});
  await page.evaluate(()=>window.ricochetFixture.scene.upgrades.build.learnCore('archer-overpierce'));
  await attack(page);await advance(page,1800);const result=await read(page);
  expect(result.hits.map(h=>h.length)).toEqual([2,1]);
  expect(result.hits.flat().every(h=>Number.isFinite(h.amount)&&h.amount>0&&h.amount<=60)).toBe(true);
  expect(result.active).toBe(0);
});

test('all three volley arrows keep tracking a shared bounce target after its direction changes',async({page})=>{
  await fixture(page,{count:3,points:[[1060,640],[1180,730]]});await attack(page);
  await page.evaluate(()=>{
    const f=window.ricochetFixture;
    for(let i=0;i<80&&f.enemies[0].fixtureHits.length<6;i++,f.now+=16)f.scene.combat.tick(f.now,f.enemies);
    if(f.enemies[0].fixtureHits.length!==6||f.enemies[1].fixtureHits.length)throw new Error('Expected volley between return and next impact');
    f.enemies[1].body.reset(1160,560);
  });
  await advance(page,2000);const result=await read(page);
  expect(result.hits.map(h=>h.length)).toEqual([6,3]);expect(result.active).toBe(0);
});

test('a bounce target dying in flight is replaced without consuming another cross-target hit',async({page})=>{
  await fixture(page,{points:[[1060,640],[1140,720],[1200,680]]});await attack(page);
  await page.evaluate(()=>{
    const f=window.ricochetFixture;
    for(let i=0;i<80&&f.enemies[0].fixtureHits.length<2;i++,f.now+=16)f.scene.combat.tick(f.now,f.enemies);
    if(f.enemies[0].fixtureHits.length!==2||f.enemies[1].fixtureHits.length)throw new Error('Expected arrow in its paid bounce flight');
    f.enemies[1].destroy();
  });
  await advance(page,2000);const result=await read(page);
  expect(result.hits.map(h=>h.length)).toEqual([2,0,1]);expect(result.active).toBe(0);
});

test('actual penetration is retained alongside the finite initial return and bounded distinct-target bounces',async({page})=>{
  await fixture(page,{rank:2,pierces:2,points:[[1060,640],[1140,640],[1190,750],[1290,740],[1430,760]]});
  await page.evaluate(()=>window.ricochetFixture.scene.upgrades.build.learnCore('archer-overpierce'));
  await attack(page);await advance(page,2500);const result=await read(page);
  expect(result.hits[0]).toHaveLength(2);
  expect(result.hits[1]).toHaveLength(1);
  expect(result.hits.slice(1).every(h=>h.length<=1)).toBe(true);
  expect(result.hits.filter(h=>h.length).length).toBeGreaterThanOrEqual(3);
  expect(result.hits.filter(h=>h.length).length).toBeLessThanOrEqual(5);
  expect(result.hits.flat().every(h=>Number.isFinite(h.amount)&&h.amount<=60)).toBe(true);
  expect(result.active).toBe(0);
});

test('a first-hit kill skips the impossible return and still seeks a live enemy',async({page})=>{
  await fixture(page,{points:[[1060,640],[1140,720]]});
  await page.evaluate(()=>window.ricochetFixture.enemies[0].health=20);
  await attack(page);await advance(page,1800);const result=await read(page);
  expect(result.hits.map(h=>h.length)).toEqual([1,1]);expect(result.active).toBe(0);
});

test('a target dying during the return delay cannot receive stale damage or prevent a live-target bounce',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await fixture(page,{points:[[1060,640],[1140,720]]});await attack(page);
  await page.evaluate(()=>{
    const f=window.ricochetFixture;
    for(let i=0;i<50&&!f.enemies[0].fixtureHits.length;i++,f.now+=16)f.scene.combat.tick(f.now,f.enemies);
    if(f.enemies[0].fixtureHits.length!==1)throw new Error('Expected first arrow impact');
    f.enemies[0].destroy();
  });
  await advance(page,1800);const result=await read(page);
  expect(result.hits.map(h=>h.length)).toEqual([1,1]);expect(result.active).toBe(0);expect(errors).toEqual([]);
});

test('ricochet acquisition respects real static cover instead of damaging the target behind it',async({page})=>{
  await fixture(page,{rank:3,points:[[1060,640],[1210,640]]});
  await page.evaluate(()=>{
    const f=window.ricochetFixture;
    const cover=f.scene.physics.add.staticImage(1130,640,'bullet').setDisplaySize(24,240).refreshBody();
    f.obstacles.add(cover);f.scene.combat.refreshObstacles(f.obstacles);
  });
  await attack(page);await advance(page,2000);const result=await read(page);
  expect(result.hits.map(h=>h.length)).toEqual([2,0]);expect(result.active).toBe(0);
});

test('clear cancels an in-flight return and reused projectile slots start with an independent return budget',async({page})=>{
  await fixture(page,{count:3});await attack(page);
  const interrupted=await page.evaluate(()=>{
    const f=window.ricochetFixture;
    for(let i=0;i<50&&f.enemies[0].fixtureHits.length<3;i++,f.now+=16)f.scene.combat.tick(f.now,f.enemies);
    const before=f.enemies[0].fixtureHits.length;
    f.scene.combat.clear();
    return {before,active:f.scene.combat.projectiles.filter(p=>p.active).length};
  });
  expect(interrupted).toEqual({before:3,active:0});
  await advance(page,1000);expect((await read(page)).hits[0]).toHaveLength(3);
  await page.evaluate(()=>window.ricochetFixture.enemies[0].fixtureHits=[]);
  expect(await attack(page)).toBe(3);await advance(page,1600);const reused=await read(page);
  expect(reused.hits[0]).toHaveLength(6);expect(reused.active).toBe(0);expect(reused.pool).toBe(64);
});
