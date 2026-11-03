import { test, expect } from '@playwright/test';

const HERO_TEXTURE = 'mascot-hero';

const heroState = page => page.evaluate(() => {
  const scene = window.__LUMENFALL__?.scene.getScene('Game');
  const player = scene?.player;
  if (!scene?.scene.isActive() || !player?.body) return { mode: 'loading' };
  return {
    mode: scene.mode, seed: scene.stats.seed, health: player.health, maxHealth: player.stats.maxHealth,
    clock: scene.clock, x: player.x, y: player.y,
    texture: player.visual.texture.key, frame: Number(player.visual.frame.name),
    visible: player.visual.visible, flipX: player.visual.flipX,
    originX: player.visual.originX, originY: player.visual.originY,
    visualY: player.visual.y, guardActive: player.guarding, guardUntil: player.guardUntil,
    carrierVisible: player.visible,
    body: {
      width: player.body.width, height: player.body.height,
      offsetX: player.body.offset.x, offsetY: player.body.offset.y,
      bottomFromFloor: player.body.bottom - player.y,
    },
    attack: scene.controls.attackHeld,
    dashActive: player.dashUntil > scene.clock,
    staleVisibleHeroes: scene.children.list.filter(object => object.visible && object.texture?.key === 'player').length,
  };
});

async function start(page) {
  await page.goto('/');
  await page.getByTestId('start').click();
  await expect.poll(async () => (await heroState(page)).mode).toBe('playing');
}

// Sample several real render frames, rather than inspecting the animation helper.
async function sampleMovement(page, key, expectedFrames, flipX) {
  await page.evaluate(() => {
    const scene = window.__LUMENFALL__.scene.getScene('Game');
    scene.player.body.reset(960, 640);
    scene.player.invulnerableUntil = scene.clock + 20000;
  });
  await page.keyboard.down(key);
  await page.waitForTimeout(70);
  const samples = [];
  for (let index = 0; index < 10; index++) {
    samples.push(await heroState(page));
    await page.waitForTimeout(45);
  }
  await page.keyboard.up(key);
  expect(new Set(samples.map(sample => sample.frame)).size).toBeGreaterThanOrEqual(3);
  for (const sample of samples) {
    expect(expectedFrames).toContain(sample.frame);
    expect(sample.flipX).toBe(flipX);
    expect(sample.texture).toBe(HERO_TEXTURE);
    expect(sample.carrierVisible).toBe(false);
    expect(sample.body).toEqual({ width: 24, height: 14, offsetX: 12, offsetY: 49, bottomFromFloor: -1 });
    expect(sample.originX).toBe(.5);
    expect(sample.originY).toBe(.94);
  }
}

test('mascot assets: real local transparent artwork, all 16 frames and main-menu replacement', async ({ page }) => {
  const externalRequests = [];
  const failedAssets = [];
  const loadedAssetPaths = [];
  const errors = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(url.href);
  });
  page.on('response', response => {
    if (response.url().includes('/assets/hero/')) {
      if (response.status() >= 400) failedAssets.push(response.url());
      else loadedAssetPaths.push(new URL(response.url()).pathname);
    }
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('start')).toBeVisible();

  const artwork = await page.evaluate(textureKey => {
    const scene = window.__LUMENFALL__.scene.getScene('Menu');
    const texture = scene.textures.get(textureKey);
    const source = texture.getSourceImage();
    const frames = Object.keys(texture.frames).filter(name => /^\d+$/.test(name)).map(name => {
      const frame = texture.get(name);
      // Rebuild the virtual cell from the actual atlas crop and trim metadata.
      const canvas = document.createElement('canvas');
      canvas.width = frame.realWidth; canvas.height = frame.realHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(source, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, frame.x, frame.y, frame.width, frame.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0, yellow = 0, footPixel = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] > 30) {
          opaque++;
          footPixel = Math.max(footPixel, Math.floor(offset / 4 / canvas.width));
          if (pixels[offset] > 120 && pixels[offset + 1] > 85 && pixels[offset + 2] < 150 && pixels[offset] > pixels[offset + 2] * 1.2) yellow++;
        }
      }
      const alphaAt = (x, y) => pixels[(y * canvas.width + x) * 4 + 3];
      return {
        name: Number(name), width: frame.realWidth, height: frame.realHeight, footPixel,
        coverage: opaque / (pixels.length / 4), yellowRatio: yellow / Math.max(1, opaque),
        corners: [alphaAt(0, 0), alphaAt(canvas.width - 1, 0), alphaAt(0, canvas.height - 1), alphaAt(canvas.width - 1, canvas.height - 1)],
      };
    });
    return {
      source: source.currentSrc || source.src,
      loaded: source.complete && source.naturalWidth > 0,
      width: source.width, height: source.height, frames,
      menuHeroes: scene.children.list.filter(object => object.visible && object.texture?.key === textureKey).length,
      staleMenuHeroes: scene.children.list.filter(object => object.visible && object.texture?.key === 'player').length,
    };
  }, HERO_TEXTURE);
  expect(artwork.loaded).toBe(true);
  // Phaser decodes its XHR response through a local blob URL.
  expect(new URL(artwork.source).origin).toBe(new URL(page.url()).origin);
  expect(loadedAssetPaths).toContain('/assets/hero/hero-atlas-v1.png');
  expect(artwork.frames.map(frame => frame.name).sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, index) => index));
  for (const frame of artwork.frames) {
    expect(frame.width).toBe(320);
    expect(frame.height).toBe(320);
    expect(frame.coverage).toBeGreaterThan(.05);
    expect(frame.coverage).toBeLessThan(.85);
    expect(frame.yellowRatio).toBeGreaterThan(.15);
    expect(Math.max(...frame.corners)).toBeLessThanOrEqual(8);
    expect(frame.footPixel).toBeGreaterThanOrEqual(296);
    expect(frame.footPixel).toBeLessThanOrEqual(308);
  }
  expect(artwork.menuHeroes).toBe(1);
  expect(artwork.staleMenuHeroes).toBe(0);
  await page.screenshot({ path: 'artifacts/mascot-menu.png' });
  await page.getByTestId('start').click();
  await expect.poll(async () => (await heroState(page)).mode).toBe('playing');
  const portrait = page.locator('.hero-portrait-art');
  await expect(portrait).toBeVisible();
  await expect.poll(() => portrait.evaluate(image => image.complete && image.naturalWidth >= 128)).toBe(true);
  expect(new URL(await portrait.getAttribute('src'), page.url()).pathname).toBe('/assets/hero/portrait.png');
  expect(loadedAssetPaths).toContain('/assets/hero/portrait.png');
  expect(externalRequests).toEqual([]);
  expect(failedAssets).toEqual([]);
  expect(errors).toEqual([]);
});

test('mascot gameplay: directional walk frames, action poses, foot collision and death/restart lifecycle', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  const initial = await heroState(page);
  await sampleMovement(page, 'KeyS', [0, 1, 2, 3], false);
  await sampleMovement(page, 'KeyD', [4, 5, 6, 7], false);
  await sampleMovement(page, 'KeyW', [8, 9, 10, 11], false);
  await sampleMovement(page, 'KeyA', [4, 5, 6, 7], true);

  // Put the closest real enemy due east so the authored side-action pose is exercised under auto-aim.
  await page.evaluate(() => {
    const scene = window.__LUMENFALL__.scene.getScene('Game');
    scene.player.body.reset(960, 640);
    scene.waves.alive.forEach((enemy, i) => { enemy.body.reset(1260 + i * 5, 640); enemy.stun(scene.clock, 20000); });
  });
  await page.keyboard.down('KeyJ');
  await expect.poll(async () => (await heroState(page)).frame, { intervals: [20] }).toBe(13);
  await page.keyboard.up('KeyJ');
  await page.waitForTimeout(220);
  await page.keyboard.press('KeyK');
  await expect.poll(async () => (await heroState(page)).frame, { intervals: [15] }).toBe(14);
  expect((await heroState(page)).staleVisibleHeroes).toBe(0);
  // A dash afterimage must copy this frame, not resurrect the old cyan placeholder.
  const trails = await page.evaluate(() => {
    const scene = window.__LUMENFALL__.scene.getScene('Game');
    return scene.children.list.filter(object => object.visible && object.texture?.key === 'mascot-hero' && object !== scene.player.visual)
      .map(object => ({ frame: Number(object.frame.name), originY: object.originY }));
  });
  expect(trails.length).toBeGreaterThan(0);
  for (const trail of trails) { expect(trail.frame).toBe(14); expect(trail.originY).toBe(.94); }
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  const guarded = await heroState(page);
  expect(guarded.guardActive).toBe(true);
  expect(Math.abs(guarded.visualY - guarded.y)).toBeLessThan(3);
  expect(guarded.body.width).toBe(24); expect(guarded.body.height).toBe(14);
  await page.waitForTimeout(650);
  await page.evaluate(() => {
    const scene = window.__LUMENFALL__.scene.getScene('Game');
    scene.player.invulnerableUntil = 0;
    scene.combat.hurt(10, scene.player.x + 20, scene.clock, scene.player.y);
  });
  await expect.poll(async () => (await heroState(page)).frame, { intervals: [15] }).toBe(15);
  expect((await heroState(page)).health).toBeLessThan(initial.maxHealth);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/mascot-gameplay.png' });
  await page.evaluate(() => {
    const scene = window.__LUMENFALL__.scene.getScene('Game');
    scene.player.invulnerableUntil = 0;
    scene.combat.hurt(999, scene.player.x + 20, scene.clock, scene.player.y);
  });
  await expect(page.locator('.death-dialog')).toBeVisible();
  expect((await heroState(page)).visible).toBe(false);
  await page.getByTestId('restart').click();
  await expect.poll(async () => (await heroState(page)).mode).toBe('playing');
  const restarted = await heroState(page);
  expect(restarted.seed).not.toBe(initial.seed);
  expect(restarted.health).toBe(initial.maxHealth);
  expect(restarted.texture).toBe(HERO_TEXTURE);
  expect(restarted.visible).toBe(true);
  expect(restarted.staleVisibleHeroes).toBe(0);
  const heroes = await page.evaluate(() => {
    const scene = window.__LUMENFALL__.scene.getScene('Game');
    return scene.children.list.filter(object => object.visible && object.texture?.key === 'mascot-hero').length;
  });
  expect(heroes).toBe(1);
  expect(errors).toEqual([]);
});

test('mobile mascot: fullscreen and simultaneous joystick/attack still use the new artwork', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('game-shell');
  await expect(page.getByTestId('touch-controls')).toBeVisible();
  const bounds = await page.locator('canvas').boundingBox();
  expect(bounds).toMatchObject({ x: 0, y: 0, width: 844, height: 390 });
  const cdp = await context.newCDPSession(page);
  const point = async (testid, id, dx = 0, dy = 0) => {
    const box = await page.getByTestId(testid).boundingBox();
    return { id, x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy, radiusX: 5, radiusY: 5, force: 1 };
  };
  const joystickStart = await point('virtual-joystick', 1);
  const joystick = { ...joystickStart, x: joystickStart.x + 10, y: joystickStart.y - 28 };
  const attack = await point('touch-attack', 2);
  const initial = await heroState(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [joystickStart] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [joystick] });
  await page.waitForTimeout(220);
  const moving = await heroState(page);
  expect(moving.y).toBeLessThan(initial.y - 20);
  expect([8, 9, 10, 11]).toContain(moving.frame);
  // Auto-aim must use the closest north target, regardless of the joystick's eastward component.
  await page.evaluate(() => {
    const scene = window.__LUMENFALL__.scene.getScene('Game');
    scene.waves.alive.forEach((enemy, i) => { enemy.body.reset(scene.player.x, scene.player.y - 100 - i * 5); enemy.stun(scene.clock, 20000); });
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [joystick, attack] });
  await expect.poll(async () => (await heroState(page)).attack).toBe(true);
  await page.waitForTimeout(80);
  const northAttack = await heroState(page);
  // Vertical attacks keep the body facing north; the slash still points north.
  expect([8, 9, 10, 11]).toContain(northAttack.frame);
  expect(northAttack.y).toBeLessThan(moving.y);
  expect(northAttack.texture).toBe(HERO_TEXTURE);
  const swing = await page.evaluate(() => {
    const scene = window.__LUMENFALL__.scene.getScene('Game');
    return { angle: scene.player.attackAngle, nextAttack: scene.player.nextAttack, clock: scene.clock, attackStep: scene.player.attackStep };
  });
  expect(Math.sin(swing.angle)).toBeLessThan(-.55);
  expect(swing.nextAttack).toBeGreaterThan(swing.clock);
  expect(swing.attackStep).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/mascot-mobile-fullscreen.png' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await heroState(page)).attack).toBe(false);
  await page.getByTestId('fullscreen').tap();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.getByTestId('fullscreen').tap();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('game-shell');
  expect(errors).toEqual([]);
  await context.close();
});
