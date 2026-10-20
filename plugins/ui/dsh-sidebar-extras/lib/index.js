/**
 * dsh-sidebar-extras — host half.
 *
 * Serves the skin gallery the browser half renders: the bundles that look like
 * skins, their preview images, and apply/remove actions delegated to this
 * profile's plugin manager.
 *
 * Balance and usage are *not* part of this plugin any more — dsh-whale-widget
 * owns that surface (per-turn cost with peak/off-peak pricing beats a sampled
 * balance delta). Everything here lives under one loopback-only prefix route.
 */
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'sidebar-extras';

export const inject = ['webServer', 'pluginManager', 'profileContext'];

const ROUTE_PREFIX = '/sidebar-extras/api';

/** Bundles that are never skins and must not appear in the gallery. */
const NEVER_SKIN = new Set(['dsh-sidebar-extras', 'dsh-find-plugin', 'dshbase-catalog']);

/**
 * Non-skin bundles that still belong in the gallery because they restyle the
 * page (the 2005-ads joke plugin is one) instead of matching by name.
 */
const SKIN_ALLOWLIST = [/dsh-ads/i];

/** Name shapes that read as a skin without a bundled preview. */
const SKIN_NAME = /(^|[-/@])(skin|theme|ui)([-@/]|$)/i;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

/** Where a bundle keeps preview art, in the order worth looking at. */
const PREVIEW_DIRS = [
  'preview',
  'previews',
  'docs/screenshots',
  'docs/preview',
  'docs',
  'screenshots',
  'assets/screenshots',
  'assets/previews',
  'assets',
  'images',
  'img',
  'media',
  '',
];

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * Preview art bundled with this plugin, keyed by package-name pattern.
 * Installed skin packages usually ship no screenshots (npm `files` drops
 * them), so the gallery would otherwise be blank for most skins.
 */
const BUNDLED_PREVIEWS = [
  [/day-night/i, 'day-night.webp'],
  [/maid-whale/i, 'maid-whale.webp'],
  [/joi-channel/i, 'joi-channel.webp'],
  [/open-sea/i, 'open-sea.webp'],
  [/catppuccin/i, 'catppuccin.webp'],
  [/qingxiao|清宵/i, 'qingxiao.webp'],
  [/maid-atelier|deep-whale/i, 'maid-atelier.webp'],
  [/minecraft/i, 'minecraft.webp'],
  [/uiskin|blue-glass/i, 'uiskin.webp'],
  [/liquid-glass/i, 'liquid-glass.webp'],
  [/client-ui-skins|crimson-moon/i, 'crimson-moon.webp'],
  [/claude/i, 'claude.webp'],
  [/cyrene/i, 'cyrene.webp'],
  [/yoimiya/i, 'yoimiya.webp'],
];

/** Directory holding the bundled preview art, next to lib/. */
const PREVIEW_ROOT = fileURLToPath(new URL('../previews/', import.meta.url));

function bundledPreviewFor(packageName) {
  for (const [pattern, file] of BUNDLED_PREVIEWS) {
    if (pattern.test(packageName) && existsSync(join(PREVIEW_ROOT, file))) return file;
  }
  return undefined;
}

function isLoopback(address) {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('127.');
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(new Error(`invalid JSON body: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

/** Resolve one bundle's installed directory from the profile's node_modules. */
function packageDirOf(profileDir, packageName) {
  const direct = join(profileDir, 'node_modules', ...packageName.split('/'));
  return existsSync(join(direct, 'package.json')) ? direct : undefined;
}

function scoreCandidate(relPath, dirHint, bytes) {
  const file = relPath.toLowerCase();
  let score = 0;
  if (/(^|[/_-])(dark|night)([/_.-]|$)/.test(file)) score += 3;
  if (/(^|[/_-])(preview|screen|screenshot|overview|cover|demo)([/_.-]|$)/.test(file)) score += 4;
  if (/light|bright/.test(file)) score += 1;
  if (dirHint.includes('preview') || dirHint.includes('screenshot')) score += 3;
  if (dirHint.startsWith('docs')) score += 1;
  if (/icon|logo|badge|favicon|avatar|sprite/.test(file)) score -= 8;
  if (bytes !== undefined) {
    if (bytes > 120_000) score += 2;
    else if (bytes < 15_000) score -= 3;
  }
  return score;
}

/** Depth-limited walk for preview art inside one package. */
async function collectImages(root) {
  const found = [];
  const walk = async (dir, depth, dirHint) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1, dirHint || entry.name);
        continue;
      }
      if (!IMAGE_EXT.has(extname(entry.name).toLowerCase())) continue;
      let bytes;
      try {
        bytes = (await stat(full)).size;
      } catch {
        continue;
      }
      if (bytes < 8_000) continue;
      const rel = relative(root, full).split(sep).join('/');
      found.push({ rel, bytes, dirHint, score: scoreCandidate(rel, dirHint, bytes) });
    }
  };
  for (const dir of PREVIEW_DIRS) {
    const full = join(root, ...dir.split('/').filter(Boolean));
    if (existsSync(full)) await walk(full, 0, dir);
  }
  return found;
}

export function apply(ctx) {
  const profileDir = ctx.profileContext?.dir;
  // Capture the service instances rather than the context: a bundle toggle
  // recomposes the profile and disposes this plugin's context mid-request,
  // while the services themselves stay alive.
  const manager = ctx.pluginManager;
  const webServer = ctx.webServer;
  const previewCache = new Map();

  async function findPreview(packageName, dir) {
    const cached = previewCache.get(packageName);
    if (cached) return cached;
    const bundled = bundledPreviewFor(packageName);
    if (bundled) {
      const result = { bundled: true, file: bundled };
      previewCache.set(packageName, result);
      return result;
    }
    if (!dir) return undefined;
    const images = (await collectImages(dir)).filter((image) => !/icon|logo|badge|favicon|sprite/i.test(image.rel));
    if (images.length === 0) return undefined;
    images.sort((a, b) => b.score - a.score || b.bytes - a.bytes);
    const result = { bundled: false, file: images[0].rel };
    previewCache.set(packageName, result);
    return result;
  }

  /** A bundle is a skin when it is curated, allowlisted, or named like one. */
  function isSkinBundle(packageName) {
    return Boolean(bundledPreviewFor(packageName)) || SKIN_NAME.test(packageName) || SKIN_ALLOWLIST.some((rx) => rx.test(packageName));
  }

  function normalizeRelative(rel) {
    const cleaned = normalize(rel.replace(/^[/\\]+/, '')).replace(/^(\.\.[/\\])+/, '');
    return cleaned.split(sep).join('/');
  }

  async function listSkins() {
    const bundles = await manager.listBundles();
    const rows = [];
    for (const bundle of bundles) {
      if (bundle.official || NEVER_SKIN.has(bundle.name)) continue;
      if (bundle.availability === 'missing') continue;
      if (!isSkinBundle(bundle.name)) continue;
      const dir = packageDirOf(profileDir, bundle.name);
      const preview = await findPreview(bundle.name, dir);
      rows.push({
        name: bundle.name,
        short: bundle.name.replace(/^@[^/]+\//, ''),
        version: bundle.version ?? null,
        enabled: Boolean(bundle.enabled),
        installed: Boolean(bundle.installed),
        removable: Boolean(bundle.removable),
        description: bundle.description ?? null,
        hasPreview: Boolean(preview),
        preview: preview
          ? preview.bundled
            ? `${ROUTE_PREFIX}/skins/preview?name=${encodeURIComponent(bundle.name)}&bundled=1`
            : `${ROUTE_PREFIX}/skins/preview?name=${encodeURIComponent(bundle.name)}&file=${encodeURIComponent(preview.file)}`
          : null,
      });
    }
    rows.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.short.localeCompare(b.short));
    return rows;
  }

  function summarize(result) {
    return {
      ok: result?.application !== 'failed',
      application: result?.application ?? null,
      message: result?.message ?? result?.error ?? null,
      restartRequired: result?.application === 'restart-required',
    };
  }

  async function applySkin(skinName) {
    if (typeof skinName !== 'string' || skinName.length === 0) throw new Error('missing skin name');
    const skins = await listSkins();
    const target = skins.find((row) => row.name === skinName);
    if (!target) throw new Error(`未知皮肤：${skinName}`);
    const changes = [{ name: skinName, ...summarize(await manager.setBundleEnabled(skinName, true)) }];
    for (const other of skins) {
      if (other.name === skinName || !other.enabled) continue;
      try {
        changes.push({ name: other.name, ...summarize(await manager.setBundleEnabled(other.name, false)) });
      } catch (error) {
        changes.push({ name: other.name, ok: false, message: error.message });
      }
    }
    return { applied: skinName, changes };
  }

  async function servePreview(url, res) {
    const packageName = url.searchParams.get('name');
    const bundled = url.searchParams.get('bundled') === '1';
    const file = url.searchParams.get('file');
    if (!packageName || (!bundled && !file)) return sendJson(res, 400, { ok: false, message: 'name and file are required' });
    let full;
    if (bundled) {
      const match = bundledPreviewFor(packageName);
      if (!match) return sendJson(res, 404, { ok: false, message: 'no bundled preview' });
      full = join(PREVIEW_ROOT, match);
    } else {
      const dir = packageDirOf(profileDir, packageName);
      if (!dir) return sendJson(res, 404, { ok: false, message: 'package not found' });
      const rel = normalizeRelative(file);
      full = join(dir, ...rel.split('/'));
      const inside = relative(dir, full);
      if (inside.startsWith('..') || isAbsolute(inside)) return sendJson(res, 400, { ok: false, message: 'invalid path' });
    }
    try {
      const bytes = await readFile(full);
      res.writeHead(200, {
        'content-type': MIME[extname(full).toLowerCase()] ?? 'application/octet-stream',
        'content-length': bytes.length,
        'cache-control': 'private, max-age=300',
      });
      res.end(bytes);
    } catch {
      sendJson(res, 404, { ok: false, message: 'preview not found' });
    }
  }

  async function handle(req, res) {
    if (!isLoopback(req.socket.remoteAddress)) return sendJson(res, 403, { ok: false, message: 'loopback only' });
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname.startsWith(ROUTE_PREFIX) ? url.pathname.slice(ROUTE_PREFIX.length) : url.pathname;
    try {
      if (req.method === 'GET' && path === '/skins') {
        return sendJson(res, 200, { ok: true, skins: await listSkins() });
      }
      if (req.method === 'GET' && path === '/skins/preview') {
        return await servePreview(url, res);
      }
      if (req.method === 'POST' && path === '/skins/apply') {
        const body = await readBody(req);
        previewCache.clear();
        return sendJson(res, 200, { ok: true, ...(await applySkin(body?.name)) });
      }
      if (req.method === 'POST' && path === '/skins/remove') {
        const body = await readBody(req);
        if (typeof body?.name !== 'string' || body.name.length === 0) throw new Error('missing skin name');
        previewCache.clear();
        const result = await manager.removeBundle(body.name);
        return sendJson(res, 200, { ok: result?.application !== 'failed', removed: body.name, ...summarize(result) });
      }
      return sendJson(res, 404, { ok: false, message: `unknown route ${path}` });
    } catch (error) {
      ctx.logger?.warn?.(`dsh-sidebar-extras: ${error.message}`);
      return sendJson(res, 500, { ok: false, message: error.message });
    }
  }

  ctx.effect(() =>
    webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: (req, res) => void handle(req, res),
    }),
  );
}
