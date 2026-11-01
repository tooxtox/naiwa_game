import { VirtualJoystick } from './VirtualJoystick';
import './controls.css';

interface TouchCallbacks {
  move: (x: number, y: number) => void;
  attack: (held: boolean) => void;
  guard: () => void;
  ultimate: () => void;
  dash: () => void;
}

interface ActionButton {
  element: HTMLButtonElement;
  pointerId: number | null;
  down: (event: PointerEvent) => void;
  up: (event: PointerEvent) => void;
}

/** DOM controls share the same input state as the keyboard; no Phaser pointer is reused. */
export class TouchControls {
  readonly element: HTMLDivElement;
  private readonly joystick: VirtualJoystick;
  private readonly buttons = new Map<string, ActionButton>();
  private readonly host: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly coarsePointer = window.matchMedia('(pointer: coarse)');
  private enabled = true;
  private touchMode = false;
  private attackRatio = -1;
  private dashRatio = -1;
  private guardRatio = -1;
  private ultimateCharge = -1;
  private ultimateReady = false;
  private guardActive = false;

  constructor(private readonly callbacks: TouchCallbacks) {
    this.host = document.getElementById('game-shell') ?? document.body;
    this.element = document.createElement('div');
    this.element.className = 'touch-controls';
    this.element.dataset.testid = 'touch-controls';
    this.element.setAttribute('aria-label', '触屏操作');
    if (this.host === document.body) this.element.style.position = 'fixed';
    this.host.append(this.element);
    this.joystick = new VirtualJoystick(this.element, callbacks.move);
    const actions = document.createElement('div');
    actions.className = 'touch-actions';
    this.element.append(actions);
    this.addButton(actions, 'attack', '攻击', '✦', () => callbacks.attack(true));
    this.addButton(actions, 'guard', '格挡', '<svg width="28" height="30" viewBox="0 0 28 32" fill="none" aria-hidden="true"><path d="M14 2 25 6v9c0 7-5 12-11 15C8 27 3 22 3 15V6Z" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity=".12"/><path d="M14 8v15M8 14h12" stroke="currentColor" stroke-width="2"/></svg>', callbacks.guard);
    this.addButton(actions, 'dash', '冲刺', '»', callbacks.dash);
    this.addButton(actions, 'ultimate', '终结', '✹', callbacks.ultimate);
    const charge = document.createElement('span');
    charge.className = 'touch-charge';
    charge.textContent = '0%';
    this.buttons.get('ultimate')?.element.append(charge);
    this.updateCooldowns(0, 0);
    this.resizeObserver = new ResizeObserver(this.updateViewport);
    this.resizeObserver.observe(this.host);
    const canvas = this.host.querySelector('canvas');
    if (canvas) this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.updateViewport);
    this.coarsePointer.addEventListener('change', this.updateTouchMode);
    this.updateTouchMode();
    this.updateViewport();
  }

  get isTouchMode(): boolean {
    return this.touchMode;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.element.classList.toggle('is-disabled', !enabled);
    this.element.setAttribute('aria-hidden', String(!enabled || !this.touchMode));
    this.joystick.setEnabled(enabled);
    if (!enabled) this.reset();
  }

  reset(): void {
    this.joystick.reset();
    for (const [name, button] of this.buttons) this.releaseButton(name, button);
    this.callbacks.attack(false);
  }

  updateCooldowns(attackRatio: number, dashRatio: number, guardRatio = 0, ultimateCharge = 0, guardActive = false, ultimateReady = ultimateCharge >= 100): void {
    // Quantizing to 1% avoids writing DOM styles on every animation frame.
    const attack = Math.round(Math.min(1, Math.max(0, attackRatio)) * 100) / 100;
    const dash = Math.round(Math.min(1, Math.max(0, dashRatio)) * 100) / 100;
    const guard = Math.round(Math.min(1, Math.max(0, guardRatio)) * 100) / 100;
    const charge = Math.round(Math.min(100, Math.max(0, ultimateCharge)));
    const ready = charge >= 100 && ultimateReady;
    if (attack !== this.attackRatio) {
      this.attackRatio = attack;
      this.setCooldown('attack', attack);
    }
    if (dash !== this.dashRatio) {
      this.dashRatio = dash;
      this.setCooldown('dash', dash);
    }
    if (guard !== this.guardRatio) {
      this.guardRatio = guard;
      this.setCooldown('guard', guard);
    }
    if (guardActive !== this.guardActive) {
      this.guardActive = guardActive;
      const button = this.buttons.get('guard')?.element;
      button?.classList.toggle('is-guarding', guardActive);
      if (button) button.dataset.active = String(guardActive);
    }
    if (charge !== this.ultimateCharge || ready !== this.ultimateReady) {
      this.ultimateCharge = charge;
      this.ultimateReady = ready;
      const button = this.buttons.get('ultimate')?.element;
      if (button) {
        button.style.setProperty('--charge', `${charge / 100}turn`);
        button.classList.toggle('is-ready', ready);
        button.dataset.charge = String(charge);
        button.dataset.ready = String(ready);
        button.setAttribute('aria-label', ready ? '终结技能，已就绪' : charge >= 100 ? '终结技能，冷却中' : `终结技能，充能 ${charge}%`);
        const label = button.querySelector('.touch-charge');
        if (label) label.textContent = ready ? '就绪' : charge >= 100 ? '冷却中' : `${charge}%`;
      }
    }
  }

  destroy(): void {
    this.reset();
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.updateViewport);
    this.coarsePointer.removeEventListener('change', this.updateTouchMode);
    this.joystick.destroy();
    for (const button of this.buttons.values()) {
      button.element.removeEventListener('pointerdown', button.down);
      button.element.removeEventListener('pointerup', button.up);
      button.element.removeEventListener('pointercancel', button.up);
      button.element.removeEventListener('lostpointercapture', button.up);
    }
    this.buttons.clear();
    this.element.remove();
  }

  private addButton(parent: HTMLElement, name: string, label: string, symbol: string, onPress: () => void): void {
    const element = document.createElement('button');
    element.type = 'button';
    element.tabIndex = -1;
    element.className = `touch-button touch-${name}`;
    element.dataset.control = name;
    element.dataset.testid = `touch-${name}`;
    element.setAttribute('aria-label', label);
    element.innerHTML = `<span class="touch-symbol" aria-hidden="true">${symbol}</span><span class="touch-label">${label}</span>`;
    const button: ActionButton = {
      element,
      pointerId: null,
      down: (event: PointerEvent): void => {
        if (!this.enabled || button.pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault();
        event.stopPropagation();
        button.pointerId = event.pointerId;
        element.setPointerCapture(event.pointerId);
        element.classList.add('is-pressed');
        onPress();
      },
      up: (event: PointerEvent): void => {
        if (button.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        this.releaseButton(name, button);
      },
    };
    element.addEventListener('pointerdown', button.down);
    element.addEventListener('pointerup', button.up);
    element.addEventListener('pointercancel', button.up);
    element.addEventListener('lostpointercapture', button.up);
    this.buttons.set(name, button);
    parent.append(element);
  }

  private releaseButton(name: string, button: ActionButton): void {
    const pointer = button.pointerId;
    button.pointerId = null;
    if (pointer !== null && button.element.hasPointerCapture(pointer)) {
      button.element.releasePointerCapture(pointer);
    }
    button.element.classList.remove('is-pressed');
    if (name === 'attack') this.callbacks.attack(false);
  }

  private setCooldown(name: string, ratio: number): void {
    const element = this.buttons.get(name)?.element;
    if (!element) return;
    element.style.setProperty('--cooldown', `${ratio}turn`);
    element.classList.toggle('is-cooling', ratio > 0);
    element.dataset.cooldown = String(ratio);
  }

  private readonly updateTouchMode = (): void => {
    this.touchMode = this.coarsePointer.matches || navigator.maxTouchPoints > 0;
    this.element.classList.toggle('is-touch', this.touchMode);
    this.element.setAttribute('aria-hidden', String(!this.enabled || !this.touchMode));
    if (!this.touchMode) this.reset();
  };

  private readonly updateViewport = (): void => {
    const canvas = this.host.querySelector('canvas');
    if (!canvas) return;
    const canvasBounds = canvas.getBoundingClientRect();
    const hostBounds = this.host.getBoundingClientRect();
    this.element.style.left = `${canvasBounds.left - hostBounds.left}px`;
    this.element.style.top = `${canvasBounds.top - hostBounds.top}px`;
    this.element.style.width = `${canvasBounds.width}px`;
    this.element.style.height = `${canvasBounds.height}px`;
  };
}
