// Inline editor for static text on the SPARKS site.
//
// Any element tagged with `data-text="<key>"` can be edited in place when the
// site is in edit mode. To enter edit mode, visit any page with `?edit=1` in
// the URL (e.g. /index.html?edit=1). The flag sticks for the rest of the
// browser session, so you can navigate between pages while editing. Click the
// floating "Done editing" button (bottom-right) to exit.
//
// Overrides are saved to localStorage (key: `spark_text_custom`) so they
// persist across visits *on this browser*. A real deployment with a backend
// would push edits to a shared store so every visitor sees them.
(function () {
  const LS_OVERRIDES = "spark_text_custom";
  const SS_EDIT      = "spark_edit_mode";

  // Read the URL flag once. ?edit=1 turns edit mode on, ?edit=0 turns it off.
  const params = new URLSearchParams(location.search);
  const flag = params.get("edit");
  if (flag === "1") sessionStorage.setItem(SS_EDIT, "1");
  if (flag === "0") sessionStorage.removeItem(SS_EDIT);

  function isEditMode() { return sessionStorage.getItem(SS_EDIT) === "1"; }

  function read() {
    try { return JSON.parse(localStorage.getItem(LS_OVERRIDES) || "{}"); }
    catch { return {}; }
  }
  function write(obj) { localStorage.setItem(LS_OVERRIDES, JSON.stringify(obj)); }

  function get(key)         { return read()[key]; }
  function setKey(key, val) { const d = read(); d[key] = val; write(d); }
  function removeKey(key)   { const d = read(); if (key in d) { delete d[key]; write(d); } }

  // Stamp each tagged element with its default text + HTML (once) and overlay
  // any saved override. We preserve the original innerHTML when no override
  // is set, so inline formatting like <strong> inside tagged paragraphs
  // survives page loads untouched.
  function apply() {
    const data = read();
    document.querySelectorAll("[data-text]").forEach(el => {
      if (!el.dataset.textDefault) {
        el.dataset.textDefault = el.textContent;
        el.dataset.textDefaultHtml = el.innerHTML;
      }
      const override = data[el.dataset.text];
      if (override != null) {
        el.textContent = override;
      } else {
        el.innerHTML = el.dataset.textDefaultHtml;
      }
    });
  }

  function onFocus(e) {
    // Select all text on focus so a keystroke replaces it.
    const el = e.currentTarget;
    requestAnimationFrame(() => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }
  function onBlur(e) {
    const el = e.currentTarget;
    const val = el.textContent.replace(/\s+/g, " ").trim();
    const def = (el.dataset.textDefault || "").trim();
    if (val === "" || val === def) {
      removeKey(el.dataset.text);
      // Restore original HTML (preserves any inline <strong>, <em>, etc.)
      el.innerHTML = el.dataset.textDefaultHtml || def;
    } else {
      setKey(el.dataset.text, val);
      el.textContent = val;
    }
  }
  function onKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      const el = e.currentTarget;
      const saved = get(el.dataset.text);
      if (saved != null) el.textContent = saved;
      else el.innerHTML = el.dataset.textDefaultHtml || el.dataset.textDefault || "";
      el.blur();
    }
  }

  function setupEditor() {
    const active = isEditMode();
    document.querySelectorAll("[data-text]").forEach(el => {
      if (active) {
        el.setAttribute("contenteditable", "plaintext-only");
        el.setAttribute("spellcheck", "true");
        el.setAttribute("title", "Click to edit — press Enter to save, Esc to cancel");
        el.classList.add("spark-text-editable");
        if (!el._sparkBound) {
          el.addEventListener("focus", onFocus);
          el.addEventListener("blur", onBlur);
          el.addEventListener("keydown", onKey);
          el._sparkBound = true;
        }
      } else {
        el.removeAttribute("contenteditable");
        el.removeAttribute("spellcheck");
        el.removeAttribute("title");
        el.classList.remove("spark-text-editable");
      }
    });
    // Floating "Done editing" pill, only while edit mode is on.
    let toggle = document.getElementById("spark-edit-toggle");
    if (active) {
      if (!toggle) {
        toggle = document.createElement("button");
        toggle.id = "spark-edit-toggle";
        toggle.type = "button";
        toggle.textContent = "Done editing";
        toggle.addEventListener("click", () => {
          sessionStorage.removeItem(SS_EDIT);
          // Clear the ?edit=1 from the URL without triggering a reload.
          const u = new URL(location.href);
          u.searchParams.delete("edit");
          history.replaceState({}, "", u.toString());
          setupEditor();
        });
        document.body.appendChild(toggle);
      }
    } else if (toggle) {
      toggle.remove();
    }
  }

  document.addEventListener("DOMContentLoaded", () => { apply(); setupEditor(); });

  // Expose a small API in case future features want to read/clear overrides.
  window.SparkText = { get, set: setKey, remove: removeKey, reset: () => { localStorage.removeItem(LS_OVERRIDES); apply(); } };
})();
