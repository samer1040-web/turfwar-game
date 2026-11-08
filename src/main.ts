console.log("✅ الكود الجديد يعمل الآن!");
import './visit';
import { inject } from '@vercel/analytics';
import { RETIRED_MAPS, loadMap, mapSummaries } from '../shared/maps/index';
import { cleanCode, notCodeLetters, hasSites, listOrder, mapsFor, pickAnyRoom, ROOM_SIZES, roomFull, sizeLabel } from '../shared/match/rooms';
import { ELIMINATION, SABOTAGE, type Mode, type Team } from '../shared/match/state';
import { assetUrl } from './assetUrl';
import { groundSets, loadAssets, type Assets } from './assets';
import { sharpenTextures } from './render/textures';
import { challengeMap, linkServer, parseChallenge, parseInvite, type Challenge } from './game/challenge';
import { invitedFriends, onSkinChange } from './game/skins';
import { GOLD_INVITES } from '../shared/skins';
import type { MatchSummary } from './game/matchstats';
import './ui/share.css';
import { Audio } from './audio';
import { Game } from './game/game';
import { setChatDisabled, settings } from './game/settings';
import { loadLayout, matches } from './game/keybinds';
import type { GameLink } from './game/link';
import { OfflineLink } from './game/offline';
import { Bench, BENCH_SECONDS, benchReport, type BenchResult } from './game/bench';
import { onlineAvailable, connectOnline, watchRooms, ConnectError, OnlineLink, type OnlineEntry, type PublicRoom, type RoomsLink } from './net/online';
import { PING_WINDOW, PingMonitor, hostAnswers, pingAllowed, pingTone, pingUrl, serverHost, serverRegion } from './net/ping';
import { currentServer, followLink, gameServerList, onServer, type GameServer, type ServerId } from './net/servers';
import { ConnectDriver, connectSeconds, type ConnectState } from './net/connect';
import { benchFinished, matchJoined, matchLeft, matchNote, setSuper, startAnalytics, track, type PlayKind, type Exit, type Reason } from './analytics';
import { frameTook, lobbyReady, matchFrameStats, matchStarted, noteArrival, playFailed, playPressed } from './growth';
import { LevelView } from './render/level';
import { THEMES } from './render/materials';
import { QUALITY, Renderer } from './render/renderer';
import { renderTheme, THEME_START } from './theme';
import { SkinPanel } from './ui/skinpanel';
import { SettingsMenu, type GraphicsQuality, type SettingsFocus, type SettingsTab } from './ui/settingsmenu';
import { cjkFontReady } from './ui/fonts';
import { drawMapThumb } from './ui/mapthumb';
import { acceptTerms } from './game/consent';
import { L, applyI18n, escapeHtml as esc, isZh, lang, mapName as localMapName, modeName, onLang, plural, serverError, sizeName, t, type Key } from './ui/i18n';
import './style.css';
import './menu.css';
import './ui/lang-zh.css';
import { currentDeviceKind, defaultQuality, gpuRenderer, graphicsHelp, inAppBrowserName, isWebglFailure, readEnv } from './game/device';
import { onTouchLayout, touchActive, touchAimAssist } from './game/touchlayout';
import { InstallBanner } from './ui/installhint';
import { isSideways, onSideways, watchSideways } from './ui/viewport';
import { mountProgressBadge } from './ui/progressbadge';
import { levelOf, loadProgress, onProgress } from './game/progress';
import { mountNews } from './ui/news';
import { mountPrivacyNotice } from './ui/privacynotice';
import { askCallsign, cleanCallsign, madeUpCallsign } from './ui/callsign';
import { ask, confirmDialog } from './ui/ask';
import { reportBootFailure, watchClientErrors } from './errors';
import { registerServiceWorker, warmServiceWorker } from './pwa';
import { CRAZYGAMES, crazySave, crazyGameplay, crazyInstantMultiplayer, crazyLeftRoom, crazyLinkPlace, crazyLoadingStop, crazyMidgameAd, crazyRoom, crazySettings, crazyUser, linkPlace, onCrazyJoinRoom, onCrazySettings } from './crazygames';

if (!CRAZYGAMES) inject();

const app = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);
const store = {
  get: (k: string, d: string) => { try { return localStorage.getItem(`lawbreaker.${k}`) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(`lawbreaker.${k}`, v); } catch { } },
};

const SIZES = ROOM_SIZES;
type SizeId = (typeof SIZES)[number]['id'];
const sizeOf = (id: string) => SIZES.find(s => s.id === id) ?? SIZES[1];
const MODE_TAGS: Record<Mode, string> = { elimination: 'E', sabotage: 'S' };
type Tab = 'quick' | 'start' | 'join';
const TABS: readonly Tab[] = ['quick', 'start', 'join'];
type Action = 'quick' | 'start' | 'room' | 'code' | 'solo' | 'range';
const modeOf = (a: Action) => a === 'solo' ? 'offline' : a === 'range' ? 'lab' : 'online';

const menu = document.createElement('div');
menu.id = 'menu';
const maps = mapSummaries();
const mapName = (id: string) => localMapName(id, maps.find(m => m.id === id)?.name ?? id);

followLink(linkServer(crazyLinkPlace() ?? location));
let server: GameServer | undefined = currentServer();
const choosable = gameServerList().length > 1;
const online = onlineAvailable();
const FEATURED = ['citadel'];

const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.84 1.84M7.34 16.66 5.5 18.5M18.5 18.5l-1.84-1.84M7.34 7.34 5.5 5.5"/><circle cx="12" cy="12" r="6.4"/></svg>';
const SHIRT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3.5 3 6.5l2 4 2.2-1V20.5h9.6V9.5l2.2 1 2-4-5.5-3c-.6 1.6-1.9 2.6-3.5 2.6S9.1 5.1 8.5 3.5z"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
const CARET = '<svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const GITHUB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3"/></svg>';
const DISCORD = '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>';
const REPO_URL = 'https://github.com/madeyexz/turfwar';
const DISCORD_URL = 'https://discord.gg/ugFv3GzwcD';
const SITE_URL = 'https://turfwar.ianhsiao.me';
const termsHref = () => `/terms${params.get('lang') ? `?lang=${lang()}` : ''}`;
function renderClickwrap() {
  const el = document.getElementById('clickwrap');
  if (!el) return;
  try {
    el.innerHTML = esc(t('lobby.clickwrap', { terms: '\u0001', privacy: '\u0002' }))
      .replace('\u0001', `<a href="${termsHref()}">${esc(t('lobby.terms'))}</a>`).replace('\u0002', `<a href="${privacyHref()}">${esc(t('lobby.privacyPolicy'))}</a>`);
  } catch (e) {
    console.error("Clickwrap error", e);
  }
}
const privacyHref = () => CRAZYGAMES ? `${SITE_URL}/privacy?lang=${lang()}` : `/privacy${params.get('lang') ? `?lang=${params.get('lang')}` : ''}`;
const aboutHref = () => isZh() ? '/about' : '/en/about';
const LOCK = '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const TAB_ICONS: Record<Tab, string> = {
  quick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  start: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  join: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
};
const choice = (group: string, attr: string, items: [string, string][], label: Key) =>
  `<div class="choices segmented" id="${group}" style="--n:${items.length}" role="group" aria-label="${t(label)}" data-i18n-aria-label="${label}">${items.map(([v, text]) => `<button type="button" class="choice" data-${attr}="${v}"><b>${text}</b></button>`).join('')}</div>`;
const choice2 = (group: string, attr: string, items: [string, string, string][], label: Key, cls = '') =>
  `<div class="choices segmented ${cls}" id="${group}" style="--n:${items.length}" role="group" aria-label="${t(label)}" data-i18n-aria-label="${label}">${items.map(([v, text, small]) => `<button type="button" class="choice" data-${attr}="${v}"><b>${text}</b><small>${small}</small></button>`).join('')}</div>`;
const sizeItems = (): [string, string, string][] => SIZES.map(s => [s.id, s.label, `${L(`size.${s.id}`)}${s.perTeam > 12 ? ` · ${L('lobby.bigMaps')}` : ''}`]);
const modeTag = (m: Mode) => `<span class="mtag">[${MODE_TAGS[m]}]</span> ${L(`mode.${m}`)}`;
const pop = (id: string, label: Key, body: string) =>
  `<div class="pop" id="${id}" role="dialog" aria-label="${t(label)}" data-i18n-aria-label="${label}" hidden>${body}</div>`;
const field = (label: Key, body: string) => `<div class="frow">${L(label, 'span', 'class="label"')}${body}</div>`;
const line = (id: string, tail = `<span class="ping" id="${id}-ping"></span>`) =>
  `<p class="rooms-line" id="${id}-line"><span class="conn"><i></i></span><span class="line-text" id="${id}-hint"></span>${tail}</p>`;
const serverChip = (id: string) => `<button type="button" class="server-chip" id="${id}"${choosable ? ' aria-haspopup="dialog"' : ' disabled'} hidden></button>`;
const deploy = (id: string, label: Key, right = '', title?: Key) =>
  `<button type="button" class="deploy" id="${id}"${title ? ` title="${t(title)}" data-i18n-title="${title}"` : ''} disabled><span class="deploy-l">${PLAY}<span class="deploy-t" data-label="${label}">${t('lobby.loading')}</span></span><span class="deploy-r">${right}</span></button>`;

menu.innerHTML = `
  <header class="top">
    <button type="button" class="mark" id="tab-quick" data-tab="quick" aria-label="${t('lobby.home')}" data-i18n-aria-label="lobby.home"><img src="${assetUrl('icons/icon-192.png')}" width="40" height="40" alt=""><span class="mark-back" aria-hidden="true">‹</span><span class="mark-name">${L('brand.short')}</span></button>
    <div class="who">
      <button type="button" class="profile" id="open-profile" aria-haspopup="dialog" aria-expanded="false" aria-controls="profile-pop"><b id="profile-name"></b><span class="dot" aria-hidden="true">·</span><span id="profile-lv"></span>${CARET}</button>
      <div class="icons">
        <a class="icon-btn discord" id="discord-top" href="${DISCORD_URL}" target="_blank" rel="noopener" data-tip="${t('lobby.discord')}" data-i18n-tip="lobby.discord" aria-label="${t('lobby.discordTitle')}" data-i18n-aria-label="lobby.discordTitle">${DISCORD}</a>
        <button type="button" class="icon-btn" id="open-skins" data-tip="${t('skin.open')}" data-i18n-tip="skin.open" aria-label="${t('skin.title')}" data-i18n-aria-label="skin.title" aria-haspopup="dialog">${SHIRT}</button>
        <button type="button" class="icon-btn" id="open-controls" data-tip="${t('lobby.controls')}" data-i18n-tip="lobby.controls" aria-label="${t('lobby.controls')}" data-i18n-aria-label="lobby.controls" aria-haspopup="dialog">?</button>
        <button type="button" class="icon-btn" id="open-settings" style="display:none !important;" data-tip="${t('lobby.settings')}" data-i18n-tip="lobby.settings" aria-label="${t('lobby.settings')}" data-i18n-aria-label="lobby.settings" aria-haspopup="dialog">${GEAR}</button>
      </div>
    </div>
  </header>
  <section class="side">
    <h1 class="logo" id="logo"></h1>
    <nav class="ways" id="tabs" aria-label="${t('lobby.ways')}" data-i18n-aria-label="lobby.ways">
      ${deploy('quick-go', 'tab.quick', L('quick.tag'), 'quick.about')}
      ${line('quick', serverChip('quick-server'))}
      <button type="button" class="way" id="invite-go" disabled><b>${t('lobby.invite')}</b><span class="ig-goal" id="invite-goal"></span></button>
      <button type="button" class="way" id="tab-start" data-tab="start" aria-controls="view-start">${L('tab.start', 'b')}</button>
      <button type="button" class="way" id="tab-join" data-tab="join" aria-controls="view-join">${L('tab.join', 'b')}</button>
      <button type="button" class="way" id="open-solo" aria-haspopup="dialog" aria-expanded="false" aria-controls="solo-pop">${L('lobby.solo', 'b')}</button>
      <button type="button" class="way" id="go-range" title="${t('lobby.rangeHint')}" data-i18n-title="lobby.rangeHint">${L('lobby.sub.range', 'b')}</button>
    </nav>
    ${CRAZYGAMES ? '' : '<p class="clickwrap" id="clickwrap"></p>'}
    <div class="unreachable" id="unreachable" hidden>
      <div class="unreachable-say" role="status" aria-live="polite">
        <b class="unreachable-head"><span class="conn down"><i></i></span><span id="unreachable-title"></span></b>
        <p id="unreachable-body"></p>
      </div>
      <button type="button" class="sub unreachable-retry" id="unreachable-retry"></button>
    </div>
    <p class="unavailable" id="online-off"></p>
    <div class="status" id="status" role="status"></div>
  </section>
  <section class="page">
    <div class="view" id="view-start" aria-labelledby="start-title" hidden>
      <h2 class="page-head" id="start-title">${L('tab.start')}</h2>
      <div class="filters" role="group" aria-label="${t('tab.start')}" data-i18n-aria-label="tab.start">
        ${field('start.field.mode', choice('smodes', 'smode', [['elimination', modeTag('elimination')], ['sabotage', modeTag('sabotage')]], 'start.field.mode'))}
        ${field('lobby.field.size', choice2('ssizes', 'ssize', sizeItems(), 'lobby.roomSize', 'sizes'))}
        ${field('lobby.field.map', `<div class="mapline">
          <div class="map-grid" id="map-grid" role="group" aria-label="${t('lobby.field.map')}" data-i18n-aria-label="lobby.field.map"></div>
          <p class="notice" id="map-notice" role="status"></p>
        </div>`)}
        ${field('start.field.visibility', choice2('svis', 'svis', [['public', L('start.public'), L('start.publicSub')], ['private', L('start.private'), L('start.privateSub')]], 'start.field.visibility'))}
        ${field('lobby.field.bots', choice2('sbots', 'sbots', [['on', L('start.botsOn'), L('lobby.bots.on')], ['off', L('start.botsOff'), L('lobby.bots.off')]], 'lobby.field.bots'))}
      </div>
      ${deploy('start-go', 'start.go', '<span id="start-summary"></span>')}
      ${line('start')}
    </div>

    <div class="view" id="view-join" aria-labelledby="join-title" hidden>
      <h2 class="page-head" id="join-title">${L('tab.join')}<span class="count" id="rooms-count"></span></h2>
      <div class="filters join-filters">
        ${field('lobby.field.size', choice('jsizes', 'jsize', [['', L('join.all')], ...SIZES.map(s => [s.id, s.label] as [string, string])], 'lobby.roomSize'))}
        ${field('lobby.field.mode', choice('jmodes', 'jmode', [['', L('join.all')], ['elimination', `<span class="mtag">[E]</span><span class="jname"> ${L('mode.elimination')}</span>`], ['sabotage', `<span class="mtag">[S]</span><span class="jname"> ${L('mode.sabotage')}</span>`]], 'lobby.field.mode'))}
      </div>
      <section class="browser" id="browser" aria-labelledby="join-title">
        <div class="browser-head"><b id="rooms-title" data-i18n="lobby.liveRooms">${t('lobby.liveRooms')}</b>${serverChip('rooms-server')}</div>
        <div class="browser-rows" id="rooms" role="list"></div>
        <div class="browser-foot" id="rooms-foot"></div>
      </section>
      <div class="code-row">
        <label class="label" for="roomcode" data-i18n="join.code">${t('join.code')}</label>
        <div class="code-box" title="${t('lobby.codeHint')}" data-i18n-title="lobby.codeHint">
          <span class="hash" aria-hidden="true">#</span>
          <input type="text" id="roomcode" maxlength="4" autocomplete="off" spellcheck="false" placeholder="${t('lobby.codeShort')}" data-i18n-placeholder="lobby.codeShort" aria-label="${t('lobby.roomCode')}" data-i18n-aria-label="lobby.roomCode">
          <button type="button" class="code-go" id="join-go" disabled>${t('common.join')}</button>
        </div>
      </div>
    </div>
  </section>
  <section class="news" id="news" hidden></section>
  <footer class="site-links" aria-label="${t('lobby.siteLinks')}" data-i18n-aria-label="lobby.siteLinks">
    ${CRAZYGAMES ? '' : `<a href="${REPO_URL}" target="_blank" rel="noopener" title="${t('lobby.openSourceTitle')}" data-i18n-title="lobby.openSourceTitle">${GITHUB}${L('lobby.openSource')}</a>
    <span class="dot" aria-hidden="true">·</span>
    <a href="${aboutHref()}" id="about-link">${L('lobby.about')}</a>
    <span class="dot" aria-hidden="true">·</span>`}
    <a href="${privacyHref()}" id="privacy-link"${CRAZYGAMES ? ' target="_blank" rel="noopener"' : ''}>${L('lobby.privacy')}</a>
  </footer>
  ${pop('profile-pop', 'lobby.profile', `<label class="callsign">${L('lobby.callsign', 'span', 'class="label"')}<input type="text" id="callsign" maxlength="16" autocomplete="off" spellcheck="false"></label>
    <div class="prog" id="prog"></div>
    <div class="field">${L('lobby.team', 'span', 'class="label"')}${choice('teams', 'team', [['auto', L('lobby.auto')], ['0', L('team.0', 'span', 'class="swat"')], ['1', L('team.1', 'span', 'class="militia"')]], 'lobby.team')}</div>
    <div class="field">${L('set.server', 'span', 'class="label"')}${serverChip('profile-server')}</div>`)}
  ${pop('solo-pop', 'lobby.solo', `<div class="pop-head"><b>${L('lobby.solo')}</b><small class="rules" id="solo-rules"></small></div>
    <div class="field">${L('start.field.mode', 'span', 'class="label"')}${choice('solo-modes', 'smode', [['elimination', modeTag('elimination')], ['sabotage', modeTag('sabotage')]], 'start.field.mode')}</div>
    <div class="field">${L('lobby.field.size', 'span', 'class="label"')}${choice('solo-sizes', 'ssize', SIZES.map(s => [s.id, s.label] as [string, string]), 'lobby.roomSize')}</div>
    <div class="field">${L('lobby.field.map', 'span', 'class="label"')}<div class="map-grid" id="solo-maps" role="group" aria-label="${t('lobby.field.map')}" data-i18n-aria-label="lobby.field.map"></div></div>
    <div class="field">${L('lobby.field.skill', 'span', 'class="label"')}${choice('skills', 'skill', [['0.25', L('lobby.skill.recruit')], ['0.45', L('lobby.skill.veteran')], ['0.75', L('lobby.skill.elite')]], 'lobby.field.skill')}</div>
    <button type="button" class="go" id="solo-go">${t('lobby.startMatch')}</button>${L('lobby.botsHint', 'p', 'class="hint"')}`)}`;
app.appendChild(menu);

const waitOverlay = document.createElement('div');
waitOverlay.id = 'lobby-wait-overlay';
waitOverlay.style.cssText = 'position:fixed;inset:0;background:#0f172a;z-index:99999;display:none;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px;padding-top:40px;padding-bottom:120px;font-family:sans-serif;text-align:center;color:#fff;overflow-y:auto;';
waitOverlay.innerHTML = `
    <h2 style="color:#14b8a6;font-size:28px;margin-bottom:20px;">جاري البحث عن خصم<br><span style="font-size:20px;">(Searching for opponent...)</span></h2>
    <div style="width:60px;height:60px;border:6px solid rgba(20,184,166,0.3);border-top-color:#14b8a6;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:40px;"></div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    <button id="wait-cancel" style="padding:15px 60px;background:#ef4444;border:none;border-radius:10px;font-size:20px;cursor:pointer;color:#fff;font-weight:bold;">إلغاء (Cancel)</button>
`;
document.body.appendChild(waitOverlay);

const privateOverlay = document.createElement('div');
privateOverlay.id = 'lobby-private-overlay';
privateOverlay.style.cssText = 'position:fixed;inset:0;background:#0f172a;z-index:99999;display:none;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px;padding-top:40px;padding-bottom:120px;font-family:sans-serif;color:#fff;overflow-y:auto;';
privateOverlay.innerHTML = `
    <div style="width:100%;max-width:600px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div style="background:#1e293b;color:#14b8a6;padding:8px 16px;border-radius:20px;border:1px solid #14b8a6;font-size:16px;font-weight:bold;">Code: <span id="p-top-code">----</span></div>
        <button id="p-cancel" style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;">مغادرة اللعبة ←</button>
    </div>
    <div style="width:100%;max-width:600px;background:#1e293b;border:1px solid #334155;border-radius:20px;padding:25px;display:flex;flex-direction:column;align-items:center; position: relative;">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;background:#0f172a;padding:15px;border-radius:15px;">
            <div style="text-align:center;width:30%;"><div style="color:#f59e0b;font-weight:bold;font-size:18px;">(O) ...</div><div style="font-size:40px;color:#f59e0b;">0</div></div>
            <div style="text-align:center;width:40%;"><div style="background:#334155;padding:4px 12px;border-radius:15px;font-size:12px;color:#cbd5e1;">مباراة مجانية</div><div style="font-size:12px;color:#94a3b8;margin-top:5px;">أول من يجمع 5</div></div>
            <div style="text-align:center;width:30%;"><div id="p-name" style="color:#14b8a6;font-weight:bold;font-size:18px;">Name (X)</div><div style="font-size:40px;color:#14b8a6;">0</div></div>
        </div>
        <div style="margin: 20px 0;"><svg viewBox="0 0 24 24" width="48" height="48" stroke="#14b8a6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></div>
        <div style="color:#14b8a6;font-size:20px;margin-bottom:15px;">جاري البحث عن خصم حقيقي...</div>
        <div style="background:#0f172a;border:1px solid #14b8a6;border-radius:10px;padding:15px 40px;font-size:36px;letter-spacing:6px;color:#fff;margin-bottom:10px;" id="p-center-code">----</div>
                <!-- زر إرسال الكود (بدلاً من كلمة كود الغرفة) -->
                <button id="btn-share-code" style="background:#14b8a6; color:#fff; border:none; padding:12px 30px; border-radius:8px; font-size:16px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom: 20px; width: 100%; max-width: 250px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            إرسال الكود للدردشة
        </button>
        <!-- زر إرسال الكود -->
        
        <!-- نافذة الدردشة المصغرة (مخفية افتراضياً) -->
        <div id="game-chat-popup" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:#1e293b; border-radius:20px; z-index:10; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; padding:15px; border-bottom:1px solid #334155; background:#0f172a; border-radius:20px 20px 0 0;">
                <div style="display:flex; gap:15px;">
                    <button id="tab-public" style="background:none;border:none;color:#14b8a6;font-weight:bold;font-size:16px;cursor:pointer;">العام</button>
                    <button id="tab-private" style="background:none;border:none;color:#94a3b8;font-weight:bold;font-size:16px;cursor:pointer;">الخاص</button>
                </div>
                <button id="btn-close-chat" style="background:none;border:none;color:#ef4444;font-size:20px;cursor:pointer;">✖</button>
            </div>
            
            <!-- محتوى العام -->
            <div id="chat-public-view" style="flex:1; padding:15px; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
                <div style="text-align:center; color:#94a3b8; font-size:12px; margin-top:20px;">جاري تحميل الرسائل...</div>
            </div>
            
            <!-- محتوى الخاص (الأصدقاء) -->
            <div id="chat-private-view" style="flex:1; padding:15px; overflow-y:auto; display:none; flex-direction:column; gap:10px;">
                <div style="text-align:center; color:#94a3b8; font-size:12px; margin-top:20px;">جاري تحميل الأصدقاء...</div>
            </div>

            <!-- مربع الكتابة -->
            <div style="padding:10px; border-top:1px solid #334155; display:flex; gap:10px;">
                <input type="text" id="chat-input" placeholder="اكتب رسالة..." style="flex:1; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px; outline:none;">
                <button id="btn-send-msg" style="background:#14b8a6; border:none; color:#fff; padding:10px 15px; border-radius:8px; cursor:pointer;">إرسال</button>
            </div>
        </div>
    </div>
`;
document.body.appendChild(privateOverlay);
// --- كود تشغيل دردشة اللعبة ---
const btnShareCode = document.getElementById('btn-share-code');
const gameChatPopup = document.getElementById('game-chat-popup');
const btnCloseChat = document.getElementById('btn-close-chat');
const tabPublic = document.getElementById('tab-public');
const tabPrivate = document.getElementById('tab-private');
const chatPublicView = document.getElementById('chat-public-view');
const chatPrivateView = document.getElementById('chat-private-view');
// =========================================================
// كود جلب البيانات من Supabase للدردشة المصغرة
// =========================================================
const sbUrl = 'https://kirsjemjkstvnuqpwian.supabase.co';
const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpcnNqZW1qa3N0dm51cXB3aWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTI0OTMsImV4cCI6MjEwNzcyODQ5M30.him1fOnfpPlCg6DC7dqeVRsr_aOYCmRQ3FpGqK_rygA';

const currentUserEmail = new URLSearchParams(window.location.search).get('email') || '';
const currentRoom = new URLSearchParams(window.location.search).get('room') || '';

// دالة مساعدة لجلب البيانات
async function sbFetch(path: string, options: any = {}) {
    const res = await fetch(`${sbUrl}/rest/v1/${path}`, {
        ...options,
        headers: {
            'apikey': sbKey,
            'Authorization': `Bearer ${sbKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
            ...options.headers
        }
    });
    if (!res.ok) throw new Error('Fetch error');
    if (options.method === 'POST' || options.method === 'PATCH') return null;
    return res.json();
}

// 1. جلب الدردشة العامة
async function loadPublicChat() {
    if (!chatPublicView) return;
    try {
        const data = await sbFetch('public_chat?select=*&order=created_at.desc&limit=20');
        if (data && data.length > 0) {
            chatPublicView.innerHTML = data.reverse().map((msg: any) => `
                <div style="margin-bottom: 8px; display: flex; flex-direction: column;">
                    <span style="color:#14b8a6; font-size:11px; font-weight:bold;">${msg.user_email ? msg.user_email.split('@')[0] : 'Player'}</span>
                    <span style="color:#fff; font-size:14px; background:#334155; padding:5px 10px; border-radius:8px; display:inline-block; align-self:flex-start; margin-top:2px;">${msg.message}</span>
                </div>
            `).join('');
        } else {
            chatPublicView.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:12px; margin-top:20px;">لا توجد رسائل عامة.</div>';
        }
    } catch (e) { console.error(e); }
}

// 2. جلب قائمة الأصدقاء (الخاص)
async function loadPrivateFriends() {
    if (!chatPrivateView || !currentUserEmail) return;
    try {
        const data = await sbFetch(`chat_requests?or=(sender_email.eq.${currentUserEmail},receiver_email.eq.${currentUserEmail})&status=eq.accepted`);
        if (data && data.length > 0) {
            chatPrivateView.innerHTML = data.map((req: any) => {
                const friendEmail = req.sender_email === currentUserEmail ? req.receiver_email : req.sender_email;
                const friendName = friendEmail.split('@')[0];
                return `
                <div style="display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #334155; cursor:pointer;" class="friend-item" data-email="${friendEmail}">
                    <div style="background:#334155; width:36px; height:36px; border-radius:50%; display:flex; justify-content:center; align-items:center; color:#14b8a6; font-weight:bold;">${friendName.charAt(0).toUpperCase()}</div>
                    <div style="color:#fff; font-size:15px;">${friendName}</div>
                    <div style="margin-left:auto; color:#14b8a6; font-size:12px;">إرسال الكود ←</div>
                </div>
                `;
            }).join('');

            // إضافة حدث الضغط على كل صديق لإرسال الكود
            chatPrivateView.querySelectorAll('.friend-item').forEach(item => {
                item.addEventListener('click', () => {
                    const friendEmail = item.getAttribute('data-email');
                    sendCodeToFriend(friendEmail);
                });
            });
        } else {
            chatPrivateView.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:12px; margin-top:20px;">لا يوجد أصدقاء مضافون.</div>';
        }
    } catch (e) { console.error(e); }
}

// 3. إرسال الكود للصديق
async function sendCodeToFriend(friendEmail: string | null) {
    if (!currentRoom || !currentUserEmail || !friendEmail) return;
    try {
        await sbFetch('private_messages', {
            method: 'POST',
            body: JSON.stringify({
                sender_email: currentUserEmail,
                receiver_email: friendEmail,
                message: `انضم إلي! كود الغرفة: ${currentRoom}`
            })
        });
        alert(`تم إرسال الكود (${currentRoom}) إلى صديقك بنجاح!`);
        if (gameChatPopup) gameChatPopup.style.display = 'none'; // إغلاق النافذة
    } catch (e) {
        alert('حدث خطأ أثناء إرسال الكود.');
        console.error(e);
    }
}

// 4. إرسال رسالة في الدردشة العامة
const btnSendMsg = document.getElementById('btn-send-msg');
const chatInput = document.getElementById('chat-input') as HTMLInputElement;

if (btnSendMsg && chatInput) {
    btnSendMsg.addEventListener('click', async () => {
        const msg = chatInput.value.trim();
        if (!msg || !currentUserEmail) return;
        
        chatInput.value = ''; // مسح الحقل
        
        try {
            await sbFetch('public_chat', {
                method: 'POST',
                body: JSON.stringify({
                    user_email: currentUserEmail,
                    username: currentUserEmail.split('@')[0],
                    message: msg
                })
            });
            loadPublicChat(); // تحديث الدردشة
        } catch (e) { console.error(e); }
    });
}

// ربط زر فتح الدردشة بجلب البيانات
if (btnShareCode) {
    btnShareCode.addEventListener('click', () => {
        loadPublicChat();
        loadPrivateFriends();
    });
}
// =========================================================

if (btnShareCode && gameChatPopup) {
    btnShareCode.addEventListener('click', () => {
        gameChatPopup.style.display = 'flex';
    });
}
if (btnCloseChat && gameChatPopup) {
    btnCloseChat.addEventListener('click', () => {
        gameChatPopup.style.display = 'none';
    });
}
if (tabPublic && tabPrivate && chatPublicView && chatPrivateView) {
    tabPublic.addEventListener('click', () => {
        tabPublic.style.color = '#14b8a6';
        tabPrivate.style.color = '#94a3b8';
        chatPublicView.style.display = 'flex';
        chatPrivateView.style.display = 'none';
    });
    tabPrivate.addEventListener('click', () => {
        tabPrivate.style.color = '#14b8a6';
        tabPublic.style.color = '#94a3b8';
        chatPrivateView.style.display = 'flex';
        chatPublicView.style.display = 'none';
    });
}
menu.style.display = 'flex';
document.body.classList.add('menu-open');
renderClickwrap();

const applyTouchClass = () => document.body.classList.toggle('touch', touchActive());
applyTouchClass();
onTouchLayout(applyTouchClass);
const rotate = document.createElement('div');
rotate.id = 'rotate';
rotate.setAttribute('role', 'alert');
const renderRotate = () => {
  rotate.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="15" y="6" width="18" height="36" rx="3"/><path d="M21 37h6"/></svg><b>${esc(t('rot.title'))}</b>`;
};
renderRotate();
document.body.appendChild(rotate);

onSideways(on => {
  document.getElementById('sideways-tip')?.remove();
  if (!on) return;
  const tip = document.createElement('div');
  tip.id = 'sideways-tip';
  tip.setAttribute('role', 'status');
  tip.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="15" y="6" width="18" height="36" rx="3"/><path d="M21 37h6"/></svg><span>${esc(t('rot.sideways'))}</span>`;
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 4600);
});
watchSideways();
if (!params.has('bench') && !CRAZYGAMES) new InstallBanner(menu);
mountProgressBadge(menu.querySelector<HTMLElement>('#prog')!);
onProgress(() => renderProfile());
if (CRAZYGAMES) { onProgress(() => crazySave()); setInterval(() => crazySave(), 30000); addEventListener('pagehide', () => crazySave()); }
mountNews(menu.querySelector<HTMLElement>('#news')!);
if (CRAZYGAMES && !params.has('bench')) mountPrivacyNotice(menu, privacyHref);
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => menu.querySelector<T>(sel)!;
const select = (group: string, attr: string, value: string) => menu.querySelectorAll<HTMLButtonElement>(`#${group} [data-${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === value)));

const MODE_ALIASES: Record<string, string> = { solo: 'offline', practice: 'lab' };
let startMode = params.get('mode') ?? store.get('mode', online.ok ? 'online' : 'offline');
startMode = MODE_ALIASES[startMode] ?? startMode;
const isTab = (v: string | null): v is Tab => !!v && (TABS as readonly string[]).includes(v);
let tab: Tab = isTab(params.get('tab')) ? params.get('tab') as Tab : 'quick';

let size: SizeId = 'duel';
let mode: Mode = 'elimination';
let map = '';

let isPublic = store.get('start.public', '1') !== '0';
let bots = false;

if (map && (!maps.some(m => m.id === map) || (RETIRED_MAPS.has(map) && !params.get('map')))) map = '';
if (params.get('map') && map) {
  if (!mapsFor(sizeOf(size).perTeam).includes(map) && !params.get('size')) size = SIZES.find(s => mapsFor(s.perTeam).includes(map))?.id ?? size;
  if ((mode as any) === 'sabotage' && !hasSites(map)) mode = 'elimination';
}
let joinSize: SizeId | '' = '';
let joinMode: Mode | '' = '';
let team = params.get('team') ?? store.get('team', 'auto');
let skill = params.get('skill') ?? store.get('skill', '0.45');
let quality = (params.get('quality') ?? store.get('quality', '')) as keyof typeof QUALITY;
if (!QUALITY[quality]) quality = 'high';
const benchMode = params.has('bench');
if (benchMode) { mode = 'elimination'; size = sizeOf(params.get('size') ?? 'squad').id; }
const callsign = $<HTMLInputElement>('#callsign');
callsign.value = params.get('name') ?? store.get('name', t('lobby.defaultName', { n: Math.floor(Math.random() * 900 + 100) }));
const roomCode = $<HTMLInputElement>('#roomcode');
roomCode.value = cleanCode(params.get('room') ?? '');
if (roomCode.value && !params.get('tab')) tab = 'join';
const status = $('#status');
if (!online.ok) {
  menu.classList.add('no-server');
  $('#online-off').dataset.i18n = 'lobby.noServer';
  $('#online-off').textContent = t('lobby.noServer');
}

const perTeam = () => sizeOf(size).perTeam;
const validMaps = () => mapsFor(perTeam(), mode);
const mapOk = (id: string) => validMaps().includes(id);
const firstMap = () => FEATURED.find(mapOk) ?? validMaps()[0];
if (!mapOk(map)) map = firstMap();

interface Queued { action: Action; room: number; retried: boolean }
let rooms: PublicRoom[] = [];
const lobbyConn = new ConnectDriver<Queued, RoomsLink>({
  ping: signal => { const url = server && pingUrl(server.uri); return url ? hostAnswers(url, signal) : Promise.resolve(false); },
  connect: lost => watchRooms(list => { rooms = list; refresh(); }, lost),
}, s => onLobbyConn(s), q => run(q.action, q.room, q.retried));
const phase = () => lobbyConn.state.phase;
let connKey = '';
let unreachableReported = false;
let wasReady = false;
function onLobbyConn(s: ConnectState<Queued>) {
  pings.setActive(pingOn && s.phase === 'ready');
  const key = `${s.phase}|${s.queued?.action ?? ''}`;
  if (key === connKey) { renderQuick(); renderStart(); return; }
  const [was, queued] = connKey.split('|');
  connKey = key;
  if (s.phase !== was && s.phase !== 'ready' && s.phase !== 'idle') rooms = [];
  if (s.phase === 'ready' && was !== 'ready' && (s.slow || s.failures > 0)) {
    const tm = lobbyConn.timings;
    track('connect_slow', {
      seconds: connectSeconds(s, performance.now()), queued: !!queued, failures: s.failures, reconnect: wasReady,
      ...(tm.pingMs !== undefined ? { ping_ms: tm.pingMs, ping_ok: !!tm.pingOk } : {}),
      ...(tm.connectMs !== undefined ? { connect_ms: tm.connectMs } : {}), ...(tm.importMs !== undefined ? { import_ms: tm.importMs } : {}),
    });
  }
  if (s.phase === 'ready') wasReady = true;
  if (s.phase === 'unreachable' && !game) freeMouse();
  if (s.phase === 'unreachable' && !unreachableReported) { unreachableReported = true; track('error_shown', { where: 'rooms', message: 'server unreachable' }); }
  refresh();
}
function watchLobbyRooms() {
  if (!online.ok || benchMode) { refresh(); return; }
  if (followServer()) lobbyConn.stop();
  lobbyConn.start();
  refresh();
}
const serverProps = () => ({
  online_db: online.ok ? server?.database ?? '' : '', server_host: online.ok && server ? serverHost(server.uri) : '', server_choice: server?.id ?? '',
});
function followServer() {
  const next = currentServer();
  if (next === server) return false;
  pings.untrack(server?.uri);
  server = next;
  rooms = [];
  if (pingOn) pings.track(server?.uri);
  setSuper(serverProps());
  return true;
}
onServer(() => {
  if (game || starting || !inMenu) return;
  const watching = phase() !== 'idle';
  if (!followServer()) return;
  lobbyConn.stop();
  if (watching) watchLobbyRooms(); else refresh();
});
function unwatchRooms() {
  lobbyConn.stop();
  pings.setActive(false);
}
const HIDDEN_LOBBY_MS = 5 * 60_000;
let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
document.addEventListener('visibilitychange', () => {
  clearTimeout(hiddenTimer);
  if (!online.ok || benchMode || !inMenu) return;
  if (document.visibilityState === 'hidden') {
    hiddenTimer = setTimeout(() => { if (inMenu && document.visibilityState === 'hidden' && !lobbyConn.state.queued) unwatchRooms(); }, HIDDEN_LOBBY_MS);
  } else if (phase() === 'idle') watchLobbyRooms();
});

const pings = new PingMonitor(() => renderPings());
const pingOn = online.ok && !benchMode && pingAllowed(location.search);
if (pingOn) pings.track(server?.uri);
const choicePings = new PingMonitor(() => options.refreshPings());
if (pingOn && choosable) for (const s of gameServerList()) choicePings.track(s.uri);
function pingHtml(uri: string | undefined) {
  const ms = pings.get(uri);
  return ms === undefined ? '—' : `${ms}<small> ms</small>`;
}
const pingClass = (uri: string | undefined) => { const ms = pings.get(uri); return `ping${ms === undefined ? '' : ` ${pingTone(ms)}`}`; };
const serverName = (uri: string) => server && uri === server.uri ? t(server.label) : serverRegion(uri);
const pingTitle = (uri: string | undefined) => uri ? t('server.pingTitle', { server: serverName(uri), n: PING_WINDOW }) : '';
function chipHtml(uri: string) {
  const ms = pings.get(uri), p = phase();
  const value = p === 'unreachable' ? `<span class="ping">${esc(t('connect.downChip'))}</span>`
    : `<span class="${pingClass(uri)}">${ms === undefined ? '—' : esc(t('server.ms', { n: ms }))}</span>`;
  return `<span class="server-word">${esc(t('server.label'))} · </span>${esc(serverName(uri))} · ${value}${choosable ? CARET : ''}`;
}
function renderPings() {
  menu.querySelectorAll<HTMLElement>('#rooms [data-ping], #quick-rooms [data-ping]').forEach(el => { el.className = pingClass(el.dataset.ping); el.innerHTML = pingHtml(el.dataset.ping); });
  const live = pingOn && !!server && phase() === 'ready';
  const chips = pingOn && !!server && phase() !== 'idle';
  for (const chip of [$('#rooms-server'), $('#quick-server'), $('#profile-server')]) {
    chip.hidden = !chips;
    if (!chips || !server) continue;
    const change = choosable ? t('server.change') : '';
    chip.title = [live ? pingTitle(server.uri) : '', change].filter(Boolean).join(' · ');
    const html = chipHtml(server.uri);
    if (chip.dataset.html !== html) { chip.dataset.html = html; chip.innerHTML = html; }
  }
  const lines: [string, string | undefined][] = [['#start-ping', server?.uri]];
  for (const [sel, uri] of lines) {
    const el = $(sel), ms = pings.get(uri);
    el.hidden = !live;
    el.className = pingClass(uri);
    el.title = pingTitle(uri);
    el.textContent = ms === undefined ? t('server.measuring') : t('server.ping', { ms: t('server.ms', { n: ms }) });
  }
}

const roomStatus = (r: PublicRoom) => r.phase === 'warmup' ? t('lobby.warmup') : r.phase === 'ended' ? t('lobby.matchOver') : t('lobby.round', { n: r.round });
const players = (n: number, max: number) => t('common.players', { n, max });
const modeLabel = (m: Mode) => `[${MODE_TAGS[m]}] ${modeName(m)}`;
const quickTarget = () => pickAnyRoom(rooms, r => pings.get(r.server));
const listed = (list: readonly PublicRoom[]) => {
  const ping = (r: PublicRoom) => pings.get(r.server);
  return [...listOrder(list.filter(r => !r.private), ping), ...listOrder(list.filter(r => r.private), ping)];
};
const shownRooms = () => listed(rooms.filter(r => (!joinSize || r.size === sizeOf(joinSize).perTeam) && (!joinMode || r.mode === joinMode)));
function liveByMap() {
  const counts = new Map<string, number>();
  for (const r of rooms) if (r.size === perTeam()) counts.set(r.mapId, (counts.get(r.mapId) ?? 0) + r.humans);
  return counts;
}
const rulesText = () => [sizeOf(size).label, modeName(mode), mapName(map)].join(' · ');
const CJK_RE = /[\u3400-\u9fff]/;
function renderBrand() {
  const name = t('brand.name'), alt = t('brand.alt'), logo = $('#logo');
  if (logo.dataset.name === name) return;
  logo.dataset.name = name;
  const split = (s: string) => CJK_RE.test(s) ? [s.slice(0, 2), s.slice(2)] : s.split(/:\s*/);
  const [a, b = ''] = split(name);
  const cjk = (s: string) => CJK_RE.test(s) ? ' lang="zh-TW"' : ' lang="en"';
  logo.innerHTML = `<span class="logo-name${CJK_RE.test(name) ? ' cjk' : ''}"${cjk(name)}>${esc(a)}<em>${esc(b)}</em></span>
    <small class="logo-sub"><span class="logo-alt${CJK_RE.test(alt) ? ' cjk' : ''}"${cjk(alt)}>${esc(alt)}</span><i aria-hidden="true"></i><span>${esc(t('lobby.title'))} <b>${esc(t('lobby.titleVs'))}</b></span></small>`;
  logo.setAttribute('aria-label', `${name} · ${alt}`);
}

let ready = false;
let starting: Action | undefined;
let waitingLink: 'invite' | 'challenge' | undefined;
let inviteStarting = false;
let loadFraction = -1;
let loadTrouble = false;
let joiningRoom = -1;
const loadingText = () => loadTrouble ? t('lobby.loadRetry') : loadFraction < 0 ? t('lobby.loading') : t('lobby.loadingPct', { n: (loadFraction * 100).toFixed(0) });

function renderTabs() {
  for (const id of TABS) {
    const on = id === tab;
    if (id === 'quick') continue;
    $(`#tab-${id}`).setAttribute('aria-current', on ? 'page' : 'false');
    $(`#view-${id}`).hidden = !on;
  }
  menu.dataset.tab = tab;
}
function renderProfile() {
  $('#profile-name').textContent = callsign.value.trim() || t('lobby.fallbackName');
  $('#profile-lv').textContent = t('prog.level', { n: levelOf(loadProgress().xp).level });
}

const queuedAction = () => lobbyConn.state.queued?.action;
function renderDeploy(btn: HTMLButtonElement, action: Action, busyText: string, enabled: boolean) {
  const label = btn.querySelector<HTMLElement>('.deploy-t')!;
  const queued = queuedAction() === action;
  const linked = action === 'quick' && waitingLink;
  label.textContent = !ready ? loadingText() : starting ? (starting === action ? busyText : t(label.dataset.label as Key)) : linked ? t(waitingLink === 'invite' ? 'invite.joinFriend' : 'chal.accept') : queued ? t('connect.waiting') : t(label.dataset.label as Key);
  btn.disabled = !ready || !!starting || (!enabled && !linked);
  btn.classList.toggle('queued', queued && !starting);
}
function renderLine(id: string, action: Action, liveText: string) {
  const el = $(`#${id}-line`);
  el.hidden = !online.ok;
  if (!online.ok) return;
  const p = phase();
  const [state, text] = p === 'ready' ? ['live', liveText]
    : p === 'unreachable' ? ['down', t('connect.downHead')]
    : ['wait', queuedAction() === action ? t('connect.queued') : t('lobby.connecting')];
  el.querySelector('.conn')!.className = `conn ${state}`;
  el.title = p === 'ready' ? t('lobby.liveTitle') : '';
  setText($(`#${id}-hint`), text);
}
function setText(el: HTMLElement, text: string) { if (el.textContent !== text) el.textContent = text; }
function renderUnreachable() {
  const box = $('#unreachable');
  box.hidden = !online.ok || phase() !== 'unreachable';
  if (box.hidden) return;
  setText($('#unreachable-title'), t('connect.downHead'));
  setText($('#unreachable-body'), t('connect.downBody'));
  setText($('#unreachable-retry'), t('connect.retry'));
}
function renderInvite() {
  const btn = $<HTMLButtonElement>('#invite-go');
  btn.hidden = !online.ok;
  btn.disabled = !ready || !!starting;
  btn.querySelector('b')!.textContent = inviteStarting && starting ? t('invite.opening') : t('lobby.invite');
  btn.title = t('invite.sub');
  const have = invitedFriends();
  const goal = $('#invite-goal');
  goal.textContent = have >= GOLD_INVITES ? t('invite.goalDone') : t('invite.goal', { have, n: GOLD_INVITES });
  goal.classList.toggle('done', have >= GOLD_INVITES);
}
function renderQuick() {
  renderDeploy($<HTMLButtonElement>('#quick-go'), 'quick', t('lobby.joining'), online.ok);
  renderInvite();
  const target = quickTarget();
  renderLine('quick', 'quick', target ? t('quick.joins', { map: mapName(target.mapId), size: sizeLabel(target.size), n: target.humans, max: target.size * 2 }) : t('quick.opens'));
}
function renderStart() {
  select('smodes', 'smode', mode);
  select('ssizes', 'ssize', size);
  select('svis', 'svis', isPublic ? 'public' : 'private');
  select('sbots', 'sbots', bots ? 'on' : 'off');
  renderMapGrid();
  renderDeploy($<HTMLButtonElement>('#start-go'), 'start', t('lobby.starting'), online.ok);
  $('#start-summary').textContent = ready ? `${sizeOf(size).label} · ${t(isPublic ? 'start.public' : 'start.private')}` : '';
  renderLine('start', 'start', t(isPublic ? 'start.hintPublic' : 'start.hintPrivate'));
}
function roomTotals() {
  const humans = rooms.reduce((n, r) => n + r.humans, 0);
  return phase() === 'ready' && rooms.length ? `<span class="conn live"><i></i>${plural('lobby.roomCount', rooms.length)} · ${plural('lobby.playerCount', humans)}</span>` : '';
}
function renderRoomRows(list: HTMLElement, shown: PublicRoom[], none: string, target?: PublicRoom) {
  for (const r of shown) if (pingOn) pings.track(r.server);
  const focused = (document.activeElement as HTMLElement | null)?.closest?.('[data-joinroom]') as HTMLElement | null;
  const focusRoom = focused && list.contains(focused) ? focused.dataset.joinroom : undefined;
  if (!shown.length) {
    const p = phase();
    const html = !online.ok ? `<div class="empty">${esc(t('lobby.noServer'))}</div>`
      : p === 'unreachable' ? `<div class="empty"><p>${esc(t('connect.downHead'))}</p><button type="button" class="sub" data-unreachable-retry>${esc(t('connect.retry'))}</button></div>`
      : p !== 'ready' ? `<div class="empty">${esc(t('lobby.connecting'))}</div>`
      : none;
    if (list.dataset.html !== html) { list.dataset.html = html; list.innerHTML = html; }
    return;
  }
  list.dataset.html = '';
  list.innerHTML = shown.map(r => {
    const m = maps.find(x => x.id === r.mapId);
    const aria = t('lobby.roomAria', { map: mapName(r.mapId), mode: modeName(r.mode), size: sizeLabel(r.size), n: r.humans, max: r.size * 2, status: roomStatus(r) });
    const busy = !ready || !!starting || roomFull(r);
    const lock = r.fixedMap || r.fixedMode ? `<span class="fixed" title="${esc([r.fixedMap ? t('lobby.fixedMap') : '', r.fixedMode ? t('lobby.fixedMode') : ''].filter(Boolean).join(' · '))}">${LOCK}</span>` : '';
    const priv = r.private ? `<span class="priv">${LOCK}${esc(t('join.private'))}</span>` : '';
    const button = r.private
      ? `<button type="button" class="join" data-coderoom="${r.room}" aria-label="${esc(`${roomFull(r) ? t('common.full') : t('join.enterCode')} · ${t('join.private')} · ${aria}`)}"${busy ? ' disabled' : ''}>${starting === 'code' && joiningRoom === r.room ? t('lobby.joining') : roomFull(r) ? t('common.full') : t('join.enterCode')}</button>`
      : `<button type="button" class="join" data-joinroom="${r.room}" aria-label="${esc(`${roomFull(r) ? t('common.full') : t('common.join')} · ${aria}`)}"${busy ? ' disabled' : ''}>${starting === 'room' && joiningRoom === r.room ? t('lobby.joining') : roomFull(r) ? t('common.full') : t('common.join')}</button>`;
    return `<div class="room${roomFull(r) ? ' full' : ''}${r === target ? ' target' : ''}${r.private ? ' private' : ''}" role="listitem" data-room="${r.room}"${r.private ? ' data-private="1"' : ''} data-theme="${m?.theme ?? ''}">
      <span class="srv"><span class="srv-name"><b>${esc(mapName(r.mapId))}</b>${lock}${priv}</span><small class="state ${r.phase}">${esc(roomStatus(r))}${r.noBots ? ` · ${esc(t('join.noBots'))}` : ''}</small></span>
      <span class="mode" title="${esc(modeName(r.mode))}"><span class="mtag">[${MODE_TAGS[r.mode]}]</span><span class="mname"> ${esc(modeName(r.mode))}</span></span>
      <span class="size">${sizeLabel(r.size)}</span>
      <span class="players">${r.humans}/${r.size * 2}</span>
      <span class="${pingClass(r.server)}" data-ping="${esc(r.server)}" title="${esc(pingTitle(r.server))}">${pingHtml(r.server)}</span>
      ${button}
    </div>`;
  }).join('');
  if (focusRoom) list.querySelector<HTMLElement>(`[data-joinroom="${focusRoom}"]`)?.focus({ preventScroll: true });
}
function renderJoin() {
  select('jsizes', 'jsize', joinSize);
  select('jmodes', 'jmode', joinMode);
  const shown = shownRooms();
  $('#rooms-count').innerHTML = roomTotals();
  renderRoomRows($('#rooms'), shown, rooms.length
    ? `<div class="empty"><p>${esc(t('join.emptyFiltered'))}</p><button type="button" class="link" data-clear>${esc(t('lobby.clearFilters'))}</button></div>`
    : `<div class="empty"><p>${esc(t('join.empty'))}</p><div class="empty-go"><button type="button" class="sub" data-go="quick">${esc(t('tab.quick'))}</button><button type="button" class="sub" data-go="start">${esc(t('tab.start'))}</button></div></div>`);
  const foot = $('#rooms-foot');
  const hiddenRooms = rooms.length - shown.length;
  const html = shown.length && hiddenRooms
    ? `<span>${esc(plural('join.hidden', hiddenRooms))}</span><span class="dot" aria-hidden="true">·</span><button type="button" class="link" data-clear>${esc(t('lobby.clearFilters'))}</button>` : '';
  if (foot.innerHTML !== html) foot.innerHTML = html;
  const join = $<HTMLButtonElement>('#join-go');
  roomCode.disabled = !online.ok;
  join.disabled = !ready || !!starting || !online.ok || roomCode.value.length < 4;
  join.textContent = starting === 'code' || queuedAction() === 'code' ? '…' : t('common.join');
}
const shownMap = () => tab === 'start' ? map : tab === 'join' ? shownRooms()[0]?.mapId ?? map : quickTarget()?.mapId ?? map;

function renderOthers() {
  select('teams', 'team', team);
  select('skills', 'skill', skill);
  const offlineBusy = !ready || !!starting;
  const solo = $<HTMLButtonElement>('#solo-go'), range = $<HTMLButtonElement>('#go-range');
  solo.disabled = offlineBusy;
  solo.textContent = !ready ? loadingText() : starting === 'solo' ? t('lobby.starting') : t('lobby.startMatch');
  range.disabled = offlineBusy;
  $('#solo-rules').textContent = rulesText();
  select('solo-modes', 'smode', mode);
  select('solo-sizes', 'ssize', size);
  if (openPop?.id === 'solo-pop') renderMapGrid($('#solo-maps'));
}
function refresh() {
  renderBrand();
  renderProfile();
  renderTabs();
  renderUnreachable();
  renderQuick();
  renderStart();
  renderJoin();
  renderPings();
  renderOthers();
  showBackdrop();
}

let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function notice(text: string) {
  const el = $('#map-notice');
  el.textContent = text;
  menu.classList.toggle('noticing', !!text);
  clearTimeout(noticeTimer);
  if (text) noticeTimer = setTimeout(() => notice(''), 4500);
}
function checkMap(reason: 'size' | 'mode') {
  if (mapOk(map)) return;
  const was = mapName(map);
  map = firstMap();
  notice(reason === 'size' ? t('start.mapSwitchSize', { map: was, size: sizeOf(size).label, next: mapName(map) }) : t('start.mapSwitchMode', { map: was, next: mapName(map) }));
}
function saveForm() {
  if (benchMode) return;
  store.set('start.size', size); store.set('start.mode', mode); store.set('start.map', map);
  store.set('start.public', isPublic ? '1' : '0'); store.set('start.bots', bots ? 'on' : 'off');
}
const changed = () => { saveForm(); refresh(); };
function setTab(next: Tab, focus = false) {
  tab = next;
  closePop(false);
  refresh();
  if (focus) $(`#tab-${next}`).focus({ preventScroll: true });
}

const audio = new Audio();
const onClick = (attr: string, fn: (value: string, el: HTMLElement) => void) => menu.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>(`[data-${attr}]`);
  if (!el || el === menu || !menu.contains(el) || (el as HTMLButtonElement).disabled) return;
  fn(el.dataset[attr.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())]!, el);
  audio.ui();
});
onClick('tab', v => setTab(v as Tab));
onClick('go', v => setTab(v as Tab, true));
onClick('smode', v => { mode = v === 'sabotage' ? 'sabotage' : 'elimination'; checkMap('mode'); changed(); });
onClick('ssize', v => { size = sizeOf(v).id; checkMap('size'); changed(); });
onClick('svis', v => { isPublic = v !== 'private'; changed(); });
onClick('sbots', v => { bots = v !== 'off'; changed(); });
onClick('pick', v => { if (mapOk(v)) map = v; notice(''); changed(); });
onClick('jsize', v => { joinSize = SIZES.some(s => s.id === v) ? v as SizeId : ''; changed(); });
onClick('jmode', v => { joinMode = v === 'elimination' || v === 'sabotage' ? v : ''; changed(); });
onClick('clear', () => { joinSize = ''; joinMode = ''; changed(); });
onClick('team', v => { team = v; select('teams', 'team', team); });
onClick('skill', v => { skill = v; select('skills', 'skill', skill); });
onClick('joinroom', v => run('room', Number(v)));
onClick('coderoom', v => askRoomCode(Number(v)));
onClick('unreachable-retry', () => lobbyConn.retry());
$('#unreachable-retry').addEventListener('click', () => { audio.ui(); lobbyConn.retry(); });
roomCode.addEventListener('input', () => {
  const typed = roomCode.value;
  roomCode.value = cleanCode(typed).replace(/[ILO]/g, '');
  if (notCodeLetters(typed)) status.textContent = t('join.noLookalikes');
  renderJoin();
});
roomCode.addEventListener('focus', () => roomCode.select());
callsign.addEventListener('input', renderProfile);
function quickPressed() {
  if (waitingLink === 'invite') acceptInvite();
  else if (waitingLink === 'challenge') acceptChallenge();
  else {
    if (!online.ok || !ready || starting) return;
    size = params.get('size') === '6' ? 'squad' : 'duel';
    map = 'citadel';
    mode = 'elimination';
    isPublic = true;

    privateOverlay.style.display = 'flex';
    loadHilltopAd();
    let tries = 0;
        // إخفاء الكود وإظهار شاشة البحث
    const codeBox = document.getElementById('p-center-code');
    const codeLabel = codeBox?.nextElementSibling;
    const shareBtn = document.getElementById('btn-share-code');
    
    if (codeBox) codeBox.style.display = 'none';
    if (codeLabel) (codeLabel as HTMLElement).style.display = 'none';
    if (shareBtn) shareBtn.style.display = 'none';
    const checkRoom = setInterval(() => {
        const open = rooms.find(r =>
            !r.private && !roomFull(r) && r.size === 1 &&
            r.mode === 'elimination' && r.humans > 0 && r.phase !== 'ended');

        if (open) {
            clearInterval(checkRoom);
            privateOverlay.style.display = 'none';
            run('room', open.room); 
        } else {
            tries++;
            if (tries >= 4) {
                clearInterval(checkRoom);
                privateOverlay.style.display = 'none';
                run('quick'); 
            }
        }
    }, 1000);

    document.getElementById('p-cancel')!.onclick = () => {
        clearInterval(checkRoom);
        privateOverlay.style.display = 'none';
    };
  }
}

$('#quick-go').addEventListener('click', () => { audio.ui(); quickPressed(); });
$('#invite-go').addEventListener('click', () => { audio.ui(); openInviteRoom(); });

$('#start-go').addEventListener('click', () => { 
    audio.ui(); 
    if (!online.ok || !ready || starting) return;
    size = 'duel';
    map = 'citadel';
    mode = 'elimination';
    isPublic = false;
    run('start'); 
});

$('#go-range').addEventListener('click', () => { audio.ui(); run('range'); });
$('#join-go').addEventListener('click', () => { audio.ui(); run('code'); });
$('#solo-go').addEventListener('click', () => { audio.ui(); run('solo'); });
for (const id of ['#rooms']) $(id).addEventListener('dblclick', e => {
  const row = (e.target as HTMLElement).closest<HTMLElement>('.room');
  if (row) { if (row.dataset.private) askRoomCode(Number(row.dataset.room)); else run('room', Number(row.dataset.room)); }
});
function askRoomCode(room: number) {
  const r = rooms.find(x => x.room === room && x.private);
  if (!r || !ready || starting || roomFull(r)) return;
  ask({
    title: t('join.privateTitle'), why: t('join.privateWhy', { map: mapName(r.mapId), size: sizeLabel(r.size) }),
    label: t('lobby.roomCode'), placeholder: t('lobby.codeShort'), go: t('common.join'), close: t('cs.close'), maxLength: 4,
    attrs: 'autocomplete="off" autocapitalize="characters"', clean: cleanCode,
    check: code => code.length === 4 ? { ok: code } : { error: t('join.codeShort') },
    done: code => { roomCode.value = code; run('code', room); },
  });
}
$('#tabs').addEventListener('keydown', e => {
  const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
  if (!step) return;
  const items = Array.from($('#tabs').querySelectorAll<HTMLButtonElement>('button:not(:disabled):not(.server-chip)'));
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  items[(i + step + items.length) % items.length].focus();
});

let openPop: HTMLElement | undefined;
let popAnchor: HTMLElement | undefined;
function placePop() {
  if (!openPop || !popAnchor) return;
  const a = popAnchor.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, margin = 12;
  const p = openPop;
  if (vw <= 700) { p.classList.add('sheet'); p.style.left = p.style.top = ''; return; }
  p.classList.remove('sheet');
  const w = p.offsetWidth, h = p.offsetHeight;
  const left = Math.max(margin, Math.min(a.left, vw - w - margin));
  const below = a.bottom + 6, above = a.top - 6 - h;
  const side = $('#tabs').getBoundingClientRect().right + margin;
  const clampTop = (y: number) => Math.max(margin, Math.min(y, vh - h - margin));
  const [x, y] = popAnchor.closest('.ways') && side + w <= vw - margin ? [side, clampTop(a.top - 40)]
    : below + h <= vh - margin ? [left, below] : above >= margin ? [left, above]
    : side + w <= vw - margin ? [side, clampTop(a.top - 60)] : [left, clampTop(vh)];
  p.style.left = `${x}px`; p.style.top = `${y}px`;
}
function showPop(id: string, anchor: HTMLElement) {
  if (openPop?.id === id) { closePop(); return; }
  closePop(false);
  openPop = $(`#${id}`); popAnchor = anchor;
  openPop.hidden = false;
  anchor.setAttribute('aria-expanded', 'true');
  placePop();
  const first = openPop.querySelector<HTMLElement>('[aria-pressed="true"], [aria-current="true"]') ?? openPop.querySelector<HTMLElement>('button:not(:disabled)');
  first?.focus({ preventScroll: true });
}
function closePop(restore = true) {
  if (!openPop) return;
  openPop.hidden = true;
  popAnchor?.setAttribute('aria-expanded', 'false');
  if (restore && popAnchor && openPop.contains(document.activeElement)) popAnchor.focus({ preventScroll: true });
  openPop = undefined; popAnchor = undefined;
}
$('#open-solo').addEventListener('click', e => { audio.ui(); showPop('solo-pop', e.currentTarget as HTMLElement); renderMapGrid($('#solo-maps')); placePop(); });
$('#open-profile').addEventListener('click', e => { audio.ui(); showPop('profile-pop', e.currentTarget as HTMLElement); });
document.addEventListener('pointerdown', e => {
  if (!openPop) return;
  const target = e.target as Node;
  if (openPop.contains(target) || popAnchor?.contains(target)) return;
  closePop(false);
});
addEventListener('resize', placePop);
menu.addEventListener('scroll', placePop, true);
menu.addEventListener('focusout', e => {
  const next = e.relatedTarget as Node | null;
  if (openPop && next && !openPop.contains(next) && next !== popAnchor) closePop(false);
});

const thumbs = new Map<string, HTMLElement>();
function plan(id: string) {
  const c = document.createElement('canvas');
  c.width = 168; c.height = 96;
  drawMapThumb(c, id);
  return c;
}
function thumb(id: string, row: string) {
  const key = `${row}:${id}`;
  let el = thumbs.get(key);
  if (!el) {
    const img = document.createElement('img');
    img.loading = 'lazy'; img.decoding = 'async'; img.width = 480; img.height = 270;
    img.addEventListener('error', () => { const c = plan(id); thumbs.set(key, c); img.replaceWith(c); }, { once: true });
    img.src = assetUrl(`media/maps/${id}.webp`);
    thumbs.set(key, el = img);
  }
  if (el instanceof HTMLImageElement) el.alt = mapName(id);
  return el;
}
function renderMapGrid(grid = $('#map-grid')) {
  const live = liveByMap();
  const sites = (m: (typeof maps)[number]) => mode === 'sabotage' ? t(m.sites > 1 ? 'lobby.sitesAB' : m.sites ? 'lobby.siteA' : 'lobby.noSites') : '';
  const fits = mapsFor(perTeam());
  const key = `${fits.join()}|${map}|${mode}|${[...live].join()}|${isZh()}`;
  if (grid.dataset.key === key) return;
  grid.dataset.key = key;
  grid.innerHTML = maps.filter(m => fits.includes(m.id)).sort((a, b) => FEATURED.indexOf(a.id) - FEATURED.indexOf(b.id)).map(m => {
    const ok = mapOk(m.id), n = live.get(m.id) ?? 0, note = ok ? sites(m) : t('lobby.noSites');
    return `<button type="button" class="mcard" data-pick="${m.id}" data-theme="${m.theme}" aria-pressed="${m.id === map}"${ok ? '' : ` disabled title="${esc(t('lobby.noSites'))}"`}>
      <span class="thumb" data-thumb="${m.id}"></span>
      <b>${esc(mapName(m.id))}</b>
      <small>${note ? esc(note) : '&nbsp;'}</small>
      <span class="live${n ? ' on' : ''}">${n ? `<i></i>${esc(t('lobby.playing', { n }))}` : '&nbsp;'}</span>
    </button>`;
  }).join('');
  grid.querySelectorAll<HTMLElement>('[data-thumb]').forEach(el => el.appendChild(thumb(el.dataset.thumb!, grid.id)));
  grid.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
for (const id of ['#map-grid', '#solo-maps']) $(id).addEventListener('keydown', e => {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const cards = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('.mcard:not(:disabled)'));
  const i = cards.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const r = cards[i].getBoundingClientRect();
  let next = i;
  if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
  else if (e.key === 'ArrowRight') next = Math.min(cards.length - 1, i + 1);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = cards.length - 1;
  else {
    const down = e.key === 'ArrowDown';
    let best = Infinity;
    cards.forEach((c, j) => {
      const q = c.getBoundingClientRect();
      if (down ? q.top <= r.top + 4 : q.top >= r.top - 4) return;
      const d = Math.abs(q.top - r.top) * 4 + Math.abs(q.left - r.left);
      if (d < best) { best = d; next = j; }
    });
  }
  cards[next].focus();
});

void loadLayout();
const clamp01 = (v: string) => Math.max(0, Math.min(1, Number(v) || 0));

const options = new SettingsMenu(document.body, {
  sensitivity: () => undefined,
  crosshair: () => undefined,
  quality: q => { quality = q; renderer?.applyQuality(QUALITY[q]); },
  volume: v => audio.setVolume(v),
}, {
  lobby: {
    current: () => ({ volume: audio.volume, music: audio.musicVolume, quality: quality as GraphicsQuality }),
    music: v => audio.setMusicVolume(v),
    previewVolume: () => audio.cash(),
    bench: { label: () => t('lobby.bench', { n: BENCH_SECONDS }), run: () => { location.search = `?bench&map=${shownMap()}&quality=${quality}${params.get('lang') ? `&lang=${params.get('lang')}` : ''}`; } },
    credits: () => t('lobby.credits'),
    serverPing: s => pings.get(s.uri) ?? choicePings.get(s.uri),
    onClose: () => choicePings.setActive(false),
  },
});

onLang(next => {
  renderRotate();
  setSuper({ lang: next });
  track('language_changed', { to: next }, { set: { lang: next } });
  applyI18n(menu);
  $<HTMLAnchorElement>('#privacy-link').href = privacyHref();
  renderClickwrap();
  const about = menu.querySelector<HTMLAnchorElement>('#about-link');
  if (about) about.href = aboutHref();
  $('#map-grid').dataset.key = '';
  if (benchPanel) { benchPanel.remove(); if (benchResult) showBenchResult(benchResult); }
  refresh();
});
const openOptions = (_tab?: SettingsTab, _focus?: SettingsFocus) => {
  audio.ui(); closePop(false);
};
$('#open-settings').addEventListener('click', (e) => { e.preventDefault(); });
for (const id of ['#quick-server', '#rooms-server', '#profile-server']) $(id).addEventListener('click', () => {});
const skinPanel = new SkinPanel(document.body, () => assets);
$('#open-skins').addEventListener('click', () => { if (assets) skinPanel.show(); });
skinPanel.onInvite = openInviteRoom;
onSkinChange(() => { if (ready) renderInvite(); });
$('#discord-top').addEventListener('click', () => track('discord_clicked', { where: 'lobby' }));
$('#open-controls').addEventListener('click', () => {});

function syncOptions() {
  settings.sensitivity = Math.max(0.2, Math.min(3, Number(store.get('sensitivity', '1')) || 1));
  settings.fov = Math.max(65, Math.min(95, Number(store.get('fov', '78')) || 78));
  settings.adsSensitivity = Math.max(0.5, Math.min(1.5, Number(store.get('adsSensitivity', '1')) || 1));
  audio.setVolume(clamp01(store.get('volume', '0.8')));
  audio.setMusicVolume(clamp01(store.get('music', '0.6')));
  if (game || ready) { const q = store.get('quality', quality) as keyof typeof QUALITY; if (QUALITY[q]) quality = q; }
}

let assets: Assets;
let assetsLoad: Promise<Assets> | undefined;
let renderer: Renderer;
let game: Game | undefined;
let backdrop: LevelView | undefined;
let backdropMap: string | undefined;
let bench: Bench | undefined;
let benchBanner: HTMLElement | undefined;
let theme: Promise<AudioBuffer> | undefined;
let inMenu = true;
let gestured = false;

syncOptions();
refresh();
watchLobbyRooms();
track('lobby_view', {});
const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500));
idle(() => startAnalytics({ lang: lang(), ...serverProps() }));

function menuMusic() {
  if (!inMenu || !gestured || !theme) return;
  audio.start();
  void theme.then(buffer => { if (inMenu) audio.playMusic(buffer, THEME_START); }, () => undefined);
}
for (const type of ['pointerdown', 'keydown'] as const) document.addEventListener(type, () => { gestured = true; if (game) audio.start(); menuMusic(); });

function showBackdrop() {
  const id = shownMap();
  if (!assets || game || starting || backdropMap === id) return;
  if (backdrop) renderer.scene.remove(backdrop.group);
  const def = loadMap(id).def;
  renderer.setTheme(THEMES[def.theme], def.sun);
  backdrop = new LevelView(assets, def, THEMES[def.theme]);
  backdropMap = id;
  renderer.scene.add(backdrop.group);
}

const needsCallsign = () => !CRAZYGAMES && !benchMode && !params.get('autostart') && !params.has('name') && madeUpCallsign(callsign.value);
type Duel = { kind: 'join'; c: Challenge; mapId: string }
  | { kind: 'fallback'; c: Challenge; mapId: string; reason: 'no_room' | 'gone' | 'offline' }
  | { kind: 'host'; summary: MatchSummary; mapId: string }
  | { kind: 'invite'; mapId: string; mode: Mode; size?: number }
  | { kind: 'joinInvite'; ref: string }
  | { kind: 'warmup' };
let special: Duel | undefined;
const place = crazyLinkPlace() ?? location;
const challenge = parseChallenge(place.search, place.pathname);
if (challenge) noteArrival(challenge.ref);
if (challenge) track('challenge_link_opened', { ref: challenge.ref ?? '', has_room: !!challenge.room }, { setOnce: { ref_by: challenge.ref ?? '' } });
const invite = challenge ? undefined : parseInvite(place.pathname, place.search);
if (invite) noteArrival(invite.ref);
if (invite) track('invite_link_opened', { ref: invite.ref ?? '' }, { setOnce: { ref_by: invite.ref ?? '' } });

const WARMUP = { mapId: 'citadel', teamSize: 1, roundsToWin: 4, botSkill: 0.2 };
const warmupDue = () => CRAZYGAMES && !benchMode && !store.get('warmup', '') && loadProgress().rounds === 0
  && !challenge && !invite && !crazyInstantMultiplayer() && !params.get('room') && !params.get('autostart');

let challengeBanner: HTMLElement | undefined;
function showChallenge() {
  if (invite && !challenge && !challengeBanner) return showInvite();
  if (!challenge || challengeBanner) return;
  const c = challenge;
  const el = document.createElement('div');
  el.className = 'challenge-banner';
  el.innerHTML = '<b></b><p></p><div class="acts"><button type="button" class="go"></button><button type="button" class="later"></button></div>';
  el.querySelector('b')!.textContent = t('chal.banner', { name: c.name });
  const where = c.map ? localMapName(c.map, maps.find(m => m.id === c.map)?.name ?? '') : '';
  el.querySelector('p')!.textContent = c.beat !== undefined && where ? t('chal.brag', { n: c.beat, map: where }) : t('chal.plain', { map: where || '1v1' });
  const go = el.querySelector<HTMLButtonElement>('.go')!;
  go.onclick = acceptChallenge;
  el.querySelector<HTMLButtonElement>('.later')!.textContent = t('chal.later');
  el.querySelector<HTMLButtonElement>('.later')!.onclick = () => { el.remove(); waitingLink = undefined; refresh(); };
  challengeBanner = el;
  waitingLink = 'challenge';
  menu.appendChild(el);
  renderChallenge();
}
function renderChallenge() {
  const go = challengeBanner?.querySelector<HTMLButtonElement>('.go');
  if (!go) return;
  go.disabled = !ready;
  go.textContent = ready ? t(challenge ? 'chal.accept' : 'invite.join') : loadingText();
}

function showInvite() {
  if (!invite) return;
  const el = document.createElement('div');
  el.className = 'challenge-banner invite-banner';
  el.innerHTML = '<b></b><p></p><div class="acts"><button type="button" class="go"></button><button type="button" class="later"></button></div>';
  el.querySelector('b')!.textContent = t('invite.banner');
  el.querySelector('p')!.textContent = t('invite.bannerBody', { code: invite.room });
  el.querySelector<HTMLButtonElement>('.go')!.onclick = acceptInvite;
  el.querySelector<HTMLButtonElement>('.later')!.textContent = t('chal.later');
  el.querySelector<HTMLButtonElement>('.later')!.onclick = () => { el.remove(); waitingLink = undefined; refresh(); };
  challengeBanner = el;
  waitingLink = 'invite';
  menu.appendChild(el);
  renderChallenge();
}

function acceptInvite() {
  if (!invite || !ready || starting) return;
  challengeBanner?.remove();
  waitingLink = undefined;
  roomCode.value = invite.room;
  if (!online.ok) { status.textContent = t('invite.gone'); return; }
  special = { kind: 'joinInvite', ref: invite.ref ?? '' };
  run('code');
}

function openInviteRoom() {
  if (!online.ok || !ready || starting) return;
  const fits = mapsFor(6), mapId = fits.includes(map) ? map : fits[0];
  special = { kind: 'invite', mapId, mode: mode === 'sabotage' && !hasSites(mapId) ? 'elimination' : mode };
  run('start');
}

function acceptChallenge() {
  const c = challenge;
  if (!c || !ready || starting) return;
  const mapId = challengeMap(c.map, mapsFor(1));
  challengeBanner?.remove();
  waitingLink = undefined;
  if (c.room && online.ok) { special = { kind: 'join', c, mapId }; roomCode.value = c.room; run('code'); }
  else { special = { kind: 'fallback', c, mapId, reason: c.room ? 'offline' : 'no_room' }; run('solo'); }
}

function startedDuel(duel: Duel, link: GameLink) {
  if (duel.kind === 'joinInvite') { track('invite_joined', { ref: duel.ref, joined: true }); return; }
  if (duel.kind === 'warmup') {
    store.set('warmup', '1');
    game?.notice(t('warmup.notice', { n: WARMUP.roundsToWin }), 10000);
    game?.onward(t('warmup.online'), () => { backToLobby('menu', '', 'end_screen'); if (online.ok) run('quick'); });
    return;
  }
  if (duel.kind === 'invite') {
    const hosting = game;
    let tries = 0;
    const syncCode = () => {
      if (game !== hosting) return;
      const gameCode = link.roomInfo?.()?.code;
      const urlParams = new URLSearchParams(window.location.search);
      const oldCode = urlParams.get('room');

      if (gameCode && oldCode) {
        fetch('https://kirsjemjkstvnuqpwian.supabase.co/rest/v1/rpc/update_3d_match_code', {
            method: 'POST',
            headers: {
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpcnNqZW1qa3N0dm51cXB3aWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTI0OTMsImV4cCI6MjEwNzcyODQ5M30.him1fOnfpPlCg6DC7dqeVRsr_aOYCmRQ3FpGqK_rygA', 
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpcnNqZW1qa3N0dm51cXB3aWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTI0OTMsImV4cCI6MjEwNzcyODQ5M30.him1fOnfpPlCg6DC7dqeVRsr_aOYCmRQ3FpGqK_rygA',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_room_code: oldCode,
                p_new_code: gameCode
            })
        }).then(res => res.json()).then(data => console.log("Code synced:", data)).catch(err => console.error(err));
      } else if (++tries < 40) {
        setTimeout(syncCode, 250);
      }
    };
    syncCode();
    return;
  }
  if (duel.kind === 'host') {
    const hosting = game;
    let tries = 0;
    const open = () => {
      if (game !== hosting) return;
      const code = link.roomInfo?.()?.code;
      if (code) void game?.share({ summary: duel.summary, room: code });
      else if (++tries < 40) setTimeout(open, 250);
    };
    open();
    return;
  }
  const ref = duel.c.ref ?? '';
  game?.setChallenge({ name: duel.c.name, ref, via: duel.kind === 'join' ? 'room' : 'fallback' });
  track('challenge_started', { ref, via: duel.kind === 'join' ? 'room' : 'fallback', ...(duel.kind === 'fallback' ? { reason: duel.reason } : {}) });
  if (duel.kind === 'fallback') { game?.notice(t('chal.double', { name: duel.c.name }), 8000); return; }
  const playing = game;
  setTimeout(() => {
    const state = link.state();
    if (game !== playing || !state || state.soldiers.some(s => !s.bot && s.id !== link.myId())) return;
    backToLobby('menu');
    special = { kind: 'fallback', c: duel.c, mapId: duel.mapId, reason: 'gone' };
    run('solo');
  }, 6000);
}

function openDuelRoom(summary: MatchSummary) {
  backToLobby('menu', t('chal.opening'), 'end_screen');
  special = { kind: 'host', summary, mapId: challengeMap(summary.mapId, mapsFor(1)) };
  run('start');
}

function run(action: Action, room = -1, retried = false) {
  if (!ready || starting) return;
  if (modeOf(action) === 'online' && !online.ok) return;
  if (action === 'code' && roomCode.value.length < 4) { roomCode.focus(); return; }
  if (needsCallsign()) {
    track('callsign_asked', {});
    askCallsign(callsign.value, name => { callsign.value = name; store.set('name', name); run(action, room, retried); });
    return;
  }
  if (modeOf(action) === 'online' && phase() !== 'ready') {
    playPressed();
    fullscreenForTouch();
    captureForPlay();
    if (phase() === 'idle') watchLobbyRooms();
    lobbyConn.queue({ action, room, retried });
    return;
  }
  if (action === 'room' && !rooms.some(r => r.room === room)) return;
  playPressed();
  joiningRoom = room;
  void start(action, retried);
}

function offlineRules(): { mapId: string; mode: Mode } {
  if (!benchMode) return { mapId: map, mode };
  const fits = mapsFor(perTeam());
  const asked = params.get('map');
  return { mapId: asked && maps.some(m => m.id === asked) ? asked : fits.includes(map) ? map : fits[0], mode: 'elimination' };
}

function fullscreenForTouch() {
  // 👇 إجبار الشاشة على التوسع في تليجرام 👇
  if ((window as any).Telegram?.WebApp) {
      (window as any).Telegram.WebApp.expand();
      if ((window as any).Telegram.WebApp.requestFullscreen) {
          (window as any).Telegram.WebApp.requestFullscreen();
      }
  }
  if (CRAZYGAMES || !touchActive() || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    return orientation?.lock?.('landscape');
  }).catch(() => undefined);
}

function captureForPlay() {
  const canvas = renderer.renderer.domElement;
  if (benchMode || touchActive() || document.pointerLockElement === canvas) return;
  void (canvas.requestPointerLock?.() as Promise<void> | undefined)?.catch?.(() => undefined);
}
function freeMouse() {
  if (renderer && document.pointerLockElement === renderer.renderer.domElement) document.exitPointerLock?.();
}

async function start(action: Action, retried = false) {
  if (!benchMode) fullscreenForTouch();
  if (!benchMode) acceptTerms();
  const name = callsign.value.trim().slice(0, 16) || t('lobby.fallbackName');
  const via = modeOf(action);
  const duel = special;
  special = undefined;
  inviteStarting = duel?.kind === 'invite';
  if (duel?.kind === 'host' || duel?.kind === 'invite') freeMouse();
  else captureForPlay();
  if (!benchMode) {
    store.set('name', name);
    if (!duel) { store.set('mode', via); store.set('team', team); store.set('skill', skill); saveForm(); }
  }
  const kinds: Record<Action, PlayKind> = { quick: 'online', start: isPublic ? 'start' : 'private', room: 'room', code: 'code', solo: 'solo', range: 'practice' };
  const ruled = action === 'start' || action === 'solo' || action === 'range';
  const playServer: ServerId | undefined = via === 'online' ? currentServer()?.id : undefined;
  const warm = duel?.kind === 'warmup';
  track('play_clicked', { kind: warm ? 'warmup' : kinds[action], size: warm ? sizeLabel(WARMUP.teamSize) : ruled ? sizeOf(size).label : '', mode: warm ? 'elimination' : ruled ? mode : '', map: warm ? WARMUP.mapId : ruled ? map : '', ...(playServer ? { server_choice: playServer } : {}) }, { set: { name, lang: lang(), quality } });
  starting = action; closePop(false); refresh();
  options.hide();
  choicePings.setActive(false);
  status.textContent = '';
  const lobbyLink = via === 'online' ? lobbyConn.take()?.handOver() : undefined;
  unwatchRooms();
  inMenu = false;
  audio.start();
  if (params.has('audiodebug')) void import('./audio-probe').then(m => m.startAudioProbe(audio));
  audio.stopMusic();
  const teamChoice = team === 'auto' ? undefined : (Number(team) as Team);
  const botSkill = Math.max(0.1, Math.min(0.95, Number(skill) || 0.45));
  const rules = offlineRules();
  
  const how: OnlineEntry = duel?.kind === 'host' ? { kind: 'start', size: 1, mode: 'elimination', mapId: duel.mapId, bots: false, isPublic: false }
    : duel?.kind === 'invite' ? { kind: 'start', size: duel.size ?? 6, mode: duel.mode, mapId: duel.mapId, bots: true, isPublic: false }
    : duel?.kind === 'join' ? { kind: 'code', code: duel.c.room! }
    : action === 'code' ? { kind: 'code', code: cleanCode(roomCode.value) }
    : action === 'room' ? { kind: 'room', room: joiningRoom }
    : action === 'start' ? { kind: 'start', size: perTeam(), mode, mapId: map, bots: false, isPublic }
    :          { kind: 'start', size: params.get('size') === '6' ? 6 : 1, mode: 'elimination', mapId: params.get('size') === '6' ? 'citadel' : map, bots: true, isPublic: true };
  
  let link: GameLink;
  try {
    link = via === 'online'
      ? await connectOnline(name, teamChoice, how, s => { status.textContent = s; }, { reuse: lobbyLink, before: assetsLoad })
      : warm
        ? new OfflineLink(WARMUP.mapId, name, undefined, { noBots: true,...ELIMINATION, teamSize: WARMUP.teamSize, roundsToWin: WARMUP.roundsToWin, botSkill: WARMUP.botSkill })
      : duel?.kind === 'fallback'
        ? new OfflineLink(duel.mapId, name, undefined, { ...ELIMINATION, teamSize: 1, botSkill }, false, duel.c.name)
      : via === 'lab'
        ? new OfflineLink(rules.mapId, name, teamChoice, {}, true)
        : new OfflineLink(rules.mapId, name, teamChoice, {noBots: true, ...(rules.mode === 'sabotage' ? SABOTAGE : ELIMINATION), teamSize: perTeam(), botSkill, freeBuy: params.has('freebuy') });
  } catch (error) {
    if (duel?.kind === 'join') {
      starting = undefined; joiningRoom = -1;
      special = { kind: 'fallback', c: duel.c, mapId: duel.mapId, reason: 'gone' };
      void start('solo');
      return;
    }
    if (duel?.kind === 'joinInvite') track('invite_joined', { ref: duel.ref, joined: false });
    const room = joiningRoom;
    starting = undefined; joiningRoom = -1;
    inMenu = !benchMode; menuMusic();
    if (error instanceof ConnectError && via === 'online' && !retried && !benchMode) {
      status.textContent = '';
      watchLobbyRooms();
      lobbyConn.queue({ action, room, retried: true });
      return;
    }
    freeMouse();
    playFailed();
    const tried = action === 'code' && !duel ? cleanCode(roomCode.value) : '';
    status.textContent = t('lobby.couldNotJoin', { error: serverError((error as Error).message) }) + (tried ? ` (${tried})` : '');
    if (tried) { roomCode.focus({ preventScroll: true }); roomCode.select(); }
    track('error_shown', { where: 'join', message: String((error as Error)?.message ?? error).slice(0, 120) });
    watchLobbyRooms(); refresh();
    return;
  }

  if (!benchMode && via === 'online' && (action === 'start' || action === 'quick')) {
      freeMouse();
      
      if ((action === 'start' && !isPublic) || (duel && duel.kind === 'invite')) {
          privateOverlay.style.display = 'flex';
          document.getElementById('p-name')!.textContent = callsign.value + ' (X)';
          
          // إظهار الكود فوراً من الرابط (حل احتياطي)
          const urlRoomCode = new URLSearchParams(window.location.search).get('room');
          if (urlRoomCode) {
              const el1 = document.getElementById('p-top-code');
              const el2 = document.getElementById('p-center-code');
              if (el1) el1.textContent = urlRoomCode;
              if (el2) el2.textContent = urlRoomCode;
          }

          const updateCode = setInterval(() => {
              const newInfo = link.roomInfo?.();
              if (newInfo?.code) {
                  document.getElementById('p-top-code')!.textContent = newInfo.code;
                  document.getElementById('p-center-code')!.textContent = newInfo.code;
                  
                  const urlParams = new URLSearchParams(window.location.search);
                  const oldCode = urlParams.get('room');
                  if (oldCode) {
                      fetch('https://kirsjemjkstvnuqpwian.supabase.co/rest/v1/rpc/update_3d_match_code', {
                          method: 'POST',
                          headers: {
                              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpcnNqZW1qa3N0dm51cXB3aWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTI0OTMsImV4cCI6MjEwNzcyODQ5M30.him1fOnfpPlCg6DC7dqeVRsr_aOYCmRQ3FpGqK_rygA', 
                              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpcnNqZW1qa3N0dm51cXB3aWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTI0OTMsImV4cCI6MjEwNzcyODQ5M30.him1fOnfpPlCg6DC7dqeVRsr_aOYCmRQ3FpGqK_rygA',
                              'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                              p_room_code: oldCode,
                              p_new_code: newInfo.code
                          })
                      }).then(res => res.json()).then(data => console.log("Code synced from wait screen:", data)).catch(err => console.error(err));
                  }
                  clearInterval(updateCode);
              }
          }, 500);
      } else {
          waitOverlay.style.display = 'flex';
      }
const waitStart = Date.now();
      const checkInterval = setInterval(async () => {
          const state = link.state();
          // 👇 التعديل هنا: كسر الانتظار بعد 15 ثانية لـ 1v1 و 12 ثانية لـ 6v6 👇
                    // 👇 التعديل: 20 ثانية لإنشاء الغرفة (الكود)، والبقاء على الوضع القديم للعب السريع 👇
          const is1v1 = params.get('size') !== '6';
          const isCreate = params.get('autostart') === 'create';
          const waitTimeout = isCreate ? 20000 : (is1v1 ? 15000 : 12000);
          
          
          
          if ((state && state.soldiers.filter(s => !s.bot).length > 1) || (Date.now() - waitStart >= waitTimeout)) {
              clearInterval(checkInterval);
              waitOverlay.style.display = 'none';
              privateOverlay.style.display = 'none';
              
              if (!assets) {
                  status.textContent = loadingText();
                  try { assets = await assetsLoad!; } catch (e) { link.dispose(); starting = undefined; return; }
              }
              const linkMap = state?.mapId ?? map;
              await assets.textures.load(groundSets(THEMES[loadMap(linkMap).def.theme]));
              starting = undefined; joiningRoom = -1;
              status.textContent = '';
              if (backdrop) { renderer.scene.remove(backdrop.group); backdrop = undefined; backdropMap = undefined; }
              launch(link, linkMap);
              joined(link, linkMap, playServer, false, true);
              matchServer = playServer;
              reportRoom(link, playServer);
              menu.hidden = true;
              document.body.classList.remove('menu-open');
              game?.capture();
          }
      }, 1000);

      const leaveWait = () => {
          clearInterval(checkInterval);
          waitOverlay.style.display = 'none';
          privateOverlay.style.display = 'none';
          link.dispose?.();
          starting = undefined; joiningRoom = -1;
          status.textContent = '';
          inMenu = !benchMode; menuMusic();
          watchLobbyRooms(); refresh();
      };
      document.getElementById('wait-cancel')!.onclick = leaveWait;
      document.getElementById('p-cancel')!.onclick = leaveWait;
      
      return; // إيقاف التنفيذ هنا! لا ندخل اللعبة حتى ينضم شخص.
  }

  if (!assets) {
    status.textContent = loadingText();
    try { assets = await assetsLoad!; } catch (error) { link.dispose(); starting = undefined; status.textContent = t('lobby.unableToStart', { error: (error as Error)?.message ?? String(error) }); return; }
  }
  const linkMap = link.state()?.mapId ?? (duel?.kind === 'fallback' ? duel.mapId : rules.mapId);
  await assets.textures.load(groundSets(THEMES[loadMap(linkMap).def.theme]));
  starting = undefined; joiningRoom = -1;
  status.textContent = '';
  if (backdrop) { renderer.scene.remove(backdrop.group); backdrop = undefined; backdropMap = undefined; }
  launch(link, linkMap);
  joined(link, linkMap, playServer, false, duel?.kind === 'host' || duel?.kind === 'invite');
  matchServer = playServer;
  reportRoom(link, playServer);
  if (duel) startedDuel(duel, link);
  menu.hidden = true;
  document.body.classList.remove('menu-open');

  if (duel?.kind === 'host' || duel?.kind === 'invite') return;
  game?.capture();
}
function launch(link: GameLink, map: string) {
  matchStartTime = Date.now(); // 👈 تسجيل وقت بدء المباراة
  game = new Game(assets, renderer, link, map, audio, app);
  if (link.mode === 'online') game.server = matchServer;
  if (!benchMode) game.onDuel(online.ok ? openDuelRoom : undefined);
  if (benchMode && !bench) startBench(game);
  game.onMapChange = next => { game?.stop(true); launch(link, next); };
  game.onExit = how => backToLobby('menu', '', how);
}
function backToLobby(reason: 'menu' | 'disconnect', message = '', exit?: Exit) {
  clearInterval(opponentLeftTimer);
  opponentLeftHandled = false;
  if (!game) return;
  const finished = game.link.state()?.phase === 'ended';
  leftMatch(reason, exit);
  game.stop(); game = undefined;
  crazyGameplay(false);
  crazyLeftRoom();
  if (finished && reason === 'menu') void crazyMidgameAd(() => audio.setMuted(true), () => audio.setMuted(crazySettings().muteAudio));
  track('lobby_view', {});
  document.body.classList.add('menu-open'); menu.hidden = false;
  syncOptions();
  inMenu = !benchMode; menuMusic();
  watchLobbyRooms(); refresh();
  if (message) status.textContent = message;
}
function reportRoom(link: GameLink, server: ServerId | undefined) {
  if (!CRAZYGAMES || link.mode !== 'online') return;
  const playing = game;
  let tries = 0;
  const report = () => {
    if (game !== playing) return;
    const info = link.roomInfo?.();
    if (info?.code) crazyRoom(`${server ?? 'tw'}-${info.room}-${info.code}`, true, { r: info.code, ...(server === 'us' ? { s: 'us' } : {}) });
    else if (info && ++tries >= 8) crazyRoom(`${server ?? 'tw'}-${info.room}`, false, {});
    else setTimeout(report, 250);
  };
  report();
}
let matchServer: ServerId | undefined;
let opponentLeftTimer: ReturnType<typeof setInterval> | undefined;
let opponentLeftHandled = false;
let matchStartTime = 0; // 👈 متغير جديد لمعرفة وقت بدء المباراة

function playContext() {
  const app = inAppBrowserName(readEnv());
  return { ...(app ? { in_app: app } : {}), ...(touchActive() ? { aim_assist: touchAimAssist() } : {}) };
}
onSideways(on => { if (on && game) matchNote('sideways'); });

function joined(link: GameLink, map: string, serverChoice: ServerId | undefined, rejoin = false, hosted = false) {
  const state = link.state(), me = state?.soldiers.find(s => s.id === link.myId());
  const config = state?.config;
  const info = link.roomInfo?.();
  const wait = matchStarted();
  matchJoined({
    online: link.mode === 'online', ...(info ? { room: info.code || `public-${info.room}`, private: !!info.code } : {}), ...(hosted ? { hosted: true } : {}), map,
    mode: config?.mode ?? 'elimination', size: config?.practice ? 'practice' : sizeLabel(config?.teamSize ?? perTeam()), team: me?.team === 1 ? 'militia' : 'swat',
    ...(serverChoice ? { server_choice: serverChoice } : {}), device: currentDeviceKind(), ...(rejoin ? { rejoin: true } : {}),
    touch: touchActive(), upright: innerHeight > innerWidth && !isSideways(), ...playContext(), ...(wait !== undefined && !rejoin ? { wait_ms: wait } : {}),
  });
  if (isSideways()) matchNote('sideways');
  if (link instanceof OnlineLink) link.onDrop = () => {
    if (link.dropReason === 'lost' && !benchMode && link.entry) void rejoinAfterDrop(link);
    else if (link.dropReason === 'afk') backToLobby('disconnect', t('net.afk'), 'afk');
    else backToLobby('disconnect', t(link.dropReason === 'removed' ? 'net.removed' : 'net.lost'), link.dropReason === 'removed' ? 'removed' : 'lost');
  };
}

const REJOIN_TRIES = 5;
const visible = () => new Promise<void>(resolve => {
  if (document.visibilityState === 'visible') { resolve(); return; }
  const on = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', on); resolve(); } };
  document.addEventListener('visibilitychange', on);
});

async function rejoinAfterDrop(old: OnlineLink) {
  const playing = game;
  if (!playing || !old.entry) return;
  const info = old.roomInfo();
  const how: OnlineEntry = info?.code ? { kind: 'code', code: info.code } : info ? { kind: 'room', room: info.room } : old.entry.how;
  const note = document.createElement('div');
  note.className = 'reconnecting';
  note.setAttribute('role', 'status');
  note.innerHTML = `<b>${esc(t('net.reconnecting'))}</b><small>${esc(t('net.reconnectingSub'))}</small>`;
  document.body.appendChild(note);
  try {
    for (let i = 0; i < REJOIN_TRIES; i++) {
      await visible();
      if (game !== playing) return;
      try {
        const team = old.entry.team === 0 || old.entry.team === 1 ? old.entry.team as Team : undefined;
        const link = await connectOnline(old.entry.name, team, how, () => undefined);
        if (game !== playing) { link.dispose(); return; }
        leftMatch('disconnect', 'rejoined');
        playing.stop(); game = undefined;
        const map = link.state()?.mapId ?? playing.mapId;
        launch(link, map);
        joined(link, map, matchServer, true);
        return;
      } catch { await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
    }
    backToLobby('disconnect', t('net.lost'), 'lost');
  } finally { note.remove(); }
}
function leftMatch(reason: Reason, exit?: Exit) {
  const link = game?.link;
  matchLeft(reason, link instanceof OnlineLink ? link.netLeft() : undefined, exit, matchFrameStats(), renderer && {
    gpu: renderer.gpuName(), quality, pixel_ratio: renderer.pixelRatio(), dpr_scale: renderer.quality.adaptive ? Math.round(renderer.adaptive.multiplier * 100) / 100 : 1,
  });
}
addEventListener('pagehide', () => leftMatch('close', 'close'));

function toggleFullscreen() {
  if (CRAZYGAMES) return;
  if (document.fullscreenElement) { void document.exitFullscreen().catch(() => undefined); return; }
  const relock = !!game?.input.locked;
  void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(() => {
    if (relock && game && !game.input.locked) void game.input.lock()?.catch?.(() => undefined);
  }, () => undefined);
}
document.addEventListener('mousedown', e => {
  const code = `Mouse${e.button}`;
  if (matches('fullscreen', code)) toggleFullscreen();
  else if (matches('leave', code) && game && !game.input.locked) leaveByKey();
});
function leaveByKey() {
  if (!game || game.input.locked || document.querySelector('.ask-dialog')) return;
  if (game.link.state()?.phase === 'ended') { game.onExit?.('leave_key'); return; }
  confirmDialog({ title: t('leave.title'), why: t('leave.why'), go: t('leave.go'), stay: t('leave.stay'), done: () => game?.onExit?.('leave_key') });
}

const GFX_RESTORE_MS = 6000;
let gfxTimer = 0;
function graphicsLost() {
  if (document.querySelector('.gfx-lost')) return;
  const el = document.createElement('div');
  el.className = 'gfx-lost';
  el.setAttribute('role', 'alert');
  el.innerHTML = `<p>${esc(t('gfx.restoring'))}</p>`;
  document.body.appendChild(el);
  clearTimeout(gfxTimer);
  gfxTimer = window.setTimeout(() => {
    el.innerHTML = `<p>${esc(t('gfx.lost'))}</p><button type="button">${esc(t('gfx.reload'))}</button>`;
    el.querySelector('button')!.addEventListener('click', () => location.reload());
  }, GFX_RESTORE_MS);
}
function graphicsRestored() {
  clearTimeout(gfxTimer);
  document.querySelector('.gfx-lost')?.remove();
  renderer.restored();
}

const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
document.addEventListener('keydown', e => {
  if (matches('leave', e.code) && game && !game.input.locked && e.target === document.body) leaveByKey();
  if (matches('fullscreen', e.code) && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e)) toggleFullscreen();
  if (e.key === 'Escape' && !game && !menu.hidden) {
    if (options.open) { e.preventDefault(); options.close(); return; }
    if (openPop) { e.preventDefault(); closePop(); }
    return;
  }
  if (e.key === 'Enter' && !e.repeat && !game && !menu.hidden && !options.open && !e.isComposing) {
    const target = e.target as HTMLElement;
    if (target === roomCode) { e.preventDefault(); run('code'); return; }
    if (target.closest('button, summary, a')) return;
    e.preventDefault();
    if (openPop?.id === 'solo-pop') run('solo');
    else if (tab === 'quick') quickPressed();
    else if (tab === 'start') run('start');
  }
});

function startBench(g: Game) {
  bench = new Bench(g, renderer, quality);
  benchBanner = document.createElement('div');
  benchBanner.className = 'bench-banner';
  app.appendChild(benchBanner);
  bench.onDone = result => { benchBanner?.remove(); showBenchResult(result); benchFinished(result); };
}

let benchPanel: HTMLElement | undefined;
let benchResult: BenchResult | undefined;
function showBenchResult(r: BenchResult) {
  const panel = benchPanel = document.createElement('div');
  benchResult = r;
  panel.className = 'bench-panel';
  panel.innerHTML = `
    <h2>${t('bench.title')}</h2>
    <div class="verdict ${r.meets60 ? 'ok' : 'bad'}">${t(r.meets60 ? 'bench.met' : 'bench.notMet')}</div>
    <table>${benchReport(r).map(([k]) => `<tr><th>${t(k)}</th><td></td></tr>`).join('')}</table>
    <p>${t('bench.about', { n: r.seconds })}</p>
    <div class="actions"><button data-a="copy">${t('bench.copy')}</button><button data-a="again">${t('bench.again')}</button><button data-a="menu">${t('bench.menu')}</button></div>`;
  panel.querySelectorAll('td').forEach((td, i) => { td.textContent = benchReport(r)[i][1]; });
  panel.addEventListener('click', e => {
    const a = (e.target as HTMLElement).dataset.a;
    if (a === 'copy') void navigator.clipboard?.writeText(JSON.stringify(r, null, 2)).then(() => { (e.target as HTMLElement).textContent = t('bench.copied'); }, () => undefined);
    if (a === 'again') location.reload();
    if (a === 'menu') location.href = location.pathname + (params.get('lang') ? `?lang=${params.get('lang')}` : '');
  });
  app.appendChild(panel);
  document.body.classList.add('bench-done');
  document.exitPointerLock?.();
}

const startAction = (): Action => 'start';
function crazyReady() {
  crazyLoadingStop();
  onCrazySettings(s => { audio.setMuted(s.muteAudio); setChatDisabled(s.disableChat); });
  void crazyUser().then(user => {
    const name = user && cleanCallsign(user.username);
    if (!name) return;
    callsign.value = name; store.set('name', name); renderProfile();
  });
  onCrazyJoinRoom(params => {
    const where = linkPlace(params), room = where && parseInvite(where.pathname, where.search);
    if (!room) return;
    if (game) backToLobby('menu', '', 'menu_button');
    followLink(room.server ?? 'tw');
    roomCode.value = room.room;
    special = { kind: 'joinInvite', ref: room.ref ?? '' };
    run('code');
  });
  if (crazyInstantMultiplayer() && !challenge && !invite) openInviteRoom();
}
function loadHilltopAd() {
    const oldScript = document.getElementById('hilltop-ad-script');
    if (oldScript) {
        oldScript.remove();
    }

    const adScript = document.createElement('script');
    adScript.id = 'hilltop-ad-script';
    adScript.innerHTML = `
        (function(xyo){
        var d = document,
            s = d.createElement('script'),
            l = d.currentScript || d.scripts[d.scripts.length - 1];
        s.settings = xyo || {};
        s.src = "\\/\\/juvenilechoice.com\\/b-X.VZsQd\\/GelY0\\/YbWycr\\/EevmC9\\/uqZIUWlvklPQTvcP1POWDmIg4mMOjxkEtlNUzzUw4\\/MojCgGz\\/M\\/w_";
        s.async = true;
        s.referrerPolicy = 'no-referrer-when-downgrade';
        l.parentNode.insertBefore(s, l);
        })({})
    `;
    document.body.appendChild(adScript);
}
async function boot() {
  renderer = new Renderer(app, QUALITY[quality]);
  watchClientErrors(renderer.renderer.domElement, () => !!game, graphicsLost, graphicsRestored, () => {
    const canvas = renderer.renderer.domElement;
    return { quality, pixel_ratio: renderer.pixelRatio(), canvas: `${canvas.width}x${canvas.height}`, ...(game ? { map: game.mapId } : {}) };
  });
  const fonts = isZh() ? cjkFontReady('繁體中文') : Promise.resolve();
  showChallenge();
  let retries = 0;
  let hiddenWhileLoading = document.visibilityState !== 'visible';
  const noteHidden = () => { if (document.visibilityState !== 'visible') hiddenWhileLoading = true; };
  document.addEventListener('visibilitychange', noteHidden);
  const nextTry = (ms: number) => new Promise<void>(resolve => {
    const wake = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      clearTimeout(timer); removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake); resolve();
    };
    const timer = setTimeout(wake, ms);
    addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
  });
  const loading = assetsLoad = (async () => {
    for (;;) {
      let failedFile = '';
      try {
        const loaded = await loadAssets(f => {
          loadFraction = Math.min(0.99, Math.max(loadFraction, f));
          if (starting && !assets) status.textContent = loadingText();
          renderQuick(); renderStart(); renderOthers(); renderChallenge();
        }, { renderer: renderer.renderer, quality, lowFirst: CRAZYGAMES }, url => { failedFile ||= url; });
        loadTrouble = false;
        return loaded;
      } catch (error) {
        console.warn('Assets failed to load, trying again', error);
        if (++retries === 3) {
          const file = failedFile && (u => `${u.host}${u.pathname}`)(new URL(failedFile, location.href));
          reportBootFailure(error, {
            uptime_s: Math.round(performance.now() / 1000), visible: document.visibilityState === 'visible', hidden_while_loading: hiddenWhileLoading,
            online: navigator.onLine, sw: !!navigator.serviceWorker?.controller, ...(file ? { file: file.slice(0, 120) } : {}),
          });
        }
        if (retries >= 3) {
          loadTrouble = true;
          if (starting && !assets) status.textContent = loadingText();
          renderQuick(); renderStart(); renderOthers(); renderChallenge();
        }
        await nextTry(Math.min(10_000, 1500 * retries));
      }
    }
  })();
  void loading.finally(() => document.removeEventListener('visibilitychange', noteHidden));
  await fonts;
  ready = true;
  refresh(); renderChallenge();
  if (warmupDue()) { special = { kind: 'warmup' }; run('solo'); }
  assets = await loading;
  if (!benchMode) lobbyReady(retries);
  if (CRAZYGAMES) crazyReady();
  if (!starting) warmServiceWorker();
  refresh();
  renderChallenge();
  if (params.get('room') && !params.get('autostart') && !challenge) roomCode.focus({ preventScroll: true });
  if (!benchMode) {
    theme = renderTheme();
    theme.then(menuMusic, error => console.warn('Menu theme unavailable', error));
  }
  let previous = performance.now();
  let angle = 0.6;
  const fixed = import.meta.env.DEV && (params.has('fixeddt') || params.has('capture'));

  const step = (dt: number, now: number, render = true) => {
    if (game) {
      if (game.link.mode === 'online') {
        const state = game.link.state();
        const myId = game.link.myId();
        const me = state?.soldiers.find(s => s.id === myId);
        
        if (state && me && !opponentLeftHandled) {
          // حساب الجولات (النقاط)
                    // حساب الجولات (النقاط)
          const myScore = state.scores[me.team] || 0;
          const oppScore = state.scores[1 - me.team] || 0;
          const totalRounds = myScore + oppScore;
          
          // 👇 التعديل: نهاية المباراة إذا وصل أحد الطرفين إلى 6 قتلات 👇
          const isMatchOver = myScore >= 6 || oppScore >= 6 || state.phase === 'ended';
          
          // فحص انسحاب الخصم (إذا كنت وحدك في الغرفة ولا يوجد بوت، ومرت 10 ثواني)
          const timeSinceStart = Date.now() - matchStartTime;
          const opponentLeft = state.soldiers.length === 1 && timeSinceStart > 10000;

          if (isMatchOver || opponentLeft) {
            opponentLeftHandled = true;
            freeMouse();

            let isWin = false;
            let isDraw = false;
            let title = "";
            let msg = "";
            let color = "";

                        // 👇 التعديل: إذا انسحب الخصم، نعطي الفوز فقط إذا كان مجموع القتلات 3 أو أكثر (أي في الجولة الرابعة) 👇
            if (opponentLeft && !isMatchOver) {
                if (totalRounds >= 3) {
                    isWin = true;
                    title = "Congratulations, you won! 🏆";
                    msg = "Your opponent left the game.";
                    color = "#f59e0b";
                } else {
                    isDraw = true;
                    title = "Match Abandoned 🏳️";
                    msg = "Opponent left too early. No points awarded.";
                    color = "#cbd5e1";
                }
            } else if (myScore > oppScore) {
                isWin = true;
                title = "Congratulations, you won! 🏆";
                msg = `Score: ${myScore} - ${oppScore}`;
                color = "#f59e0b";
            } else if (myScore < oppScore) {
                isWin = false;
                title = "You lost 😢";
                msg = `Score: ${myScore} - ${oppScore}`;
                color = "#ef4444";
            } else {
                isDraw = true;
                title = "Draw 🤝";
                msg = `Score: ${myScore} - ${oppScore}`;
                color = "#cbd5e1";
            }

            // إرسال النتيجة للسيرفر
            const urlParams = new URLSearchParams(window.location.search);
            const roomCodeParam = urlParams.get('room');
            const userEmailParam = urlParams.get('email');
            const isTelegramPlatform = urlParams.get('platform') === 'telegram';
            const actualRoomCode = game?.link.roomInfo?.()?.code || roomCodeParam;

            if (isWin && userEmailParam) {
                
                                if (isTelegramPlatform) {
                    // 👇 حالة تليجرام: إضافة 3 نقاط عبر سيرفر الحماية 👇
                    fetch('https://lootearn.top/api/add-points', { 
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email: userEmailParam, amount: 3 })
                    }).then(res => res.json()).then(data => console.log("تم إضافة 3 نقاط عبر السيرفر الآمن:", data)).catch(err => console.error(err));

                } else if (actualRoomCode) {
                    // 👇 حالة الموقع (الغرف): استخدام النظام القديم 👇
                    fetch('https://kirsjemjkstvnuqpwian.supabase.co/rest/v1/rpc/finish_3d_match', { 
                        method: 'POST',
                        headers: {
                            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpcnNqZW1qa3N0dm51cXB3aWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTI0OTMsImV4cCI6MjEwNzcyODQ5M30.him1fOnfpPlCg6DC7dqeVRsr_aOYCmRQ3FpGqK_rygA', 
                            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpcnNqZW1qa3N0dm51cXB3aWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTI0OTMsImV4cCI6MjEwNzcyODQ5M30.him1fOnfpPlCg6DC7dqeVRsr_aOYCmRQ3FpGqK_rygA',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ p_room_code: actualRoomCode, p_winner_email: userEmailParam })
                    }).then(res => res.json()).then(data => console.log("تم إضافة نقاط الغرفة:", data)).catch(err => console.error(err));
                }
            }

            // إظهار شاشة النتيجة المخصصة (تغطي شاشة اللعبة الداخلية)
            const winOverlay = document.createElement('div');
            winOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.95);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;text-align:center;';
            
            // 👇 تم تغيير نص الزر إلى "العودة للموقع" 👇
            winOverlay.innerHTML = `
              <h1 style="color:${color};font-size:48px;margin-bottom:20px;">${title}</h1>
              <p style="font-size:24px;color:#cbd5e1;">${msg}</p>
              <button id="win-close" style="margin-top:40px;padding:15px 60px;background:#14b8a6;border:none;border-radius:10px;font-size:20px;cursor:pointer;color:#fff;font-weight:bold;">العودة للموقع</button>
            `;            document.getElementById('win-close')!.addEventListener('click', () => {
              winOverlay.remove();
              
              // 👇 التعديل: إغلاق النافذة والعودة إلى بوت التليجرام تلقائياً 👇
              if ((window as any).Telegram?.WebApp) {
                  (window as any).Telegram.WebApp.close();
              } else {
                  window.location.href = 'https://lootearn.top';
              }
            });
            
            return;
          }
        }
      }
      game.frame(dt, render);
    }
    else {
      angle += dt * 0.04;
      renderer.camera.position.set(Math.cos(angle) * 70, 26, Math.sin(angle) * 52);
      renderer.camera.lookAt(0, 2, 0);
      renderer.camera.fov = 60; renderer.camera.updateProjectionMatrix();
      backdrop?.update(now / 1000);
      renderer.render(now / 1000);
    }
  };

  let benchLeft = -1;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const interval = now - previous;
    const dt = fixed ? 1 / 30 : Math.max(0, Math.min(0.05, interval / 1000)); previous = now;
    const t0 = performance.now();
    if (bench && !bench.done && game) bench.drive(dt);
    
    // 👇 إيقاف مؤقت لمنع التجميد إذا كانت الشاشات مفتوحة 👇
    if (privateOverlay.style.display === 'flex' || waitOverlay.style.display === 'flex') {
        return;
    }

    step(dt, now);
    if (game && !fixed) frameTook(interval);
    if (bench && !bench.done) {
      bench.record(interval, performance.now() - t0);
      const left = Math.ceil(bench.remaining);
      if (left !== benchLeft && benchBanner) { benchLeft = left; benchBanner.textContent = bench.warming ? t('bench.warming') : t('bench.left', { n: left }); }
    }
  };
  if (!params.has('capture')) requestAnimationFrame(loop);
  let simNow = 0;
  const stepFrames = (n: number, render = true) => { for (let i = 0; i < n; i++) { simNow += 1000 / 30; step(1 / 30, simNow, render && i === n - 1); } return n; };
  const startNow = () => { const action = startAction(); return modeOf(action) === 'online' ? run(action) : start(action); };
  
  const autostart = params.get('autostart');
  const roomParam = params.get('room');
  if (autostart === 'quick') {
    menu.style.display = 'none';
        privateOverlay.style.display = 'flex';
          if (autostart === 'quick') {
    menu.style.display = 'none';
    privateOverlay.style.display = 'flex';
    loadHilltopAd(); // 👈 أضف هذا السطر هنا
    run('quick');
  }
    run('quick'); 
  } 
  else if (autostart === 'create') {
    menu.style.display = 'none';
    
    // إظهار اللافتة فوراً
    privateOverlay.style.display = 'flex';
    loadHilltopAd();
    document.getElementById('p-name')!.textContent = (params.get('name') || 'Player') + ' (X)';
    
    // إظهار الكود من الرابط فوراً
    const urlRoomCode = new URLSearchParams(window.location.search).get('room');
    if (urlRoomCode) {
        const el1 = document.getElementById('p-top-code');
        const el2 = document.getElementById('p-center-code');
        if (el1) el1.textContent = urlRoomCode;
        if (el2) el2.textContent = urlRoomCode;
    }

    // مسح الذاكرة (البصمة)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (!urlParams.has('fresh')) {
        localStorage.clear();
        sessionStorage.clear();
        urlParams.set('fresh', 'true');
        window.location.search = urlParams.toString();
        return;
      }
    } catch (e) {
      console.warn("Could not clear storage", e);
    }
    const reqSize = params.get('size') === '6' ? 6 : 1;
    // جلب كل الخرائط التي تدعم هذا الحجم (1 ضد 1 أو 2 ضد 2)
    const availableMaps = mapsFor(reqSize, mode);
    // اختيار خريطة عشوائية من القائمة، وإذا لم توجد نستخدم الخريطة الافتراضية
    const randomMap = availableMaps.length > 0 ? availableMaps[Math.floor(Math.random() * availableMaps.length)] : map;
    
    special = { kind: 'invite', mapId: randomMap, mode, size: reqSize };
    run('start'); 
  } 
  else if (roomParam) {
    roomCode.value = roomParam;
    setTimeout(() => {
      if (autostart === 'create') {
        run('start');
      } else {
        run('code');
      }
    }, 1500);
  }

  if (import.meta.env.DEV) Object.assign(window, { __lb: { get game() { return game; }, get bench() { return bench; }, renderer, assets, step: stepFrames, start: startNow } });
} // 👈 هذا القوس يغلق دالة boot بنجاح
  
void boot().catch(error => {
  console.error(error);
  reportBootFailure(error);
  const message = (error as Error)?.message ?? String(error);
  if (isWebglFailure(message)) showGraphicsHelp(); else status.textContent = t('lobby.unableToStart', { error: message });
});

function showGraphicsHelp() {
  const kind = graphicsHelp(navigator.userAgent);
  const box = document.createElement('div');
  box.className = 'graphics-help';
  const title = document.createElement('strong');
  title.textContent = t('boot.noGraphics');
  const steps = document.createElement('p');
  steps.textContent = t(`boot.graphics.${kind}`);
  const more = document.createElement('p');
  more.className = 'more';
  more.textContent = t('boot.graphicsMore');
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = t('boot.reload');
  reload.addEventListener('click', () => location.reload());
  box.append(title, steps, more, reload);
  status.replaceChildren(box);
  track('error_shown', { where: 'boot', message: `no webgl (${kind})` });
}