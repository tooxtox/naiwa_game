/**
 * Verifies that the shipped audio bank is loaded and really plays.
 *
 * Works against the dev server (where the Phaser game object is exposed) and
 * against a production build (where only the network traffic can be observed).
 *
 * Usage: node scripts/verify-audio.mjs [baseUrl]
 */
import { chromium } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8080/';
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const audioResponses = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));
page.on('response', (response) => {
  const url = response.url();
  if (/\/assets\/audio\//.test(url)) audioResponses.push({ file: url.split('/').pop(), status: response.status() });
});

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const hasGame = await page.evaluate(() => Boolean(window.__LUMENFALL__?.scene?.getScene('Menu')?.scene?.isActive()));

let state = { mode: 'network-only' };
if (hasGame) {
  const lockedBefore = await page.evaluate(() => window.__LUMENFALL__.sound.locked);
  await page.getByTestId('start').click();
  await page.waitForTimeout(1200);
  state = await page.evaluate(() => {
    const game = window.__LUMENFALL__;
    const manager = game.registry.get('audio');
    const playing = game.sound.getAllPlaying().map((sound) => sound.key);
    return {
      lockedBeforeGesture: game.sound.locked,
      currentBgm: manager?.currentBgm ?? null,
      bgmPlaying: Boolean(manager?.currentBgm) && playing.includes(manager.currentBgm),
      cachedAudio: game.cache.audio.getKeys().length,
      mode: game.scene.getScene('Game')?.mode,
    };
  });
  state.lockedBeforeGesture = lockedBefore;
  const effects = await page.evaluate(() => {
    const manager = window.__LUMENFALL__.registry.get('audio');
    for (const id of ['hit', 'crit', 'upgrade', 'ultimate']) manager.sfx(id, 0.8);
    return [...new Set(window.__LUMENFALL__.sound.getAll().map((sound) => sound.key))].filter((key) => key.startsWith('sfx-'));
  });
  state.effectInstances = effects;
}

const result = { ...state, requestedAudioFiles: audioResponses.length, failedAudioRequests: audioResponses.filter((entry) => entry.status !== 200), errors };
console.log(JSON.stringify(result, null, 2));
const filesOk = audioResponses.length >= 19 && !result.failedAudioRequests.length;
const playbackOk = hasGame ? Boolean(state.bgmPlaying) && (state.effectInstances?.length ?? 0) >= 4 : true;
await browser.close();
if (!filesOk || !playbackOk || errors.length) process.exitCode = 1;
