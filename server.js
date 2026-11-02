'use strict';
// Milestones Music local server: the public site and the admin, on this computer only.
//   node server.js        then open http://localhost:3000  (admin at /admin)
// No extra installs needed: uses only what comes with Node.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { DB, ValidationError } = require('./lib/db');
const { collections, groups } = require('./lib/schema');
const render = require('./lib/render');
const { sendEnquiryEmail } = require('./lib/email');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1'; // local only: not reachable from other computers
const db = new DB({
  dbDir: path.resolve(process.env.DB_DIR || path.join(ROOT, 'db')),
  privateDir: path.resolve(process.env.PRIVATE_DIR || path.join(ROOT, 'private')),
});
const OUTBOX = path.resolve(process.env.OUTBOX_DIR || path.join(ROOT, 'outbox'));
const UPLOAD_ROOT = path.join(ROOT, 'assets', 'uploads');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.pdf': 'application/pdf',
};
const KINDS = { image: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'], audio: ['.mp3', '.m4a', '.wav'], video: ['.mp4', '.webm', '.mov'] };
const STATIC = [['/public/', 'public'], ['/admin/', 'admin'], ['/assets/', 'assets'], ['/source-assets/old-site-videos/', 'source-assets/old-site-videos']];

function inside(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json');

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      let start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
      let end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (st.size === 0 || start < 0 || start >= st.size || end >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-cache' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function readJson(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new ValidationError('Too much data', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new ValidationError('Bad JSON')); } });
    req.on('error', reject);
  });
}

// Changes only allowed from this computer's own pages (stops other websites poking the local admin).
function localRequest(req) {
  const host = String(req.headers.host || '');
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://${host}`;
}

function listFiles() {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) walk(rel);
      else {
        const ext = path.extname(e.name).toLowerCase();
        const kind = Object.keys(KINDS).find((k) => KINDS[k].includes(ext));
        if (kind) out.push({ path: rel, kind, size: fs.statSync(path.join(ROOT, rel)).size });
      }
    }
  };
  walk('assets');
  walk('source-assets/old-site-videos');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function upload(req, res, query) {
  const folder = (query.get('folder') || 'files').replace(/[^a-z]/g, '') || 'files';
  let name = path.basename(query.get('name') || 'file').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+/, '');
  const ext = path.extname(name);
  if (!Object.values(KINDS).flat().includes(ext)) return json(res, 400, { error: 'That file type is not allowed' });
  const dir = path.join(UPLOAD_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });
  let base = name.slice(0, -ext.length) || 'file', n = 1;
  while (fs.existsSync(path.join(dir, name))) name = `${base}-${++n}${ext}`;
  const final = path.join(dir, name), tmp = final + '.part';
  let size = 0, failed = false;
  const out = fs.createWriteStream(tmp);
  req.on('data', (c) => { size += c.length; if (size > 300e6 && !failed) { failed = true; out.destroy(); fs.rm(tmp, () => {}); json(res, 413, { error: 'File too large (max 300 MB)' }); req.destroy(); } });
  req.pipe(out);
  out.on('finish', () => { if (failed) return; fs.renameSync(tmp, final); json(res, 200, { path: path.relative(ROOT, final).split(path.sep).join('/') }); });
  out.on('error', () => { if (!failed) { failed = true; json(res, 500, { error: 'Upload failed' }); } });
}

const REQUIRED_ENQ = ['name', 'phone', 'email', 'eventDate', 'location', 'eventType', 'message'];
async function enquiry(req, res) {
  const b = await readJson(req, 50e3);
  if (b.website) return json(res, 200, { ok: true }); // spam trap
  const clip = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);
  const e = {};
  for (const k of ['name', 'phone', 'email', 'eventDate', 'location', 'eventType', 'preferredBands', 'heardAbout', 'fromBand']) e[k] = clip(b[k]);
  e.message = clip(b.message, 5000);
  const missing = REQUIRED_ENQ.filter((k) => !e[k]);
  if (missing.length) return json(res, 400, { error: 'Please fill in all required fields.' });
  if (!/^\S+@\S+\.\S+$/.test(e.email)) return json(res, 400, { error: 'Please check the email address.' });
  const d = new Date();
  const received = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const row = db.insertRaw('enquiries', { status: 'new', received, ...e, emailStatus: '' });
  let emailStatus;
  try { emailStatus = sendEnquiryEmail({ enquiry: row, settings: db.read('settings'), outboxDir: OUTBOX }); } catch (x) { emailStatus = 'Email failed: ' + x.message; }
  const items = db.read('enquiries');
  const it = items.find((x) => x.id === row.id); it.emailStatus = emailStatus;
  db.write('enquiries', items);
  json(res, 200, { ok: true });
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
  const m = req.method;
  if (m !== 'GET' && m !== 'HEAD' && !localRequest(req)) return json(res, 403, { error: 'Not allowed' });
  if (parts[0] === 'enquiries' && m === 'POST') return enquiry(req, res);
  if (parts[0] === 'me') return json(res, 200, { user: { id: 0, name: 'This Mac', email: '', role: 'admin' }, needsSetup: false, mode: 'local' });
  if (parts[0] === 'logout') return json(res, 200, { ok: true });
  if (parts[0] === 'schema') return json(res, 200, { collections, groups });
  if (parts[0] === 'files') return json(res, 200, { files: listFiles() });
  if (parts[0] === 'upload' && m === 'PUT') return upload(req, res, url.searchParams);
  if (parts[0] === 'status') {
    let outbox = 0; try { outbox = fs.readdirSync(OUTBOX).length; } catch {}
    return json(res, 200, { newEnquiries: db.read('enquiries').filter((e) => e.status === 'new').length, outbox, dbDir: db.dbDir });
  }
  if (parts[0] === 'order' && parts[1] && m === 'PUT') {
    if (!collections[parts[1]]) return json(res, 404, { error: 'Unknown collection' });
    const body = await readJson(req);
    return json(res, 200, db.reorder(parts[1], Array.isArray(body.ids) ? body.ids.map(String) : []));
  }
  if (parts[0] === 'c' && parts[1]) {
    const name = parts[1], id = parts[2];
    if (!collections[name]) return json(res, 404, { error: 'Unknown collection' });
    if (collections[name].single) {
      if (m === 'GET') return json(res, 200, db.read(name));
      if (m === 'PUT') return json(res, 200, db.update(name, null, await readJson(req)));
    } else {
      if (m === 'GET' && !id) return json(res, 200, db.list(name));
      if (m === 'GET') return json(res, 200, db.get(name, id));
      if (m === 'POST' && !id) return json(res, 201, db.create(name, await readJson(req)));
      if (m === 'PUT' && id) return json(res, 200, db.update(name, id, await readJson(req)));
      if (m === 'DELETE' && id) { db.remove(name, id); return json(res, 200, { ok: true }); }
    }
  }
  json(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (p === '/admin' || p === '/admin/') return serveFile(req, res, path.join(ROOT, 'admin', 'index.html'));
    for (const [prefix, dir] of STATIC) {
      if (p.startsWith(prefix)) {
        const file = inside(path.join(ROOT, dir), p.slice(prefix.length));
        return file ? serveFile(req, res, file) : send(res, 404, 'Not found', 'text/plain');
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    let html = null;
    if (p === '/') html = render.home(db);
    else if (p === '/faq') html = render.faqPage(db);
    else if (p === '/contact') html = render.contactPage(db, url.searchParams);
    else if (p.startsWith('/bands/')) html = render.bandPage(db, p.slice(7));
    else if (/^\/[a-z0-9-]+$/.test(p)) html = render.genericPage(db, p.slice(1));
    if (html) return send(res, 200, html);
    send(res, 404, render.notFound(db));
  } catch (e) {
    if (e instanceof ValidationError) return json(res, e.status, { error: e.message });
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'Server error: ' + e.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Is the site already running in another window?`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Milestones Music is running (this computer only)\n`);
  console.log(`  Website:  http://localhost:${PORT}`);
  console.log(`  Admin:    http://localhost:${PORT}/admin\n`);
  console.log(`  Data folder: ${db.dbDir}`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
