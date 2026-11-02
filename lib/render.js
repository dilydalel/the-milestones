'use strict';
// Builds the public pages from the database on every request,
// so anything saved in the admin shows up on the next page load.

const { repertoireIds } = require('./repertoire');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = (t) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const lines = (t) => esc(t).replace(/\n/g, '<br>');
// Files that are not available where the site runs (online: the big old videos in source-assets/).
let UNAVAILABLE = [];
const setUnavailable = (prefixes) => { UNAVAILABLE = prefixes || []; };
const avail = (p) => !!p && !UNAVAILABLE.some((x) => String(p).startsWith(x));
const src = (p) => (!p ? '' : /^https?:/i.test(p) ? p : '/' + String(p).replace(/^\/+/, ''));

const FRAME_POS = { top: '0%', upper: '25%', center: '50%', lower: '75%', bottom: '100%' };
const framing = (v) => `object-position:center ${FRAME_POS[v] || '50%'}`;
// hero video: play only the chosen section, on repeat (site.js enforces the end)
const loopAttrs = (o) => { const a = Number(o.heroStart) || 0, b = Number(o.heroEnd) || 0; return `data-start="${a}" data-end="${b > a ? b : 0}"`; };
const loopSrc = (path, o) => { const a = Number(o.heroStart) || 0; return esc(src(path)) + (a > 0 ? `#t=${a}` : ''); };

function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : '';
}

function videoFigure(v) {
  const yt = youtubeId(v.youtubeUrl);
  const media = yt
    ? `<div class="ratio"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="${esc(v.title)}" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`
    : avail(v.file) ? `<div class="ratio"><video controls preload="none" ${avail(v.poster) ? `poster="${esc(src(v.poster))}"` : ''} src="${esc(src(v.file))}"></video></div>` : '';
  return media ? `<figure>${media}<figcaption class="caps">${esc(v.title)}</figcaption></figure>` : '';
}

function ctx(db) {
  const s = db.read('settings');
  const byId = (name) => Object.fromEntries(db.read(name).map((x) => [x.id, x]));
  return {
    db, s,
    menu: db.list('menu'),
    bandTypes: byId('bandTypes'), genres: byId('genres'), instruments: byId('instruments'),
    bands: db.list('bands').filter((b) => b.status === 'published'),
  };
}

function layout(c, { title, description = '', image = '', body, header = 'light', bodyClass = '', enquiry = true }) {
  const s = c.s;
  const siteName = s.siteName || 'Milestones Music';
  const full = title ? `${title} | ${siteName}` : siteName;
  const menu = c.menu.map((m) => `<a class="serif" href="${esc(m.url)}">${esc(m.label)}</a>`).join('');
  const social = [['Facebook', s.facebook], ['Instagram', s.instagram], ['YouTube', s.youtube]].filter((x) => x[1]).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join('');
  const privacy = c.db.read('pages').find((p) => p.slug === 'privacy-policy');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<meta property="og:title" content="${esc(full)}">
${image ? `<meta property="og:image" content="${esc(src(image))}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/public/site.css">
</head>
<body class="${esc(bodyClass)}${enquiry ? ' has-enq' : ''}">
<header class="site-header ${header} caps">
  <span></span>
  <a class="logo serif" href="/" aria-label="${esc(siteName)}"><b>MILESTONES</b><i>MUSIC</i></a>
  <button class="menu-btn caps" type="button" aria-expanded="false" aria-controls="menu">Menu</button>
</header>
<nav class="overlay" id="menu" aria-label="Menu">
  <button class="close caps" type="button">Close</button>
  ${menu}
</nav>
<main>${body}</main>
<footer class="site-footer caps">
  <div class="social">${social}</div>
  <div>${esc(s.footerLine || '')}${privacy ? ` &nbsp;·&nbsp; <a href="/${esc(privacy.slug)}">${esc(privacy.title)}</a>` : ''}</div>
</footer>
${enquiry ? enquirySheet(c) : ''}
<script src="/public/site.js"></script>
</body>
</html>`;
}

function tags(c, b) {
  const names = (b.genreIds || []).map((id) => c.genres[id]).filter(Boolean).map((x) => x.name);
  return names.length ? `<div class="tags caps">${names.map((n) => `<span>${esc(n)}</span>`).join('')}</div>` : '';
}

function bandCard(c, b) {
  const type = c.bandTypes[b.bandTypeId];
  return `<a class="band" href="/bands/${esc(b.slug)}">
    ${type ? `<span class="label caps">${esc(type.name)}</span>` : ''}
    <h2 class="serif">${esc(b.name)}</h2>
    ${b.tagline ? `<span class="tagline caps">${esc(b.tagline)}</span>` : ''}
    ${tags(c, b)}
    ${b.mainPhoto ? `<img class="photo" src="${esc(src(b.mainPhoto))}" alt="${esc(b.name)}" loading="lazy">` : '<div class="ph caps">Photo to come</div>'}
  </a>`;
}

function quotes(list) {
  if (!list.length) return '';
  const nav = list.length > 1 ? '<div class="qnav"><button class="qa prev" aria-label="Previous quotes" type="button">&lsaquo;</button><button class="qa next" aria-label="Next quotes" type="button">&rsaquo;</button></div>' : '';
  return `<section class="quotes">${nav}<div class="qtrack">${list.map((q) => `<figure><blockquote class="serif">${paras(q.quote)}</blockquote><figcaption class="caps">${esc(q.author)}</figcaption></figure>`).join('')}</div></section>`;
}

function home(db) {
  const c = ctx(db);
  const s = c.s;
  const onHome = c.bands.filter((b) => b.showOnHome);
  const siteQuotes = db.list('testimonials').filter((t) => t.show && !t.bandId);
  const clients = db.list('clients').filter((x) => x.show && x.logo);
  const homeVideo = s.homeVideoId ? db.read('videos').find((v) => v.id === s.homeVideoId) : null;
  const homeVideoHtml = homeVideo ? videoFigure(homeVideo) : '';
  const body = `
  <section class="hero">
    ${avail(s.heroVideo) ? `<video style="${framing(s.heroPosition)}" ${loopAttrs(s)} autoplay muted loop playsinline ${s.heroPoster ? `poster="${esc(src(s.heroPoster))}"` : ''}><source src="${loopSrc(s.heroVideo, s)}" type="video/mp4"></video>` : s.heroPoster ? `<img class="hero-img" src="${esc(src(s.heroPoster))}" alt="">` : ''}
    <div class="copy">
      <h1 class="serif">${lines(s.heroHeadline || '')}</h1>
      ${s.heroLinkText ? `<div class="links caps"><a href="${esc(s.heroLinkUrl || '/contact')}">${esc(s.heroLinkText)}</a></div>` : ''}
    </div>
  </section>
  ${s.introLine ? `<section class="intro"><p class="serif">${lines(s.introLine)}</p></section>` : ''}
  <section class="bands" id="bands">${onHome.map((b) => bandCard(c, b)).join('')}</section>
  ${homeVideoHtml || siteQuotes.length ? `<h2 class="label caps home-sec-title">${esc(s.testimonialsHeading || 'Testimonials')}</h2>` : ''}
  ${homeVideoHtml ? `<section class="home-video">${homeVideoHtml}</section>` : ''}
  ${quotes(siteQuotes)}
  ${clients.length ? `<section class="clients-sec"><h2 class="label caps">${esc(s.clientsHeading || 'Clients')}</h2><div class="clients">${clients.map((x) => `<img src="${esc(src(x.logo))}" alt="${esc(x.name)}" title="${esc(x.name)}" loading="lazy">`).join('')}</div></section>` : ''}`;
  return layout(c, { body, header: 'on-hero', bodyClass: 'home', image: s.heroPoster });
}

function bandPage(db, slug) {
  const c = ctx(db);
  const b = c.bands.find((x) => x.slug === slug);
  if (!b) return null;
  const type = c.bandTypes[b.bandTypeId];
  const mine = (name) => db.list(name).filter((x) => x.bandId === b.id);
  const videos = mine('videos').filter((v) => youtubeId(v.youtubeUrl) || avail(v.file));
  const tracks = mine('tracks');
  const photos = mine('photos').filter((p) => p.show);
  const bandQuotes = db.list('testimonials').filter((t) => t.show && t.bandId === b.id);
  const faqs = db.list('faqs').filter((f) => f.show && f.bandId === b.id);

  // repertoire grouped by style, in style order
  const allSongs = db.read('songs');
  const repIds = new Set(repertoireIds(b, allSongs));
  const songs = allSongs.filter((s) => repIds.has(s.id));
  const groups = db.list('genres').map((st) => ({ st, songs: songs.filter((s) => (s.genreIds || []).includes(st.id)).sort((x, y) => x.title.localeCompare(y.title)) })).filter((g) => g.songs.length);
  const unstyled = songs.filter((s) => !(s.genreIds || []).length);
  if (unstyled.length) groups.push({ st: { name: 'Other' }, songs: unstyled });

  const sec = (id, label, inner) => `<section class="sec" id="${id}"><h2 class="label caps">${label}</h2>${inner}</section>`;
  const video = videoFigure;

  const instruments = db.list('instruments').filter((i) => (b.instrumentIds || []).includes(i.id));
  const hasHero = avail(b.heroVideo);
  const enquire = `/contact?band=${encodeURIComponent(b.slug)}`;
  const hero = hasHero ? `
  <section class="hero band-hero">
    <video style="${framing(b.heroPosition)}" ${loopAttrs(b)} autoplay muted loop playsinline ${b.heroPoster ? `poster="${esc(src(b.heroPoster))}"` : ''}><source src="${loopSrc(b.heroVideo, b)}" type="video/mp4"></video>
    <div class="copy">
      ${type ? `<span class="label caps">${esc(type.name)}</span>` : ''}
      <h1 class="serif">${esc(b.name)}</h1>
      ${b.tagline ? `<p class="caps">${esc(b.tagline)}</p>` : ''}
    </div>
    <button class="sound-btn" type="button" aria-pressed="false" aria-label="Turn sound on" title="Sound on">
      <svg class="off" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>
      <svg class="on" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>
    </button>
  </section>` : '';
  const body = `${hero}
  <section class="band-top">
    <div class="band-text">
      ${!hasHero && type ? `<span class="label caps">${esc(type.name)}</span>` : ''}
      ${hasHero ? '' : `<h1 class="serif">${esc(b.name)}</h1>`}
      ${!hasHero && b.tagline ? `<p class="tagline caps">${esc(b.tagline)}</p>` : ''}
      ${b.bio ? `<div class="label caps about-label">About</div><div class="prose band-bio">${paras(b.bio)}</div>` : ''}
      ${instruments.length ? `<div class="instr"><span class="label caps">Instrumentation</span><ul>${instruments.map((i) => `<li>${esc(i.name)}</li>`).join('')}</ul></div>` : ''}
    </div>
    ${b.mainPhoto || (b.genreIds || []).length ? `<div class="band-side">${tags(c, b)}${b.mainPhoto ? `<img class="band-photo" src="${esc(src(b.mainPhoto))}" alt="${esc(b.name)}">` : ''}</div>` : ''}
  </section>
  ${videos.length ? sec('watch', 'Watch', `<div class="videos">${videos.map(video).join('')}</div>`) : ''}
  ${tracks.length ? sec('listen', 'Listen', `<ol class="tracks">${tracks.map((t) => `<li><span class="serif">${esc(t.title)}</span><audio controls preload="none" src="${esc(src(t.file))}"></audio></li>`).join('')}</ol>`) : ''}
  ${photos.length ? sec('gallery', 'Gallery', `<div class="gallery">${photos.map((p) => `<figure><img src="${esc(src(p.file))}" alt="${esc(p.alt || p.caption || b.name)}" loading="lazy">${p.caption || p.credit ? `<figcaption>${esc(p.caption)}${p.credit ? ` <span>Photo: ${esc(p.credit)}</span>` : ''}</figcaption>` : ''}</figure>`).join('')}</div>`) : ''}
  ${groups.length ? sec('repertoire', 'Repertoire', `<div class="rep">${groups.map((g) => `<div class="rep-group"><h3 class="serif">${esc(g.st.name)}</h3><ul>${g.songs.map((s) => `<li>${esc(s.title)}${s.artist ? ` <span>${esc(s.artist)}</span>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>`) : ''}
  ${bandQuotes.length ? sec('testimonials', 'Testimonials', quotes(bandQuotes)) : ''}
  ${faqs.length ? sec('faq', 'FAQ', faqList(faqs)) : ''}
  <section class="cta"><a class="serif" href="/contact?band=${encodeURIComponent(b.slug)}">Enquire about ${esc(b.name)}</a></section>`;
  return layout(c, { title: b.seoTitle || b.name, description: b.seoDescription || b.tagline, image: b.shareImage || b.mainPhoto, body, bodyClass: 'band-page' + (hasHero ? ' has-hero' : ''), header: hasHero ? 'on-hero' : 'light' });
}

function faqList(faqs) {
  return `<div class="faqs">${faqs.map((f) => `<details><summary class="serif">${esc(f.question)}</summary><div class="prose">${paras(f.answer)}</div></details>`).join('')}</div>`;
}

function faqPage(db) {
  const c = ctx(db);
  const faqs = db.list('faqs').filter((f) => f.show && !f.bandId);
  const body = `<section class="page"><h1 class="serif">Frequently Asked Questions</h1>${faqList(faqs)}</section>`;
  return layout(c, { title: 'FAQ', body });
}

function infoBlock(s) {
  return `<section class="info">
      <div>
        ${s.phone ? `<div class="label caps">Telephone</div><p>${esc(s.phone)}</p>` : ''}
        ${s.contactEmail ? `<div class="label caps">Email</div><p><a href="mailto:${esc(s.contactEmail)}">${esc(s.contactEmail)}</a></p>` : ''}
      </div>
      <div><div class="label caps">Talk to us</div><p>${lines(s.talkToUs || '')}</p></div>
    </section>`;
}

function bookingForm(c, fromBand) {
  const s = c.s;
  const heard = c.db.list('heardAbout');
  const field = (id, label, input, optional) => `<div class="field${id === 'message' ? ' full' : ''}"><div class="row"><label for="${id}">${label}${optional ? '' : '*'}</label>${optional ? '<span class="opt">Optional</span>' : ''}</div>${input}</div>`;
  return `<form id="booking" novalidate data-confirm="${esc(s.formConfirmation || 'Thank you. We will be in touch shortly.')}">
      <input type="hidden" name="fromBand" value="${esc(fromBand ? fromBand.name : '')}">
      <div class="hp" aria-hidden="true"><label>Leave empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <div class="field full"><div class="row"><span class="flabel" id="pb-label">Preferred bands</span><span class="opt">Optional</span></div>
        <div class="chips" role="group" aria-labelledby="pb-label">${c.bands.map((b) => `<label class="chip"><input type="checkbox" name="preferredBands" value="${esc(b.name)}" data-slug="${esc(b.slug)}"${fromBand && fromBand.id === b.id ? ' checked' : ''}><span>${esc(b.name)}</span></label>`).join('')}</div></div>
      ${field('name', 'Name', '<input id="name" name="name" required autocomplete="name">')}
      ${field('phone', 'Phone number', '<input id="phone" name="phone" type="tel" required autocomplete="tel">')}
      ${field('email', 'Email address', '<input id="email" name="email" type="email" required autocomplete="email">')}
      ${field('location', 'Location of event', '<input id="location" name="location" required>')}
      ${field('eventDate', 'Date of event', '<input id="eventDate" name="eventDate" placeholder="DD/MM/YYYY" required>')}
      ${field('eventType', 'Event type', '<input id="eventType" name="eventType" required>')}
      ${field('heardAbout', 'Where did you hear about us?', `<select id="heardAbout" name="heardAbout"><option value="">Select an option</option>${heard.map((h) => `<option>${esc(h.name)}</option>`).join('')}</select>`, true)}
      ${field('message', 'Message', '<textarea id="message" name="message" required></textarea>')}
      <p class="error" role="alert"></p>
      <div class="submit"><button type="submit">Send enquiry</button></div>
    </form>`;
}

// The enquiry "basket": a bar fixed at the bottom of every page that slides up into the booking form.
function enquirySheet(c) {
  return `<div class="enq-backdrop" hidden></div>
<section class="enq-sheet" id="enquiry" role="dialog" aria-modal="true" aria-labelledby="enq-title" aria-hidden="true">
  <div class="enq-head">
    <h2 class="label caps" id="enq-title">Your enquiry</h2>
    <button class="enq-close caps" type="button">Close</button>
  </div>
  <div class="enq-body">
    ${infoBlock(c.s)}
    ${bookingForm(c, null)}
  </div>
</section>
<button class="enq-dock caps" type="button" aria-controls="enquiry" aria-expanded="false">
  <span class="enq-dock-label">Enquire</span><span class="enq-count"></span><span class="enq-arrow" aria-hidden="true">&uarr;</span>
</button>`;
}

function contactPage(db, query) {
  const c = ctx(db);
  const fromBand = c.bands.find((b) => b.slug === query.get('band'));
  const body = `
  <div class="booking"><div class="inner">
    ${infoBlock(c.s)}
    <h2 class="label caps">Booking form</h2>
    ${bookingForm(c, fromBand)}
  </div></div>`;
  return layout(c, { title: 'Contact', body, header: 'on-dark', bodyClass: 'contact-page', enquiry: false });
}

function genericPage(db, slug) {
  const c = ctx(db);
  const p = db.read('pages').find((x) => x.slug === slug);
  if (!p) return null;
  return layout(c, { title: p.title, body: `<section class="page"><h1 class="serif">${esc(p.title)}</h1><div class="prose">${paras(p.body)}</div></section>` });
}

function notFound(db) {
  const c = ctx(db);
  return layout(c, { title: 'Not found', body: '<section class="page"><h1 class="serif">Page not found</h1><p><a href="/">Back to the home page</a></p></section>' });
}

module.exports = { home, bandPage, faqPage, contactPage, genericPage, notFound, esc, setUnavailable };
