import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../game/touchlayout';
import type { ActionId } from '../game/keybinds';
import { controlHtml, holdTouchAction, moveTouchLook, opticOptions, opticOptionsFor, toggleTouchAction, weaponButtonName } from './touchcontrols';

describe('touch control labels', () => {
  it('renders visible icon buttons instead of text-only controls', () => {
    const html = controlHtml('fire', defaultLayout());
    expect(html).toContain('<button type="button" class="tc-btn"');
    expect(html).toContain('<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">');
    expect(html).toContain('--d:88px');
    expect(html).not.toContain('FI</span>');
  });
  it('uses the designed base size for the movement stick', () => {
    expect(controlHtml('stick', defaultLayout())).toContain('--d:120px');
  });
  it('tracks firing and look-pad fingers independently', () => {
    const pointers = new Map([[1, { x: 100, y: 120 }], [2, { x: 600, y: 200 }]]);

    expect(moveTouchLook(pointers, 1, 108, 110)).toEqual({ x: 8, y: -10 });
    expect(moveTouchLook(pointers, 2, 585, 207)).toEqual({ x: -15, y: 7 });
    expect(moveTouchLook(pointers, 3, 10, 10)).toBeUndefined();
    expect(moveTouchLook(pointers, 1, 112, 115)).toEqual({ x: 4, y: 5 });
  });
});

describe('touch use action', () => {
  it('routes use through the regular input path while held', () => {
    const held = new Map();
    const pressed = new Set();
    holdTouchAction({ touchHeld: held, touchPress: action => pressed.add(action) }, 'use');

    expect(held.get('use')).toBe(1);
    expect(pressed.has('use')).toBe(true);
  });

  it('does not turn other held controls into tap actions', () => {
    const held = new Map();
    const pressed = new Set();
    holdTouchAction({ touchHeld: held, touchPress: action => pressed.add(action) }, 'crouch');

    expect(held.get('crouch')).toBe(1);
    expect(pressed.size).toBe(0);
  });

  it('keeps toggle controls active until the next tap', () => {
    const held = new Map<ActionId, number>();
    const pressed = new Set<ActionId>();
    const input = { touchHeld: held, touchPress: (action: ActionId) => { pressed.add(action); } };

    toggleTouchAction(input, 'aim');
    expect(held.get('aim')).toBe(1);
    toggleTouchAction(input, 'aim');
    expect(held.has('aim')).toBe(false);
    expect(pressed.has('aim')).toBe(true);
  });
});

describe('touch optic selector', () => {
  it('offers scopes when the current firearm has no explicit optic attachment', () => {
    const options = opticOptionsFor({ scopeWeapon: 'm4a1', scopeCash: 0, scopeFree: false });

    expect(options.map(option => option.id)).toEqual(['reflex', 'holo', 'acog', 'x4', 'x6']);
    expect(options.every(option => option.price === 0 && !option.disabled)).toBe(true);
  });

  it('offers every optic on the selected gun and marks the equipped one', () => {
    const options = opticOptions('m110', 'x6', 0, false);

    expect(options.map(option => option.id)).toEqual(['reflex', 'holo', 'acog', 'x4', 'x6']);
    expect(options.find(option => option.id === 'x6')).toMatchObject({ equipped: true, disabled: true });
    expect(options.find(option => option.id === 'x4')).toMatchObject({ equipped: false, disabled: false, price: 0 });
    expect(options.filter(option => !option.disabled).every(option => option.price === 0)).toBe(true);
  });

  it('offers the zoom scopes for other guns too, all for free', () => {
    const options = opticOptions('m4a1', 'irons', 0, false);

    expect(options.filter(option => !option.disabled).map(option => option.id)).toEqual(['reflex', 'holo', 'acog', 'x4', 'x6']);
    expect(options.every(option => option.price === 0)).toBe(true);
  });

  it('shows the actual equipped weapons on their touch slot buttons', () => {
    const weapons: [string, string] = ['M4A1', 'M110'];

    expect(weaponButtonName('primary', weapons)).toBe('M4A1');
    expect(weaponButtonName('secondary', weapons)).toBe('M110');
    expect(weaponButtonName('fire', weapons)).toBe('');
  });
});
