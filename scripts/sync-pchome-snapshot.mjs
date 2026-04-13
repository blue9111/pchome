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
const ONSALE_API_URL = 'https://ecapi-cdn.pchome.com.tw/fsapi/cms/onsale';

const parseMoneyText = text => {
  const normalized = String(text || '').replace(/[^\d]/g, '');
  return normalized ? Number(normalized) : 0;
};

const decodeHtmlEntities = text => String(text || '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, '\'')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)));

const stripHtmlTags = text => String(text || '').replace(/<[^>]*>/g, ' ');

const toAbsoluteUrl = url => {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
};

const extractProductId = href => {
  const match = String(href || '').match(/\/prod\/([^/?#]+)/i);
  return match ? match[1] : normalizeSpaces(href);
};

const PRODUCT_IMAGE_CACHE = new Map();
const isPlaceholderImageUrl = url => /mobile_loading\.svg/i.test(String(url || ''));

function collectImageCandidates(text) {
  const source = String(text || '');
  const candidates = [];
  const seen = new Set();
  const add = value => {
    const url = toAbsoluteUrl(normalizeSpaces(value));
    if (!url || seen.has(url) || isPlaceholderImageUrl(url)) return;
    seen.add(url);
    candidates.push(url);
  };

  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image["'][^>]*>/gi,
    /"image"\s*:\s*\[\s*"([^"]+)"/gi,
    /"image"\s*:\s*"([^"]+)"/gi,
    /!\[Image\s+1:[^\]]*\]\(([^)]+)\)/gi,
    /https?:\/\/img\.pchome\.com\.tw\/cs\/items\/[^)\s"'`]+/gi
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      add(match[1] || match[0]);
    }
  }

  return candidates;
}

function extractBestImageUrl(text) {
  for (const candidate of collectImageCandidates(text)) {
    if (candidate && !isPlaceholderImageUrl(candidate)) return candidate;
  }
  return '';
}

async function resolveProductImage(url) {
  const normalized = normalizeSpaces(toAbsoluteUrl(url));
  if (!normalized) return '';
  if (PRODUCT_IMAGE_CACHE.has(normalized)) {
    return await PRODUCT_IMAGE_CACHE.get(normalized);
  }

  const promise = (async () => {
    const directUrl = normalized.replace(/^http:\/\//i, 'https://');
    const candidates = [directUrl, buildJinaUrl(directUrl), buildAllOriginsUrl(buildJinaUrl(directUrl))];
    for (const candidate of candidates) {
      try {
        const text = await fetchTextWithTimeout(candidate, 20000);
        const resolved = extractBestImageUrl(text);
        if (resolved) return resolved;
      } catch (error) {
        // Ignore and continue to the next candidate.
      }
    }
    return '';
  })();

  PRODUCT_IMAGE_CACHE.set(normalized, promise);
  const resolved = await promise;
  if (resolved) {
    PRODUCT_IMAGE_CACHE.set(normalized, resolved);
  } else {
    PRODUCT_IMAGE_CACHE.delete(normalized);
  }
  return resolved;
}

async function repairPlaceholderImages(items) {
  const tasks = [];
  for (const item of items || []) {
    if (!item?.url || !isPlaceholderImageUrl(item.image)) continue;
    tasks.push((async () => {
      const resolved = await resolveProductImage(item.url);
      if (resolved) item.image = resolved;
    })());
  }
  await Promise.all(tasks);
  return items;
}

function parseJsonPayload(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);

  const markdownIndex = raw.indexOf('Markdown Content:');
  const content = markdownIndex >= 0 ? raw.slice(markdownIndex + 'Markdown Content:'.length).trim() : raw;
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  const candidate = start >= 0 && end >= start ? content.slice(start, end + 1) : content;
  return JSON.parse(candidate.trim());
}

function mapOnsaleProduct(product, source) {
  const title = normalizeSpaces(product?.name || '');
  const promo = normalizeSpaces(product?.slogan || '');
  const url = normalizeSpaces(product?.url || '');
  const image = toAbsoluteUrl(product?.image || '');
  const id = normalizeSpaces(product?.id || extractProductId(url));
  const price = parseMoneyText(product?.price?.onsale);
  const originalPrice = parseMoneyText(product?.price?.origin);
  if (!id || !title || !url || !image || !price || !originalPrice || !isThreeCRelatedTitle(title)) return null;

  const discount = originalPrice > price ? Math.round((1 - price / originalPrice) * 1000) / 10 : 0;
  if (discount <= 0) return null;

  return {
    id,
    title,
    spec: promo || '限時瘋搶 3C',
    price,
    originalPrice,
    image,
    url,
    category: detectCategoryFromText(`${title} ${promo}`) || source.category || 'computer',
    query: '限時瘋搶 3C',
    promo,
    discount
  };
}

async function fetchOnsaleSource(source) {
  const limit = source.limit || 12;
  const candidates = [ONSALE_API_URL, buildJinaUrl(ONSALE_API_URL)];
  for (const candidate of candidates) {
    try {
      const responseText = await fetchTextWithTimeout(candidate, 20000);
      const payload = parseJsonPayload(responseText);
      const slots = Array.isArray(payload?.data) ? payload.data : [];
      const items = [];
      for (const slot of slots) {
        const status = String(slot?.status || '').toLowerCase();
        if (status !== 'now' && status !== 'ready') continue;
        for (const product of slot.products || []) {
          const item = mapOnsaleProduct(product, source);
          if (!item) continue;
          items.push(item);
          if (items.length >= limit) return await repairPlaceholderImages(items);
        }
      }
      if (items.length) return await repairPlaceholderImages(items);
    } catch (error) {
      console.warn(`[warn] ${source.key} via ${candidate === ONSALE_API_URL ? 'onsale-api' : 'jina'} failed: ${error.message}`);
    }
  }
  return [];
}

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
    const discount = originalPrice > price ? Math.round((1 - price / originalPrice) * 1000) / 10 : 0;
    if (discount <= 0) continue;

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
      discount
    });

    if (items.length >= (source.limit || 4)) break;
  }

  return items;
}

function parsePchomeHtmlCards(html, source) {
  const sourceText = String(html || '');
  const decodedText = sourceText.replace(/\\\"/g, '"');
  const items = [];
  const seen = new Set();

  for (const match of decodedText.matchAll(/"id":"([^"]+)"/g)) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    const slice = decodedText.slice(match.index, match.index + 9000);
    if (!slice.includes('"imageSrc"') || !slice.includes('"salePrice"') || !slice.includes('"link"')) continue;

    const name = normalizeSpaces(decodeHtmlEntities(stripHtmlTags(slice.match(/"name":"([^"]+)"/)?.[1] || '')));
    const imageSrc = normalizeSpaces(slice.match(/"imageSrc":"([^"]+)"/)?.[1] || '');
    const link = normalizeSpaces(slice.match(/"link":"([^"]+)"/)?.[1] || '');
    const marketingText = normalizeSpaces(decodeHtmlEntities(stripHtmlTags(slice.match(/"marketingText":"([^"]*)"/)?.[1] || '')));
    const price = parseMoneyText(slice.match(/"price":(\d+)/)?.[1]);
    const salePrice = parseMoneyText(slice.match(/"salePrice":(\d+)/)?.[1]);
    if (!name || !imageSrc || !link || !price || !salePrice) continue;

    const title = name;
    if (!isThreeCRelatedTitle(title)) continue;

    const discount = salePrice > price ? Math.round((1 - price / salePrice) * 1000) / 10 : 0;
    if (discount <= 0) continue;

    const url = toAbsoluteUrl(link.startsWith('http') ? link : `https://24h.pchome.com.tw${link}`);
    seen.add(id);
    items.push({
      id,
      title,
      spec: marketingText || source.label || title,
      price,
      originalPrice: salePrice > price ? salePrice : price,
      image: toAbsoluteUrl(imageSrc),
      url,
      category: source.category || detectCategoryFromText(title),
      query: source.label || source.title || 'PChome 3C 分類',
      promo: marketingText,
      discount
    });

    if (items.length >= (source.limit || 4)) break;
  }

  if (items.length) return items;

  for (const chunk of sourceText.split('<li class="c-listInfoGrid__item')) {
    if (!chunk.includes('c-prodInfoV2__link') || !chunk.includes('data-regression="store_prodName"')) continue;

    const hrefMatch = chunk.match(/href="(\/prod\/[^"]+)"/i);
    const imageMatch = chunk.match(/<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"/i);
    const titleMatch = chunk.match(/<h3 class="c-prodInfoV2__title"[^>]*>([\s\S]*?)<\/h3>/i);
    const promoMatch = chunk.match(/<div class="c-prodInfoV2__marketingText"[^>]*>([\s\S]*?)<\/div>/i);
    const priceMatch = chunk.match(/c-prodInfoV2__priceValue c-prodInfoV2__priceValue--m">\$(\d[\d,]*)/i);
    const originalMatch = chunk.match(/c-prodInfoV2__salePrice">[\s\S]*?c-prodInfoV2__priceValue--xs">\$(\d[\d,]*)/i);
    if (!hrefMatch || !titleMatch || !priceMatch || !imageMatch) continue;

    const url = toAbsoluteUrl(`https://24h.pchome.com.tw${hrefMatch[1]}`);
    const cardId = extractProductId(url);
    if (!cardId || seen.has(cardId)) continue;

    const title = normalizeSpaces(decodeHtmlEntities(stripHtmlTags(titleMatch[1])));
    if (!isThreeCRelatedTitle(title)) continue;

    const price = parseMoneyText(priceMatch[1]);
    const originalPrice = parseMoneyText(originalMatch?.[1]) || price;
    if (!title || !price) continue;
    const discount = originalPrice > price ? Math.round((1 - price / originalPrice) * 1000) / 10 : 0;
    if (discount <= 0) continue;

    const image = toAbsoluteUrl(imageMatch[1]);
    const promo = normalizeSpaces(decodeHtmlEntities(stripHtmlTags(promoMatch?.[1])));
    const leadText = promo;
    seen.add(cardId);
    items.push({
      id: cardId,
      title,
      spec: leadText || normalizeSpaces(decodeHtmlEntities(stripHtmlTags(imageMatch[2]))) || source.label || title,
      price,
      originalPrice: originalPrice > price ? originalPrice : price,
      image,
      url,
      category: source.category || detectCategoryFromText(title),
      query: source.label || source.title || 'PChome 3C 分類',
      promo: leadText,
      discount
    });

    if (items.length >= (source.limit || 4)) break;
  }

  return items;
}

async function fetchLiveSource(source) {
  if (source.kind === 'onsale') {
    return await fetchOnsaleSource(source);
  }

  const candidates = [
    { url: source.url, parser: parsePchomeHtmlCards, label: 'html' },
    { url: buildAllOriginsUrl(source.url), parser: parsePchomeHtmlCards, label: 'allorigins-html' },
    { url: buildJinaUrl(source.url), parser: parsePchomeCards, label: 'jina' },
    { url: buildAllOriginsUrl(buildJinaUrl(source.url)), parser: parsePchomeCards, label: 'allorigins' }
  ];
  for (const candidate of candidates) {
    try {
      const responseText = await fetchTextWithTimeout(candidate.url, 20000);
      const parsed = candidate.parser(responseText, source);
      if (parsed.length) return await repairPlaceholderImages(parsed);
    } catch (error) {
      console.warn(`[warn] ${source.key} via ${candidate.label} failed: ${error.message}`);
    }
  }
  return [];
}

function mergeAndSortSnapshot(sourceBuckets) {
  const merged = [];
  const indexByKey = new Map();
  for (const bucket of sourceBuckets) {
    for (const item of bucket || []) {
      if (!item || item.discount <= 0) continue;
      const key = item.id || item.url || item.title;
      if (!key) continue;
      const existingIndex = indexByKey.get(key);
      if (existingIndex === undefined) {
        indexByKey.set(key, merged.length);
        merged.push(item);
        continue;
      }
      const existing = merged[existingIndex];
      if (isPlaceholderImageUrl(existing?.image) && !isPlaceholderImageUrl(item.image)) {
        merged[existingIndex] = { ...existing, ...item };
      }
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
  const priorityKeys = new Set(['ssd-sp', 'ssd-sp-p34a60-512g']);
  const prioritySources = liveSources.filter(source => priorityKeys.has(source.key));
  const otherSources = liveSources.filter(source => !priorityKeys.has(source.key));

  const priorityResults = await Promise.allSettled(prioritySources.map(source => fetchLiveSource(source)));
  const results = [
    ...priorityResults,
    ...(await Promise.allSettled(otherSources.map(source => fetchLiveSource(source))))
  ];
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
