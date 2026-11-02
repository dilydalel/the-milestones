'use strict';
// Local mode: enquiry emails are written to the outbox/ folder instead of being sent.
// When the site moves to Cloudflare this is replaced by a real email service.

const fs = require('fs');
const path = require('path');

const LABELS = [
  ['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['eventDate', 'Date of event'], ['location', 'Location'],
  ['eventType', 'Event type'], ['preferredBands', 'Preferred bands'], ['heardAbout', 'Heard about us'], ['fromBand', 'Came from band page'], ['message', 'Message'],
];

function sendEnquiryEmail({ enquiry, settings, outboxDir }) {
  const to = settings.enquiryEmail || settings.contactEmail || '';
  const subject = `New enquiry: ${enquiry.name} (${enquiry.eventType}, ${enquiry.eventDate})`;
  const body = LABELS.filter(([k]) => enquiry[k]).map(([k, l]) => `${l}: ${enquiry[k]}`).join('\n');
  fs.mkdirSync(outboxDir, { recursive: true });
  const file = path.join(outboxDir, `${enquiry.received.replace(/[: ]/g, '-')}-${enquiry.id}.txt`);
  fs.writeFileSync(file, `To: ${to || '(no enquiry email set in Settings)'}\nReply-To: ${enquiry.email}\nSubject: ${subject}\n\n${body}\n`);
  return `Not sent (local mode). Written to outbox/${path.basename(file)}${to ? ' for ' + to : ''}`;
}

module.exports = { sendEnquiryEmail };
