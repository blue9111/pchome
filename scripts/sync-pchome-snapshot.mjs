import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const SNAPSHOT_JSON_PATH = path.join(ROOT, 'pchome-snapshot.json');
const SNAPSHOT_JS_PATH = path.join(ROOT, 'pchome-snapshot.js');

const LIVE_CATEGORY_SOURCES = [
  { key: 'laptop-lenovo-screen', url: 'https://24h.pchome.com.tw/category/DHBF06C', label: 'Lenovo 依螢幕推薦', category: 'computer', limit: 12 },
  { key: 'mobile', url: 'https://24h.pchome.com.tw/region/DGAS', label: '一般手機', category: 'mobile', limit: 8 },
  { key: 'wearable', url: 'https://24h.pchome.com.tw/region/DYAI', label: '智慧穿戴', category: 'wearable', limit: 6 },
  { key: 'power-bank', url: 'https://24h.pchome.com.tw/region/DYAO', label: '行動電源', category: 'mobile', limit: 8 },
  { key: 'apple-watch', url: 'https://24h.pchome.com.tw/category/DYAJ75C', label: 'Apple Watch', category: 'wearable', limit: 6 },
  { key: 'computer-gaming', url: 'https://24h.pchome.com.tw/region/DSAX', label: '電競專區', category: 'computer', limit: 8 },
  { key: 'computer-accessory', url: 'https://24h.pchome.com.tw/region/DCAG', label: '筆電周邊/配件', category: 'computer', limit: 8 },
  { key: 'laptop-main', url: 'https://24h.pchome.com.tw/region/DHAM', label: '筆電', category: 'computer', limit: 6 },
  { key: 'laptop-picks', url: 'https://24h.pchome.com.tw/region/DHAA', label: '筆記電腦', category: 'computer', limit: 6 },
  { key: 'laptop-special', url: 'https://24h.pchome.com.tw/region/DHAB', label: '特仕筆電', category: 'computer', limit: 6 },
  { key: 'laptop-gaming', url: 'https://24h.pchome.com.tw/region/DHAW', label: '電競筆電', category: 'computer', limit: 6 },
  { key: 'laptop-ai', url: 'https://24h.pchome.com.tw/region/DHAR', label: 'RTX AI PC', category: 'computer', limit: 6 },
  { key: 'laptop-acer', url: 'https://24h.pchome.com.tw/region/DHAE', label: 'ACER宏碁筆電', category: 'computer', limit: 4 },
  { key: 'laptop-asus', url: 'https://24h.pchome.com.tw/region/DHAF', label: 'ASUS華碩筆電', category: 'computer', limit: 4 },
  { key: 'laptop-hp', url: 'https://24h.pchome.com.tw/region/DHAG', label: 'HP惠普筆電', category: 'computer', limit: 4 },
  { key: 'laptop-dell', url: 'https://24h.pchome.com.tw/region/DHAI', label: 'DELL戴爾筆電', category: 'computer', limit: 4 },
  { key: 'laptop-surface', url: 'https://24h.pchome.com.tw/region/DHAY', label: 'Surface 筆電', category: 'computer', limit: 4 },
  { key: 'laptop-hub', url: 'https://24h.pchome.com.tw/region/DCAD', label: '筆電配件 / USB HUB', category: 'computer', limit: 4 },
  { key: 'monitor', url: 'https://24h.pchome.com.tw/region/DSAB', label: '顯示器', category: 'computer', limit: 6 },
  { key: 'desktop-pc', url: 'https://24h.pchome.com.tw/region/DSAU', label: '主機', category: 'computer', limit: 6 },
  { key: 'surveillance', url: 'https://24h.pchome.com.tw/region/DCAS', label: '監視器', category: 'computer', limit: 6 },
  { key: 'television', url: 'https://24h.pchome.com.tw/region/DPAD', label: '電視', category: 'computer', limit: 6 },
  { key: 'ssd', url: 'https://24h.pchome.com.tw/region/DRAH', label: 'SSD', category: 'computer', limit: 6 },
  { key: 'memory', url: 'https://24h.pchome.com.tw/region/DRAC', label: '記憶體', category: 'computer', limit: 6 },
  { key: 'external-storage', url: 'https://24h.pchome.com.tw/region/DRAA', label: '行動固態硬碟', category: 'computer', limit: 6 },
  { key: 'nas', url: 'https://24h.pchome.com.tw/region/DRAG', label: 'NAS', category: 'computer', limit: 6 },
  { key: 'internal-storage', url: 'https://24h.pchome.com.tw/region/DRAB', label: '內接硬碟', category: 'computer', limit: 6 },
  { key: 'computer-network', url: 'https://24h.pchome.com.tw/region/DRAF', label: '網路', category: 'computer', limit: 8 },
  { key: 'router-main', url: 'https://24h.pchome.com.tw/region/DRAN', label: '路由器', category: 'computer', limit: 6 },
  { key: 'router-tplink', url: 'https://24h.pchome.com.tw/store/DRAFJB', label: 'TP-Link 路由器', category: 'computer', limit: 4 },
  { key: 'router-asus', url: 'https://24h.pchome.com.tw/store/DRAFJ5', label: 'ASUS 路由器', category: 'computer', limit: 4 },
  { key: 'router-full', url: 'https://24h.pchome.com.tw/store/DRAFJ8', label: '路由器全系列', category: 'computer', limit: 4 },
  { key: 'router-mercusys', url: 'https://24h.pchome.com.tw/store/DRAFEM', label: 'Mercusys 路由器', category: 'computer', limit: 4 },
  { key: 'router-gaming', url: 'https://24h.pchome.com.tw/store/DRAFKW', label: '電競路由器', category: 'computer', limit: 4 },
  { key: 'keyboard', url: 'https://24h.pchome.com.tw/region/DCAH', label: '鍵盤', category: 'computer', limit: 6 },
  { key: 'mouse', url: 'https://24h.pchome.com.tw/store/DCANSS', label: '無線滑鼠', category: 'computer', limit: 6 },
  { key: 'mouse-razer', url: 'https://24h.pchome.com.tw/store/DCANXE', label: 'Razer 滑鼠', category: 'computer', limit: 6 },
  { key: 'bluetooth-headset', url: 'https://24h.pchome.com.tw/category/DYAQ15C', label: '藍牙耳機', category: 'accessory', limit: 8 }
];

const accessoryPattern = /延長線|排插|插座|轉接頭|轉接器|USB\s*Hub|集線器|傳輸線|充電線|線材|保護殼|保護貼|滑鼠墊|支架|收納盒|手機架|車架|車充/i;
const wearablePattern = /Apple Watch|Watch Ultra|Watch SE|Galaxy Watch|Garmin|Fitbit|Amazfit|華米|HUAWEI WATCH|小米手錶|智慧手錶|智能手錶|智慧.*手環|健康.*手環|運動.*手環|手錶|穿戴裝置|Wearable/i;
const mobilePattern = /手機|iPhone|iPad|平板|AirPods|耳機|耳麥|耳塞|行動電源|充電|Pubook|電子書|閱讀器|電子紙|Xiaomi|小米|Samsung|三星|Galaxy|OPPO|vivo|Zenfone|Xperia|Redmi|Pixel|Nothing Phone|ROG Phone|藍牙/i;
const computerPattern = /筆電|桌機|顯示器|螢幕|SSD|固態硬碟|行動固態硬碟|NVMe|M\.2|硬碟|記憶體|顯卡|GPU|RTX|主機|NAS|路由器|鍵盤|滑鼠|喇叭/i;
const otherPattern = /相機|鏡頭|攝影|CarPlay|播放器|掃拖機器人|洗地機|機器人|咖啡機|電風扇|RO濾淨|飲水機|電視|投影|遊戲主機|Switch|PS5|Xbox/i;

const buildJinaUrl = url => `https://r.jina.ai/http://${String(url || '').replace(/^https?:\/\//, '')}`;
const buildAllOriginsUrl = url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&_=${Date.now()}`;
const normalizeSpaces = text => (text || '').replace(/\s+/g, ' ').trim();
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
const isAccessoryTitle = title => accessoryPattern.test(title || '');
const isWearableTitle = title => wearablePattern.test(title || '');
const isMobileTitle = title => mobilePattern.test(title || '');
const isComputerTitle = title => computerPattern.test(title || '');
const isOtherTitle = title => otherPattern.test(title || '');
const isThreeCRelatedTitle = title => !/魚油|保健|食品|衛生紙|雨衣|黃金|人體工學椅|家具|清潔|美容|化妝|母嬰|玩具|寵物|兒童|飾品|項鍊|手鍊|戒指|吊飾|服飾/i.test(title || '') && (isAccessoryTitle(title) || isWearableTitle(title) || isMobileTitle(title) || isComputerTitle(title) || isOtherTitle(title));
const percent = (price, originalPrice) => !originalPrice || originalPrice <= price ? 0 : Math.round((1 - price / originalPrice) * 1000) / 10;

async function fetchTextWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 (Codex PChome sync)'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
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
      query: source.label || source.title || 'PChome 3C 分類',
      discount: percent(price, originalPrice > price ? originalPrice : price)
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
  const results = await Promise.allSettled(LIVE_CATEGORY_SOURCES.map(source => fetchLiveSource(source)));
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

  console.log(`Fetched ${snapshot.length} products from ${LIVE_CATEGORY_SOURCES.length} sources.`);
  console.log(`Updated files: ${[htmlChanged && 'index.html', jsChanged && 'pchome-snapshot.js', jsonChanged && 'pchome-snapshot.json'].filter(Boolean).join(', ') || 'none'}.`);
}

await main();
