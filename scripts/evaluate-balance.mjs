import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

// Independent server: never interrupts an active local game or shares a live
// user's Phaser state. No production endpoint, backend or paid service is used.
const server=await createServer({configFile:resolve('vite/config.dev.mjs'),cacheDir:resolve('node_modules/.vite-balance-110'),server:{host:'127.0.0.1',port:0,open:false}});
let browser;
try {
  await server.listen();
  const address=server.httpServer.address();
  if(!address||typeof address==='string')throw new Error('Could not find the balance server port.');
  const url=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);
  const theory=await page.evaluate(async()=>{
    const {theoreticalBalanceReport}=await import('/src/game/systems/BalanceEvaluation.ts');
    return theoreticalBalanceReport();
  });
  const engine=[];const wallStart=performance.now();
  for(const classId of ['warrior','mage','archer']) {
    await page.goto(url);
    await page.getByTestId(`class-${classId}`).click();await page.getByTestId('start').click();
    await page.waitForFunction(()=>{
      const scene=window.__LUMENFALL__?.scene.getScene('Game');return scene?.mode==='playing'&&scene.player&&scene.combat;
    });
    const rows=await page.evaluate(async classId=>{
      const {BALANCE_ROUTES,BALANCE_STAGES}=await import('/src/game/systems/BalanceEvaluation.ts');
      const {runEngineBalance}=await import('/src/game/systems/BalanceHarness.ts');
      const scene=window.__LUMENFALL__.scene.getScene('Game');
      scene.scene.pause();scene.physics.pause();
      const rows=[];
      for(const stage of BALANCE_STAGES)for(const core of BALANCE_ROUTES[classId])for(const rank of [0,1,3]) {
        for(const formation of ['single','cluster','line'])rows.push(runEngineBalance(scene,{classId,stage,core,rank,formation}));
        if(rank===3)for(const formation of ['single','cluster','line'])rows.push(runEngineBalance(scene,{classId,stage,core,rank,formation,legacyMultishot:true}));
        if(rank===1||rank===3)rows.push(runEngineBalance(scene,{classId,stage,core,rank,formation:'boss',ultimates:true,parry:true}));
      }
      return rows;
    },classId);
    engine.push(...rows);
    console.log(`${classId}: ${rows.length} real-engine fixed-target scenarios completed`);
  }
  if(errors.length)throw new Error(`Engine errors: ${errors.join('; ')}`);
  const report={
    version:'1.1.0',seed:'0x110F20',generatedAt:new Date().toISOString(),
    measurement:{node:process.version,platform:`${os.platform()} ${os.arch()}`,cpu:os.cpus()[0]?.model,browser:await browser.version(),viewport:'1280×720',simulationHz:60,wallMs:Math.round(performance.now()-wallStart)},
    assumptions:[
      'The theory rows are analytical ideal-geometry estimates with expected crits, perfect accuracy and no travel, dodging or guard downtime. A finite seeded run can differ from the crit expectation.',
      'The engine rows execute the actual CombatSystem, projectiles, BuildSystem, Enemy.hit/Boss.hit, stagger and death paths with stationary targets and no cover.',
      'legacyMultishot rows replay the old full-damage extra shots through the same real engine while holding other 1.1 rules fixed; these isolate this one tuning change, not a whole-build historical benchmark.',
      'The boss fixture scripts a perfect parry every 6 seconds and casts each ready ultimate. The boss keeps its real authored HP, toughness, phase logic and cooldowns; incoming damage/locomotion are excluded.',
      'Early/middle/late are explicit controlled stat snapshots, not claims about natural reward totals at a particular wave. Core ranks 0/1/3 isolate investment depth.',
      'All simulations are automated. They do not establish real-player DPS, campaign length, mobile FPS or subjective play quality.',
      'A new 1.1.0 rolling budget limits attack-hit charge to 12 per 500ms and leech to min(12% max HP, five leech hits) per second. Kill and perfect-parry charge are unchanged.',
      'Boss HP-ratio damage ignores finality scaling and the broken multiplier. Each ultimate has a 42% max-HP per-boss cast ceiling; fixed damage retains both upgrades and broken rewards.',
    ],
    theory,engine,errors,
  };
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/balance-110.json',JSON.stringify(report,null,2)+'\n');
  console.log(`Wrote artifacts/balance-110.json (${theory.rows.length} theory rows, ${engine.length} engine rows; no player-performance claims).`);
} finally {
  await browser?.close();await server.close();
}
