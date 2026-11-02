'use strict';
// One-off: build the database (db/) from the files extracted from the old site (data/).
// Safe by default: refuses to run if db/ already has data. Use --force to rebuild;
// the existing db/ is then copied to db-before-import-<time>/ first.
//
//   node tools/import-old-site.js            (uses ./data and ./db)
//   DB_DIR=/tmp/test-db node tools/import-old-site.js

const fs = require('fs');
const path = require('path');
const { DB, slugify } = require('../lib/db');
const { collections } = require('../lib/schema');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const DB_DIR = path.resolve(process.env.DB_DIR || path.join(ROOT, 'db'));
const PRIVATE_DIR = path.resolve(process.env.PRIVATE_DIR || path.join(ROOT, 'private'));
const force = process.argv.includes('--force');

const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const existing = fs.existsSync(DB_DIR) && fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.json'));
if (existing && existing.length) {
  if (!force) {
    console.error(`Stopped: ${DB_DIR} already contains data (${existing.length} files). Nothing was changed.`);
    console.error('Run with --force to rebuild (the current db is backed up first).');
    process.exit(1);
  }
  const bak = DB_DIR + '-before-import-' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.cpSync(DB_DIR, bak, { recursive: true });
  fs.rmSync(DB_DIR, { recursive: true });
  console.log('Backed up existing db to', bak);
}

const db = new DB({ dbDir: DB_DIR, privateDir: PRIVATE_DIR });
const now = new Date().toISOString();
const row = (id, o) => ({ id, ...o, createdAt: now, updatedAt: now });
const pickList = (prefix, names) => names.map((n, i) => row(`${prefix}-${slugify(n)}`, { name: n, order: i + 1 }));

// ---- pick-lists
const rep = load('repertoire-from-old-site.json');
const genreNames = [...rep.styles, 'Classical'];
const genres = pickList('genre', genreNames);
const genreId = Object.fromEntries(genres.map((g) => [g.name, g.id]));
db.write('genres', genres);
db.write('bandTypes', pickList('type', ['Party Band', 'String Quartet']));
db.write('instruments', pickList('inst', ['Vocals', 'Female Vocals', 'Male Vocals', 'Backing Vocals', 'Saxophone', 'Trumpet', 'Trombone', 'Strings', 'Violin', 'Viola', 'Cello', 'Keyboards', 'Guitar', 'Bass', 'Percussion', 'Drums', 'DJ']));
db.write('heardAbout', pickList('heard', ['Google', 'Instagram', 'Facebook', 'Recommendation', 'Other']));

// ---- songs
const songs = rep.songs.map((s, i) => row(`song-${i + 1}`, { title: s.title, artist: s.artist || '', genreIds: s.styles.map((x) => genreId[x]).filter(Boolean) }));
db.write('songs', songs);

// ---- bands
const about = load('about-from-old-site.json');
const block = (k) => (about.blocks.find((b) => b.key === k) || {}).text || '';
const milestonesBio = [block('about_intro'), block('about_band_sizes'), block('about_venues'), block('about_worked_with_lead') + ' ' + block('about_worked_with')].filter(Boolean).join('\n\n');
const band = (id, o) => row(id, {
  name: '', status: 'published', showOnHome: true, homeOrder: 0, tagline: '', bandTypeId: '', mainPhoto: '', bio: '',
  genreIds: [], instrumentIds: [], songIds: [], excludedSongIds: [], heroVideo: '', slug: '', seoTitle: '', seoDescription: '', shareImage: '', ...o,
});
const bands = [
  band('band-milestones', {
    name: 'The Milestones', slug: 'the-milestones', homeOrder: 1, tagline: 'Live Motown, disco, funk & soul', bandTypeId: 'type-party-band',
    mainPhoto: 'assets/photos/milestones-grp-2026.jpg', bio: milestonesBio,
    genreIds: ['genre-motown', 'genre-disco', 'genre-funk', 'genre-soul'],
    // repertoire = songs in its genres; the rest of the old list is added by hand
    songIds: songs.filter((s) => !s.genreIds.some((g) => ['genre-motown', 'genre-disco', 'genre-funk', 'genre-soul'].includes(g))).map((s) => s.id),
  }),
  band('band-gemstones', { name: 'The Gemstones', slug: 'the-gemstones', homeOrder: 2 }),
  band('band-steppingstones', { name: 'The Steppingstones', slug: 'the-steppingstones', homeOrder: 3 }),
  band('band-stony-strings', { name: 'Stony Strings', slug: 'stony-strings', homeOrder: 4, bandTypeId: 'type-string-quartet', instrumentIds: ['inst-strings'] }),
];
db.write('bands', bands);
const M = 'band-milestones';

// ---- media (all old-site media belongs to The Milestones)
const media = load('media-from-old-site.json');
db.write('tracks', media.tracks.map((t, i) => row(`track-${i + 1}`, { bandId: M, title: t.title, file: t.file, order: i + 1 })));
db.write('videos', media.videos.map((v, i) => row(`video-${i + 1}`, { bandId: M, title: v.title, youtubeUrl: v.title === '2019' ? 'https://www.youtube.com/watch?v=dVBMfdB5a6g' : '', file: v.file, poster: v.poster, order: i + 1 })));
const shownGallery = media.gallery.map((g) => g.file);
const photoList = load('photos-from-old-site.json').photos.filter((p) => !/\.png$/i.test(p.file) && !/milestones-og\.jpg$/.test(p.file));
photoList.sort((a, b) => {
  const ia = shownGallery.indexOf(a.file), ib = shownGallery.indexOf(b.file);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.file.localeCompare(b.file);
});
db.write('photos', photoList.map((p, i) => row(`photo-${i + 1}`, { bandId: M, file: p.file, caption: '', credit: '', show: shownGallery.includes(p.file), order: i + 1, alt: '' })));

// ---- content
db.write('testimonials', load('testimonials-from-old-site.json').testimonials.map((t, i) => row(`quote-${i + 1}`, { quote: t.quote, author: t.author, bandId: '', show: true, order: i + 1 })));
db.write('faqs', load('faqs-from-old-site.json').faqs.map((f, i) => row(`faq-${i + 1}`, { question: f.question, answer: f.answer, bandId: '', show: true, order: i + 1 })));
db.write('clients', load('clients-from-old-site.json').clients.map((c, i) => row(`client-${i + 1}`, { name: c.name, logo: c.logo, show: true, order: i + 1 })));
const site = load('site-text-from-old-site.json');
db.write('pages', [row('page-privacy', { title: site.privacy_policy.title, slug: 'privacy-policy', body: site.privacy_policy.paragraphs.join('\n\n') })]);
db.write('menu', [
  row('menu-bands', { label: 'Bands', url: '/#bands', order: 1 }),
  row('menu-faq', { label: 'FAQ', url: '/faq', order: 2 }),
  row('menu-contact', { label: 'Contact', url: '/contact', order: 3 }),
]);
const s = site.settings;
db.write('settings', {
  heroHeadline: 'Live Bands For\nExceptional Events', heroLinkText: 'Contact', heroLinkUrl: '/contact',
  introLine: 'Live bands for weddings, parties and corporate events.',
  heroVideo: 'assets/hero-loop-gh.mp4', heroPoster: 'assets/hero-poster-gh.jpg', siteName: 'Milestones Music',
  contactEmail: s.contact_email, phone: '', talkToUs: 'Tell us about your event and we will help you find the perfect band.',
  enquiryEmail: s.contact_email, formConfirmation: 'Thank you. We will be in touch shortly.',
  footerLine: '© 2026 Milestones Music', facebook: s.facebook, instagram: s.instagram, youtube: s.youtube, insuranceUrl: s.insurance_verify_url,
  updatedAt: now,
});
if (!db.exists('enquiries')) db.write('enquiries', []);

const counts = Object.keys(collections).filter((n) => !collections[n].single).map((n) => `${n} ${db.read(n).length}`);
console.log('Imported into', DB_DIR + ':\n  ' + counts.join(', '));
