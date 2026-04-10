import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAllOriginsUrl,
  buildJinaUrl,
  detectCategoryFromText,
  fetchTextWithTimeout,
  isThreeCRelatedTitle,
  loadSourceRegistry,
  normalizeSpaces
} from './pchome-source-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const SNAPSHOT_JSON_PATH = path.join(ROOT, 'pchome-snapshot.json');
const SNAPSHOT_JS_PATH = path.join(ROOT, 'pchome-snapshot.js');

const parseMoneyText = text => {
  const normalized = String(text || '').replace(/[^\d]/g, '');
  return normalized ? Number(normalized) : 0;
};

const toAbsoluteUrl = url => {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
};

const extractProductId = href => {
  const match = String(href || '').match(/\/prod\/([^/?#]+)/i);
  return match ? match[1] : normalizeSpaces(href);
};

function parsePchomeCards(markdown, source) {
  const lines = String(markdown || '').split(/\r?\n/);
  const items = [];
  const seen = new Set();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.includes('http://24h.pchome.com.tw/prod/')) continue;

    const urlMatch = line.match(/\]\((https?:\/\/24h\.pchome\.com\.tw\/prod\/[^)]+)\)\s*$/);
    const imageMatch = line.match(/^\[!\[Image\s+\d+:\s*(.*?)\]\((.*?)\)/);
    if (!urlMatch || !imageMatch) continue;

    const url = urlMatch[1];
    const id = extractProductId(url);
    if (!id || seen.has(id)) continue;

    const image = toAbsoluteUrl(imageMatch[2]);
    const body = line
      .replace(/^\[!\[Image\s+\d+:\s*.*?\]\(.*?\)\s*/, '')
      .replace(/!\[Image\s+\d+:[^\]]*\]\([^)]*\)\s*/g, ' ')
      .replace(/\]\((https?:\/\/24h\.pchome\.com\.tw\/prod\/[^)]+)\)\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    const titleMatch = body.match(/###\s*(.*?)\s+\$(\d[\d,]*)(?:\s+\$(\d[\d,]*))?/);
    if (!titleMatch) continue;

    const title = normalizeSpaces(titleMatch[1]);
    if (!isThreeCRelatedTitle(title)) continue;

    const price = parseMoneyText(titleMatch[2]);
    const originalPrice = parseMoneyText(titleMatch[3]) || price;
    if (!title || !price || !image) continue;

    const leadText = normalizeSpaces(body.slice(0, body.indexOf('###')).replace(/^[\s*•]+|[\s*•]+$/g, ''));
    seen.add(id);
    items.push({
      id,
      title,
      spec: leadText || normalizeSpaces(imageMatch[1]) || source.label || title,
      price,
      originalPrice: originalPrice > price ? originalPrice : price,
      image,
      url,
      category: source.category || detectCategoryFromText(title),
      query: source.label || source.title || 'PChome 3C 分類',
      promo: leadText,
      discount: originalPrice > price ? Math.round((1 - price / originalPrice) * 1000) / 10 : 0
    });

    if (items.length >= (source.limit || 4)) break;
  }

  return items;
}

async function fetchLiveSource(source) {
  const candidates = [buildJinaUrl(source.url), buildAllOriginsUrl(buildJinaUrl(source.url))];
  for (const candidate of candidates) {
    try {
      const responseText = await fetchTextWithTimeout(candidate, 20000);
      const parsed = parsePchomeCards(responseText, source);
      if (parsed.length) return parsed;
    } catch (error) {
      console.warn(`[warn] ${source.key} via ${candidate.includes('allorigins') ? 'allorigins' : 'jina'} failed: ${error.message}`);
    }
  }
  return [];
}

function mergeAndSortSnapshot(sourceBuckets) {
  const merged = [];
  const seen = new Set();
  for (const bucket of sourceBuckets) {
    for (const item of bucket || []) {
      const key = item.id || item.url || item.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  merged.sort((a, b) => b.discount - a.discount || a.title.localeCompare(b.title, 'zh-Hant') || a.price - b.price);
  return merged;
}

function escapeInlineScriptJson(jsonText) {
  return jsonText.replace(/<\/script>/gi, '<\\/script>');
}

async function readText(filePath) {
  return await readFile(filePath, 'utf8');
}

async function writeIfChanged(filePath, nextContent) {
  let currentContent = null;
  try {
    currentContent = await readText(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (currentContent === nextContent) return false;
  await writeFile(filePath, nextContent, 'utf8');
  return true;
}

async function updateIndexHtml(snapshotJson) {
  const html = await readText(INDEX_PATH);
  const nextHtml = html.replace(
    /(<script id="snapshotData" type="application\/json">)\s*[\s\S]*?\s*(<\/script>)/,
    `$1\n${escapeInlineScriptJson(snapshotJson)}\n$2`
  );
  if (nextHtml === html) {
    throw new Error('Failed to locate the snapshotData block in index.html');
  }
  return await writeIfChanged(INDEX_PATH, nextHtml);
}

async function main() {
  const liveSources = await loadSourceRegistry();
  const results = await Promise.allSettled(liveSources.map(source => fetchLiveSource(source)));
  const fulfilled = results.map(result => (result.status === 'fulfilled' ? result.value : []));
  const snapshot = mergeAndSortSnapshot(fulfilled);

  if (!snapshot.length) {
    throw new Error('No live PChome products were fetched; snapshot files were not updated.');
  }

  const snapshotJson = JSON.stringify(snapshot);
  const snapshotJs = `window.__PCHOME_SNAPSHOT__ = ${snapshotJson};\n`;
  const snapshotJsonFile = `${snapshotJson}\n`;

  const htmlChanged = await updateIndexHtml(snapshotJson);
  const jsChanged = await writeIfChanged(SNAPSHOT_JS_PATH, snapshotJs);
  const jsonChanged = await writeIfChanged(SNAPSHOT_JSON_PATH, snapshotJsonFile);

  console.log(`Fetched ${snapshot.length} products from ${liveSources.length} sources.`);
  console.log(`Updated files: ${[htmlChanged && 'index.html', jsChanged && 'pchome-snapshot.js', jsonChanged && 'pchome-snapshot.json'].filter(Boolean).join(', ') || 'none'}.`);
}

await main();
