import { test, expect } from '@playwright/test';

const readAudio = page => page.evaluate(() => {
  const game = window.__LUMENFALL__;
  const manager = game.registry.get('audio');
  return {
    bgm: manager?.currentBgm ?? null,
    muted: manager?.isMuted ?? true,
    globalMute: game.sound.mute,
    locked: game.sound.locked,
    playing: game.sound.getAllPlaying().map(sound => sound.key),
    instances: [...new Set(game.sound.getAll().map(sound => sound.key))],
  };
});

test('audio: the boot loader ships the whole bank, the class track loops and combat plays effects', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByTestId('class-mage').click();
  await page.getByTestId('start').click();
  await expect.poll(async () => page.evaluate(() => window.__LUMENFALL__.scene.getScene('Game')?.mode)).toBe('playing');
  // Keep the hero alive so the audio assertions are not interrupted by the death screen.
  await page.evaluate(() => { const scene = window.__LUMENFALL__.scene.getScene('Game'); scene.player.invulnerableUntil = scene.clock + 600000; });

  const cached = await page.evaluate(() => window.__LUMENFALL__.cache.audio.getKeys());
  expect(cached.filter(key => key.startsWith('bgm-')).length).toBe(4);
  expect(cached.filter(key => key.startsWith('sfx-')).length).toBe(15);

  // The chosen class owns the track, and it keeps looping while the run continues.
  await expect.poll(async () => (await readAudio(page)).playing).toContain('bgm-mage');
  const audio = await readAudio(page);
  expect(audio.bgm).toBe('bgm-mage');
  expect(audio.muted).toBe(false);
  expect(audio.globalMute).toBe(false);

  // Real attacks spawn real effect voices.
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyJ');
  expect((await readAudio(page)).instances).toContain('sfx-shoot');

  // The sound button mutes the whole game and can be switched back on.
  await page.getByTestId('sound').click();
  expect((await readAudio(page)).muted).toBe(true);
  // The global mute is a Web Audio gain, so it settles with the next audio quantum.
  await expect.poll(async () => (await readAudio(page)).globalMute).toBe(true);
  await expect(page.getByTestId('sound')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('sound').click();
  expect((await readAudio(page)).muted).toBe(false);
  await expect.poll(async () => (await readAudio(page)).globalMute).toBe(false);
  expect(errors).toEqual([]);
});

test('audio: the automatic reward notice stays readable but clearly dimmer', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('class-warrior').click();
  await page.getByTestId('start').click();
  await expect.poll(async () => page.evaluate(() => window.__LUMENFALL__.scene.getScene('Game')?.mode)).toBe('playing');
  await page.evaluate(() => {
    const scene = window.__LUMENFALL__.scene.getScene('Game');
    scene.hud.announceAutoUpgrade({ id: 'power', name: '快乐加一', icon: '✦', tag: '攻击强化', description: '攻击力 30 → 38', level: 1 }, 11);
  });
  const message = page.getByTestId('auto-upgrade-barrage').locator('.auto-upgrade-message.is-scrolling');
  await expect(message).toBeVisible();
  const opacity = await message.evaluate(node => Number(getComputedStyle(node).opacity));
  expect(opacity).toBeLessThan(0.7);
  expect(opacity).toBeGreaterThan(0.2);
});
