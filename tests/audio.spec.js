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
  await expect.poll(async () => page.evaluate(() => {const s=window.__LUMENFALL__.scene.getScene('Game');return s.scene.isActive()&&s.player?.body?s.mode:'loading';})).toBe('playing');
  // Keep the hero alive so the audio assertions are not interrupted by the death screen.
  await page.evaluate(() => { const scene = window.__LUMENFALL__.scene.getScene('Game'); scene.player.invulnerableUntil = scene.clock + 600000; });

  const cached = await page.evaluate(() => window.__LUMENFALL__.cache.audio.getKeys());
  expect(cached.filter(key => key.startsWith('bgm-')).length).toBe(4);
  expect(cached.filter(key => key.startsWith('sfx-')).length).toBe(24);

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
  expect((await readAudio(page)).instances).toContain('sfx-mage-attack');

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

test('audio: the automatic reward notice uses a compact high-contrast backplate', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('class-warrior').click();
  await page.getByTestId('start').click();
  await expect.poll(async () => page.evaluate(() => {const s=window.__LUMENFALL__.scene.getScene('Game');return s.scene.isActive()&&s.player?.body?s.mode:'loading';})).toBe('playing');
  await page.evaluate(() => {
    const scene = window.__LUMENFALL__.scene.getScene('Game');
    scene.hud.announceAutoUpgrade({ id: 'power', name: '快乐加一', icon: '✦', tag: '攻击强化', description: '攻击力 30 → 38', level: 1 }, 11);
  });
  const message = page.getByTestId('auto-upgrade-barrage').locator('.auto-upgrade-message.is-scrolling');
  await expect(message).toBeVisible();
  await expect.poll(() => message.evaluate(node => Number(getComputedStyle(node).opacity))).toBeGreaterThanOrEqual(0.9);
  const bounds = await message.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(260); expect(bounds.height).toBeLessThanOrEqual(80);
  expect(await message.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
});


for(const classId of ['warrior','mage','archer']) {
  test(`audio ${classId}: real attack, dash and guard start audible Web Audio sources with nonzero output`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await page.getByTestId(`class-${classId}`).click();await page.getByTestId('start').click();
    await expect.poll(async()=>page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return s.scene.isActive()&&s.player?.body?s.mode:'loading';})).toBe('playing');
    await expect.poll(async()=>page.evaluate(()=>window.__LUMENFALL__.sound.context.state)).toBe('running');
    const bank=await page.evaluate(()=>{
      const game=window.__LUMENFALL__,scene=game.scene.getScene('Game');
      scene.player.invulnerableUntil=scene.clock+600000;scene.waves.alive.forEach(e=>e.stun(scene.clock,600000));
      window.audiblePlays=[];
      const observe=sound=>sound.on('play',()=>{
        if(!/^sfx-(warrior|mage|archer)-(attack|dash|guard)$/.test(sound.key))return;
        const context=game.sound.context,analyser=context.createAnalyser();analyser.fftSize=1024;
        sound.volumeNode.connect(analyser);
        const sample={key:sound.key,hasSource:!!sound.source,started:sound.isPlaying,context:context.state,volume:sound.volumeNode.gain.value,muted:game.sound.mute,rms:0};
        window.audiblePlays.push(sample);
        // This reads the actual playing voice after its gain, rather than merely
        // counting an action() call or checking that a silent buffer is playing.
        setTimeout(()=>{const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);sample.rms=Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);sound.volumeNode.disconnect(analyser);analyser.disconnect();},65);
      });
      game.sound.getAll().forEach(observe);
      const add=game.sound.add.bind(game.sound);game.sound.add=(...args)=>{const sound=add(...args);observe(sound);return sound;};
      return game.cache.audio.getKeys().map(key=>{const buffer=game.cache.audio.get(key),pcm=buffer.getChannelData(0);let energy=0;for(let i=0;i<pcm.length;i++)energy+=pcm[i]*pcm[i];return {key,duration:buffer.duration,rms:Math.sqrt(energy/pcm.length)};});
    });
    expect(bank).toHaveLength(28);expect(bank.filter(s=>s.key.startsWith('bgm-'))).toHaveLength(4);expect(bank.filter(s=>s.key.startsWith('sfx-'))).toHaveLength(24);
    for(const sound of bank){expect(sound.duration).toBeGreaterThan(.04);expect(sound.rms,`${sound.key} decoded PCM energy`).toBeGreaterThan(.001);}
    await page.keyboard.down('KeyJ');await page.waitForTimeout(90);await page.keyboard.up('KeyJ');
    await page.keyboard.press('KeyK');await page.waitForTimeout(290);await page.keyboard.press('Space');
    for(const action of ['attack','dash','guard']) {
      const key=`sfx-${classId}-${action}`;
      await expect.poll(async()=>page.evaluate(key=>window.audiblePlays.filter(p=>p.key===key&&p.rms>.001).length,key),{timeout:2000}).toBeGreaterThan(0);
      const sample=await page.evaluate(key=>window.audiblePlays.find(p=>p.key===key&&p.rms>.001),key);
      expect(sample).toMatchObject({hasSource:true,started:true,context:'running',muted:false});expect(sample.volume).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  });
}
