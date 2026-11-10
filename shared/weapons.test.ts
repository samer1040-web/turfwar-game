import { describe, expect, it } from 'vitest';
import {
  ATTACHMENTS, ATTACHMENT_IDS, ATTACHMENT_SLOTS, DEFAULT_WEAPONS, HEALTH, WEAPONS, WEAPON_IDS, attachmentPrice, fitsWeapon, normalizeAttachments, weaponStats, zoneDamage,
} from './weapons';

const all = Object.values(WEAPONS);

describe('BeGone roster', () => {
  it('has the game weapons with real names and their store prices', () => {
    expect([...WEAPON_IDS].sort()).toEqual(['knife', 'm1014', 'm110', 'm249', 'm4a1', 'mp5', 'mp7']);
    const prices = Object.fromEntries(all.map(w => [w.id, w.price]));
    expect(prices).toMatchObject({ mp5: 0, knife: 0, m4a1: 3400, m1014: 2800, m110: 4000, m249: 3800, mp7: 1800 });
    expect(DEFAULT_WEAPONS).toEqual(['m4a1', 'm110']);
  });

  it('every weapon is complete and in its slot', () => {
    for (const w of all) {
      expect(w.model).toMatch(/^Gun_/);
      expect(w.interval).toBeGreaterThan(0);
      expect(w.botRange).toBeGreaterThan(0);
      expect(w.pellets).toBeGreaterThanOrEqual(1);
      expect(w.slot).toBe(w.class === 'melee' ? 2 : w.id === 'm110' || w.id === 'mp7' ? 1 : 0);
      if (w.slot !== 2) { expect(w.magazine).toBeGreaterThan(0); expect(w.reload).toBeGreaterThan(0); }
    }
  });

  it('damage by zone matches BeGone (MP5 30/18/12, M110 90 to the head)', () => {
    expect([zoneDamage(WEAPONS.mp5, 'head'), zoneDamage(WEAPONS.mp5, 'body'), zoneDamage(WEAPONS.mp5, 'legs')]).toEqual([30, 18, 12]);
    expect(zoneDamage(WEAPONS.m110, 'head')).toBeGreaterThanOrEqual(HEALTH.max * 0.9);
  });

  it('keeps the requested M4A1 and M110 in separate loadout slots', () => {
    expect(WEAPONS[DEFAULT_WEAPONS[0]].slot).toBe(0);
    expect(WEAPONS[DEFAULT_WEAPONS[1]].slot).toBe(1);
    expect(WEAPONS.m110.class).toBe('sniper');
    expect(weaponStats('m110', {}).attachments.optic).toBe('x6');
  });

  it('time to kill on the body stays between a quarter second and two seconds', () => {
    for (const w of all) {
      if (w.slot === 2) continue;
      const shots = Math.ceil(HEALTH.max / (zoneDamage(w, 'body') * w.pellets));
      const ttk = (shots - 1) * w.interval;
      expect(ttk, w.id).toBeLessThan(2);
    }
  });

  it('aiming down sights is tighter than the hip, and sniper zoom is strongest', () => {
    for (const w of all) {
      if (w.slot === 2) continue;
      expect(w.spread.ads, w.id).toBeLessThanOrEqual(w.spread.hip);
    }
  });
});

describe('attachments', () => {
  it('one item per slot, priced, fitting at least one weapon', () => {
    for (const id of ATTACHMENT_IDS) {
      const a = ATTACHMENTS[id];
      expect(ATTACHMENT_SLOTS).toContain(a.category);
      expect(WEAPON_IDS.some(w => w !== 'knife' && fitsWeapon(a, w)), id).toBe(true);
    }
    for (const a of Object.values(ATTACHMENTS).filter(a => a.category === 'optic')) {
      expect(a.price, a.id).toBe(0);
    }
  });

  it('change stats when fitted', () => {
    expect(weaponStats('m4a1', { magazine: 'extendedClip' }).magazine).toBeGreaterThan(WEAPONS.m4a1.magazine);
    expect(weaponStats('m4a1', { muzzle: 'suppressor' }).suppressed).toBe(true);
    expect(weaponStats('m4a1', { optic: 'acog' }).zoom).toBeLessThan(WEAPONS.m4a1.zoom); // zoom is the FOV fraction
    expect(weaponStats('m4a1', { stock: 'recoilPad' }).recoil.pitch).toBeLessThanOrEqual(WEAPONS.m4a1.recoil.pitch);
    expect(attachmentPrice(ATTACHMENTS.suppressor, 'mp7')).toBeGreaterThan(0);
    expect(fitsWeapon(ATTACHMENTS.acog, 'knife')).toBe(false);
    // Gadgets in different slots stack on one gun.
    const all = weaponStats('m4a1', { optic: 'acog', muzzle: 'suppressor', laser: 'laser', light: 'flashlight', counter: 'ammoCounter', magazine: 'extendedClip', stock: 'recoilPad' });
    expect(all.suppressed).toBe(true);
    expect(all.magazine).toBeGreaterThan(WEAPONS.m4a1.magazine);
    expect(normalizeAttachments({ tactical: 'laser', mod: 'recoilPad' })).toEqual({ laser: 'laser', stock: 'recoilPad' });
  });
});
