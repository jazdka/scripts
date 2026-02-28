// ==UserScript==
// @name         Template Library Loader — RESET
// @namespace    local-bm-template-library-reset
// @version      0.3.2
// @author       jaz / jazdka
// @description  One-click reset for Template Library Loader panel position. Run this from the Tampermonkey menu on wplace.live, then disable/delete it afterwards.
// @match        https://wplace.live/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  "use strict";

  const UI_KEY = "bm_template_library_ui_v2";

  const DEFAULT_UI = {
    minimized: false,
    panel: { right: 10, top: 110 },
    icon:  { right: 10, top: 110 },
  };

  GM_registerMenuCommand("🔧 Reset Template Library panel position NOW", () => {
    GM_setValue(UI_KEY, JSON.stringify(DEFAULT_UI));

    // Also try to move it live if it's already in the DOM
    const panel = document.querySelector("#bm-lib");
    const icon  = document.querySelector("#bm-lib-icon");

    if (panel) {
      panel.style.left    = "auto";
      panel.style.bottom  = "auto";
      panel.style.right   = `${DEFAULT_UI.panel.right}px`;
      panel.style.top     = `${DEFAULT_UI.panel.top}px`;
      panel.style.display = "";
    }
    if (icon) {
      icon.style.display = "none";
    }

    alert(
      panel
        ? "✅ Panel moved to top-right corner!"
        : "✅ Position reset in storage!\n\nReload the page (F5) and the panel will appear in the top-right corner."
    );
  });

  GM_registerMenuCommand("🗑️ DELETE all Template Library position data + reload", () => {
    if (!confirm(
      "This will clear the saved panel position and reload the page.\n\n" +
      "Your TEMPLATES will NOT be deleted.\n\nContinue?"
    )) return;

    GM_deleteValue(UI_KEY);
    location.reload();
  });
})();
