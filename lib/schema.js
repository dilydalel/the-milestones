'use strict';
// Single source of truth for the data structure. The admin screens, the
// validation and the site all read from this file.

const pick = (label, singular) => ({
  label, singular, group: 'Lists', titleField: 'name', sort: ['order', 'name'],
  listCols: ['name', 'order'],
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'order', label: 'Order', type: 'number', default: 0 },
  ],
});

const FRAMING = [{ value: 'top', label: 'Top' }, { value: 'upper', label: 'Upper' }, { value: 'center', label: 'Middle' }, { value: 'lower', label: 'Lower' }, { value: 'bottom', label: 'Bottom' }];
const STATUS = [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }];

const collections = {
  bands: {
    label: 'Bands', singular: 'band', group: 'Bands', titleField: 'name', sort: ['homeOrder', 'name'],
    listCols: ['name', 'bandTypeId', 'status', 'showOnHome', 'homeOrder'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'status', label: 'Status', type: 'select', options: STATUS, required: true, default: 'draft' },
      { key: 'showOnHome', label: 'Show on home page', type: 'bool', default: true },
      { key: 'homeOrder', label: 'Home page order', type: 'number', default: 0 },
      { key: 'tagline', label: 'Tagline', type: 'text' },
      { key: 'bandTypeId', label: 'Band type', type: 'select', ref: 'bandTypes' },
      { key: 'mainPhoto', label: 'Main photo', type: 'image' },
      { key: 'bio', label: 'Biography', type: 'textarea', rows: 12 },
      { key: 'genreIds', label: 'Genres', type: 'multi', ref: 'genres' },
      { key: 'instrumentIds', label: 'Instrumentation', type: 'multi', ref: 'instruments', help: 'Shown in the order set under Lists > Instrumentation' },
      { key: 'songIds', label: 'Repertoire', type: 'repertoire', ref: 'songs', help: 'Songs in the band\'s genres are included automatically. Tick extra songs, or untick any to leave out' },
      { key: 'excludedSongIds', label: 'Songs left out', type: 'multi', ref: 'songs', hidden: true },
      { key: 'heroVideo', label: 'Hero video', type: 'file', kind: 'video', help: 'Loops at the top of the band page, muted until a visitor presses the sound button. Use a clip with sound for the button to work' },
      { key: 'heroPoster', label: 'Hero poster image', type: 'image', help: 'Shown while the video loads' },
      { key: 'heroPosition', label: 'Hero video framing', type: 'select', options: FRAMING, required: true, default: 'center', help: 'Which part of the video to keep when the top and bottom are cropped' },
      { key: 'heroLoop', label: 'Hero loop: start and end', type: 'loopeditor', virtual: true, video: 'heroVideo', framing: 'heroPosition', start: 'heroStart', end: 'heroEnd' },
      { key: 'heroStart', label: 'Hero loop start (seconds)', type: 'number', default: 0, hidden: true },
      { key: 'heroEnd', label: 'Hero loop end (seconds)', type: 'number', default: 0, hidden: true },
      { key: 'slug', label: 'Page address', type: 'slug', required: true, unique: true, help: 'Shown as /bands/your-address' },
      { key: 'seoTitle', label: 'Search title', type: 'text', help: 'Title shown in Google results and the browser tab. Empty = the band name' },
      { key: 'seoDescription', label: 'Search description', type: 'textarea', rows: 3, help: 'Short summary shown under the title in Google results. Empty = the tagline' },
      { key: 'shareImage', label: 'Share image', type: 'image', help: 'Picture shown when the page is shared on social media or in messages. Empty = the main photo' },
    ],
  },
  songs: {
    label: 'Songs', singular: 'song', group: 'Repertoire', titleField: 'title', sort: ['title'],
    listCols: ['title', 'artist', 'genreIds'],
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'artist', label: 'Artist', type: 'text' },
      { key: 'genreIds', label: 'Genres', type: 'multi', ref: 'genres' },
    ],
  },
  photos: {
    label: 'Photos', singular: 'photo', group: 'Media', titleField: 'file', sort: ['order'], bandFilter: true,
    listCols: ['file', 'caption', 'bandId', 'show', 'order'],
    fields: [
      { key: 'bandId', label: 'Band', type: 'select', ref: 'bands', required: true },
      { key: 'file', label: 'Photo', type: 'image', required: true },
      { key: 'caption', label: 'Caption', type: 'text' },
      { key: 'credit', label: 'Photographer credit', type: 'text' },
      { key: 'show', label: 'Show on band page', type: 'bool', default: true },
      { key: 'order', label: 'Order', type: 'number', default: 0 },
      { key: 'alt', label: 'Alt text', type: 'text' },
    ],
  },
  videos: {
    label: 'Videos', singular: 'video', group: 'Media', titleField: 'title', sort: ['order'], bandFilter: true,
    listCols: ['title', 'bandId', 'youtubeUrl', 'order'],
    fields: [
      { key: 'bandId', label: 'Band', type: 'select', ref: 'bands', help: 'Empty = not shown on any band page, but kept here (it can still be the home page video)' },
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'youtubeUrl', label: 'YouTube link', type: 'url', help: 'If set, this is used instead of the file' },
      { key: 'file', label: 'Video file', type: 'file', kind: 'video' },
      { key: 'poster', label: 'Poster image', type: 'image' },
      { key: 'order', label: 'Order', type: 'number', default: 0 },
    ],
  },
  tracks: {
    label: 'Audio tracks', singular: 'track', group: 'Media', titleField: 'title', sort: ['order'], bandFilter: true,
    listCols: ['title', 'bandId', 'file', 'order'],
    fields: [
      { key: 'bandId', label: 'Band', type: 'select', ref: 'bands', required: true },
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'file', label: 'Audio file', type: 'file', kind: 'audio', required: true },
      { key: 'order', label: 'Order', type: 'number', default: 0 },
    ],
  },
  testimonials: {
    label: 'Testimonials', singular: 'testimonial', group: 'Content', titleField: 'author', sort: ['order'], bandFilter: true,
    listCols: ['author', 'quote', 'bandId', 'show', 'order'],
    fields: [
      { key: 'quote', label: 'Quote', type: 'textarea', rows: 6, required: true },
      { key: 'author', label: 'Author', type: 'text', required: true },
      { key: 'bandId', label: 'Band', type: 'select', ref: 'bands', help: 'Empty = shown across the whole site' },
      { key: 'show', label: 'Show', type: 'bool', default: true },
      { key: 'order', label: 'Order', type: 'number', default: 0 },
    ],
  },
  faqs: {
    label: 'FAQs', singular: 'FAQ', group: 'Content', titleField: 'question', sort: ['order'], bandFilter: true,
    listCols: ['question', 'bandId', 'show', 'order'],
    fields: [
      { key: 'question', label: 'Question', type: 'text', required: true },
      { key: 'answer', label: 'Answer', type: 'textarea', rows: 8, required: true },
      { key: 'bandId', label: 'Band', type: 'select', ref: 'bands', help: 'Empty = shown on the FAQ page' },
      { key: 'show', label: 'Show', type: 'bool', default: true },
      { key: 'order', label: 'Order', type: 'number', default: 0 },
    ],
  },
  clients: {
    label: 'Clients', singular: 'client', group: 'Content', titleField: 'name', sort: ['order'],
    listCols: ['logo', 'name', 'show', 'order'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'logo', label: 'Logo', type: 'image' },
      { key: 'show', label: 'Show', type: 'bool', default: true },
      { key: 'order', label: 'Order', type: 'number', default: 0 },
    ],
  },
  pages: {
    label: 'Pages', singular: 'page', group: 'Content', titleField: 'title', sort: ['title'],
    listCols: ['title', 'slug'],
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'slug', label: 'Page address', type: 'slug', required: true, unique: true, help: 'Shown as /your-address' },
      { key: 'body', label: 'Text', type: 'textarea', rows: 20 },
    ],
  },
  menu: {
    label: 'Menu items', singular: 'menu item', group: 'Site', titleField: 'label', sort: ['order'],
    listCols: ['label', 'url', 'order'],
    fields: [
      { key: 'label', label: 'Label', type: 'text', required: true },
      { key: 'url', label: 'Link', type: 'text', required: true },
      { key: 'order', label: 'Order', type: 'number', default: 0 },
    ],
  },
  settings: {
    label: 'Settings and text', singular: 'settings', group: 'Site', single: true,
    fields: [
      { key: 'heroHeadline', label: 'Home page headline', type: 'textarea', rows: 2 },
      { key: 'heroLinkText', label: 'Hero link text', type: 'text' },
      { key: 'heroLinkUrl', label: 'Hero link address', type: 'text' },
      { key: 'introLine', label: 'Home page intro line', type: 'textarea', rows: 3 },
      { key: 'heroVideo', label: 'Hero video', type: 'file', kind: 'video' },
      { key: 'heroPoster', label: 'Hero poster image', type: 'image' },
      { key: 'heroPosition', label: 'Hero video framing', type: 'select', options: FRAMING, required: true, default: 'center', help: 'Which part of the video to keep when the top and bottom are cropped' },
      { key: 'heroLoop', label: 'Hero loop: start and end', type: 'loopeditor', virtual: true, video: 'heroVideo', framing: 'heroPosition', start: 'heroStart', end: 'heroEnd' },
      { key: 'heroStart', label: 'Hero loop start (seconds)', type: 'number', default: 0, hidden: true },
      { key: 'heroEnd', label: 'Hero loop end (seconds)', type: 'number', default: 0, hidden: true },
      { key: 'testimonialsHeading', label: 'Home page testimonials heading', type: 'text', default: 'Testimonials', help: 'Shown above the home page video and quotes' },
      { key: 'clientsHeading', label: 'Home page clients heading', type: 'text', default: 'Clients' },
      { key: 'homeVideoId', label: 'Home page video', type: 'select', ref: 'videos', help: 'Shown above the testimonials. Choose "— none —" to remove it' },
      { key: 'siteName', label: 'Site name', type: 'text' },
      { key: 'contactEmail', label: 'Contact email shown on site', type: 'text' },
      { key: 'phone', label: 'Telephone', type: 'text', help: 'Shown only if filled in' },
      { key: 'talkToUs', label: '"Talk to us" text', type: 'textarea', rows: 3 },
      { key: 'enquiryEmail', label: 'Email that receives enquiries', type: 'text' },
      { key: 'formConfirmation', label: 'Booking form confirmation message', type: 'text' },
      { key: 'footerLine', label: 'Footer line', type: 'text' },
      { key: 'facebook', label: 'Facebook', type: 'url' },
      { key: 'instagram', label: 'Instagram', type: 'url' },
      { key: 'youtube', label: 'YouTube', type: 'url' },
      { key: 'insuranceUrl', label: 'Insurance verification link', type: 'url' },
    ],
  },
  enquiries: {
    label: 'Enquiries', singular: 'enquiry', group: 'Enquiries', titleField: 'name', sort: ['-received'], private: true, noCreate: true,
    listCols: ['received', 'name', 'eventType', 'eventDate', 'status'],
    fields: [
      { key: 'status', label: 'Status', type: 'select', options: [{ value: 'new', label: 'New' }, { value: 'replied', label: 'Replied' }, { value: 'archived', label: 'Archived' }], default: 'new' },
      { key: 'received', label: 'Received', type: 'text', readonly: true },
      { key: 'name', label: 'Name', type: 'text', readonly: true },
      { key: 'phone', label: 'Phone', type: 'text', readonly: true },
      { key: 'email', label: 'Email', type: 'text', readonly: true },
      { key: 'eventDate', label: 'Date of event', type: 'text', readonly: true },
      { key: 'location', label: 'Location of event', type: 'text', readonly: true },
      { key: 'eventType', label: 'Event type', type: 'text', readonly: true },
      { key: 'preferredBands', label: 'Preferred bands', type: 'text', readonly: true },
      { key: 'heardAbout', label: 'Heard about us', type: 'text', readonly: true },
      { key: 'message', label: 'Message', type: 'textarea', rows: 8, readonly: true },
      { key: 'fromBand', label: 'Came from band page', type: 'text', readonly: true },
      { key: 'emailStatus', label: 'Email', type: 'text', readonly: true },
    ],
  },
  bandTypes: pick('Band types', 'band type'),
  genres: pick('Genres', 'genre'),
  instruments: pick('Instrumentation', 'instrument'),
  heardAbout: pick('How people heard about us', 'option'),
};

const groups = ['Bands', 'Repertoire', 'Media', 'Content', 'Enquiries', 'Site', 'Lists'];

// Collections sorted by a number can be reordered by dragging in the admin.
for (const c of Object.values(collections)) {
  if (c.sort && ['order', 'homeOrder'].includes(c.sort[0])) c.orderKey = c.sort[0];
}

module.exports = { collections, groups };
