import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, normalize, resolve, sep } from 'node:path';
import { loadSourceRegistry, importSourceUrls, fetchTextWithTimeout, ROOT } from './pchome-source-registry.mjs';

const PORT = Number(process.env.PCHOME_SOURCE_PORT || 8787);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(body);
}

function safeResolve(requestPath) {
  const normalized = normalize(decodeURIComponent(requestPath || '/')).replace(/^([/\\])+/, '');
  const target = resolve(ROOT, normalized || 'source-manager.html');
  const rootWithSep = ROOT.endsWith(sep) ? ROOT : `${ROOT}${sep}`;
  if (!target.startsWith(rootWithSep)) return null;
  return target;
}

async function readRequestBody(req, maxBytes = 1_000_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error('Request body too large');
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleImport(req, res) {
  const rawBody = await readRequestBody(req);
  let text = rawBody;
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(rawBody || '{}');
      text = parsed.text || parsed.urls?.join('\n') || parsed.url || '';
    } catch {
      text = rawBody;
    }
  }

  if (!String(text || '').trim()) {
    sendJson(res, 400, { error: 'Missing URLs to import.' });
    return;
  }

  const result = await importSourceUrls(text, { fetchText: fetchTextWithTimeout });
  sendJson(res, 200, result);
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, port: PORT });
    return;
  }

  if (url.pathname === '/api/sources' && req.method === 'GET') {
    const sources = await loadSourceRegistry();
    sendJson(res, 200, { sources });
    return;
  }

  if (url.pathname === '/api/sources/import' && req.method === 'POST') {
    await handleImport(req, res);
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type'
    });
    res.end();
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(302, { location: '/source-manager.html' });
    res.end();
    return;
  }

  const filePath = safeResolve(url.pathname);
  if (!filePath) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  let content = null;
  try {
    content = await readFile(filePath);
  } catch {
    sendText(res, 404, 'Not found');
    return;
  }

  const type = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(content);
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error(error);
    sendJson(res, 500, { error: error?.message || 'Internal server error' });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PChome source manager running at http://127.0.0.1:${PORT}/source-manager.html`);
});
