// Milestones Music online: Cloudflare worker.
// - Pages are built from the data on each visit (same layout code as the Mac version).
// - The admin saves to GitHub (db/*.json); every save is a commit, so all history is kept.
// - Uploads go to Cloudflare R2 storage and are served from /media/...
// - Enquiries are kept in the Cloudflare D1 database and emailed to the address in Settings.
import schemaMod from '../lib/schema.js';
import coreMod from '../lib/db-core.js';
import render from '../lib/render.js';
import { loadDb, headOid, commitFiles, listRepoFiles, ConflictError } from './github.js';
import * as auth from './auth.js';

const { collections, groups } = schemaMod;
const { DB, ValidationError, newId } = coreMod;
// the big old videos in source-assets/ are not uploaded, so the online site skips them
render.setUnavailable(['source-assets/']);

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};
const KINDS = { image: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'], audio: ['.mp3', '.m4a', '.wav'], video: ['.mp4', '.webm', '.mov'] };
const extOf = (p) => { const m = /\.[a-z0-9]+$/i.exec(p); return m ? m[0].toLowerCase() : ''; };
const kindOf = (p) => Object.keys(KINDS).find((k) => KINDS[k].includes(extOf(p)));

const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
const fail = (msg, status = 400) => json({ error: msg }, status);
const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });

// ---------- data access
class MemoryStore { // for saving: copies on read so nothing changes until saved
  constructor(files) { this.files = files; this.dirty = new Set(); }
  has(n) { return n in this.files; }
  get(n) { return n in this.files ? structuredClone(this.files[n]) : undefined; }
  set(n, d) { this.files[n] = structuredClone(d); this.dirty.add(n); }
}
class ReadStore { // for showing pages: read only, fast
  constructor(files) { this.files = files; }
  has(n) { return n in this.files; }
  get(n) { return this.files[n]; }
  set() { throw new Error('read only'); }
}

// A copy of the latest data is kept in R2 so pages are quick; it is refreshed on every
// save, and checked against GitHub every 5 minutes in case GitHub was changed directly.
const SNAP_KEY = '_cache/db.json';
let mem = null;
async function saveSnapshot(env, s) {
  const snap = { oid: s.oid, files: s.files, at: Date.now() };
  const obj = await env.MEDIA.put(SNAP_KEY, JSON.stringify(snap));
  mem = { ...snap, etag: obj && obj.etag, loaded: Date.now() };
}
async function refreshSnapshot(env, snap) {
  try {
    const oid = await headOid(env);
    if (oid !== snap.oid) { const d = await loadDb(env); await saveSnapshot(env, d); }
    else await saveSnapshot(env, snap);
  } catch (e) { console.log('snapshot refresh failed:', e.message); }
}
// fresh (admin): reuse the copy in memory unless the stored one has changed (a quick check)
async function getSnapshot(env, ctx, fresh) {
  const now = Date.now();
  if (mem && now - mem.loaded < (fresh ? 1500 : 15000)) return mem;
  if (mem && mem.etag) {
    const head = await env.MEDIA.head(SNAP_KEY);
    if (head && head.etag === mem.etag) {
      mem.loaded = now;
      if (now - mem.at > 5 * 60000 && ctx) ctx.waitUntil(refreshSnapshot(env, mem));
      return mem;
    }
  }
  const o = await env.MEDIA.get(SNAP_KEY);
  const snap = o ? await o.json() : null;
  if (!snap) { const d = await loadDb(env); await saveSnapshot(env, d); return mem; }
  if (now - snap.at > 5 * 60000 && ctx) ctx.waitUntil(refreshSnapshot(env, snap));
  mem = { ...snap, etag: o.etag, loaded: now };
  return mem;
}
const readDb = (snap) => new DB(new ReadStore(snap.files));

// Load from GitHub, apply a change, save everything that changed as one commit.
async function change(env, user, fn, describe) {
  const { oid, files } = await loadDb(env);
  const store = new MemoryStore(files);
  const result = fn(new DB(store));
  if (store.dirty.size) {
    const changes = [...store.dirty].map((n) => [`db/${n}.json`, JSON.stringify(store.files[n], null, 1) + '\n']);
    const newOid = await commitFiles(env, oid, changes, `${user.name || user.email}: ${describe(result)}`);
    await saveSnapshot(env, { oid: newOid, files: store.files });
  }
  return result;
}

// ---------- enquiries (D1, private: never in GitHub)
const londonNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};
const rowToEnquiry = (r) => ({ ...JSON.parse(r.data), id: r.id, status: r.status, received: r.received, createdAt: r.created, updatedAt: r.updated });

async function sendEnquiryEmail(env, settings, e) {
  const to = String(settings.enquiryEmail || settings.contactEmail || '').split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean);
  if (!to.length) return 'Not sent: no enquiry email address in Settings';
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return 'Not sent: email sending is not set up yet (saved here only)';
  const lines = [['Name', e.name], ['Phone', e.phone], ['Email', e.email], ['Date of event', e.eventDate], ['Location', e.location], ['Event type', e.eventType],
    ['Preferred bands', e.preferredBands], ['Heard about us', e.heardAbout], ['Came from band page', e.fromBand], ['Message', e.message]].filter((x) => x[1]);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to, reply_to: e.email, subject: `New enquiry: ${e.name} (${e.eventType}, ${e.eventDate})`, text: lines.map(([k, v]) => `${k}: ${v}`).join('\n') }),
  });
  if (!r.ok) return 'Email failed: ' + (await r.text()).slice(0, 200);
  return 'Emailed to ' + to.join(', ');
}

async function postEnquiry(req, env, ctx) {
  const b = await req.json().catch(() => ({}));
  if (b.website) return json({ ok: true }); // spam trap
  const clip = (v, n = 500) => String(v == null ? '' : v).trim().slice(0, n);
  const e = {};
  for (const k of ['name', 'phone', 'email', 'eventDate', 'location', 'eventType', 'preferredBands', 'heardAbout', 'fromBand']) e[k] = clip(b[k]);
  e.message = clip(b.message, 5000);
  if (['name', 'phone', 'email', 'eventDate', 'location', 'eventType', 'message'].some((k) => !e[k])) return fail('Please fill in all required fields.');
  if (!/^\S+@\S+\.\S+$/.test(e.email)) return fail('Please check the email address.');
  const id = newId(), now = new Date().toISOString(), received = londonNow();
  await env.DB.prepare('INSERT INTO enquiries (id,status,received,data,created,updated) VALUES (?,?,?,?,?,?)').bind(id, 'new', received, JSON.stringify(e), now, now).run();
  ctx.waitUntil((async () => {
    let status;
    try { status = await sendEnquiryEmail(env, (await getSnapshot(env, null)).files.settings || {}, e); } catch (x) { status = 'Email failed: ' + x.message; }
    await env.DB.prepare('UPDATE enquiries SET data=? WHERE id=?').bind(JSON.stringify({ ...e, emailStatus: status }), id).run();
  })());
  return json({ ok: true });
}

async function enquiriesApi(req, env, id) {
  const m = req.method;
  if (m === 'GET' && !id) return json((await env.DB.prepare('SELECT * FROM enquiries ORDER BY received DESC, created DESC').all()).results.map(rowToEnquiry));
  const row = id ? await env.DB.prepare('SELECT * FROM enquiries WHERE id=?').bind(id).first() : null;
  if (!row) return fail('Not found', 404);
  if (m === 'GET') return json(rowToEnquiry(row));
  if (m === 'PUT') {
    const b = await req.json().catch(() => ({}));
    if (b._version && row.updated && b._version !== row.updated) return fail('Not saved: this was changed somewhere else after you opened it. Reload the page to get the latest version, then make your change again.', 409);
    const ok = collections.enquiries.fields.find((f) => f.key === 'status').options.some((o) => o.value === b.status);
    if (!ok) return fail('Status: unknown choice');
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE enquiries SET status=?, updated=? WHERE id=?').bind(b.status, now, id).run();
    return json(rowToEnquiry({ ...row, status: b.status, updated: now }));
  }
  if (m === 'DELETE') { await env.DB.prepare('DELETE FROM enquiries WHERE id=?').bind(id).run(); return json({ ok: true }); }
  return fail('Not found', 404);
}

// ---------- uploads and media (R2)
async function upload(req, env, q) {
  const folder = (q.get('folder') || 'files').replace(/[^a-z]/g, '') || 'files';
  let name = String(q.get('name') || 'file').split(/[\\/]/).pop().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+/, '');
  const ext = extOf(name);
  if (!MIME[ext]) return fail('That file type is not allowed');
  const base = name.slice(0, -ext.length) || 'file';
  let key = `media/uploads/${folder}/${name}`, n = 1;
  while (await env.MEDIA.head(key)) key = `media/uploads/${folder}/${base}-${++n}${ext}`;
  const len = Number(req.headers.get('content-length') || 0);
  if (!len) return fail('Empty upload');
  const { readable, writable } = new FixedLengthStream(len);
  const piping = req.body.pipeTo(writable);
  await env.MEDIA.put(key, readable, { httpMetadata: { contentType: MIME[ext] } });
  await piping;
  return json({ path: key });
}

async function serveMedia(req, env, key) {
  if (!key.startsWith('media/') || key.includes('..')) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA.get(key, { range: req.headers, onlyIf: req.headers });
  if (!obj) return new Response('Not found', { status: 404 });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('accept-ranges', 'bytes');
  h.set('cache-control', 'public, max-age=86400');
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers: h });
  if (req.headers.get('range') && obj.range) {
    const off = obj.range.offset || 0, length = obj.range.length != null ? obj.range.length : obj.size - off;
    h.set('content-range', `bytes ${off}-${off + length - 1}/${obj.size}`);
    h.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set('content-length', String(obj.size));
  return new Response(obj.body, { status: 200, headers: h });
}

async function listFiles(env) {
  const out = (await listRepoFiles(env, 'assets/')).map((f) => ({ ...f, kind: kindOf(f.path) })).filter((f) => f.kind);
  let cursor;
  do {
    const r = await env.MEDIA.list({ prefix: 'media/', cursor });
    for (const o of r.objects) { const kind = kindOf(o.key); if (kind) out.push({ path: o.key, size: o.size, kind }); }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// ---------- users (admins only)
async function usersApi(req, env, user, id) {
  if (user.role !== 'admin') return fail('Only admins can manage users.', 403);
  const m = req.method;
  if (m !== 'GET') auth.forgetUsers();
  if (m === 'GET') return json({ users: (await env.DB.prepare('SELECT id,email,name,role,disabled,created FROM users ORDER BY email').all()).results });
  const b = m === 'DELETE' ? {} : await req.json().catch(() => ({}));
  if (m === 'POST') {
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Please enter a valid email address.');
    if (String(b.password || '').length < 8) return fail('The password must be at least 8 characters.');
    if (!['admin', 'editor'].includes(b.role)) return fail('Choose Admin or Editor.');
    if (await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first()) return fail('There is already a user with that email.');
    const salt = auth.newSalt();
    await env.DB.prepare('INSERT INTO users (email,name,role,salt,hash,created) VALUES (?,?,?,?,?,?)').bind(email, String(b.name || ''), b.role, salt, await auth.hashPassword(b.password, salt), new Date().toISOString()).run();
    return json({ ok: true });
  }
  const t = id ? await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(Number(id)).first() : null;
  if (!t) return fail('Not found', 404);
  if (m === 'PUT') {
    const losingAdmin = t.role === 'admin' && !t.disabled && ((b.role && b.role !== 'admin') || b.disabled);
    if (losingAdmin && (await auth.activeAdmins(env)) <= 1) return fail('There must always be at least one admin.');
    if (b.role && !['admin', 'editor'].includes(b.role)) return fail('Choose Admin or Editor.');
    if (b.role) await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(b.role, t.id).run();
    if (b.name !== undefined) await env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(String(b.name), t.id).run();
    if (b.disabled !== undefined) await env.DB.prepare('UPDATE users SET disabled=? WHERE id=?').bind(b.disabled ? 1 : 0, t.id).run();
    if (b.password) {
      if (String(b.password).length < 8) return fail('The password must be at least 8 characters.');
      const salt = auth.newSalt();
      await env.DB.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').bind(salt, await auth.hashPassword(b.password, salt), t.id).run();
    }
    return json({ ok: true });
  }
  if (m === 'DELETE') {
    if (t.id === user.id) return fail('You cannot delete yourself.');
    if (t.role === 'admin' && !t.disabled && (await auth.activeAdmins(env)) <= 1) return fail('There must always be at least one admin.');
    await env.DB.prepare('DELETE FROM users WHERE id=?').bind(t.id).run();
    return json({ ok: true });
  }
  return fail('Not found', 404);
}

// ---------- the admin API
async function api(req, env, ctx, url) {
  await auth.ensureTables(env);
  const p = url.pathname, m = req.method;
  const origin = req.headers.get('origin');
  if (m !== 'GET' && m !== 'HEAD' && origin && origin !== url.origin) return fail('Not allowed', 403);

  if (p === '/api/enquiries' && m === 'POST') return postEnquiry(req, env, ctx);
  if (p === '/api/me') {
    const user = await auth.currentUser(req, env);
    const c = (await env.DB.prepare('SELECT COUNT(*) c FROM users').first()).c;
    return json({ user, needsSetup: c === 0, mode: 'online' });
  }
  if (p === '/api/setup' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    if ((await env.DB.prepare('SELECT COUNT(*) c FROM users').first()).c > 0) return fail('Setup has already been done. Please sign in.');
    if (!env.SETUP_KEY || !auth.same(String(b.key || ''), env.SETUP_KEY)) return fail('The setup key is not right.', 403);
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Please enter a valid email address.');
    if (String(b.password || '').length < 8) return fail('The password must be at least 8 characters.');
    const salt = auth.newSalt();
    const r = await env.DB.prepare('INSERT INTO users (email,name,role,salt,hash,created) VALUES (?,?,?,?,?,?)').bind(email, String(b.name || ''), 'admin', salt, await auth.hashPassword(b.password, salt), new Date().toISOString()).run();
    return json({ ok: true }, 200, { 'set-cookie': await auth.makeCookie(env, r.meta.last_row_id) });
  }
  if (p === '/api/login' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase();
    if (await auth.tooManyAttempts(env, email)) return fail('Too many attempts. Please wait 15 minutes and try again.', 429);
    const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if (!u || u.disabled || !auth.same(await auth.hashPassword(String(b.password || ''), u.salt), u.hash)) {
      await auth.recordAttempt(env, email);
      return fail('Wrong email or password.', 401);
    }
    return json({ ok: true }, 200, { 'set-cookie': await auth.makeCookie(env, u.id) });
  }
  if (p === '/api/logout' && m === 'POST') return json({ ok: true }, 200, { 'set-cookie': auth.clearCookie });

  const user = await auth.currentUser(req, env);
  if (!user) return json({ error: 'Please sign in.', needLogin: true }, 401);

  if (p === '/api/account' && m === 'PUT') {
    const b = await req.json().catch(() => ({}));
    const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
    if (!auth.same(await auth.hashPassword(String(b.current || ''), u.salt), u.hash)) return fail('Your current password is not right.', 403);
    if (String(b.password || '').length < 8) return fail('The new password must be at least 8 characters.');
    const salt = auth.newSalt();
    await env.DB.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').bind(salt, await auth.hashPassword(b.password, salt), user.id).run();
    return json({ ok: true });
  }
  const parts = p.split('/').filter(Boolean).slice(1);
  if (parts[0] === 'users') return usersApi(req, env, user, parts[1]);
  if (parts[0] === 'schema') return json({ collections, groups });
  if (parts[0] === 'all') { // everything the admin needs, in one go
    const db = readDb(await getSnapshot(env, ctx, true));
    return json({ data: Object.fromEntries(Object.keys(collections).filter((n) => !collections[n].private).map((n) => [n, db.list(n)])) });
  }
  if (parts[0] === 'files') return json({ files: await listFiles(env) });
  if (parts[0] === 'upload' && m === 'PUT') return upload(req, env, url.searchParams);
  if (parts[0] === 'status') {
    const n = (await env.DB.prepare("SELECT COUNT(*) c FROM enquiries WHERE status='new'").first()).c;
    const s = (await getSnapshot(env, ctx, true)).files.settings || {};
    return json({ newEnquiries: n, mode: 'online', emailReady: !!(env.RESEND_API_KEY && env.MAIL_FROM), enquiryEmail: s.enquiryEmail || s.contactEmail || '' });
  }
  if (parts[0] === 'order' && parts[1] && m === 'PUT') {
    if (!collections[parts[1]]) return fail('Unknown collection', 404);
    const b = await req.json().catch(() => ({}));
    const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
    return json(await change(env, user, (db) => db.reorder(parts[1], ids), () => `reordered ${collections[parts[1]].label.toLowerCase()}`));
  }
  if (parts[0] === 'c' && parts[1]) {
    const name = parts[1], id = parts[2], c = collections[name];
    if (!c) return fail('Unknown collection', 404);
    if (c.private) return enquiriesApi(req, env, id);
    const title = (it) => (it && (it[c.titleField] || it.name || it.title)) || '';
    if (m === 'GET') {
      const db = readDb(await getSnapshot(env, ctx, true));
      if (c.single || !id) return json(db.list(name));
      return json(db.get(name, id));
    }
    if (c.single && m === 'PUT') { const b = await req.json(); return json(await change(env, user, (db) => db.update(name, null, b), () => `updated ${c.label.toLowerCase()}`)); }
    if (m === 'POST' && !id) { const b = await req.json(); return json(await change(env, user, (db) => db.create(name, b), (r) => `added ${c.singular} "${title(r)}"`), 201); }
    if (m === 'PUT' && id) { const b = await req.json(); return json(await change(env, user, (db) => db.update(name, id, b), (r) => `updated ${c.singular} "${title(r)}"`)); }
    if (m === 'DELETE' && id) { await change(env, user, (db) => { const it = db.get(name, id); db.remove(name, id); return it; }, (r) => `deleted ${c.singular} "${title(r)}"`); return json({ ok: true }); }
  }
  return fail('Not found', 404);
}

// ---------- pages
async function page(req, env, ctx, url) {
  const db = readDb(await getSnapshot(env, ctx, false));
  let p = decodeURIComponent(url.pathname);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  let out = null;
  if (p === '/' || p === '/index.html') out = render.home(db);
  else if (p === '/faq') out = render.faqPage(db);
  else if (p === '/contact') out = render.contactPage(db, url.searchParams);
  else if (p.startsWith('/bands/')) out = render.bandPage(db, p.slice(7));
  else if (/^\/[a-z0-9-]+$/.test(p)) out = render.genericPage(db, p.slice(1));
  return out ? html(out) : html(render.notFound(db), 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, env, ctx, url);
      if (url.pathname.startsWith('/media/')) return await serveMedia(req, env, decodeURIComponent(url.pathname.slice(1)));
      if (url.pathname === '/admin') return Response.redirect(url.origin + '/admin/', 301);
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
      return await page(req, env, ctx, url);
    } catch (e) {
      if (e instanceof ValidationError) return fail(e.message, e.status);
      if (e instanceof ConflictError) return fail('Someone else saved at the same moment. Please try again.', 409);
      console.log('error:', e.stack || e.message);
      return url.pathname.startsWith('/api/') ? fail('Server error: ' + e.message, 500) : new Response('Sorry, something went wrong.\n\nReason: ' + String(e.message || e).slice(0, 300), { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  },
};
