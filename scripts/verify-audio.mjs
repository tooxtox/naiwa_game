/**
 * Verifies that the shipped audio bank is loaded and really plays.
 *
 * Works against the dev server (where the Phaser game object is exposed) and
 * against a production build (where only the network traffic can be observed).
 *
 * Usage: node scripts/verify-audio.mjs [baseUrl]
 */
import { chromium } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';

// Decoding WAV data catches a playing-but-silent source before browser checks.
const audioDir = new URL('../public/assets/audio/', import.meta.url);
const waveformChecks = { checked: 0, silent: [], clipped: [], invalidEdges: [], invalidClassDurations: [] };
for (const file of readdirSync(audioDir).filter(file => file.endsWith('.wav'))) {
  const wav = readFileSync(new URL(file, audioDir));
  const frames = wav.readUInt32LE(40) / 2;
  const duration = frames / wav.readUInt32LE(24);
  let energy = 0;
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    const sample = wav.readInt16LE(44 + i * 2) / 32767;
    peak = Math.max(peak, Math.abs(sample));
    energy += sample * sample;
  }
  waveformChecks.checked++;
  if (Math.sqrt(energy / frames) < 0.001) waveformChecks.silent.push(file);
  if (peak >= 0.999) waveformChecks.clipped.push(file);
  if (wav.readInt16LE(44) !== 0 || wav.readInt16LE(wav.length - 2) !== 0) waveformChecks.invalidEdges.push(file);
  if (/sfx-(warrior|mage|archer)-/.test(file) && (duration < 0.1 || duration > 0.35)) waveformChecks.invalidClassDurations.push(file);
}

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
  state.classActionPlayback = await page.evaluate(() => {
    const game = window.__LUMENFALL__;
    const manager = game.registry.get('audio');
    const played = [];
    for (const classId of ['warrior', 'mage', 'archer']) {
      for (const action of ['attack', 'dash', 'guard']) {
        manager.action(classId, action);
        const key = `sfx-${classId}-${action}`;
        if (game.sound.getAllPlaying().some(sound => sound.key === key)) played.push(key);
      }
    }
    return played;
  });
}

const result = { ...state, waveformChecks, requestedAudioFiles: new Set(audioResponses.map(entry => entry.file)).size, failedAudioRequests: audioResponses.filter((entry) => entry.status !== 200), errors };
console.log(JSON.stringify(result, null, 2));
const filesOk = result.requestedAudioFiles >= 28 && !result.failedAudioRequests.length;
const waveformsOk = waveformChecks.checked === 24 && ['silent', 'clipped', 'invalidEdges', 'invalidClassDurations'].every(key => waveformChecks[key].length === 0);
const playbackOk = hasGame ? Boolean(state.bgmPlaying) && (state.effectInstances?.length ?? 0) >= 4 && state.classActionPlayback?.length === 9 : true;
await browser.close();
if (!filesOk || !waveformsOk || !playbackOk || errors.length) process.exitCode = 1;
