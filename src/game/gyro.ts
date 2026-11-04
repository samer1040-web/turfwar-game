import type { Input } from './input';

type GyroState = 'off' | 'on' | 'denied';
type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

interface OrientationSample {
  alpha: number;
  beta: number;
  gamma: number;
  angle: number;
}

const MAX_DELTA = 30;

const wrapDegrees = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;

type Quaternion = { x: number; y: number; z: number; w: number };

const multiply = (a: Quaternion, b: Quaternion): Quaternion => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

const inverse = (q: Quaternion): Quaternion => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** DeviceOrientation uses intrinsic Z-X'-Y'' rotations. */
function orientationQuaternion(sample: OrientationSample): Quaternion {
  const half = Math.PI / 360;
  const a = sample.alpha * half, b = sample.beta * half, g = sample.gamma * half;
  const qz = { x: 0, y: 0, z: Math.sin(a), w: Math.cos(a) };
  const qx = { x: Math.sin(b), y: 0, z: 0, w: Math.cos(b) };
  const qy = { x: 0, y: Math.sin(g), z: 0, w: Math.cos(g) };
  return multiply(multiply(qz, qx), qy);
}

/** Convert the relative device rotation into horizontal and vertical look deltas. */
export function gyroLookDelta(previous: OrientationSample, current: OrientationSample) {
  const before = orientationQuaternion(previous);
  const after = orientationQuaternion(current);
  let delta = multiply(inverse(before), after);
  if (delta.w < 0) delta = { x: -delta.x, y: -delta.y, z: -delta.z, w: -delta.w };
  const sinHalf = Math.hypot(delta.x, delta.y, delta.z);
  if (sinHalf < 1e-8) return { x: 0, y: 0 };
  const radians = 2 * Math.atan2(sinHalf, Math.max(-1, Math.min(1, delta.w)));
  const scale = radians / sinHalf * 180 / Math.PI;
  const beta = delta.x * scale;
  const gamma = delta.y * scale;
  const angle = current.angle * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const x = gamma * cos + beta * sin;
  const y = beta * cos - gamma * sin;
  return {
    x: Math.abs(x) < 1e-10 ? 0 : -x,
    y: Math.abs(y) < 1e-10 ? 0 : -y,
  };
}

export class GyroAim {
  private state: GyroState | 'starting' = 'off';
  private previous?: OrientationSample;
  private requesting = false;
  private disposed = false;
  private startTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly input: Input, private readonly changed: (state: GyroState | 'starting') => void) {}

  get available() {
    return typeof window !== 'undefined' && !!(window as Window & { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent;
  }

  get enabled() { return this.state === 'on' || this.state === 'starting'; }
  get starting() { return this.state === 'starting'; }

  async toggle() {
    if (this.requesting || this.disposed) return;
    if (this.enabled) {
      this.stop();
      return;
    }

    const constructor = (window as Window & { DeviceOrientationEvent?: OrientationConstructor }).DeviceOrientationEvent;
    if (!constructor) return;

    this.requesting = true;
    try {
      if (constructor.requestPermission && await constructor.requestPermission() !== 'granted') {
        this.setState('denied');
        return;
      }
    } catch {
      this.setState('denied');
      return;
    } finally {
      this.requesting = false;
    }

    if (this.disposed) return;
    this.previous = undefined;
    window.addEventListener('deviceorientation', this.onOrientation);
    window.addEventListener('orientationchange', this.reset);
    window.screen.orientation?.addEventListener('change', this.reset);
    this.setState('starting');
    this.startTimer = setTimeout(() => {
      if (this.state !== 'starting') return;
      this.stop();
      this.setState('denied');
    }, 2000);
  }

  dispose() {
    this.disposed = true;
    this.stop();
  }

  private readonly reset = () => { this.previous = undefined; };

  private readonly onOrientation = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    const angle = document.body.classList.contains('sideways')
      ? 90
      : window.screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
    const sample = { alpha: event.alpha ?? 0, beta: event.beta, gamma: event.gamma, angle };
    const previous = this.previous;
    this.previous = sample;
    if (this.state === 'starting') {
      clearTimeout(this.startTimer);
      this.startTimer = undefined;
      this.setState('on');
      return;
    }
    if (!previous || !this.input.touch || !this.input.locked) return;

    const delta = gyroLookDelta(previous, sample);
    this.input.gyroLook(
      Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta.x)),
      Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta.y)),
    );
  };

  private stop() {
    clearTimeout(this.startTimer);
    this.startTimer = undefined;
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('orientationchange', this.reset);
    window.screen.orientation?.removeEventListener('change', this.reset);
    this.previous = undefined;
    this.setState('off');
  }

  private setState(state: GyroState | 'starting') {
    if (this.state === state) return;
    this.state = state;
    this.changed(state);
  }
}
