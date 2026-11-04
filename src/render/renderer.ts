import { viewHeight, viewWidth } from '../ui/viewport';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { AdaptiveDpr, PHONE_ADAPTIVE_DPR, basePixelRatio, type AdaptiveDprOptions } from '../game/adaptivedpr';
import { setMaterialQuality, type Theme } from './materials';
import { ScopePass } from './sights';
import { SkyView } from './sky';

export interface Quality {
  pixelRatio: number | 'phone';
  adaptive: boolean;
  shadows: number;
  shadowRange: number;
  shadowAhead: number;
  softShadows: boolean;
  halfRateShadows: boolean;
  minCaster: number;
  leanCasters: boolean;
  bloom: boolean;
  dynamicLights: boolean;
  cheapMaterials: boolean;
}
const SHARP: Omit<Quality, 'pixelRatio'> = { adaptive: true, shadows: 2048, shadowRange: 40, shadowAhead: 15, softShadows: true, halfRateShadows: false, minCaster: 0.2, leanCasters: false, bloom: true, dynamicLights: true, cheapMaterials: false };
export const QUALITY: Record<'low' | 'medium' | 'high' | 'test', Quality> = {
  low: { pixelRatio: 'phone', adaptive: true, shadows: 1024, shadowRange: 22, shadowAhead: 10, softShadows: false, halfRateShadows: true, minCaster: 1.2, leanCasters: true, bloom: false, dynamicLights: false, cheapMaterials: true },
  medium: { ...SHARP, pixelRatio: 1 },
  high: { ...SHARP, pixelRatio: 1.5 },
  test: { ...SHARP, pixelRatio: 0.5, adaptive: false, shadows: 0, bloom: false, dynamicLights: false },
};

export const envSize = (q: Pick<Quality, 'pixelRatio'>) => (q.pixelRatio === 'phone' ? 128 : 256);
const LEAN_CASTERS = /^(level:hedge)/;
const sphere = new THREE.Sphere();

export const adaptiveOptions = (q: Pick<Quality, 'pixelRatio'>): Partial<AdaptiveDprOptions> => (q.pixelRatio === 'phone' ? PHONE_ADAPTIVE_DPR : {});

export function limitShadowCasters(root: THREE.Object3D, q: Pick<Quality, 'minCaster' | 'leanCasters'>) {
  root.updateWorldMatrix(true, true);
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    const data = mesh.userData;
    if (data.shadowWanted === undefined) data.shadowWanted = mesh.castShadow;
    if (!data.shadowWanted) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const radius = (data.casterRadius as number | undefined) ?? sphere.copy(geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld).radius;
    mesh.castShadow = radius >= q.minCaster && !(q.leanCasters && LEAN_CASTERS.test(mesh.name));
  });
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  // 👇 تم تعديل مسافة الكاميرا هنا لإزالة الوميض نهائياً (0.5 بدلاً من 0.1 و 1200 بدلاً من 4000)
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.5, 1200); 
  readonly viewScene = new THREE.Scene();
  readonly viewCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  readonly torch = new THREE.SpotLight(0xfff1dc, 0, 45, 0.36, 0.55, 1.4);
  adaptive: AdaptiveDpr;
  sky?: SkyView;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private sunOffset = new THREE.Vector3(-50, 70, 40);
  private scope = new ScopePass();
  private shadowRoots = new Set<THREE.Object3D>();
  private qualityListeners = new Set<(q: Quality) => void>();
  private frames = 0;
  private lastFrameAt = 0;
  private gpu?: string;
  // 👇 هذا هو السطر الذي كان ناقصاً وتمت إضافته هنا لحل الخطأ
  private envSky?: { theme: Theme; dir: THREE.Vector3 };
  quality: Quality;

  constructor(container: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.adaptive = new AdaptiveDpr(adaptiveOptions(quality));
    // 👇 تم التأكد من خلو هذا السطر من أي تعديلات تسبب شاشة سوداء
    this.renderer = new THREE.WebGLRenderer({ antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = quality.shadows > 0;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.type = quality.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    container.prepend(this.renderer.domElement);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera, this.sun, this.sun.target, this.hemi);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.torch.position.set(0.12, -0.12, 0);
    this.torch.target.position.set(0.05, -0.1, -10);
    const vmSun = new THREE.DirectionalLight(0xffffff, 2.2), vmHemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
    vmSun.name = 'vmSun'; vmHemi.name = 'vmHemi';
    this.viewScene.add(vmSun, vmHemi, this.viewCamera);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const overlay = new RenderPass(this.viewScene, this.viewCamera);
    overlay.clear = false; overlay.clearDepth = true;
    this.composer.addPass(overlay);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.applyQuality(quality);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applyQuality(q: Quality) {
    if (q !== this.quality) this.adaptive = new AdaptiveDpr(adaptiveOptions(q));
    const envChanged = envSize(q) !== envSize(this.quality);
    this.quality = q;
    if (envChanged) this.buildEnvironment();
    setMaterialQuality(q.cheapMaterials);
    this.sun.castShadow = q.shadows > 0;
    this.sun.shadow.mapSize.set(Math.max(256, q.shadows), Math.max(256, q.shadows));
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -q.shadowRange; sc.right = sc.top = q.shadowRange;
    sc.updateProjectionMatrix();
    const sm = this.renderer.shadowMap;
    sm.autoUpdate = true;
    const type = q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (sm.type !== type) {
      sm.type = type;
      for (const scene of [this.scene, this.viewScene]) scene.traverse(o => {
        const material = (o as THREE.Mesh).material;
        if (material) for (const m of Array.isArray(material) ? material : [material]) m.needsUpdate = true;
      });
    }
    if (q.dynamicLights) this.camera.add(this.torch, this.torch.target);
    else { this.torch.removeFromParent(); this.torch.target.removeFromParent(); }
    this.bloom.enabled = q.bloom;
    for (const root of this.shadowRoots) limitShadowCasters(root, q);
    for (const f of this.qualityListeners) f(q);
    this.resize();
  }

  onQuality(f: (q: Quality) => void) {
    this.qualityListeners.add(f);
    f(this.quality);
    return () => { this.qualityListeners.delete(f); };
  }

  limitShadows(root: THREE.Object3D) {
    this.shadowRoots.add(root);
    limitShadowCasters(root, this.quality);
    return () => { this.shadowRoots.delete(root); };
  }

  setTheme(theme: Theme, sunDir: { x: number; y: number; z: number }) {
    const dir = new THREE.Vector3(sunDir.x, sunDir.y, sunDir.z).normalize();
    this.sunOffset.copy(dir).multiplyScalar(120);
    this.sun.color.copy(theme.sunColor); this.sun.intensity = theme.sunIntensity;
    this.hemi.color.copy(theme.hemiSky); this.hemi.groundColor.copy(theme.hemiGround); this.hemi.intensity = theme.hemiIntensity;
    this.scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
    this.renderer.toneMappingExposure = theme.exposure;
    if (this.sky) this.scene.remove(this.sky.mesh);
    this.sky = new SkyView(theme, dir);
    this.scene.add(this.sky.mesh);
    this.envSky = { theme, dir };
    this.buildEnvironment();
    const vmSun = this.viewScene.getObjectByName('vmSun') as THREE.DirectionalLight;
    vmSun.color.copy(theme.sunColor); vmSun.intensity = theme.sunIntensity * 0.7; vmSun.position.copy(dir);
    const vmHemi = this.viewScene.getObjectByName('vmHemi') as THREE.HemisphereLight;
    vmHemi.color.copy(theme.hemiSky); vmHemi.groundColor.copy(theme.hemiGround); vmHemi.intensity = theme.hemiIntensity;
  }

  private buildEnvironment() {
    if (!this.envSky) return;
    const envScene = new THREE.Scene();
    envScene.add(new SkyView(this.envSky.theme, this.envSky.dir).mesh);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment?.dispose();
    this.scene.environment = pmrem.fromScene(envScene, 0.02, 0.1, 100, { size: envSize(this.quality) }).texture;
    this.scene.environmentIntensity = 0.55;
    this.viewScene.environment = this.scene.environment;
    this.viewScene.environmentIntensity = 0.7;
    pmrem.dispose();
  }

  restored() {
    this.buildEnvironment();
    this.resize();
    this.warm();
  }

  gpuName(): string {
    if (this.gpu === undefined) {
      try {
        const gl = this.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        this.gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '').slice(0, 160);
      } catch { this.gpu = ''; }
    }
    return this.gpu;
  }

  pixelRatio() {
    const q = this.quality;
    return Math.round(basePixelRatio(q.pixelRatio, devicePixelRatio) * (q.adaptive ? this.adaptive.multiplier : 1) * 100) / 100;
  }

  resize() {
    const w = viewWidth(), h = viewHeight();
    const ratio = this.pixelRatio();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * ratio / 2, h * ratio / 2);
    this.camera.aspect = this.viewCamera.aspect = w / h;
    this.camera.updateProjectionMatrix(); this.viewCamera.updateProjectionMatrix();
  }

  warm() {
    const r = this.renderer;
    for (const [scene, camera] of [[this.scene, this.camera], [this.viewScene, this.viewCamera]] as const) {
      try { r.compile(scene, camera); } catch { }
    }
    const textures = new Set<THREE.Texture>();
    for (const scene of [this.scene, this.viewScene]) scene.traverse(o => {
      const material = (o as THREE.Mesh).material;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) {
        for (const value of Object.values(m)) if ((value as THREE.Texture | null)?.isTexture) textures.add(value as THREE.Texture);
      }
    });
    const queue = [...textures];
    const upload = () => {
      for (let i = 0; i < 2 && queue.length; i++) r.initTexture(queue.pop()!);
      if (queue.length) requestAnimationFrame(upload);
    };
    requestAnimationFrame(upload);
  }

  snapshot(maxWidth = 1280) {
    this.draw(this.lastTime);
    const src = this.renderer.domElement;
    const scale = Math.min(1, maxWidth / src.width);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(src.width * scale)); out.height = Math.max(1, Math.round(src.height * scale));
    out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height);
    return out;
  }
  private lastTime = 0;

  render(time: number, playing = false) {
    const now = performance.now(), dt = this.lastFrameAt ? (now - this.lastFrameAt) / 1000 : 0;
    this.lastFrameAt = now;
    if (this.quality.adaptive && this.adaptive.frame(dt, playing)) this.resize();
    if (++this.frames % 60 === 0) for (const root of this.shadowRoots) limitShadowCasters(root, this.quality);
    this.draw(time);
  }

  private shadowCentre = new THREE.Vector3();
  private lightX = new THREE.Vector3();
  private lightY = new THREE.Vector3();
  private lightZ = new THREE.Vector3();

  private draw(time: number) {
    this.lastTime = time;
    if (this.renderer.getContext().isContextLost()) return;
    this.renderer.info.reset();
    this.placeShadow();
    const sm = this.renderer.shadowMap;
    if (this.quality.halfRateShadows) { sm.autoUpdate = false; sm.needsUpdate = this.frames % 2 === 0; }
    this.sky?.update(time, this.camera);
    try {
      this.scope.render(this.renderer, this.scene, this.camera, this.viewCamera);
      this.composer.render();
    } catch (error) {
      if (!this.renderer.getContext().isContextLost()) throw error;
    }
  }

  private placeShadow() {
    const q = this.quality, c = this.shadowCentre;
    this.camera.getWorldDirection(c);
    const flat = Math.hypot(c.x, c.z) || 1;
    c.set(c.x / flat * q.shadowAhead, 0, c.z / flat * q.shadowAhead).add(this.camera.getWorldPosition(this.lightX));
    const z = this.lightZ.copy(this.sunOffset).normalize();
    const x = this.lightX.set(0, 1, 0).cross(z).normalize(), y = this.lightY.copy(z).cross(x);
    const texel = 2 * q.shadowRange / this.sun.shadow.mapSize.x;
    const u = Math.round(c.dot(x) / texel) * texel, v = Math.round(c.dot(y) / texel) * texel, w = c.dot(z);
    c.copy(x).multiplyScalar(u).addScaledVector(y, v).addScaledVector(z, w);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).add(this.sunOffset);
  }
}