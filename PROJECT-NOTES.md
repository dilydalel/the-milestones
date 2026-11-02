# Milestones website: project notes

Current site: https://themilestoneslive.com/ (WordPress, one long page plus FAQ and Privacy Policy pages)
Plan: build locally in this folder, static site (not WordPress), with an online admin (multi-user sign-in), then GitHub when ready, as with the FSQ site.

## Current site contents (to extract)
- Hero: logo, header image, Contact Us button; intro text
- Watch (in menu; no video embeds visible in the page text, to check)
- Listen: 8 MP3 tracks
- About: band sizes (5 to 12 pieces, typically 7), venues, artists members have worked with
- Repertoire by genre: Motown, Disco, Funk, Chart Hits, Rock 'n' Roll, Jewish Hora, Pop, Soul
- Testimonials (weddings, corporate) and client logos
- Gallery of event photos
- Contact form: name, email, phone, event date, message
- FAQ page: 15 Q&As
- Privacy Policy page; social links (Facebook, Instagram, YouTube)
- No gig calendar, no individual member profiles

## Proposed data (each fact stored once), not yet agreed
- Tracks: title, audio file
- Videos: title, YouTube link
- Songs: title, artist, genre (repertoire list generated from these)
- Testimonials: quote, name, event type
- Client logos: image, name
- Gallery photos: image, caption
- FAQs: question, answer, order
- Band settings: intro, band sizes, venues, "worked with" artists, contact email, social links
- Pages: privacy policy text

## Open questions (unanswered)
1. Contact form: static site needs a form service or email route. Preference?
2. Members: add a "The Band" section with individual members and photos, or keep as is?
3. Gigs: upcoming-gigs list, or booking-only?

## Decisions so far
- Look will be very different from FSQ (this is a function band, not a concert site)
- Work slowly; short suggestions only; design comes first
- At the end, flag anything not properly addressed

## Design decisions (2 Nov 2026)
- Look: bright and retro, built around logo (black #1d1d1b); photos have white backgrounds. Two mock-ups made: A (bright/retro, red+gold stripes) and B (modern/minimal, white/black/gold). Not yet chosen.
- Site will be multi-page, not one long page. Proposed pages: Home, Watch & Listen, Repertoire, About, Testimonials/Gallery (to decide whether together or separate), FAQ, Contact, Privacy Policy (footer only).
- Hero: short silent looping video clip (10 to 15 s) behind the headline, plus a "Watch the band" button opening the full video in a plain YouTube player. Hero full video: https://www.youtube.com/watch?v=dVBMfdB5a6g (same as one of the six on the old site).
- Old site videos are self-hosted MP4s (about 120 MB total) at themilestoneslive.com/wp-content/uploads/: Milestones_GH_PALWS, Milestones2019, Milestones-Live-1, Milestones-Strings, Milestones-DJ, Milestones_Testimonials (.mp4). Prefer YouTube links for all videos in the new site; to confirm which are on YouTube.
- Downloaded logo and some photos are in source-assets/.

## Direction change (2 Nov 2026, afternoon)
- Site becomes "Milestones Music": an agency-style site (like alrmusic.co.uk) with several bands. First four: The Milestones, The Gemstones, The Steppingstones, Stony Strings (string quartet).
- Style reference: https://www.alrmusic.co.uk/ (full-width video hero, serif headline, small-caps labels, clean grid of band boxes, minimal menu: Menu / logo / Contact).
- Hero: looping silent video (assets/hero-loop-gh.mp4, 30 s, from the Greatest Hits video).
- Logo for the header: "MILESTONES / MUSIC" set in the same serif as the hero headline (text for now; make a proper logo file later). The original Milestones logo stays for The Milestones band.
- Mock-ups in this folder: mockup-c (v1, v2), mockup-d (current, with v1 saved). Not yet approved.

## Data requirements gathered so far
- Bands: name, page address, tagline, band type (party, show, roaming...), size range, order, shown-on-homepage choice, draft/published.
- Shared pick-lists (defined once): genres, instrumentation, function types (weddings, corporate, parties), repertoire styles. Function types also drive the homepage links.
- Repertoire: one shared song library (title, artist, styles; a song can have several styles). 'Artist' = the famous performer (what the old site shows); no songwriter field, songs added to bands; style can be displayed (grouping).
- Band biographies; media per band (photos with caption and photographer credit, main image, videos, audio).
- Testimonials and client logos, FAQs, enquiry form (knows which band), site settings, admin users and roles.
- ALL visible text must be editable from the admin, including the home page hero headline ("Live Bands For Exceptional Events" is placeholder), the hero links, and the intro line.
- Open questions: is the site only Milestones or an agency (now: agency, name Milestones Music); are the other bands his own; prices shown or enquire-only; members section; gigs list; contact form method.

- Testimonials: quote + author only (no event types). Band link is optional; empty = applies to the whole site. The 16 quotes from the old site are imported with band left empty (data/testimonials-from-old-site.json). Client logos are 3 combined SVGs in source-assets/client-logos (decision pending: keep combined or split).
- Repertoire imported: data/repertoire-from-old-site.json (161 songs, 8 styles, fields title/artist/styles).

## Imported from the old site (2 Nov 2026), all in data/
- repertoire-from-old-site.json: 161 songs, 8 styles (title, artist, styles)
- testimonials-from-old-site.json: 16 quotes (quote, author, optional band)
- faqs-from-old-site.json: 15 FAQs (question, answer, optional band)
- about-from-old-site.json: About text blocks + auto-split venues list and "worked with" artists list (to check)
- clients-from-old-site.json: 11 clients, one logo each in assets/clients/*.svg (split from the combined logo image; names read from the logos, to check)
- Still to extract: Listen tracks (8 MP3s), videos, gallery photos, contact/footer text, privacy policy text, social links.
- Admin note: client = name + optional logo.

## Also imported (2 Nov 2026)
- media-from-old-site.json: 8 Listen tracks (assets/audio, 51 MB mp3), 6 videos (source-assets/old-site-videos, 118 MB, with poster images; titles guessed from file names; youtube_url left blank), 19 gallery photos (assets/gallery; these are the web-size versions only, 540 to 1067 px wide, no larger originals online).
- site-text-from-old-site.json: settings (contact email themilestones@themilestoneslive.com, Facebook, Instagram, YouTube channel, insurance verification link, footer line), text blocks (Watch intro, extra services text about string quartet/jazz/DJ, insurance line, Let's Talk text, Listen title), contact form fields, and the full privacy/cookie policy text.
- DO NOT push source-assets/old-site-videos or other big files to GitHub (118 MB videos). Videos to be hosted on YouTube instead. Add a .gitignore before the first push.
- Old-site video count: 6; the YouTube hero video https://www.youtube.com/watch?v=dVBMfdB5a6g equals Milestones2019.mp4.

## Photos imported (2 Nov 2026)
- data/photos-from-old-site.json lists 50 images from the old media library: 22 gallery photos in assets/gallery (3 were not shown on the old page), 28 band/hero/portrait photos in assets/photos. All are web-size only (largest 1280 px wide); no larger originals online. Many are narrow single-member portraits (e.g. 219 to 400 px wide), too small for big display.
- assets/photos/royal-garden-hotel-logo3.png is a logo, not a photo (belongs with clients).
- Still need from Francis: larger originals, photos for The Gemstones, The Steppingstones, Stony Strings.

## Database structure draft written (2 Nov 2026): see DATABASE-STRUCTURE-DRAFT.md (awaiting approval)

## Decisions (2 Nov 2026, 15:47)
- FAQ becomes its own page at /faq (site-wide FAQs). No band members. No gigs list. No prices. One band per media item.
- Booking form copied from ALR style (name, phone, email, date, preferred bands, how heard, location, event type, message). Enquiries are saved on the site AND emailed.
- Database draft v2: DATABASE-STRUCTURE-DRAFT.md (v1 kept as -v1). Booking form mock-up: mockup-booking.html.
- Needs a small server part for the form (saving + email), as the site is otherwise static. Plan to host on Cloudflare as with FSQ.

## Local site + admin built (2 Nov 2026)
- Start: double-click start.command (needs Node.js on the Mac), or `node server.js`. Site http://localhost:3000, admin /admin. See README-LOCAL.md.
- Code: server.js (no dependencies), lib/schema.js (data structure, drives admin), lib/db.js (JSON files in db/, backup on every save to db/_backups), lib/render.js (public pages), admin/ (admin UI), public/ (site CSS/JS), tools/import-old-site.js (built db/ from data/; refuses to overwrite unless --force).
- db/ is the live data (to go in GitHub). Enquiries go to private/ (not GitHub). Emails written to outbox/ (not sent yet).
- Local only (127.0.0.1), no login yet. Next for Cloudflare: login/roles, real email, hosting.
- Assumed by Claude, to check: Milestones tagline/type/genres, intro line, "Talk to us" text, video titles; the 2019 video uses the YouTube link.

- 2 Nov 2026 16:11: function types removed from admin, band pages and data (old list kept in db/_backups). Booking form Event type is now a free text box.
- 2 Nov 2026 16:22: band hero has a sound on/off button (home hero stays silent). Milestones hero uses assets/hero-loop-gh-sound.mp4. start.command now auto-restarts on code changes (Node 20+).
- 2 Nov 2026 16:44: song styles merged into Genres (one list for songs and bands). Band repertoire = songs in the band's genres + songs added by hand - songs left out (fields songIds = extras, excludedSongIds = left out). Conversion script tools/merge-styles-into-genres.js (old styles list kept in db/_backups). Share image falls back to main photo; search title/description fall back to name/tagline.
- 2 Nov 2026 16:47: assets/hero-loop-2019-sound.mp4 (2019 clip 40-52 s with audio) made and set as The Gemstones hero video.
- 2 Nov 2026 17:04: hero loop editor (start/end + live crop preview) for band heroes and home hero; fields heroStart/heroEnd; site loops only that section. Hero framing field heroPosition (top/upper/center/lower/bottom). Admin refuses stale saves (version check).

## Online (Nov 2026)
- Code and content are on GitHub: dilydalel/the-milestones (branch main). Hosting: Cloudflare Worker "the-milestones" (see README-ONLINE.md for setup).
- Online admin saves commit db/*.json straight to GitHub. Uploads go to Cloudflare R2; logins and enquiries live in Cloudflare D1 (enquiries never go to GitHub).
- Enquiry emails go to Settings > Enquiry email (default themilestones@themilestoneslive.com); sending needs a Resend account and key.
- Francis is the only admin for now; he adds band members himself (Admin and Editor roles).
- Videos in Media > Videos need a YouTube link to show online. The original video files (source-assets) are not uploaded. The band hero loops in assets/ are uploaded and work online; new hero loops can be uploaded in the band's Hero video field.
- The Mac folder is not linked to GitHub yet: once the site is live, edit online, not locally, or local changes will need merging.
