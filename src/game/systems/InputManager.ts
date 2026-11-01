import { TouchControls } from '../ui/TouchControls';

const GAME_KEYS = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyJ', 'KeyK', 'KeyL', 'KeyQ', 'KeyI', 'Escape', 'KeyP']);

/** Edge actions are buffered until consumed; movement and attack are held state. */
export class InputManager {
  private readonly pressed = new Set<string>();
  private readonly touch: TouchControls;
  private enabled = true;
  private touchX = 0;
  private touchY = 0;
  private touchAttack = false;
  private guardPending = false;
  private ultimatePending = false;
  private dashPending = false;
  private pausePending = false;

  constructor() {
    this.touch = new TouchControls({
      move: (x, y): void => { this.touchX = x; this.touchY = y; },
      attack: (held): void => { this.touchAttack = held; },
      guard: (): void => { if (this.enabled) this.guardPending = true; },
      ultimate: (): void => { if (this.enabled) this.ultimatePending = true; },
      dash: (): void => { if (this.enabled) this.dashPending = true; },
    });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  get axis(): number {
    return this.axisX;
  }

  get axisX(): number {
    if (!this.enabled) return 0;
    const x = this.rawX;
    const y = this.rawY;
    return x / Math.max(1, Math.hypot(x, y));
  }

  get axisY(): number {
    if (!this.enabled) return 0;
    const x = this.rawX;
    const y = this.rawY;
    return y / Math.max(1, Math.hypot(x, y));
  }

  private get rawX(): number {
    const right = this.pressed.has('KeyD') || this.pressed.has('ArrowRight') ? 1 : 0;
    const left = this.pressed.has('KeyA') || this.pressed.has('ArrowLeft') ? 1 : 0;
    return right - left + this.touchX;
  }

  private get rawY(): number {
    const down = this.pressed.has('KeyS') || this.pressed.has('ArrowDown') ? 1 : 0;
    const up = this.pressed.has('KeyW') || this.pressed.has('ArrowUp') ? 1 : 0;
    return down - up + this.touchY;
  }

  get attackHeld(): boolean {
    return this.enabled && (this.pressed.has('KeyJ') || this.touchAttack);
  }

  get isTouchMode(): boolean {
    return this.touch.isTouchMode;
  }

  consumeGuard(): boolean {
    const pending = this.guardPending && this.enabled;
    this.guardPending = false;
    return pending;
  }

  consumeUltimate(): boolean {
    const pending = this.ultimatePending && this.enabled;
    this.ultimatePending = false;
    return pending;
  }

  consumeDash(): boolean {
    const pending = this.dashPending && this.enabled;
    this.dashPending = false;
    return pending;
  }

  consumePause(): boolean {
    const pending = this.pausePending;
    this.pausePending = false;
    return pending;
  }

  reset(): void {
    this.pressed.clear();
    this.touchX = 0;
    this.touchY = 0;
    this.touchAttack = false;
    this.guardPending = false;
    this.ultimatePending = false;
    this.dashPending = false;
    this.pausePending = false;
    this.touch.reset();
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.reset();
    this.touch.setEnabled(enabled);
  }
  setExplorationMode(exploring:boolean):void {this.touch.setExplorationMode(exploring);}

  updateCooldowns(attackRatio: number, dashRatio: number, guardRatio = 0, ultimateCharge = 0, guardActive = false, ultimateReady = ultimateCharge >= 100): void {
    this.touch.updateCooldowns(attackRatio, dashRatio, guardRatio, ultimateCharge, guardActive, ultimateReady);
  }

  destroy(): void {
    this.reset();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.touch.destroy();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!GAME_KEYS.has(event.code)) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const pause = event.code === 'Escape' || event.code === 'KeyP';
    if (!this.enabled && !pause) return;
    event.preventDefault();
    if (event.repeat || this.pressed.has(event.code)) return;
    this.pressed.add(event.code);
    if (pause) this.pausePending = true;
    else if (event.code === 'Space' || event.code === 'KeyL') this.guardPending = true;
    else if (event.code === 'KeyQ' || event.code === 'KeyI') this.ultimatePending = true;
    else if (event.code === 'KeyK') this.dashPending = true;
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!GAME_KEYS.has(event.code)) return;
    this.pressed.delete(event.code);
    if (this.enabled) event.preventDefault();
  };

  private readonly onBlur = (): void => { this.reset(); };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.reset();
  };
}
