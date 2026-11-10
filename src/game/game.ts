import * as THREE from 'three';
import { hitShape, raycastSoldier } from '../../shared/hitbox';
import { loadMap } from '../../shared/maps/index';
import { wrapAngle, type Vec3 } from '../../shared/math';
import { eyeHeight } from '../../shared/movement';
import { PEEK, easePeek, peekShift, peekSide, type PeekSide } from '../../shared/peek';
import { AFK, ATTACKERS, turned, vehicleTarget, type MatchEvent, type MatchState, type Soldier, type Team } from '../../shared/match/state';
import { VEHICLES, obstaclesOf, raycastVehicle, seatPosition, speedOf, type Vehicle } from '../../shared/vehicles';
import { seatFor } from '../../shared/match/vehicles';
import { BOBA, WEAPONS, pelletCone, pelletDirs, weaponStats, type HitZone, type WeaponId } from '../../shared/weapons';
import { CASH, CRATE_REACH, betweenRounds, canBuyWeapons, inBase } from '../../shared/match/economy';
import { seatOf, shieldedIds, sideOf } from '../../shared/match/combat';
import { BOMB_REACH, canSwitchTeam, modeOf, onSite, WEAPON_PICKUP_REACH } from '../../shared/match/sim';
import type { Assets } from '../assets';
import { Audio, type EngineVoice } from '../audio';
import { BodiesView } from '../render/bodies';
import { SmokeView } from '../render/smoke';
import { FireView } from '../render/fire';
import { Flyover, overheadPass } from '../render/flyover';
import { BombSitesView } from '../render/bombsite';
import { Effects } from '../render/effects';
import { InterpBuffer } from '../render/interp';
import { LevelView } from '../render/level';
import { CratesView, WeaponPickupsView } from '../render/pickups';
import { THEMES } from '../render/materials';
import { QUALITY, type Renderer } from '../render/renderer';
import { SoldierView } from '../render/soldier';
import { ViewModel } from '../render/viewmodel';
import { SkidMarks } from '../render/skids';
import { VehiclesView, vehicleName } from '../render/vehicles';
import { BuyMenu } from '../ui/buymenu';
import { SettingsMenu } from '../ui/settingsmenu';
import { Hud, weaponLabel } from '../ui/hud';
import { kbd, keyOf } from '../ui/keys';
import { mapName, roundReason, t, teamName } from '../ui/i18n';
import type { Key } from '../ui/i18n';
import { Input } from './input';
import type { GameLink } from './link';
import type { ServerId } from '../net/servers';
import { Driving } from './driving';
import { LocalPlayer } from './player';
import { chatDisabled, isMagnified, settings } from './settings';
import { ownedOf, purchaseOf, type BuyRequest, type Owned } from './purchases';
import { matchNote, roundEnded, track } from '../analytics';
import { noteDuel, noteKill, noteShare } from '../growth';
import { openInvitePanel } from '../ui/invitepanel';
import { challengeUrl, inviteUrl, shareRef } from './challenge';
import { MatchTally, type MatchSummary } from './matchstats';
import { openSharePanel } from '../ui/sharepanel';
import { mySkin } from './skins';
import { SWING, isSlipper, skinOf, type KnifeSkin } from '../../shared/skins';
import { TouchControls, type TouchInfo } from '../ui/touchcontrols';
import { holdAimMode } from './holdfire';
import { onTouchLayout, touchActive, touchAimAssist, type TouchContext } from './touchlayout';
import { InputLog } from './inputlog';
import { mayRecord } from './consent';
import { currentDeviceKind } from './device';
import { ASSIST, aimAssist, anglesTo } from './aimassist';
import { GOALS, NUDGE_ROUNDS, dailyXp, levelOf, loadProgress, recordProgress, streakOn, type ProgressEvent } from './progress';
import { smokeBlocks } from '../../shared/match/combat';
import { CRAZYGAMES, crazyGameplay, shareableLink } from '../crazygames';

type Sample = { x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number; pitch: number; crouch: number };
const LOD_NEAR = 30, LOD_MID = 70;
const SHOT_FX_RANGE = 110, SHOT_AUDIO_RANGE = 85;
const MATCH_RESULT_DISPLAY_MS = 3000;
const BURN_MARK_EVERY = 500;
const sweepOf = (skin: KnifeSkin, yaw: number) => isSlipper(skin) ? { x: -Math.cos(yaw), z: Math.sin(yaw) } : { x: 0, z: 0 };
const frustum = new THREE.Frustum(), projScreen = new THREE.Matrix4(), lodSphere = new THREE.Sphere(new THREE.Vector3(), 1.3);

interface Remote { view: SoldierView; buffer: InterpBuffer<Sample>; pos: THREE.Vector3; crouch: number; yaw: number; pitch: number; stepDist: number; last?: THREE.Vector3; peek: number; peekSide: PeekSide }

export class Game {
  readonly input: Input;
  readonly player = new LocalPlayer();
  private level: LevelView;
  private effects = new Effects();
  private bodies: BodiesView;
  private smoke = new SmokeView();
  private fire = new FireView(() => this.audio.fire());
  private flyover?: Flyover;
  private flyoverAt = -Infinity;
  private viewmodel: ViewModel;
  private remotes = new Map<number, Remote>();
  private hud: Hud;
  private buymenu: BuyMenu;
  private buying: { req: BuyRequest; before: Owned; at: number }[] = [];
  private crates: CratesView;
  private weaponPickups: WeaponPickupsView;
  private sites: BombSitesView;
  private map: ReturnType<typeof loadMap>;
  private lastVersion = -1;
  private time = 0;
  private reportTimer = 0;
  private hudTimer = 0;
  private mapTimer = 0;
  private heartTimer = 0;
  private beepTimer = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private wasAlive = false;
  private teamRequest = false;
  private deployed = false;
  private hudReady = false;
  private shotCount = 0;
  private menu: SettingsMenu;
  private menuAt = 0;
  private endShown = false;
  private corrections = 0;
  private inputLog?: InputLog;
  private assisted = { scale: 1, yaw: 0, pitch: 0 };
  private afkWarn?: { until: number; x: number; z: number; yaw: number; pitch: number };
  private shownWeapon = '';
  private shotVoices = 0;
  private seen = new Map<number, { bot: boolean; team: Team }>();
  private lastReport = new Map<number, number>();
  private predictedHits: { at: number; target: number }[] = [];
  private burnMarked = new Map<number, number>();
  private later: { at: number; run: () => void }[] = [];
  private meleePending = new Map<number, boolean>();
  private deathCam = new THREE.Vector3();
  private spectating = -1;
  private watched = new LocalPlayer();
  private watchedId = -1;
  private lastWatchedYaw = 0;
  private lastWatchedPitch = 0;
  private otherViewmodel?: ViewModel;
  private lastStepPhase = 0;
  private vehicles = new VehiclesView();
  readonly driving = new Driving();
  private seated?: { index: number; seat: 0 | 1 };
  private nearVehicle = -1;
  private weaponPickupRetry?: { index: number; at: number; until: number };
  private selfView?: SoldierView;
  private engines = new Map<number, EngineVoice>();
  private skids = new SkidMarks();
  private skidding = new Map<number, number>();
  private screeches = new Map<number, EngineVoice>();
  private touch?: TouchControls;
  private stopTouch: () => void;
  private stopRendering: (() => void)[] = [];
  private levelReady = false;

  private showWeapon(vm: ViewModel, p: LocalPlayer) {
    const held = p.slot === 2 ? 'knife' : p.weapons[p.slot];
    const shown = `${vm === this.viewmodel ? 'own' : 'other'}|${held}|${JSON.stringify(p.attachments[held] ?? {})}`;
    if (shown !== this.shownWeapon) { vm.setWeapon(held, p.attachments[held] ?? {}, true); this.shownWeapon = shown; }
  }

  private teamView() {
    const state = this.link.state(), me = state?.soldiers.find(s => s.id === this.link.myId());
    if (!state || !me || !this.link.switchTeam) return undefined;
    const can = canSwitchTeam(state, me);
    if (can === 'no') return undefined;
    const other = teamName(1 - me.team);
    if (can === 'even') { this.teamRequest = false; return { label: t('team.switch', { team: other }), note: t('team.even'), enabled: false }; }
    if (can === 'later') return this.teamRequest
      ? { label: t('team.cancel'), note: t('team.queued', { team: other }), enabled: true }
      : { label: t('team.switch', { team: other }), note: t('team.nextRound'), enabled: true };
    return { label: t('team.switch', { team: other }), note: t('team.now'), enabled: true };
  }

  private requestTeamSwitch() {
    const state = this.link.state(), me = state?.soldiers.find(s => s.id === this.link.myId());
    if (!state) return;
    const can = canSwitchTeam(state, me);
    if (can === 'ok') { this.teamRequest = false; this.link.switchTeam?.(); }
    else if (can === 'later') this.teamRequest = !this.teamRequest;
  }

  private changeSides() {
    const next = this.otherViewmodel ?? this.viewmodelFor(1 - this.myTeam);
    this.otherViewmodel = this.viewmodel;
    this.viewmodel = next;
    this.otherViewmodel.root.visible = false; this.otherViewmodel.torch = 0;
    this.shownWeapon = '';
  }

  private viewmodelFor(team: number) {
    if (team === this.myTeam) return this.viewmodel;
    if (!this.otherViewmodel) {
      this.otherViewmodel = new ViewModel(this.assets, team, mySkin().knife);
      this.renderer.viewCamera.add(this.otherViewmodel.root);
    }
    return this.otherViewmodel;
  }
  private running = true;
  private myTeam = 0;
  onExit?: (how: 'menu_button' | 'end_screen' | 'leave_key') => void;
  onMatchFinished?: () => void;
  onMapChange?: (mapId: string) => void;
  server?: ServerId;
  private tally = new MatchTally();
  private summary?: MatchSummary;
  private challenge?: { name: string; ref: string; via: 'room' | 'fallback' };
  private matchReturnTimer?: ReturnType<typeof setTimeout>;
  readonly mapId: string;

  constructor(private assets: Assets, private renderer: Renderer, readonly link: GameLink, mapId: string, readonly audio: Audio, container: HTMLElement) {
    this.map = loadMap(mapId);
    this.mapId = mapId;
    const def = this.map.def;
    const theme = THEMES[def.theme];
    renderer.setTheme(theme, def.sun);
    this.level = new LevelView(assets, def, theme);
    renderer.scene.add(this.level.group, this.effects.group);
    this.bodies = new BodiesView(assets);
    renderer.scene.add(this.bodies.group, this.smoke.group, this.fire.group);
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('flyover')) {
      this.flyover = new Flyover(overheadPass());
      this.flyover.setHaze(theme.fog, theme.fogDensity * 0.2);
      renderer.scene.add(this.flyover.group);
    }
    this.crates = new CratesView(assets, def.pickups);
    this.weaponPickups = new WeaponPickupsView(assets, def.weaponPickups);
    this.sites = new BombSitesView(def);
    renderer.scene.add(this.crates.group, this.weaponPickups.group, this.sites.group, this.vehicles.group, this.skids.mesh);
    this.input = new Input(renderer.renderer.domElement);
    this.input.sensitivity = settings.sensitivity;
    if (!CRAZYGAMES && link.mode === 'online' && link.recAuth && mayRecord()) {
      this.inputLog = new InputLog(renderer.renderer.domElement, () => this.input.locked, () => link.recAuth!(), () => ({
        device: currentDeviceKind(), touch: touchActive(), assist: touchActive() && touchAimAssist(),
        sens: this.player.sensitivity * this.input.sensitivity, fov: settings.fov,
      }));
      link.attachLog?.(this.inputLog);
    }
    const me = link.state()?.soldiers.find(s => s.id === link.myId());
    this.myTeam = me?.team ?? 0;
    this.viewmodel = new ViewModel(assets, this.myTeam, mySkin().knife);
    renderer.viewCamera.add(this.viewmodel.root);
    this.viewmodelFor(1 - this.myTeam);
    this.hud = new Hud(container, def);
    this.hud.onMenu = () => this.onExit?.('end_screen');
    if (!link.state()?.config.practice) this.hud.onShare = () => void this.share();
    this.buymenu = new BuyMenu(container, {
      buy: item => { this.requested({ kind: 'item', item }); this.link.buy(item); this.audio.ui(); },
      attach: (weapon, attachment) => { this.requested({ kind: 'attach', weapon, attachment }); this.link.attach(weapon, attachment); this.audio.ui(); },
    }, assets);
    this.buymenu.onClose = () => { this.input.clear(); this.resume(); };
    this.menu = new SettingsMenu(container, {
      resume: () => { this.menu.hide(); this.input.clear(); this.resume(); },
      leave: () => this.onExit?.('menu_button'),
      team: () => this.teamView(),
      switchTeam: () => this.requestTeamSwitch(),
      sensitivity: v => { this.input.sensitivity = v; },
      crosshair: style => { this.hud.crosshairStyle = style; },
      quality: q => renderer.applyQuality(QUALITY[q]),
      volume: v => audio.setVolume(v),
    });
    this.input.canRelock = () => !this.buymenu.open && !this.hud.chatting && !this.menu.open && this.link.state()?.phase !== 'ended';
    if (me?.alive) { this.player.spawnFrom(me); this.deployed = true; }
    const applyTouch = () => {
      const on = touchActive();
      if (on && !this.touch) this.touch = new TouchControls(container, this.input, {
        typeChat: team => { this.input.clear(); this.hud.openChat(team, text => this.link.say(text, team), true); },
        say: (text, team) => this.link.say(text, team),
        chooseScope: (weapon, scope) => {
          this.requested({ kind: 'attach', weapon, attachment: scope });
          this.link.attach(weapon, scope);
          this.audio.ui();
        },
      });
      else if (!on && this.touch) { this.touch.dispose(); this.touch = undefined; }
      this.input.touch = on;
      document.body.classList.toggle('touch', on);
    };
    applyTouch();
    this.stopTouch = onTouchLayout(applyTouch);
    const room = link.roomInfo?.();
    if (room?.code) this.hud.toast(t('hud.privateToast', { code: room.code, size: room.size }), 12000);
    this.stopRendering = [
      ...[this.level.group, this.crates.group, this.weaponPickups.group, this.sites.group, this.vehicles.group].map(g => renderer.limitShadows(g)),
      renderer.onQuality(q => this.effects.dynamicLights(q.dynamicLights)),
    ];
    this.level.ready.then(() => {
      if (!this.running) return;
      this.levelReady = true;
      renderer.limitShadows(this.level.group);
      renderer.warm();
    });
    if (import.meta.env.DEV) Object.assign(window, { __game: this });
  }

  private flyPass(now: number) {
    const every = 60, t = (now % every) - every / 2;
    this.flyover!.opacity = Math.max(0, Math.min(1, (t + every / 2) / 3, (every / 2 - t) / 3));
    this.flyover!.update(t);
    if (t >= -2.5 && this.flyoverAt < -2.5) this.audio.jetPass(2.5, 7);
    this.flyoverAt = t;
  }

  stop(keepLink = false) {
    this.running = false;
    clearTimeout(this.matchReturnTimer);
    this.matchReturnTimer = undefined;
    this.link.attachLog?.(undefined);
    this.inputLog?.close(); this.inputLog = undefined;
    if (!keepLink) this.link.dispose();
    this.hud.dispose();
    this.buymenu.dispose?.();
    this.buymenu.root.remove();
    this.menu.dispose();
    this.renderer.scene.remove(this.level.group, this.effects.group, this.bodies.group, this.smoke.group, this.fire.group, this.crates.group, this.weaponPickups.group, this.sites.group, this.vehicles.group);
    this.smoke.clear();
    this.fire.clear();
    this.flyover?.dispose();
    this.vehicles.dispose();
    this.renderer.scene.remove(this.skids.mesh); this.skids.dispose();
    for (const e of [...this.engines.values(), ...this.screeches.values()]) e.stop();
    this.engines.clear(); this.screeches.clear();
    if (this.selfView) { this.selfView.dispose(); this.selfView.root.removeFromParent(); this.selfView.gun.removeFromParent(); }
    for (const r of this.remotes.values()) { r.view.dispose(); r.view.gun.removeFromParent(); }
    this.viewmodel.root.removeFromParent();
    this.otherViewmodel?.root.removeFromParent();
    this.renderer.torch.intensity = 0;
    for (const f of this.stopRendering) f();
    this.stopTouch();
    this.touch?.dispose(); this.touch = undefined;
    this.input.dispose();
    this.hud.released(false, false);
    document.exitPointerLock?.();
  }

  frame(dt: number, render = true) {
    if (!this.running) return;
    this.input.beginFrame();
    const link = this.link;
    const before = link.state(), self = before?.soldiers.find(s => s.id === link.myId());
    if (link.mode === 'offline' && !this.input.locked && !this.input.touch && !this.buymenu.open && !this.hud.chatting && self?.alive && before?.phase !== 'ended') dt = 0;
    this.time += dt;
    link.update(dt);
    const state = link.state();
    if (!state) { this.renderer.render(this.time); return; }
    if (state.mapId !== this.mapId && this.onMapChange) { this.onMapChange(state.mapId); return; }
    const myId = link.myId();
    const me = state.soldiers.find(s => s.id === myId);
    if (me && this.buying.length) this.confirmPurchases(me, !!state.config.freeBuy);
    this.wearSkin(me);
    if (state.phase === 'ended' && !this.endShown) { this.endShown = true; this.buymenu.close(); this.input.release(); }
    if (state.phase !== 'ended') {
      if (this.endShown) { if (this.input.touch) void this.input.lock(); else this.capture(); }
      this.endShown = false;
    }
    const sabotage = modeOf(state, this.map.def) === 'sabotage';
    
    const active = (this.input.locked || this.input.touch) && !this.buymenu.open && !this.hud.chatting;
    
    const released = !this.input.locked && !this.input.touch && !this.buymenu.open && !this.hud.chatting && state.phase !== 'ended';
    
    this.hud.released(false, false);
    if (this.input.locked || this.input.touch) { this.menu.hide(); this.clickToResume(false); }
    else if (released && !this.menu.open && !this.awaitingClick && !this.resuming) { this.menu.show(link.mode === 'offline'); this.menuAt = performance.now(); }
    
    if (this.menu.open && performance.now() - this.menuAt > 250 && (this.input.takeCode('Escape') || this.input.take('menu'))) {
      this.menu.hide(); this.input.clear(); this.resume();
    }
    crazyGameplay(state.phase !== 'ended' && !this.menu.open && !this.awaitingClick);
    const side = me ? sideOf(state, this.map.def, me.team) : 0;
    const buyWindow = !!me && state.phase === 'live' && canBuyWeapons(state, this.map.def, me, side);
    const site = sabotage && me?.alive ? this.siteHere(state) : -1;
    const myJob = state.bomb.armed ? me?.team !== ATTACKERS && site === state.bomb.site : me?.team === ATTACKERS && site >= 0;
    this.nearVehicle = me?.alive && !this.seated && !(myJob && site >= 0) ? this.vehicleNear(state, me) : -1;
    if (this.touch) this.touchFrame(state, me, site, myJob, buyWindow);

    if (active && this.input.take('menu')) this.input.release();
    if (active) {
      if (this.input.take('store') && me) { this.buymenu.show(this.player.weapons[this.player.slot === 2 ? 0 : this.player.slot]); this.input.clear(); }
      const chat = this.input.take('chat') ? false : this.input.take('teamChat') ? true : undefined;
      if (chat !== undefined && !chatDisabled()) { this.input.clear(); this.hud.openChat(chat, text => this.link.say(text, chat)); }
      const usePressed = this.seated ? this.input.take('exitVehicle') : this.input.take('use');
      
      // --- بداية التصحيح: التحقق من وجود الاتصال (link) ---
      if (usePressed && me?.alive) {
        if (!link) {
          console.warn("تم تجاهل طلب الالتقاط: الاتصال بالسيرفر مفقود.");
          return;
        }
        const i = this.crates.nearest(this.player.m.x, this.player.m.y, this.player.m.z, CRATE_REACH);
        const weaponPickup = this.weaponPickups.nearest(this.player.m.x, this.player.m.y, this.player.m.z, WEAPON_PICKUP_REACH, state.weaponPickups);
        if (this.seated) { link.exitVehicle(); this.audio.door(); }
        else if (this.nearVehicle >= 0) { link.enterVehicle(this.nearVehicle); this.audio.door(); }
        else if (i >= 0) { link.useCrate(i); this.audio.ui(); }
        else if (weaponPickup >= 0) {
          const now = performance.now();
          link.useWeaponPickup(weaponPickup); this.audio.ui();
          this.weaponPickupRetry = { index: weaponPickup, at: now + 300, until: now + 2000 };
        }
      }
      // --- نهاية التصحيح ---

      const pendingPickup = this.weaponPickupRetry;
      if (pendingPickup) {
        const now = performance.now();
        const weaponPickup = this.weaponPickups.nearest(this.player.m.x, this.player.m.y, this.player.m.z, WEAPON_PICKUP_REACH, state.weaponPickups);
        const crate = this.crates.nearest(this.player.m.x, this.player.m.y, this.player.m.z, CRATE_REACH);
        if (!me?.alive || this.seated || state.phase === 'ended' || state.roundPhase === 'over'
          || state.weaponPickups[pendingPickup.index] === false || weaponPickup !== pendingPickup.index
          || this.nearVehicle >= 0 || crate >= 0 || (myJob && site >= 0) || now >= pendingPickup.until) this.weaponPickupRetry = undefined;
        else if (now >= pendingPickup.at) {
          if (link) {
            link.useWeaponPickup(pendingPickup.index);
            pendingPickup.at = now + 300;
          }
        }
      }
    }
    this.hud.scoreboard(this.input.down('scoreboard'), state, myId);

    const seat = me?.alive ? seatOf(state, myId) : undefined;
    const wasSeated = this.seated;
    this.seated = seat ? { index: seat.vehicle.id, seat: seat.seat } : undefined;
    if (this.driving.active && (seat?.seat !== 0 || seat.vehicle.id !== this.driving.v!.id)) this.driving.end();
    if (seat?.seat === 0 && !this.driving.active) {
      this.driving.begin(seat.vehicle); this.player.binoculars = false; this.player.ads = 0;
      this.player.rider = this.driving.armed;
      const drawn = this.player.rider ? this.player.drawOneHanded() : undefined;
      if (drawn !== undefined) { link.switchWeapon(drawn); this.audio.equip(this.player.weapon.id); }
    }
    if (wasSeated && !seat && me?.alive && this.wasAlive) this.player.correct(me);
    this.player.riding = !!seat;
    this.player.rider = this.driving.armed;
    this.hud.driving = this.driving.active && !this.driving.armed;
    if (me) {
      if (me.team !== this.myTeam) this.changeSides();
      this.myTeam = me.team;
      
      if (me.alive && !this.wasAlive) { 
        this.player.spawnFrom(me); this.spectating = -1; this.shownWeapon = ''; this.deployed = true; 
      }
      else if (me.alive) { 
        // ✅ فحص: إذا كان السلاح في السيرفر يختلف عن السلاح في العميل، قم بتحديثه فوراً
        if (this.player.weapons[0] !== me.weapons[0] || this.player.weapons[1] !== me.weapons[1]) {
          this.player.spawnFrom(me);
          this.shownWeapon = '';
        } else {
          this.player.syncGear(me); 
        }
      }

      if (!me.alive && this.wasAlive) {
        this.player.alive = false;
        this.deathCam.set(this.player.m.x, this.player.m.y + 1.6, this.player.m.z);
        this.spectating = me.lastAttacker;
      }
      if (me.corrections !== this.corrections) {
        if (this.wasAlive && me.alive) { if (this.driving.active && seat) this.driving.snap(seat.vehicle); else if (!seat) this.player.correct(me); }
        this.corrections = me.corrections;
      }
      this.wasAlive = me.alive;
    }
    if (this.player.alive) this.showWeapon(this.viewmodel, this.player);
    this.afkCountdown();

    this.player.using = active && myJob && !seat && state.roundPhase === 'live' && this.input.down('use');
    this.player.frozen = state.phase === 'live' && state.roundPhase === 'freeze' && !state.config.practice;

    const look = active ? { x: this.input.lookX, y: this.input.lookY } : { x: 0, y: 0 };
    if (this.driving.active) {
      const e = this.driving.update(dt, active && state.phase !== 'ended' ? this.input : undefined, this.map.world, this.player.frozen, obstaclesOf(state.vehicles, this.driving.v!.id));
      if (e.impact > 5) this.audio.crash(e.impact);
      const v = this.driving.renderPose()!;
      this.player.seat(seatPosition(v, 0), VEHICLES[v.kind].sit, v);
      this.aimRider(state);
    } else if (seat) {
      const p = this.vehicles.pose(seat.vehicle.id);
      if (p) this.player.seat(seatPosition({ ...p, kind: seat.vehicle.kind }, seat.seat), VEHICLES[seat.vehicle.kind].sit, { vx: p.vx, vy: 0, vz: p.vz });
    }
    this.assisted = { scale: 1, yaw: 0, pitch: 0 };
    if (active && this.player.alive && !this.driving.active && touchActive() && touchAimAssist()) this.assistAim(state, myId, dt);
    const aimed = { yaw: this.player.yaw, pitch: this.player.pitch };
    const lookScale = this.player.sensitivity * this.input.sensitivity * this.player.lookScale;
    const result = this.driving.active && !this.driving.armed
      ? this.player.update(dt, undefined, this.map.world, false, true)
      : this.player.update(dt, active ? this.input : undefined, this.map.world, active && state.phase !== 'ended', this.player.frozen || state.roundPhase === 'over',
        seat ? undefined : this.vehicleBodies(state));
    if (this.driving.armed) {
      this.driving.camPitch += this.player.pitch - aimed.pitch;
      this.driving.camYaw += wrapAngle(this.player.yaw - aimed.yaw);
      this.driving.camPitch = Math.max(-0.9, Math.min(this.driving.firstPerson ? 0.9 : 0.6, this.driving.camPitch));
      if (result.shots.length) this.driving.aiming();
    }
    this.inputLog?.frame({ lookX: look.x, lookY: look.y, scale: lookScale, assistYaw: this.assisted.yaw, assistPitch: this.assisted.pitch, assistScale: this.assisted.scale, yaw: this.player.yaw, pitch: this.player.pitch, alive: this.player.alive });
    if (result.move.jumped) this.audio.jump();
    if (result.move.landed > 4) this.audio.land(result.move.landed);
    if (result.move.slideStarted) this.audio.slide();
    if (!this.player.riding && this.player.m.grounded && this.player.speed() > 1 && Math.floor(this.player.bobPhase / Math.PI) !== this.lastStepPhase) {
      this.lastStepPhase = Math.floor(this.player.bobPhase / Math.PI);
      this.audio.footstep(undefined, undefined, this.player.sprinting);
    }
    if (result.reloadStarted) {
      const id = this.player.weapon.id, t = this.player.weapon.reload;
      link.reload(); this.audio.reload('out', id);
      setTimeout(() => this.audio.reload('in', id), t * 650); setTimeout(() => this.audio.reload('charge', id), t * 880);
    }
    if (result.switched) { link.switchWeapon(this.player.slot); this.audio.equip(this.player.weapon.id); }
    if (result.dryFire) this.audio.dryFire(this.player.weapon.id);
    if (result.zoomed) this.player.binoculars ? this.audio.binoculars() : this.audio.ui();
    if (result.grenade) link.grenade(result.grenade.origin, result.grenade.dir);
    if (result.smoke) link.smoke(result.smoke.origin, result.smoke.dir);
    if (result.molotov) link.molotov(result.molotov.origin, result.molotov.dir);
    if (result.slipper) { link.slipper?.(result.slipper.origin, result.slipper.dir, result.slipper.power); this.audio.slipper('throw'); }
    if (result.noSlipper) this.hud.toast(t('hud.slipperGone'), 1800);
    if (result.drinkStarted) this.audio.drink();
    if (result.drink) link.drink();
    if (result.drinkRefused) this.hud.toast(t('hud.fullHealth'), 1500);
    this.shotCount += result.shots.length + (result.dryFire ? 1 : 0);
    for (const shot of result.shots) this.shoot(shot.origin, shot.dir, shot.weapon.range, state);

    this.reportTimer -= dt;
    if (this.reportTimer <= 0 && me?.alive) {
      this.reportTimer = link.mode === 'online' ? 1 / 20 : 1 / 30;
      const driven = this.driving.report();
      if (driven) link.vehicleReport(driven); else link.report(this.player.report());
    }

    this.shotVoices = 0;
    if (!this.hudReady) { this.hud.tick(this.player, state, me); this.hudReady = true; }
    for (const s of state.soldiers) this.seen.set(s.id, { bot: s.bot, team: s.team });
    for (const e of link.drainEvents()) this.handleEvent(e, state, myId);

    const now = performance.now() / 1000;
    if (link.version() !== this.lastVersion) {
      this.lastVersion = link.version();
      this.syncRemotes(state, myId, now);
      this.bodies.sync(state.bodies, now, owner => { const s = state.soldiers.find(x => x.id === owner); return s ? skinOf(s).knife : 'slipper'; });
      this.smoke.sync(state.bodies, now);
      this.fire.sync(state.bodies, now, this.map.world);
      this.vehicles.sync(state.vehicles, now);
    }
    const renderTime = now - link.interpDelay - 0.02;
    const driven = this.driving.renderPose();
    this.vehicles.update(dt, renderTime, driven ? { id: driven.id, pose: driven } : undefined);
    this.updateSkids(state, dt);
    const rides = new Map<number, { v: Vehicle; seat: number }>();
    for (const v of state.vehicles) { if (v.driver >= 0) rides.set(v.driver, { v, seat: 0 }); if (v.passenger >= 0) rides.set(v.passenger, { v, seat: 1 }); }
    const positions = new Map<number, THREE.Vector3>();
    const byId = new Map(state.soldiers.map(s => [s.id, s]));
    const cam0 = this.renderer.camera;
    frustum.setFromProjectionMatrix(projScreen.multiplyMatrices(cam0.projectionMatrix, cam0.matrixWorldInverse));
    for (const [id, r] of this.remotes) {
      const s = byId.get(id);
      let sample = r.buffer.sample(renderTime, ['yaw']);
      if (!s || !sample) continue;
      const ride = rides.get(id), hiddenInside = !!ride && !VEHICLES[ride.v.kind].exposed;
      const vp = ride ? this.vehicles.pose(ride.v.id) : undefined;
      if (ride && vp) {
        const p = seatPosition({ ...vp, kind: ride.v.kind }, ride.seat);
        const free = ride.seat === 1 || VEHICLES[ride.v.kind].driverArms;
        sample = { ...sample, x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, yaw: free ? sample.yaw : vp.yaw, crouch: VEHICLES[ride.v.kind].sit };
      }
      const hips = ride && vp && VEHICLES[ride.v.kind].exposed ? vp.yaw : undefined;
      r.pos.set(sample.x, sample.y, sample.z); r.crouch = sample.crouch; r.yaw = sample.yaw; r.pitch = sample.pitch;
      r.peekSide = s.alive && s.ads && !s.bot && !ride ? peekSide(this.map.world, sample.x, sample.y, sample.z, sample.crouch, sample.yaw, s.team, r.peekSide) : 0;
      r.peek = easePeek(r.peek, r.peekSide, dt);
      positions.set(id, r.pos);
      lodSphere.center.set(sample.x, sample.y + 1, sample.z);
      const distance = lodSphere.center.distanceTo(cam0.position);
      r.view.setLod(!frustum.intersectsSphere(lodSphere) ? 3 : distance < LOD_NEAR ? 0 : distance < LOD_MID ? 1 : 2);
      const weapon: WeaponId = s.weapon === 2 ? 'knife' : s.weapons[s.weapon];
      r.view.update(dt, {
        x: sample.x, y: sample.y, z: sample.z, vx: sample.vx, vy: sample.vy, vz: sample.vz, yaw: sample.yaw, hips, pitch: sample.pitch, crouch: sample.crouch,
        grounded: s.m.grounded, sprint: s.sprint, ads: s.ads, slide: s.m.slideTime > 0, alive: s.alive, weapon, attachments: s.attachments[weapon], using: s.using,
        reloading: s.reloadLeft > 0 ? 1 - s.reloadLeft / 2 : 0, firing: s.sinceShot < 0.15, peek: r.peek,
      });
      const cp = this.renderer.camera.position;
      const inside = Math.hypot(r.pos.x - cp.x, r.pos.z - cp.z) < 0.75 && cp.y > r.pos.y - 0.3 && cp.y < r.pos.y + 2.2;
      r.view.root.visible = !inside && !hiddenInside && r.view.onScreen;
      if (inside || hiddenInside) r.view.gun.visible = false;
      if (s.alive && s.m.grounded && !ride && r.last) {
        r.stepDist += r.last.distanceTo(r.pos);
        if (r.stepDist > (s.sprint ? 2.6 : 2.0)) {
          r.stepDist = 0;
          if (r.pos.distanceTo(this.renderer.camera.position) < 32) this.audio.footstep(this.listener(), r.pos, s.sprint);
        }
      }
      r.last = (r.last ?? new THREE.Vector3()).copy(r.pos);
    }
    this.bodies.update(dt, renderTime, this.time);
    this.crates.update(this.time);
    this.weaponPickups.update(this.time, state.weaponPickups);
    this.sites.update(this.time, state.bomb, sabotage);
    if (this.later.length) {
      const due = this.later.filter(l => l.at <= this.time);
      this.later = this.later.filter(l => l.at > this.time);
      for (const l of due) l.run();
    }
    this.effects.update(dt);
    this.level.update(this.time);

    const cam = this.renderer.camera;
    this.updateSelfView(dt);
    if (this.player.alive && this.driving.active) {
      this.driving.placeCamera(cam, this.map.world);
      const v = this.driving.v!;
      const targetFov = settings.fov + Math.min(14, speedOf(v) * 0.35);
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
      if (this.driving.armed && this.driving.firstPerson) this.viewmodel.update(dt, this.player, look);
      else { this.viewmodel.root.visible = false; this.viewmodel.torch = 0; }
      if (this.otherViewmodel) { this.otherViewmodel.root.visible = false; this.otherViewmodel.torch = 0; }
      this.hud.spectate(undefined, 0);
    } else if (this.player.alive) {
      const eye = this.player.eye();
      const shake = this.player.shake;
      cam.position.set(eye.x + (Math.random() - 0.5) * shake * 0.05, eye.y + (Math.random() - 0.5) * shake * 0.05, eye.z);
      const bob = this.player.m.grounded ? Math.sin(this.player.bobPhase * 2) * 0.012 * Math.min(1, this.player.speed() / 6) * (1 - this.player.ads) : 0;
      cam.position.y += bob;
      const slideRoll = this.player.m.slideTime > 0 ? 0.06 : 0;
      const swing = this.viewmodel.swingLook;
      cam.rotation.set(this.player.pitch + this.player.punchPitch * 0.01 + swing.pitch, this.player.yaw + this.player.punchYaw + swing.yaw, slideRoll - this.player.lean * PEEK.roll, 'YXZ');
      const w = this.player.weapon;
      const base = settings.fov;
      const targetFov = base + (this.player.aimFov - base) * this.player.ads + (this.player.sprinting ? 6 : 0) + (this.player.m.slideTime > 0 ? 4 : 0);
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 14);
      cam.updateProjectionMatrix();
      this.renderer.viewCamera.fov = 58 - this.player.ads * (isMagnified(w) ? 12 : -4);
      this.renderer.viewCamera.updateProjectionMatrix();
      this.viewmodel.update(dt, this.player, look);
      if (this.otherViewmodel) { this.otherViewmodel.root.visible = false; this.otherViewmodel.torch = 0; }
      this.hud.spectate(undefined, 0);
    } else this.spectate(state, me, positions, dt, active);
    const mag = this.player.magnification;
    const watching = !this.player.alive && this.spectating >= 0 && this.watched.alive;
    const vm = watching ? this.viewmodelFor(this.watched.team) : this.viewmodel;
    this.hud.scope((this.player.alive || watching) && !this.driving.active && vm.scopeVisible, watching ? this.watched.magnification : mag, vm.overlay);
    this.hud.binoculars(this.player.alive && this.player.binoculars && this.player.ads > 0.5, mag);
    this.hud.zoomTag(this.player.alive && !this.player.binoculars && !this.viewmodel.overlay && this.player.ads > 0.85 && mag >= 1.5 ? mag : undefined);
    this.updateEngines(state);
    this.hud.smokeFog(this.smoke.update(performance.now() / 1000, cam.position));
    const p = this.player, feet = p.alive && !watching ? { x: p.m.x, y: p.m.y, z: p.m.z } : undefined;
    this.hud.burn(this.fire.update(performance.now() / 1000, this.listener(), feet));
    if (this.flyover) this.flyPass(performance.now() / 1000);
    this.renderer.torch.intensity = Math.max(this.viewmodel.torch, this.otherViewmodel?.torch ?? 0);
    if (render) this.renderer.render(this.time, this.levelReady && !this.menu.open);

    this.hud.frame(dt, this.player, state, me, cam, positions);
    if (me?.alive && me.health < 25) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) { this.heartTimer = 0.9; this.audio.heartbeat(); }
    }
    if (sabotage && state.bomb.armed && state.roundPhase === 'live') {
      this.beepTimer -= dt;
      if (this.beepTimer <= 0) { this.beepTimer = Math.max(0.12, Math.min(1, state.phaseLeft / 40)); this.audio.bombBeep(); }
    }
    this.hudTimer -= dt; this.mapTimer -= dt;
    if (this.player.windup > 0) this.hud.progress(t(this.player.windup >= 1 ? 'hud.windupFull' : 'hud.windup'), this.player.windup);
    else if (this.wasWinding) this.hud.progress(undefined, 0);
    this.wasWinding = this.player.windup > 0;
    if (this.hudTimer <= 0) {
      if (this.menu.open) this.menu.refreshTeam();
      this.hudTimer = 0.1;
      this.hud.tick(!this.player.alive && this.watched.alive ? this.watched : this.player, state, me);
      const free = !!state.config.freeBuy, between = betweenRounds(state);
      const buyLeft = free ? -1 : between ? 0 : Math.max(0, state.config.buyTime - state.roundClock);
      this.buymenu.update(me, buyWindow, buyLeft, free);
      const showBuy = !!me && buyWindow && (free || between || !me.alive || inBase(me, this.map.def, side)) && !this.buymenu.open;
      const touch = this.input.touch;
      this.hud.buyHint(showBuy ? (free || between ? (touch ? t('hud.storeTap') : t('hud.store', { key: kbd('store') })) : (touch ? t('hud.storeTapLeft', { n: Math.ceil(buyLeft) }) : t('hud.storeLeft', { key: kbd('store'), n: Math.ceil(buyLeft) }))) : undefined);
      this.hud.prompt(this.promptText(state, me, site, myJob));
      this.hud.vehicle(this.vehicleInfo(state));
      const bomb = state.bomb;
      const mine = bomb.by === myId && bomb.progress > 0;
      if (this.player.windup <= 0) this.hud.progress(mine ? t(bomb.armed ? 'hud.disarming2' : 'hud.arming2') : undefined, bomb.progress);
      const ended = state.phase === 'ended', career = link.leaderboard?.(ended);
      this.hud.matchEnd(state, this.myTeam, ended ? career : undefined);
      this.hud.net(link.status());
    }
    if (this.mapTimer <= 0) { this.mapTimer = 0.1; this.hud.minimap(state, me, this.player.yaw, positions, new THREE.Vector3(this.player.m.x, 0, this.player.m.z)); }
    this.fpsFrames++; this.fpsTime += dt;
    if (this.fpsTime > 1) { this.hud.fps(`${Math.round(this.fpsFrames / this.fpsTime)} FPS · ${this.renderer.renderer.info.render.calls} calls`); this.fpsFrames = 0; this.fpsTime = 0; }
    this.input.endFrame();
  }

  private touchFrame(state: MatchState, me: Soldier | undefined, site: number, myJob: boolean, buyWindow: boolean) {
    const p = this.player, live = state.roundPhase === 'live';
    
    const playing = !!me && (this.input.locked || this.input.touch) && !this.buymenu.open && !this.hud.chatting && !this.menu.open && state.phase !== 'ended';
    
    let ctx: TouchContext = { scope: 'none' };
    let use: TouchInfo['use'];
    if (playing && !me!.alive) ctx = { scope: 'dead', canSpectate: state.soldiers.some(s => s.alive && s.id !== me!.id) };
    else if (playing) {
      const seat = this.seated;
      const kind = seat ? state.vehicles[seat.index]?.kind : undefined;
      const scope = !seat ? 'foot' : seat.seat === 1 ? 'passenger' : kind === 'heli' ? 'heli' : 'car';
      const crate = this.crates.nearest(p.m.x, p.m.y, p.m.z, CRATE_REACH) >= 0 && p.slot !== 2;
      const weaponPickup = state.phase !== 'ended' && state.roundPhase !== 'over'
        && this.weaponPickups.nearest(p.m.x, p.m.y, p.m.z, WEAPON_PICKUP_REACH, state.weaponPickups) >= 0;
      if (scope === 'foot') use = this.nearVehicle >= 0 ? 'vehicle' : myJob && site >= 0 && live ? (state.bomb.armed ? 'disarm' : 'arm') : crate ? 'crate' : weaponPickup ? 'weapon' : undefined;
      ctx = {
        scope, scooter: kind === 'scooter', use: !!use, melee: p.slot === 2, throwable: p.slot === 2 && p.slippers > 0,
        scoped: p.ads > 0.6 && p.weapon.class === 'sniper' && !p.binoculars,
      };
    }
    const free = !!state.config.freeBuy;
    const holdAim = holdAimMode({
      scope: ctx.scope, melee: p.slot === 2, sniper: p.weapon.class === 'sniper', rider: p.rider, binoculars: p.binoculars, throwing: p.throwLeft > 0,
    });
    this.touch!.update(ctx, {
      slot: p.slot, weapons: [WEAPONS[p.weapons[0]].name, WEAPONS[p.weapons[1]].name], grenades: p.grenades, smokes: p.smokes, molotovs: p.molotovs, bobas: p.bobas, use,
      storeHot: !!me && buyWindow && (free || inBase(me, this.map.def, sideOf(state, this.map.def, me.team))), reloading: p.reloading,
      holdAim, shots: this.shotCount,
      scopeWeapon: p.slot === 2 ? undefined : p.weapon.id,
      scopeOptic: p.weapon.attachments.optic,
      scopeCash: me?.money ?? 0, scopeFree: free,
    });
  }

  private awaitingClick = false;
  private resumeLayer?: HTMLButtonElement;
  private resuming = false;

  private resume(label: Key = 'hud.clickResume') {
    this.resuming = true;
    void this.input.lock().then(ok => {
      this.resuming = false;
      if (!ok && !this.input.locked && !this.input.touch && this.running) this.clickToResume(true, label);
    });
  }

  capture() { 
    if (!this.input.locked && !this.input.touch && !this.resuming && !this.awaitingClick) this.resume('hud.clickPlay'); 
  }

  private clickToResume(on: boolean, label: Key = 'hud.clickResume') {
    if (on === this.awaitingClick) return;
    this.awaitingClick = on;
    if (on) {
      const el = this.resumeLayer ??= document.createElement('button');
      el.type = 'button';
      el.className = 'click-resume';
      el.innerHTML = `<b>${t(label)}</b>`;
      el.onclick = () => { void this.input.lock().then(ok => { if (ok) this.clickToResume(false); }); };
      this.hud.root.appendChild(el);
    } else this.resumeLayer?.remove();
  }

  private summarize(state: MatchState): MatchSummary | undefined {
    const me = state.soldiers.find(s => s.id === this.link.myId());
    if (!me) return undefined;
    const w = state.winner, team = me.team;
    return {
      name: me.name, mapId: this.mapId, mode: modeOf(state, this.map.def), teamSize: state.config.teamSize, solo: this.link.mode !== 'online',
      result: w === -1 ? 'draw' : w === team ? 'win' : 'loss', score: [state.scores[team], state.scores[1 - team]],
      kills: me.kills, deaths: me.deaths, headshots: this.tally.headshots, knifeKills: this.tally.knifeKills, bestRound: this.tally.bestRound,
      ...(this.challenge ? { rival: { name: this.challenge.name, beaten: w === team } } : {}),
    };
  }

  async share(o: { summary?: MatchSummary; room?: string; source?: 'share' | 'challenge' } = {}) {
    const summary = o.summary ?? this.summary;
    if (!summary) return;
    const ref = this.shareCode();
    const source = o.room ? 'duel' : o.source ?? 'share';
    const url = shareableLink(challengeUrl(location.origin, { name: summary.name, room: o.room, map: summary.mapId, beat: summary.kills, ref, server: o.room ? this.server : undefined }, { source, medium: 'share_card' }));
    this.input.release();
    track('share_card_opened', { ref, solo: summary.solo, result: summary.result, room: !!o.room });
    await openSharePanel({
      summary, url, backdrop: this.renderer.snapshot(), knife: mySkin().knife, room: !!o.room,
      note: o.room ? t('chal.room', { code: o.room }) : undefined,
      onShared: method => { noteShare(); track('share_card_shared', { ref, method, room: !!o.room }); },
      ...(!o.room && this.hud.onDuel ? { onDuel: this.hud.onDuel } : {}),
      onClose: () => { if (this.running && this.link.state()?.phase !== 'ended') { this.menu.hide(); this.resume(); } },
    });
  }

  private shareCode() {
    let storage: Storage | undefined;
    try { storage = localStorage; } catch { }
    return shareRef(storage);
  }

  onDuel(open?: (summary: MatchSummary) => void) {
    this.hud.onDuel = () => {
      const summary = this.summary;
      if (!summary) return;
      noteDuel();
      track('duel_clicked', { ref: this.shareCode(), solo: summary.solo, result: summary.result, via: open ? 'room' : 'link' });
      if (open) open(summary); else void this.share({ summary, source: 'challenge' });
    };
  }

  invite(code: string, where: string) {
    const ref = this.shareCode();
    this.input.release();
    track('invite_opened', { ref });
    openInvitePanel({
      code, where, url: shareableLink(inviteUrl(location.origin, code, ref, this.server)), seats: this.link.state()?.config.teamSize ?? 6,
      people: () => (this.link.state()?.soldiers ?? []).filter(s => !s.bot)
        .map(s => ({ name: s.name, me: s.id === this.link.myId() })).sort((a, b) => Number(b.me) - Number(a.me)),
      onSent: method => { noteShare(); track('invite_sent', { ref, method }); },
      onClose: () => { if (this.running && this.link.state()?.phase !== 'ended') { this.menu.hide(); this.resume(); } },
    });
  }

  notice(text: string, ms = 6000) { this.hud.toast(text, ms); }
  onward(label: string, go: () => void) { this.hud.nextLabel = label; this.hud.onRestart = go; }

  setChallenge(c: { name: string; ref: string; via: 'room' | 'fallback' }) {
    this.challenge = c;
    this.hud.rival = c.name;
  }

  private nudgeStore() {
    if (this.nudged || loadProgress().rounds > NUDGE_ROUNDS) return;
    this.nudged = true;
    this.hud.toast(this.input.touch ? t('hud.storeNudgeTouch') : t('hud.storeNudge', { key: keyOf('store') }), 7000);
  }
  private nudged = false;

  private progress(e: ProgressEvent) {
    const before = levelOf(loadProgress().xp).level;
    const r = recordProgress(e);
    const after = levelOf(r.next.xp).level;
    if (r.goalDone) this.hud.announce(t('prog.goalDone'), `+${GOALS[r.next.goal.kind].xp} XP`, 'var(--cash)');
    else if (r.daily) this.hud.announce(t('prog.daily', { n: r.daily.streak }), `+${r.daily.xp} XP`, 'var(--cash)');
    else if (after > before) this.hud.announce(t('prog.levelUp', { n: after }), '', 'var(--accent)');
  }

  private assistAim(state: MatchState, myId: number, dt: number) {
    const me = state.soldiers.find(s => s.id === myId);
    if (!me) return;
    const eye = this.player.eye();
    const zoom = this.player.ads > 0.5 ? this.player.magnification : 1;
    const targets: Vec3[] = [];
    for (const s of state.soldiers) {
      if (!s.alive || s.team === me.team || s.id === myId) continue;
      const r = this.remotes.get(s.id);
      if (!r) continue;
      const p = { x: r.pos.x, y: r.pos.y + (r.crouch > 0.5 ? 0.9 : 1.2), z: r.pos.z };
      const a = anglesTo(eye, p);
      if (a.dist > ASSIST.range || Math.abs(Math.atan2(Math.sin(a.yaw - this.player.yaw), Math.cos(a.yaw - this.player.yaw))) > ASSIST.outer * 1.5) continue;
      if (!this.map.world.lineOfSight(eye, p) || smokeBlocks(state.bodies, eye, p)) continue;
      targets.push(p);
    }
    if (!targets.length) return;
    const assist = aimAssist({ eye, yaw: this.player.yaw, pitch: this.player.pitch, targets, firing: this.input.fire, dt, zoom });
    this.input.lookX *= assist.lookScale; this.input.lookY *= assist.lookScale;
    this.player.yaw += assist.yaw; this.player.pitch += assist.pitch;
    this.assisted = { scale: assist.lookScale, yaw: assist.yaw, pitch: assist.pitch };
  }

  private vehicleBodies(state: MatchState) {
    if (!state.vehicles.length) return undefined;
    return obstaclesOf(state.vehicles.map(v => {
      const p = this.vehicles.pose(v.id);
      return p ? { id: v.id, kind: v.kind, x: p.x, y: p.y, z: p.z, yaw: p.yaw, vx: p.vx, vz: p.vz } : v;
    }));
  }

  private vehicleNear(state: MatchState, me: Soldier) {
    const at = { ...me, m: this.player.m };
    let best = -1, bestD = Infinity;
    for (const v of state.vehicles) {
      if (seatFor(state, at, v) === undefined) continue;
      const d = Math.hypot(v.x - this.player.m.x, v.z - this.player.m.z);
      if (d < bestD) { bestD = d; best = v.id; }
    }
    return best;
  }

  private aimRider(state: MatchState) {
    const d = this.driving, cam = this.renderer.camera;
    const viewYaw = d.placeCamera(cam, this.map.world);
    d.aimYaw = viewYaw; d.aimPitch = 0;
    d.poseYaw = viewYaw; d.posePitch = d.camPitch;
    if (!d.armed) return;
    cam.updateMatrixWorld();
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const hit = this.trace(cam.position, dir, this.player.weapon.range + 15, state);
    const eye = this.player.eye();
    const dx = hit.point.x - eye.x, dy = hit.point.y - eye.y, dz = hit.point.z - eye.z, len = Math.hypot(dx, dy, dz);
    const yaw = len > 2 ? Math.atan2(-dx, -dz) : Math.atan2(-dir.x, -dir.z);
    const pitch = len > 2 ? Math.asin(dy / len) : Math.asin(Math.max(-1, Math.min(1, dir.y)));
    this.player.yaw = yaw; this.player.pitch = pitch;
    d.aimYaw = yaw; d.aimPitch = pitch;
  }

  private vehicleInfo(state: MatchState) {
    const seated = this.seated;
    const host = seated ? state.vehicles[seated.index] : undefined;
    if (!seated || !host) return undefined;
    const v = this.driving.v ?? host, spec = VEHICLES[v.kind];
    const k = kbd;
    const keys = seated.seat === 1 ? `${t('hud.passenger')} · ${k('exitVehicle')}${t('hud.exit')}`
      : v.kind === 'heli' ? `${k('throttle')}${k('steerLeft')}${k('brake')}${k('steerRight')}${t('hud.fly')} · ${t('hud.mouseTurn')} · ${k('climb')}${t('hud.up')} · ${k('descend')}${t('hud.down')} · ${k('vehicleView')}${t('hud.view')} · ${k('exitVehicle')}${t('hud.exit')}`
      : `${k('throttle')}${k('brake')}${t('hud.drive')} · ${k('steerLeft')}${k('steerRight')}${t('hud.steer')} · ${k('handbrake')}${t('hud.drift')}${v.kind === 'scooter' ? ` · ${k('fire')}${t('hud.fire')}` : ''} · ${k('vehicleView')}${t('hud.view')} · ${k('exitVehicle')}${t('hud.exit')}`;
    const floor = this.map.world.groundHeight(v.x, v.z, v.y + 0.1, 0.5);
    return { name: vehicleName(v), speed: speedOf(v), altitude: v.kind === 'heli' ? v.y - floor : undefined, health: host.health, max: spec.health, keys };
  }

  private wearSkin(me: Soldier | undefined) {
    const skin = mySkin();
    if (this.player.alive) this.viewmodel.setKnifeSkin(skin.knife);
    this.audio.knifeSkin = skin.knife;
    if (!me || !this.link.wear) return;
    const worn = skinOf(me), now = performance.now();
    if ((worn.knife !== skin.knife || worn.look !== skin.look) && now - this.woreAt > 2000) { this.woreAt = now; this.link.wear(skin); }
  }
  private woreAt = -Infinity;

  private updateSelfView(dt: number) {
    const v = this.driving.renderPose();
    const show = !!v && v.kind === 'scooter' && !this.driving.firstPerson && this.player.alive;
    if (!show) { if (this.selfView) { this.selfView.root.visible = false; this.selfView.gun.visible = false; } return; }
    if (!this.selfView || this.selfView.team !== this.myTeam || this.selfView.look !== mySkin().look) {
      if (this.selfView) { this.selfView.dispose(); this.selfView.root.removeFromParent(); this.selfView.gun.removeFromParent(); }
      this.selfView = new SoldierView(this.assets, this.myTeam, mySkin());
      this.renderer.scene.add(this.selfView.root, this.selfView.gun);
    }
    this.selfView.setKnifeSkin(mySkin().knife);
    const p = seatPosition(v!, 0), held = this.player.slot === 2 ? 'knife' : this.player.weapons[this.player.slot];
    const pl = this.player;
    this.selfView.root.visible = true;
    this.selfView.update(dt, {
      x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, yaw: this.driving.poseYaw, hips: v!.yaw, pitch: this.driving.posePitch, crouch: VEHICLES.scooter.sit,
      grounded: true, sprint: false, ads: false, slide: false, alive: true, weapon: held, attachments: pl.attachments[held],
      reloading: pl.reloading ? 1 - pl.reloadLeft / pl.reloadTotal : 0, firing: false,
    });
  }

  private updateSkids(state: MatchState, dt: number) {
    const cam = this.renderer.camera.position;
    const list: Parameters<SkidMarks['update']>[1] = [];
    for (const v of state.vehicles) {
      if (v.wrecked || v.kind === 'heli') continue;
      const mine = this.driving.v?.id === v.id ? this.driving.v : undefined;
      const pose = mine ?? this.vehicles.pose(v.id);
      if (!pose || Math.hypot(pose.x - cam.x, pose.z - cam.z) > 140) continue;
      list.push({ id: v.id, pose: { kind: v.kind, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, vx: pose.vx, vz: pose.vz, grounded: mine ? mine.grounded : true }, braking: !!mine && this.driving.braking });
    }
    this.skidding = this.skids.update(dt, list, this.map.world, this.effects);
  }

  private updateEngines(state: MatchState) {
    const cam = this.renderer.camera.position;
    const listener = this.listener();
    const running = new Set<number>();
    const candidates = state.vehicles
      .filter(v => !v.wrecked && (v.driver >= 0 || v.rotor > 0.05))
      .map(v => ({ v, pose: this.driving.v?.id === v.id ? this.driving.v : this.vehicles.pose(v.id) }))
      .filter(c => c.pose && Math.hypot(c.pose.x - cam.x, c.pose.y - cam.y, c.pose.z - cam.z) < (c.v.kind === 'heli' ? 160 : 70))
      .sort((a, b) => Math.hypot(a.pose!.x - cam.x, a.pose!.z - cam.z) - Math.hypot(b.pose!.x - cam.x, b.pose!.z - cam.z))
      .slice(0, 4);
    for (const { v, pose } of candidates) {
      let voice = this.engines.get(v.id);
      if (!voice) { voice = this.audio.engine(v.kind); if (!voice) continue; this.engines.set(v.id, voice); }
      running.add(v.id);
      const spec = VEHICLES[v.kind], p = pose!;
      const speed = Math.hypot(p.vx, p.vz) / spec.maxSpeed;
      const rpm = v.kind === 'heli' ? p.rotor * (0.55 + 0.45 * Math.min(1, speed)) : 0.12 + 0.88 * Math.min(1, speed);
      const mine = this.seated?.index === v.id;
      voice.set(rpm, mine ? undefined : listener, mine ? undefined : { x: p.x, y: p.y + 1, z: p.z });
    }
    for (const [id, voice] of this.engines) if (!running.has(id)) { voice.stop(); this.engines.delete(id); }
    const sliding = state.vehicles
      .filter(v => v.kind !== 'heli' && (this.skidding.get(v.id) ?? 0) > (this.screeches.has(v.id) ? 0.01 : 0.08))
      .map(v => ({ v, pose: this.driving.v?.id === v.id ? this.driving.v : this.vehicles.pose(v.id) }))
      .filter(c => c.pose && Math.hypot(c.pose.x - cam.x, c.pose.z - cam.z) < 70)
      .sort((a, b) => Math.hypot(a.pose!.x - cam.x, a.pose!.z - cam.z) - Math.hypot(b.pose!.x - cam.x, b.pose!.z - cam.z))
      .slice(0, 2);
    const screeching = new Set<number>();
    for (const { v, pose } of sliding) {
      let voice = this.screeches.get(v.id);
      if (!voice) { voice = this.audio.screech(v.kind as 'car' | 'scooter'); if (!voice) continue; this.screeches.set(v.id, voice); }
      screeching.add(v.id);
      const mine = this.seated?.index === v.id;
      voice.set(this.skidding.get(v.id)!, mine ? undefined : listener, mine ? undefined : { x: pose!.x, y: pose!.y + 0.3, z: pose!.z });
    }
    for (const [id, voice] of this.screeches) if (!screeching.has(id)) { voice.stop(); this.screeches.delete(id); }
  }

  private siteHere(state: MatchState) {
    const sites = this.map.def.sabotage?.sites ?? [];
    const m = this.player.m;
    return sites.findIndex(id => {
      const p = this.map.def.points.find(x => x.id === id);
      return !!p && onSite(p, m.x, m.y, m.z, BOMB_REACH) && (!state.bomb.armed || state.bomb.site === sites.indexOf(id));
    });
  }

  private wasWinding = false;

  private promptText(state: MatchState, me: Soldier | undefined, site: number, myJob: boolean) {
    const near = state.vehicles[this.nearVehicle];
    if (me?.alive && near && !this.seated) {
      const name = vehicleName(near);
      return `${kbd('use')} ${near.driver >= 0 ? t('hud.rideAlong', { name }) : t(near.kind === 'car' ? 'hud.enterCar' : near.kind === 'scooter' ? 'hud.enterScooter' : 'hud.enterHeli', { name })}`;
    }
    if (me && !me.alive && !this.deployed && state.phase === 'live' && state.roundPhase === 'live') return t('hud.deployNext');
    if (!me?.alive) return '';
    if (state.roundPhase === 'freeze') {
      const pickup = state.phase !== 'ended'
        ? this.weaponPickups.nearest(this.player.m.x, this.player.m.y, this.player.m.z, WEAPON_PICKUP_REACH, state.weaponPickups)
        : -1;
      const weapon = this.weaponPickups.weapon(pickup);
      return weapon ? `${kbd('use')} ${t('hud.pickupWeapon', { weapon: WEAPONS[weapon].name })}` : '';
    }
    if (state.roundPhase !== 'live') return '';
    if (this.player.slot === 2 && this.player.slippers > 0 && this.player.windup <= 0 && !touchActive()) return t('hud.throwHint', { key: kbd('aim') });
    if (site >= 0 && myJob) return state.bomb.armed ? t('hud.holdDisarm', { key: kbd('use') }) : t('hud.holdArm', { key: kbd('use'), site: this.map.def.sabotage!.sites[site] });
    if (this.crates.nearest(this.player.m.x, this.player.m.y, this.player.m.z, CRATE_REACH) >= 0 && this.player.slot !== 2) {
      return `${kbd('use')} ${t('hud.crate')}${me.round.crate || state.config.freeBuy ? '' : ` ($${CASH.crate})`}`;
    }
    const pickup = state.phase !== 'ended'
      ? this.weaponPickups.nearest(this.player.m.x, this.player.m.y, this.player.m.z, WEAPON_PICKUP_REACH, state.weaponPickups)
      : -1;
    const weapon = this.weaponPickups.weapon(pickup);
    if (weapon) return `${kbd('use')} ${t('hud.pickupWeapon', { weapon: WEAPONS[weapon].name })}`;
    return '';
  }

  private spectate(state: MatchState, me: Soldier | undefined, positions: Map<number, THREE.Vector3>, dt: number, active: boolean) {
    const cam = this.renderer.camera;
    const living = state.soldiers.filter(s => s.alive && s.id !== me?.id && positions.has(s.id));
    if (active && this.input.take('aim') && living.length) {
      const i = living.findIndex(s => s.id === this.spectating);
      this.spectating = living[(i + 1) % living.length].id;
    }
    let target = living.find(s => s.id === this.spectating);
    if (!target && living.length) { target = living.find(s => s.team === me?.team) ?? living[0]; this.spectating = target.id; }
    const r = target ? this.remotes.get(target.id) : undefined;
    for (const vm of [this.viewmodel, this.otherViewmodel]) if (vm) { vm.root.visible = false; vm.torch = 0; }
    this.watched.alive = false;
    if (target && r) {
      const w = this.watched;
      if (w.team !== target.team || this.watchedId !== target.id) { w.team = target.team; this.watchedId = target.id; w.ads = 0; this.shownWeapon = ''; }
      w.alive = true; w.slot = target.weapon; w.weapons = target.weapons; w.attachments = target.attachments;
      w.ammo = [...target.ammo]; w.reserve = [...target.reserve]; w.grenades = target.grenades;
      w.m = target.m; w.sprinting = target.sprint; w.using = target.using; w.binoculars = false; w.throwLeft = 0;
      w.reloadTotal = w.weapon.reload; w.reloadLeft = target.reloadLeft;
      w.ads = Math.max(0, Math.min(1, w.ads + (target.ads ? 1 : -1) * dt / w.weapon.adsTime));
      if (target.m.grounded) w.bobPhase += dt * Math.hypot(target.m.vx, target.m.vz) * (target.sprint ? 1.5 : 1.75);
      const shift = peekShift(r.yaw, r.peek);
      cam.position.set(r.pos.x + shift.x, r.pos.y + eyeHeight({ crouch: r.crouch }) - Math.abs(r.peek) * PEEK.drop, r.pos.z + shift.z);
      cam.rotation.set(r.pitch, r.yaw, -r.peek * PEEK.roll, 'YXZ');
      r.view.root.visible = false; r.view.gun.visible = false;
      const vm = this.viewmodelFor(target.team);
      vm.setKnifeSkin(skinOf(target).knife);
      this.showWeapon(vm, w);
      const look = { x: wrapAngle(this.lastWatchedYaw - r.yaw) * 300, y: (r.pitch - this.lastWatchedPitch) * -300 };
      this.lastWatchedYaw = r.yaw; this.lastWatchedPitch = r.pitch;
      vm.update(dt, w, look);
      const fov = settings.fov + (w.aimFov - settings.fov) * w.ads + (w.sprinting ? 6 : 0);
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix();
      this.renderer.viewCamera.fov = 58 - w.ads * (isMagnified(w.weapon) ? 12 : -4);
      this.renderer.viewCamera.updateProjectionMatrix();
      this.hud.spectate(target.name, target.team);
      return;
    } else {
      this.deathCam.y += (this.player.m.y + 4 - this.deathCam.y) * Math.min(1, dt * 1.5);
      cam.position.lerp(this.deathCam, Math.min(1, dt * 3));
      cam.lookAt(new THREE.Vector3(this.player.m.x, this.player.m.y, this.player.m.z));
      this.hud.spectate(undefined, 0);
    }
    cam.fov += (settings.fov - cam.fov) * Math.min(1, dt * 5); cam.updateProjectionMatrix();
  }

  private listener() { return { pos: this.renderer.camera.position, yaw: this.player.yaw }; }

  private syncRemotes(state: MatchState, myId: number, now: number) {
    const seen = new Set<number>();
    for (const s of state.soldiers) {
      if (s.id === myId) continue;
      seen.add(s.id);
      let r = this.remotes.get(s.id);
      const skin = skinOf(s);
      if (!r || r.view.team !== s.team || r.view.look !== skin.look) {
        if (r) { r.view.dispose(); r.view.gun.removeFromParent(); }
        const view = new SoldierView(this.assets, s.team, skin);
        this.renderer.scene.add(view.root, view.gun);
        r = { view, buffer: new InterpBuffer(), pos: new THREE.Vector3(s.m.x, s.m.y, s.m.z), crouch: 0, yaw: s.yaw, pitch: 0, stepDist: 0, peek: 0, peekSide: 0 };
        this.remotes.set(s.id, r);
      }
      r.view.setEnemyHighlight(s.team !== this.myTeam);
      r.view.setKnifeSkin(skin.knife);
      const last = r.buffer.latest();
      if (last && Math.hypot(last.x - s.m.x, last.z - s.m.z) > 6) r.buffer.clear();
      r.buffer.push(now, { x: s.m.x, y: s.m.y, z: s.m.z, vx: s.m.vx, vy: s.m.vy, vz: s.m.vz, yaw: s.yaw, pitch: s.pitch, crouch: s.m.crouch });
    }
    for (const [id, r] of this.remotes) if (!seen.has(id)) { r.view.dispose(); r.view.gun.removeFromParent(); this.remotes.delete(id); }
  }

  private shoot(origin: Vec3, dir: Vec3, range: number, state: MatchState) {
    const w = this.player.weapon;
    const melee = w.class === 'melee';
    const cam = this.renderer.camera;
    cam.updateMatrixWorld();
    const rider = this.driving.armed && !this.driving.firstPerson ? this.selfView : undefined;
    let muzzle: THREE.Vector3;
    if (rider) {
      rider.shoot();
      const v = this.driving.v!;
      muzzle = rider.muzzleWorld().add(new THREE.Vector3(v.vx, 0, v.vz).multiplyScalar(1 / 60));
    } else {
      this.viewmodel.fire();
      muzzle = this.viewmodel.muzzleWorld(cam, this.renderer.viewCamera);
    }
    if (!melee) {
      this.audio.gunshot(w.id, undefined, undefined, w.suppressed);
      if (!w.suppressed) this.effects.flash(muzzle, 0xffc070, 4, 0.05, 7);
    }
    const traces = (w.pellets > 1 ? pelletDirs(dir, pelletCone(w, this.player.ads > 0.5), w.pellets) : [dir]).map(d => this.trace(origin, d, range, state));
    const counts = new Map<number, number>();
    for (const t of traces) if (t.target !== -1) counts.set(t.target, (counts.get(t.target) ?? 0) + 1);
    const target = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    const claimed = traces.find(t => t.target === target) ?? traces[0];
    this.link.fire({ weapon: this.player.slot, origin, dir, target: claimed.target, zone: claimed.zone, point: claimed.point });
    if (melee) {
      this.audio.knife(target !== -1);
      if (target !== -1) { if (!rider) this.viewmodel.willLand(); this.meleeLanded(claimed, target, rider !== undefined); }
      return;
    }
    traces.forEach((t, i) => {
      const end = new THREE.Vector3(t.point.x, t.point.y, t.point.z);
      const tracer = !w.suppressed && (w.pellets > 1 ? i % 3 === 0 : Math.random() < (w.auto ? 0.5 : 1));
      if (tracer) this.effects.tracer(muzzle, end, 0xffe2a0, w.class === 'sniper' ? 1.8 : 1, w.velocity);
      if (t.target !== -1) this.effects.hitSpark(end, false);
      else if (t.wall) this.effects.impact(end, new THREE.Vector3(t.wall.normal.x, t.wall.normal.y, t.wall.normal.z), t.wall.surface, i < 3, cam.position);
    });
    if (target !== -1 && this.link.mode === 'online') {
      const head = traces.some(t => t.target === target && t.zone === 'head');
      this.hud.hit(head ? 'head' : 'body');
      this.audio.hitmarker(head, false);
      this.predictedHits.push({ at: performance.now(), target });
    }
  }

  private meleeLanded(t: { point: Vec3; zone: HitZone | '' }, target: number, chase: boolean) {
    const skin = mySkin().knife, head = t.zone === 'head';
    const from = { x: this.player.m.x, z: this.player.m.z }, sweep = sweepOf(skin, this.player.yaw);
    this.predictedHits.push({ at: performance.now() + SWING[skin].contact * 1000, target });
    this.meleePending.set(target, false);
    this.later.push({ at: this.time + SWING[skin].contact, run: () => {
      const kill = !!this.meleePending.get(target);
      this.meleePending.delete(target);
      this.effects.meleeHit(new THREE.Vector3(t.point.x, t.point.y, t.point.z), this.renderer.camera.position, skin);
      if (!chase) {
        this.player.punchVel -= skin === 'broom' ? 40 : 25;
        if (isSlipper(skin)) this.player.punchYaw -= 0.012;
        this.player.shake = Math.min(3, this.player.shake + 0.25);
      }
      this.remotes.get(target)?.view.struck(from, sweep);
      this.hud.hit(kill ? 'kill' : head ? 'head' : 'body', true);
      this.audio.hitmarker(head, kill);
    } });
  }

  private trace(origin: Vec3, dir: Vec3, range: number, state: MatchState) {
    const wall = this.map.world.raycast(origin, dir, range, this.myTeam);
    let best = wall ? wall.t : range;
    let target = -1, zone: HitZone | '' = '';
    for (const v of state.vehicles) {
      if (v.id === this.seated?.index) continue;
      const pose = this.vehicles.pose(v.id);
      const t = pose ? raycastVehicle(origin, dir, { ...pose, kind: v.kind }) : -1;
      if (t >= 0 && t < best) { best = t; target = vehicleTarget(v.id); zone = 'body'; }
    }
    const shielded = shieldedIds(state);
    for (const [id, r] of this.remotes) {
      const s = state.soldiers.find(x => x.id === id);
      if (!s || !s.alive || s.team === this.myTeam || shielded.has(id)) continue;
      const hit = raycastSoldier(origin, dir, hitShape(r.pos, r.crouch, r.yaw, r.peek));
      if (hit && hit.t < best) { best = hit.t; target = id; zone = hit.zone; }
    }
    const point = { x: origin.x + dir.x * best, y: origin.y + dir.y * best, z: origin.z + dir.z * best };
    return { point, target, zone, wall: target === -1 ? wall : null };
  }

  private requested(req: BuyRequest) {
    const me = this.link.state()?.soldiers.find(s => s.id === this.link.myId());
    if (me) this.buying.push({ req, before: ownedOf(me), at: performance.now() });
  }

  private confirmPurchases(me: Soldier, free: boolean) {
    const now = performance.now(), after = ownedOf(me);
    this.buying = this.buying.filter(b => {
      const bought = purchaseOf(b.req, b.before, after, free);
      if (bought) track('store_purchase', bought);
      return !bought && now - b.at < 3000;
    });
  }

  private handleEvent(e: MatchEvent, state: MatchState, myId: number) {
    const find = (id: number) => state.soldiers.find(s => s.id === id);
    const me = find(myId);
    switch (e.type) {
      case 'shot': {
        if (e.shooter === myId) break;
        const r = this.remotes.get(e.shooter), shooter = find(e.shooter);
        const cam = this.renderer.camera.position;
        const shooterDistance = Math.hypot(e.from.x - cam.x, e.from.y - cam.y, e.from.z - cam.z);
        if (!this.player.alive && e.shooter === this.spectating && this.watched.alive) {
          const vm = this.viewmodelFor(this.watched.team), now = performance.now();
          if (now - (this.lastReport.get(e.shooter) ?? -1e9) >= 40) vm.fire();
        }
        if (e.weapon === 'knife') {
          r?.view.shoot();
          const skin = shooter ? skinOf(shooter).knife : 'slipper';
          if (shooterDistance < 12) this.audio.knife(e.hit > 0, undefined, undefined, skin);
          if (e.hit > 0 && shooterDistance < SHOT_FX_RANGE / 3) {
            const at = new THREE.Vector3(e.to.x, e.to.y, e.to.z);
            this.later.push({ at: this.time + SWING[skin].contact, run: () => this.effects.meleeHit(at, this.renderer.camera.position, skin) });
          }
          break;
        }
        const suppressed = !!shooter && weaponStats(e.weapon, shooter.attachments[e.weapon]).suppressed;
        const now = performance.now(), pellet = now - (this.lastReport.get(e.shooter) ?? -1e9) < 40;
        this.lastReport.set(e.shooter, now);
        if (!pellet) r?.view.shoot();
        if (shooterDistance > SHOT_FX_RANGE && Math.hypot(e.to.x - cam.x, e.to.y - cam.y, e.to.z - cam.z) > SHOT_FX_RANGE) break;
        const from = r?.view.onScreen ? r.view.muzzleWorld() : new THREE.Vector3(e.from.x, e.from.y, e.from.z);
        if (!pellet && shooterDistance < SHOT_AUDIO_RANGE * (suppressed ? 0.4 : 1) && this.shotVoices++ < 6) this.audio.gunshot(e.weapon, this.listener(), from, suppressed);
        const to = new THREE.Vector3(e.to.x, e.to.y, e.to.z);
        if (e.from.x === e.to.x && e.from.y === e.to.y && e.from.z === e.to.z) break;
        if (!suppressed && (!pellet || e.hit || Math.random() < 0.3)) this.effects.tracer(from, to, shooter?.team === 0 ? 0xa8dcff : 0xffb0a0, 1.2, WEAPONS[e.weapon]?.velocity);
        if (e.hit === 0) this.effects.impact(to, from.clone().sub(to).normalize(), e.surface, !pellet);
        else this.effects.hitSpark(to, false);
        break;
      }
      case 'damage': {
        if (e.attacker === myId && e.target !== myId) {
          const now = performance.now();
          this.predictedHits = this.predictedHits.filter(h => now - h.at < 1000);
          const shown = e.zone === 'blast' || e.zone === 'burn' ? -1 : this.predictedHits.findIndex(h => h.target === e.target);
          if (shown >= 0) this.predictedHits.splice(shown, 1);
          else if (e.zone === 'burn') {
            if (now - (this.burnMarked.get(e.target) ?? -1e9) >= BURN_MARK_EVERY) { this.burnMarked.set(e.target, now); this.hud.hit('burn'); this.audio.hitmarker(false, false, true); }
          } else { this.hud.hit(e.zone === 'head' ? 'head' : 'body'); this.audio.hitmarker(e.zone === 'head', false); }
        }
        const melee = (e.zone === 'head' || e.zone === 'body' || e.zone === 'limb') && find(e.attacker)?.weapon === 2;
        if (e.target === myId) {
          const angle = Math.atan2(-(e.x - this.player.m.x), -(e.z - this.player.m.z));
          if (e.zone !== 'fall' && e.zone !== 'burn') this.hud.damage(angle);
          this.audio.damage(false);
          this.player.shake = Math.min(3, this.player.shake + e.amount * (e.zone === 'burn' ? 0.02 : 0.05));
          const facing = angle - this.player.yaw;
          this.player.punchVel -= e.amount * 0.08 * (melee ? -Math.cos(facing) : 1);
          if (melee) {
            const striker = find(e.attacker), sweep = striker ? sweepOf(skinOf(striker).knife, striker.yaw) : { x: 0, z: 0 };
            const across = sweep.x * Math.cos(this.player.yaw) - sweep.z * Math.sin(this.player.yaw);
            this.player.punchYaw -= (Math.abs(across) > 0.3 ? Math.sign(across) : Math.sign(Math.sin(facing) || 1)) * 0.05;
          }
        } else if (!melee) this.remotes.get(e.target)?.view.hit(Math.random() < 0.5);
        else if (e.attacker !== myId) {
          const attacker = find(e.attacker)!, skin = skinOf(attacker).knife;
          const from = { x: attacker.m.x, z: attacker.m.z }, sweep = sweepOf(skin, attacker.yaw), target = e.target;
          this.later.push({ at: this.time + SWING[skin].contact, run: () => this.remotes.get(target)?.view.struck(from, sweep) });
        }
        break;
      }
      case 'kill': {
        const killer = find(e.killer), victim = find(e.victim);
        this.tally.kill(e, myId);
        this.hud.killfeed(killer, victim, e.weapon, e.head, e.killer === myId || e.victim === myId);
        if (e.killer === myId && e.victim !== myId) matchNote('kill');
        if (e.victim === myId) matchNote('death');
        if (e.killer === myId && e.victim !== myId && e.weapon === 'knife') matchNote('knife_kill');
        if (e.killer === myId && e.victim !== myId) {
          noteKill(this.link.mode === 'online');
          if (e.weapon === 'knife' && this.meleePending.has(e.victim)) this.meleePending.set(e.victim, true);
          else { this.hud.hit('kill'); this.audio.hitmarker(e.head, true); }
          this.progress({ type: 'kill', head: e.head });
        }
        if (e.victim === myId) this.hud.announce(t('hud.youDied'), killer && killer.id !== myId ? `${killer.name} · ${weaponLabel(e.weapon, e.weapon === 'knife' ? skinOf(killer).knife : undefined)}` : '', 'var(--crimson)');
        break;
      }
      case 'reward': if (e.id === myId) { this.hud.reward(e.amount, e.reason); this.audio.cash(); } break;
      case 'round': {
        if (e.phase === 'freeze' && this.teamRequest) {
          this.teamRequest = false;
          if (canSwitchTeam(state, me) === 'ok') this.link.switchTeam?.();
        }
        if (e.phase === 'freeze') {
          this.tally.round();
          if (me?.alive) { this.player.spawnFrom(me); this.shownWeapon = ''; }
          this.skids.clear();
          this.effects.clearDecals();
          this.audio.roundStart();
          const sabotage = modeOf(state, this.map.def) === 'sabotage';
          const goal = t(!sabotage ? 'hud.goal.elim' : me?.team === ATTACKERS ? 'hud.goal.attack' : 'hud.goal.defend');
          this.hud.announce(t('hud.round', { n: e.round }), goal, 'var(--accent)');
        } else if (e.phase === 'over') {
          const won = e.winner === -1 ? undefined : e.winner === this.myTeam;
          this.audio.roundEnd(won);
          roundEnded({ won: e.winner === (me?.team ?? this.myTeam), mode: modeOf(state, this.map.def), map: this.mapId });
          if (me && !state.config.practice) { this.progress({ type: 'round', won: e.winner === me.team }); this.nudgeStore(); }
          const title = e.winner === -1 ? t('hud.roundDraw') : t('hud.winsRound', { team: teamName(e.winner).toUpperCase() });
          this.hud.announce(title, roundReason(e.reason), e.winner === -1 ? 'var(--ink)' : e.winner === 0 ? 'var(--aegis)' : 'var(--crimson)');
        }
        break;
      }
      case 'bomb': {
        const letter = this.map.def.sabotage?.sites[e.site] ?? '';
        if (e.action === 'armed') { this.audio.bombArmed(); this.hud.announce(t('hud.armedTitle'), t('hud.site', { site: letter }), 'var(--crimson)'); this.beepTimer = 0; }
        if (e.action === 'disarmed') { this.audio.bombDisarmed(); this.hud.announce(t('hud.disarmedTitle'), t('hud.site', { site: letter }), 'var(--aegis)'); }
        break;
      }
      case 'vehicle': {
        if (e.action === 'hit' && e.id === myId && this.seated?.index !== e.vehicle) {
          const now = performance.now();
          this.predictedHits = this.predictedHits.filter(h => now - h.at < 1000);
          const shown = this.predictedHits.findIndex(h => h.target === vehicleTarget(e.vehicle));
          if (shown >= 0) this.predictedHits.splice(shown, 1); else { this.hud.hit('body'); this.audio.hitmarker(false, false); }
        }
        if (e.action === 'hit' && this.seated?.index === e.vehicle && e.id !== myId) this.player.shake = Math.min(2, this.player.shake + 0.3);
        if (e.action === 'wreck' && e.id === myId) this.hud.hit('kill');
        if (e.action === 'enter' && e.id === myId) {
          const kind = state.vehicles.find(v => v.id === e.vehicle)?.kind;
          if (kind) track('vehicle_entered', { kind });
        }
        break;
      }
      case 'explosion': {
        const at = new THREE.Vector3(e.x, e.y, e.z);
        this.effects.explosion(at, e.weapon === 'bomb' ? 2.5 : e.weapon === 'vehicle' ? 1.8 : 1);
        this.audio.explosion(this.listener(), at);
        const d = at.distanceTo(this.renderer.camera.position);
        const reach = e.weapon === 'bomb' ? 40 : e.weapon === 'vehicle' ? 28 : 18;
        if (d < reach) this.player.shake = Math.min(4, this.player.shake + (reach - d) * 0.25);
        break;
      }
      case 'smoke': {
        this.audio.smoke(this.listener(), new THREE.Vector3(e.x, e.y, e.z));
        break;
      }
      case 'molotov': {
        const at = new THREE.Vector3(e.x, e.y, e.z);
        this.audio.molotov(e.action, this.listener(), at);
        if (e.action !== 'out') this.effects.hitSpark(at, false);
        break;
      }
      case 'slipper': {
        const at = new THREE.Vector3(e.x, e.y, e.z);
        if (e.action === 'pickup') { if (e.id === myId) { this.hud.toast(t('hud.slipperBack'), 1500); this.audio.ui(); } break; }
        if (e.action === 'throw') this.bodies.noteThrow(e.id, e);
        const owner = e.action === 'hit' ? this.bodies.throwerNear(e.x, e.z) : e.id;
        const thrower = owner === undefined ? undefined : find(owner), knife = thrower && skinOf(thrower).knife;
        if (e.action === 'hit') {
          this.audio.slipper('hit', this.listener(), at, knife);
          this.effects.meleeHit(at, this.renderer.camera.position, knife || 'slipper');
          if (thrower) this.remotes.get(e.id)?.view.struck({ x: thrower.m.x, z: thrower.m.z }, { x: 0, z: 0 });
          break;
        }
        if (e.id !== myId) { this.remotes.get(e.id)?.view.shoot(); this.audio.slipper('throw', this.listener(), at, knife); }
        break;
      }
      case 'drink': {
        if (e.id === myId) { matchNote('boba'); this.hud.toast(t('hud.healed', { n: BOBA.heal }), 1800); break; }
        const r = this.remotes.get(e.id);
        if (r) this.audio.drink(this.listener(), new THREE.Vector3(r.pos.x, r.pos.y + 1.4, r.pos.z));
        break;
      }
      case 'phase': {
        if (e.phase === 'ended') {
          this.summary = this.summarize(state);
          if (this.challenge && this.summary) track('challenge_completed', { ref: this.challenge.ref, via: this.challenge.via, won: this.summary.result === 'win' });
          const won = e.winner === this.myTeam;
          if (!state.config.practice) this.progress({ type: 'match', won });
          const next = streakOn(loadProgress()) + 1;
          this.hud.comeBack = t('prog.tomorrow', { n: next, xp: dailyXp(next) });
          if (e.winner === -1) this.hud.announce(t('hud.draw'), t('hud.matchDrawn'), 'var(--ink)');
          else this.hud.announce(t(won ? 'hud.victory' : 'hud.defeat'), t('hud.winsMatch', { team: teamName(e.winner) }), won ? 'var(--accent)' : 'var(--crimson)');
          this.matchReturnTimer = setTimeout(() => this.onMatchFinished?.(), MATCH_RESULT_DISPLAY_MS);
        }
        if (e.phase === 'warmup') { this.tally = new MatchTally(); this.summary = undefined; }
        if (e.phase === 'warmup') this.hud.announce(t('hud.newMatch'), mapName(this.map.def.id, this.map.def.name));
        break;
      }
      case 'chat': {
        const sender = find(e.id);
        if (e.teamOnly && sender && sender.team !== this.myTeam) break;
        const dead = !!sender && !sender.alive && state.roundPhase === 'live';
        if (dead && me?.alive && sender.id !== myId) break;
        this.hud.chatLine(e.name, e.team, e.text, e.teamOnly, dead);
        break;
      }
      case 'join': if (e.id !== myId && !(e.bot ?? find(e.id)?.bot)) this.hud.chatNotice('chat.joined', e.name, e.team, teamName(e.team)); break;
      case 'team': {
        this.hud.chatNotice('chat.switched', e.name, e.team, teamName(e.team));
        if (e.id === myId && me?.alive) { this.player.spawnFrom(me); this.shownWeapon = ''; }
        break;
      }
      case 'leave': {
        const was = this.seen.get(e.id);
        this.seen.delete(e.id);
        const bot = e.bot ?? was?.bot;
        if (e.id !== myId && bot === false) this.hud.chatNotice('chat.left', e.name, e.team ?? was?.team ?? 0);
        break;
      }
      case 'spawn': break;
      case 'afk': {
        if (e.id !== myId) break;
        const p = this.player;
        this.afkWarn = { until: performance.now() + e.left * 1000, x: p.m.x, z: p.m.z, yaw: p.yaw, pitch: p.pitch };
        this.audio.ui();
        break;
      }
    }
  }

  private afkCountdown() {
    const w = this.afkWarn;
    if (!w) return;
    const p = this.player, left = Math.ceil((w.until - performance.now()) / 1000);
    const acted = Math.hypot(p.m.x - w.x, p.m.z - w.z) > AFK.move || turned(p.yaw, w.yaw) || turned(p.pitch, w.pitch)
      || this.input.fire;
    if (acted || left < 0) { this.afkWarn = undefined; this.hud.afk(undefined); } else this.hud.afk(Math.max(0, left));
  }
}