'use strict';
// A band's repertoire = songs in any of the band's genres, plus songs added by hand,
// minus songs left out by hand. (The admin uses the same rule in admin.js.)
function repertoireIds(band, songs) {
  const genres = new Set(band.genreIds || []);
  const extra = new Set(band.songIds || []);
  const left = new Set(band.excludedSongIds || []);
  return songs
    .filter((s) => !left.has(s.id) && (extra.has(s.id) || (s.genreIds || []).some((g) => genres.has(g))))
    .map((s) => s.id);
}
module.exports = { repertoireIds };
