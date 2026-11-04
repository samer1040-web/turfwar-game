import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite';
import { mergeReleases, parseReleaseLog, type Release } from './src/admin/releases';
import { assetVersions, cdnKey, cdnOrigin, fetchCdnIndex, filesIn, hash } from './src/buildtools/assetcdn';
import { sourcemaps } from './src/buildtools/sourcemaps';

function appVersion() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; } catch { return 'dev'; }
}

function releases(): Release[] {
  const snapshot = JSON.parse(readFileSync(resolve(__dirname, 'src/admin/releases.json'), 'utf8')) as Release[];
  const fromGit = ['main', 'HEAD'].flatMap(ref => {
    try { return parseReleaseLog(execSync(`git log ${ref} --first-parent --format=%h%x09%ct%x09%s --`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch { return []; }
  });
  const sha = process.env.VERCEL_GIT_COMMIT_SHA, message = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  const building = sha && message ? parseReleaseLog(`${sha}\t${Math.floor(Date.now() / 1000)}\t${message.split('\n')[0]}`) : [];
  return mergeReleases(snapshot, fromGit, building);
}

const INFO_PAGES = ['about', 'guide', 'maps', 'begone'];

const pageRoutes: Plugin = {
  name: 'page-routes',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      for (const page of ['/admin', '/privacy', '/terms', ...INFO_PAGES.flatMap(p => [`/${p}`, `/en/${p}`])]) {
        if (req.url === page || req.url?.startsWith(`${page}?`)) req.url = `${page}/${req.url.slice(page.length)}`;
      }
      const invite = /^(?:\/r\/[A-Za-z]{4}|\/c)\/?(\?.*)?$/.exec(req.url ?? '');
      if (invite) req.url = `/index.html${invite[1] ?? ''}`;
      next();
    });
  },
};

const fontPreload: Plugin = {
  name: 'font-preload',
  transformIndexHtml: { order: 'pre', handler: html => html.replace(/<!--preload:([a-z0-9,-]+)-->/, (_, names: string) => names.split(',')
    .map(n => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${versioned(`fonts/${n}.woff2`)}" />`).join('\n    ')) },
};

const GAME_PRELOADS = ['assets/weapons.glb', 'assets/props.glb', 'assets/soldier.glb', 'assets/guns.glb', 'assets/soldiers.glb', 'assets/soldier-anims.glb',
  'assets/basis/basis_transcoder.js', 'assets/basis/basis_transcoder.wasm'];
const gamePreload: Plugin = {
  name: 'game-preload',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (!html.includes('<!--preload:game-->')) return html;
      const files = GAME_PRELOADS.map(f => `<link rel="preload" as="fetch" crossorigin fetchpriority="low" href="${versioned(f)}" />`);
      const chunks = Object.values(ctx.bundle ?? {}).flatMap(c => (c.type === 'chunk' ? [c] : []));
      const wanted = ['/src/main.ts', '/src/module_bindings/index.ts', '/three/examples/jsm/loaders/KTX2Loader.js'];
      const scripts = [...new Set(chunks.filter(c => c.moduleIds.some(id => wanted.some(w => id.endsWith(w)))).flatMap(c => [c.fileName, ...c.imports]))]
        .filter(f => !html.includes(f));
      const base = crazygames ? './' : '/turfwar-game/'; // 👈 تم إصلاح المسار هنا
      return html.replace('<!--preload:game-->', [...scripts.map(f => `<link rel="modulepreload" crossorigin href="${base}${f}" />`), ...files].join('\n    '));
    },
  },
};

const publicDir = resolve(__dirname, 'public');
const VERSIONS = assetVersions(publicDir);
let cdn: { origin: string; files: Set<string> } | undefined;
let crazygames = false;

const versioned = (file: string) => cdn?.files.has(file) ? `${cdn.origin}/${cdnKey(file, VERSIONS[file])}`
  : `${crazygames ? '' : '/turfwar-game/'}${file}${VERSIONS[file] ? `?v=${VERSIONS[file]}` : ''}`; // 👈 تم إصلاح المسار هنا

const versionedCssUrls: Plugin = {
  name: 'versioned-css-urls',
  enforce: 'pre',
  transform(code, id) {
    if (!/\.css($|\?)/.test(id)) return;
    return code.replace(/url\((['"]?)\/([^'")?#]+)\1\)/g, (all, quote: string, file: string) => VERSIONS[file] ? `url(${quote}${crazygames ? '../' : ''}${versioned(file)}${quote})` : all);
  },
};

const pwa: Plugin = {
  name: 'pwa-service-worker',
  apply: (_, env) => env.command === 'build' && env.mode !== 'crazygames',
  writeBundle(options, bundle) {
    const info = new RegExp(`^(en/)?(${INFO_PAGES.join('|')})/`);
    const built = Object.keys(bundle).filter(f => f !== 'sw.js' && !f.startsWith('admin') && !f.includes('/admin') && !info.test(f) && !f.endsWith('.map'));
    const pub = filesIn(publicDir).sort();
    const shell = [...built.map(f => `/turfwar-game/${f}`), ...pub.filter(f => f === 'manifest.webmanifest' || (f.startsWith('icons/') && !f.includes('512')) || /^fonts\/rajdhani-\d+\.woff2$/.test(f)).map(versioned)].sort(); // 👈 تم إصلاح المسار هنا
    const data = { shell, shellVersion: `${appVersion()}-${hash(built.sort().join('|'))}`, assets: Object.keys(VERSIONS).map(versioned), assetOrigin: cdn?.origin ?? '' };
    const file = join(options.dir!, 'sw.js');
    const code = readFileSync(file, 'utf8');
    const filled = code.replace(/(["'`])__TURFWAR_BUILD__\1/, JSON.stringify(JSON.stringify(data)));
    if (filled === code) throw new Error('sw.js: the build placeholder is missing');
    writeFileSync(file, filled);
  },
};

const crazygamesPage: Plugin = {
  name: 'crazygames-page',
  apply: (_, env) => env.mode === 'crazygames',
  transformIndexHtml: { order: 'pre', handler: html => html
    .replace(/\s*<link rel="(canonical|manifest|apple-touch-icon)"[^>]*>/g, '')
    .replace(/\s*<meta (property="og:|name="twitter:|name="robots"|name="apple-mobile-web-app-|name="mobile-web-app-)[^>]*>/g, '')
    .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/, '')
    .replace(/href="\/icons\//g, 'href="icons/')
    .replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>') },
};

const crazygamesPrune: Plugin = {
  name: 'crazygames-prune',
  apply: (_, env) => env.command === 'build' && env.mode === 'crazygames',
  writeBundle(options) {
    for (const f of readdirSync(options.dir!)) {
      if (/^(og|robots\.txt|sitemap\.xml|llms.*\.txt|manifest\.webmanifest|[0-9a-f]{32}\.txt)$/.test(f)) rmSync(join(options.dir!, f), { recursive: true });
    }
  },
};

function requireCrazygamesEnv(mode: string) {
  const env = loadEnv(mode, __dirname, 'VITE_');
  const problems = [
    !env.VITE_POSTHOG_KEY?.startsWith('phc_') && 'VITE_POSTHOG_KEY (the public phc_… project key)',
    !env.VITE_POSTHOG_HOST && 'VITE_POSTHOG_HOST (https://us.i.posthog.com)',
    !env.VITE_SPACETIMEDB_URI?.startsWith('wss://') && 'VITE_SPACETIMEDB_URI (a wss:// URI; CrazyGames has no same-origin proxy)',
    !env.VITE_SPACETIMEDB_DATABASE && 'VITE_SPACETIMEDB_DATABASE',
  ].filter(Boolean);
  if (problems.length) throw new Error(`The CrazyGames build needs the production values. Missing or wrong: ${problems.join(', ')}. Put them in .env.crazygames.local (docs/DEVELOPMENT.md, "CrazyGames build").`);
}

async function assetCdn(): Promise<typeof cdn> {
  const origin = cdnOrigin(process.env);
  if (!origin) return undefined;
  const index = await fetchCdnIndex(origin);
  const files = new Set(Object.keys(VERSIONS).filter(f => index?.files[cdnKey(f, VERSIONS[f])]));
  const missing = Object.keys(VERSIONS).length - files.size;
  if (!index) console.warn(`asset CDN: ${origin} has no readable index; every asset is served by the site (bun run cdn:deploy).`);
  else if (missing) console.warn(`asset CDN: ${missing} changed file(s) not on ${origin} yet, served by the site: run bun run cdn:deploy.`);
  return { origin, files };
}

export default defineConfig(async ({ command, mode }): Promise<UserConfig> => {
  crazygames = mode === 'crazygames';
  if (crazygames && command === 'build') requireCrazygamesEnv(mode);
  cdn = command === 'build' && !crazygames ? await assetCdn() : undefined;
  const cdnLocal = cdn ? Object.keys(VERSIONS).filter(f => !cdn!.files.has(f)) : [];
  return {
    base: '/turfwar-game/',
    plugins: [pageRoutes, versionedCssUrls, fontPreload, gamePreload, crazygamesPage, crazygamesPrune, pwa, sourcemaps(appVersion())],
    define: { __APP_VERSION__: JSON.stringify(appVersion()), __ASSET_VERSIONS__: JSON.stringify(VERSIONS), __ASSET_CDN__: JSON.stringify(cdn ? { origin: cdn.origin, local: cdnLocal } : null), __RELEASES__: JSON.stringify(releases()) },
    server: {
      allowedHosts: true,
      proxy: { '/stdb': { target: process.env.STDB_PROXY_TARGET || 'http://127.0.0.1:3000', ws: true, rewrite: path => path.replace(/^\/stdb/, '') } },
    },
    build: {
      outDir: crazygames ? 'dist-crazygames' : 'dist',
      sourcemap: 'hidden',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        input: crazygames ? { main: resolve(__dirname, 'index.html') } : {
          main: resolve(__dirname, 'index.html'), privacy: resolve(__dirname, 'privacy/index.html'), terms: resolve(__dirname, 'terms/index.html'),
          ...Object.fromEntries(INFO_PAGES.flatMap(p => [[p, resolve(__dirname, `${p}/index.html`)], [`${p}En`, resolve(__dirname, `en/${p}/index.html`)]])),
          admin: resolve(__dirname, 'admin/index.html'), sw: resolve(__dirname, 'src/pwa/sw.ts'),
        },
        output: { manualChunks: { three: ['three'] }, entryFileNames: chunk => chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js' },
      },
    },
  };
});