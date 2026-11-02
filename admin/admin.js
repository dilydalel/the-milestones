/* Milestones Music admin. Screens are generated from the schema (lib/schema.js). */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  let SCHEMA, GROUPS, ME = null, MODE = 'local';
  const cache = {};
  let dirty = false, currentHash = '', ignoreHash = false;

  async function api(method, url, body) {
    const opt = { method, headers: {} };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(url, opt);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.needLogin) { showLogin(); throw new Error('Please sign in.'); }
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    return j;
  }
  const load = async (name, force) => (cache[name] && !force ? cache[name] : (cache[name] = await api('GET', '/api/c/' + name)));
  const forget = (name) => { delete cache[name]; };

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
    clearTimeout(t._t); t._t = setTimeout(() => (t.className = ''), err ? 6000 : 2200);
  }

  const titleOf = (name, it) => {
    const c = SCHEMA[name];
    if (!it) return '';
    if (name === 'photos') return it.caption || String(it.file || '').split('/').pop();
    return String(it[c.titleField] || '(untitled)');
  };
  const optionLabel = (name, it) => (name === 'songs' && it.artist ? `${it.title} — ${it.artist}` : titleOf(name, it));
  const fileUrl = (p) => (!p ? '' : /^https?:/i.test(p) ? p : '/' + p.replace(/^\/+/, ''));
  const KIND_OK = { image: /^image\//, audio: /^audio\//, video: /^video\// };
  async function uploadFile(file, kind) {
    const folder = { image: 'photos', audio: 'audio', video: 'video' }[kind] || 'files';
    const r = await fetch(`/api/upload?folder=${folder}&name=${encodeURIComponent(file.name)}`, { method: 'PUT', body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Upload failed');
    forget('__files');
    return j.path;
  }
  // stop the browser opening a file that is dropped outside a drop area
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  const appendAll = (el, ...kids) => el.append(...kids.flat().filter((k) => k != null && k !== false));

  // ---------- navigation
  async function renderNav(activeColl) {
    let status = { newEnquiries: 0 };
    try { status = await api('GET', '/api/status'); } catch {}
    const box = $('#nav-links'); box.innerHTML = '';
    if (MODE === 'online' && ME) {
      const acct = $('#nav-account') || (() => { const d = h('div', { id: 'nav-account' }); $('#nav').append(d); return d; })();
      acct.innerHTML = '';
      acct.append(h('div', { class: 'who' }, 'Signed in as ', h('b', {}, ME.name || ME.email)),
        h('a', { href: '#/account' }, 'Change password'), ' · ',
        h('a', { href: '#', onclick: async (e) => { e.preventDefault(); await fetch('/api/logout', { method: 'POST' }); location.reload(); } }, 'Sign out'));
    }
    for (const g of GROUPS) {
      const names = Object.keys(SCHEMA).filter((n) => SCHEMA[n].group === g);
      if (!names.length) continue;
      box.append(h('h4', {}, g));
      for (const n of names) {
        const href = SCHEMA[n].single ? '#/settings' : '#/c/' + n;
        box.append(h('a', { class: 'item' + (n === activeColl ? ' active' : ''), href }, SCHEMA[n].label,
          n === 'enquiries' && status.newEnquiries ? h('span', { class: 'badge' }, status.newEnquiries) : null));
      }
      if (g === 'Site' && MODE === 'online' && ME && ME.role === 'admin') box.append(h('a', { class: 'item' + (activeColl === '__users' ? ' active' : ''), href: '#/users' }, 'Users'));
    }
  }

  // ---------- router
  async function route() {
    const hash = location.hash || '#/';
    if (ignoreHash) { ignoreHash = false; return; }
    if (dirty && hash !== currentHash && !confirm('You have unsaved changes. Leave without saving?')) { ignoreHash = true; location.hash = currentHash; return; }
    dirty = false; currentHash = hash;
    const p = hash.slice(2).split('/');
    const view = $('#view');
    view.innerHTML = '<p class="muted">Loading…</p>';
    try {
      if (p[0] === 'c' && SCHEMA[p[1]] && p[2]) { await renderNav(p[1]); await editView(p[1], p[2] === 'new' ? null : p[2]); }
      else if (p[0] === 'c' && SCHEMA[p[1]]) { await renderNav(p[1]); await listView(p[1]); }
      else if (p[0] === 'settings') { await renderNav('settings'); await editView('settings', null); }
      else if (p[0] === 'users' && MODE === 'online') { await renderNav('__users'); await usersView(p[1]); }
      else if (p[0] === 'account' && MODE === 'online') { await renderNav(); accountView(); }
      else { await renderNav(); await dashboard(); }
      window.scrollTo(0, 0);
    } catch (e) { view.innerHTML = ''; view.append(h('p', { class: 'note' }, 'Could not load: ' + e.message)); }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- dashboard
  async function dashboard() {
    const view = $('#view'); view.innerHTML = '';
    const status = await api('GET', '/api/status');
    const show = ['bands', 'songs', 'photos', 'videos', 'tracks', 'testimonials', 'faqs', 'clients', 'enquiries'];
    const counts = await Promise.all(show.map((n) => load(n, true).then((x) => x.length)));
    appendAll(view,
      h('h1', {}, 'Admin'),
      h('p', { class: 'muted' }, 'Everything you save here changes the website straight away. Refresh the website tab to see it.'),
      h('div', { class: 'cards' }, show.map((n, i) => h('a', { class: 'card', href: '#/c/' + n }, h('b', {}, counts[i]), h('span', {}, SCHEMA[n].label)))),
      MODE === 'online'
        ? h('div', { class: 'note' }, 'Every save is kept in GitHub, so earlier versions can always be recovered. ',
            status.emailReady ? `New enquiries are emailed to ${status.enquiryEmail || '(set the address in Settings)'}.` : 'Email sending is not set up yet: enquiries are saved here under Enquiries.')
        : h('div', { class: 'note' },
            `Local sandbox: this admin only works on this computer, with no login. Every save keeps a backup in db/_backups. `,
            `Enquiry emails are not sent from the Mac; they are written to the outbox folder (${status.outbox || 0} so far).`),
    );
  }

  // ---------- list
  function cellValue(f, v, refs) {
    if (!f) return '';
    if (f.type === 'bool') return v ? '✓' : '';
    if (f.type === 'image') return v ? h('img', { class: 'thumb', src: fileUrl(v), loading: 'lazy', alt: '' }) : '';
    if (f.type === 'file') return String(v || '').split('/').pop();
    if (f.type === 'select' && f.options) return (f.options.find((o) => o.value === v) || {}).label || v || '';
    if (f.type === 'select' && f.ref) return v ? titleOf(f.ref, refs[f.ref][v]) || '(missing)' : '—';
    if (f.type === 'multi') return h('div', { class: 'clip' }, (v || []).map((id) => titleOf(f.ref, refs[f.ref][id])).filter(Boolean).join(', '));
    return h('div', { class: 'clip' }, String(v == null ? '' : v));
  }

  async function listView(name) {
    const c = SCHEMA[name];
    const view = $('#view'); view.innerHTML = '';
    const items = await load(name, true);
    const fields = Object.fromEntries(c.fields.map((f) => [f.key, f]));
    const refNames = [...new Set(c.fields.filter((f) => f.ref).map((f) => f.ref))];
    const refs = {};
    for (const r of refNames) refs[r] = Object.fromEntries((await load(r, true)).map((x) => [x.id, x]));

    const search = h('input', { type: 'search', placeholder: 'Search ' + c.label.toLowerCase() });
    let bandSel = null;
    if (c.bandFilter) {
      bandSel = h('select', {}, h('option', { value: '*' }, 'All bands'), h('option', { value: '' }, 'No band (whole site)'),
        Object.values(refs.bands || {}).map((b) => h('option', { value: b.id }, b.name)));
    }
    const tbody = h('tbody');
    const countEl = h('span', { class: 'muted' });
    const ok = c.orderKey;
    const cols = c.listCols.filter((k) => k !== ok);
    let dragRow = null;
    const saveOrder = async (visibleIds) => {
      // put the reordered visible rows back into the slots they occupy in the full list
      const all = items.map((x) => x.id);
      const slots = all.map((id, i) => (visibleIds.includes(id) ? i : -1)).filter((i) => i >= 0);
      slots.forEach((slot, j) => { all[slot] = visibleIds[j]; });
      try {
        const sorted = await api('PUT', '/api/order/' + name, { ids: all });
        items.splice(0, items.length, ...sorted); forget(name); toast('Order saved'); draw();
      } catch (e) { toast(e.message, true); draw(); }
    };
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const band = bandSel ? bandSel.value : '*';
      tbody.innerHTML = '';
      const shown = items.filter((it) => (band === '*' || (it.bandId || '') === band) &&
        (!q || c.fields.some((f) => String(it[f.key] == null ? '' : it[f.key]).toLowerCase().includes(q))));
      for (const it of shown) {
        const tr = h('tr', { onclick: () => (location.hash = `#/c/${name}/${it.id}`) },
          ok ? h('td', { class: 'grip', title: 'Drag to reorder', onclick: (e) => e.stopPropagation() }, '⋮⋮') : null,
          cols.map((k) => h('td', {}, cellValue(fields[k], it[k], refs))));
        tr._id = it.id;
        if (ok) {
          tr.draggable = true;
          tr.addEventListener('dragstart', (e) => { dragRow = tr; tr.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.id); });
          tr.addEventListener('dragend', () => { tr.classList.remove('dragging'); tbody.querySelectorAll('.drop-above,.drop-below').forEach((r) => r.classList.remove('drop-above', 'drop-below')); });
          tr.addEventListener('dragover', (e) => {
            if (!dragRow || dragRow === tr) return;
            e.preventDefault();
            const below = e.clientY > tr.getBoundingClientRect().top + tr.offsetHeight / 2;
            tr.classList.toggle('drop-below', below); tr.classList.toggle('drop-above', !below);
          });
          tr.addEventListener('dragleave', () => tr.classList.remove('drop-above', 'drop-below'));
          tr.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (!dragRow || dragRow === tr) return;
            const below = tr.classList.contains('drop-below');
            tr.classList.remove('drop-above', 'drop-below');
            tr.parentNode.insertBefore(dragRow, below ? tr.nextSibling : tr);
            saveOrder([...tbody.children].map((r) => r._id));
          });
        }
        tbody.append(tr);
      }
      countEl.textContent = `${shown.length} of ${items.length}`;
    };
    search.addEventListener('input', draw);
    if (bandSel) bandSel.addEventListener('change', draw);
    const drop = name === 'photos' ? photoDropZone(items, refs.bands || {}, bandSel, () => listView(name)) : null;
    appendAll(view,
      h('h1', {}, c.label),
      h('div', { class: 'bar' }, search, bandSel, countEl, h('span', { class: 'grow' }),
        c.noCreate ? null : h('a', { class: 'btn', href: `#/c/${name}/new` }, '+ Add ' + c.singular)),
      drop,
      ok ? h('p', { class: 'muted hint' }, 'Drag the ⋮⋮ handle to change the order shown on the website.') : null,
      h('table', {}, h('thead', {}, h('tr', {}, ok ? h('th', { style: 'width:36px' }) : null, cols.map((k) => h('th', {}, fields[k] ? fields[k].label : k)))), tbody),
    );
    draw();
    search.focus();
  }

  function photoDropZone(items, bands, bandSel, done) {
    const bandList = Object.values(bands);
    const target = h('select', {}, bandList.map((b) => h('option', { value: b.id }, b.name)));
    if (bandSel && bands[bandSel.value]) target.value = bandSel.value;
    if (bandSel) bandSel.addEventListener('change', () => { if (bands[bandSel.value]) target.value = bandSel.value; });
    const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
    const status = h('span', { class: 'muted' });
    const zone = h('div', { class: 'dropzone' },
      h('strong', {}, 'Drag photos here to add them'),
      h('span', {}, ' to '), target, h('span', {}, ' or '),
      h('button', { type: 'button', onclick: () => picker.click() }, 'Choose photos…'), picker, status);
    const addAll = async (files) => {
      files = [...files].filter((f) => /^image\//.test(f.type));
      if (!files.length) return toast('No image files found', true);
      if (!target.value) return toast('Add a band first', true);
      let order = Math.max(0, ...items.map((x) => Number(x.order) || 0));
      let ok = 0; const failed = [];
      zone.classList.add('busy');
      for (const [i, f] of files.entries()) {
        status.textContent = `Uploading ${i + 1} of ${files.length}…`;
        try {
          const path = await uploadFile(f, 'image');
          await api('POST', '/api/c/photos', { bandId: target.value, file: path, show: true, order: ++order });
          ok++;
        } catch (e) { failed.push(f.name + ' (' + e.message + ')'); }
      }
      zone.classList.remove('busy');
      forget('photos');
      toast(`Added ${ok} photo${ok === 1 ? '' : 's'}` + (failed.length ? `. Failed: ${failed.join(', ')}` : ''), !!failed.length);
      done();
    };
    picker.addEventListener('change', () => { addAll(picker.files); picker.value = ''; });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('over'); });
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); addAll(e.dataTransfer.files); });
    return zone;
  }

  // ---------- form controls
  async function control(f, value, item) {
    const markDirty = () => { dirty = true; };
    if (f.readonly) {
      const el = h('div', { class: 'readonly' }, value || '—');
      return { el, get: () => undefined };
    }
    switch (f.type) {
      case 'textarea': {
        const el = h('textarea', { rows: f.rows || 5, oninput: markDirty }); el.value = value || '';
        return { el, get: () => el.value };
      }
      case 'bool': {
        const box = h('input', { type: 'checkbox', onchange: markDirty }); box.checked = !!value;
        return { el: h('label', { class: 'check' }, box, 'Yes'), get: () => box.checked };
      }
      case 'number': {
        const el = h('input', { type: 'number', step: 'any', oninput: markDirty, style: 'max-width:140px' }); el.value = value == null ? '' : value;
        return { el, get: () => el.value };
      }
      case 'select': {
        let opts = f.options ? f.options.map((o) => [o.value, o.label]) : (await load(f.ref)).map((x) => [x.id, optionLabel(f.ref, x)]);
        const el = h('select', { onchange: markDirty }, f.required ? null : h('option', { value: '' }, '— none —'), opts.map(([v, l]) => h('option', { value: v }, l)));
        el.value = value || (f.required && opts[0] ? opts[0][0] : '');
        if (!(f.ref && SCHEMA[f.ref].group === 'Lists')) return { el, get: () => el.value };
        // pick-lists: add a new choice without leaving the page
        const newName = h('input', { type: 'text', placeholder: `New ${SCHEMA[f.ref].singular}` });
        const addRow = h('div', { class: 'seladd', hidden: true }, newName,
          h('button', { type: 'button', onclick: () => addNew() }, 'Add'),
          h('button', { type: 'button', onclick: () => { addRow.hidden = true; newName.value = ''; } }, 'Cancel'));
        const addNew = async () => {
          const n = newName.value.trim(); if (!n) return;
          const list = await load(f.ref);
          let it = list.find((x) => String(x.name).toLowerCase() === n.toLowerCase());
          if (!it) {
            try {
              it = await api('POST', '/api/c/' + f.ref, { name: n, order: Math.max(0, ...list.map((x) => Number(x.order) || 0)) + 1 });
              forget(f.ref);
              el.append(h('option', { value: it.id }, it.name));
              toast(`Added "${n}" to ${SCHEMA[f.ref].label}`);
            } catch (e) { return toast(e.message, true); }
          }
          el.value = it.id; markDirty(); addRow.hidden = true; newName.value = '';
        };
        newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } if (e.key === 'Escape') addRow.hidden = true; });
        const wrap = h('div', {},
          h('div', { class: 'selrow' }, el,
            h('button', { type: 'button', onclick: () => { addRow.hidden = false; newName.focus(); } }, '+ New'),
            h('a', { class: 'editlist', href: '#/c/' + f.ref }, 'Edit list')),
          addRow);
        return { el: wrap, get: () => el.value };
      }
      case 'multi': {
        const all = await load(f.ref);
        const chosen = new Set(value || []);
        const filter = h('input', { type: 'search', placeholder: 'Filter' });
        const onlySel = h('input', { type: 'checkbox' });
        const count = h('span', { class: 'count' });
        const list = h('div', { class: 'mlist' });
        const makeBox = (it) => {
          const cb = h('input', { type: 'checkbox', value: it.id, onchange: () => { cb.checked ? chosen.add(it.id) : chosen.delete(it.id); markDirty(); upd(); } });
          cb.checked = chosen.has(it.id);
          const lab = h('label', {}, cb, h('span', {}, titleOf(f.ref, it), f.ref === 'songs' && it.artist ? h('small', {}, ' ' + it.artist) : null));
          lab._text = optionLabel(f.ref, it).toLowerCase();
          lab._id = it.id;
          list.append(lab);
          return lab;
        };
        const boxes = all.map(makeBox);
        let adder = null;
        if (SCHEMA[f.ref].group === 'Lists') {
          const newName = h('input', { type: 'text', placeholder: `Add a new ${SCHEMA[f.ref].singular}` });
          const addNew = async () => {
            const n = newName.value.trim(); if (!n) return;
            const same = all.find((x) => String(x.name).toLowerCase() === n.toLowerCase());
            if (same) {
              chosen.add(same.id); boxes.find((l) => l._id === same.id).querySelector('input').checked = true;
            } else {
              try {
                const order = Math.max(0, ...all.map((x) => Number(x.order) || 0)) + 1;
                const it = await api('POST', '/api/c/' + f.ref, { name: n, order });
                all.push(it); forget(f.ref); chosen.add(it.id); boxes.push(makeBox(it));
                toast(`Added "${n}" to ${SCHEMA[f.ref].label}`);
              } catch (e) { return toast(e.message, true); }
            }
            newName.value = ''; filter.value = ''; markDirty(); upd();
          };
          newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } });
          adder = h('div', { class: 'madd' }, newName, h('button', { type: 'button', onclick: addNew }, 'Add'), h('a', { class: 'editlist', href: '#/c/' + f.ref }, 'Edit list'));
        }
        // optional: choose the display order of the ticked items (Set keeps insertion order)
        let orderBox = null, dragId = null;
        const setOrder = (arr) => { chosen.clear(); arr.forEach((id) => chosen.add(id)); markDirty(); upd(); };
        const drawOrder = () => {
          orderBox.innerHTML = '';
          const ids = [...chosen].filter((id) => all.some((x) => x.id === id));
          ids.forEach((id, i) => {
            const it = all.find((x) => x.id === id);
            const move = (d) => { const a = ids.slice(); [a[i], a[i + d]] = [a[i + d], a[i]]; setOrder(a); };
            const li = h('li', { draggable: 'true' },
              h('span', { class: 'grip', title: 'Drag to reorder' }, '⋮⋮'), h('span', { class: 'nm' }, titleOf(f.ref, it)),
              h('button', { type: 'button', title: 'Move up', disabled: i === 0, onclick: () => move(-1) }, '↑'),
              h('button', { type: 'button', title: 'Move down', disabled: i === ids.length - 1, onclick: () => move(1) }, '↓'));
            li.addEventListener('dragstart', (e) => { dragId = id; e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
            li.addEventListener('dragend', () => li.classList.remove('dragging'));
            li.addEventListener('dragover', (e) => { e.preventDefault(); });
            li.addEventListener('drop', (e) => {
              e.preventDefault(); e.stopPropagation();
              if (!dragId || dragId === id) return;
              const a = ids.filter((x) => x !== dragId); a.splice(a.indexOf(id), 0, dragId); setOrder(a);
            });
            orderBox.append(li);
          });
          if (!ids.length) orderBox.append(h('li', { class: 'muted' }, 'Tick items above to add them here.'));
        };
        if (f.ordered) orderBox = h('ol', { class: 'morder' });
        const upd = () => {
          const q = filter.value.trim().toLowerCase();
          boxes.forEach((l) => { l.style.display = (!q || l._text.includes(q)) && (!onlySel.checked || chosen.has(l._id)) ? '' : 'none'; });
          count.textContent = `${chosen.size} selected`;
          if (orderBox) drawOrder();
        };
        filter.addEventListener('input', upd); onlySel.addEventListener('change', upd);
        const allBtn = h('button', { type: 'button', onclick: () => { boxes.forEach((l) => { if (l.style.display !== 'none') { chosen.add(l._id); l.querySelector('input').checked = true; } }); markDirty(); upd(); } }, 'Tick shown');
        const noneBtn = h('button', { type: 'button', onclick: () => { boxes.forEach((l) => { if (l.style.display !== 'none') { chosen.delete(l._id); l.querySelector('input').checked = false; } }); markDirty(); upd(); } }, 'Untick shown');
        upd();
        const el = h('div', { class: 'multi' },
          h('div', { class: 'mhead' }, filter, h('label', { class: 'check' }, onlySel, 'Selected only'), all.length > 12 ? [allBtn, noneBtn] : null, count),
          all.length || adder ? list : h('p', { class: 'muted' }, `No ${SCHEMA[f.ref].label.toLowerCase()} yet. `, h('a', { href: '#/c/' + f.ref }, 'Add some'), '.'),
          adder,
          orderBox ? [h('div', { class: 'morder-title' }, 'Order shown on the website (drag, or use the arrows)'), orderBox] : null);
        return { el, get: () => (f.ordered ? [...chosen].filter((id) => all.some((x) => x.id === id)) : all.map((x) => x.id).filter((id) => chosen.has(id))) };
      }
      case 'loopeditor': {
        // choose the section of the hero video that loops, with a live preview of the hero crop
        const POS = { top: '0%', upper: '25%', center: '50%', lower: '75%', bottom: '100%' };
        let start = Number(item && item[f.start]) || 0, end = Number(item && item[f.end]) || 0;
        const fmt = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60); const s = (t - m * 60).toFixed(1); return `${m}:${s.padStart(4, '0')}`; };
        const src = h('video', { controls: true, preload: 'metadata', playsinline: true, class: 'le-src' });
        const prev = h('video', { muted: true, playsinline: true, preload: 'metadata' });
        const frame = h('div', { class: 'le-frame', title: 'How the hero will look' }, prev);
        const startIn = h('input', { type: 'number', step: '0.1', min: '0' });
        const endIn = h('input', { type: 'number', step: '0.1', min: '0', placeholder: 'end' });
        const info = h('span', { class: 'le-info' });
        const show = () => {
          startIn.value = start ? start.toFixed(1) : '0';
          endIn.value = end ? end.toFixed(1) : '';
          info.textContent = end > start ? `Loops ${fmt(start)} to ${fmt(end)} (${(end - start).toFixed(1)} s)` : start ? `Plays from ${fmt(start)} to the end, then repeats` : 'Whole video loops';
        };
        const changed = () => { dirty = true; show(); };
        const setEnd = (t) => { if (t && t <= start) { show(); return toast('The end must be after the start', true); } end = t; changed(); };
        startIn.addEventListener('change', () => { start = Math.max(0, Number(startIn.value) || 0); if (end && end <= start) end = 0; changed(); });
        endIn.addEventListener('change', () => setEnd(Math.max(0, Number(endIn.value) || 0)));
        prev.addEventListener('timeupdate', () => { if ((end && prev.currentTime >= end) || prev.currentTime < start - 0.3) prev.currentTime = start; });
        prev.addEventListener('ended', () => { prev.currentTime = start; prev.play(); });
        const playLoop = () => { prev.currentTime = start; prev.play().catch(() => {}); };
        const box = h('div', { class: 'le' },
          h('div', { class: 'le-wrap' },
            h('div', {}, h('div', { class: 'le-cap' }, 'Whole video: scrub to find your cut'), src),
            h('div', {}, h('div', { class: 'le-cap' }, 'Preview of the hero (the shape varies a little with screen size)'), frame)),
          h('div', { class: 'le-controls' },
            h('button', { type: 'button', onclick: () => { start = Math.round(src.currentTime * 10) / 10; if (end && end <= start) end = 0; changed(); playLoop(); } }, 'Set start here'),
            h('button', { type: 'button', onclick: () => { setEnd(Math.round(src.currentTime * 10) / 10); playLoop(); } }, 'Set end here'),
            h('label', {}, 'Start ', startIn), h('label', {}, 'End ', endIn),
            h('button', { type: 'button', onclick: playLoop }, '▶ Play loop'),
            h('button', { type: 'button', onclick: () => prev.pause() }, 'Pause'),
            h('button', { type: 'button', onclick: () => { start = 0; end = 0; changed(); } }, 'Whole video'),
            info));
        const empty = h('p', { class: 'muted' }, 'Choose a hero video above to set its loop.');
        const el = h('div', {}, box, empty);
        show();
        return {
          el,
          ready: (controls) => {
            const vc = controls[f.video], fc = controls[f.framing];
            let cur = null;
            const sync = () => {
              if (!el.isConnected && cur !== null) return clearInterval(timer);
              const p = vc ? vc.get() : '';
              if (p !== cur) { cur = p; const u = fileUrl(p); box.hidden = !u; empty.hidden = !!u; if (u) { src.src = u; prev.src = u; prev.currentTime = start; } }
              prev.style.objectPosition = 'center ' + (POS[fc ? fc.get() : 'center'] || '50%');
            };
            const timer = setInterval(sync, 600);
            sync();
          },
          get: () => ({ __multi: { [f.start]: start, [f.end]: end } }),
        };
      }
      case 'repertoire': {
        // songs in the band's genres are in automatically; ticks add extras, unticks leave songs out
        const all = await load('songs');
        const extra = new Set(value || []);
        const left = new Set((item && item.excludedSongIds) || []);
        let genres = new Set((item && item.genreIds) || []);
        const isAuto = (s) => (s.genreIds || []).some((g) => genres.has(g));
        const isIn = (s) => !left.has(s.id) && (extra.has(s.id) || isAuto(s));
        const filter = h('input', { type: 'search', placeholder: 'Filter songs' });
        const onlySel = h('input', { type: 'checkbox' });
        const count = h('span', { class: 'count' });
        const list = h('div', { class: 'mlist' });
        const set = (s, on) => {
          if (on) { left.delete(s.id); if (!isAuto(s)) extra.add(s.id); }
          else { extra.delete(s.id); if (isAuto(s)) left.add(s.id); }
        };
        const rows = all.map((s) => {
          const cb = h('input', { type: 'checkbox', onchange: () => { set(s, cb.checked); dirty = true; upd(); } });
          const lab = h('label', {}, cb, h('span', {}, s.title, s.artist ? h('small', {}, ' ' + s.artist) : null));
          lab._s = s; lab._cb = cb; lab._text = optionLabel('songs', s).toLowerCase();
          list.append(lab);
          return lab;
        });
        const upd = () => {
          const q = filter.value.trim().toLowerCase();
          let auto = 0, added = 0, out = 0, total = 0;
          rows.forEach((l) => {
            const s = l._s, a = isAuto(s), inn = isIn(s);
            l._cb.checked = inn;
            l.classList.toggle('auto', a && inn);
            l.classList.toggle('left', a && !inn);
            if (inn) total++; if (a && inn) auto++; if (!a && inn) added++; if (a && !inn) out++;
            l.style.display = (!q || l._text.includes(q)) && (!onlySel.checked || inn) ? '' : 'none';
          });
          count.textContent = `${total} songs: ${auto} from genres` + (added ? `, ${added} added` : '') + (out ? `, ${out} left out` : '');
        };
        filter.addEventListener('input', upd); onlySel.addEventListener('change', upd);
        const bulk = (on) => { rows.forEach((l) => { if (l.style.display !== 'none') set(l._s, on); }); dirty = true; upd(); };
        upd();
        const el = h('div', { class: 'multi rep' },
          h('div', { class: 'mhead' }, filter, h('label', { class: 'check' }, onlySel, 'Selected only'),
            h('button', { type: 'button', onclick: () => bulk(true) }, 'Tick shown'), h('button', { type: 'button', onclick: () => bulk(false) }, 'Untick shown')),
          h('div', { class: 'replegend' }, h('span', { class: 'dot' }), ' from the band\'s genres', h('span', { class: 'count-wrap' }, count)),
          list);
        return {
          el,
          ready: (controls) => {
            const g = controls.genreIds;
            if (!g) return;
            const refresh = () => setTimeout(() => { genres = new Set(g.get()); upd(); }, 0);
            g.el.addEventListener('change', refresh);
            g.el.addEventListener('click', refresh);
            g.el.addEventListener('keyup', refresh);
          },
          get: () => ({ __multi: {
            songIds: all.filter((s) => extra.has(s.id) && !isAuto(s) && !left.has(s.id)).map((s) => s.id),
            excludedSongIds: all.filter((s) => left.has(s.id) && isAuto(s)).map((s) => s.id),
          } }),
        };
      }
      case 'image':
      case 'file': {
        const kind = f.type === 'image' ? 'image' : f.kind;
        const input = h('input', { type: 'text', placeholder: 'No file chosen', oninput: () => { markDirty(); preview(); } });
        input.value = value || '';
        const prev = h('div', { class: 'preview' });
        const preview = () => {
          prev.innerHTML = '';
          const v = input.value.trim();
          if (!v) return;
          if (kind === 'image') prev.append(h('img', { src: fileUrl(v), alt: '' }));
          else if (kind === 'audio') prev.append(h('audio', { controls: true, preload: 'none', src: fileUrl(v) }));
          else if (kind === 'video') prev.append(h('video', { controls: true, preload: 'none', src: fileUrl(v), style: 'max-height:200px' }));
        };
        const fileInput = h('input', { type: 'file', accept: { image: 'image/*', audio: 'audio/*', video: 'video/*' }[kind] || '', style: 'display:none' });
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files[0]; if (!file) return;
          toast('Uploading ' + file.name + '…');
          await doUpload(file);
          fileInput.value = '';
        });
        const doUpload = async (file) => {
          if (KIND_OK[kind] && !KIND_OK[kind].test(file.type)) return toast(`That is not ${kind === 'image' ? 'an image' : 'a ' + kind} file`, true);
          toast('Uploading ' + file.name + '…');
          try { input.value = await uploadFile(file, kind); markDirty(); preview(); toast('Uploaded. Remember to save.'); }
          catch (e) { toast('Upload failed: ' + e.message, true); }
        };
        const el = h('div', { class: 'filepick' },
          h('div', { class: 'row' }, input,
            h('button', { type: 'button', onclick: () => pickFile(kind, (p) => { input.value = p; markDirty(); preview(); }) }, 'Choose…'),
            h('button', { type: 'button', onclick: () => fileInput.click() }, 'Upload…'),
            h('button', { type: 'button', onclick: () => { input.value = ''; markDirty(); preview(); } }, 'Clear')),
          fileInput, prev, h('div', { class: 'drophint' }, 'or drag a file here'));
        if (f.youtubeFrom) el.querySelector('.row').append(h('button', { type: 'button', onclick: () => ytChoices() }, 'From YouTube…'));
        // stills YouTube makes for every video: its own thumbnail and frames from about ¼, ½ and ¾ of the way through
        const ytBox = h('div', { class: 'ytpick' });
        let allControls = {};
        const ytChoices = () => {
          ytBox.innerHTML = '';
          const ctl = allControls[f.youtubeFrom], m = String(ctl ? ctl.get() : '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
          if (!m) { ytBox.append(h('p', { class: 'help' }, 'Add the YouTube link first.')); return; }
          const opts = [['maxresdefault', 'hqdefault', "YouTube's thumbnail"], ['maxres1', 'hq1', 'About ¼ of the way'], ['maxres2', 'hq2', 'Halfway'], ['maxres3', 'hq3', 'About ¾ of the way']];
          for (const [big, small, label] of opts) {
            const img = h('img', { alt: '', src: `https://i.ytimg.com/vi/${m[1]}/${big}.jpg` });
            const card = h('button', { type: 'button', class: 'ytopt', title: 'Use this picture', onclick: () => { input.value = img.src; markDirty(); preview(); ytBox.innerHTML = ''; toast('Thumbnail chosen. Remember to save.'); } }, img, h('span', {}, label));
            const fallback = () => { if (img.src.includes('/' + big + '.')) img.src = img.src.replace('/' + big + '.', '/' + small + '.'); else card.remove(); };
            img.addEventListener('error', fallback);
            img.addEventListener('load', () => { if (img.naturalWidth <= 120) fallback(); });
            ytBox.append(card);
          }
          ytBox.append(h('button', { type: 'button', class: 'ytclose', onclick: () => { ytBox.innerHTML = ''; } }, 'Close'));
        };
        if (f.youtubeFrom) el.append(ytBox);
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
        el.addEventListener('dragleave', () => el.classList.remove('over'));
        el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) doUpload(f); });
        preview();
        return { el, get: () => input.value, ready: (c) => { allControls = c; } };
      }
      default: {
        const el = h('input', { type: f.type === 'url' ? 'url' : 'text', oninput: markDirty }); el.value = value == null ? '' : value;
        return { el, get: () => el.value };
      }
    }
  }

  async function pickFile(kind, done) {
    const dlg = $('#picker'), list = $('#picker-list'), search = $('#picker-search');
    $('#picker-title').textContent = 'Choose ' + (kind === 'image' ? 'an image' : kind === 'audio' ? 'an audio file' : 'a video');
    if (!cache.__files) cache.__files = (await api('GET', '/api/files')).files;
    const files = cache.__files.filter((f) => f.kind === kind);
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      list.innerHTML = '';
      files.filter((f) => !q || f.path.toLowerCase().includes(q)).forEach((f) => {
        list.append(h('button', { type: 'button', onclick: () => { dlg.close(); done(f.path); } },
          kind === 'image' ? h('img', { src: fileUrl(f.path), loading: 'lazy', alt: '' }) : null,
          f.path.replace(/^assets\//, ''), h('span', { class: 'muted' }, Math.round(f.size / 1024) + ' KB')));
      });
      if (!list.children.length) list.append(h('p', { class: 'muted' }, 'No files found. Use Upload instead.'));
    };
    search.value = ''; search.oninput = draw; draw();
    $('#picker-close').onclick = () => dlg.close();
    dlg.showModal(); search.focus();
  }

  // ---------- edit
  async function editView(name, id) {
    const c = SCHEMA[name];
    const view = $('#view'); view.innerHTML = '';
    const item = c.single ? await api('GET', '/api/c/' + name) : id ? await api('GET', `/api/c/${name}/${id}`) : {};
    const isNew = !c.single && !id;
    const controls = {};
    const form = h('div', { class: 'form' });
    for (const f of c.fields) {
      if (f.key === c.orderKey || f.hidden) continue; // order is set by dragging; hidden fields are managed by other controls
      const value = isNew && item[f.key] === undefined ? (f.default !== undefined ? f.default : '') : item[f.key];
      const ctl = await control(f, value, item);
      controls[f.key] = ctl;
      form.append(h('div', { class: 'f' },
        h('label', { class: 'l' }, f.label, f.required && !f.readonly ? h('span', { class: 'req' }, '(required)') : null, f.help ? h('span', { class: 'help' }, f.help) : null),
        ctl.el));
    }
    Object.values(controls).forEach((ctl) => ctl.ready && ctl.ready(controls));
    const saveBtn = h('button', { class: 'primary', type: 'button' }, isNew ? 'Create' : 'Save');
    saveBtn.addEventListener('click', async () => {
      const data = {};
      for (const f of c.fields) { if (!controls[f.key]) continue; const v = controls[f.key].get(); if (v && v.__multi) Object.assign(data, v.__multi); else if (v !== undefined) data[f.key] = v; }
      if (!isNew && item.updatedAt) data._version = item.updatedAt;
      saveBtn.disabled = true;
      try {
        const saved = c.single ? await api('PUT', '/api/c/' + name, data)
          : isNew ? await api('POST', '/api/c/' + name, data) : await api('PUT', `/api/c/${name}/${id}`, data);
        forget(name); dirty = false; toast('Saved');
        if (saved && saved.updatedAt) item.updatedAt = saved.updatedAt;
        if (isNew) location.hash = `#/c/${name}/${saved.id}`;
        else if (name === 'enquiries') renderNav(name);
      } catch (e) { toast(e.message, true); }
      saveBtn.disabled = false;
    });
    let viewLink = null;
    if (name === 'bands' && item.slug) viewLink = h('a', { class: 'btn', href: '/bands/' + item.slug, target: '_blank' }, 'View on site ↗');
    if (name === 'pages' && item.slug) viewLink = h('a', { class: 'btn', href: '/' + item.slug, target: '_blank' }, 'View on site ↗');
    if (name === 'settings') viewLink = h('a', { class: 'btn', href: '/', target: '_blank' }, 'View on site ↗');
    const delBtn = isNew || c.single ? null : h('button', { class: 'danger', type: 'button', onclick: async () => {
      if (!confirm(`Delete this ${c.singular}? This cannot be undone here (a backup is kept).`)) return;
      try { await api('DELETE', `/api/c/${name}/${id}`); forget(name); dirty = false; toast('Deleted'); location.hash = '#/c/' + name; }
      catch (e) { toast(e.message, true); }
    } }, 'Delete');
    appendAll(view,
      c.single ? null : h('p', {}, h('a', { href: '#/c/' + name }, '← ' + c.label)),
      h('h1', {}, c.single ? c.label : isNew ? 'New ' + c.singular : titleOf(name, item)),
      form,
      h('div', { class: 'actions' }, saveBtn, viewLink, h('span', { class: 'grow' }), delBtn),
    );
  }

  // keyboard: Cmd/Ctrl+S saves
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { const b = $('.actions .primary'); if (b) { e.preventDefault(); b.click(); } }
  });

  // ---------- sign in (online only)
  function authBox(title, fields, button, onsubmit, note) {
    document.body.classList.add('signin');
    const view = $('#view'); view.innerHTML = '';
    const inputs = {};
    const msg = h('p', { class: 'autherr' });
    const form = h('form', { class: 'authform', onsubmit: async (e) => { e.preventDefault(); msg.textContent = ''; try { await onsubmit(Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]))); } catch (x) { msg.textContent = x.message; } } },
      h('h1', {}, title), note ? h('p', { class: 'muted' }, note) : null,
      fields.map(([k, label, type]) => h('label', {}, label, inputs[k] = h('input', { type: type || 'text', name: k, required: true, autocomplete: type === 'password' ? (k === 'password' && title.startsWith('Sign') ? 'current-password' : 'new-password') : k }))),
      msg, h('button', { class: 'primary', type: 'submit' }, button));
    view.append(form);
    const first = form.querySelector('input'); if (first) first.focus();
  }
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong');
    return j;
  }
  function showLogin() {
    authBox('Sign in', [['email', 'Email', 'email'], ['password', 'Password', 'password']], 'Sign in', async (v) => { await post('/api/login', v); location.reload(); });
  }
  function showSetup() {
    authBox('Create the first admin', [['key', 'Setup key (from Cloudflare)', 'password'], ['name', 'Your name'], ['email', 'Email', 'email'], ['password', 'Choose a password (8+ characters)', 'password']],
      'Create admin', async (v) => { await post('/api/setup', v); location.reload(); }, 'This only appears once, before any users exist.');
  }

  // ---------- users (online, admins only)
  async function usersView(id) {
    const view = $('#view'); view.innerHTML = '';
    const { users } = await api('GET', '/api/users');
    if (id) {
      const isNew = id === 'new';
      const u = isNew ? { role: 'editor' } : users.find((x) => String(x.id) === id);
      if (!u) { view.textContent = 'Not found'; return; }
      const f = {};
      const row = (label, el, help) => h('div', { class: 'f' }, h('label', { class: 'l' }, label, help ? h('span', { class: 'help' }, help) : null), el);
      f.name = h('input', { type: 'text' }); f.name.value = u.name || '';
      f.email = h('input', { type: 'email', disabled: !isNew }); f.email.value = u.email || '';
      f.role = h('select', {}, h('option', { value: 'editor' }, 'Editor: can edit the website'), h('option', { value: 'admin' }, 'Admin: can also manage users')); f.role.value = u.role;
      f.password = h('input', { type: 'password', autocomplete: 'new-password' });
      f.disabled = h('input', { type: 'checkbox' }); f.disabled.checked = !!u.disabled;
      const save = h('button', { class: 'primary', type: 'button', onclick: async () => {
        try {
          if (isNew) await api('POST', '/api/users', { name: f.name.value, email: f.email.value, role: f.role.value, password: f.password.value });
          else await api('PUT', '/api/users/' + u.id, { name: f.name.value, role: f.role.value, disabled: f.disabled.checked, ...(f.password.value ? { password: f.password.value } : {}) });
          toast('Saved'); location.hash = '#/users';
        } catch (e) { toast(e.message, true); }
      } }, isNew ? 'Add user' : 'Save');
      const del = isNew || u.id === ME.id ? null : h('button', { class: 'danger', type: 'button', onclick: async () => {
        if (!confirm(`Delete ${u.email}? They will no longer be able to sign in.`)) return;
        try { await api('DELETE', '/api/users/' + u.id); toast('Deleted'); location.hash = '#/users'; } catch (e) { toast(e.message, true); }
      } }, 'Delete');
      appendAll(view, h('p', {}, h('a', { href: '#/users' }, '← Users')), h('h1', {}, isNew ? 'New user' : (u.name || u.email)),
        h('div', { class: 'form' }, row('Name', f.name), row('Email', f.email, isNew ? 'They sign in with this' : ''), row('Role', f.role),
          row(isNew ? 'Password' : 'New password', f.password, isNew ? 'At least 8 characters. Tell them it, and they can change it after signing in' : 'Leave empty to keep their current password'),
          isNew ? null : row('Blocked', h('label', { class: 'check' }, f.disabled, 'Cannot sign in'))),
        h('div', { class: 'actions' }, save, h('span', { class: 'grow' }), del));
      return;
    }
    appendAll(view, h('h1', {}, 'Users'), h('p', { class: 'muted' }, 'People who can sign in to this admin. Editors can change the website; admins can also add and remove users.'),
      h('div', { class: 'bar' }, h('span', { class: 'grow' }), h('a', { class: 'btn', href: '#/users/new' }, '+ Add user')),
      h('table', {}, h('thead', {}, h('tr', {}, ['Name', 'Email', 'Role', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, users.map((u) => h('tr', { onclick: () => (location.hash = '#/users/' + u.id) },
          h('td', {}, u.name || ''), h('td', {}, u.email), h('td', {}, u.role === 'admin' ? 'Admin' : 'Editor'), h('td', { class: 'muted' }, u.disabled ? 'Blocked' : ''))))));
  }
  function accountView() {
    const view = $('#view'); view.innerHTML = '';
    const cur = h('input', { type: 'password', autocomplete: 'current-password' }), pw = h('input', { type: 'password', autocomplete: 'new-password' });
    appendAll(view, h('h1', {}, 'Change your password'),
      h('div', { class: 'form' }, h('div', { class: 'f' }, h('label', { class: 'l' }, 'Current password'), cur), h('div', { class: 'f' }, h('label', { class: 'l' }, 'New password', h('span', { class: 'help' }, 'At least 8 characters')), pw)),
      h('div', { class: 'actions' }, h('button', { class: 'primary', type: 'button', onclick: async () => {
        try { await api('PUT', '/api/account', { current: cur.value, password: pw.value }); toast('Password changed'); cur.value = pw.value = ''; } catch (e) { toast(e.message, true); }
      } }, 'Change password')));
  }

  (async () => {
    try {
      const me = await fetch('/api/me').then((r) => r.json());
      MODE = me.mode || 'local'; ME = me.user || null;
      if (MODE === 'online' && !ME) return me.needsSetup ? showSetup() : showLogin();
      const s = await api('GET', '/api/schema'); SCHEMA = s.collections; GROUPS = s.groups; route();
    } catch (e) { if (!document.body.classList.contains('signin')) $('#view').textContent = 'Could not reach the server: ' + e.message; }
  })();
})();
