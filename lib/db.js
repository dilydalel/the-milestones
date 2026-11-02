'use strict';
// Mac version of the database: one JSON file per collection in db/ (enquiries in private/).
// Every save makes a timestamped backup first, then writes atomically.
const fs = require('fs');
const path = require('path');
const { collections } = require('./schema');
const core = require('./db-core');

const KEEP_BACKUPS = 30;

class FileStore {
  constructor({ dbDir, privateDir }) {
    this.dbDir = dbDir; this.privateDir = privateDir;
    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(privateDir, { recursive: true });
  }
  file(name) { return path.join(collections[name] && collections[name].private ? this.privateDir : this.dbDir, name + '.json'); }
  has(name) { return fs.existsSync(this.file(name)); }
  get(name) {
    try { return JSON.parse(fs.readFileSync(this.file(name), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return undefined; throw new Error(`Could not read ${this.file(name)}: ${e.message}`); }
  }
  set(name, data) {
    const file = this.file(name);
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(file)) {
      const bdir = path.join(dir, '_backups');
      fs.mkdirSync(bdir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(file, path.join(bdir, `${name}-${stamp}.json`));
      const old = fs.readdirSync(bdir).filter((f) => f.startsWith(name + '-')).sort();
      // tidying old backups must never stop a save
      old.slice(0, Math.max(0, old.length - KEEP_BACKUPS)).forEach((f) => { try { fs.unlinkSync(path.join(bdir, f)); } catch (e) { /* ignore */ } });
    }
    const tmp = file + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n');
    fs.renameSync(tmp, file);
  }
}

class DB extends core.DB {
  constructor({ dbDir, privateDir }) {
    super(new FileStore({ dbDir, privateDir }));
    this.dbDir = dbDir; this.privateDir = privateDir;
  }
  file(name) { return this.store.file(name); }
}

module.exports = { DB, FileStore, ValidationError: core.ValidationError, slugify: core.slugify, newId: core.newId, sortItems: core.sortItems };
