// ==UserScript==
// @name        Dark Mode
// @match       https://wplace.live/*
// @grant       GM_addStyle
// @grant       unsafeWindow
// @version     0.0.1
// @author      jaz/jazdka
// @run-at document-start
// @license MIT
// ==/UserScript==

(() => {
  'use strict';

  const root = unsafeWindow || window;

  // --- persistent state (localStorage) ---
  const LS_ENABLED = 'wplace_darkmode_enabled';
  const LS_POS = 'wplace_darkmode_icon_pos';

  function getEnabled() {
    // default: enabled (same behavior as old script)
    const v = localStorage.getItem(LS_ENABLED);
    return v === null ? true : v === '1';
  }
  function setEnabled(val) {
    localStorage.setItem(LS_ENABLED, val ? '1' : '0');
  }

  function getSavedPos() {
    try {
      const raw = localStorage.getItem(LS_POS);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
    } catch {}
    return null;
  }
  function savePos(x, y) {
    localStorage.setItem(LS_POS, JSON.stringify({ x, y }));
  }

  let enabled = getEnabled();

  // Mark HTML so CSS can be turned on/off without removing injected styles
  function syncHtmlClass() {
    const el = document.documentElement;
    if (!el) return;
    el.classList.toggle('wplace-darkmode-enabled', !!enabled);
  }

  // Ensure class is applied early
  syncHtmlClass();
  // In case documentElement wasn't ready at document-start in some environments:
  if (!document.documentElement) {
    new MutationObserver(() => {
      if (document.documentElement) {
        syncHtmlClass();
      }
    }).observe(document, { childList: true, subtree: true });
  }

  // --- Fetch wrapper: only modifies map style when enabled ---
  const originalFetch = root.fetch.bind(root);

  root.fetch = async (req, options) => {
    const res = await originalFetch(req, options);

    // If disabled, behave exactly like the site (no JSON touching)
    if (!enabled) return res;

    // Only patch the style JSON we care about
    if (res.url !== 'https://maps.wplace.live/styles/liberty') return res;

    const json = await res.json();
    json.layers.forEach((layer) => {
      switch (layer.id) {
        case 'background':
          layer.paint['background-color'] = '#272e40';
          break;

        case 'water':
          layer.paint['fill-color'] = '#000d2a';
          break;

        case 'waterway_tunnel':
        case 'waterway_river':
        case 'waterway_other':
          layer.paint['line-color'] = '#000d2a';
          break;

        case 'natural_earth':
          layer.paint['raster-brightness-max'] = 0.4;
          break;

        case 'landcover_ice':
          layer.paint['fill-color'] = '#475677';
          break;

        case 'landcover_sand':
          layer.paint['fill-color'] = '#775f47';
          break;

        case 'park':
          layer.paint = {
            'fill-color': '#0e4957',
            'fill-opacity': 0.7,
          };
          break;

        case 'park_outline':
          layer.paint['line-opacity'] = 0;
          break;

        case 'landuse_pitch':
        case 'landuse_track':
        case 'landuse_school':
          layer.paint['fill-color'] = '#3e4966';
          break;

        case 'landuse_cemetery':
          layer.paint['fill-color'] = '#3b3b57';
          break;

        case 'landuse_hospital':
          layer.paint['fill-color'] = '#663e3e';
          break;

        case 'building':
          layer.paint['fill-color'] = '#1c3b69';
          break;

        case 'building_3d':
          layer.paint['fill-extrusion-color'] = '#1c3b69';
          break;

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

        case 'aeroway_fill':
          layer.paint['fill-color'] = '#2a486c';
          break;

        case 'aeroway_runway':
          layer.paint['line-color'] = '#253d61';
          break;

        case 'aeroway_taxiway':
          layer.paint['line-color'] = '#3d5b77';
          break;

        case 'boundary_3':
          layer.paint['line-color'] = '#707784';
          break;
      }
    });

    const text = JSON.stringify(json)
      .replaceAll('#e9ac77', '#476889') // road
      .replaceAll('#fc8', '#476889') // primary roads
      .replaceAll('#fea', '#3d5b77') // secondary roads
      .replaceAll('#cfcdca', '#3b4d65'); // casing

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

    /* transparent color selector (only in dark mode) */
    html.wplace-darkmode-enabled #color-0 {
      background-color: white !important;
    }

    /* toggle button */
    #wplace-darkmode-toggle {
      position: fixed;
      left: 16px;
      top: 120px;
      width: 42px;
      height: 42px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      z-index: 2147483647;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none; /* important for drag on touch devices */
      background: rgba(20, 24, 34, 0.85);
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      backdrop-filter: blur(6px);
    }
    #wplace-darkmode-toggle svg {
      width: 22px;
      height: 22px;
      opacity: 0.95;
      fill: white;
    }
    #wplace-darkmode-toggle.wplace-off {
      background: rgba(240, 240, 240, 0.85);
      border: 1px solid rgba(0,0,0,0.12);
    }
    #wplace-darkmode-toggle.wplace-off svg {
      fill: #111;
    }
  `);

  // --- UI: draggable icon; click toggles; drag doesn't ---
  function makeToggleButton() {
    if (document.getElementById('wplace-darkmode-toggle')) return;

    const btn = document.createElement('div');
    btn.id = 'wplace-darkmode-toggle';
    btn.title = 'Toggle Dark Mode (drag to move)';

    // Simple icon that looks fine in both states
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zM4.22 5.64a1 1 0 0 1 1.41 0l.71.71A1 1 0 0 1 4.93 7.77l-.71-.71a1 1 0 0 1 0-1.42zM17.66 19.07a1 1 0 0 1 1.41 0l.71.71a1 1 0 0 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41zM2 12a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1zm18 0a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1zM5.64 19.78a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41 0zM19.07 6.34a1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41 0zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/>
      </svg>
    `;

    function syncBtnState() {
      btn.classList.toggle('wplace-off', !enabled);
      btn.title = enabled ? 'Dark Mode: ON (click to turn OFF)' : 'Dark Mode: OFF (click to turn ON)';
    }
    syncBtnState();

    // Restore saved position
    const saved = getSavedPos();
    if (saved) {
      btn.style.left = `${saved.x}px`;
      btn.style.top = `${saved.y}px`;
    }

    let pointerId = null;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;
    let dragged = false;
    const DRAG_THRESHOLD = 6; // px

    function clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    btn.addEventListener('pointerdown', (e) => {
      // Prevent map from also handling the gesture
      e.preventDefault();
      e.stopPropagation();

      pointerId = e.pointerId;
      btn.setPointerCapture(pointerId);

      const rect = btn.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      dragged = false;
    }, { passive: false });

    btn.addEventListener('pointermove', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragged && Math.hypot(dx, dy) >= DRAG_THRESHOLD) dragged = true;

      if (dragged) {
        const maxX = window.innerWidth - btn.offsetWidth;
        const maxY = window.innerHeight - btn.offsetHeight;

        const nextLeft = clamp(startLeft + dx, 0, maxX);
        const nextTop = clamp(startTop + dy, 0, maxY);

        btn.style.left = `${nextLeft}px`;
        btn.style.top = `${nextTop}px`;
        savePos(nextLeft, nextTop);
      }
    });

    btn.addEventListener('pointerup', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;

      try { btn.releasePointerCapture(pointerId); } catch {}
      pointerId = null;

      // If it was a click (not a drag), toggle
      if (!dragged) {
        enabled = !enabled;
        setEnabled(enabled);
        syncHtmlClass();
        syncBtnState();

        // Reload so OFF is truly "as if extension/script wasn't on" (map style resets too)
        location.reload();
      }
    });

    // In case of cancellation
    btn.addEventListener('pointercancel', () => {
      pointerId = null;
    });

    document.documentElement.appendChild(btn);
  }

  // Add button as soon as we can
  function bootUI() {
    if (document.documentElement) makeToggleButton();
  }
  bootUI();
  new MutationObserver(() => bootUI()).observe(document, { childList: true, subtree: true });
})();
