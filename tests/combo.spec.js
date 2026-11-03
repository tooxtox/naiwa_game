import { test, expect } from '@playwright/test';

const read = page => page.evaluate(() => {
  const s = window.__LUMENFALL__.scene.getScene('Game'), p = s.player;
  if (!s.scene.isActive() || !p?.body) return { mode: 'loading' };
  return {
    mode: s.mode, clock: s.clock, combo: p.combo, bestCombo: s.stats.bestCombo,
    attackStep: p.attackStep, nextAttack: p.nextAttack, nextGuard: p.nextGuard,
    guardUntil: p.guardUntil, result: p.lastDamageResult, charge: p.ultimateCharge,
    healths: (window.comboTargets ?? []).map(e => e.health),
    shots: s.children.list.filter(o => o.visible && ['hero-magic', 'hero-arrow'].includes(o.texture?.key)).length,
    attacks: window.comboSamples?.attacks ?? [], hits: window.comboSamples?.hits ?? [], expirations: window.comboSamples?.expirations ?? [],
  };
});

async function start(page, classId = 'warrior') {
  await page.goto('/');
  await page.getByTestId(`class-${classId}`).click();
  await page.getByTestId('start').click();
  await expect.poll(async () => (await read(page)).mode).toBe('playing');
}

// Existing enemies keep their real hit, projectile, and counter paths. The
// fixture fixes actor positions, HP and critical randomness, then observes
// rendered frames. It never writes combo/attackStep or calls damage/hit helpers.
async function fixture(page, { distance = 90, nearby = 1 } = {}) {
  return page.evaluate(({ distance, nearby }) => {
    const game = window.__LUMENFALL__, s = game.scene.getScene('Game'), p = s.player;
    s.combat.clear(); p.body.reset(960, 640); p.invulnerableUntil = s.clock + 600000;
    p.stats.critChance = 0;
    window.comboTargets = [...s.waves.alive];
    comboTargets.forEach((e, i) => {
      e.body.reset(i < nearby ? 960 + distance : 1720, i < nearby ? 640 + (i - (nearby - 1) / 2) * 22 : 180 + i * 70);
      e.stun(s.clock, 600000); e.body.moves = false; e.health = e.maxHealth = 1000000;
    });
    const samples = window.comboSamples = { attacks: [], hits: [], expirations: [] };
    let lastAttack = p.nextAttack, healths = comboTargets.map(e => e.health), previousClock = s.clock, previousCombo = p.combo;
    window.collectCombo = () => {
      const weapon = s.children.getByName('player-weapon');
      if (p.didAttack && p.nextAttack !== lastAttack) {
        lastAttack = p.nextAttack;
        samples.attacks.push({ clock: s.clock, step: p.attackStep, weaponStep: weapon.getData('combo'), action: weapon.getData('action') });
      }
      const current = comboTargets.map(e => e.health), damage = current.map((hp, i) => healths[i] - hp);
      if (damage.some(amount => amount > 0)) samples.hits.push({ clock: s.clock, damage, combo: p.combo, bestCombo: s.stats.bestCombo });
      if (previousCombo > 0 && p.combo === 0) samples.expirations.push({ clock: s.clock, previousClock, previousCombo });
      previousClock = s.clock; previousCombo = p.combo;
      healths = current;
    };
    game.events.on('postrender', window.collectCombo);
    return { healths, damage: p.stats.damage };
  }, { distance, nearby });
}

async function holdUntil(page, predicate, timeout = 8000) {
  await page.keyboard.down('KeyJ');
  await expect.poll(async () => predicate(await read(page)), { intervals: [10], timeout }).toBe(true);
  await page.keyboard.up('KeyJ');
  return read(page);
}

async function lethalEnemyStrike(page) {
  await page.evaluate(() => {
    const s = window.__LUMENFALL__.scene.getScene('Game'), e = comboTargets[0];
    s.player.invulnerableUntil = 0; e.body.reset(s.player.x + 58, s.player.y);
    e.damage = 99999; e.stunUntil = 0; e.hurtUntil = 0;
    e.nextAttack = s.clock + 10000; e.windupUntil = s.clock + 30;
  });
  await expect(page.locator('.death-dialog')).toBeVisible();
}

for (const classId of ['warrior', 'mage', 'archer']) {
  test(`${classId}: holding J earns seven real hits, an uncapped HUD/record and a separate repeating three-step weapon`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await start(page, classId); const initial = await fixture(page);
    const result = await holdUntil(page, s => s.combo >= 7);
    expect(result.attacks).toHaveLength(7); expect(result.hits).toHaveLength(7);
    expect(result.combo).toBe(7); expect(result.bestCombo).toBe(7);
    expect(result.attacks.map(a => a.step)).toEqual([1, 2, 3, 1, 2, 3, 1]);
    expect(result.attacks.map(a => a.weaponStep)).toEqual([1, 2, 3, 1, 2, 3, 1]);
    expect(result.attacks.every(a => a.action === 'attack')).toBe(true);
    const damages = result.hits.map(hit => hit.damage[0]);
    expect(damages).toEqual(classId === 'warrior' ? [30, 30, 39, 30, 30, 39, 30] : Array(7).fill(initial.damage));
    expect(result.healths[0]).toBe(initial.healths[0] - damages.reduce((sum, n) => sum + n, 0));
    expect(result.hits.every(hit => hit.bestCombo === hit.combo)).toBe(true);
    await expect(page.locator('[data-field="combo"]')).toHaveText('7 连击');
    await expect(page.locator('[data-field="combo"]')).toBeVisible();
    await page.screenshot({ path: `artifacts/combo-${classId}-seven-hits.png` });
    await lethalEnemyStrike(page);
    await expect(page.locator('.death-run-details > span').first()).toHaveText('最高连击 7');
    expect(errors).toEqual([]);
  });
}

test('melee cleaves count each victim while every third action alone retains its 1.3 damage multiplier', async ({ page }) => {
  await start(page); await fixture(page, { distance: 90, nearby: 4 });
  const result = await holdUntil(page, s => s.attacks.length >= 7);
  expect(result.combo).toBe(28); expect(result.bestCombo).toBe(28);
  expect(result.hits.map(hit => hit.combo)).toEqual([4, 8, 12, 16, 20, 24, 28]);
  expect(result.hits.map(hit => hit.damage)).toEqual([30, 30, 39, 30, 30, 39, 30].map(amount => Array(4).fill(amount)));
  expect(result.attacks.map(a => a.weaponStep)).toEqual([1, 2, 3, 1, 2, 3, 1]);
  await expect(page.locator('[data-field="combo"]')).toHaveText('28 连击');
});

for (const classId of ['mage', 'archer']) {
  test(`${classId}: a flying projectile earns no early combo, and a later real ultimate hit updates the record without another J attack`, async ({ page }) => {
    await start(page, classId); const initial = await fixture(page, { distance: 300 });
    const fired = await holdUntil(page, s => s.attacks.length === 1);
    expect(fired.shots).toBeGreaterThan(0); expect(fired.healths).toEqual(initial.healths);
    expect(fired.combo).toBe(0); expect(fired.bestCombo).toBe(0);
    await expect.poll(async () => (await read(page)).combo, { intervals: [10], timeout: 1600 }).toBe(1);
    const landed = await read(page); expect(landed.bestCombo).toBe(1);
    expect(landed.healths[0]).toBe(initial.healths[0] - initial.damage);
    // Only the charge meter is supplied. Q still schedules the real meteor or
    // volley, including its windup/flight and successful-hit callback.
    await page.evaluate(() => window.__LUMENFALL__.scene.getScene('Game').player.addUltimateCharge(100));
    await page.keyboard.press('KeyQ');
    await expect.poll(async()=>(await read(page)).charge,{intervals:[10]}).toBe(0);
    const casting = await read(page);
    expect(casting.combo).toBe(1); expect(casting.bestCombo).toBe(1);
    expect(casting.healths).toEqual(landed.healths);
    await expect.poll(async () => (await read(page)).bestCombo, { intervals: [10], timeout: 2000 }).toBeGreaterThan(1);
    const hit = await read(page);
    expect(hit.healths[0]).toBeLessThan(landed.healths[0]); expect(hit.bestCombo).toBe(hit.combo);
    expect(hit.attacks).toHaveLength(1);
    expect(hit.hits.at(-1).bestCombo).toBe(hit.hits.at(-1).combo);
  });
}

test('pause preserves the hit window; continued empty swings cannot save it, and the next hit restarts at one', async ({ page }) => {
  await start(page); await fixture(page);
  const first = await holdUntil(page, s => s.combo === 1);
  await expect.poll(async () => (await read(page)).clock - first.hits[0].clock, { intervals: [10] }).toBeGreaterThanOrEqual(300);
  await page.keyboard.press('Escape'); await expect(page.locator('.pause-dialog')).toBeVisible();
  const frozen = await read(page); await page.waitForTimeout(1300);
  const paused = await read(page); expect(paused.clock).toBe(frozen.clock); expect(paused.combo).toBe(1);
  await page.getByTestId('resume').click();
  const resumed = await holdUntil(page, s => s.combo === 2);
  expect(resumed.bestCombo).toBe(2);
  // Keep attacking into empty space while the last genuine hit gets older.
  await page.evaluate(() => comboTargets[0].body.reset(1720, 900));
  const empty = await holdUntil(page, s => s.combo === 0 && s.attacks.length >= resumed.attacks.length + 3);
  expect(empty.healths).toEqual(resumed.healths); expect(empty.bestCombo).toBe(2);
  expect(empty.clock - resumed.hits.at(-1).clock).toBeGreaterThan(1100);
  const expiry = empty.expirations.at(-1), lastHit = resumed.hits.at(-1).clock;
  expect(expiry.previousCombo).toBe(2); expect(expiry.previousClock - lastHit).toBeLessThanOrEqual(1100);
  expect(expiry.clock - lastHit).toBeGreaterThan(1100); expect(expiry.clock - lastHit).toBeLessThanOrEqual(1140);
  const unexpired = empty.hits.at(-1);
  expect(unexpired.combo).toBe(2); expect(unexpired.bestCombo).toBe(2);
  await expect(page.locator('[data-field="combo"]')).toBeHidden();
  const lastAttack = empty.attacks.at(-1).clock;
  await expect.poll(async () => (await read(page)).clock - lastAttack, { intervals: [10] }).toBeGreaterThan(1000);
  await page.evaluate(() => comboTargets[0].body.reset(1050, 640));
  const restarted = await holdUntil(page, s => s.combo === 1);
  expect(restarted.hits).toHaveLength(3); expect(restarted.bestCombo).toBe(2);
  expect(restarted.attackStep).toBe(1); expect(restarted.attacks.at(-1).weaponStep).toBe(1);
});

test('a real incoming strike triggers a multi-target guard counter and immediately records its successful hits without J', async ({ page }) => {
  await start(page, 'mage'); const initial = await fixture(page, { distance: 70, nearby: 3 });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await read(page)).guardUntil, { intervals: [10] }).toBeGreaterThan(0);
  await page.evaluate(() => {
    const s = window.__LUMENFALL__.scene.getScene('Game'), e = comboTargets[0];
    s.player.invulnerableUntil = 0; e.body.reset(s.player.x + 58, s.player.y);
    e.stunUntil = 0; e.hurtUntil = 0; e.nextAttack = s.clock + 10000; e.windupUntil = s.clock + 25;
  });
  await expect.poll(async () => (await read(page)).result, { intervals: [10] }).toBe('parried');
  const counter = await read(page);
  expect(counter.healths).toEqual(initial.healths.map((hp, i) => i < 3 ? hp - Math.round(hp * .35 + 24 * 1.6) : hp));
  expect(counter.combo).toBe(3); expect(counter.bestCombo).toBe(3);
  expect(counter.attacks).toHaveLength(0); expect(counter.attackStep).toBe(0);
  await expect(page.locator('[data-field="combo"]')).toHaveText('3 连击');
  // The perfect-parry toast temporarily takes this same header space.
  await expect.poll(() => page.locator('[data-field="combo"]').evaluate(element => element.hidden)).toBe(false);
});
