import { readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importSourceUrls, fetchTextWithTimeout } from './pchome-source-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE_DIR = path.join(ROOT, 'source-import-queue');

function normalizeQueuePayload(rawText, parsed) {
  if (parsed && typeof parsed === 'object') {
    if (typeof parsed.text === 'string' && parsed.text.trim()) return parsed.text;
    if (typeof parsed.url === 'string' && parsed.url.trim()) return parsed.url;
    if (Array.isArray(parsed.urls) && parsed.urls.length) {
      return parsed.urls.filter(url => String(url || '').trim()).join('\n');
    }
  }

  if (typeof parsed === 'string' && parsed.trim()) {
    return parsed;
  }

  return String(rawText || '').trim();
}

async function collectQueueFiles() {
  try {
    const entries = await readdir(QUEUE_DIR, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
      .map(entry => path.join(QUEUE_DIR, entry.name))
      .sort((a, b) => a.localeCompare(b, 'en'));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function main() {
  const queueFiles = await collectQueueFiles();
  if (!queueFiles.length) {
    console.log('No queued imports found.');
    return;
  }

  let processed = 0;
  let added = 0;
  let skipped = 0;
  let kept = 0;

  for (const filePath of queueFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    let rawText = '';
    let parsed = null;

    try {
      rawText = await readFile(filePath, 'utf8');
      parsed = JSON.parse(rawText);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }
    }

    const text = normalizeQueuePayload(rawText, parsed);
    if (!text) {
      console.log(`Skipping empty queue file: ${relPath}`);
      await unlink(filePath).catch(() => {});
      continue;
    }

    try {
      const result = await importSourceUrls(text, { fetchText: fetchTextWithTimeout });
      processed += 1;
      added += Array.isArray(result.added) ? result.added.length : 0;
      skipped += Array.isArray(result.skipped) ? result.skipped.length : 0;
      console.log(`Applied ${relPath}: +${Array.isArray(result.added) ? result.added.length : 0}, -${Array.isArray(result.skipped) ? result.skipped.length : 0}`);
      await unlink(filePath).catch(() => {});
    } catch (error) {
      kept += 1;
      console.warn(`Kept ${relPath} for retry: ${error?.message || 'unknown error'}`);
    }
  }

  console.log(`Applied ${processed} queued import(s). Added ${added} sources. Skipped ${skipped} item(s). Kept ${kept} file(s) for retry.`);
}

await main();
