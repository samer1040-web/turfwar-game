import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../game/touchlayout';
import type { ActionId } from '../game/keybinds';
import { controlHtml, holdTouchAction, moveTouchLook, toggleTouchAction, touchUseAction } from './touchcontrols';

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
  it('sends a weapon pickup directly from the touch use button', () => {
    const held = new Map();
    const pressed = new Set();
    let pickups = 0;
    const handled = touchUseAction(
      { touchHeld: held, touchPress: action => pressed.add(action) },
      () => { pickups++; return true; },
    );

    expect(handled).toBe(true);
    expect(pickups).toBe(1);
    expect(held.size).toBe(0);
    expect(pressed.size).toBe(0);
  });

  it('falls back to the regular use action when no weapon is in reach', () => {
    const held = new Map();
    const pressed = new Set();
    const handled = touchUseAction(
      { touchHeld: held, touchPress: action => pressed.add(action) },
      () => false,
    );

    expect(handled).toBe(false);
    expect(held.get('use')).toBe(1);
    expect(pressed.has('use')).toBe(true);
  });

  it('fires one use press while retaining the held state', () => {
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
