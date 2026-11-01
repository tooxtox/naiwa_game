/** The first finger anywhere in the left third owns one floating analog pad. */
export class VirtualJoystick {
  readonly element: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly thumb: HTMLDivElement;
  private pointerId: number | null = null;
  private enabled = true;
  private valueX = 0;
  private valueY = 0;
  private originX = 0;
  private originY = 0;
  private travelRadius = 35;

  constructor(parent: HTMLElement, private readonly onChange: (x: number, y: number) => void) {
    this.element = document.createElement('div');
    this.element.className = 'virtual-joystick';
    this.element.dataset.control = 'joystick';
    this.element.dataset.testid = 'virtual-joystick';
    this.element.setAttribute('aria-label', '左侧三分之一区域，按住拖动移动');
    this.base = document.createElement('div');
    this.base.className = 'joystick-base';
    this.base.dataset.testid = 'joystick-base';
    this.base.hidden = true;
    this.base.setAttribute('aria-hidden', 'true');
    this.base.innerHTML = '<span class="joystick-guide"><i class="guide-north">⌃</i><i class="guide-east">›</i><i class="guide-south">⌄</i><i class="guide-west">‹</i><span>移动</span></span>';
    this.thumb = document.createElement('div');
    this.thumb.className = 'joystick-thumb';
    this.base.append(this.thumb);
    this.element.append(this.base);
    parent.append(this.element);
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerUp);
    this.element.addEventListener('lostpointercapture', this.onLostCapture);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  reset(): void {
    const pointer = this.pointerId;
    this.pointerId = null;
    if (pointer !== null && this.element.hasPointerCapture(pointer)) {
      this.element.releasePointerCapture(pointer);
    }
    this.element.classList.remove('is-pressed');
    this.base.hidden = true;
    this.thumb.style.transform = 'translate(0px, 0px)';
    this.valueX = 0;
    this.valueY = 0;
    this.onChange(0, 0);
  }

  destroy(): void {
    this.reset();
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('lostpointercapture', this.onLostCapture);
    this.element.remove();
  }

  private updatePosition(event: PointerEvent): void {
    const radius = this.travelRadius;
    let x = event.clientX - this.originX;
    let y = event.clientY - this.originY;
    const length = Math.hypot(x, y);
    if (length > radius) {
      x = x / length * radius;
      y = y / length * radius;
    }
    this.thumb.style.transform = `translate(${x}px, ${y}px)`;
    // Radial dead zone preserves diagonal angles and gives a continuous analog speed.
    const distance = Math.hypot(x, y);
    const magnitude = Math.max(0, Math.min(1, (distance / radius - 0.12) / 0.88));
    const nextX = distance > 0 ? x / distance * magnitude : 0;
    const nextY = distance > 0 ? y / distance * magnitude : 0;
    if (nextX !== this.valueX || nextY !== this.valueY) {
      this.valueX = nextX;
      this.valueY = nextY;
      this.onChange(nextX, nextY);
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.originX = event.clientX;
    this.originY = event.clientY;
    const bounds = this.element.getBoundingClientRect();
    // The input origin remains exactly under the finger, including at screen edges.
    // Overflow is clipped by the game viewport instead of shifting the control center.
    this.base.style.left = `${event.clientX - bounds.left}px`;
    this.base.style.top = `${event.clientY - bounds.top}px`;
    this.base.hidden = false;
    this.travelRadius = this.base.getBoundingClientRect().width * .31;
    this.thumb.style.transform = 'translate(0px, 0px)';
    this.valueX = 0;
    this.valueY = 0;
    this.onChange(0, 0);
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add('is-pressed');
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this.updatePosition(event);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this.reset();
  };

  private readonly onLostCapture = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.reset();
  };
}
