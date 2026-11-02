# Milestones Music: database structure (DRAFT v2 for approval)

Rule: each fact is stored once. Anything that repeats (genres, songs) is stored once and linked.
Decided: no band members, no gigs list, no prices shown, no function types. One band per media item.
Booking form "Event type" is a free text box.

## Pick-lists (edited once, chosen from everywhere else)
- Band types: name (Party Band, Show Band, String Quartet...)
- Genres: name (Motown, Disco, Funk, Soul...)
- Instrumentation: name (Strings, Brass, Vocals, DJ...)
- Song styles: name (Motown, Disco, Funk, Chart Hits, Rock 'n' Roll, Jewish Hora, Pop, Soul)
- How people heard about us: name (Google, Instagram, Recommendation...), used on the booking form

## Bands
- name, page address, tagline, band type, typical size and size range
- biography
- main photo, optional hero video
- genres, instrumentation (each can be several)
- show on homepage (yes/no) and homepage order
- draft or published
- search title, search description, share image

## Songs (one shared library)
- title, artist, styles (can be several)
- a band's repertoire = a list of songs added to that band, in order

## Media (each item belongs to ONE band, or to no band for site-wide use)
- Photos: file, caption, photographer credit, alt text, order
- Videos: title, YouTube link, poster image, order
- Audio tracks: title, file, order

## Content
- Testimonials: quote, author, optional band (empty = whole site), order, show/hide
- FAQs: question, answer, optional band (empty = whole site), order. Site-wide FAQs appear on their own page at /faq
- Clients: name, logo (optional), order, show/hide
- Pages: title, address, text (e.g. privacy policy)

## Booking form and enquiries
Form fields (copied from the ALR style): name*, phone*, email*, date of event*, preferred bands (optional), how did you hear about us (optional, pick-list), location of event*, event type*, message*.
Each enquiry is both saved on the site and emailed to the address set in settings.
Saved with each enquiry: all the fields above, which band page it came from, date received, status (new, replied).

## Site settings and text (all editable)
- Home page: hero headline, hero link, intro line, hero video and poster
- Contact: email, phone (optional, shown only if filled), "Talk to us" text, form button text
- Booking form: confirmation message, email address that receives enquiries
- Footer line, Facebook, Instagram, YouTube, insurance verification link
- Menu items: label, link, order

## Admin users
- name, email, password, role (Admin or Editor); admins can create other admins

## Still to decide
1. Which email address receives the enquiries?
2. Does the site show a telephone number?
