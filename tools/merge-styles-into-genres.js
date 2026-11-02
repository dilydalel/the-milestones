'use strict';
// One-off (2 Nov 2026): merge "song styles" into "genres" so songs and bands share one list,
// and switch band repertoire to "songs in the band's genres + extras - left out".
// Keeps every band's current repertoire exactly. Safe to run twice. Backups are kept.
//   node tools/merge-styles-into-genres.js           (DB_DIR=... to run on a copy)
const fs = require('fs');
const path = require('path');
const { DB, slugify } = require('../lib/db');
const { repertoireIds } = require('../lib/repertoire');

const ROOT = path.resolve(__dirname, '..');
const dbDir = path.resolve(process.env.DB_DIR || path.join(ROOT, 'db'));
const db = new DB({ dbDir, privateDir: path.resolve(process.env.PRIVATE_DIR || path.join(ROOT, 'private')) });
const stylesFile = path.join(dbDir, 'styles.json');
if (!fs.existsSync(stylesFile)) { console.log('Nothing to do: song styles are already merged into genres.'); process.exit(0); }

const styles = JSON.parse(fs.readFileSync(stylesFile, 'utf8')).sort((a, b) => (a.order || 0) - (b.order || 0));
const genres = db.read('genres');
const byName = new Map(genres.map((g) => [g.name.toLowerCase(), g]));
let order = Math.max(0, ...genres.map((g) => Number(g.order) || 0));
const now = new Date().toISOString();
const map = {}, added = [];
for (const st of styles) {
  let g = byName.get(st.name.toLowerCase());
  if (!g) {
    let id = 'genre-' + slugify(st.name);
    while (genres.some((x) => x.id === id)) id += '-2';
    g = { id, name: st.name, order: ++order, createdAt: now, updatedAt: now };
    genres.push(g); byName.set(st.name.toLowerCase(), g); added.push(st.name);
  }
  map[st.id] = g.id;
}
db.write('genres', genres);

const songs = db.read('songs');
songs.forEach((s) => {
  s.genreIds = [...new Set([...(s.genreIds || []), ...(s.styleIds || []).map((id) => map[id]).filter(Boolean)])];
  delete s.styleIds;
});
db.write('songs', songs);

const bands = db.read('bands');
const report = [];
bands.forEach((b) => {
  const before = new Set(b.songIds || []);
  const auto = new Set(repertoireIds({ genreIds: b.genreIds }, songs));
  b.songIds = [...before].filter((id) => !auto.has(id));
  // a band with no songs yet fills from its genres; otherwise keep its repertoire exactly
  b.excludedSongIds = before.size ? [...auto].filter((id) => !before.has(id)) : [];
  report.push(`${b.name}: ${before.size} songs before, ${repertoireIds(b, songs).length} after`);
});
db.write('bands', bands);

fs.mkdirSync(path.join(dbDir, '_backups'), { recursive: true });
fs.renameSync(stylesFile, path.join(dbDir, '_backups', 'styles-merged-' + now.replace(/[:.]/g, '-') + '.json'));
console.log('Genres added from song styles:', added.join(', ') || 'none');
console.log(report.join('\n'));
