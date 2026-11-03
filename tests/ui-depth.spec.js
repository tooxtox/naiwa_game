import { test, expect } from '@playwright/test';

const active = page => page.evaluate(() => {
  const scene = window.__LUMENFALL__?.scene.getScene('Game');
  return !!scene?.scene.isActive() && !!scene?.player?.body;
});

for (const [width, height] of [[667, 375], [844, 390]]) {
  test(`mobile ${width}x${height}: concise HUD, saved layouts and readable core upgrades`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    for (const id of ['class-warrior', 'class-mage', 'class-archer', 'mode-campaign', 'mode-quick', 'start']) {
      const box = await page.getByTestId(id).boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    await page.screenshot({ path: `artifacts/depth-menu-${width}.png` });
    await page.getByTestId('start').tap(); await expect.poll(() => active(page)).toBe(true);
    await page.evaluate(() => { const s = window.__LUMENFALL__.scene.getScene('Game'); s.player.invulnerableUntil = s.clock + 600000; s.waves.alive.forEach(e => e.stun(s.clock, 600000)); });
    await expect(page.locator('.run-meta')).toBeHidden(); await expect(page.locator('.target-readout')).toBeHidden();
    for (const layout of ['compact', 'arc']) {
      await page.getByTestId('pause').tap(); await page.getByTestId('setting-layout').selectOption(layout);
      await page.getByTestId('setting-shake').check(); await page.getByTestId('setting-motion').check();
      await expect(page.getByTestId('build-summary')).toBeVisible(); await page.screenshot({ path: `artifacts/depth-pause-${width}-${layout}.png` });
      await page.getByTestId('resume').tap(); await expect(page.getByTestId('touch-controls')).toHaveAttribute('data-layout', layout);
      const boxes = []; for (const name of ['attack', 'guard', 'dash', 'ultimate']) { const b = await page.getByTestId(`touch-${name}`).boundingBox(); expect(b.x).toBeGreaterThanOrEqual(width / 3); expect(b.y).toBeGreaterThanOrEqual(90); expect(b.x + b.width).toBeLessThanOrEqual(width); expect(b.y + b.height).toBeLessThanOrEqual(height); boxes.push(b); }
      expect(boxes[0].width).toBeGreaterThan(Math.max(...boxes.slice(1).map(b => b.width)));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true); }
    }
    await page.evaluate(() => {
      const s = window.__LUMENFALL__.scene.getScene('Game'); s.pauseRun(); s.hud.setBuildInfo(['反击流 I：完美格挡触发强化冲击波']);
      s.hud.showUpgrade([{ id: 'test-core', name: '反击核心', description: '完美格挡释放强化冲击波，额外削减首领韧性。普通格挡获得短暂攻击强化。', icon: '◈', tag: '反击流', level: 1, maxLevel: 3, category: 'core', rarity: 'legendary' }, { id: 'test-basic', name: '快乐加一', description: '攻击力 30 → 38', icon: '✦', tag: '攻击', level: 2, maxLevel: 5, category: 'basic', rarity: 'common' }]);
    });
    await expect(page.locator('.core-dialog')).toContainText('核心改造');
    for (const card of await page.locator('.upgrade-card').all()) { expect(await card.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true); const box = await card.boundingBox(); expect(box.y + box.height).toBeLessThanOrEqual(height); }
    await page.screenshot({ path: `artifacts/depth-core-${width}.png` }); expect(errors).toEqual([]); await context.close();
  });
}

test('automatic growth uses one bounded stationary notification without pausing play', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('start').click(); await expect.poll(() => active(page)).toBe(true);
  const before = await page.evaluate(() => {
    const s = window.__LUMENFALL__.scene.getScene('Game'); s.player.invulnerableUntil = s.clock + 600000;
    for (let i = 0; i < 50; i++) s.hud.announceAutoUpgrade({ id: `notice-${i % 4}`, name: '快乐加一', description: '攻击力 30 → 38', icon: '✦', tag: '攻击', level: 2 }, 11 + i);
    return s.clock;
  });
  await expect(page.locator('.auto-upgrade-lane:not([hidden])')).toHaveCount(1);
  const first = await page.locator('.auto-upgrade-barrage').boundingBox(); await page.waitForTimeout(300);
  const next = await page.locator('.auto-upgrade-barrage').boundingBox(); expect(next.x).toBe(first.x); expect(first.width).toBeLessThanOrEqual(260);
  expect(await page.evaluate(() => { const s = window.__LUMENFALL__.scene.getScene('Game'); return { clock: s.clock, mode: s.mode, queue: s.hud.barrageQueue.size }; })).toMatchObject({ mode: 'playing', queue: 4 });
  expect(await page.evaluate(() => window.__LUMENFALL__.scene.getScene('Game').clock)).toBeGreaterThan(before);
  await page.waitForTimeout(2800); await expect(page.locator('.auto-upgrade-lane:not([hidden])')).toHaveCount(1);
});
