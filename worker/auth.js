// Logins for the online admin: users live in the Cloudflare D1 database.
// Passwords are stored hashed (PBKDF2); the session is a signed cookie.
const COOKIE = 'mm_session';
const DAYS = 30;
const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

export function same(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function newSalt() { return hex(crypto.getRandomValues(new Uint8Array(16))); }

export async function hashPassword(pw, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: 100000 }, key, 256));
}

async function sign(env, body) {
  if (!env.SESSION_SECRET) throw new Error('The SESSION_SECRET secret is not set in Cloudflare.');
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
}

export async function makeCookie(env, id) {
  const body = `${id}.${Date.now() + DAYS * 86400000}`;
  return `${COOKIE}=${body}.${await sign(env, body)}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Strict`;
}
export const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

export async function ensureTables(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT, role TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, disabled INTEGER DEFAULT 0, created TEXT)");
  await env.DB.exec('CREATE TABLE IF NOT EXISTS attempts (email TEXT, ts INTEGER)');
  await env.DB.exec("CREATE TABLE IF NOT EXISTS enquiries (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'new', received TEXT, data TEXT NOT NULL, created TEXT, updated TEXT)");
}

export async function currentUser(req, env) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(COOKIE + '=([^;]+)'));
  if (!m) return null;
  const [id, exp, sig] = m[1].split('.');
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  if (!same(sig, await sign(env, `${id}.${exp}`))) return null;
  const u = await env.DB.prepare('SELECT id,email,name,role,disabled FROM users WHERE id=?').bind(Number(id)).first();
  return u && !u.disabled ? u : null;
}

// Slow down repeated wrong passwords (10 tries per 15 minutes per email).
export async function tooManyAttempts(env, email) {
  const since = Date.now() - 15 * 60000;
  await env.DB.prepare('DELETE FROM attempts WHERE ts < ?').bind(since).run();
  const r = await env.DB.prepare('SELECT COUNT(*) c FROM attempts WHERE email=? AND ts>=?').bind(email, since).first();
  return r.c >= 10;
}
export async function recordAttempt(env, email) {
  await env.DB.prepare('INSERT INTO attempts (email, ts) VALUES (?, ?)').bind(email, Date.now()).run();
}
export async function activeAdmins(env) {
  return (await env.DB.prepare("SELECT COUNT(*) c FROM users WHERE role='admin' AND disabled=0").first()).c;
}
