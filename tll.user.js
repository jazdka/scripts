// ==UserScript==
// @name         Template Library Loader
// @namespace    local-bm-template-library
// @version      0.3.0
// @author       jaz / jazdka
// @description  Stores template images + coords and loads them into the already-running BM UI. Supports Blue Marble 0.88 and 0.90+.
// @match        https://wplace.live/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      backend.wplace.live
// @connect      wplace.live
// @connect      *
// ==/UserScript==

(() => {
  "use strict";

  const STORE_KEY = "bm_template_library_v1";
  const UI_KEY = "bm_template_library_ui_v2";
  const BM_UI_KEY = "bm_icon_mode_ui_v1";

  const DEFAULT_UI = {
    minimized: false,
    panel: { right: 10, top: 110 },
    icon: { right: 10, top: 110 },
  };

  const DEFAULT_BM_UI = {
    minimized: false,
    icon: { right: 85, top: 10 },
  };

  const TILE_SIZE = 1000;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const qs = (sel) => document.querySelector(sel);
  const normName = (s) => String(s || "").trim().toLowerCase();

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function loadUI() {
    const v = safeJsonParse(GM_getValue(UI_KEY, "null"), null);
    return v && typeof v === "object" ? { ...DEFAULT_UI, ...v } : { ...DEFAULT_UI };
  }
  function saveUI(ui) { GM_setValue(UI_KEY, JSON.stringify(ui)); }

  function loadStore() {
    const v = safeJsonParse(GM_getValue(STORE_KEY, "[]"), []);
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
    if (!m) throw new Error("Bad data URL");
    const mime = m[1] || "application/octet-stream";
    const bin = atob(m[2] || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  }

  function setInputValue(input, value) {
    if (!input) return;
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setFileInput(fileInput, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ─── Blue Marble version detection ───────────────────────────────────────────
  // 0.88 uses: #bm-v (tlx), #bm-w (tly), #bm-x (px), #bm-y (py), #bm-a (file)
  //            panel=#bm-A,  coords-span=#bm-h,  create=#bm-r
  // 0.90 uses: #bm-F (tlx), #bm-G (tly), #bm-D (px), #bm-E (py), input inside .bm-A
  //            panel=#bm-t,  coords-span=#bm-g,  Create button found by text

  function detectBMVersion() {
    if (qs("#bm-F") || qs("#bm-t")) return "0.90";
    if (qs("#bm-v") || qs("#bm-A")) return "0.88";
    return null; // not loaded yet
  }

  function getBMElements() {
    const ver = detectBMVersion();

    if (ver === "0.90") {
      // File input: lives inside .bm-A wrapper (the yt() builder puts <input type=file> first)
      const fileWrapper = qs(".bm-A");
      const fileInput = fileWrapper
        ? fileWrapper.querySelector("input[type='file']")
        : null;

      // Create button: find by text inside the main BM panel #bm-t
      const panel = qs("#bm-t");
      let createBtn = null;
      if (panel) {
        for (const btn of panel.querySelectorAll("button")) {
          if (btn.textContent.trim() === "Create") { createBtn = btn; break; }
        }
      }

      return {
        ver: "0.90",
        panel,
        file: fileInput,
        tlx: qs("#bm-F"),
        tly: qs("#bm-G"),
        px:  qs("#bm-D"),
        py:  qs("#bm-E"),
        create: createBtn,
      };
    }

    // 0.88 layout
    return {
      ver: "0.88",
      panel:  qs("#bm-A"),
      file:   qs("#bm-a"),
      tlx:    qs("#bm-v"),
      tly:    qs("#bm-w"),
      px:     qs("#bm-x"),
      py:     qs("#bm-y"),
      create: qs("#bm-r"),
    };
  }

  function bmReady() {
    const ver = detectBMVersion();
    if (!ver) return false;
    const e = getBMElements();
    return !!(e.file && e.tlx && e.tly && e.px && e.py);
  }

  // ─── Coord span: #bm-h (0.88) or #bm-g (0.90) ───────────────────────────────
  function getCoordSpanId() {
    return detectBMVersion() === "0.90" ? "#bm-g" : "#bm-h";
  }

  function parseLastClickedFromBmSpan() {
    const span = qs(getCoordSpanId());
    const txt = span?.textContent || "";
    const m = txt.match(
      /Tl X:\s*(\d+),\s*Tl Y:\s*(\d+),\s*Px X:\s*(\d+),\s*Px Y:\s*(\d+)/i,
    );
    if (!m) return null;
    return {
      tlx: Number(m[1]),
      tly: Number(m[2]),
      px:  Number(m[3]),
      py:  Number(m[4]),
    };
  }

  function waitForBmHChange(prevText, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        const el = qs(getCoordSpanId());
        const txt = el?.textContent || "";
        const parsed = parseLastClickedFromBmSpan();
        if (parsed && txt && txt !== prevText) return resolve(parsed);
        if (Date.now() - start > timeoutMs)
          return reject(new Error("Timed out waiting for coordinate update."));
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  // ─── Position helpers ─────────────────────────────────────────────────────────
  function applyPositionFromUI(el, pos) {
    if (!el) return;
    el.style.left   = "auto";
    el.style.bottom = "auto";
    el.style.right  = `${pos.right}px`;
    el.style.top    = `${pos.top}px`;
  }

  function positionToRightTop(el) {
    const r = el.getBoundingClientRect();
    const right = Math.max(0, Math.round(window.innerWidth - (r.left + r.width)));
    const top   = Math.max(0, Math.round(r.top));
    return { right, top };
  }

  function makeDraggableWithClickGuard({ root, handle, shouldStartDrag, onMoveEnd }) {
    let dragging = false, moved = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    const THRESH = 5;

    const onPointerDown = (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      if (typeof shouldStartDrag === "function" && !shouldStartDrag(ev)) return;
      dragging = true; moved = false;
      root.setPointerCapture?.(ev.pointerId);
      const r = root.getBoundingClientRect();
      startX = ev.clientX; startY = ev.clientY;
      startLeft = r.left;  startTop  = r.top;
    };

    const onPointerMove = (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && (Math.abs(dx) > THRESH || Math.abs(dy) > THRESH)) moved = true;
      root.classList.add("bm-lib-dragging");
      root.style.left   = `${startLeft + dx}px`;
      root.style.top    = `${startTop  + dy}px`;
      root.style.right  = "auto";
      root.style.bottom = "auto";
      ev.preventDefault();
    };

    const onPointerUp = (ev) => {
      if (!dragging) return;
      dragging = false;
      root.classList.remove("bm-lib-dragging");
      const r  = root.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const clLeft = clamp(r.left, 0, Math.max(0, vw - r.width));
      const clTop  = clamp(r.top,  0, Math.max(0, vh - r.height));
      root.style.left  = `${clLeft}px`;
      root.style.top   = `${clTop}px`;
      root.style.right = "auto";
      onMoveEnd?.({ left: clLeft, top: clTop, moved });
      try { root.releasePointerCapture?.(ev.pointerId); } catch {}
      ev.preventDefault();
    };

    handle.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove",  onPointerMove,  { passive: false });
    window.addEventListener("pointerup",    onPointerUp,    { passive: false });
    window.addEventListener("pointercancel",onPointerUp,    { passive: false });

    return { wasDrag: () => moved };
  }

  // ─── Styles ───────────────────────────────────────────────────────────────────
  GM_addStyle(`
    #bm-lib, #bm-lib-icon {
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
    #bm-lib .bm-lib-ver-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 8px;
      background: rgba(255,255,255,.10);
      border: 1px solid rgba(255,255,255,.14);
      white-space: nowrap;
      opacity: .75;
    }
    #bm-lib .bm-lib-ver-badge.v090 { color: #7df; border-color: rgba(100,200,255,.3); }
    #bm-lib .bm-lib-ver-badge.v088 { color: #fd7; border-color: rgba(255,200,100,.3); }
    #bm-lib .bm-lib-ver-badge.unknown { color: #f88; border-color: rgba(255,80,80,.3); }
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
    #bm-lib input[type="number"] {
      width:100%;
      background: rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.14);
      color:#fff;
      border-radius:10px;
      padding:7px 9px;
      outline:none;
    }
    #bm-lib button.action {
      width:100%;
      background: rgba(255,255,255,.10);
      border:1px solid rgba(255,255,255,.14);
      color:#fff;
      border-radius:10px;
      padding:7px 9px;
      cursor:pointer;
      white-space:nowrap;
    }
    #bm-lib button.action:hover { background: rgba(255,255,255,.16); }
    #bm-lib button.small {
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
    #bm-lib button.small:hover { background: rgba(255,255,255,.16); }
    #bm-lib .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
    #bm-lib .fileWrap {
      display:flex; gap:8px; align-items:center; width:100%;
      padding:8px 9px;
      border-radius:10px;
      background: rgba(255,255,255,.06);
      border: 1px solid rgba(255,255,255,.14);
    }
    #bm-lib .fileWrap .fileBtn {
      padding:6px 10px;
      border-radius:10px;
      background: rgba(255,255,255,.12);
      border: 1px solid rgba(255,255,255,.16);
      cursor:pointer;
      white-space:nowrap;
    }
    #bm-lib .fileWrap .fileBtn:hover { background: rgba(255,255,255,.18); }
    #bm-lib .fileWrap .fileName {
      opacity:.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;
    }
    #bm-lib input[type="file"] {
      position:absolute !important; left:-9999px !important;
      width:0 !important; height:0 !important; opacity:0 !important; pointer-events:none !important;
    }
    #bm-lib-icon {
      position:fixed;
      width:44px; height:44px;
      border-radius:14px;
      background: rgba(20,20,20,.92);
      border:1px solid rgba(255,255,255,.12);
      box-shadow:0 10px 30px rgba(0,0,0,.35);
      display:flex; align-items:center; justify-content:center;
      cursor:grab; backdrop-filter: blur(6px);
    }
    #bm-lib-icon button {
      all:unset; width:100%; height:100%;
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; font-size:20px;
    }
  `);

  // ─── "Steal some art" helpers ─────────────────────────────────────────────────
  function detectTileBaseUrl() {
    try {
      const entries = performance.getEntriesByType("resource") || [];
      for (let i = entries.length - 1; i >= 0; i--) {
        const name = entries[i]?.name || "";
        const idx = name.indexOf("/tiles/");
        if (idx !== -1 && name.endsWith(".png"))
          return name.slice(0, idx + "/tiles".length);
      }
    } catch {}
    return "https://backend.wplace.live/files/s0/tiles";
  }

  function gmFetchBlob(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET", url, responseType: "blob",
          onload: (r) => {
            if (r.status >= 200 && r.status < 300 && r.response) resolve(r.response);
            else reject(new Error(`HTTP ${r.status} fetching ${url}`));
          },
          onerror: () => reject(new Error(`Network error fetching ${url}`)),
        });
      } else {
        fetch(url)
          .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
          .then(resolve).catch(reject);
      }
    });
  }

  async function buildScreenshotBlobTopLeft(tileBase, tlx, tly, px, py, width, height) {
    if (!(width > 0 && height > 0)) throw new Error("Invalid screenshot size");
    const leftGX = tlx * TILE_SIZE + px, topGY  = tly * TILE_SIZE + py;
    const rightGX = leftGX + width,      botGY   = topGY + height;
    const minTX = Math.floor(leftGX / TILE_SIZE), minTY = Math.floor(topGY  / TILE_SIZE);
    const maxTX = Math.floor((rightGX - 1) / TILE_SIZE);
    const maxTY = Math.floor((botGY  - 1) / TILE_SIZE);

    const canvas = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);

    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        const blob = await gmFetchBlob(`${tileBase}/${tx}/${ty}.png`);
        const bmp  = await createImageBitmap(blob);
        const tileLeftGX = tx * TILE_SIZE, tileTopGY = ty * TILE_SIZE;
        const sx = Math.max(0, leftGX - tileLeftGX), sy = Math.max(0, topGY - tileTopGY);
        const ex = Math.min(TILE_SIZE, rightGX - tileLeftGX);
        const ey = Math.min(TILE_SIZE, botGY  - tileTopGY);
        const sw = ex - sx, sh = ey - sy;
        if (sw <= 0 || sh <= 0) continue;
        ctx.drawImage(bmp, sx, sy, sw, sh, tileLeftGX + sx - leftGX, tileTopGY + sy - topGY, sw, sh);
      }
    }
    if (canvas.convertToBlob) return await canvas.convertToBlob({ type: "image/png" });
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function coordsToGlobalPx(c) {
    return { gx: c.tlx * TILE_SIZE + c.px, gy: c.tly * TILE_SIZE + c.py };
  }

  function globalPxToCoords(gx, gy) {
    const tlx = Math.floor(gx / TILE_SIZE), tly = Math.floor(gy / TILE_SIZE);
    return { tlx, tly, px: gx - tlx * TILE_SIZE, py: gy - tly * TILE_SIZE };
  }

  function showStealOverlay(text) {
    let ov = qs("#bm-steal-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "bm-steal-overlay";
      ov.style.cssText = `
        position:fixed; left:50%; top:70px; transform:translateX(-50%);
        z-index:100000; padding:10px 14px; border-radius:999px;
        background:rgba(20,20,20,.90); color:#fff;
        font:12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        border:1px solid rgba(255,255,255,.14);
        box-shadow:0 10px 30px rgba(0,0,0,.35);
        backdrop-filter:blur(6px); pointer-events:none; white-space:nowrap;`;
      document.body.appendChild(ov);
    }
    ov.textContent = text;
    ov.style.display = "";
    return ov;
  }

  function hideStealOverlay() {
    const ov = qs("#bm-steal-overlay");
    if (ov) ov.style.display = "none";
  }

  function isClickOnMap(ev) {
    const c = qs("canvas.maplibregl-canvas");
    if (!c) return false;
    const r = c.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right &&
           ev.clientY >= r.top  && ev.clientY <= r.bottom;
  }

  async function getNextMapClickCoords(stepLabel) {
    const prev = qs(getCoordSpanId())?.textContent || "";
    showStealOverlay(stepLabel);
    const coords = await new Promise((resolve, reject) => {
      const onClick = async (ev) => {
        if (!isClickOnMap(ev)) return;
        window.removeEventListener("click",   onClick, true);
        window.removeEventListener("keydown", onKey,   true);
        try { resolve(await waitForBmHChange(prev, 6000)); }
        catch (e) { reject(e); }
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          window.removeEventListener("click",   onClick, true);
          window.removeEventListener("keydown", onKey,   true);
          reject(new Error("Cancelled."));
        }
      };
      window.addEventListener("click",   onClick, true);
      window.addEventListener("keydown", onKey,   true);
    });
    hideStealOverlay();
    return coords;
  }

  async function stealSomeArtFlow() {
    try {
      const tlClick = await getNextMapClickCoords(
        "Steal mode: click TOP-LEFT on the map (ESC to cancel)"
      );
      const brClick = await getNextMapClickCoords(
        "Steal mode: click BOTTOM-RIGHT on the map"
      );

      const a = coordsToGlobalPx(tlClick), b = coordsToGlobalPx(brClick);
      const leftGX = Math.min(a.gx, b.gx), topGY  = Math.min(a.gy, b.gy);
      const rightGX = Math.max(a.gx, b.gx), botGY  = Math.max(a.gy, b.gy);
      const width = rightGX - leftGX + 1, height = botGY - topGY + 1;

      if (width <= 0 || height <= 0) { alert("Invalid selection."); return; }
      if (width > 4096 || height > 4096) {
        alert(`Selection too big: ${width}×${height} (limit 4096×4096).`); return;
      }

      const tl = globalPxToCoords(leftGX, topGY);
      const iso = new Date().toISOString().replace(/[:.]/g, "-");
      const name =
        `wplace_steal_TL_${String(tl.tlx).padStart(4,"0")},${String(tl.tly).padStart(4,"0")},` +
        `${String(tl.px).padStart(3,"0")},${String(tl.py).padStart(3,"0")}` +
        `_${width}x${height}_${iso}.png`;

      showStealOverlay(`Stealing ${width}×${height}…`);
      const blob = await buildScreenshotBlobTopLeft(
        detectTileBaseUrl(), tl.tlx, tl.tly, tl.px, tl.py, width, height
      );
      hideStealOverlay();
      downloadBlob(blob, name);
    } catch (e) {
      hideStealOverlay();
      if (String(e?.message || e).toLowerCase().includes("cancel")) return;
      console.error(e);
      alert(`Steal failed: ${e?.message || e}`);
    }
  }

  // ─── Version badge helper ─────────────────────────────────────────────────────
  function updateVersionBadge() {
    const badge = qs("#bm-lib-verbadge");
    if (!badge) return;
    const ver = detectBMVersion();
    badge.className = "bm-lib-ver-badge";
    if (ver === "0.90") {
      badge.textContent = "BM 0.90+";
      badge.classList.add("v090");
    } else if (ver === "0.88") {
      badge.textContent = "BM 0.88";
      badge.classList.add("v088");
    } else {
      badge.textContent = "BM ?";
      badge.classList.add("unknown");
    }
  }

  // ─── Main UI ──────────────────────────────────────────────────────────────────
  function renderLibraryUI() {
    if (qs("#bm-lib") || qs("#bm-lib-icon")) return;

    const ui = loadUI();
    const SCRIPT_VERSION =
      typeof GM_info !== "undefined" && GM_info?.script?.version
        ? GM_info.script.version : "dev";

    const panel = document.createElement("div");
    panel.id = "bm-lib";
    panel.innerHTML = `
      <div class="bar" id="bm-lib-bar">
        <div class="title">Template Library</div>
        <span id="bm-lib-verbadge" class="bm-lib-ver-badge unknown">BM ?</span>
        <button id="bm-lib-min" type="button" title="Minimize">–</button>
      </div>

      <div class="body">
        <div class="row">
          <select id="bm-lib-select" size="8"></select>
        </div>

        <div class="row">
          <button class="action" id="bm-lib-steal" type="button" title="Downloads pixels around the last clicked map pixel">Steal some art</button>
          <button class="action" id="bm-lib-loadcreate" type="button" title="Loads then clicks BM's Create button">Load + Create</button>
        </div>

        <div class="row">
          <div style="flex:1"><button class="small" id="bm-lib-moveup"   type="button" title="Move selected up">↑</button></div>
          <div style="flex:1"><button class="small" id="bm-lib-movedown" type="button" title="Move selected down">↓</button></div>
          <div style="flex:2"><button class="action" id="bm-lib-deletecurrent" type="button">Delete current</button></div>
        </div>

        <div class="row">
          <button class="action" id="bm-lib-importmap" type="button" title="Requires a pixel to be selected on the map">Import from map</button>
          <button class="action" id="bm-lib-importbm"  type="button" title="Copies coords from BlueMarble coordinate inputs">Import from BM</button>
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
          <button class="action" id="bm-lib-add"  type="button">Add new template</button>
          <button class="action" id="bm-lib-edit" type="button" title="Edits the selected template using the form values">Edit selected</button>
        </div>

        <div class="row">
          <button class="action" id="bm-lib-exportcurrent" type="button">Export current</button>
          <button class="action" id="bm-lib-exportall"     type="button">Export all</button>
          <button class="action" id="bm-lib-import"        type="button">Import</button>
          <input id="bm-lib-importfile" type="file" accept="application/json,.json" />
        </div>

        <div class="row" style="margin:0; color:gray;">
          <span>v${SCRIPT_VERSION}</span>
          <span style="width:100%; text-align:right;">with love, from jaz</span>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const icon = document.createElement("div");
    icon.id = "bm-lib-icon";
    icon.innerHTML = `<button type="button" title="Open Template Library">📚</button>`;
    document.body.appendChild(icon);

    applyPositionFromUI(panel, ui.panel);
    applyPositionFromUI(icon,  ui.icon);

    // Update badge now and keep it fresh
    updateVersionBadge();
    const badgeInterval = setInterval(updateVersionBadge, 2000);

    const setMinimized = (min) => {
      const current = loadUI();
      current.minimized = !!min;
      if (min) {
        current.panel = positionToRightTop(panel);
        panel.style.display = "none";
        icon.style.display  = "flex";
      } else {
        current.icon = positionToRightTop(icon);
        icon.style.display  = "none";
        panel.style.display = "";
      }
      saveUI(current);
    };

    setMinimized(!!ui.minimized);

    makeDraggableWithClickGuard({
      root: panel, handle: qs("#bm-lib-bar"),
      shouldStartDrag: (ev) => {
        const t = ev.target;
        return !(t && (t.closest("button") || t.closest("input") || t.closest("select")));
      },
      onMoveEnd: () => {
        const current = loadUI();
        current.panel = positionToRightTop(panel);
        saveUI(current);
      },
    });

    const iconDrag = makeDraggableWithClickGuard({
      root: icon, handle: icon,
      shouldStartDrag: () => true,
      onMoveEnd: () => {
        const current = loadUI();
        current.icon = positionToRightTop(icon);
        saveUI(current);
      },
    });

    icon.addEventListener("click", (e) => {
      if (iconDrag.wasDrag()) return;
      e.preventDefault(); e.stopPropagation();
      setMinimized(false);
    });

    qs("#bm-lib-min").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      setMinimized(true);
    });

    // File input wiring
    const fileInput = qs("#bm-lib-file");
    const fileBtn   = qs("#bm-lib-filebtn");
    const fileName  = qs("#bm-lib-filename");

    function setFileLabelToStored(entry) {
      fileName.textContent = entry ? `Stored: ${entry.filename || "image"}` : "No file selected";
    }
    function clearLocalChosenFile() {
      try { fileInput.value = ""; } catch {}
    }

    fileBtn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      fileInput.click();
    });
    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      fileName.textContent = f ? `New: ${f.name}` : "No file selected";
    });

    // Library list
    const sel = qs("#bm-lib-select");

    function refreshSelect(keepIdx = null) {
      const items = loadStore();
      sel.innerHTML = "";
      if (!items.length) {
        const opt = document.createElement("option");
        opt.value = ""; opt.textContent = "(no saved templates yet)";
        sel.appendChild(opt);
        return;
      }
      items.forEach((it, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = `${it.name} — [${it.coords.tlx},${it.coords.tly},${it.coords.px},${it.coords.py}]`;
        sel.appendChild(opt);
      });
      if (keepIdx !== null && Number.isInteger(keepIdx) && keepIdx >= 0 && keepIdx < items.length)
        sel.value = String(keepIdx);
    }

    function getSelectedIndex() {
      const idx = Number(sel.value);
      return Number.isInteger(idx) ? idx : -1;
    }

    function getSelectedEntry() {
      const items = loadStore();
      const idx   = getSelectedIndex();
      if (idx < 0 || idx >= items.length) return null;
      return { entry: items[idx], idx, items };
    }

    function populateFormFromSelected() {
      const picked = getSelectedEntry();
      if (!picked) return;
      const { entry } = picked;
      setInputValue(qs("#bm-lib-name"), entry.name);
      setInputValue(qs("#bm-lib-tlx"),  entry.coords.tlx);
      setInputValue(qs("#bm-lib-tly"),  entry.coords.tly);
      setInputValue(qs("#bm-lib-px"),   entry.coords.px);
      setInputValue(qs("#bm-lib-py"),   entry.coords.py);
      clearLocalChosenFile();
      setFileLabelToStored(entry);
    }

    sel.addEventListener("change", () => populateFormFromSelected());
    sel.addEventListener("dblclick", () => { populateFormFromSelected(); loadIntoBM(false); });

    function requireNameUniqueForNew() {
      const name = (qs("#bm-lib-name").value || "").trim();
      if (!name) { alert("Name is required 🙂"); qs("#bm-lib-name").focus(); return null; }
      const items    = loadStore();
      const existing = new Set(items.map((t) => normName(t.name)));
      if (existing.has(normName(name))) {
        alert("That name is already used. Pick a unique name (for NEW templates).");
        qs("#bm-lib-name").focus();
        return null;
      }
      return name;
    }

    async function addNewTemplate() {
      const name = requireNameUniqueForNew();
      if (!name) return;
      const tlx = Number(qs("#bm-lib-tlx").value), tly = Number(qs("#bm-lib-tly").value);
      const px  = Number(qs("#bm-lib-px").value),  py  = Number(qs("#bm-lib-py").value);
      const f   = fileInput.files?.[0];
      if (!f) return alert("Pick an image file first.");
      if (![tlx, tly, px, py].every((n) => Number.isFinite(n)))
        return alert("Fill all 4 coordinates (numbers).");

      const dataUrl = await toBase64(f);
      const entry   = {
        name, filename: f.name, mime: f.type || "image/png", dataUrl,
        coords: { tlx, tly, px, py }, createdAt: Date.now(),
      };
      const items = loadStore();
      items.unshift(entry);
      saveStore(items);
      refreshSelect(0);
      clearLocalChosenFile();
      setFileLabelToStored(entry);
    }

    async function editSelectedTemplate() {
      const picked = getSelectedEntry();
      if (!picked) return alert("Select a template to edit first.");
      const { entry, idx, items } = picked;

      const formName = (qs("#bm-lib-name").value || "").trim();
      if (!formName) { alert("Name is required 🙂"); qs("#bm-lib-name").focus(); return; }
      if (formName !== entry.name) {
        alert(
          `When editing, the name must stay the same.\n\nSelected: "${entry.name}"\nForm: "${formName}"\n\n` +
          `(Use "Add new template" to create a new one with a unique name.)`
        );
        setInputValue(qs("#bm-lib-name"), entry.name);
        return;
      }
      if (!confirm(`Edit "${entry.name}" with the current form values?`)) return;

      const tlx = Number(qs("#bm-lib-tlx").value), tly = Number(qs("#bm-lib-tly").value);
      const px  = Number(qs("#bm-lib-px").value),  py  = Number(qs("#bm-lib-py").value);
      if (![tlx, tly, px, py].every((n) => Number.isFinite(n)))
        return alert("Fill all 4 coordinates (numbers).");

      entry.coords    = { tlx, tly, px, py };
      entry.updatedAt = Date.now();

      const newFile = fileInput.files?.[0];
      if (newFile) {
        entry.dataUrl  = await toBase64(newFile);
        entry.filename = newFile.name;
        entry.mime     = newFile.type || entry.mime || "image/png";
      }
      items[idx] = entry;
      saveStore(items);
      refreshSelect(idx);
      clearLocalChosenFile();
      setFileLabelToStored(entry);
    }

    function moveSelected(delta) {
      const items = loadStore();
      const idx   = getSelectedIndex();
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

      if (!bm.file || !bm.tlx || !bm.tly || !bm.px || !bm.py) {
        const ver = detectBMVersion();
        if (!ver)
          return alert("Blue Marble not detected. Make sure BM is installed and the page has loaded.");
        return alert(`Blue Marble ${ver} detected but some inputs were not found. Try reloading the page.`);
      }

      const picked = getSelectedEntry();
      if (!picked) return alert("Pick a saved template first.");
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
        return alert("Failed to inject file into BM input.");
      }

      if (doCreate) {
        if (bm.create) {
          bm.create.click();
        } else {
          alert(
            "Could not find the BM Create button automatically.\n" +
            "Coords and image have been loaded — please click 'Create' in Blue Marble manually."
          );
        }
      }
    }

    function deleteCurrent() {
      const picked = getSelectedEntry();
      if (!picked) return alert("No template selected.");
      if (!confirm(`Delete "${picked.entry.name}"? This cannot be undone.`)) return;
      picked.items.splice(picked.idx, 1);
      saveStore(picked.items);
      refreshSelect();
      fileName.textContent = "No file selected";
      clearLocalChosenFile();
    }

    function setTLFormCoords(tlx, tly, px, py) {
      setInputValue(qs("#bm-lib-tlx"), tlx);
      setInputValue(qs("#bm-lib-tly"), tly);
      setInputValue(qs("#bm-lib-px"),  px);
      setInputValue(qs("#bm-lib-py"),  py);
    }

    function importCoordsFromBMIntoTL() {
      const bm = getBMElements();
      if (!bm.tlx) return alert("BM inputs not found yet.");
      const tlx = Number(bm.tlx.value), tly = Number(bm.tly.value);
      const px  = Number(bm.px.value),  py  = Number(bm.py.value);
      if (![tlx, tly, px, py].every((n) => Number.isFinite(n)))
        return alert("BM coords are not valid numbers.");
      setTLFormCoords(tlx, tly, px, py);
    }

    function importCoordsFromMapIntoTL() {
      const v = parseLastClickedFromBmSpan();
      if (!v) {
        const ver = detectBMVersion();
        const spanId = ver === "0.90" ? "#bm-g" : "#bm-h";
        return alert(
          `No pixel selected yet. Click a pixel on the map first (so Blue Marble shows the coords in ${spanId}).`
        );
      }
      setTLFormCoords(v.tlx, v.tly, v.px, v.py);
    }

    function sanitizeFilename(name) {
      return String(name || "template")
        .replace(/[\/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
    }

    function exportAllTemplates() {
      const payload = { version: 1, exportedAt: new Date().toISOString(), templates: loadStore() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), { href: url, download: "bm-template-library-export.json" });
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }

    function exportCurrentTemplate() {
      const picked = getSelectedEntry();
      if (!picked) return alert("Select a template first.");
      const payload = { version: 1, exportedAt: new Date().toISOString(), templates: [picked.entry] };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), {
        href: url, download: `${sanitizeFilename(picked.entry.name)}.json`,
      });
      document.body.appendChild(a); a.click(); a.remove();
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
      let name = String(baseName || "").trim() || "Template";
      const baseLower = normName(name);
      if (!usedLower.has(baseLower)) { usedLower.add(baseLower); return name; }
      let n = 2;
      while (true) {
        const candidate = `${name} (${n})`;
        const cLower    = normName(candidate);
        if (!usedLower.has(cLower)) { usedLower.add(cLower); return candidate; }
        n++;
      }
    }

    async function importTemplatesFromFile(file) {
      const text    = await file.text();
      const payload = safeJsonParse(text, null);
      if (!payload || !Array.isArray(payload.templates))
        return alert("Invalid import file.");

      const incomingRaw = payload.templates.filter(
        (t) =>
          t && typeof t.name === "string" && t.coords &&
          ["tlx","tly","px","py"].every((k) => Number.isFinite(Number(t.coords[k]))) &&
          typeof t.dataUrl === "string" && t.dataUrl.startsWith("data:")
      );
      if (!incomingRaw.length) return alert("No valid templates found.");

      if (hasDuplicateNames(incomingRaw)) {
        if (!confirm(
          "Duplicate template names were detected in the import.\n\n" +
          'OK = import anyway (duplicates renamed like "Name (2)")\nCancel = abort'
        )) return;
      }

      const existing   = loadStore();
      const exactKey   = (t) =>
        `${t.coords.tlx},${t.coords.tly},${t.coords.px},${t.coords.py}::${t.filename||""}::${(t.dataUrl||"").length}`;
      const seenExact  = new Set(existing.map(exactKey));
      const usedNames  = new Set(existing.map((t) => normName(t.name)));
      const incoming   = [];

      for (const t of incomingRaw) {
        if (seenExact.has(exactKey(t))) continue;
        const fixed = { ...t };
        if (hasDuplicateNames(incomingRaw) || usedNames.has(normName(fixed.name)))
          fixed.name = makeUniqueName(fixed.name, usedNames);
        else
          usedNames.add(normName(fixed.name));
        seenExact.add(exactKey(fixed));
        incoming.push(fixed);
      }

      if (!incoming.length) return alert("Nothing new to import (all entries already exist).");

      saveStore([...incoming, ...existing]);
      refreshSelect(0);
      alert(`Imported ${incoming.length} template(s).`);
    }

    // Wire buttons
    qs("#bm-lib-loadcreate").addEventListener("click", () => loadIntoBM(true));
    qs("#bm-lib-steal").addEventListener("click", () => stealSomeArtFlow().catch(console.error));
    qs("#bm-lib-moveup").addEventListener("click",   () => moveSelected(-1));
    qs("#bm-lib-movedown").addEventListener("click", () => moveSelected(+1));
    qs("#bm-lib-deletecurrent").addEventListener("click", deleteCurrent);
    qs("#bm-lib-importmap").addEventListener("click", importCoordsFromMapIntoTL);
    qs("#bm-lib-importbm").addEventListener("click",  importCoordsFromBMIntoTL);
    qs("#bm-lib-add").addEventListener("click",  () => addNewTemplate().catch(console.error));
    qs("#bm-lib-edit").addEventListener("click", () => editSelectedTemplate().catch(console.error));
    qs("#bm-lib-exportcurrent").addEventListener("click", exportCurrentTemplate);
    qs("#bm-lib-exportall").addEventListener("click", exportAllTemplates);

    const importBtn  = qs("#bm-lib-import");
    const importFile = qs("#bm-lib-importfile");
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", () => {
      const f = importFile.files?.[0];
      importFile.value = "";
      if (!f) return;
      importTemplatesFromFile(f).catch(console.error);
    });

    refreshSelect();
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────────
  // Wait for BM to be ready (either version) before showing the UI.
  // 0.88: watch for #bm-a or #bm-v    0.90: watch for #bm-F or #bm-t
  const obs = new MutationObserver(() => {
    if (bmReady()) {
      renderLibraryUI();
      obs.disconnect();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  if (bmReady()) renderLibraryUI();
})();
