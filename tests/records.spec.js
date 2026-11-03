import { test, expect } from '@playwright/test';

test('records separate careers and modes, preserve maxima and only time victories', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { recordRun, readRecords, RECORDS_KEY } = await import('/src/game/systems/RunRecords.ts');
    localStorage.removeItem(RECORDS_KEY);
    const stats = { seed: 'records-test', classId: 'warrior', wave: 7, kills: 25, upgrades: 5, elapsed: 85, bestCombo: 14, mode: 'campaign' };
    recordRun(stats, false);
    recordRun({ ...stats, wave: 50, elapsed: 700, bestCombo: 19, kills: 300 }, true);
    recordRun({ ...stats, wave: 50, elapsed: 800, bestCombo: 5, kills: 100 }, true);
    recordRun({ ...stats, classId: 'mage', mode: 'quick', wave: 10, elapsed: 95 }, true);
    recordRun({ ...stats, classId: 'mage', mode: 'quick', wave: 10, elapsed: 90 }, true);
    return readRecords();
  });
  expect(result.campaign.warrior).toEqual({ highestWave: 50, fastestWin: 700, bestCombo: 19, mostKills: 300, runs: 3, wins: 2 });
  expect(result.quick.mage).toEqual({ highestWave: 10, fastestWin: 90, bestCombo: 14, mostKills: 25, runs: 2, wins: 2 });
  expect(result.quick.warrior.runs).toBe(0); expect(result.campaign.mage.runs).toBe(0);
  await page.reload();
  await expect(page.getByTestId('selected-record')).toContainText('最高 50/50');
  await page.locator('.menu-details summary').click();
  await expect(page.getByTestId('local-records')).toContainText('10 波快速挑战');
  await expect(page.getByTestId('local-records')).toContainText('最快 01:30');
});

test('corrupt, old partial and inaccessible local storage cannot block records', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { recordRun, readRecords, RECORDS_KEY } = await import('/src/game/systems/RunRecords.ts');
    localStorage.setItem(RECORDS_KEY, '{broken'); const corrupt = readRecords();
    localStorage.setItem(RECORDS_KEY, JSON.stringify({ campaign: { warrior: { highestWave: 99, bestCombo: 12, fastestWin: -8, mostKills: 'bad' } } }));
    const old = readRecords();
    const originalGet = Storage.prototype.getItem, originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new DOMException('denied', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('denied', 'SecurityError'); };
    const stats = { seed: 'blocked', classId: 'archer', wave: 8, kills: 9, upgrades: 2, elapsed: 40, bestCombo: 6, mode: 'quick' };
    const blocked = recordRun(stats, false), retained = readRecords();
    Storage.prototype.getItem = originalGet; Storage.prototype.setItem = originalSet;
    return { corrupt, old, blocked, retained };
  });
  expect(result.corrupt.campaign.warrior.highestWave).toBe(0);
  expect(result.old.campaign.warrior).toMatchObject({ highestWave: 50, bestCombo: 12, fastestWin: null, mostKills: 0 });
  expect(result.old.quick.archer.runs).toBe(0);
  expect(result.blocked.quick.archer).toMatchObject({ highestWave: 8, runs: 1 });
  expect(result.retained.quick.archer).toMatchObject({ highestWave: 8, runs: 1 });
});

test('comfort preferences validate persisted fields and notify active controls', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('naiwa.preferences.v1', JSON.stringify({ reducedMotion: true, reducedShake: 'bad', touchLayout: 'unknown' })));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { getPreferences, setPreference } = await import('/src/game/systems/Preferences.ts');
    const before = getPreferences(); const events = [];
    window.addEventListener('naiwasettingschange', event => events.push(event.detail));
    setPreference('touchLayout', 'compact'); setPreference('reducedShake', true);
    return { before, after: getPreferences(), saved: JSON.parse(localStorage.getItem('naiwa.preferences.v1')), events };
  });
  expect(result.before).toEqual({ reducedMotion: true, reducedShake: false, touchLayout: 'arc' });
  expect(result.after).toEqual({ reducedMotion: true, reducedShake: true, touchLayout: 'compact' });
  expect(result.saved).toEqual(result.after); expect(result.events).toHaveLength(2);
  await expect(page.locator('.lumen-ui')).toHaveClass(/reduced-motion/);
});

test('storage quota failure retains newer records even when the older file is still readable',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {recordRun,readRecords}=await import('/src/game/systems/RunRecords.ts');
    const stats={seed:'quota',classId:'warrior',mode:'quick',wave:3,kills:6,upgrades:1,elapsed:12,bestCombo:4};
    recordRun(stats,false);const originalSet=Storage.prototype.setItem;
    Storage.prototype.setItem=()=>{throw new DOMException('full','QuotaExceededError');};
    recordRun({...stats,wave:8,kills:60,bestCombo:14},false);const retained=readRecords();
    Storage.prototype.setItem=originalSet;recordRun({...stats,wave:10,elapsed:70},true);
    return{retained:retained.quick.warrior,recovered:readRecords().quick.warrior};
  });
  expect(result.retained).toMatchObject({highestWave:8,mostKills:60,bestCombo:14,runs:2,wins:0});
  expect(result.recovered).toMatchObject({highestWave:10,mostKills:60,bestCombo:14,runs:3,wins:1,fastestWin:70});
});
