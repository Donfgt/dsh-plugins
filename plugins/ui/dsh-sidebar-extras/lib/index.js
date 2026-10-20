/**
 * dsh-sidebar-extras — host half.
 *
 * Serves the two data surfaces the browser half renders:
 *   - DeepSeek API balance plus an estimated spend derived from balance deltas
 *     (DeepSeek publishes no usage endpoint, so the balance is the only signal).
 *   - The installed bundle list filtered down to skins, with preview images and
 *     apply/remove actions delegated to this profile's plugin manager.
 *
 * Everything lives under one loopback-only prefix route; the browser half never
 * needs a remote service, a built artifact, or a token of its own.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'sidebar-extras';

export const inject = ['webServer', 'pluginManager', 'credentials', 'profileContext'];

const ROUTE_PREFIX = '/sidebar-extras/api';
const BALANCE_URL = 'https://api.deepseek.com/user/balance';
const BALANCE_TTL_MS = 30_000;

/** Bundles that are never skins and must not appear in the gallery. */
const NEVER_SKIN = new Set(['dsh-sidebar-extras', 'dsh-find-plugin', 'dshbase-catalog']);

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
  const credentials = ctx.credentials;
  const webServer = ctx.webServer;
  const balanceCache = { at: 0, payload: undefined, inflight: undefined };
  const previewCache = new Map();

  const historyPath = () => join(profileDir, '.sidebar-extras', 'balance-history.json');

  async function readHistory() {
    try {
      const parsed = JSON.parse(await readFile(historyPath(), 'utf8'));
      return Array.isArray(parsed?.samples) ? parsed.samples : [];
    } catch {
      return [];
    }
  }

  async function writeHistory(samples) {
    try {
      await mkdir(join(profileDir, '.sidebar-extras'), { recursive: true });
      await writeFile(historyPath(), JSON.stringify({ version: 1, samples }), 'utf8');
    } catch (error) {
      ctx.logger?.warn?.(`dsh-sidebar-extras: cannot persist balance history: ${error.message}`);
    }
  }

  async function resolveApiKey() {
    for (const ref of ['DEEPSEEK_API_KEY', 'DEEPSEEK']) {
      try {
        const resolved = await credentials.resolve(ref);
        if (resolved?.value) return resolved.value;
      } catch {
        /* try the next reference */
      }
    }
    const fromEnv = process.env.DEEPSEEK_API_KEY;
    return fromEnv && fromEnv.trim() ? fromEnv.trim() : undefined;
  }

  function startOfToday() {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  }

  /** Spend estimated from decreases between consecutive balance samples. */
  function estimateUsage(samples) {
    const now = Date.now();
    const dayStart = startOfToday();
    const weekStart = dayStart - 6 * 86_400_000;
    const monthStart = dayStart - 29 * 86_400_000;
    let today = 0;
    let week = 0;
    let month = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const prev = samples[i - 1];
      const cur = samples[i];
      const drop = Number(prev.cny) - Number(cur.cny);
      if (!Number.isFinite(drop) || drop <= 0) continue;
      if (cur.t >= monthStart) month += drop;
      if (cur.t >= weekStart) week += drop;
      if (cur.t >= dayStart) today += drop;
    }
    return {
      today: Number(today.toFixed(4)),
      week: Number(week.toFixed(4)),
      month: Number(month.toFixed(4)),
      samples: samples.length,
      firstSampleAt: samples.length > 0 ? samples[0].t : null,
      lastSampleAt: samples.length > 0 ? samples[samples.length - 1].t : null,
      computedAt: now,
    };
  }

  async function loadBalance() {
    const key = await resolveApiKey();
    if (!key) {
      return {
        ok: false,
        error: 'no-credential',
        message: '未找到 DEEPSEEK_API_KEY（凭据或环境变量）。',
        usage: estimateUsage(await readHistory()),
      };
    }
    const response = await fetch(BALANCE_URL, {
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        error: `http-${response.status}`,
        message: `余额接口返回 ${response.status}: ${text.slice(0, 200)}`,
        usage: estimateUsage(await readHistory()),
      };
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return { ok: false, error: 'bad-json', message: '余额接口返回了非 JSON 内容。' };
    }
    const info = Array.isArray(payload?.balance_infos) ? payload.balance_infos[0] : undefined;
    if (!info) {
      return { ok: false, error: 'no-balance-info', message: '余额接口没有返回 balance_infos。' };
    }
    const total = Number(info.total_balance);
    const samples = await readHistory();
    const now = Date.now();
    const last = samples[samples.length - 1];
    const changed = !last || last.cny !== total || now - last.t > 10 * 60_000;
    if (changed) samples.push({ t: now, cny: Number.isFinite(total) ? total : 0 });
    const cutoff = now - 60 * 86_400_000;
    const trimmed = samples.filter((sample) => sample.t >= cutoff).slice(-5000);
    if (changed || trimmed.length !== samples.length) await writeHistory(trimmed);
    return {
      ok: true,
      at: now,
      available: payload?.is_available !== false,
      currency: info.currency ?? 'CNY',
      total: info.total_balance,
      granted: info.granted_balance,
      toppedUp: info.topped_up_balance,
      usage: estimateUsage(trimmed),
    };
  }

  async function refreshBalance(force) {
    const fresh = Date.now() - balanceCache.at < BALANCE_TTL_MS;
    if (!force && fresh && balanceCache.payload) return balanceCache.payload;
    if (balanceCache.inflight) return balanceCache.inflight;
    balanceCache.inflight = (async () => {
      try {
        const payload = await loadBalance();
        balanceCache.payload = payload;
        balanceCache.at = Date.now();
        return payload;
      } finally {
        balanceCache.inflight = undefined;
      }
    })();
    return balanceCache.inflight;
  }

  async function findPreview(packageName, dir) {
    const cached = previewCache.get(packageName);
    if (cached) return cached;
    const bundled = bundledPreviewFor(packageName);
    if (bundled) {
      const result = { bundled: true, file: bundled };
      previewCache.set(packageName, result);
      return result;
    }
    const images = (await collectImages(dir)).filter((image) => !/icon|logo|badge|favicon|sprite/i.test(image.rel));
    if (images.length === 0) return undefined;
    images.sort((a, b) => b.score - a.score || b.bytes - a.bytes);
    const result = { bundled: false, file: images[0].rel };
    previewCache.set(packageName, result);
    return result;
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
      const dir = packageDirOf(profileDir, bundle.name);
      const preview = dir ? await findPreview(bundle.name, dir) : undefined;
      const looksLikeSkin = /(^|[-/@])(skin|theme|ui)([-@/]|$)/i.test(bundle.name);
      if (!preview && !looksLikeSkin) continue;
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
      if (req.method === 'GET' && (path === '/balance' || path === '/balance/')) {
        return sendJson(res, 200, await refreshBalance(url.searchParams.get('refresh') === '1'));
      }
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
