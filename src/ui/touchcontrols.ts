import type { Input } from '../game/input';
import type { ActionId } from '../game/keybinds';
import { type HoldAim } from '../game/holdfire';
import {
  CONTROLS, controlAction, placeOf, stickShown, type ControlId, type PlaceId, type TouchContext, type TouchLayout, visibleControls, touchLayout,
} from '../game/touchlayout';

export interface TouchInfo {
  slot: number;
  weapons: [string, string];
  grenades: number;
  smokes: number;
  molotovs: number;
  bobas: number;
  use?: 'vehicle' | 'crate' | 'arm' | 'disarm';
  storeHot: boolean;
  reloading: boolean;
  holdAim: HoldAim;
  shots: number;
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

export function controlName(id: PlaceId, layout?: TouchLayout): string {
  if (id === 'stick') return 'Move';
  const { action } = controlAction(id, layout);
  return humanName(id) || actionName(action);
}

function cssSize(size: number) {
  return `${Math.max(28, Math.round(size * 100))}px`;
}

function placeStyle(layout: TouchLayout, id: PlaceId) {
  const p = placeOf(layout, id);
  return `left:${Math.round(p.x * 1000) / 10}%;top:${Math.round(p.y * 1000) / 10}%;--d:${cssSize(p.size)};`;
}

export function controlHtml(id: PlaceId, layout: TouchLayout, extra = ''): string {
  if (id === 'stick') {
    const p = placeOf(layout, id);
    const className = `tc-stick ${extra}`.trim();
    return `<div class="${className}" data-c="stick" style="left:${Math.round(p.x * 1000) / 10}%;top:${Math.round(p.y * 1000) / 10}%;--d:${cssSize(p.size)};" aria-label="Move"><span class="ring"></span><span class="knob"></span></div>`;
  }
  const { action } = controlAction(id, layout);
  const label = humanName(id).slice(0, 2).toUpperCase() || actionName(action).slice(0, 2).toUpperCase();
  const cls = `tc-btn ${extra}`.trim();
  return `<div class="${cls}" data-c="${id}" style="${placeStyle(layout, id)}" title="${controlName(id, layout)}"><span class="tc-l">${label}</span></div>`;
}

export class TouchControls {
  readonly root = document.createElement('div');
  readonly stick = document.createElement('div');
  private readonly buttons = new Map<PlaceId, HTMLElement>();
  private readonly stop = new AbortController();

  constructor(container: HTMLElement, private readonly input: Input, private readonly ui: { typeChat: (team: boolean) => void; say: (text: string, team: boolean) => void }) {
    this.root.className = 'touch-layer';
    this.root.setAttribute('aria-label', 'Touch controls');
    this.stick.className = 'tc-stick';
    this.stick.innerHTML = '<span class="ring"></span><span class="knob"></span>';
    this.root.append(this.stick);
    container.appendChild(this.root);
    this.root.addEventListener('pointerdown', e => this.pointerDown(e), { signal: this.stop.signal });
    this.root.addEventListener('pointermove', e => this.pointerMove(e), { signal: this.stop.signal });
    this.root.addEventListener('pointerup', e => this.pointerUp(e), { signal: this.stop.signal });
    this.root.addEventListener('pointercancel', e => this.pointerUp(e), { signal: this.stop.signal });
    this.root.addEventListener('contextmenu', e => e.preventDefault(), { signal: this.stop.signal });
    this.update({ scope: 'none' }, { slot: 0, weapons: ['', ''], grenades: 0, smokes: 0, molotovs: 0, bobas: 0, storeHot: false, reloading: false, holdAim: 'none', shots: 0 });
  }

  dispose() {
    this.stop.abort();
    this.root.remove();
  }

  private idFor(target: EventTarget | null): PlaceId | undefined {
    const el = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-c]') : null;
    return el?.dataset.c as PlaceId | undefined;
  }

  private bind(action: ActionId, hold = false) {
    this.input.touchHeld.set(action, 1);
    if (hold) return;
    this.input.touchPress(action);
  }

  private unbind(action: ActionId) {
    this.input.touchHeld.delete(action);
  }

  private pointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = this.idFor(e.target);
    if (!id) {
      if (this.stick.dataset.active === 'yes') this.input.touchHeld.clear();
      return;
    }
    if (id === 'stick') {
      this.stick.dataset.active = 'yes';
      this.stick.setPointerCapture?.(e.pointerId);
      return;
    }
    const { action, kind } = controlAction(id, touchLayout());
    if (kind === 'hold' || kind === 'toggle') this.bind(action, true);
    else this.bind(action, false);
    const el = this.buttons.get(id);
    if (el) el.classList.add('active');
  }

  private pointerMove(e: PointerEvent) {
    if (this.stick.dataset.active !== 'yes') return;
    const rect = this.root.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const dx = x - 0.5;
    const dy = y - 0.5;
    const fs = Math.hypot(dx, dy);
    const movement = fs > 0.1 ? { x: dx / Math.max(fs, 0.001), y: dy / Math.max(fs, 0.001) } : { x: 0, y: 0 };
    this.input.touchHeld.set('forward', Math.max(0, -movement.y));
    this.input.touchHeld.set('back', Math.max(0, movement.y));
    this.input.touchHeld.set('left', Math.max(0, -movement.x));
    this.input.touchHeld.set('right', Math.max(0, movement.x));
    this.stick.style.left = `${x * 100}%`;
    this.stick.style.top = `${y * 100}%`;
  }

  private pointerUp(e: PointerEvent) {
    const id = this.idFor(e.target);
    if (id && id !== 'stick') {
      const { action, kind } = controlAction(id, touchLayout());
      if (kind === 'hold' || kind === 'toggle') this.unbind(action);
      const el = this.buttons.get(id);
      if (el) el.classList.remove('active');
    }
    if (this.stick.dataset.active === 'yes') {
      this.stick.dataset.active = 'no';
      this.input.touchHeld.delete('forward');
      this.input.touchHeld.delete('back');
      this.input.touchHeld.delete('left');
      this.input.touchHeld.delete('right');
      this.stick.style.left = '';
      this.stick.style.top = '';
    }
  }

  update(ctx: TouchContext, info: TouchInfo) {
    const layout = touchLayout();
    const shown = [...visibleControls(ctx, layout)];
    if (ctx.scope === 'none' || !stickShown(ctx.scope)) this.root.classList.add('off');
    else this.root.classList.remove('off');
    const stickVisible = stickShown(ctx.scope);
    this.stick.style.display = stickVisible ? 'block' : 'none';
    if (stickVisible) {
      const p = placeOf(layout, 'stick');
      this.stick.style.setProperty('--d', cssSize(p.size));
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
        const el = document.createElement('div');
        el.className = 'tc-btn';
        el.dataset.c = id;
        const label = humanName(id).slice(0, 2).toUpperCase();
        el.innerHTML = `<span class="tc-l">${label}</span>`;
        this.root.appendChild(el);
        this.buttons.set(id, el);
      }
      const el = this.buttons.get(id)!;
      const p = placeOf(layout, id);
      el.style.left = `${p.x * 100}%`;
      el.style.top = `${p.y * 100}%`;
      el.style.setProperty('--d', cssSize(p.size));
      el.classList.toggle('active', (info.holdAim !== 'none' && id === 'fire') || !!(info.reloading && id === 'reload'));
      el.title = controlName(id, layout);
      const action = controlAction(id, layout).action;
      el.dataset.action = action;
    }
  }
}