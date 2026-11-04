import type { Input } from '../game/input';
import { GyroAim } from '../game/gyro';
import type { ActionId } from '../game/keybinds';
import { type HoldAim } from '../game/holdfire';
import {
  CONTROLS, controlAction, placeOf, stickActions, stickShown, STICK, TOUCH_LOOK_SCALE, touchSensitivity, type ControlId, type ControlKind, type PlaceId, type TouchContext, type TouchLayout, visibleControls, touchLayout,
} from '../game/touchlayout';
import { onLang, t } from './i18n';
import { toView, viewRect } from './viewport';

export interface TouchInfo {
  slot: number;
  weapons: [string, string];
  grenades: number;
  smokes: number;
  molotovs: number;
  bobas: number;
  use?: 'vehicle' | 'crate' | 'weapon' | 'arm' | 'disarm';
  storeHot: boolean;
  reloading: boolean;
  holdAim: HoldAim;
  shots: number;
}

export interface TouchLookPoint {
  x: number;
  y: number;
}

export function holdTouchAction(input: Pick<Input, 'touchHeld' | 'touchPress'>, action: ActionId) {
  input.touchHeld.set(action, 1);
  if (action === 'use') input.touchPress(action);
}

export function moveTouchLook(pointers: Map<number, TouchLookPoint>, pointer: number, x: number, y: number) {
  const active = pointers.get(pointer);
  if (!active) return undefined;
  const delta = { x: x - active.x, y: y - active.y };
  active.x = x;
  active.y = y;
  return delta;
}

const humanName = (id: ControlId | 'stick') => {
  const names: Record<string, string> = {
    fire: 'Fire', hipfire: 'Hipfire', aim: 'Aim', jump: 'Jump', crouch: 'Crouch', reload: 'Reload',
    use: 'Use', zoom: 'Zoom', binoculars: 'Binoculars', knife: 'Knife', secondary: 'Secondary', primary: 'Primary',
    grenade: 'Grenade', smoke: 'Smoke', molotov: 'Molotov', drink: 'Drink', handbrake: 'Handbrake', climb: 'Climb',
    descend: 'Descend', view: 'View', exit: 'Exit', spectate: 'Spectate', menu: 'Menu', scoreboard: 'Scoreboard',
    chat: 'Chat', store: 'Store', custom1: 'Custom 1', custom2: 'Custom 2', stick: 'Move',
  };
  return names[id] ?? id;
};

const actionName = (action: ActionId) => action.replace(/[A-Z]/g, c => ` ${c.toLowerCase()}`).replace(/^./, c => c.toUpperCase()).trim();

const ICONS: Record<ControlId, string> = {
  fire: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  hipfire: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  aim: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  jump: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  crouch: '<path d="M5 19h14M8 15l4-4 4 4M12 11V4"/>',
  reload: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3"/>',
  use: '<path d="M8 12V6a2 2 0 0 1 4 0v5-2a2 2 0 0 1 4 0v3-1a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a7 7 0 0 1-5-2l-4-4a2 2 0 0 1 3-3l2 2"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  binoculars: '<path d="M6 7h3l2 5h2l2-5h3l2 11h-5l-2-4h-2l-2 4H4z"/><circle cx="7" cy="15" r="2"/><circle cx="17" cy="15" r="2"/>',
  knife: '<path d="M4 20 18 6l2-3-3 2L3 19l1 1Z"/><path d="m5 17 2 2"/>',
  secondary: '<path d="M4 11h11l3 3v3h-5l-2-2H8l-2 2H4z"/><path d="M8 11V8h6l2 3M7 17v3m8-3v3"/>',
  primary: '<path d="M3 10h13l2 3h3v3h-5l-2-2H9l-2 2H4z"/><path d="M8 10V7h8v3M7 16v4m9-4v4"/>',
  grenade: '<path d="M9 5h6v3l2 2v9H7v-9l2-2z"/><path d="M10 5V3h4v2m-5 8h6"/>',
  smoke: '<path d="M7 18a4 4 0 0 1-.2-8A5 5 0 0 1 16 8a4 4 0 1 1 1 10z"/><path d="M9 13h.01M14 15h.01"/>',
  molotov: '<path d="m10 3 4 1-1 5 4 4-2 8H8l-2-8 4-4z"/><path d="M11 3c-2-2 2-2 1-3"/>',
  drink: '<path d="M7 4h10l-1 17H8L7 4Z"/><path d="M9 9h6m-5-8 5 3"/>',
  handbrake: '<path d="M12 3v9"/><circle cx="12" cy="15" r="6"/>',
  climb: '<path d="M5 21V3m14 18V3M5 7h14M5 13h14M5 19h14"/><path d="m9 10 3-3 3 3"/>',
  descend: '<path d="M5 21V3m14 18V3M5 7h14M5 13h14M5 19h14"/><path d="m9 16 3 3 3-3"/>',
  view: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>',
  exit: '<path d="M10 4H5v16h5m4-4 4-4-4-4m4 4H9"/>',
  spectate: '<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z"/><path d="m10 9 5 3-5 3z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  scoreboard: '<path d="M4 5h16M4 10h16M4 15h10M4 20h10"/><path d="M18 14v7m-3-3 3 3 3-3"/>',
  chat: '<path d="M4 5h16v12h-9l-5 4v-4H4z"/><path d="M8 9h8m-8 4h6"/>',
  store: '<path d="M4 9h16l-1-5H5zM6 9v11h12V9M9 20v-6h6v6"/>',
  custom1: '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="8"/>',
  custom2: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
};

function icon(id: ControlId) {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${ICONS[id]}</svg>`;
}

export function controlName(id: PlaceId, layout?: TouchLayout): string {
  if (id === 'stick') return 'Move';
  const { action } = controlAction(id, layout);
  return humanName(id) || actionName(action);
}

function cssSize(size: number) {
  return `${Math.max(28, Math.round(size))}px`;
}

function placeStyle(layout: TouchLayout, id: PlaceId) {
  const p = placeOf(layout, id);
  const diameter = id === 'stick' ? STICK.size : CONTROLS[id].size;
  return `left:${Math.round(p.x * 1000) / 10}%;top:${Math.round(p.y * 1000) / 10}%;--d:${cssSize(diameter * p.size)};`;
}

function buttonClass(extra = '') {
  return `tc-btn ${extra}`.trim();
}

export function controlHtml(id: PlaceId, layout: TouchLayout, extra = ''): string {
  if (id === 'stick') {
    const p = placeOf(layout, id);
    const className = `tc-stick ${extra}`.trim();
    return `<div class="${className}" data-c="stick" style="left:${Math.round(p.x * 1000) / 10}%;top:${Math.round(p.y * 1000) / 10}%;--d:${cssSize(STICK.size * p.size)};" aria-label="Move"><span class="ring"></span><span class="knob"></span></div>`;
  }
  const label = controlName(id, layout);
  const cls = buttonClass(extra);
  return `<button type="button" class="${cls}" data-c="${id}" style="${placeStyle(layout, id)}" title="${label}" aria-label="${label}">${icon(id)}</button>`;
}

export class TouchControls {
  readonly root = document.createElement('div');
  readonly stick = document.createElement('div');
  private readonly gyroButton = document.createElement('button');
  private readonly gyro: GyroAim;
  private readonly buttons = new Map<PlaceId, HTMLElement>();
  private readonly stop = new AbortController();
  private readonly activeButtons = new Map<number, { id: ControlId; action: ActionId; kind: ControlKind }>();
  private readonly stickActions = new Set<ActionId>();
  private activeStick?: { pointer: number; x: number; y: number; radius: number };
  private readonly activeLooks = new Map<number, TouchLookPoint>();
  private context: TouchContext = { scope: 'none' };
  private readonly stopLang: () => void;

  constructor(container: HTMLElement, private readonly input: Input, private readonly ui: { typeChat: (team: boolean) => void; say: (text: string, team: boolean) => void }) {
    this.root.className = 'touch-layer';
    this.root.setAttribute('aria-label', 'Touch controls');
    this.gyro = new GyroAim(input, state => {
      this.gyroButton.dataset.error = state === 'denied' ? 'yes' : '';
      this.updateGyroButton();
    });
    this.stick.className = 'tc-stick';
    this.stick.innerHTML = '<span class="ring"></span><span class="knob"></span>';
    this.gyroButton.type = 'button';
    this.gyroButton.className = 'tc-gyro';
    this.gyroButton.textContent = this.gyroButton.dataset.error === 'yes' ? '!' : t('tc.gyroShort');
    this.gyroButton.hidden = !this.gyro.available;
    this.gyroButton.addEventListener('pointerdown', e => e.stopPropagation(), { signal: this.stop.signal });
    this.gyroButton.addEventListener('click', () => void this.gyro.toggle(), { signal: this.stop.signal });
    this.root.append(this.stick, this.gyroButton);
    container.appendChild(this.root);
    this.root.addEventListener('pointerdown', e => this.pointerDown(e), { signal: this.stop.signal });
    this.root.addEventListener('pointermove', e => this.pointerMove(e), { signal: this.stop.signal });
    this.root.addEventListener('pointerup', e => this.pointerUp(e), { signal: this.stop.signal });
    this.root.addEventListener('pointercancel', e => this.pointerUp(e), { signal: this.stop.signal });
    this.root.addEventListener('contextmenu', e => e.preventDefault(), { signal: this.stop.signal });
    this.stopLang = onLang(() => this.updateGyroButton());
    this.updateGyroButton();
    this.update({ scope: 'none' }, { slot: 0, weapons: ['', ''], grenades: 0, smokes: 0, molotovs: 0, bobas: 0, storeHot: false, reloading: false, holdAim: 'none', shots: 0 });
  }

  dispose() {
    this.gyro.dispose();
    this.stopLang();
    this.stop.abort();
    this.root.remove();
  }

  private updateGyroButton() {
    const title = this.gyroButton.dataset.error === 'yes'
      ? t('tc.gyroDenied')
      : t(this.gyro.starting ? 'tc.gyro.wait' : this.gyro.enabled ? 'tc.gyro.on' : 'tc.gyro.off');
    this.gyroButton.textContent = this.gyroButton.dataset.error === 'yes' ? '!' : this.gyro.starting ? '…' : t('tc.gyroShort');
    this.gyroButton.classList.toggle('on', this.gyro.enabled);
    this.gyroButton.setAttribute('aria-pressed', String(this.gyro.enabled));
    this.gyroButton.setAttribute('aria-label', title);
    this.gyroButton.title = title;
  }

  private idFor(target: EventTarget | null): PlaceId | undefined {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-c]') : null;
    return el?.dataset.c as PlaceId | undefined;
  }

  private unbind(action: ActionId) { this.input.touchHeld.delete(action); }

  private point(e: PointerEvent) {
    const p = toView(e.clientX, e.clientY), r = viewRect(this.root.getBoundingClientRect());
    return { x: p.x - r.left, y: p.y - r.top, width: r.width, height: r.height };
  }

  private beginStick(e: PointerEvent) {
    if (!stickShown(this.context.scope) || this.activeStick) return;
    const p = this.point(e);
    if (p.x > p.width * 0.5) return;
    const place = placeOf(touchLayout(), 'stick');
    const radius = Math.max(48, STICK.size * place.size / 2);
    this.activeStick = { pointer: e.pointerId, x: p.x, y: p.y, radius };
    this.root.setPointerCapture(e.pointerId);
    this.stick.dataset.active = 'yes';
    this.stick.classList.add('live');
    this.stick.style.display = 'block';
    this.stick.style.left = `${p.x / p.width * 100}%`;
    this.stick.style.top = `${p.y / p.height * 100}%`;
    this.stick.style.setProperty('--kx', '0px');
    this.stick.style.setProperty('--ky', '0px');
    e.preventDefault();
  }

  private beginLook(e: PointerEvent, fromFire = false) {
    if (this.activeLooks.has(e.pointerId) || !this.input.touch) return;
    const p = this.point(e);
    if (p.x <= p.width * 0.5 && !fromFire) return;
    this.activeLooks.set(e.pointerId, { x: p.x, y: p.y });
    this.root.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  private moveLook(e: PointerEvent) {
    if (!this.activeLooks.has(e.pointerId)) return;
    const p = this.point(e);
    const delta = moveTouchLook(this.activeLooks, e.pointerId, p.x, p.y);
    if (delta) this.input.touchLook(delta.x, delta.y, TOUCH_LOOK_SCALE * touchSensitivity());
  }

  private endLook(pointer: number) {
    this.activeLooks.delete(pointer);
  }

  private moveStick(e: PointerEvent) {
    const active = this.activeStick;
    if (!active || active.pointer !== e.pointerId) return;
    const p = this.point(e);
    const dx = p.x - active.x, dy = p.y - active.y, distance = Math.hypot(dx, dy);
    const scale = distance > active.radius ? active.radius / distance : 1;
    this.stick.style.setProperty('--kx', `${dx * scale}px`);
    this.stick.style.setProperty('--ky', `${dy * scale}px`);
    for (const action of this.stickActions) this.input.touchHeld.delete(action);
    this.stickActions.clear();
    const values = stickActions(this.context.scope, dx / active.radius, dy / active.radius);
    for (const [action, value] of Object.entries(values) as [ActionId, number][]) {
      this.input.touchHeld.set(action, value);
      this.stickActions.add(action);
    }
  }

  private endStick(pointer: number) {
    if (this.activeStick?.pointer !== pointer) return;
    this.activeStick = undefined;
    this.stick.dataset.active = 'no';
    this.stick.classList.remove('live');
    this.stick.style.left = '';
    this.stick.style.top = '';
    this.stick.style.removeProperty('--kx');
    this.stick.style.removeProperty('--ky');
    for (const action of this.stickActions) this.input.touchHeld.delete(action);
    this.stickActions.clear();
  }

  private pointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = this.idFor(e.target);
    if (!id) {
      this.beginStick(e);
      this.beginLook(e);
      return;
    }
    if (id === 'stick') {
      this.beginStick(e);
      return;
    }
    const { action, kind } = controlAction(id, touchLayout());
    if (kind === 'hold') holdTouchAction(this.input, action);
    else if (kind === 'toggle') {
      if (this.input.touchHeld.has(action)) this.unbind(action);
      else this.input.touchHeld.set(action, 1);
    } else this.input.touchPress(action);
    this.activeButtons.set(e.pointerId, { id, action, kind });
    this.root.setPointerCapture(e.pointerId);
    const el = this.buttons.get(id);
    if (el) el.classList.add('active');
    if (action === 'fire') this.beginLook(e, true);
    e.preventDefault();
  }

  private pointerMove(e: PointerEvent) {
    this.moveStick(e);
    this.moveLook(e);
  }

  private pointerUp(e: PointerEvent) {
    const active = this.activeButtons.get(e.pointerId);
    if (active) {
      this.activeButtons.delete(e.pointerId);
      if (active.kind === 'hold' && ![...this.activeButtons.values()].some(button => button.action === active.action && button.kind === 'hold')) this.unbind(active.action);
      if (![...this.activeButtons.values()].some(button => button.id === active.id)) this.buttons.get(active.id)?.classList.remove('active');
    }
    this.endStick(e.pointerId);
    this.endLook(e.pointerId);
  }

  update(ctx: TouchContext, info: TouchInfo) {
    this.context = ctx;
    const layout = touchLayout();
    this.root.style.setProperty('--op', String(layout.opacity));
    const shown = [...visibleControls(ctx, layout)];
    if (ctx.scope === 'none' || !stickShown(ctx.scope)) this.root.classList.add('off');
    else this.root.classList.remove('off');
    const stickVisible = stickShown(ctx.scope);
    this.stick.style.display = stickVisible ? 'block' : 'none';
    if (stickVisible) {
      const p = placeOf(layout, 'stick');
      this.stick.style.setProperty('--d', cssSize(STICK.size * p.size));
      this.stick.style.left = `${p.x * 100}%`;
      this.stick.style.top = `${p.y * 100}%`;
    }

    for (const [id, el] of [...this.buttons.entries()]) {
      if (id !== 'stick' && !shown.includes(id as ControlId)) {
        el.remove();
        this.buttons.delete(id);
      }
    }

    for (const id of shown) {
      if (!this.buttons.has(id)) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = buttonClass();
        el.dataset.c = id;
        const label = controlName(id, layout);
        el.setAttribute('aria-label', label);
        el.innerHTML = icon(id);
        this.root.appendChild(el);
        this.buttons.set(id, el);
      }
      const el = this.buttons.get(id)!;
      const p = placeOf(layout, id);
      el.style.left = `${p.x * 100}%`;
      el.style.top = `${p.y * 100}%`;
      el.style.setProperty('--d', cssSize(CONTROLS[id].size * p.size));
      el.classList.toggle('active', (info.holdAim !== 'none' && id === 'fire') || !!(info.reloading && id === 'reload'));
      el.title = controlName(id, layout);
      el.setAttribute('aria-label', el.title);
      const action = controlAction(id, layout).action;
      el.dataset.action = action;
      el.classList.toggle('on', this.input.down(action));
    }
  }
}