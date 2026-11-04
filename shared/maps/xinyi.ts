import { MapBuilder } from './builder';
import type { MapDef } from './types';

export function xinyi(): MapDef {
  const b = new MapBuilder({
    id: 'xinyi', name: 'Small Arena', region: 'Arena', description: 'Small 1v1 Arena', theme: 'highrise', halfX: 25, halfZ: 25, seed: 88, roll: 0, ridge: 0, sabotage: { sites: ['A'], attackerSpawn: 1 }, sun: { x: -0.84, y: 0.3, z: -0.2 }, ground: () => 0,
  });
  b.buildTerrain(4);
  
  const addBox = (cx: number, y: number, cz: number, sx: number, sy: number, sz: number, style: any, color: number) => { 
    const i = b.box(cx, y, cz, sx, sy, sz, style); 
    b.paint(i, color); 
  };
  
  // 1. الأرضية (50x50)
  addBox(0, -1, 0, 50, 1, 50, 'concrete', 0x333333);

  // 2. الجدران الخارجية للحلبة
  addBox(0, 0, -25, 50, 6, 1, 'concrete', 0x555555);
  addBox(0, 0, 25, 50, 6, 1, 'concrete', 0x555555);
  addBox(-25, 0, 0, 1, 6, 50, 'concrete', 0x555555);
  addBox(25, 0, 0, 1, 6, 50, 'concrete', 0x555555);

  // 3. صناديق الغطاء في الأطراف
  addBox(-18, 0, -18, 4, 3, 4, 'crate', 0x8a6a48);
  addBox(18, 0, 18, 4, 3, 4, 'crate', 0x8a6a48);
  addBox(-18, 0, 18, 4, 3, 4, 'crate', 0x8a6a48);
  addBox(18, 0, -18, 4, 3, 4, 'crate', 0x8a6a48);

  // ==========================================
  // 4. بناء العمارة في المنتصف
  // ==========================================
  
  // أرضية العمارة
  addBox(0, 0, 0, 16, 0.2, 16, 'concrete', 0x444444);

  // جدران الطابق الأرضي
  addBox(0, 0.2, -8, 16, 4, 1, 'concrete', 0x888888); // الجدار الشمالي
  addBox(-8, 0.2, 0, 1, 4, 16, 'concrete', 0x888888); // الجدار الغربي
  addBox(8, 0.2, 0, 1, 4, 16, 'concrete', 0x888888);  // الجدار الشرقي
  
  // الجدار الجنوبي (مع مدخل في المنتصف)
  addBox(-5, 0.2, 8, 6, 4, 1, 'concrete', 0x888888); // الجزء الأيسر
  addBox(5, 0.2, 8, 6, 4, 1, 'concrete', 0x888888);  // الجزء الأيمن
  addBox(0, 3.2, 8, 4, 1, 1, 'concrete', 0x888888);  // إطار الباب العلوي

  // سقف العمارة (الطابق الثاني)
  addBox(0, 4.2, 0, 18, 0.5, 18, 'concrete', 0x777777);

  // سواتر على السطح (لكي يختبئ اللاعب)
  addBox(0, 4.7, -8, 18, 1.5, 1, 'concrete', 0x999999);
  addBox(-8, 4.7, 0, 1, 1.5, 18, 'concrete', 0x999999);
  addBox(8, 4.7, 0, 1, 1.5, 18, 'concrete', 0x999999);

  // 5. سلالم للصعود إلى سطح العمارة (في الجهة الشرقية)
  // b.stairs(12, 0, 4, 12, 0, 4.4, 10);

  // 6. نقاط الظهور (بعيداً عن العمارة)
  b.spawn(0, 0, 0, -20, 0); 
  b.spawn(1, 0, 0, 20, Math.PI);
  
  b.point('A', 'Arena Center', 0, 0, 0, 5);
  
  return b.build();
}