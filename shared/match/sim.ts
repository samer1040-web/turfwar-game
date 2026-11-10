import { CollisionWorld } from '../../shared/collision';
import { clamp, cloneData, dirFromAngles, type Vec3 } from '../../shared/math';
import { PEEK, easePeek, peekShift, peekSide, type PeekSide } from '../../shared/peek';
import { MOVE, createMoveState, eyeHeight, isSprinting, stepMovement, type MoveEvents, type MoveInput, type MoveState } from '../../shared/movement';
import type { Obstacle } from '../../shared/obstacles';
import type { Soldier } from '../../shared/match/state';
import { BOBA, DEFAULT_WEAPONS, HEALTH, RIDER_AIM, SLIPPER, STAMINA, oneHanded, pelletCone, weaponStats, type Attachments, type Slot, type WeaponDef, type WeaponId } from '../../shared/weapons';
import { MOUSE_LOOK_RADIANS_PER_COUNT } from './input';
import type { Input } from './input';
import { BINOCULAR_ZOOM, adsFov, settings, isMagnified, opticFov } from './settings';

const hasSecondZoom = (w: WeaponDef) => w.class === 'sniper';

const STEP = 1 / 120;
const DEG = Math.PI / 180;

export interface FrameResult {
  shots: { origin: Vec3; dir: Vec3; weapon: WeaponDef }[];
  grenade?: { origin: Vec3; dir: Vec3 };
  smoke?: { origin: Vec3; dir: Vec3 };
  molotov?: { origin: Vec3; dir: Vec3 };
  slipper?: { origin: Vec3; dir: Vec3; power: number };
  noSlipper?: boolean;
  drink?: boolean;
  drinkStarted?: boolean;
  drinkRefused?: boolean;
  reloadStarted: boolean;
  zoomed?: boolean;
  switched: boolean;
  dryFire: boolean;
  move: MoveEvents;
}

export class LocalPlayer {
  m: MoveState = createMoveState(0, 0, 0);
  private prev = { x: 0, y: 0, z: 0, crouch: 0 };
  private accumulator = 0;
  yaw = 0;
  pitch = 0;
  team = 0;
  slot: Slot = 0;
  private lastSlot: Slot = 1;
  weapons: [WeaponId, WeaponId] = [...DEFAULT_WEAPONS];
  attachments: Partial<Record<WeaponId, Attachments>> = {};
  ammo: [number, number] = [32, 12];
  reserve: [number, number] = [0, 0];
  reloadLeft = 0;
  reloadTotal = 1;
  switchLeft = 0;
  fireCooldown = 0;
  bloom = 0;
  ads = 0;
  grenades = 0;
  smokes = 0;
  molotovs = 0;
  throwing: 'grenade' | 'smoke' | 'molotov' = 'grenade';
  private sinceThrow = 9;
  throwLeft = 0;
  bobas = 0;
  drinkLeft = 0;
  private sinceDrink = 9;
  slippers = 1;
  slipperCharge = -1;
  slipperFollow = 0;
  private sinceSlipper = 9;
  get windup() { return this.slipperCharge < 0 ? 0 : Math.min(1, this.slipperCharge / SLIPPER.charge); }
  health: number = HEALTH.max;
  stamina: number = STAMINA.max;
  binoculars = false;
  lean = 0;
  peekSide: PeekSide = 0;
  alive = false;
  sprinting = false;
  private sprintBlock = 0;
  private sprintRecover = 0;
  private triggerHeld = false;
  private shotsInBurst = 0;
  private sinceShot = 9;
  private recoilDebt = 0;
  punchPitch = 0;
  punchYaw = 0;
  punchVel = 0;
  landDip = 0;
  stepOffset = 0;
  shake = 0;
  bobPhase = 0;
  sensitivity = MOUSE_LOOK_RADIANS_PER_COUNT;
  zoomLevel: 0 | 1 = 0;

  get aimFov() {
    if (this.binoculars) return 2 * Math.atan(Math.tan(settings.fov * DEG / 2) / BINOCULAR_ZOOM) / DEG;
    const first = adsFov(this.weapon);
    if (!this.zoomLevel || !hasSecondZoom(this.weapon)) return first;
    return 2 * Math.atan(Math.tan(first * DEG / 2) / 2) / DEG;
  }
  
  get sightFov() {
    const w = this.weapon;
    if (this.binoculars || settings.scopeMode !== 'pip' || !isMagnified(w)) return this.aimFov;
    const lens = opticFov(w);
    return this.zoomLevel && hasSecondZoom(w) ? 2 * Math.atan(Math.tan(lens * DEG / 2) / 2) / DEG : lens;
  }
  
  get lookScale() {
    const matched = Math.tan(this.sightFov * DEG / 2) / Math.tan(settings.fov * DEG / 2);
    return 1 + this.ads * (matched * settings.adsSensitivity - 1);
  }
  
  get magnification() { return Math.tan(settings.fov * DEG / 2) / Math.tan(this.aimFov * DEG / 2); }

  statsOf(slot: Slot): WeaponDef {
    const id = slot === 2 ? 'knife' : this.weapons[slot];
    return weaponStats(id, this.attachments[id]);
  }
  get weapon(): WeaponDef { return this.statsOf(this.slot); }
  get reloading() { return this.reloadLeft > 0; }
  get tired() { return this.stamina <= STAMINA.tired; }

  spawnFrom(s: Soldier) {
    this.m = { ...s.m, vx: 0, vy: 0, vz: 0 };
    this.prev = { x: s.m.x, y: s.m.y, z: s.m.z, crouch: s.m.crouch };
    this.yaw = s.yaw; this.pitch = 0; this.team = s.team; this.slot = 0; this.lastSlot = 1;
    this.weapons = [...s.weapons]; this.attachments = cloneData(s.attachments); this.reserve = [...s.reserve];
    this.ammo = [this.statsOf(0).magazine, this.statsOf(1).magazine];
    this.reloadLeft = 0; this.switchLeft = this.statsOf(0).equipTime; this.fireCooldown = 0; this.bloom = 0; this.ads = 0; this.lean = 0; this.peekSide = 0;
    this.grenades = s.grenades; this.smokes = s.smokes; this.molotovs = s.molotovs; this.bobas = s.bobas; this.drinkLeft = 0; this.slippers = s.slippers ?? 1; this.slipperCharge = -1; this.slipperFollow = 0; this.health = s.health; this.alive = true; this.recoilDebt = 0; this.accumulator = 0;
    this.stamina = STAMINA.max; this.binoculars = false; this.zoomLevel = 0;
  }

  syncGear(s: Soldier) {
    for (const i of [0, 1] as const) {
      if (s.weapons[i] === this.weapons[i]) continue;
      this.weapons[i] = s.weapons[i];
      this.attachments[s.weapons[i]] = s.attachments[s.weapons[i]];
      this.ammo[i] = this.statsOf(i).magazine;
      this.selectSlot(i); this.switchLeft = this.statsOf(i).equipTime;
    }
    if (JSON.stringify(s.attachments) !== JSON.stringify(this.attachments)) {
      this.attachments = cloneData(s.attachments);
      for (const i of [0, 1] as const) this.ammo[i] = Math.min(this.ammo[i], this.statsOf(i).magazine);
    }
    if (this.reloadLeft <= 0) this.reserve = [...s.reserve];
    if (this.sinceThrow > 1.5 && this.throwLeft <= 0) { this.grenades = s.grenades; this.smokes = s.smokes; this.molotovs = s.molotovs; }
    if (this.sinceDrink > 1.5 && this.drinkLeft <= 0) this.bobas = s.bobas;
    if (this.sinceSlipper > 1 && this.slipperFollow <= 0) this.slippers = s.slippers ?? 1;
    this.health = s.health;
  }

  riding = false;
  rider = false;

  usable(slot: Slot) { return (!this.rider || oneHanded(this.statsOf(slot))) && (slot !== 2 || this.slippers > 0); }

  drawOneHanded(): Slot | undefined {
    if (this.usable(this.slot)) return undefined;
    const to: Slot = this.usable(1) ? 1 : 0;
    this.selectSlot(to);
    this.switchLeft = this.weapon.equipTime;
    return to;
  }

  seat(p: Vec3, crouch: number, v: { vx: number; vy: number; vz: number }) {
    this.m = { ...this.m, x: p.x, y: p.y, z: p.z, vx: v.vx, vy: v.vy, vz: v.vz, crouch, grounded: true, slideTime: 0, airTime: 0 };
    this.prev = { x: p.x, y: p.y, z: p.z, crouch };
    this.accumulator = 0; this.sprinting = false; this.landDip = 0; this.stepOffset = 0;
  }

  correct(s: Soldier) { this.m = { ...this.m, x: s.m.x, y: s.m.y, z: s.m.z, vx: 0, vy: 0, vz: 0 }; this.prev = { x: s.m.x, y: s.m.y, z: s.m.z, crouch: this.m.crouch }; }

  renderPos(): Vec3 & { crouch: number } {
    const a = this.accumulator / STEP;
    return {
      x: this.prev.x + (this.m.x - this.prev.x) * a, y: this.prev.y + (this.m.y - this.prev.y) * a,
      z: this.prev.z + (this.m.z - this.prev.z) * a, crouch: this.prev.crouch + (this.m.crouch - this.prev.crouch) * a,
    };
  }

  eye(): Vec3 {
    const p = this.renderPos(), shift = peekShift(this.yaw, this.lean);
    return { x: p.x + shift.x, y: p.y + eyeHeight(p) + this.stepOffset - this.landDip - Math.abs(this.lean) * PEEK.drop, z: p.z + shift.z };
  }
  aimDir(): Vec3 { return dirFromAngles(this.yaw, this.pitch); }

  update(dt: number, input: Input | undefined, world: CollisionWorld, active: boolean, blockFire: boolean, obstacles?: readonly Obstacle[]): FrameResult {
    const result: FrameResult = { shots: [], reloadStarted: false, switched: false, dryFire: false, move: { jumped: false, landed: 0, slideStarted: false, stepped: 0 } };
    const can = active && this.alive && !!input;
    if (can) {
      const look = input!.consumeLook();
      const sens = this.sensitivity * input!.sensitivity * this.lookScale;
      this.yaw -= look.x * sens;
      this.pitch = clamp(this.pitch - look.y * sens, -1.48, 1.48);
    } else input?.consumeLook();

    const w = this.weapon;
    this.sinceThrow += dt;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.switchLeft = Math.max(0, this.switchLeft - dt);
    this.sprintBlock = Math.max(0, this.sprintBlock - dt);
    this.sinceShot += dt;
    this.bloom = Math.max(0, this.bloom - w.spread.recovery * dt * (this.sinceShot > 0.08 ? 1 : 0.25));
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0 && this.slot !== 2) {
        const slot = this.slot;
        this.reloadLeft = 0;
        const take = Math.min(w.magazine - this.ammo[slot], this.reserve[slot]);
        this.ammo[slot] += take; this.reserve[slot] -= take;
      }
    }

    const wantsFire = can && input!.fire && !blockFire && !this.binoculars;
    if (wantsFire) this.sprintBlock = 0.2;
    const sprintKey = can && input!.down('sprint');
    const canSprint = this.sprinting ? this.stamina > 0 : this.stamina > STAMINA.tired + STAMINA.sprintStart;
    const jumpKey = can && input!.down('jump') && this.stamina >= STAMINA.jump;
    const moveInput: MoveInput = can ? {
      forward: input!.amount('forward') - input!.amount('back'),
      strafe: input!.amount('right') - input!.amount('left'),
      yaw: this.yaw, jump: jumpKey, crouch: input!.down('crouch'),
      sprint: sprintKey && canSprint && this.sprintBlock <= 0,
      ads: (input!.aim && w.class !== 'melee' && this.reloadLeft <= 0 && this.switchLeft < 0.1 && !this.rider) || this.binoculars,
      speed: w.speed * (this.tired ? 0.8 : 1) * (this.slipperCharge >= 0 ? 0.75 : 1),
    } : { forward: 0, strafe: 0, yaw: this.yaw, jump: false, crouch: false, sprint: false, ads: false };
    if (this.frozen || this.using) { moveInput.forward = moveInput.strafe = 0; moveInput.jump = moveInput.sprint = false; }
    const wasSprinting = this.sprinting;
    if (this.alive && !this.riding) {
      this.accumulator += Math.min(dt, 0.1);
      while (this.accumulator >= STEP) {
        this.prev = { x: this.m.x, y: this.m.y, z: this.m.z, crouch: this.m.crouch };
        const e = stepMovement(world, this.m, moveInput, STEP, this.team, obstacles);
        result.move.jumped ||= e.jumped; result.move.slideStarted ||= e.slideStarted;
        result.move.landed = Math.max(result.move.landed, e.landed); result.move.stepped += e.stepped;
        this.accumulator -= STEP;
      }
    }
    this.sprinting = this.alive && !this.riding && isSprinting(this.m, moveInput) && this.m.grounded;
    if (result.move.jumped) this.stamina = Math.max(0, this.stamina - STAMINA.jump);
    if (this.sprinting && !wasSprinting) this.stamina = Math.max(0, this.stamina - STAMINA.sprintStart);
    this.stamina = clamp(this.stamina + (this.sprinting ? -STAMINA.sprint : this.m.crouch > 0.5 ? STAMINA.regenCrouched : STAMINA.regen) * dt, 0, STAMINA.max);
    this.sprintRecover = this.sprinting ? 0.14 : Math.max(0, this.sprintRecover - dt);
    const adsTarget = moveInput.ads && !this.sprinting && this.alive ? 1 : 0;
    this.ads = clamp(this.ads + Math.sign(adsTarget - this.ads) * dt / w.adsTime, 0, 1);
    if (this.ads < 0.3) this.zoomLevel = 0;
    const aiming = this.alive && !this.riding && this.ads > 0.5;
    this.peekSide = aiming ? peekSide(world, this.m.x, this.m.y, this.m.z, this.m.crouch, this.yaw, this.team, this.peekSide) : 0;
    this.lean = easePeek(this.lean, this.peekSide, dt);

    if (can) {
      const wheel = Number(input!.take('nextWeapon')) - Number(input!.take('prevWeapon'));
      const scoped = this.ads > 0.6 && hasSecondZoom(this.weapon) && !this.binoculars;
      if (input!.take('binoculars') && !this.rider) { this.binoculars = !this.binoculars; this.zoomLevel = 0; result.zoomed = true; }
      if (scoped && wheel !== 0) { this.zoomLevel = this.zoomLevel ? 0 : 1; result.zoomed = true; }
      else if (this.throwLeft <= 0) {
        let to: Slot | undefined;
        if (input!.take('knife')) { to = 2; if (this.slippers <= 0) result.noSlipper = true; }
        if (input!.take('secondary')) to = 1;
        if (input!.take('primary')) to = 0;
        if (input!.take('lastWeapon')) to = this.lastSlot;
        if (wheel !== 0) {
          to = this.slot;
          for (let i = 0; i < 2; i++) { to = (((to + (wheel > 0 ? 1 : 2)) % 3) as Slot); if (this.usable(to)) break; }
        }
        if (to !== undefined && to !== this.slot && this.usable(to)) this.swap(to, result);
      }
      if (input!.take('reload')) this.startReload(result);
      if (this.slot !== 2 && this.ammo[this.slot] <= 0 && this.switchLeft <= 0 && this.throwLeft <= 0) this.startReload(result);
      const throwKey = input!.take('grenade');
      if (throwKey && !this.rider && this.grenades > 0 && this.throwLeft <= 0 && this.reloadLeft <= 0) {
        this.throwLeft = 0.32; this.grenades--; this.sinceThrow = 0; this.binoculars = false; this.throwing = 'grenade';
      }
      const smokeKey = input!.take('smoke');
      if (smokeKey && !this.rider && this.smokes > 0 && this.throwLeft <= 0 && this.drinkLeft <= 0 && this.reloadLeft <= 0) {
        this.throwLeft = 0.32; this.smokes--; this.sinceThrow = 0; this.binoculars = false; this.throwing = 'smoke';
      }
      const molotovKey = input!.take('molotov');
      if (molotovKey && !this.rider && this.molotovs > 0 && this.throwLeft <= 0 && this.drinkLeft <= 0 && this.reloadLeft <= 0) {
        this.throwLeft = 0.32; this.molotovs--; this.sinceThrow = 0; this.binoculars = false; this.throwing = 'molotov';
      }
      const drinkKey = input!.take('drink');
      if (drinkKey && !this.rider && this.bobas > 0 && this.health < HEALTH.max && this.drinkLeft <= 0 && this.throwLeft <= 0 && this.reloadLeft <= 0) {
        this.drinkLeft = BOBA.drinkTime; this.bobas--; this.sinceDrink = 0; this.binoculars = false; result.drinkStarted = true;
      } else if (drinkKey && this.bobas > 0 && this.health >= HEALTH.max) result.drinkRefused = true;
    }
    this.sinceSlipper += dt;
    const windable = can && this.slot === 2 && this.slippers > 0 && !this.rider && this.switchLeft <= 0 && this.throwLeft <= 0 && this.drinkLeft <= 0 && this.slipperFollow <= 0 && !this.frozen;
    if (windable && input!.aim) this.slipperCharge = Math.max(0, this.slipperCharge) + dt;
    else if (windable && this.slipperCharge >= 0) {
      result.slipper = { origin: this.eye(), dir: dirFromAngles(this.yaw, this.pitch), power: this.windup };
      this.slippers = 0; this.slipperCharge = -1; this.slipperFollow = 0.22; this.sinceSlipper = 0;
    } else this.slipperCharge = -1;
    if (this.slipperFollow > 0) {
      this.slipperFollow -= dt;
      if (this.slipperFollow <= 0 && this.slot === 2) this.swap(1, result);
    }
    this.sinceDrink += dt;
    if (this.drinkLeft > 0) {
      this.drinkLeft -= dt;
      if (this.drinkLeft <= 0) result.drink = true;
    }
    if (this.throwLeft > 0) {
      this.throwLeft -= dt;
      if (this.throwLeft <= 0) result[this.throwing] = { origin: this.eye(), dir: dirFromAngles(this.yaw, this.pitch + 0.06) };
    }

    const trigger = wantsFire && !this.sprinting && this.sprintRecover <= 0 && this.throwLeft <= 0 && this.drinkLeft <= 0 && this.slipperCharge < 0 && this.slipperFollow <= 0 && this.usable(this.slot);
    if (!trigger) { this.triggerHeld = false; this.shotsInBurst = 0; }
    if (trigger && this.switchLeft <= 0 && this.reloadLeft <= 0 && this.fireCooldown <= 0 && (w.auto || !this.triggerHeld)) {
      if (this.slot !== 2 && this.ammo[this.slot] <= 0) {
        if (!this.triggerHeld) result.dryFire = true;
        this.startReload(result);
      } else {
        if (this.slot !== 2) this.ammo[this.slot]--;
        this.fireCooldown += w.interval;
        if (this.fireCooldown < 0) this.fireCooldown = w.interval;
        const spread = w.pellets > 1 || w.class === 'melee' ? 0 : this.currentSpread() * DEG;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
        const dir = dirFromAngles(this.yaw + Math.cos(a) * r, this.pitch + Math.sin(a) * r);
        result.shots.push({ origin: this.eye(), dir, weapon: w });
        this.kick(w);
        this.bloom = Math.min(w.spread.bloomMax, this.bloom + w.spread.bloomPerShot);
        this.sinceShot = 0; this.shotsInBurst++;
      }
      this.triggerHeld = true;
    }
    if (this.fireCooldown < 0) this.fireCooldown = 0;

    if (this.sinceShot > 0.12 && this.recoilDebt > 0) {
      const back = Math.min(this.recoilDebt, this.recoilDebt * (1 - Math.exp(-w.recoil.recover * dt)));
      this.pitch -= back * 0.72; this.recoilDebt -= back;
    }
    this.punchVel += (-this.punchPitch * 220 - this.punchVel * 22) * dt;
    this.punchPitch += this.punchVel * dt;
    this.punchYaw *= Math.exp(-dt * 14);
    if (result.move.landed > 3) this.landDip = Math.min(0.32, this.landDip + result.move.landed * 0.022);
    this.landDip *= Math.exp(-dt * 9);
    if (result.move.stepped > 0) this.stepOffset -= result.move.stepped;
    this.stepOffset *= Math.exp(-dt * 16);
    this.shake *= Math.exp(-dt * 6);
    const speed = Math.hypot(this.m.vx, this.m.vz);
    if (this.m.grounded && this.m.slideTime <= 0) this.bobPhase += dt * speed * (this.sprinting ? 1.5 : 1.75);
    return result;
  }

  currentSpread() {
    const w = this.weapon;
    if (w.pellets > 1) return pelletCone(w, this.ads > 0.5);
    const moving = Math.hypot(this.m.vx, this.m.vz) > 1.5;
    let s = w.spread.hip + (w.spread.ads - w.spread.hip) * this.ads;
    if (moving) s += w.spread.moving * (1 - this.ads * 0.65);
    if (!this.m.grounded) s += w.spread.air;
    if (this.m.crouch > 0.5 && !moving && !this.rider) s *= 0.7;
    if (this.rider) s += RIDER_AIM.spread;
    return s + this.bloom * (1 - this.ads * 0.6);
  }

  private kick(w: WeaponDef) {
    const ads = (1 - this.ads * 0.35) * (this.rider ? RIDER_AIM.recoil : 1);
    const pitchKick = w.recoil.pitch * DEG * (0.85 + Math.random() * 0.3) * ads * (this.m.crouch > 0.5 ? 0.8 : 1);
    const pattern = w.recoil.pattern[this.shotsInBurst % w.recoil.pattern.length];
    const yawKick = (pattern + (Math.random() - 0.5) * 0.6) * w.recoil.yaw * DEG * ads;
    this.pitch = Math.min(1.48, this.pitch + pitchKick);
    this.yaw -= yawKick;
    this.recoilDebt += pitchKick;
    this.punchVel += w.recoil.viewPunch * 0.9;
    this.punchYaw += (Math.random() - 0.5) * w.recoil.viewPunch * 0.01;
  }

  private selectSlot(to: Slot) {
    if (to !== this.slot) this.lastSlot = this.slot;
    this.slot = to;
    this.reloadLeft = 0; this.bloom = 0; this.ads = 0; this.zoomLevel = 0; this.binoculars = false;
  }

  private swap(to: Slot, result: FrameResult) {
    this.selectSlot(to);
    this.switchLeft = this.weapon.equipTime;
    result.switched = true;
  }

  startReload(result?: FrameResult) {
    const w = this.weapon;
    if (this.slot === 2) return;
    if (this.reloadLeft > 0 || this.ammo[this.slot] >= w.magazine || this.switchLeft > 0 || this.reserve[this.slot] <= 0) return;
    this.reloadLeft = this.reloadTotal = w.reload;
    if (result) result.reloadStarted = true;
  }

  report() {
    return {
      x: this.m.x, y: this.m.y, z: this.m.z, vx: this.m.vx, vy: this.m.vy, vz: this.m.vz, yaw: this.yaw, pitch: this.pitch,
      crouch: this.m.crouch, grounded: this.m.grounded, sprint: this.sprinting, ads: this.ads > 0.5, slide: this.m.slideTime > 0, weapon: this.slot,
      use: this.using,
    };
  }

  using = false;
  frozen = false;

  speed() { return Math.hypot(this.m.vx, this.m.vz); }
  slideFactor() { return this.m.slideTime > 0 ? 1 : 0; }
}

export { MOVE };