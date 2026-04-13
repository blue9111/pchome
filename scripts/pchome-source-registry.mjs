import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_REGISTRY_PATH = path.join(ROOT, 'pchome-sources.json');

const accessoryPattern = /延長線|排插|插座|轉接頭|轉接器|USB\s*Hub|集線器|傳輸線|充電線|線材|保護殼|保護貼|滑鼠墊|支架|收納盒|手機架|車架|車充/i;
const wearablePattern = /Apple Watch|Watch Ultra|Watch SE|Galaxy Watch|Garmin|Fitbit|Amazfit|華米|HUAWEI WATCH|小米手錶|智慧手錶|智能手錶|智慧.*手環|健康.*手環|運動.*手環|手錶|穿戴裝置|Wearable/i;
const storagePattern = /記憶體|RAM|DRAM|DDR[345]|SSD|固態硬碟|行動固態硬碟|外接硬碟|內接硬碟|硬碟|HDD|NVMe|M\.2|U\.2/i;
const computerContextPattern = /筆電|桌機|電腦|螢幕|顯示器|電競|Surface|MacBook|Chromebook/i;
const computerPattern = /筆電|桌機|顯示器|螢幕|SSD|固態硬碟|行動固態硬碟|NVMe|M\.2|硬碟|記憶體|顯卡|GPU|RTX|主機|NAS|路由器|鍵盤|滑鼠|喇叭/i;
const otherPattern = /相機|鏡頭|攝影|CarPlay|播放器|掃拖機器人|洗地機|機器人|咖啡機|電風扇|RO濾淨|飲水機|電視|投影|遊戲主機|Switch|PS5|Xbox/i;

export const normalizeSpaces = text => String(text || '').replace(/\s+/g, ' ').trim();

export const buildJinaUrl = url => `https://r.jina.ai/http://${String(url || '').replace(/^https?:\/\//, '')}`;

export const buildAllOriginsUrl = url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&_=${Date.now()}`;

export function hashString(text) {
  let hash = 2166136261;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function parseUrlList(text) {
  const raw = String(text || '');
  const matches = raw.match(/https?:\/\/[^\s<>"'`]+|(?:^|[\s"'(])24h\.pchome\.com\.tw\/[^\s<>"'`)]+/gi) || [];
  const urls = [];
  for (const match of matches) {
    const cleaned = normalizeSpaces(match).replace(/^[("'`]+/, '').replace(/[),"']+$/, '');
    if (!cleaned) continue;
    urls.push(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
  }
  return [...new Set(urls)];
}

export function isPchome24hUrl(url) {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.hostname === '24h.pchome.com.tw';
  } catch {
    return false;
  }
}

export function normalizeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^24h\.pchome\.com\.tw\//i.test(value)) return `https://${value}`;
  return `https://${value.replace(/^\/+/, '')}`;
}

export function inferSourceKind(url) {
  try {
    const parsed = new URL(normalizeUrl(url));
    if (/^\/search\//i.test(parsed.pathname)) return 'search';
    if (/^\/region\//i.test(parsed.pathname)) return 'region';
    if (/^\/category\//i.test(parsed.pathname)) return 'category';
    if (/^\/store\//i.test(parsed.pathname)) return 'store';
    if (/^\/prod\//i.test(parsed.pathname)) return 'product';
    return 'other';
  } catch {
    return 'other';
  }
}

const storageSourcePathPattern = /^\/store\/(DRAC|DRAH|DRAB|DRAA)/i;

export function inferSourceCategoryFromUrl(url) {
  try {
    const parsed = new URL(normalizeUrl(url));
    if (storageSourcePathPattern.test(parsed.pathname)) return 'mobile';
  } catch {
    // Ignore malformed URLs and fall back to text classification.
  }
  return '';
}

export function canonicalizeSourceUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return '';
  const parsed = new URL(normalized);
  parsed.protocol = 'https:';
  parsed.hostname = '24h.pchome.com.tw';
  parsed.hash = '';
  if (/^\/search\//i.test(parsed.pathname)) {
    const query = parsed.searchParams.get('q') || '';
    parsed.search = query ? `?q=${encodeURIComponent(query)}` : '';
    return parsed.toString();
  }
  parsed.search = '';
  return parsed.toString();
}

export function detectCategoryFromText(text) {
  const value = String(text || '');
  if (accessoryPattern.test(value)) return 'accessory';
  if (wearablePattern.test(value)) return 'wearable';
  if (storagePattern.test(value) && !computerContextPattern.test(value)) return 'mobile';
  if (computerPattern.test(value)) return 'computer';
  if (otherPattern.test(value)) return 'other';
  return 'other';
}

export function isThreeCRelatedTitle(title) {
  const value = String(title || '');
  return value && (accessoryPattern.test(value) || wearablePattern.test(value) || (storagePattern.test(value) && !computerContextPattern.test(value)) || computerPattern.test(value) || otherPattern.test(value));
}

export function defaultLimitForSource(source) {
  const category = source?.category || 'other';
  const kind = source?.kind || inferSourceKind(source?.url || '');
  if (kind === 'search') return 8;
  if (category === 'mobile') return 6;
  if (category === 'wearable') return 6;
  if (category === 'accessory') return 8;
  if (category === 'computer') return kind === 'store' ? 6 : 6;
  return 6;
}

export function buildSourceKey(url, label = '') {
  try {
    const parsed = new URL(normalizeUrl(url));
    const segments = parsed.pathname.split('/').filter(Boolean);
    const tail = segments.slice(-2).join('-') || segments.slice(-1)[0] || '';
    const query = parsed.searchParams.get('q') || '';
    const base = normalizeSpaces([tail, query, label].filter(Boolean).join('-'))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return base || `source-${hashString(parsed.toString()).toString(36)}`;
  } catch {
    return `source-${hashString(url).toString(36)}`;
  }
}

export function extractPageTitle(markdown) {
  const text = String(markdown || '');
  const lines = text.split(/\r?\n/);
  const titleLine = lines.find(line => /^Title:\s*(.+)$/i.test(line));
  if (titleLine) {
    const match = titleLine.match(/^Title:\s*(.+)$/i);
    return normalizeSpaces(match?.[1] || '');
  }
  const headingLine = lines.find(line => /^#\s*(.+)$/.test(line));
  if (headingLine) {
    const match = headingLine.match(/^#\s*(.+)$/);
    return normalizeSpaces(match?.[1] || '');
  }
  const htmlTitle = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (htmlTitle) {
    return normalizeSpaces(htmlTitle[1].replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>'));
  }
  const ogTitle = text.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i)
    || text.match(/<meta[^>]+name=["']title["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']title["'][^>]*>/i);
  if (ogTitle) {
    return normalizeSpaces(ogTitle[1]);
  }
  return '';
}

export function extractDisplayLabelFromMarkdown(markdown) {
  const rawTitle = extractPageTitle(markdown);
  if (!rawTitle) return '';
  const cleaned = normalizeSpaces(rawTitle.replace(/\s*-\s*PChome 24h購物$/i, ''));
  const segments = cleaned.split('|').map(segment => normalizeSpaces(segment)).filter(Boolean);
  return segments.find(segment => !/PChome 24h購物/i.test(segment)) || cleaned;
}

export function extractSearchQueryFromTitle(title) {
  const cleaned = normalizeSpaces(title);
  if (!cleaned) return '';
  const candidates = [...cleaned.matchAll(/\(([^()]+)\)/g)]
    .map(match => normalizeSpaces(match[1]))
    .reverse()
    .filter(part => part.length >= 4 && /[A-Za-z0-9]/.test(part));
  for (const candidate of candidates) {
    if (/[A-Za-z]/.test(candidate) && (/[\d/.-]/.test(candidate) || candidate.length >= 6)) return candidate;
  }
  const regexCandidates = [
    /\b[A-Z0-9]{3,}(?:[\/.-][A-Z0-9]{2,})+\b/i,
    /\b[A-Z]{2,}\d+[A-Z0-9\/.-]*\b/i
  ];
  for (const regex of regexCandidates) {
    const match = cleaned.match(regex);
    if (match && match[0]) return normalizeSpaces(match[0]);
  }
  return '';
}

export function normalizeSourceEntry(source) {
  if (!source || !source.url) return null;
  const url = canonicalizeSourceUrl(source.url);
  if (!url) return null;
  const kind = source.kind || inferSourceKind(url);
  const label = normalizeSpaces(source.label || source.title || '');
  const category = source.category || inferSourceCategoryFromUrl(url) || detectCategoryFromText(`${label} ${url}`);
  const limit = Number.isFinite(Number(source.limit)) ? Number(source.limit) : defaultLimitForSource({ kind, category, url });
  const key = normalizeSpaces(source.key || buildSourceKey(url, label));
  const normalized = {
    key,
    kind,
    url,
    label: label || key,
    category,
    limit
  };
  for (const [field, value] of Object.entries(source)) {
    if (['key', 'kind', 'url', 'label', 'category', 'limit'].includes(field)) continue;
    if (value !== undefined) normalized[field] = value;
  }
  return normalized;
}

export function normalizeSourceList(sources) {
  const merged = [];
  const seen = new Set();
  for (const source of Array.isArray(sources) ? sources : []) {
    const normalized = normalizeSourceEntry(source);
    if (!normalized) continue;
    const key = canonicalizeSourceUrl(normalized.url);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }
  return merged;
}

export async function loadSourceRegistry() {
  const raw = await readFile(SOURCE_REGISTRY_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const sources = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.sources) ? parsed.sources : [];
  return normalizeSourceList(sources);
}

export async function writeSourceRegistry(sources) {
  const normalized = normalizeSourceList(sources);
  await writeFile(SOURCE_REGISTRY_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export async function fetchTextWithTimeout(url, timeoutMs = 15000, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 (Codex PChome sync)',
        ...headers
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFirstText(fetchText, candidates = []) {
  if (typeof fetchText !== 'function') return '';
  let lastError = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const text = await fetchText(candidate);
      if (String(text || '').trim()) return text;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return '';
}

export async function classifySourceUrl(inputUrl, { fetchText } = {}) {
  const normalizedInput = normalizeUrl(inputUrl);
  if (!normalizedInput || !isPchome24hUrl(normalizedInput)) return null;

  const kind = inferSourceKind(normalizedInput);
  if (kind === 'search') {
    const parsed = new URL(normalizedInput);
    const query = normalizeSpaces(parsed.searchParams.get('q') || '');
    if (!query) return null;
    const label = query;
    const category = detectCategoryFromText(query);
    const url = canonicalizeSourceUrl(normalizedInput);
    return normalizeSourceEntry({
      kind,
      url,
      label,
      category,
      limit: defaultLimitForSource({ kind, category, url })
    });
  }

  if (kind === 'region' || kind === 'category' || kind === 'store') {
    const markdown = await fetchFirstText(fetchText, [
      buildJinaUrl(normalizedInput),
      buildAllOriginsUrl(buildJinaUrl(normalizedInput)),
      normalizedInput
    ]);
    const label = extractDisplayLabelFromMarkdown(markdown) || normalizeSpaces(new URL(normalizedInput).pathname.split('/').pop() || normalizedInput);
    const category = inferSourceCategoryFromUrl(normalizedInput) || detectCategoryFromText(`${label} ${normalizedInput}`);
    const url = canonicalizeSourceUrl(normalizedInput);
    return normalizeSourceEntry({
      kind,
      url,
      label,
      category,
      limit: defaultLimitForSource({ kind, category, url })
    });
  }

  if (kind === 'product') {
    const markdown = await fetchFirstText(fetchText, [
      buildJinaUrl(normalizedInput),
      buildAllOriginsUrl(buildJinaUrl(normalizedInput)),
      normalizedInput
    ]);
    const title = extractPageTitle(markdown) || normalizeSpaces(new URL(normalizedInput).pathname.split('/').pop() || normalizedInput);
    const searchQuery = extractSearchQueryFromTitle(title);
    const query = searchQuery || normalizeSpaces(title.replace(/\s*-\s*PChome 24h購物$/i, ''));
    if (!query) return null;
    const searchUrl = canonicalizeSourceUrl(`https://24h.pchome.com.tw/search/?q=${encodeURIComponent(query)}`);
    const label = normalizeSpaces(title
      .replace(/\s*-\s*PChome 24h購物$/i, '')
      .replace(/\s*\([^()]+\)\s*$/, '')) || query;
    const category = detectCategoryFromText(`${title} ${query}`);
    return normalizeSourceEntry({
      kind: 'search',
      url: searchUrl,
      label,
      category,
      limit: defaultLimitForSource({ kind: 'search', category, url: searchUrl })
    });
  }

  return null;
}

export async function importSourceUrls(rawText, { fetchText } = {}) {
  const existing = await loadSourceRegistry();
  const inputUrls = parseUrlList(rawText);
  const existingUrls = new Set(existing.map(source => canonicalizeSourceUrl(source.url)));
  const added = [];
  const skipped = [];

  for (const url of inputUrls) {
    if (!isPchome24hUrl(url)) {
      skipped.push({ input: url, reason: 'not_pchome_url' });
      continue;
    }
    try {
      const source = await classifySourceUrl(url, { fetchText });
      if (!source) {
        skipped.push({ input: url, reason: 'unclassified' });
        continue;
      }
      const canonical = canonicalizeSourceUrl(source.url);
      if (existingUrls.has(canonical) || added.some(item => canonicalizeSourceUrl(item.url) === canonical)) {
        skipped.push({ input: url, reason: 'duplicate', source });
        continue;
      }
      added.push(source);
    } catch (error) {
      skipped.push({ input: url, reason: error?.message || 'classification_failed' });
    }
  }

  const merged = await writeSourceRegistry([...existing, ...added]);
  return { added, skipped, sources: merged };
}
