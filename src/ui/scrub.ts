export interface ScrubOptions {
  handle: HTMLElement;
  min: number;
  max: number;
  getValue(): number;
  onChange(value: number): void;
  pixelsPerStep?: number;
}

const DRAG_THRESHOLD_PX = 3;

export function scrubValue(
  start: number,
  deltaPx: number,
  min: number,
  max: number,
  pixelsPerStep: number,
  fast: boolean,
): number {
  const steps = Math.trunc(deltaPx / pixelsPerStep) * (fast ? 10 : 1);
  const value = Math.round(start) + steps;
  return Math.min(max, Math.max(min, value));
}

export function attachScrub(options: ScrubOptions): () => void {
  const { handle, min, max, getValue, onChange } = options;
  const pixelsPerStep = options.pixelsPerStep ?? 2;

  handle.style.cursor = 'ew-resize';
  handle.style.touchAction = 'none';
  handle.style.userSelect = 'none';

  let pointerId = -1;
  let startX = 0;
  let startValue = 0;
  let dragging = false;
  let lastSent = 0;
  let suppressClick = false;

  function finish(): void {
    if (pointerId === -1) return;
    const id = pointerId;
    pointerId = -1;
    if (dragging) {
      dragging = false;
      suppressClick = true;
      document.documentElement.classList.remove('scrubbing');
    }
    try {
      if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
    } catch {
      // capture already gone
    }
  }

  function onDown(e: PointerEvent): void {
    if (e.button !== 0 || !e.isPrimary) return;
    suppressClick = false;
    pointerId = e.pointerId;
    startX = e.clientX;
    startValue = Math.round(getValue());
    lastSent = startValue;
    dragging = false;
    handle.setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return;
    const delta = e.clientX - startX;
    if (!dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      document.documentElement.classList.add('scrubbing');
    }
    const value = scrubValue(startValue, delta, min, max, pixelsPerStep, e.shiftKey);
    if (value !== lastSent) {
      lastSent = value;
      onChange(value);
    }
  }

  function onEnd(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return;
    finish();
  }

  function onClick(e: MouseEvent): void {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onEnd);
  handle.addEventListener('pointercancel', onEnd);
  handle.addEventListener('lostpointercapture', onEnd);
  handle.addEventListener('click', onClick, true);

  return () => {
    finish();
    handle.removeEventListener('pointerdown', onDown);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onEnd);
    handle.removeEventListener('pointercancel', onEnd);
    handle.removeEventListener('lostpointercapture', onEnd);
    handle.removeEventListener('click', onClick, true);
  };
}
