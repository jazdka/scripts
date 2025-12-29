// ==UserScript==
// @name         Template Library Loader
// @namespace    local-bm-template-library
// @version      0.1.3
// @description  Stores template images + coords and loads them into the already-running BM UI.
// @match        https://wplace.live/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  'use strict';

  const STORE_KEY = 'bm_template_library_v1';
  const UI_KEY    = 'bm_template_library_ui_v2';
  const BM_UI_KEY = 'bm_icon_mode_ui_v1';

  const DEFAULT_UI = {
    minimized: false,
    panel: { right: 10, top: 110 },
    icon:  { right: 10, top: 110 },
  };

  const DEFAULT_BM_UI = {
    minimized: false,
    icon: { right: 85, top: 10 },
  };

  const BM_FAVICON = 'https://raw.githubusercontent.com/SwingTheVine/Wplace-BlueMarble/main/dist/assets/Favicon.png';

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const qs = (sel) => document.querySelector(sel);
  const normName = (s) => String(s || '').trim().toLowerCase();

  function safeJsonParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

  function loadUI() {
    const v = safeJsonParse(GM_getValue(UI_KEY, 'null'), null);
    return v && typeof v === 'object' ? { ...DEFAULT_UI, ...v } : { ...DEFAULT_UI };
  }
  function saveUI(ui) { GM_setValue(UI_KEY, JSON.stringify(ui)); }

  function loadBMUI() {
    const v = safeJsonParse(GM_getValue(BM_UI_KEY, 'null'), null);
    return v && typeof v === 'object' ? { ...DEFAULT_BM_UI, ...v } : { ...DEFAULT_BM_UI };
  }
  function saveBMUI(ui) { GM_setValue(BM_UI_KEY, JSON.stringify(ui)); }

  function loadStore() {
    const v = safeJsonParse(GM_getValue(STORE_KEY, '[]'), []);
    return Array.isArray(v) ? v : [];
  }
  function saveStore(arr) { GM_setValue(STORE_KEY, JSON.stringify(arr)); }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function dataUrlToFile(dataUrl, filename) {
    const m = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!m) throw new Error('Bad data URL');
    const mime = m[1] || 'application/octet-stream';
    const b64  = m[2] || '';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  }

  function setInputValue(input, value) {
    if (!input) return;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setFileInput(fileInput, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getBMElements() {
    return {
      panel: qs('#bm-A'),
      file: qs('#bm-a'),
      tlx: qs('#bm-v'),
      tly: qs('#bm-w'),
      px:  qs('#bm-x'),
      py:  qs('#bm-y'),
      create: qs('#bm-r'),
      // BlueMarble stores last pixel coords in this internal object:
      // It’s the same thing their pin button reads: t.t?.Ut
      // We can’t access that directly, but BM also writes a visible span #bm-h
      // and our previous scripts observed it. We'll parse it if present.
      lastClickSpan: qs('#bm-h'),
    };
  }
  function bmReady() {
    const e = getBMElements();
    return !!(e.panel && e.file && e.tlx && e.tly && e.px && e.py);
  }

  function applyPositionFromUI(el, pos) {
    if (!el) return;
    el.style.left = 'auto';
    el.style.bottom = 'auto';
    el.style.right = `${pos.right}px`;
    el.style.top = `${pos.top}px`;
  }

  function positionToRightTop(el) {
    const r = el.getBoundingClientRect();
    const right = Math.max(0, Math.round(window.innerWidth - (r.left + r.width)));
    const top = Math.max(0, Math.round(r.top));
    return { right, top };
  }

  // Drag helper with click/drag guard
  function makeDraggableWithClickGuard({ root, handle, shouldStartDrag, onMoveEnd }) {
    let dragging = false;
    let moved = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    const getRect = () => root.getBoundingClientRect();
    const THRESH = 5; // px

    const onPointerDown = (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      if (typeof shouldStartDrag === 'function' && !shouldStartDrag(ev)) return;

      dragging = true;
      moved = false;

      root.setPointerCapture?.(ev.pointerId);

      const r = getRect();
      startX = ev.clientX;
      startY = ev.clientY;
      startLeft = r.left;
      startTop  = r.top;
    };

    const onPointerMove = (ev) => {
      if (!dragging) return;

      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (!moved && (Math.abs(dx) > THRESH || Math.abs(dy) > THRESH)) moved = true;

      const nextLeft = startLeft + dx;
      const nextTop  = startTop  + dy;

      root.classList.add('bm-lib-dragging');

      root.style.left = `${nextLeft}px`;
      root.style.top  = `${nextTop}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';

      ev.preventDefault();
    };

    const onPointerUp = (ev) => {
      if (!dragging) return;
      dragging = false;

      root.classList.remove('bm-lib-dragging');

      const r = getRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const clLeft = clamp(r.left, 0, Math.max(0, vw - r.width));
      const clTop  = clamp(r.top, 0, Math.max(0, vh - r.height));

      root.style.left = `${clLeft}px`;
      root.style.top  = `${clTop}px`;
      root.style.right = 'auto';

      onMoveEnd?.({ left: clLeft, top: clTop, moved });

      try { root.releasePointerCapture?.(ev.pointerId); } catch {}
      ev.preventDefault();
    };

    handle.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    window.addEventListener('pointercancel', onPointerUp, { passive: false });

    return { wasDrag: () => moved };
  }

  GM_addStyle(`
    #bm-lib, #bm-lib-icon, #bm-icon-mode {
      z-index: 10000;
      color: #fff;
      font: 12px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      user-select: none;
    }

    #bm-lib {
      position: fixed;
      width: 340px;
      background: rgba(20,20,20,.92);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      overflow: hidden;
      backdrop-filter: blur(6px);
    }

    #bm-lib .bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: rgba(255,255,255,.06);
      border-bottom: 1px solid rgba(255,255,255,.10);
      cursor: grab;
    }

    #bm-lib .title {
      font-weight: 800;
      font-size: 13px;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #bm-lib .bar button {
      padding: 4px 8px;
      border-radius: 10px;
      background: rgba(255,255,255,.10);
      border: 1px solid rgba(255,255,255,.14);
      color: #fff;
      cursor: pointer;
    }
    #bm-lib .bar button:hover { background: rgba(255,255,255,.16); }

    #bm-lib .body { padding: 10px; }
    #bm-lib .row { display: flex; gap: 6px; margin: 6px 0; align-items: center; }

    #bm-lib select,
    #bm-lib input[type="text"],
    #bm-lib input[type="number"] {
      width: 100%;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.14);
      color: #fff;
      border-radius: 10px;
      padding: 7px 9px;
      outline: none;
    }

    #bm-lib button.action {
      width: 100%;
      background: rgba(255,255,255,.10);
      border: 1px solid rgba(255,255,255,.14);
      color: #fff;
      border-radius: 10px;
      padding: 7px 9px;
      cursor: pointer;
      white-space: nowrap;
    }
    #bm-lib button.action:hover { background: rgba(255,255,255,.16); }

    #bm-lib button.small {
      width: 100%;
      background: rgba(255,255,255,.10);
      border: 1px solid rgba(255,255,255,.14);
      color: #fff;
      border-radius: 10px;
      padding: 7px 0;
      cursor: pointer;
      white-space: nowrap;
      text-align: center;
      font-size: 14px;
      line-height: 1;
    }
    #bm-lib button.small:hover { background: rgba(255,255,255,.16); }

    #bm-lib .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }

    #bm-lib .fileWrap {
      display:flex; gap:8px; align-items:center; width:100%;
      padding: 8px 9px;
      border-radius: 10px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.14);
    }
    #bm-lib .fileWrap .fileBtn {
      padding: 6px 10px;
      border-radius: 10px;
      background: rgba(255,255,255,.12);
      border: 1px solid rgba(255,255,255,.16);
      cursor: pointer;
      white-space: nowrap;
    }
    #bm-lib .fileWrap .fileBtn:hover { background: rgba(255,255,255,.18); }
    #bm-lib .fileWrap .fileName {
      opacity: .9;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    #bm-lib input[type="file"] {
      position: absolute !important;
      left: -9999px !important;
      width: 0 !important;
      height: 0 !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    #bm-lib-icon {
      position: fixed;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: rgba(20,20,20,.92);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      backdrop-filter: blur(6px);
    }
    #bm-lib-icon button {
      all: unset;
      width: 100%;
      height: 100%;
      display:flex;
      align-items:center;
      justify-content:center;
      cursor: pointer;
      font-size: 20px;
    }

    #bm-icon-mode {
      position: fixed;
      width: 46px;
      height: 46px;
      border-radius: 12px;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: grab;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      background: rgba(0,0,0,.25);
      border: 1px solid rgba(255,255,255,.12);
      backdrop-filter: blur(6px);
    }
    #bm-icon-mode img { width: 28px; height: 28px; display: block; }
  `);

  // ---- BlueMarble icon mode
  function ensureBlueMarbleIconMode() {
    const bm = getBMElements();
    if (!bm.panel) return;

    let icon = qs('#bm-icon-mode');
    if (!icon) {
      icon = document.createElement('div');
      icon.id = 'bm-icon-mode';
      icon.innerHTML = `<img src="${BM_FAVICON}" alt="BlueMarble" title="Open BlueMarble" />`;
      document.body.appendChild(icon);
    }

    const ui = loadBMUI();
    applyPositionFromUI(icon, ui.icon);

    const setBMMinimized = (min) => {
      const current = loadBMUI();
      current.minimized = !!min;

      if (min) {
        bm.panel.style.display = 'none';
        icon.style.display = 'flex';
        current.icon = positionToRightTop(icon);
      } else {
        icon.style.display = 'none';
        bm.panel.style.display = '';
        current.icon = positionToRightTop(icon);
      }
      saveBMUI(current);
    };

    if (!qs('#bm-icon-toggle-btn')) {
      const btn = document.createElement('button');
      btn.id = 'bm-icon-toggle-btn';
      btn.className = 'bm-D';
      btn.type = 'button';
      btn.title = 'Toggle icon mode';
      btn.textContent = '🧿';
      btn.style.marginLeft = '6px';

      const header = qs('#bm-j') || bm.panel;
      header.appendChild(btn);

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const st = loadBMUI();
        setBMMinimized(!st.minimized);
      });
    }

    const dragState = makeDraggableWithClickGuard({
      root: icon,
      handle: icon,
      shouldStartDrag: () => true,
      onMoveEnd: () => {
        const current = loadBMUI();
        current.icon = positionToRightTop(icon);
        saveBMUI(current);
      },
    });

    icon.addEventListener('click', (e) => {
      if (dragState.wasDrag()) return;
      e.preventDefault();
      e.stopPropagation();
      setBMMinimized(false);
    });

    setBMMinimized(!!ui.minimized);
  }

  // ---- Helpers for import-from-map/BM
  function setTLFormCoords(tlx, tly, px, py) {
    setInputValue(qs('#bm-lib-tlx'), tlx);
    setInputValue(qs('#bm-lib-tly'), tly);
    setInputValue(qs('#bm-lib-px'),  px);
    setInputValue(qs('#bm-lib-py'),  py);
  }

  function importCoordsFromBMIntoTL() {
    const bm = getBMElements();
    if (!bmReady()) return alert('Blue Marble inputs not found yet.');
    const tlx = Number(bm.tlx.value);
    const tly = Number(bm.tly.value);
    const px  = Number(bm.px.value);
    const py  = Number(bm.py.value);
    if (![tlx,tly,px,py].every(n => Number.isFinite(n))) return alert('Blue Marble coords are not valid numbers.');
    setTLFormCoords(tlx, tly, px, py);
  }

  function parseLastClickedFromBmSpan() {
    // BM creates: (Tl X: 1, Tl Y: 2, Px X: 3, Px Y: 4)
    const span = qs('#bm-h');
    const txt = span?.textContent || '';
    const m = txt.match(/Tl X:\s*(\d+),\s*Tl Y:\s*(\d+),\s*Px X:\s*(\d+),\s*Px Y:\s*(\d+)/i);
    if (!m) return null;
    return { tlx: Number(m[1]), tly: Number(m[2]), px: Number(m[3]), py: Number(m[4]) };
  }

  function importCoordsFromMapIntoTL() {
    const v = parseLastClickedFromBmSpan();
    if (!v) return alert('No pixel selected yet. Click a pixel on the map first (so BlueMarble shows the coords).');
    setTLFormCoords(v.tlx, v.tly, v.px, v.py);
  }

  // ---- Template Library UI
  function renderLibraryUI() {
    if (qs('#bm-lib') || qs('#bm-lib-icon')) return;

    const ui = loadUI();

    const panel = document.createElement('div');
    panel.id = 'bm-lib';
    panel.innerHTML = `
      <div class="bar" id="bm-lib-bar">
        <div class="title">Template Library</div>
        <button id="bm-lib-min" type="button" title="Minimize">–</button>
      </div>

      <div class="body">
        <div class="row">
          <select id="bm-lib-select" size="8"></select>
        </div>

        <div class="row">
          <button class="action" id="bm-lib-load" type="button">Load → Blue Marble</button>
          <button class="action" id="bm-lib-loadcreate" type="button" title="Loads then clicks Blue Marble's Create button">Load + Create</button>
        </div>

        <!-- Row with arrows + delete current -->
        <div class="row">
          <div style="flex: 1;">
            <button class="small" id="bm-lib-moveup" type="button" title="Move selected up">↑</button>
          </div>
          <div style="flex: 1;">
            <button class="small" id="bm-lib-movedown" type="button" title="Move selected down">↓</button>
          </div>
          <div style="flex: 2;">
            <button class="action" id="bm-lib-deletecurrent" type="button">Delete current</button>
          </div>
        </div>

        <!-- New row: import coords buttons -->
        <div class="row">
          <button class="action" id="bm-lib-importmap" type="button" title="Requires a pixel to be selected on the map">Import from map</button>
          <button class="action" id="bm-lib-importbm" type="button" title="Copies coords from BlueMarble coordinate inputs">Import from BM</button>
        </div>

        <div class="row">
          <input id="bm-lib-name" type="text" placeholder="Name (required, unique)" />
        </div>

        <div class="row">
          <input id="bm-lib-tlx" class="mono" type="number" placeholder="Tl X" min="0" max="2047" step="1" />
          <input id="bm-lib-tly" class="mono" type="number" placeholder="Tl Y" min="0" max="2047" step="1" />
        </div>
        <div class="row">
          <input id="bm-lib-px" class="mono" type="number" placeholder="Px X" min="0" max="2047" step="1" />
          <input id="bm-lib-py" class="mono" type="number" placeholder="Px Y" min="0" max="2047" step="1" />
        </div>

        <div class="row">
          <div class="fileWrap">
            <div class="fileBtn" id="bm-lib-filebtn">Choose image</div>
            <div class="fileName" id="bm-lib-filename">No file selected</div>
          </div>
          <input id="bm-lib-file" type="file" accept="image/*" />
        </div>

        <div class="row">
          <button class="action" id="bm-lib-add" type="button">Add new template</button>
        </div>

        <div class="row">
          <button class="action" id="bm-lib-export" type="button">Export templates</button>
          <button class="action" id="bm-lib-import" type="button">Import templates</button>
          <input id="bm-lib-importfile" type="file" accept="application/json,.json" />
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const icon = document.createElement('div');
    icon.id = 'bm-lib-icon';
    icon.innerHTML = `<button type="button" title="Open Template Library">📚</button>`;
    document.body.appendChild(icon);

    applyPositionFromUI(panel, ui.panel);
    applyPositionFromUI(icon, ui.icon);

    const setMinimized = (min) => {
      const current = loadUI();
      current.minimized = !!min;

      if (min) {
        current.panel = positionToRightTop(panel);
        panel.style.display = 'none';
        icon.style.display = 'flex';
      } else {
        current.icon = positionToRightTop(icon);
        icon.style.display = 'none';
        panel.style.display = '';
      }
      saveUI(current);
    };

    setMinimized(!!ui.minimized);

    makeDraggableWithClickGuard({
      root: panel,
      handle: qs('#bm-lib-bar'),
      shouldStartDrag: (ev) => {
        const t = ev.target;
        if (t && (t.closest('button') || t.closest('input') || t.closest('select'))) return false;
        return true;
      },
      onMoveEnd: () => {
        const current = loadUI();
        current.panel = positionToRightTop(panel);
        saveUI(current);
      },
    });

    const iconDrag = makeDraggableWithClickGuard({
      root: icon,
      handle: icon,
      shouldStartDrag: () => true,
      onMoveEnd: () => {
        const current = loadUI();
        current.icon = positionToRightTop(icon);
        saveUI(current);
      },
    });

    icon.addEventListener('click', (e) => {
      if (iconDrag.wasDrag()) return;
      e.preventDefault();
      e.stopPropagation();
      setMinimized(false);
    });

    qs('#bm-lib-min').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMinimized(true);
    });

    const fileInput = qs('#bm-lib-file');
    const fileBtn = qs('#bm-lib-filebtn');
    const fileName = qs('#bm-lib-filename');

    fileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      fileName.textContent = f ? f.name : 'No file selected';
    });

    const sel = qs('#bm-lib-select');

    function refreshSelect(keepIdx = null) {
      const items = loadStore();
      sel.innerHTML = '';
      if (!items.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(no saved templates yet)';
        sel.appendChild(opt);
        return;
      }
      items.forEach((it, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `${it.name} — [${it.coords.tlx},${it.coords.tly},${it.coords.px},${it.coords.py}]`;
        sel.appendChild(opt);
      });

      if (keepIdx !== null && Number.isInteger(keepIdx) && keepIdx >= 0 && keepIdx < items.length) {
        sel.value = String(keepIdx);
      }
    }

    function requireNameUnique() {
      const name = (qs('#bm-lib-name').value || '').trim();
      if (!name) {
        alert('Name is required 🙂');
        qs('#bm-lib-name').focus();
        return null;
      }
      const items = loadStore();
      const existing = new Set(items.map(t => normName(t.name)));
      if (existing.has(normName(name))) {
        alert('That name is already used. Pick a unique name.');
        qs('#bm-lib-name').focus();
        return null;
      }
      return name;
    }

    function getSelectedIndex() {
      const idx = Number(sel.value);
      return Number.isInteger(idx) ? idx : -1;
    }

    function moveSelected(delta) {
      const items = loadStore();
      const idx = getSelectedIndex();
      if (idx < 0 || idx >= items.length) return;

      const to = idx + delta;
      if (to < 0 || to >= items.length) return;

      const [x] = items.splice(idx, 1);
      items.splice(to, 0, x);

      saveStore(items);
      refreshSelect(to);
    }

    async function addNewTemplate() {
      const name = requireNameUnique();
      if (!name) return;

      const tlx = Number(qs('#bm-lib-tlx').value);
      const tly = Number(qs('#bm-lib-tly').value);
      const px  = Number(qs('#bm-lib-px').value);
      const py  = Number(qs('#bm-lib-py').value);
      const f = fileInput.files?.[0];

      if (!f) return alert('Pick an image file first.');
      if (![tlx,tly,px,py].every(n => Number.isFinite(n))) return alert('Fill all 4 coordinates (numbers).');

      const dataUrl = await toBase64(f);
      const entry = { name, filename: f.name, mime: f.type || 'image/png', dataUrl, coords: { tlx, tly, px, py }, createdAt: Date.now() };

      const items = loadStore();
      items.unshift(entry);
      saveStore(items);
      refreshSelect(0);
    }

    function getSelectedEntry() {
      const items = loadStore();
      const idx = getSelectedIndex();
      if (idx < 0 || idx >= items.length) return null;
      return { entry: items[idx], idx, items };
    }

    function loadIntoBM(doCreate) {
      const bm = getBMElements();
      if (!bmReady()) return alert('Blue Marble inputs not found yet.');

      const picked = getSelectedEntry();
      if (!picked) return alert('Pick a saved template first.');

      const { entry } = picked;

      setInputValue(bm.tlx, entry.coords.tlx);
      setInputValue(bm.tly, entry.coords.tly);
      setInputValue(bm.px,  entry.coords.px);
      setInputValue(bm.py,  entry.coords.py);

      try {
        const file = dataUrlToFile(entry.dataUrl, entry.filename || `${entry.name}.png`);
        setFileInput(bm.file, file);
      } catch (err) {
        console.error(err);
        return alert('Failed to inject file into Blue Marble input.');
      }

      if (doCreate) bm.create?.click();
    }

    function deleteCurrent() {
      const picked = getSelectedEntry();
      if (!picked) return alert('No template selected.');
      const ok = confirm(`Delete "${picked.entry.name}"? This cannot be undone.`);
      if (!ok) return;

      picked.items.splice(picked.idx, 1);
      saveStore(picked.items);
      refreshSelect();
    }

    function exportTemplates() {
      const items = loadStore();
      const payload = { version: 1, exportedAt: new Date().toISOString(), templates: items };
      const json = JSON.stringify(payload, null, 2);

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `bm-template-library-export.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function hasDuplicateNames(list) {
      const seen = new Set();
      for (const t of list) {
        const n = normName(t?.name);
        if (!n) continue;
        if (seen.has(n)) return true;
        seen.add(n);
      }
      return false;
    }

    function makeUniqueName(baseName, usedLower) {
      let name = String(baseName || '').trim();
      if (!name) name = 'Template';

      const baseLower = normName(name);
      if (!usedLower.has(baseLower)) {
        usedLower.add(baseLower);
        return name;
      }

      let n = 2;
      while (true) {
        const candidate = `${name} (${n})`;
        const cLower = normName(candidate);
        if (!usedLower.has(cLower)) {
          usedLower.add(cLower);
          return candidate;
        }
        n++;
      }
    }

    async function importTemplatesFromFile(file) {
      const text = await file.text();
      const payload = safeJsonParse(text, null);
      if (!payload || !Array.isArray(payload.templates)) return alert('Invalid import file.');

      const incomingRaw = payload.templates.filter(t =>
        t && typeof t.name === 'string' &&
        t.coords && ['tlx','tly','px','py'].every(k => Number.isFinite(Number(t.coords[k]))) &&
        typeof t.dataUrl === 'string' && t.dataUrl.startsWith('data:')
      );
      if (!incomingRaw.length) return alert('No valid templates found.');

      // Ask about duplicates (2)
      const dupInImport = hasDuplicateNames(incomingRaw);
      if (dupInImport) {
        const ok = confirm(
          'Duplicate template names were detected in the import.\n\n' +
          'Press OK to import anyway (duplicates will be renamed like "Name (2)", "Name (3)", ...).\n' +
          'Press Cancel to abort the import.'
        );
        if (!ok) return;
      }

      const existing = loadStore();

      // Remove exact duplicates (same coords/file/data size) but DO NOT collapse by name.
      const exactKey = (t) =>
        `${t.coords.tlx},${t.coords.tly},${t.coords.px},${t.coords.py}::${t.filename || ''}::${(t.dataUrl || '').length}`;

      const seenExact = new Set(existing.map(exactKey));

      // For naming: if dupInImport or name conflicts with existing, we rename.
      const usedNames = new Set(existing.map(t => normName(t.name)));

      const incoming = [];
      for (const t of incomingRaw) {
        if (seenExact.has(exactKey(t))) continue;

        const fixed = { ...t };
        // If duplicates exist OR name collides with existing, ensure unique
        if (dupInImport || usedNames.has(normName(fixed.name))) {
          fixed.name = makeUniqueName(fixed.name, usedNames);
        } else {
          usedNames.add(normName(fixed.name));
        }

        seenExact.add(exactKey(fixed));
        incoming.push(fixed);
      }

      if (!incoming.length) return alert('Nothing new to import (all entries already exist).');

      const merged = [...incoming, ...existing];
      saveStore(merged);
      refreshSelect(0);
      alert(`Imported ${incoming.length} template(s).`);
    }

    // wire buttons
    qs('#bm-lib-load').addEventListener('click', () => loadIntoBM(false));
    qs('#bm-lib-loadcreate').addEventListener('click', () => loadIntoBM(true));
    qs('#bm-lib-add').addEventListener('click', () => addNewTemplate().catch(console.error));

    qs('#bm-lib-moveup').addEventListener('click', () => moveSelected(-1));
    qs('#bm-lib-movedown').addEventListener('click', () => moveSelected(+1));

    qs('#bm-lib-deletecurrent').addEventListener('click', deleteCurrent);

    qs('#bm-lib-importmap').addEventListener('click', importCoordsFromMapIntoTL);
    qs('#bm-lib-importbm').addEventListener('click', importCoordsFromBMIntoTL);

    qs('#bm-lib-export').addEventListener('click', exportTemplates);

    const importBtn = qs('#bm-lib-import');
    const importFile = qs('#bm-lib-importfile');
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const f = importFile.files?.[0];
      importFile.value = '';
      if (!f) return;
      importTemplatesFromFile(f).catch(console.error);
    });

    refreshSelect();
  }

  // Boot
  const obs = new MutationObserver(() => {
    if (bmReady()) {
      renderLibraryUI();
      ensureBlueMarbleIconMode();
      obs.disconnect();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  if (bmReady()) {
    renderLibraryUI();
    ensureBlueMarbleIconMode();
  }
})();
