(function () {
  // ---------- menu
  var menu = document.getElementById('menu');
  var btn = document.querySelector('.menu-btn');
  function setMenu(open) { menu.classList.toggle('open', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  btn.addEventListener('click', function () { setMenu(true); });
  menu.querySelector('.close').addEventListener('click', function () { setMenu(false); });
  menu.addEventListener('click', function (e) { if (e.target.tagName === 'A') setMenu(false); });

  // ---------- YouTube: show a still until clicked, then load the player
  document.querySelectorAll('img[data-yt-thumb]').forEach(function (img) {
    function check() { if (img.naturalWidth && img.naturalWidth <= 120) img.src = img.src.replace('maxresdefault', 'hqdefault'); }
    if (img.complete) check(); else img.addEventListener('load', check);
    img.addEventListener('error', function () { img.src = img.src.replace('maxresdefault', 'hqdefault'); });
  });
  document.querySelectorAll('.yt').forEach(function (box) {
    box.addEventListener('click', function () {
      if (box.querySelector('iframe')) return;
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + box.getAttribute('data-yt') + '?autoplay=1&rel=0&playsinline=1';
      var b = box.querySelector('.play'); f.title = b ? b.getAttribute('aria-label') : 'Video';
      f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.setAttribute('allowfullscreen', '');
      box.innerHTML = ''; box.appendChild(f); box.classList.add('playing');
    });
  });

  // ---------- hero loops: play only the chosen section, on repeat
  document.querySelectorAll('video[data-start]').forEach(function (v) {
    var a = parseFloat(v.getAttribute('data-start')) || 0, b = parseFloat(v.getAttribute('data-end')) || 0;
    if (!a && !b) return;
    function toStart() { try { v.currentTime = a; } catch (e) {} }
    v.addEventListener('loadedmetadata', function () { if (v.currentTime < a - 0.2) toStart(); });
    v.addEventListener('timeupdate', function () { if ((b && v.currentTime >= b) || v.currentTime < a - 0.5) toStart(); });
    v.addEventListener('ended', function () { toStart(); v.play(); });
  });

  // ---------- testimonials slider (as on the FSQ site): no looping, arrows hide at the ends
  document.querySelectorAll('.quotes').forEach(function (q) {
    var t = q.querySelector('.qtrack'), pv = q.querySelector('.qa.prev'), nx = q.querySelector('.qa.next');
    if (!t || !pv || !nx) return;
    function step(d) {
      var f = t.querySelector('figure'), gap = parseFloat(getComputedStyle(t).columnGap) || 0;
      t.scrollBy({ left: d * (f.getBoundingClientRect().width + gap), behavior: 'smooth' });
    }
    function upd() {
      pv.style.visibility = t.scrollLeft > 4 ? 'visible' : 'hidden';
      nx.style.visibility = t.scrollLeft + t.clientWidth < t.scrollWidth - 4 ? 'visible' : 'hidden';
    }
    pv.addEventListener('click', function () { step(-1); });
    nx.addEventListener('click', function () { step(1); });
    t.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    upd();
  });

  // ---------- hero sound button
  document.querySelectorAll('.sound-btn').forEach(function (b) {
    var v = b.parentNode.querySelector('video');
    if (!v) return;
    b.addEventListener('click', function () {
      v.muted = !v.muted;
      if (!v.muted) { v.volume = 1; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      b.setAttribute('aria-pressed', v.muted ? 'false' : 'true');
      b.setAttribute('aria-label', v.muted ? 'Turn sound on' : 'Turn sound off');
      b.title = v.muted ? 'Sound on' : 'Sound off';
    });
  });

  var form = document.getElementById('booking');
  if (!form) return;

  // ---------- enquiry "basket": kept while moving between pages
  var KEY = 'mm-enquiry';
  function loadDraft() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function saveDraft(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function clearDraft() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function fields() { return form.querySelectorAll('input[name]:not([type=checkbox]):not([type=hidden]):not([name=website]), select[name], textarea[name]'); }
  function chips() { return form.querySelectorAll('.chip input'); }
  function readForm() {
    var d = { fields: {}, bands: [], fromBand: form.elements.fromBand.value };
    fields().forEach(function (el) { if (el.value) d.fields[el.name] = el.value; });
    chips().forEach(function (el) { if (el.checked) d.bands.push(el.value); });
    return d;
  }
  function writeForm(d) {
    fields().forEach(function (el) { if (d.fields && d.fields[el.name] != null) el.value = d.fields[el.name]; });
    chips().forEach(function (el) { if ((d.bands || []).indexOf(el.value) >= 0) el.checked = true; });
    if (d.fromBand && !form.elements.fromBand.value) form.elements.fromBand.value = d.fromBand;
  }
  function selectBand(slug) {
    chips().forEach(function (el) {
      if (el.getAttribute('data-slug') === slug) {
        el.checked = true;
        if (!form.elements.fromBand.value) form.elements.fromBand.value = el.value;
      }
    });
  }

  var sheet = document.getElementById('enquiry');
  var dock = document.querySelector('.enq-dock');
  var backdrop = document.querySelector('.enq-backdrop');
  var sent = false;

  function updateDock() {
    if (!dock) return;
    var n = sent ? 0 : form.querySelectorAll('.chip input:checked').length;
    dock.querySelector('.enq-count').textContent = n ? n + (n === 1 ? ' band' : ' bands') : '';
  }
  function persist() { if (!sent) saveDraft(readForm()); updateDock(); }

  var draft = loadDraft();
  if (draft) writeForm(draft);
  var params = new URLSearchParams(location.search);
  if (params.get('band')) selectBand(params.get('band'));
  form.addEventListener('input', persist);
  form.addEventListener('change', persist);
  updateDock();

  function openSheet(slug) {
    if (!sheet) return;
    if (slug) { selectBand(slug); persist(); }
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    dock.setAttribute('aria-expanded', 'true');
    document.body.classList.add('enq-open');
    setTimeout(function () {
      var first = Array.prototype.find.call(fields(), function (el) { return !el.value; });
      (first || sheet.querySelector('.enq-close')).focus({ preventScroll: true });
    }, 360);
  }
  function closeSheet() {
    if (!sheet || !sheet.classList.contains('open')) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    dock.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('enq-open');
    dock.focus({ preventScroll: true });
  }
  if (sheet) {
    dock.addEventListener('click', function () { openSheet(); });
    sheet.querySelector('.enq-close').addEventListener('click', closeSheet);
    backdrop.addEventListener('click', closeSheet);
    // any link to the contact page opens the sheet instead
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var u = new URL(a.href, location.href);
      if (u.origin !== location.origin || u.pathname !== '/contact') return;
      e.preventDefault();
      setMenu(false);
      openSheet(u.searchParams.get('band'));
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (menu.classList.contains('open')) setMenu(false); else closeSheet();
  });

  // ---------- send
  var err = form.querySelector('.error');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var bad = [];
    form.querySelectorAll('[required]').forEach(function (el) {
      var ok = el.value.trim() !== '' && (el.type !== 'email' || /^\S+@\S+\.\S+$/.test(el.value.trim()));
      el.closest('.field').classList.toggle('invalid', !ok);
      if (!ok) bad.push(el);
    });
    if (bad.length) { err.textContent = 'Please fill in the highlighted fields.'; bad[0].focus(); return; }
    err.textContent = '';
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (v, k) { data[k] = fd.getAll(k).join(', '); });
    var button = form.querySelector('button[type=submit]');
    button.disabled = true;
    fetch('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j; }); })
      .then(function () {
        sent = true;
        clearDraft();
        updateDock();
        form.innerHTML = '';
        var p = document.createElement('p');
        p.className = 'thanks serif';
        p.textContent = form.getAttribute('data-confirm');
        form.appendChild(p);
      })
      .catch(function (x) { err.textContent = x.message + ' Please try again, or email us.'; button.disabled = false; });
  });
})();
