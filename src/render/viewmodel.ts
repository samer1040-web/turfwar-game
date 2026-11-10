import * as THREE from 'three';
import type { Assets } from '../assets';
import { ATTACHMENT_SLOTS, BOBA, WEAPONS, WEAPON_IDS, weaponStats, type Attachments, type WeaponId } from '../../shared/weapons';
import type { LocalPlayer } from '../game/player';
import { curlFingers, orientHand, restorePose, sampleKeys, solveArm, type Bones, type Ease, type Keyframe } from './rig';
import { GUN_FIT, fitAttachments, overlayFor, vec, type Fitted, type Overlay } from './optics';
import { opticFov, settings } from '../game/settings';
import { requestScope } from './sights';
import { createArms } from './soldier';
import { BROOM_CHOKE, bobaCupModel } from './meme';
import { flicker, molotovModel } from './molotov';
import { weaponModel } from '../assets';
import { SWING, type KnifeSkin } from '../../shared/skins';

/** Where the weapon rests at the hip (gun-group space) and how far ahead of the eye it sits when aimed (fitted sights set their own eye relief). */
const HOLD: Record<WeaponId, { hip: THREE.Vector3; adsZ: number }> = {
  knife: { hip: new THREE.Vector3(0.16, -0.18, -0.34), adsZ: -0.34 },
  mp5: { hip: new THREE.Vector3(0.14, -0.3, -0.36), adsZ: -0.34 },
  mp7: { hip: new THREE.Vector3(0.14, -0.28, -0.36), adsZ: -0.33 },
  m4a1: { hip: new THREE.Vector3(0.14, -0.32, -0.36), adsZ: -0.36 },
  m110: { hip: new THREE.Vector3(0.12, -0.22, -0.34), adsZ: -0.4 },
  m249: { hip: new THREE.Vector3(0.15, -0.36, -0.38), adsZ: -0.4 },
  m1014: { hip: new THREE.Vector3(0.15, -0.27, -0.36), adsZ: -0.38 },
};

const ease = (t: number) => t * t * (3 - 2 * t);
/** How long a landed swing stalls on its target (s): long enough to feel, short enough not to drag. */
const HIT_STOP = 0.07;

/**
 * Swing keyframes: [time 0..1 of SWING[skin].time, position + rotation (pitch, yaw, roll), ease into the
 * key]. Every swing has the same beats: a wind-up that slows into its peak, a short creep further
 * back (anticipation), a strike that speeds up all the way into the blow (SWING contact falls just
 * before the strike key), a follow-through that runs out, and an eased return to guard.
 */
type Key = Keyframe;
const key = (t: number, pos: number[], rot: number[], ease?: Ease): Key => [t, [...pos, ...rot], ease];
const KNIFE_GUARD: [number[], number[]] = [[0.16, -0.18, -0.34], [0.35, 0.25, -0.35]];
const SLASH: Key[] = [
  key(0, ...KNIFE_GUARD), key(0.2, [0.24, -0.08, -0.42], [0.5, -0.5, -0.6], 'out'), key(0.26, [0.26, -0.06, -0.41], [0.55, -0.6, -0.62]),
  key(0.4, [0.02, -0.13, -0.5], [0.15, 0.4, -0.7], 'in'), key(0.6, [-0.12, -0.22, -0.46], [-0.15, 0.85, -0.8], 'out'), key(1, ...KNIFE_GUARD),
];
const BACKHAND: Key[] = [
  key(0, ...KNIFE_GUARD), key(0.2, [-0.06, -0.22, -0.42], [-0.1, 0.8, 0.5], 'out'), key(0.26, [-0.08, -0.23, -0.41], [-0.15, 0.9, 0.52]),
  key(0.4, [0.1, -0.11, -0.5], [0.25, 0.0, 0.6], 'in'), key(0.6, [0.24, -0.06, -0.44], [0.45, -0.6, 0.7], 'out'), key(1, ...KNIFE_GUARD),
];

/**
 * The 藍白拖 (shared/skins.ts), held by the heel: at guard the toe points up with the white footbed
 * and blue strap towards you. The slap is an arm movement, not a slipper floating across: the hand
 * comes up into the top right of the view, the back of the hand towards you and the wrist bent back so
 * the slipper leans away with its sole towards the target, and creeps a little further; then the
 * forearm swings across and down, the sole leading and the wrist trailing, and the wrist rolls over at
 * the blow so the sole lands flat. The arm carries on across the body, dips low and comes back to
 * guard from below, never back across the target. Three tracks, so each joint keeps its own timing: the
 * hand's path (SLAP), the wrist's turn (SLAP_WRIST) and where the elbow points (SLAP_ELBOW). The wrist
 * turns past half a circle, so its keys after the wind-up use the equivalent angles (pitch π − x, yaw
 * and roll − π) that keep each step short.
 */
const SLIPPER_GUARD: [number[], number[]] = [[0.2, -0.2, -0.36], [1.15, 0.75, 0]];
const SLAP: Key[] = [
  [0, SLIPPER_GUARD[0]], [0.22, [0.27, 0, -0.42], 'out'], [0.29, [0.29, 0.02, -0.4]],
  [0.35, [0.15, -0.04, -0.46], 'in'], [0.39, [0.01, -0.1, -0.5], 'lin'], [0.58, [-0.16, -0.19, -0.45], 'out'],
  [0.8, [0.04, -0.32, -0.38]], [1, SLIPPER_GUARD[0]],
];
const SLAP_WRIST: Key[] = [
  [0, SLIPPER_GUARD[1]], [0.22, [2, -2, 0], 'out'], [0.29, [2.1, -2.05, 0.05]], [0.35, [2.3, -1.95, -0.7], 'in'],
  [0.39, [2.99, -1.69, -3.14], 'in'], [0.47, [3.19, -1.39, -3.04], 'out'], [0.58, [3.44, -1.29, -3.39]], [1, [1.99, -2.39, -3.14]],
];
/** Where the right elbow points (a point it bends toward, view space). */
const ELBOW_REST = [0.6, -0.7, 0.2];
const SLAP_ELBOW: Key[] = [
  [0, ELBOW_REST], [0.22, [0.75, -0.55, 0.1], 'out'], [0.29, [0.78, -0.5, 0.1]], [0.39, [0.7, -0.5, -0.2], 'in'],
  [0.58, [0.2, -0.9, 0], 'out'], [1, ELBOW_REST],
];

/**
 * The 掃把, held at the end of its handle with the straw fanned out flat across the view (rolled a
 * quarter turn): at guard it leans up and out to the right, clear of the crosshair; the swat lifts it back over the shoulder, brings
 * it down flat through the middle of the screen like a mother after a cockroach, and lets it swing on.
 */
const BROOM_GUARD: [number[], number[]] = [[0.3, -0.36, -0.42], [0.82, -0.18, 1.35]];
const SWAT: Key[] = [
  key(0, ...BROOM_GUARD), key(0.26, [0.24, -0.22, -0.34], [1.75, 0.1, 1.5], 'out'), key(0.33, [0.25, -0.2, -0.33], [1.86, 0.1, 1.5]),
  key(0.55, [0.04, -0.3, -0.38], [0.5, 0.2, 1.55], 'in'), key(0.74, [0.02, -0.4, -0.36], [-0.1, 0.3, 1.6], 'out'), key(1, ...BROOM_GUARD),
];
/**
 * Each knife skin's guard pose and swing (how long it takes and when it lands: SWING in shared/skins.ts).
 * `swing` keys the hand's position and the wrist's turn together, unless `wrist` keys the turn on its
 * own track (then `swing` holds positions only); `elbow` keys where the elbow points. A swing that
 * lands springs back off the target (REBOUND), unless `through` says how much of its follow-through
 * still carries on past the blow.
 */
const KNIFE_MOTION: Record<KnifeSkin, { guard?: [number[], number[]]; swing?: Key[]; wrist?: Key[]; elbow?: Key[]; through?: number }> = {
  knife: {},
  slipper: { guard: SLIPPER_GUARD, swing: SLAP, wrist: SLAP_WRIST, elbow: SLAP_ELBOW, through: 0.6 },
  gold: { guard: SLIPPER_GUARD, swing: SLAP, wrist: SLAP_WRIST, elbow: SLAP_ELBOW, through: 0.6 },
  broom: { guard: BROOM_GUARD, swing: SWAT },
};
/** A swing that lands springs back off the target this far toward its wind-up, instead of sweeping through. */
const REBOUND = 0.22;

/** Spring-damped scalar for weapon motion. */
class Spring {
  value = 0; velocity = 0;
  constructor(private stiffness: number, private damping: number) {}
  update(target: number, dt: number) {
    this.velocity += ((target - this.value) * this.stiffness - this.velocity * this.damping) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

/** Model space (barrel -X) to gun-group space (barrel -Z). */
const toGun = (v: THREE.Vector3) => new THREE.Vector3(-v.z, v.y, v.x);
const g = (v: [number, number, number]) => toGun(vec(v));

/**
 * First-person weapon: CC0 gun models held by the soldier's own rigged arms (IK onto the grip
 * and handguard), animated entirely in code: sway, bob, recoil, ADS, sprint, reload, equip, throw,
 * knife slashes. Fitted attachments (optic, suppressor, laser, flashlight, clip…) come from optics.ts.
 */
export class ViewModel {
  readonly root = new THREE.Group();
  torch = 0;
  private rig = new THREE.Group();
  private gun = new THREE.Group();
  private models = new Map<WeaponId, THREE.Object3D>();
  private fitted = new Map<string, Fitted>();
  private fit!: Fitted;
  private mags = new Map<string, THREE.Object3D>();
  private current: WeaponId = 'mp5';
  private knifeSkin: KnifeSkin = 'knife';
  private attachments: Attachments = {};
  private arms: { root: THREE.Object3D; bones: Bones; bindPose: Map<string, THREE.Quaternion> };
  private grenade: THREE.Object3D;
  private bottle: THREE.Object3D;
  private rag: THREE.Sprite;
  private boba: THREE.Object3D;
  private flash: THREE.Group;
  private flashLeft = 0;
  private kickBack = new Spring(260, 20);
  private kickPitch = new Spring(220, 18);
  private kickRoll = new Spring(160, 14);
  private swayX = new Spring(60, 11);
  private swayY = new Spring(60, 11);
  private sprint = new Spring(70, 14);
  private lower = new Spring(60, 13);
  private time = 0;
  private equipT = 1;
  private slashT = 1;
  private slashDir = 1;
  private hitStop = 0;
  private lands = false;
  private struck?: { t: number; from: number[]; back: number[] };
  private elbow = new THREE.Vector3().fromArray(ELBOW_REST);
  readonly swingLook = { yaw: 0, pitch: 0 };
  scopeVisible = false;
  overlay: Overlay;

  constructor(private assets: Assets, team: number, knife: KnifeSkin = 'slipper') {
    this.knifeSkin = knife;
    this.root.add(this.rig);
    this.rig.add(this.gun);
    for (const id of WEAPON_IDS) {
      this.addModel(id);
    }
    for (const name of ['Gun_SMG_Ammo']) {
      const magAsset = assets.weapons.get(name);
      if (magAsset) {
        const mag = magAsset.clone();
        mag.rotation.y = -Math.PI / 2;
        mag.visible = false;
        this.root.add(mag);
        this.mags.set(name, mag);
      }
    }
    this.arms = createArms(assets, team);
    this.arms.root.rotation.y = Math.PI;
    this.root.add(this.arms.root);
    this.arms.root.scale.setScalar(1.18);
    this.root.updateMatrixWorld(true);
    const head = this.arms.bones.get('Head')!.getWorldPosition(new THREE.Vector3());
    this.arms.root.position.set(-head.x, -head.y - 0.1, -head.z - 0.12);
    this.grenade = assets.weapons.get('Prop_Grenade')!.clone();
    this.grenade.visible = false;
    this.root.add(this.grenade);
    this.bottle = molotovModel(0.85, true);
    this.bottle.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
    this.rag = this.bottle.getObjectByName('rag') as THREE.Sprite;
    this.bottle.visible = false;
    this.root.add(this.bottle);
    this.boba = bobaCupModel(0.9);
    this.boba.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
    this.boba.visible = false;
    this.root.add(this.boba);
    this.flash = makeFlash();
    this.gun.add(this.flash);
    this.setWeapon('mp5', {}, true);
  }

  private addModel(id: WeaponId) {
    const modelName = weaponModel(WEAPONS[id].model, this.knifeSkin);
    const asset = this.assets.weapons.get(modelName);
    if (!asset) return;

    const model = asset.clone();
    model.rotation.y = -Math.PI / 2;
    model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
    model.visible = false;
    this.gun.add(model);
    this.models.set(id, model);
  }

  setKnifeSkin(skin: KnifeSkin) {
    if (skin === this.knifeSkin) return;
    this.knifeSkin = skin;
    const old = this.models.get('knife');
    const shown = old ? old.visible : false;
    if (old) old.removeFromParent();
    this.addModel('knife');
    const newModel = this.models.get('knife');
    if (this.current === 'knife' && newModel) { 
      newModel.visible = shown; 
      if (this.fit && this.fit.group) newModel.add(this.fit.group); 
    }
  }

  setWeapon(id: WeaponId, attachments: Attachments = {}, instant = false) {
    const fittedAttachments = weaponStats(id, attachments).attachments;
    const key = `${id}|${ATTACHMENT_SLOTS.map(c => fittedAttachments[c] ?? '').join('|')}`;
    let fit = this.fitted.get(key);
    if (!fit) {
      try {
        fit = fitAttachments(this.assets.weapons, id, fittedAttachments, 'first');
        fit.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
        this.fitted.set(key, fit);
      } catch (e) {
        console.error("Error fitting attachments for", id, e);
        return; 
      }
    }
    
    if (!fit) return; 

    if (this.fit && this.fit.group) this.fit.group.removeFromParent();
    const oldModel = this.models.get(this.current);
    if (oldModel) oldModel.visible = false;
    
    if (id !== this.current && !instant) this.equipT = 0;
    this.current = id;
    this.attachments = fittedAttachments;
    this.fit = fit;
    
    const model = this.models.get(id);
    if (model) {
      model.visible = true;
      if (fit.group) model.add(fit.group);
    }
    
    if (fit.muzzle) {
      this.flash.position.copy(toGun(fit.muzzle));
    } else {
      this.flash.position.set(0, 0, -0.5); 
    }
    
    this.overlay = overlayFor({ ...WEAPONS[id], attachments: fittedAttachments });
    this.slashT = 1;
  }

  muzzleWorld(camera: THREE.PerspectiveCamera, viewCamera: THREE.PerspectiveCamera, out = new THREE.Vector3()) {
    this.flash.getWorldPosition(out);
    viewCamera.worldToLocal(out);
    const k = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(viewCamera.fov) / 2);
    out.x *= k; out.y *= k;
    return camera.localToWorld(out);
  }

  private swingKeys() { return KNIFE_MOTION[this.knifeSkin].swing ?? (this.slashDir > 0 ? SLASH : BACKHAND); }

  private poseAt(t: number) {
    const motion = KNIFE_MOTION[this.knifeSkin], v = sampleKeys(this.swingKeys(), t);
    const wrist = motion.wrist ? sampleKeys(motion.wrist, t) : v.slice(3, 6);
    return [v[0], v[1], v[2], ...wrist, ...(motion.elbow ? sampleKeys(motion.elbow, t) : ELBOW_REST)];
  }

  fire() {
    if (this.current === 'knife') { this.slashT = 0; this.slashDir = -this.slashDir; this.hitStop = 0; this.struck = undefined; this.lands = false; return; }
    const w = WEAPONS[this.current];
    const strength = w.class === 'sniper' ? 1.8 : w.class === 'shotgun' ? 1.6 : w.class === 'pistol' ? 0.9 : 0.55 + w.recoil.viewPunch * 0.3;
    this.kickBack.velocity += 2.6 * strength;
    this.kickPitch.velocity += 3.4 * strength * (0.8 + Math.random() * 0.4);
    this.kickRoll.velocity += (Math.random() - 0.5) * 3 * strength;
    this.flashLeft = this.attachments.muzzle === 'suppressor' ? 0 : 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar((0.8 + Math.random() * 0.5) * (w.class === 'shotgun' || w.class === 'lmg' ? 1.3 : 1));
  }

  willLand() { if (this.current === 'knife' && this.slashT < 1) this.lands = true; }

  private land() {
    this.hitStop = HIT_STOP;
    this.kickBack.velocity -= 2.2;
    this.kickPitch.velocity -= 2.5;
    this.kickRoll.velocity += 5 * (this.knifeSkin === 'knife' ? this.slashDir : 1);
    const keys = this.swingKeys(), strike = keys.findIndex(k => k[2] === 'in');
    const from = this.poseAt(this.slashT), back = this.poseAt(keys[Math.max(0, strike - 1)][0]);
    this.struck = { t: this.slashT, from, back: from.map((v, j) => v + (back[j] - v) * REBOUND) };
  }

  update(dt: number, p: LocalPlayer, look: { x: number; y: number }) {
    this.time += dt;
    const fit = GUN_FIT[this.current], hold = HOLD[this.current], knife = fit.kind === 'knife', pistol = fit.kind === 'pistol';
    this.equipT = Math.min(1, this.equipT + dt / Math.max(0.15, p.weapon.equipTime));
    const speed = Math.min(1.4, p.speed() / 6);
    const sprint = Math.max(0, Math.min(1, this.sprint.update(p.sprinting ? (p.reloadLeft > 0 ? 0.35 : 1) : 0, dt)));
    const lowered = Math.max(0, Math.min(1, this.lower.update(p.using ? 1 : 0, dt)));
    const ads = knife ? 0 : ease(p.ads) * (1 - sprint) * (1 - lowered);
    const sx = this.swayX.update(Math.max(-1, Math.min(1, -look.x * 0.0035)) * (1 - ads * 0.8), dt);
    const sy = this.swayY.update(Math.max(-1, Math.min(1, look.y * 0.0035)) * (1 - ads * 0.8), dt);
    const back = this.kickBack.update(0, dt), kick = this.kickPitch.update(0, dt), roll = this.kickRoll.update(0, dt);
    const bobAmount = (p.m.grounded && p.m.slideTime <= 0 ? speed : 0) * (1 - ads * 0.9);
    const bx = Math.sin(p.bobPhase) * 0.011 * bobAmount * (1 + sprint), by = -Math.abs(Math.cos(p.bobPhase)) * 0.013 * bobAmount * (1 + sprint * 1.4);
    const breathe = Math.sin(this.time * 1.6) * 0.0022 * (1 - ads * 0.7);

    const adsZ = this.fit.relief !== undefined && this.fit.eyeX !== undefined ? -(this.fit.relief + this.fit.eyeX - fit.grip[0]) : hold.adsZ;
    const adsPos = new THREE.Vector3(0, -(this.fit.sightLine - fit.grip[1]), adsZ);
    const pos = new THREE.Vector3().lerpVectors(hold.hip, adsPos, ads);
    let rx = 0.04 * (1 - ads), ry = 0.085 * (1 - ads), rz = 0.03 * (1 - ads);
    const motion = KNIFE_MOTION[this.knifeSkin];
    if (knife && motion.guard) { pos.set(motion.guard[0][0], motion.guard[0][1], motion.guard[0][2]); [rx, ry, rz] = motion.guard[1]; }
    else if (knife) { rx = 0.35; ry = 0.25; rz = -0.35; }
    pos.x -= sprint * 0.02; pos.y -= sprint * 0.03; pos.z += sprint * 0.06;
    rx += sprint * -0.2; ry += sprint * 0.4; rz += sprint * 0.3;
    if (pistol || knife) { ry -= sprint * 0.5; rx -= sprint * 0.4; }
    pos.y -= lowered * 0.16; rx -= lowered * 0.7; ry += lowered * 0.3;
    rz += p.m.slideTime > 0 ? 0.25 * (1 - ads) : 0;
    pos.y -= p.landDip * 0.25;
    if (knife && this.slashT < 1) {
      const stalled = this.hitStop > 0, swing = SWING[this.knifeSkin], contact = swing.contact / swing.time;
      if (stalled) this.hitStop -= dt;
      else {
        const next = Math.min(1, this.slashT + dt / swing.time);
        if (this.lands && !this.struck && next >= contact) { this.slashT = contact; this.land(); }
        else this.slashT = next;
      }
      const struck = this.struck;
      let v: number[];
      const through = KNIFE_MOTION[this.knifeSkin].through;
      if (struck && through !== undefined) {
        const u = (this.slashT - struck.t) / (1 - struck.t), drag = (1 - through) * (1 - u);
        v = this.poseAt(this.slashT).map((x, j) => x + (struck.from[j] - x) * drag);
      } else if (struck) {
        const u = (this.slashT - struck.t) / (1 - struck.t);
        v = sampleKeys([[0, struck.from], [0.3, struck.back, 'out'], [1, this.poseAt(1), 'io']], u);
      } else v = this.poseAt(this.slashT);
      pos.set(v[0], v[1], v[2]);
      [rx, ry, rz] = [v[3], v[4], v[5]];
      this.elbow.set(v[6], v[7], v[8]);
      if (stalled) { pos.x += Math.sin(this.time * 95) * 0.004; pos.y += Math.cos(this.time * 80) * 0.003; }
      const guard = motion.guard ?? KNIFE_GUARD;
      this.swingLook.yaw = (guard[0][0] - pos.x) * 0.06;
      this.swingLook.pitch = (pos.y - guard[0][1]) * 0.05;
    } else { this.swingLook.yaw = 0; this.swingLook.pitch = 0; }
    if (knife && p.slipperFollow > 0) {
      const f = ease(1 - p.slipperFollow / 0.22);
      pos.set(0.22 - f * 0.3, 0.02 - f * 0.22, -0.3 - f * 0.25);
      rx = 2 - f * 1.8; ry = 0.3 - f * 0.4; rz = -0.3 + f * 0.2;
    } else if (knife && p.windup > 0) {
      const w = ease(Math.min(1, p.windup * 1.6)), shake = p.windup >= 1 ? Math.sin(this.time * 70) * 0.004 : 0;
      pos.set(pos.x + (0.22 - pos.x) * w + shake, pos.y + (-0.05 - pos.y) * w + shake, pos.z + (-0.38 - pos.z) * w);
      rx += (1.75 - rx) * w; ry += (0.55 - ry) * w; rz += (-0.35 - rz) * w;
    }
    let leftTarget: THREE.Vector3 | undefined;
    const mag = fit.magModel ? this.mags.get(fit.magModel) : undefined;
    if (mag) mag.visible = false;
    if (p.reloadLeft > 0 && !knife) {
      const t = 1 - p.reloadLeft / p.reloadTotal;
      const tilt = Math.sin(Math.min(1, t * 1.2) * Math.PI);
      rz += tilt * 0.5; rx += tilt * 0.25; ry += tilt * -0.3; pos.y -= tilt * 0.03; pos.x -= tilt * 0.03;
      const magSpot = g(fit.mag), out = magSpot.clone().add(new THREE.Vector3(-0.08, -0.3, 0.1));
      if (t < 0.22) leftTarget = new THREE.Vector3().lerpVectors(g(fit.fore), magSpot, ease(t / 0.22));
      else if (t < 0.48) leftTarget = new THREE.Vector3().lerpVectors(magSpot, out, ease((t - 0.22) / 0.26));
      else if (t < 0.74) leftTarget = new THREE.Vector3().lerpVectors(out, magSpot, ease((t - 0.48) / 0.26));
      else leftTarget = new THREE.Vector3().lerpVectors(magSpot, g(fit.fore), ease((t - 0.74) / 0.26));
      if (t > 0.72 && t < 0.76) this.kickBack.velocity += 0.5;
    }
    const e = ease(this.equipT);
    rx -= (1 - e) * 1.1; pos.y -= (1 - e) * 0.18;
    let throwing = 0;
    if (p.throwLeft > 0) { throwing = 1 - p.throwLeft / 0.32; pos.y -= Math.sin(throwing * Math.PI) * 0.14; rx -= Math.sin(throwing * Math.PI) * 0.5; }
    const sip = p.drinkLeft > 0 ? 1 - p.drinkLeft / BOBA.drinkTime : 0;
    const raised = p.drinkLeft > 0 ? ease(Math.min(1, sip / 0.22, (1 - sip) / 0.18)) : 0;
    pos.y -= raised * 0.5; rx -= raised * 0.9;

    this.rig.position.set(pos.x + bx + sx * 0.02, pos.y + by + breathe + sy * 0.015, pos.z + back * 0.05);
    this.rig.rotation.set(rx + kick * 0.06 + sy * 0.05, ry + sx * 0.06, rz + roll * 0.04 + sx * 0.05, 'YXZ');
    this.gun.position.copy(g(fit.grip)).multiplyScalar(-1);
    this.root.updateMatrixWorld(true);

    const bones = this.arms.bones;
    restorePose(bones, this.arms.bindPose);
    this.arms.root.updateMatrixWorld(true);
    const gunMatrix = this.gun.matrixWorld;
    const gripW = g(fit.grip).applyMatrix4(gunMatrix);
    let foreW = (leftTarget ?? g(fit.fore)).clone().applyMatrix4(gunMatrix);
    const gunFwd = new THREE.Vector3(0, 0, -1).transformDirection(gunMatrix);
    const gunUp = new THREE.Vector3(0, 1, 0).transformDirection(gunMatrix);
    const gunRight = new THREE.Vector3(1, 0, 0).transformDirection(gunMatrix);
    const broom = knife && this.knifeSkin === 'broom' && p.windup <= 0 && p.slipperFollow <= 0;
    if (knife) foreW = broom ? g([BROOM_CHOKE - 0.08, 0, 0]).applyMatrix4(gunMatrix) : new THREE.Vector3(-0.24, -0.52 + Math.sin(this.time * 1.6) * 0.004, -0.16);
    if (p.throwLeft > 0) foreW = new THREE.Vector3(-0.2, -0.08 + Math.sin(throwing * Math.PI) * 0.25, -0.3 - throwing * 0.25);
    const elbow = knife && this.slashT < 1 && p.windup <= 0 && p.slipperFollow <= 0 ? this.elbow : this.elbow.fromArray(ELBOW_REST);
    if (knife) solveArm(bones, 'r', gripW.clone().addScaledVector(gunFwd, -0.07).addScaledVector(gunUp, -0.02).addScaledVector(gunRight, 0.02), elbow);
    else solveArm(bones, 'r', gripW.clone().addScaledVector(gunRight, 0.03).addScaledVector(gunUp, -0.02), new THREE.Vector3(0.6, -0.7, 0.2));
    solveArm(bones, 'l', foreW.clone().addScaledVector(gunFwd, -0.05).addScaledVector(gunUp, -0.07).addScaledVector(gunRight, -0.025), new THREE.Vector3(-0.7, -0.6, -0.1));
    orientHand(bones, 'r', gunFwd.clone().addScaledVector(gunUp, knife ? -0.3 : -1.1).normalize(), gunRight.clone().negate());
    if (p.throwLeft > 0) orientHand(bones, 'l', new THREE.Vector3(0.2, 0.6, -1).normalize(), new THREE.Vector3(0.6, 0, -0.4));
    else if (broom) orientHand(bones, 'l', gunFwd.clone().addScaledVector(gunUp, -0.3).normalize(), gunRight.clone());
    else if (knife) orientHand(bones, 'l', new THREE.Vector3(0.2, -0.6, -0.8).normalize(), new THREE.Vector3(1, 0, 0));
    else if (pistol && !leftTarget) orientHand(bones, 'l', gunFwd.clone().addScaledVector(gunUp, -0.9).normalize(), gunRight);
    else orientHand(bones, 'l', gunFwd.clone().addScaledVector(gunRight, 0.5).addScaledVector(gunUp, 0.3).normalize(), gunUp.clone().add(gunRight).normalize());
    curlFingers(bones, 'r', knife ? 0.9 : 0.62, 0.55);
    curlFingers(bones, 'l', leftTarget || broom ? 0.75 : knife ? 0.3 : 0.62, 0.45);

    const lh = bones.get('hand_l')!;
    if (mag && p.reloadLeft > 0) {
      const t = 1 - p.reloadLeft / p.reloadTotal;
      if (t > 0.2 && t < 0.76) { mag.visible = true; lh.getWorldPosition(mag.position).add(new THREE.Vector3(0.02, -0.05, -0.04)); mag.quaternion.copy(this.gun.getWorldQuaternion(new THREE.Quaternion())); mag.rotateY(-Math.PI / 2); }
    }
    this.grenade.visible = p.throwLeft > 0 && p.throwing !== 'molotov';
    this.bottle.visible = p.throwLeft > 0 && p.throwing === 'molotov';
    const knifeModel = this.models.get('knife');
    if (knife && knifeModel) knifeModel.visible = p.slipperFollow <= 0 && p.slippers > 0;
    this.boba.visible = raised > 0;
    if (this.grenade.visible) lh.getWorldPosition(this.grenade.position).add(new THREE.Vector3(0.02, 0.03, -0.06));
    if (this.bottle.visible) {
      lh.getWorldPosition(this.bottle.position).add(new THREE.Vector3(0.02, -0.12, -0.05));
      this.bottle.rotation.set(-0.3 - throwing * 0.9, 0.2, 0.15);
      flicker(this.rag, this.time);
    }
    if (this.boba.visible) {
      const gulp = Math.sin(sip * Math.PI * 6) * 0.006 * raised;
      this.boba.position.set(0.035, -0.48 + raised * 0.36 + gulp, -0.32);
      this.boba.rotation.set(0.1 + raised * 0.35, -0.25, -0.1 * raised);
    }

    this.flashLeft -= dt;
    this.flash.visible = this.flashLeft > 0 && !(this.overlay && p.ads > 0.95);
    this.scopeVisible = !!this.overlay && settings.scopeMode === 'overlay' && p.ads > 0.92 && !p.binoculars;
    this.root.visible = !this.scopeVisible && !p.binoculars;
    const lens = this.fit.lens, sight = this.fit.sight;
    if (lens && sight) {
      const active = settings.scopeMode === 'pip' && this.root.visible ? Math.max(0, Math.min(1, (ads - 0.55) / 0.35)) : 0;
      (lens.material as THREE.ShaderMaterial).uniforms.uActive.value = active;
      if (active > 0) {
        const w = p.weapon, tanHalf = Math.tan(opticFov(w) * Math.PI / 360) / (p.zoomLevel && w.class === 'sniper' ? 2 : 1);
        requestScope({ lens, sight, tanHalf, size: settings.opticDetail === 'high' ? 768 : 512 });
      }
    }
    if (this.fit.laser) this.fit.laser.visible = sprint < 0.5 && lowered < 0.5;
    this.torch = this.fit.torch && p.alive && !p.binoculars ? 70 : 0;
  }
}

function makeFlash() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,240,1)'); grad.addColorStop(0.25, 'rgba(255,220,140,0.9)'); grad.addColorStop(0.6, 'rgba(255,140,40,0.35)'); grad.addColorStop(1, 'rgba(255,100,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 22 : 62; ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd9a0 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat));
  for (const r of [0, Math.PI / 2]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), mat);
    side.rotation.set(0, Math.PI / 2, r);
    side.position.z = -0.12;
    group.add(side);
  }
  group.traverse(o => { (o as THREE.Mesh).frustumCulled = false; o.renderOrder = 10; });
  group.visible = false;
  return group;
}