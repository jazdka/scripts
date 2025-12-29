// ==UserScript==
// @name         Template Library Loader
// @namespace    local-bm-template-library
// @version      0.1.8
// @author       jaz / jazdka
// @description  Stores template images + coords and loads them into the already-running BM UI.
// @match        https://wplace.live/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
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

  function makeDraggableWithClickGuard({ root, handle, shouldStartDrag, onMoveEnd }) {
    let dragging = false;
    let moved = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    const getRect = () => root.getBoundingClientRect();
    const THRESH = 5;

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

      root.classList.add('bm-lib-dragging');

      root.style.left = `${startLeft + dx}px`;
      root.style.top  = `${startTop + dy}px`;
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
      touch-action: none;
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
      display:flex; align-items:center; gap:8px;
      padding:8px 10px;
      background: rgba(255,255,255,.06);
      border-bottom: 1px solid rgba(255,255,255,.10);
      cursor: grab;
    }
    #bm-lib .title { font-weight:800; font-size:13px; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #bm-lib .bar button {
      padding:4px 8px; border-radius:10px;
      background: rgba(255,255,255,.10);
      border: 1px solid rgba(255,255,255,.14);
      color:#fff; cursor:pointer;
    }
    #bm-lib .bar button:hover { background: rgba(255,255,255,.16); }

    #bm-lib .body { padding:10px; }
    #bm-lib .row { display:flex; gap:6px; margin:6px 0; align-items:center; }

    #bm-lib select,
    #bm-lib input[type="text"],
    #bm-lib input[type="number"]{
      width:100%;
      background: rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.14);
      color:#fff;
      border-radius:10px;
      padding:7px 9px;
      outline:none;
    }

    #bm-lib button.action{
      width:100%;
      background: rgba(255,255,255,.10);
      border:1px solid rgba(255,255,255,.14);
      color:#fff;
      border-radius:10px;
      padding:7px 9px;
      cursor:pointer;
      white-space:nowrap;
    }
    #bm-lib button.action:hover{ background: rgba(255,255,255,.16); }

    #bm-lib button.small{
      width:100%;
      background: rgba(255,255,255,.10);
      border:1px solid rgba(255,255,255,.14);
      color:#fff;
      border-radius:10px;
      padding:7px 0;
      cursor:pointer;
      text-align:center;
      font-size:14px;
      line-height:1;
    }
    #bm-lib button.small:hover{ background: rgba(255,255,255,.16); }

    #bm-lib .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }

    #bm-lib .fileWrap{
      display:flex; gap:8px; align-items:center; width:100%;
      padding:8px 9px;
      border-radius:10px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.14);
    }
    #bm-lib .fileWrap .fileBtn{
      padding:6px 10px;
      border-radius:10px;
      background: rgba(255,255,255,.12);
      border: 1px solid rgba(255,255,255,.16);
      cursor:pointer;
      white-space:nowrap;
    }
    #bm-lib .fileWrap .fileBtn:hover{ background: rgba(255,255,255,.18); }
    #bm-lib .fileWrap .fileName{
      opacity:.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;
    }
    #bm-lib input[type="file"]{
      position:absolute !important; left:-9999px !important;
      width:0 !important; height:0 !important; opacity:0 !important; pointer-events:none !important;
    }

    #bm-lib-icon{
      position:fixed;
      width:44px; height:44px;
      border-radius:14px;
      background: rgba(20,20,20,.92);
      border:1px solid rgba(255,255,255,.12);
      box-shadow:0 10px 30px rgba(0,0,0,.35);
      display:flex; align-items:center; justify-content:center;
      cursor:grab; backdrop-filter: blur(6px);
    }
    #bm-lib-icon button{
      all:unset; width:100%; height:100%;
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; font-size:20px;
    }

    #bm-icon-mode{
      position:fixed;
      width:46px; height:46px;
      border-radius:12px;
      display:none;
      align-items:center; justify-content:center;
      cursor:grab;
      box-shadow:0 10px 30px rgba(0,0,0,.35);
      background: rgba(0,0,0,.25);
      border:1px solid rgba(255,255,255,.12);
      backdrop-filter: blur(6px);
      touch-action: none; /* <- add this */
    }

    #bm-icon-mode img {
      width: 28px;
      height: 28px;
      display: block;
      pointer-events: none;  /* drag/click handled by the icon container */
      user-select: none;
      -webkit-user-drag: none;
    }

    #bm-icon-mode,
    #bm-icon-mode * {
      -webkit-user-drag: none !important;
      user-drag: none !important;
      user-select: none !important;
    }

    #bm-lib-bmreset {
      padding: 4px 7px !important;
      font-size: 12px !important;
      opacity: 0.9;
    }
    #bm-lib-bmreset:hover { opacity: 1; }
  `);

  // Global guard: never allow native HTML drag from the BM icon (cross-browser)
  document.addEventListener('dragstart', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('#bm-icon-mode')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  function ensureBlueMarbleIconMode() {
    const bm = getBMElements();
    if (!bm.panel) return;

    let icon = qs('#bm-icon-mode');
    if (!icon) {
      icon = document.createElement('div');
      icon.id = 'bm-icon-mode';
      icon.innerHTML = `<img src="${BM_FAVICON}" alt="BlueMarble" title="Open BlueMarble" />`;
      icon.setAttribute('draggable', 'false');
      const img = icon.querySelector('img');
      if (img) {
        img.draggable = false;                 // stops “drag the image file”
        img.addEventListener('dragstart', e => e.preventDefault());
      }
      // Kill native “drag image” behavior (capture phase = before browser starts drag ghost)
      const killDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };

      icon.addEventListener('dragstart', killDrag, true);
      document.body.appendChild(icon);
      // The key fix: block native drag pipeline at the earliest step
      icon.addEventListener('pointerdown', (e) => {
        if (e.button === 0) e.preventDefault();
      }, true);
    }

    // ---- helpers
    const clampPosRightTop = (pos, el) => {
      const w = el?.offsetWidth || 46;
      const h = el?.offsetHeight || 46;
      const maxRight = Math.max(0, window.innerWidth - w);
      const maxTop   = Math.max(0, window.innerHeight - h);

      let right = Number(pos?.right);
      let top   = Number(pos?.top);

      if (!Number.isFinite(right)) right = DEFAULT_BM_UI.icon.right;
      if (!Number.isFinite(top))   top   = DEFAULT_BM_UI.icon.top;

      // right is distance from right edge
      right = clamp(right, 0, maxRight);
      top   = clamp(top,   0, maxTop);

      return { right, top };
    };

    const showIcon = () => {
      const st = loadBMUI();
      st.icon = clampPosRightTop(st.icon, icon);
      applyPositionFromUI(icon, st.icon);

      bm.panel.style.display = 'none';
      icon.style.display = 'flex';

      // persist clamped pos
      st.minimized = true;
      st.icon = positionToRightTop(icon);
      saveBMUI(st);
    };

    const showPanel = () => {
      const st = loadBMUI();
      st.minimized = false;
      saveBMUI(st);

      icon.style.display = 'none';
      bm.panel.style.display = '';
    };

    // ---- add toggle button once
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
        if (st.minimized) showPanel();
        else showIcon();
      });
    }

    // ---- draggable icon
    const dragState = makeDraggableWithClickGuard({
      root: icon,
      handle: icon,
      shouldStartDrag: () => true,
      onMoveEnd: () => {
        const st = loadBMUI();
        st.icon = positionToRightTop(icon);
        saveBMUI(st);
      },
    });

    icon.addEventListener('click', (e) => {
      if (dragState.wasDrag()) return;
      e.preventDefault();
      e.stopPropagation();
      showPanel();
    });

    // ---- menu emergency reset (no reinstall needed)
    try {
      GM_registerMenuCommand('Reset BlueMarble icon mode (unbrick)', () => {
        const st = loadBMUI();
        st.minimized = false;
        st.icon = { ...DEFAULT_BM_UI.icon };
        saveBMUI(st);

        // hard-force visible
        icon.style.display = 'none';
        bm.panel.style.display = '';
        alert('BlueMarble icon mode reset. Panel should be visible now.');
      });
    } catch (_) {}

    // ---- restore state safely on load
    const st = loadBMUI();
    if (st.minimized) showIcon();
    else showPanel();

    // ---- watchdog: if panel hidden but icon isn't visible, recover automatically
    // (covers cases where CSS/other scripts hid icon, or it got detached)
    const watchdog = () => {
      const panelHidden = bm.panel && bm.panel.style.display === 'none';
      const iconMissingOrHidden = !icon || !document.body.contains(icon) || getComputedStyle(icon).display === 'none';

      if (panelHidden && iconMissingOrHidden) {
        // recreate icon if needed
        if (!icon || !document.body.contains(icon)) {
          icon = document.createElement('div');
          icon.id = 'bm-icon-mode';
          icon.innerHTML = `<img src="${BM_FAVICON}" alt="BlueMarble" title="Open BlueMarble" />`;
          document.body.appendChild(icon);
        }
        // force icon visible & clamped; if anything goes wrong, show panel
        try { showIcon(); } catch { showPanel(); }
      }
    };

    // run a few times early, then every 2s (cheap)
    setTimeout(watchdog, 250);
    setTimeout(watchdog, 1000);
    setInterval(watchdog, 2000);

    // also clamp on resize
    window.addEventListener('resize', () => {
      const s2 = loadBMUI();
      if (s2.minimized) showIcon();
    }, { passive: true });
  }

  function setTLFormCoords(tlx, tly, px, py) {
    setInputValue(qs('#bm-lib-tlx'), tlx);
    setInputValue(qs('#bm-lib-tly'), tly);
    setInputValue(qs('#bm-lib-px'),  px);
    setInputValue(qs('#bm-lib-py'),  py);
  }

  function importCoordsFromBMIntoTL() {
    const bm = getBMElements();
    if (!bmReady()) return alert('BM inputs not found yet.');
    const tlx = Number(bm.tlx.value);
    const tly = Number(bm.tly.value);
    const px  = Number(bm.px.value);
    const py  = Number(bm.py.value);
    if (![tlx,tly,px,py].every(n => Number.isFinite(n))) return alert('BM coords are not valid numbers.');
    setTLFormCoords(tlx, tly, px, py);
  }

  function parseLastClickedFromBmSpan() {
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

  function renderLibraryUI() {
    if (qs('#bm-lib') || qs('#bm-lib-icon')) return;

    const ui = loadUI();

    const panel = document.createElement('div');
    panel.id = 'bm-lib';
    panel.innerHTML = `
      <div class="bar" id="bm-lib-bar">
        <div class="title">Template Library</div>
        <button id="bm-lib-bmreset" type="button" title="Reset BlueMarble (unbrick)">↺</button>
        <button id="bm-lib-min" type="button" title="Minimize">–</button>
      </div>

      <div class="body">
        <div class="row">
          <select id="bm-lib-select" size="8"></select>
        </div>

        <div class="row">
          <button class="action" id="bm-lib-load" type="button">Load → BM</button>
          <button class="action" id="bm-lib-loadcreate" type="button" title="Loads then clicks BM's Create button">Load + Create</button>
        </div>

        <div class="row">
          <div style="flex: 1;"><button class="small" id="bm-lib-moveup" type="button" title="Move selected up">↑</button></div>
          <div style="flex: 1;"><button class="small" id="bm-lib-movedown" type="button" title="Move selected down">↓</button></div>
          <div style="flex: 2;"><button class="action" id="bm-lib-deletecurrent" type="button">Delete current</button></div>
        </div>

        <div class="row">
          <button class="action" id="bm-lib-importmap" type="button" title="Requires a pixel to be selected on the map">Import from map</button>
          <button class="action" id="bm-lib-importbm" type="button" title="Copies coords from BlueMarble coordinate inputs">Import from BM</button>
        </div>

        <div class="row">
          <input id="bm-lib-name" type="text" placeholder="Name (required, unique for NEW)" />
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
          <button class="action" id="bm-lib-edit" type="button" title="Edits the selected template using the form values">Edit selected</button>
        </div>

        <div class="row">
          <button class="action" id="bm-lib-exportcurrent" type="button">Export current</button>
          <button class="action" id="bm-lib-exportall" type="button">Export all</button>
          <button class="action" id="bm-lib-import" type="button">Import</button>
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

    function setFileLabelToStored(entry) {
      if (!entry) fileName.textContent = 'No file selected';
      else fileName.textContent = `Stored: ${entry.filename || 'image'}`;
    }
    function clearLocalChosenFile() { try { fileInput.value = ''; } catch {} }

    fileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      fileName.textContent = f ? `New: ${f.name}` : 'No file selected';
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

    function getSelectedIndex() {
      const idx = Number(sel.value);
      return Number.isInteger(idx) ? idx : -1;
    }

    function getSelectedEntry() {
      const items = loadStore();
      const idx = getSelectedIndex();
      if (idx < 0 || idx >= items.length) return null;
      return { entry: items[idx], idx, items };
    }

    function populateFormFromSelected() {
      const picked = getSelectedEntry();
      if (!picked) return;
      const { entry } = picked;

      setInputValue(qs('#bm-lib-name'), entry.name);
      setInputValue(qs('#bm-lib-tlx'), entry.coords.tlx);
      setInputValue(qs('#bm-lib-tly'), entry.coords.tly);
      setInputValue(qs('#bm-lib-px'),  entry.coords.px);
      setInputValue(qs('#bm-lib-py'),  entry.coords.py);

      clearLocalChosenFile();
      setFileLabelToStored(entry);
    }

    // QoL: single-click selection populates form
    sel.addEventListener('change', () => populateFormFromSelected());

    // QoL: double-click selection populates form AND loads into BM (without auto-create)
    sel.addEventListener('dblclick', () => {
      populateFormFromSelected();
      loadIntoBM(false);
    });

    function requireNameUniqueForNew() {
      const name = (qs('#bm-lib-name').value || '').trim();
      if (!name) {
        alert('Name is required 🙂');
        qs('#bm-lib-name').focus();
        return null;
      }
      const items = loadStore();
      const existing = new Set(items.map(t => normName(t.name)));
      if (existing.has(normName(name))) {
        alert('That name is already used. Pick a unique name (for NEW templates).');
        qs('#bm-lib-name').focus();
        return null;
      }
      return name;
    }

    async function addNewTemplate() {
      const name = requireNameUniqueForNew();
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

      clearLocalChosenFile();
      setFileLabelToStored(entry);
    }

    async function editSelectedTemplate() {
      const picked = getSelectedEntry();
      if (!picked) return alert('Select a template to edit first.');

      const { entry, idx, items } = picked;

      const formName = (qs('#bm-lib-name').value || '').trim();
      if (!formName) {
        alert('Name is required 🙂');
        qs('#bm-lib-name').focus();
        return;
      }

      if (formName !== entry.name) {
        alert(`When editing, the name must stay the same.\n\nSelected: "${entry.name}"\nForm: "${formName}"\n\n(Use "Add new template" to create a new one with a unique name.)`);
        setInputValue(qs('#bm-lib-name'), entry.name);
        return;
      }

      const ok = confirm(`Edit "${entry.name}" with the current form values?`);
      if (!ok) return;

      const tlx = Number(qs('#bm-lib-tlx').value);
      const tly = Number(qs('#bm-lib-tly').value);
      const px  = Number(qs('#bm-lib-px').value);
      const py  = Number(qs('#bm-lib-py').value);

      if (![tlx,tly,px,py].every(n => Number.isFinite(n))) return alert('Fill all 4 coordinates (numbers).');

      entry.coords = { tlx, tly, px, py };
      entry.updatedAt = Date.now();

      const newFile = fileInput.files?.[0];
      if (newFile) {
        entry.dataUrl = await toBase64(newFile);
        entry.filename = newFile.name;
        entry.mime = newFile.type || entry.mime || 'image/png';
      }

      items[idx] = entry;
      saveStore(items);
      refreshSelect(idx);

      clearLocalChosenFile();
      setFileLabelToStored(entry);
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

    function loadIntoBM(doCreate) {
      const bm = getBMElements();
      if (!bmReady()) return alert('BM inputs not found yet.');

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
        return alert('Failed to inject file into BM input.');
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

      fileName.textContent = 'No file selected';
      clearLocalChosenFile();
    }

    function sanitizeFilename(name) {
      // Keep it simple + cross-platform safe
      return String(name || 'template')
        .replace(/[\/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
    }

    function exportAllTemplates() {
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

    function exportCurrentTemplate() {
      const picked = getSelectedEntry?.();
      if (!picked) return alert('Select a template first.');

      const { entry } = picked;

      const payload = { version: 1, exportedAt: new Date().toISOString(), templates: [entry] };
      const json = JSON.stringify(payload, null, 2);

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      // filename is the name of the template
      a.download = `${sanitizeFilename(entry.name)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function resetBlueMarbleFromLibrary() {
      const bm = getBMElements();

      // Reset saved BM icon-mode state/position so it can't stay hidden forever
      const st = loadBMUI();
      st.minimized = false;
      st.icon = { ...DEFAULT_BM_UI.icon };
      saveBMUI(st);

      // Force BM visible right now
      const icon = qs('#bm-icon-mode');
      if (icon) icon.style.display = 'none';
      if (bm?.panel) bm.panel.style.display = '';
      else alert('BlueMarble panel not found yet. Try once BlueMarble has loaded.');
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

      const dupInImport = hasDuplicateNames(incomingRaw);
      if (dupInImport) {
        const ok = confirm(
          'Duplicate template names were detected in the import.\n\n' +
          'OK = import anyway (duplicates will be renamed like "Name (2)", "Name (3)", ...)\n' +
          'Cancel = abort import'
        );
        if (!ok) return;
      }

      const existing = loadStore();

      const exactKey = (t) =>
        `${t.coords.tlx},${t.coords.tly},${t.coords.px},${t.coords.py}::${t.filename || ''}::${(t.dataUrl || '').length}`;

      const seenExact = new Set(existing.map(exactKey));
      const usedNames = new Set(existing.map(t => normName(t.name)));

      const incoming = [];
      for (const t of incomingRaw) {
        if (seenExact.has(exactKey(t))) continue;

        const fixed = { ...t };
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

    // Wire buttons
    qs('#bm-lib-load').addEventListener('click', () => loadIntoBM(false));
    qs('#bm-lib-loadcreate').addEventListener('click', () => loadIntoBM(true));

    qs('#bm-lib-moveup').addEventListener('click', () => moveSelected(-1));
    qs('#bm-lib-movedown').addEventListener('click', () => moveSelected(+1));
    qs('#bm-lib-deletecurrent').addEventListener('click', deleteCurrent);

    qs('#bm-lib-importmap').addEventListener('click', importCoordsFromMapIntoTL);
    qs('#bm-lib-importbm').addEventListener('click', importCoordsFromBMIntoTL);

    qs('#bm-lib-add').addEventListener('click', () => addNewTemplate().catch(console.error));
    qs('#bm-lib-edit').addEventListener('click', () => editSelectedTemplate().catch(console.error));

    qs('#bm-lib-bmreset').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetBlueMarbleFromLibrary();
    });

    qs('#bm-lib-exportcurrent').addEventListener('click', exportCurrentTemplate);
    qs('#bm-lib-exportall').addEventListener('click', exportAllTemplates);

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
