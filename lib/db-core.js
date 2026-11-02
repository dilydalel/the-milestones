'use strict';
// Data rules shared by the Mac version and the online version.
// Storage is plugged in: a "store" with get(name), set(name, data), has(name).
//   - on the Mac: lib/db.js (JSON files in db/, with backups)
//   - online: the Cloudflare worker (JSON files in GitHub)

const { collections } = require('./schema');

const RESERVED_SLUGS = ['admin', 'api', 'assets', 'bands', 'contact', 'faq', 'public', 'source-assets', 'uploads'];

class ValidationError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const newId = () => {
  const b = new Uint8Array(5);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 5; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};
const slugify = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function sortItems(items, spec) {
  if (!spec) return items;
  const keys = spec.map((k) => (k[0] === '-' ? [k.slice(1), -1] : [k, 1]));
  return items.map((it, i) => [it, i]).sort((a, b) => {
    for (const [k, dir] of keys) {
      const x = a[0][k], y = b[0][k];
      if (x === y) continue;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'en', { sensitivity: 'base', numeric: true }) * dir;
    }
    return a[1] - b[1];
  }).map((p) => p[0]);
}

class DB {
  constructor(store) { this.store = store; }

  exists(name) { return this.store.has(name); }

  read(name) {
    if (!collections[name]) throw new ValidationError('Unknown collection: ' + name, 404);
    const v = this.store.get(name);
    if (v === undefined) return collections[name].single ? {} : [];
    return v;
  }

  write(name, data) { this.store.set(name, data); }

  list(name) {
    const c = collections[name];
    if (c.single) return this.read(name);
    return sortItems(this.read(name), c.sort);
  }

  get(name, id) {
    const it = this.read(name).find((x) => x.id === id);
    if (!it) throw new ValidationError('Not found', 404);
    return it;
  }

  // Validate and tidy user input against the schema.
  clean(name, input, existing, allItems) {
    const c = collections[name];
    const out = {};
    const problems = [];
    for (const f of c.fields) {
      if (f.virtual) continue;
      let v = input[f.key];
      if (f.readonly && existing) { out[f.key] = existing[f.key]; continue; }
      if (v === undefined && existing) v = existing[f.key];
      if (v === undefined) v = f.default !== undefined ? f.default : (f.type === 'multi' || f.type === 'repertoire' ? [] : f.type === 'bool' ? false : f.type === 'number' ? 0 : '');
      switch (f.type) {
        case 'number': v = v === '' || v == null ? 0 : Number(v); if (!Number.isFinite(v)) problems.push(`${f.label} must be a number`); break;
        case 'bool': v = v === true || v === 'true' || v === 1; break;
        case 'repertoire':
        case 'multi': {
          v = Array.isArray(v) ? v.map(String) : [];
          const valid = new Set(this.read(f.ref).map((x) => x.id));
          v = v.filter((x) => valid.has(x));
          break;
        }
        case 'slug': v = slugify(v); break;
        case 'textarea': v = String(v == null ? '' : v).replace(/\r\n/g, '\n').trim(); break;
        default: v = String(v == null ? '' : v).trim();
      }
      if (f.type === 'select') {
        if (f.ref && v && !this.read(f.ref).some((x) => x.id === v)) problems.push(`${f.label}: unknown choice`);
        if (f.options && v && !f.options.some((o) => o.value === v)) problems.push(`${f.label}: unknown choice`);
      }
      if ((f.type === 'image' || f.type === 'file') && v && (/\.\./.test(v) || /^[a-z]+:/i.test(v) && !/^https?:/i.test(v))) problems.push(`${f.label}: invalid path`);
      if (f.required && (v === '' || v == null || (Array.isArray(v) && !v.length))) problems.push(`${f.label} is required`);
      if (f.type === 'slug' && v) {
        if (RESERVED_SLUGS.includes(v) && name === 'pages') problems.push(`"${v}" is reserved for the site`);
        if (f.unique && allItems.some((x) => x[f.key] === v && (!existing || x.id !== existing.id))) problems.push(`${f.label} "${v}" is already used`);
      }
      out[f.key] = v;
    }
    if (problems.length) throw new ValidationError(problems.join('. '));
    return out;
  }

  create(name, input) {
    const c = collections[name];
    if (c.single) throw new ValidationError('Use update for settings');
    if (c.noCreate) throw new ValidationError('Cannot add these by hand');
    const items = this.read(name);
    const now = new Date().toISOString();
    if (c.fields.some((f) => f.key === 'slug') && !input.slug && input[c.titleField]) input = { ...input, slug: slugify(input[c.titleField]) };
    if (c.orderKey && (input[c.orderKey] === undefined || input[c.orderKey] === '')) {
      input = { ...input, [c.orderKey]: Math.max(0, ...items.map((x) => Number(x[c.orderKey]) || 0)) + 1 };
    }
    const item = { id: newId(), ...this.clean(name, input, null, items), createdAt: now, updatedAt: now };
    items.push(item);
    this.write(name, items);
    return item;
  }

  update(name, id, input) {
    const c = collections[name];
    // Refuse to overwrite a newer version (e.g. a form opened before someone else saved).
    const stale = (cur) => input._version && cur.updatedAt && input._version !== cur.updatedAt;
    const STALE_MSG = 'Not saved: this was changed somewhere else after you opened it. Reload the page to get the latest version, then make your change again.';
    if (c.single) {
      const cur = this.read(name);
      if (stale(cur)) throw new ValidationError(STALE_MSG, 409);
      const next = { ...this.clean(name, input, cur, []), updatedAt: new Date().toISOString() };
      this.write(name, next);
      return next;
    }
    const items = this.read(name);
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) throw new ValidationError('Not found', 404);
    if (stale(items[i])) throw new ValidationError(STALE_MSG, 409);
    items[i] = { ...this.clean(name, input, items[i], items), id, createdAt: items[i].createdAt, updatedAt: new Date().toISOString() };
    this.write(name, items);
    return items[i];
  }

  // Set the order from a list of ids (first = 1). Items not listed keep their place after them.
  reorder(name, ids) {
    const c = collections[name];
    if (!c.orderKey) throw new ValidationError('This list cannot be reordered');
    const items = this.read(name);
    const byId = new Map(items.map((x) => [x.id, x]));
    const listed = ids.filter((id) => byId.has(id));
    const rest = sortItems(items.filter((x) => !listed.includes(x.id)), c.sort);
    [...listed.map((id) => byId.get(id)), ...rest].forEach((it, i) => { it[c.orderKey] = i + 1; });
    this.write(name, items);
    return sortItems(items, c.sort);
  }

  // Everything that points at an item of `name`.
  references(name, id) {
    const refs = [];
    for (const [cn, c] of Object.entries(collections)) {
      if (c.single) continue;
      for (const f of c.fields) {
        if (f.ref !== name) continue;
        const items = this.read(cn);
        const hits = items.filter((it) => (f.type === 'multi' || f.type === 'repertoire' ? (it[f.key] || []).includes(id) : it[f.key] === id));
        if (hits.length) refs.push({ collection: cn, field: f, hits, items });
      }
    }
    return refs;
  }

  remove(name, id) {
    const c = collections[name];
    if (c.single) throw new ValidationError('Cannot delete settings');
    const items = this.read(name);
    if (!items.some((x) => x.id === id)) throw new ValidationError('Not found', 404);
    const refs = this.references(name, id);
    const blockers = refs.filter((r) => r.field.required);
    if (blockers.length) {
      const msg = blockers.map((r) => `${r.hits.length} ${collections[r.collection].label.toLowerCase()}`).join(', ');
      throw new ValidationError(`Cannot delete: it is still used by ${msg}. Move or delete those first.`, 409);
    }
    for (const r of refs) {
      r.items.forEach((it) => {
        if (!r.hits.includes(it)) return;
        if (r.field.type === 'multi' || r.field.type === 'repertoire') it[r.field.key] = it[r.field.key].filter((x) => x !== id);
        else it[r.field.key] = '';
      });
      this.write(r.collection, r.items);
    }
    this.write(name, items.filter((x) => x.id !== id));
  }

  // For internal use (public enquiry form, import): insert without schema validation.
  insertRaw(name, item) {
    const items = this.read(name);
    const now = new Date().toISOString();
    const row = { id: newId(), ...item, createdAt: now, updatedAt: now };
    items.push(row);
    this.write(name, items);
    return row;
  }
}

module.exports = { DB, ValidationError, slugify, newId, sortItems };
