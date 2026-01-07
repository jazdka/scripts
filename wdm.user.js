// ==UserScript==
// @name        Dark Mode
// @match       https://wplace.live/*
// @grant       GM_addStyle
// @grant       unsafeWindow
// @version     0.0.3
// @author      jaz/jazdka
// @run-at document-start
// @license MIT
// ==/UserScript==

(() => {
  'use strict';

  const root = unsafeWindow || window;

  // --- persistent state (localStorage) ---
  const LS_ENABLED = 'wplace_darkmode_enabled';
  const LS_POS = 'wplace_darkmode_icon_pos'; // now stores { right, top }

  function getEnabled() {
    const v = localStorage.getItem(LS_ENABLED);
    return v === null ? true : v === '1';
  }
  function setEnabled(val) {
    localStorage.setItem(LS_ENABLED, val ? '1' : '0');
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function savePosRightTop(right, top) {
    localStorage.setItem(LS_POS, JSON.stringify({ right, top }));
  }

  // Convert old {x,y} (left/top) to {right,top} once, if found.
  function maybeMigrateOldPos(btnSize = { w: 46, h: 46 }) {
    const raw = localStorage.getItem(LS_POS);
    if (!raw) return;

    const p = safeJsonParse(raw);
    if (!p || typeof p !== 'object') return;

    // old format: {x,y}
    if (Number.isFinite(p.x) && Number.isFinite(p.y) && !(Number.isFinite(p.right) && Number.isFinite(p.top))) {
      const right = Math.max(0, Math.round(window.innerWidth - (p.x + btnSize.w)));
      const top = Math.max(0, Math.round(p.y));
      savePosRightTop(right, top);
    }
  }

  function getSavedPosRightTop() {
    const raw = localStorage.getItem(LS_POS);
    if (!raw) return null;

    const p = safeJsonParse(raw);
    if (!p || typeof p !== 'object') return null;

    if (Number.isFinite(p.right) && Number.isFinite(p.top)) {
      return { right: p.right, top: p.top };
    }
    return null;
  }

  function clampPosRightTop(pos, el) {
    const w = el?.offsetWidth || 46;
    const h = el?.offsetHeight || 46;

    const maxRight = Math.max(0, window.innerWidth - w);
    const maxTop   = Math.max(0, window.innerHeight - h);

    let right = Number(pos?.right);
    let top   = Number(pos?.top);

    if (!Number.isFinite(right)) right = 16;   // default like your old left:16
    if (!Number.isFinite(top))   top = 120;

    right = clamp(right, 0, maxRight);
    top   = clamp(top,   0, maxTop);

    return { right, top };
  }

  function applyPosRightTop(el, pos) {
    el.style.left = 'auto';
    el.style.bottom = 'auto';
    el.style.right = `${pos.right}px`;
    el.style.top = `${pos.top}px`;
  }

  function posToRightTop(el) {
    const r = el.getBoundingClientRect();
    const right = Math.max(0, Math.round(window.innerWidth - (r.left + r.width)));
    const top   = Math.max(0, Math.round(r.top));
    return { right, top };
  }

  let enabled = getEnabled();

  function syncHtmlClass() {
    const el = document.documentElement;
    if (!el) return;
    el.classList.toggle('wplace-darkmode-enabled', !!enabled);
  }

  syncHtmlClass();
  if (!document.documentElement) {
    new MutationObserver(() => {
      if (document.documentElement) syncHtmlClass();
    }).observe(document, { childList: true, subtree: true });
  }

  // --- Fetch wrapper: only modifies map style when enabled ---
  const originalFetch = root.fetch.bind(root);

  root.fetch = async (req, options) => {
    const res = await originalFetch(req, options);

    if (!enabled) return res;
    if (res.url !== 'https://maps.wplace.live/styles/liberty') return res;

    const json = await res.json();
    json.layers.forEach((layer) => {
      switch (layer.id) {
        case 'background': layer.paint['background-color'] = '#272e40'; break;
        case 'water': layer.paint['fill-color'] = '#000d2a'; break;

        case 'waterway_tunnel':
        case 'waterway_river':
        case 'waterway_other':
          layer.paint['line-color'] = '#000d2a';
          break;

        case 'natural_earth': layer.paint['raster-brightness-max'] = 0.4; break;
        case 'landcover_ice': layer.paint['fill-color'] = '#475677'; break;
        case 'landcover_sand': layer.paint['fill-color'] = '#775f47'; break;

        case 'park':
          layer.paint = { 'fill-color': '#0e4957', 'fill-opacity': 0.7 };
          break;

        case 'park_outline': layer.paint['line-opacity'] = 0; break;

        case 'landuse_pitch':
        case 'landuse_track':
        case 'landuse_school':
          layer.paint['fill-color'] = '#3e4966';
          break;

        case 'landuse_cemetery': layer.paint['fill-color'] = '#3b3b57'; break;
        case 'landuse_hospital': layer.paint['fill-color'] = '#663e3e'; break;
        case 'building': layer.paint['fill-color'] = '#1c3b69'; break;
        case 'building_3d': layer.paint['fill-extrusion-color'] = '#1c3b69'; break;

        case 'waterway_line_label':
        case 'water_name_point_label':
        case 'water_name_line_label':
          layer.paint['text-color'] = '#8bb6f8';
          layer.paint['text-halo-color'] = 'rgba(0,0,0,0.7)';
          break;

        case 'tunnel_path_pedestrian':
        case 'road_path_pedestrian':
        case 'bridge_path_pedestrian':
          layer.paint['line-color'] = '#7c8493';
          break;

        case 'bridge_path_pedestrian_casing':
          layer.paint['line-color'] = '#3b4d65';
          break;

        case 'road_minor':
        case 'tunnel_service_track':
        case 'tunnel_minor':
        case 'road_service_track':
        case 'bridge_service_track':
        case 'bridge_street':
          layer.paint['line-color'] = '#3b4d65';
          break;

        case 'tunnel_link':
        case 'tunnel_secondary_tertiary':
        case 'tunnel_trunk_primary':
        case 'tunnel_motorway':
          layer.paint['line-color'] = '#4a627e';
          break;

        case 'label_other':
        case 'label_state':
          layer.paint['text-color'] = '#91a0b5';
          layer.paint['text-halo-color'] = 'rgba(0,0,0,0.7)';
          break;

        case 'poi_r20':
        case 'poi_r7':
        case 'poi_r1':
          layer.paint['text-color'] = '#91a0b5';
          layer.paint['text-halo-color'] = 'rgba(0,0,0,0.7)';
          break;

        case 'poi_transit':
          layer.paint['text-color'] = '#cde0fe';
          layer.paint['text-halo-color'] = 'rgba(0,0,0,0.7)';
          break;

        case 'highway_name_path':
        case 'highway_name_major':
          layer.paint['text-color'] = '#cde0fe';
          layer.paint['text-halo-color'] = 'rgba(0,0,0,0.7)';
          break;

        case 'highway_name_minor':
          layer.paint['text-color'] = '#91a0b5';
          layer.paint['text-halo-color'] = 'rgba(0,0,0,0.7)';
          break;

        case 'label_village':
        case 'label_town':
        case 'label_city':
        case 'label_city_capital':
        case 'label_country_3':
        case 'label_country_2':
        case 'label_country_1':
          layer.paint['text-color'] = '#e4e5e9';
          layer.paint['text-halo-color'] = 'rgba(0,0,0,0.7)';
          break;

        case 'airport':
          layer.paint['text-color'] = '#92b7fe';
          layer.paint['text-halo-color'] = 'rgba(0,0,0,0.7)';
          break;

        case 'aeroway_fill': layer.paint['fill-color'] = '#2a486c'; break;
        case 'aeroway_runway': layer.paint['line-color'] = '#253d61'; break;
        case 'aeroway_taxiway': layer.paint['line-color'] = '#3d5b77'; break;
        case 'boundary_3': layer.paint['line-color'] = '#707784'; break;
      }
    });

    const text = JSON.stringify(json)
      .replaceAll('#e9ac77', '#476889')
      .replaceAll('#fc8', '#476889')
      .replaceAll('#fea', '#3d5b77')
      .replaceAll('#cfcdca', '#3b4d65');

    return new Response(text, {
      headers: res.headers,
      status: res.status,
      statusText: res.statusText,
    });
  };

  // --- CSS (only active when html has class) ---
  GM_addStyle(/* css */ `
    html.wplace-darkmode-enabled {
      --color-base-100: #1b1e24;
      --color-base-200: #262b36;
      --color-base-300: #151922;
      --color-base-content: #f5f6f9;
      --noise: 0;
    }

    html.wplace-darkmode-enabled #color-0 {
      background-color: white !important;
    }

    #wplace-darkmode-toggle {
      position: fixed;
      right: 16px;   /* default: right/top now */
      top: 120px;
      width: 46px;
      height: 46px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;

      background: rgba(20,20,20,.92);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      backdrop-filter: blur(6px);
    }

    #wplace-darkmode-toggle.wplace-off {
      background: rgba(0,0,0,.25);
      border: 1px solid rgba(255,255,255,.12);
    }

    #wplace-darkmode-toggle .dm-icon{
      width: 28px;
      height: 28px;
      display: block;
      pointer-events: none;
      overflow: visible;
    }

    #wplace-darkmode-toggle,
    #wplace-darkmode-toggle * {
      -webkit-user-drag: none !important;
      user-drag: none !important;
      user-select: none !important;
    }

    #wplace-darkmode-toggle .sun .core,
    #wplace-darkmode-toggle .sun .rays,
    #wplace-darkmode-toggle .moon .crescent{
      fill: #fff;
      stroke: #fff;
    }

    #wplace-darkmode-toggle.wplace-off .sun .core,
    #wplace-darkmode-toggle.wplace-off .sun .rays,
    #wplace-darkmode-toggle.wplace-off .moon .crescent{
      fill: #111;
      stroke: #111;
    }

    #wplace-darkmode-toggle .sun,
    #wplace-darkmode-toggle .moon{
      transform-origin: 32px 32px;
      transition:
        opacity 180ms ease,
        transform 280ms cubic-bezier(.2,.8,.2,1);
      will-change: transform, opacity;
    }

    #wplace-darkmode-toggle .moon{
      opacity: 1;
      transform: rotate(0deg) scale(1);
    }
    #wplace-darkmode-toggle .sun{
      opacity: 0;
      transform: rotate(-120deg) scale(0.6);
    }

    #wplace-darkmode-toggle.wplace-off .sun{
      opacity: 1;
      transform: rotate(0deg) scale(1);
    }
    #wplace-darkmode-toggle.wplace-off .moon{
      opacity: 0;
      transform: rotate(140deg) scale(0.6);
    }

    #wplace-darkmode-toggle .sun .rays{
      transition: opacity 180ms ease, transform 280ms cubic-bezier(.2,.8,.2,1);
      transform-origin: 32px 32px;
    }
    #wplace-darkmode-toggle.wplace-off .sun .rays{
      opacity: 1;
      transform: scale(1);
    }
    #wplace-darkmode-toggle:not(.wplace-off) .sun .rays{
      opacity: 0;
      transform: scale(0.75);
    }
  `);

  // --- UI: draggable icon; click toggles; drag doesn't ---
  function makeToggleButton() {
    if (document.getElementById('wplace-darkmode-toggle')) return;

    const btn = document.createElement('div');
    btn.id = 'wplace-darkmode-toggle';
    btn.title = 'Toggle Dark Mode (drag to move)';

    btn.innerHTML = `
      <svg class="dm-icon" viewBox="0 0 64 64" aria-hidden="true">
        <g class="sun">
          <g class="rays" fill="none" stroke-width="4" stroke-linecap="round">
            <path d="M32 6v8M32 50v8M6 32h8M50 32h8M13 13l6 6M45 45l6 6M51 13l-6 6M19 45l-6 6"/>
          </g>
          <circle class="core" cx="32" cy="32" r="12"/>
        </g>
        <g class="moon">
          <path class="crescent" d="M41.5 44.5c-11 0-20-9-20-20 0-7.4 4-14 10-17.4-1.7 3.2-2.6 6.9-2.6 10.7 0 12.7 10.3 23 23 23 2.9 0 5.8-.6 8.4-1.7-3.4 3.6-8.2 5.4-18.8 5.4z"/>
        </g>
      </svg>
    `;

    function syncBtnState() {
      btn.classList.toggle('wplace-off', !enabled);
      btn.title = enabled ? 'Dark Mode: ON (click to turn OFF)' : 'Dark Mode: OFF (click to turn ON)';
    }
    syncBtnState();

    // Migrate old x/y if present (needs a size; 46x46 matches CSS)
    maybeMigrateOldPos({ w: 46, h: 46 });

    // Restore saved position (right/top) and clamp it
    const saved = getSavedPosRightTop();
    const clamped = clampPosRightTop(saved, btn);
    applyPosRightTop(btn, clamped);
    savePosRightTop(clamped.right, clamped.top);

    // Keep it on-screen when viewport changes
    const onResize = () => {
      const s = getSavedPosRightTop();
      const c = clampPosRightTop(s, btn);
      applyPosRightTop(btn, c);
      savePosRightTop(c.right, c.top);
    };
    window.addEventListener('resize', onResize, { passive: true });

    let pointerId = null;
    let startX = 0, startY = 0;
    let startRight = 0, startTop = 0;
    let dragged = false;
    const DRAG_THRESHOLD = 6;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      pointerId = e.pointerId;
      btn.setPointerCapture(pointerId);

      const rect = btn.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;

      // current right/top from rect (robust even if style missing)
      startRight = Math.max(0, window.innerWidth - (rect.left + rect.width));
      startTop = Math.max(0, rect.top);

      dragged = false;
    }, { passive: false });

    btn.addEventListener('pointermove', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragged && Math.hypot(dx, dy) >= DRAG_THRESHOLD) dragged = true;

      if (dragged) {
        // when moving right, right-distance DECREASES (so subtract dx)
        const nextRightRaw = startRight - dx;
        const nextTopRaw = startTop + dy;

        const maxRight = Math.max(0, window.innerWidth - btn.offsetWidth);
        const maxTop   = Math.max(0, window.innerHeight - btn.offsetHeight);

        const nextRight = clamp(nextRightRaw, 0, maxRight);
        const nextTop   = clamp(nextTopRaw,   0, maxTop);

        applyPosRightTop(btn, { right: nextRight, top: nextTop });
        savePosRightTop(nextRight, nextTop);
      }
    });

    btn.addEventListener('pointerup', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;

      try { btn.releasePointerCapture(pointerId); } catch {}
      pointerId = null;

      if (!dragged) {
        enabled = !enabled;
        setEnabled(enabled);
        syncHtmlClass();
        syncBtnState();
        location.reload();
      }
    });

    btn.addEventListener('pointercancel', () => {
      pointerId = null;
    });

    document.documentElement.appendChild(btn);
  }

  function bootUI() {
    if (document.documentElement) makeToggleButton();
  }

  bootUI();
  new MutationObserver(() => bootUI()).observe(document, { childList: true, subtree: true });
})();
