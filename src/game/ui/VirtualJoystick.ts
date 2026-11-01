/** A single-pointer analog pad. Pointer capture keeps dragging reliable off the pad. */
export class VirtualJoystick {
  readonly element: HTMLDivElement;
  private readonly thumb: HTMLDivElement;
  private pointerId: number | null = null;
  private enabled = true;
  private valueX = 0;
  private valueY = 0;

  constructor(parent: HTMLElement, private readonly onChange: (x: number, y: number) => void) {
    this.element = document.createElement('div');
    this.element.className = 'virtual-joystick';
    this.element.dataset.control = 'joystick';
    this.element.dataset.testid = 'virtual-joystick';
    this.element.setAttribute('aria-label', '八方向移动摇杆');
    this.element.innerHTML = '<span class="joystick-guide"><i class="guide-north">⌃</i><i class="guide-east">›</i><i class="guide-south">⌄</i><i class="guide-west">‹</i><span>移动</span></span>';
    this.thumb = document.createElement('div');
    this.thumb.className = 'joystick-thumb';
    this.element.append(this.thumb);
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
    const bounds = this.element.getBoundingClientRect();
    const radius = bounds.width * 0.31;
    let x = event.clientX - bounds.left - bounds.width * 0.5;
    let y = event.clientY - bounds.top - bounds.height * 0.5;
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
    if (!this.enabled || this.pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    this.pointerId = event.pointerId;
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add('is-pressed');
    this.updatePosition(event);
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
