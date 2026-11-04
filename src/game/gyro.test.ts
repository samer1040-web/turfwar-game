import { describe, expect, it } from 'vitest';
import { gyroLookDelta } from './gyro';

describe('gyro look', () => {
  it('maps portrait tilt to horizontal and vertical look', () => {
    const delta = gyroLookDelta(
      { alpha: 0, beta: 0, gamma: 0, angle: 0 },
      { alpha: 0, beta: 4, gamma: 5, angle: 0 },
    );
    expect(delta.x).toBeCloseTo(-5, 1);
    expect(delta.y).toBeCloseTo(-4, 1);
  });

  it('rotates tilt axes to match landscape play', () => {
    const delta = gyroLookDelta(
      { alpha: 0, beta: 0, gamma: 0, angle: 90 },
      { alpha: 0, beta: 4, gamma: 5, angle: 90 },
    );
    expect(delta.x).toBeCloseTo(-4, 1);
    expect(delta.y).toBeCloseTo(5, 1);
  });

  it('uses the shortest delta across sensor angle wraparound', () => {
    expect(gyroLookDelta(
      { alpha: 0, beta: 179, gamma: 0, angle: 0 },
      { alpha: 0, beta: -179, gamma: 0, angle: 0 },
    ).y).toBeCloseTo(-2);
  });

  it('does not turn the view when only the phone heading changes', () => {
    expect(gyroLookDelta(
      { alpha: 178, beta: 0, gamma: 0, angle: 90 },
      { alpha: -178, beta: 0, gamma: 0, angle: 90 },
    )).toEqual({ x: 0, y: 0 });
  });
});
