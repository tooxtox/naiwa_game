import '../ui/controls.css';

type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type LockableOrientation = ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };

let shell: FullscreenElement | null = null;
let button: HTMLButtonElement | null = null;
let initialized = false;
let pending = false;
let hintShown = false;
let resizeFrame = 0;
const fullscreenDocument = document as FullscreenDocument;

const isMobile = (): boolean => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const isStandalone = (): boolean => matchMedia('(display-mode: standalone)').matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const currentFullscreen = (): Element | null => document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
const canFullscreen = (): boolean => !!shell && (
  (typeof shell.requestFullscreen === 'function' && document.fullscreenEnabled !== false)
  || (typeof shell.webkitRequestFullscreen === 'function' && fullscreenDocument.webkitFullscreenEnabled !== false)
);
const isIPhoneSafari = (): boolean => /iPhone|iPod/.test(navigator.userAgent)
  && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

function showHint(message: string): void {
  if (!shell || hintShown || isStandalone()) return;
  hintShown = true;
  const hint = document.createElement('div');
  hint.className = 'fullscreen-hint';
  hint.dataset.testid = 'fullscreen-hint';
  hint.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '关闭全屏提示');
  close.addEventListener('click', () => hint.remove());
  hint.append(text, close);
  shell.append(hint);
}

function unsupportedHint(): void {
  showHint(isIPhoneSafari()
    ? '添加到主屏幕可隐藏地址栏：轻点 Safari「分享」→「添加到主屏幕」。'
    : '此浏览器暂不支持网页全屏，可添加到主屏幕，或使用支持全屏的浏览器。');
}

function updateState(): void {
  if (!shell || !button) return;
  const fullscreen = !!currentFullscreen();
  const standalone = isStandalone();
  const supported = canFullscreen();
  shell.classList.toggle('is-fullscreen', fullscreen || standalone);
  shell.classList.toggle('fullscreen-unsupported', !supported);
  shell.dataset.fullscreensupported = String(supported);
  shell.dataset.fullscreen = String(fullscreen || standalone);
  button.dataset.fullscreensupported = String(supported);
  button.setAttribute('aria-pressed', String(fullscreen || standalone));
  button.textContent = fullscreen ? '退出全屏' : standalone ? '已全屏' : '全屏';
  button.disabled = standalone && !fullscreen;
  button.title = standalone ? '已在主屏幕独立窗口运行' : fullscreen ? '退出全屏显示' : '全屏显示游戏';
}

function lockLandscape(): void {
  if (!isMobile() || !currentFullscreen()) return;
  const orientation = screen.orientation as LockableOrientation | undefined;
  try {
    void orientation?.lock?.('landscape').catch(() => { /* Device rotation remains available when locking is unsupported. */ });
  } catch { /* Older browsers may throw before returning a promise. */ }
}

function onFullscreenChange(): void {
  updateState();
  if (currentFullscreen()) lockLandscape();
  else {
    try { screen.orientation?.unlock?.(); } catch { /* Optional platform support. */ }
  }
  // A single follow-up resize lets Phaser read the new fullscreen viewport.
  // The ordinary resize listener only updates UI, so it cannot create a loop.
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

/** Must be called directly by a user gesture; the browser request precedes all awaits. */
export async function requestGameFullscreen(): Promise<void> {
  if (!initialized) initFullscreen();
  if (!shell || currentFullscreen() || pending || isStandalone()) return;
  if (!canFullscreen()) { unsupportedHint(); return; }
  pending = true;
  try {
    // Do not delay this call: fullscreen consumes the click's transient activation.
    if (typeof shell.requestFullscreen === 'function' && document.fullscreenEnabled !== false) {
      await shell.requestFullscreen({ navigationUI: 'hide' });
    } else {
      await shell.webkitRequestFullscreen?.();
    }
  } catch {
    showHint('未能进入全屏，请点击右上角「全屏」重试；也可添加到主屏幕游玩。');
  } finally {
    pending = false;
    updateState();
  }
}

/** Mount once outside Phaser scenes, so the control survives restarts and overlays. */
export function initFullscreen(): void {
  if (initialized) return;
  shell = document.getElementById('game-shell') as FullscreenElement | null;
  if (!shell) return;
  initialized = true;
  button = document.createElement('button');
  button.type = 'button';
  button.className = 'fullscreen-button';
  button.dataset.testid = 'fullscreen';
  button.addEventListener('click', () => {
    if (currentFullscreen()) {
      try {
        const exit = document.exitFullscreen?.bind(document)
          ?? fullscreenDocument.webkitExitFullscreen?.bind(fullscreenDocument);
        void Promise.resolve(exit?.()).catch(() => { /* Browser may already have left fullscreen. */ });
      } catch { /* Avoid breaking the game when a platform rejects exit. */ }
    } else void requestGameFullscreen();
  });
  shell.append(button);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  window.addEventListener('resize', updateState);
  // Capture runs before scene handlers remove menu/resume buttons from the DOM.
  document.addEventListener('click', (event: MouseEvent) => {
    if (!isMobile() || !(event.target instanceof Element)) return;
    if (event.target.closest('[data-testid="start"], [data-testid="resume"], [data-testid="restart"]')) {
      void requestGameFullscreen();
    }
  }, true);
  updateState();
  if (!canFullscreen() && isIPhoneSafari()) unsupportedHint();
}
