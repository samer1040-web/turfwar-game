import { MapBuilder } from './builder';
import type { MapDef } from './types';

export function taipei101(): MapDef {
  const b = new MapBuilder({
    id: 'taipei101', name: 'Small Arena', region: 'Arena', description: 'Small 1v1 Arena', theme: 'highrise', halfX: 15, halfZ: 15, seed: 88, roll: 0, ridge: 0, sabotage: { sites: ['A'], attackerSpawn: 1 }, sun: { x: -0.84, y: 0.3, z: -0.2 }, ground: () => 0,
  });
  b.buildTerrain(4);
  const addBox = (cx: number, y: number, cz: number, sx: number, sy: number, sz: number, style: any, color: number) => { const i = b.box(cx, y, cz, sx, sy, sz, style); b.paint(i, color); };
  addBox(0, -1, 0, 30, 1, 30, 'concrete', 0x333333);
  addBox(0, 0, -15, 30, 5, 1, 'concrete', 0x555555);
  addBox(0, 0, 15, 30, 5, 1, 'concrete', 0x555555);
  addBox(-15, 0, 0, 1, 5, 30, 'concrete', 0x555555);
  addBox(15, 0, 0, 1, 5, 30, 'concrete', 0x555555);
  addBox(-4, 0, -4, 3, 2, 3, 'crate', 0x8a6a48);
  addBox(4, 0, 4, 3, 2, 3, 'crate', 0x8a6a48);
  addBox(0, 0, 0, 2, 3, 2, 'concrete', 0x777777);
  b.spawn(0, 0, 0, -10, 0); b.spawn(1, 0, 0, 10, Math.PI);
  b.point('A', 'Arena Center', 0, 0, 0, 5);
  return b.build();
}