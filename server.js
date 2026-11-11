// Local server for Pokémon Tracker. No installs needed beyond Node.js.
// It serves the site and saves your edits into the data folder.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const SPRITES = path.join(DATA, 'sprites');
const PORT = Number(process.env.PORT) || 4173;
const COLLECTIONS = new Set(['pokemon', 'abilities', 'items', 'moves', 'effects', 'trainers', 'tms', 'config']);
const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const MAX_BODY = 25 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

fs.mkdirSync(SPRITES, { recursive: true });

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj));

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const fileFor = (col) => path.join(DATA, col + '.json');
function load(col) {
  try { return JSON.parse(fs.readFileSync(fileFor(col), 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}
function save(col, obj) {
  const sorted = {};
  Object.keys(obj).sort().forEach((k) => { sorted[k] = obj[k]; });
  const tmp = fileFor(col) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(sorted, null, 2) + '\n');
  fs.renameSync(tmp, fileFor(col));
}

// Only this site may write. Other websites open in your browser cannot.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (req.method === 'GET' && parts[1] === 'ping') return json(res, 200, { ok: true });
  if (!sameOrigin(req)) return json(res, 403, { error: 'Not allowed' });

  if (req.method === 'POST' && parts[1] === 'sprite') {
    const ext = path.extname(url.searchParams.get('name') || '').toLowerCase();
    if (!IMAGE_TYPES.has(ext)) return json(res, 400, { error: 'Use a PNG, JPG, GIF or WebP image.' });
    const body = await readBody(req);
    if (!body.length) return json(res, 400, { error: 'The file is empty.' });
    const base = path.basename(url.searchParams.get('name'), path.extname(url.searchParams.get('name')))
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sprite';
    let file = base + ext;
    for (let i = 2; fs.existsSync(path.join(SPRITES, file)); i++) file = `${base}-${i}${ext}`;
    fs.writeFileSync(path.join(SPRITES, file), body);
    return json(res, 200, { file });
  }

  const [, col, id] = parts;
  if (!COLLECTIONS.has(col) || !/^[A-Za-z0-9_-]+$/.test(id || '')) return json(res, 400, { error: 'Bad path' });
  if (req.method === 'PUT') {
    const doc = JSON.parse((await readBody(req)).toString('utf8'));
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return json(res, 400, { error: 'Bad record' });
    const all = load(col);
    all[id] = doc;
    save(col, all);
    return json(res, 200, { ok: true });
  }
  if (req.method === 'DELETE') {
    const all = load(col);
    delete all[id];
    save(col, all);
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: 'Not allowed' });
}

function serve(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Not allowed', 'text/plain');
  const rel = decodeURIComponent(url.pathname) === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
  const full = path.resolve(ROOT, rel);
  const hidden = rel.split(/[\\/]/).some((p) => p.startsWith('.'));
  if (hidden || (full !== ROOT && !full.startsWith(ROOT + path.sep))) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(full, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, buf, MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serve(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'Could not save. Check the terminal window.' });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy. The tracker may already be running at http://localhost:${PORT}`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const link = `http://localhost:${PORT}`;
  console.log(`Pokémon Tracker is running at ${link}`);
  console.log('Keep this window open while you use it. Close it to stop.');
  if (process.argv.includes('--open')) {
    const cmd = process.platform === 'win32' ? `start "" "${link}"` : process.platform === 'darwin' ? `open ${link}` : `xdg-open ${link}`;
    exec(cmd);
  }
});
