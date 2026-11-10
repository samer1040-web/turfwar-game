import { describe, expect, it } from 'vitest';
import { GRENADE, SMOKE, WEAPONS } from '../../shared/weapons';
import { purchaseOf, type Owned } from './purchases';

const base: Owned = { owned: ['m4a1', 'm110'], grenades: 0, grenadeHE: false, smokes: 0, molotovs: 0, bobas: 0, attachments: {} };

describe('store purchases for analytics', () => {
  it('counts a gun once the host owns it for us, at its price', () => {
    expect(purchaseOf({ kind: 'item', item: 'm1014' }, base, base, false)).toBeUndefined();
    expect(purchaseOf({ kind: 'item', item: 'm1014' }, base, { ...base, owned: [...base.owned, 'm1014'] }, false)).toEqual({ item: 'm1014', price: WEAPONS.m1014.price });
    expect(purchaseOf({ kind: 'item', item: 'm1014' }, base, { ...base, owned: [...base.owned, 'm1014'] }, true)).toEqual({ item: 'm1014', price: 0 });
  });

  it('does not count re-equipping an owned gun', () => {
    expect(purchaseOf({ kind: 'item', item: 'm4a1' }, base, base, false)).toBeUndefined();
  });

  it('counts grenades and attachments', () => {
    expect(purchaseOf({ kind: 'item', item: 'grenade' }, base, { ...base, grenades: 1 }, false)).toEqual({ item: 'grenade', price: GRENADE.price });
    expect(purchaseOf({ kind: 'item', item: 'smoke' }, base, { ...base, smokes: 1 }, false)).toEqual({ item: 'smoke', price: SMOKE.price });
    expect(purchaseOf({ kind: 'item', item: 'smoke' }, base, base, false)).toBeUndefined();
    expect(purchaseOf({ kind: 'attach', weapon: 'mp5', attachment: 'reflex' }, base, { ...base, attachments: { mp5: { optic: 'reflex' } } }, false)).toEqual({ item: 'mp5:reflex', price: 0 });
    expect(purchaseOf({ kind: 'attach', weapon: 'mp5', attachment: 'suppressor' }, base, { ...base, attachments: { mp5: { muzzle: 'suppressor' } } }, false)).toEqual({ item: 'mp5:suppressor', price: 1100 });
    expect(purchaseOf({ kind: 'attach', weapon: 'mp5', attachment: 'irons' }, base, base, false)).toBeUndefined();
  });
});
