import { hexToRgb, parseHex } from '../image/validation.ts';

export interface ColorPickerOptions {
  anchor: HTMLButtonElement;
  host: HTMLElement;
  initial: string;
  onInput(hex: string): void;
}

export interface ColorPicker {
  setColor(hex: string): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}

const PRESETS = ['#0095FF', '#7B61FF', '#FF4D8D', '#AD4343', '#FF8A00', '#FFD43B', '#2ECC71', '#FFFFFF'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toHexPart(value: number): string {
  return Math.round(clamp(value, 0, 1) * 255)
    .toString(16)
    .padStart(2, '0');
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const channel = (n: number): number => {
    const k = (n + hue / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [channel(5), channel(3), channel(1)];
}

export function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, clamp(s, 0, 1), clamp(v, 0, 1));
  return `#${toHexPart(r)}${toHexPart(g)}${toHexPart(b)}`.toUpperCase();
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const parsed = parseHex(hex);
  const { r, g, b } = hexToRgb(parsed.ok ? parsed.value : '#000000');
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const delta = max - Math.min(rn, gn, bn);
  let h = 0;
  if (delta > 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

export function createColorPicker(options: ColorPickerOptions): ColorPicker {
  const { anchor, host, onInput } = options;
  const start = parseHex(options.initial);
  let hex = start.ok ? start.value : '#0095FF';
  let { h, s, v } = hexToHsv(hex);
  let opened = false;

  host.hidden = true;
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-label', 'Color picker');
  anchor.setAttribute('aria-haspopup', 'dialog');
  anchor.setAttribute('aria-expanded', 'false');

  const sv = el('div', 'picker-sv', {
    tabindex: '0',
    role: 'slider',
    'aria-label': 'Saturation and brightness',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
  });
  const svThumb = el('div', 'picker-sv-thumb');
  sv.append(svThumb);

  const row = el('div', 'picker-row');
  const hueEl = el('div', 'picker-hue', {
    tabindex: '0',
    role: 'slider',
    'aria-label': 'Hue',
    'aria-valuemin': '0',
    'aria-valuemax': '360',
  });
  const hueThumb = el('div', 'picker-hue-thumb');
  hueEl.append(hueThumb);

  if ('EyeDropper' in window) {
    const eye = el('button', 'picker-eyedropper', { type: 'button', 'aria-label': 'Pick color from screen' });
    eye.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" d="M10.5 2.5l3 3-1.2 1.2-3-3zM9.3 4.7L3 11v2h2l6.3-6.3M3 13l-.5 1.5L4 14"/></svg>';
    eye.addEventListener('click', () => {
      const Ctor = (window as unknown as { EyeDropper: new () => EyeDropperLike }).EyeDropper;
      new Ctor().open().then(
        (result) => applyHex(result.sRGBHex, true),
        () => undefined,
      );
    });
    row.append(eye);
  }
  row.append(hueEl);

  const presets = el('div', 'picker-presets');
  for (const preset of PRESETS) {
    const button = el('button', 'picker-preset', { type: 'button', 'aria-label': `Use ${preset}` });
    button.style.backgroundColor = preset;
    button.addEventListener('click', () => applyHex(preset, true));
    presets.append(button);
  }

  host.replaceChildren(sv, row, presets);

  function render(): void {
    hex = hsvToHex(h, s, v);
    sv.style.backgroundColor = hsvToHex(h, 1, 1);
    svThumb.style.left = `${s * 100}%`;
    svThumb.style.top = `${(1 - v) * 100}%`;
    svThumb.style.backgroundColor = hex;
    sv.setAttribute('aria-valuenow', String(Math.round(s * 100)));
    sv.setAttribute('aria-valuetext', hex);
    hueThumb.style.left = `${(h / 360) * 100}%`;
    hueThumb.style.backgroundColor = hsvToHex(h, 1, 1);
    hueEl.setAttribute('aria-valuenow', String(Math.round(h)));
    hueEl.setAttribute('aria-valuetext', `${Math.round(h)} degrees`);
  }

  function emit(): void {
    render();
    onInput(hex);
  }

  function applyHex(input: string, notify: boolean): void {
    const parsed = parseHex(input);
    if (!parsed.ok || parsed.value === hex) {
      return;
    }
    const next = hexToHsv(parsed.value);
    s = next.s;
    v = next.v;
    if (next.s > 0 && next.v > 0) {
      h = next.h;
    }
    if (notify) {
      emit();
    } else {
      render();
      hex = parsed.value;
    }
  }

  function dragSv(event: PointerEvent): void {
    const rect = sv.getBoundingClientRect();
    s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    v = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    emit();
  }

  function dragHue(event: PointerEvent): void {
    const rect = hueEl.getBoundingClientRect();
    h = clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360;
    emit();
  }

  function bindDrag(node: HTMLElement, update: (event: PointerEvent) => void): void {
    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      node.focus();
      node.setPointerCapture(event.pointerId);
      update(event);
    });
    node.addEventListener('pointermove', (event) => {
      if (node.hasPointerCapture(event.pointerId)) {
        update(event);
      }
    });
  }
  bindDrag(sv, dragSv);
  bindDrag(hueEl, dragHue);

  sv.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    switch (event.key) {
      case 'ArrowLeft':
        s = clamp(s - step, 0, 1);
        break;
      case 'ArrowRight':
        s = clamp(s + step, 0, 1);
        break;
      case 'ArrowUp':
        v = clamp(v + step, 0, 1);
        break;
      case 'ArrowDown':
        v = clamp(v - step, 0, 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    emit();
  });

  hueEl.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      h = clamp(Math.round(h) - step, 0, 360);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      h = clamp(Math.round(h) + step, 0, 360);
    } else {
      return;
    }
    event.preventDefault();
    emit();
  });

  function onDocPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Node && !host.contains(target) && !anchor.contains(target)) {
      close(false);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = Array.from(host.querySelectorAll<HTMLElement>('button, [tabindex="0"]'));
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !host.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !host.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function open(): void {
    if (opened) {
      return;
    }
    opened = true;
    host.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    sv.focus();
  }

  function close(restoreFocus: boolean): void {
    if (!opened) {
      return;
    }
    opened = false;
    host.hidden = true;
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (restoreFocus) {
      anchor.focus();
    }
  }

  anchor.addEventListener('click', () => {
    if (opened) {
      close(false);
    } else {
      open();
    }
  });

  render();

  return {
    setColor: (value) => applyHex(value, false),
    open,
    close: () => close(false),
    isOpen: () => opened,
  };
}
