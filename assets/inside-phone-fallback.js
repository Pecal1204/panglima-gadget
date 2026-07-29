/* =============================================================================
   INSIDE YOUR SMARTPHONE — content + fallback layer  (classic script, no build)
   -----------------------------------------------------------------------------
   Builds every piece of DOM text from PG_INSIDE_DATA so that:
     • the interactive card, keyboard picker and overview labels are ready for
       the 3D module to drive, and
     • a fully accessible card grid exists even when WebGL / ES-modules / the CDN
       are unavailable (no-WebGL, reduced-motion, or very old browsers).
   Exposes a small API on window.PG_INSIDE used by assets/inside-phone.js.
   ========================================================================== */
(function (win, doc) {
  "use strict";

  var DATA = win.PG_INSIDE_DATA;
  if (!DATA) return;
  var C = DATA.config, CARDS = DATA.cards, TOUR = DATA.tour;

  function $(id) { return doc.getElementById(id); }
  function el(tag, cls, html) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function waLink(msg) {
    return "https://api.whatsapp.com/send?phone=" + C.whatsappNumber +
           "&text=" + encodeURIComponent(msg);
  }
  function partLink(name) {
    return waLink(C.messages.part.replace("{part}", name));
  }

  var WARN_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  /* Build the inner HTML shared by the interactive card and the fallback cards.
     opts.collapsible tucks causes/repair behind a "More details" expander so
     the mobile bottom sheet stays compact; safety warnings are never hidden. */
  function cardBody(card, index, opts) {
    opts = opts || {};
    var total = TOUR.length;
    var idxLabel = index != null ? (pad(index + 1) + " / " + pad(total)) : "";
    var warn = card.warning
      ? '<div class="ip-warn">' + WARN_ICON + "<span><strong>Safety:</strong> " + esc(card.warning) + "</span></div>"
      : "";
    var nameId = opts.nameId ? ' id="' + opts.nameId + '"' : "";
    var core = row("Function", card.function) + row("Common problems", card.symptoms);
    var extra = row("Typical causes", card.causes) + row("Recommended repair", card.repair);
    var body = opts.collapsible
      ? "<dl>" + core + "</dl>" +
        '<details class="ip-more"><summary>More details</summary><dl>' + extra + "</dl></details>"
      : "<dl>" + core + extra + "</dl>";
    return (
      '<div class="ip-card-index"><span>' + (index != null ? "Component " + idxLabel : "&nbsp;") +
        '</span><span class="tag">' + esc(card.tag) + "</span></div>" +
      "<h3" + nameId + ">" + esc(card.name) + "</h3>" +
      (card.spec ? '<p class="ip-card-spec">' + esc(card.spec) + "</p>" : "") +
      cardNav(index, total, opts) +
      body +
      warn +
      '<a class="ip-card-cta" href="' + partLink(card.name) + '" target="_blank" rel="noopener">' +
        esc(C.copy.cardCta) +
        ' <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
      "</a>"
    );
  }

  /* Step through the teardown one component at a time. Replaces an earlier
     floating chevron that sat on top of the component tag. On the mobile
     bottom sheet a middle button expands the sheet; on desktop the card is
     always open, so only the arrows are shown. */
  var CHEV_L = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  var CHEV_U = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';

  function cardNav(index, total, opts) {
    if (index == null) return "";
    var atFirst = index <= 0;
    var atLast = index >= total - 1;
    var prevName = atFirst ? "" : (CARDS[TOUR[index - 1]] || {}).name || "";
    var nextName = atLast ? "" : (CARDS[TOUR[index + 1]] || {}).name || "";

    var expand = opts.collapsible
      ? '<button type="button" class="ip-navbtn ip-navbtn-expand" data-ip-card-toggle ' +
        'aria-label="Show component details" aria-expanded="false">' + CHEV_U +
        '<span class="ip-navbtn-label">Details</span></button>'
      : "";

    return (
      '<div class="ip-cardnav" role="group" aria-label="Move between components">' +
        '<button type="button" class="ip-navbtn" data-ip-nav="-1"' +
          (atFirst ? " disabled" : "") +
          ' aria-label="' + (atFirst ? "No previous component" : "Previous component: " + esc(prevName)) + '"' +
          (prevName ? ' title="' + esc(prevName) + '"' : "") + ">" +
          CHEV_L + '<span class="ip-navbtn-label">Prev</span>' +
        "</button>" +
        expand +
        '<button type="button" class="ip-navbtn" data-ip-nav="1"' +
          (atLast ? " disabled" : "") +
          ' aria-label="' + (atLast ? "No next component" : "Next component: " + esc(nextName)) + '"' +
          (nextName ? ' title="' + esc(nextName) + '"' : "") + ">" +
          '<span class="ip-navbtn-label">Next</span>' + CHEV_R +
        "</button>" +
      "</div>"
    );
  }
  function row(label, value) {
    return '<div class="row"><dt>' + esc(label) + "</dt><dd>" + esc(value) + "</dd></div>";
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  /* ------------------------------------------------------------------ build */
  var built = false;
  var api = {
    data: DATA,
    waLink: waLink,
    partLink: partLink,
    build: build,          // idempotent; safe to call any time after the shell is parsed
    els: {},
    activeIndex: -1
  };

  function build() {
    if (built) return;
    var section = $("inside-phone");
    if (!section) return;
    built = true;

    var e = api.els;
    e.section    = section;
    e.scroller   = $("ip-scroller");
    e.stage      = $("ip-stage");
    e.canvasWrap = $("ip-canvas-wrap");
    e.lines      = $("ip-lines");
    e.intro      = $("ip-intro");
    e.deviceTag  = $("ip-device-tag");
    e.hud        = $("ip-hud");
    e.bar        = $("ip-bar");
    e.phase      = $("ip-phase");
    e.card       = $("ip-card");
    e.labels     = $("ip-labels");
    e.picker     = $("ip-picker");
    e.loading    = $("ip-loading");
    e.fallback   = $("ip-fallback");
    e.fbGrid     = $("ip-fb-grid");

    /* Wire ALL section copy from the data file so it is the single source of
       truth for text (the HTML carries the same strings as a no-JS default). */
    function setText(sel, value) {
      var n = section.querySelector(sel);
      if (n && value != null) n.textContent = value;
    }
    function setIconButtonText(node, value) {
      // buttons/links whose first child is an <svg> icon followed by a text node
      if (!node || value == null) return;
      var last = node.lastChild;
      if (last && last.nodeType === 3) last.nodeValue = " " + value;
      else node.appendChild(doc.createTextNode(" " + value));
    }
    setText(".ip-intro .ip-eyebrow", C.copy.eyebrow);
    setText("#ip-title", C.copy.openingTitle);

    setText(".ip-hint span:last-child", C.copy.scrollHint);
    setText(".ip-device-tag .n", C.copy.deviceName);
    setText(".ip-device-tag .t", C.copy.deviceTag);
    setText(".ip-loading .lt", C.copy.loading);
    setText(".ip-skip", C.copy.skip);
    setText(".ip-fallback .ip-eyebrow", C.copy.eyebrow);
    setText(".ip-final h2", C.copy.finalTitle);
    setText(".ip-final > p", C.copy.finalDesc);
    setText(".ip-trust", C.copy.trust);
    setText(".ip-seo", C.seo);
    setIconButtonText($("ip-reassemble"), C.copy.reassemble);
    setIconButtonText($("ip-viewall"), C.copy.viewAll);

    var primary = $("ip-cta-primary");
    if (primary) {
      primary.textContent = C.copy.finalPrimary;
      primary.setAttribute("href", C.diagnosisLink || waLink(C.messages.diagnosis));
      if (!C.diagnosisLink) { primary.target = "_blank"; primary.rel = "noopener"; }
    }
    var wa = $("ip-cta-wa");
    if (wa) {
      setIconButtonText(wa, C.copy.finalSecondary);
      wa.setAttribute("href", waLink(C.messages.general));
      wa.target = "_blank"; wa.rel = "noopener";
    }

    /* Keyboard component picker (also usable on desktop). */
    if (e.picker) {
      e.picker.appendChild(el("div", "lbl", "Inspect a part"));
      TOUR.forEach(function (id, i) {
        var b = el("button", null, esc(CARDS[id].name));
        b.type = "button";
        b.setAttribute("data-idx", i);
        b.addEventListener("click", function () {
          if (api.onPick) api.onPick(i);
        });
        e.picker.appendChild(b);
      });
    }

    /* Overview label chips (positioned each frame by the 3D module). */
    if (e.labels) {
      TOUR.forEach(function (id, i) {
        var c = el("div", "chip", esc(CARDS[id].name));
        c.setAttribute("data-idx", i);
        e.labels.appendChild(c);
      });
    }

    /* Peek/expand behaviour for the mobile bottom sheet: one delegated
       listener on the persistent card element (setActive swaps innerHTML). */
    if (e.card) {
      e.card.addEventListener("click", function (ev) {
        if (!ev.target.closest) return;

        /* Prev/next: step the tour. Must run before the tap-to-expand rule
           below, otherwise arrowing on the peek sheet would also open it. */
        var nav = ev.target.closest("[data-ip-nav]");
        if (nav) {
          ev.stopPropagation();
          if (nav.disabled) return;
          api.step(parseInt(nav.getAttribute("data-ip-nav"), 10) || 0);
          return;
        }

        var t = ev.target.closest("[data-ip-card-toggle]");
        if (t) { ev.stopPropagation(); api.setPeek(!e.card.classList.contains("is-peek")); return; }
        if (ev.target.closest("a,details,summary")) return;
        if (e.card.classList.contains("is-peek")) api.setPeek(false);
      });
    }

    /* Accessible fallback grid (all components as text). */
    if (e.fbGrid) {
      TOUR.forEach(function (id, i) {
        var card = CARDS[id];
        var c = el("div", "ip-fb-card");
        c.innerHTML = cardBody(card, i, {});
        e.fbGrid.appendChild(c);
      });
    }
  }

  /* ---------------------------------------------------------- card control */
  api.setPeek = function (peek) {
    var el = api.els.card;
    if (!el) return;
    el.classList.toggle("is-peek", !!peek);
    var t = el.querySelector("[data-ip-card-toggle]");
    if (t) {
      t.setAttribute("aria-expanded", String(!peek));
      t.setAttribute("aria-label", peek ? "Show component details" : "Hide component details");
      var lbl = t.querySelector(".ip-navbtn-label");
      if (lbl) lbl.textContent = peek ? "Details" : "Close";
    }
  };

  /* Move one component along the tour.
     onPick() smooth-scrolls, and the rendered index only catches up as that
     animation progresses — so reading the card's current index would make a
     second click recompute the same target and appear to do nothing. Track the
     intended destination instead, so repeated clicks queue up correctly. The
     target is dropped once it arrives, or shortly after the last click, so a
     manual scroll doesn't leave the stepper anchored to a stale position. */
  api.navTarget = null;
  var navTargetTimer = null;
  api.step = function (dir) {
    var jump = api.goTo || api.onPick;
    if (!dir || !jump) return;
    var base = api.navTarget;
    if (base == null) {
      base = parseInt((api.els.card && api.els.card.getAttribute("data-index")) || "", 10);
      if (isNaN(base)) base = api.activeIndex;
    }
    if (base == null || base < 0) return;
    var next = base + dir;
    if (next < 0 || next >= TOUR.length) return;
    api.navTarget = next;
    if (navTargetTimer) win.clearTimeout(navTargetTimer);
    navTargetTimer = win.setTimeout(function () { api.navTarget = null; }, 1200);
    jump(next);
  };

  api.setActive = function (index) {
    if (!api.els.card) return;
    if (index === api.navTarget) api.navTarget = null;   /* arrived */
    if (index === api.activeIndex) return;
    api.activeIndex = index;
    var id = TOUR[index];
    var card = CARDS[id];
    if (!card) return;
    var compact = win.matchMedia("(max-width: 820px)").matches;
    api.els.card.innerHTML = cardBody(card, index, { nameId: "ip-card-name", collapsible: compact });
    /* The stepper reads this rather than api.activeIndex: the card keeps
       showing the last component after the scroll leaves the tour range, at
       which point activeIndex is already -1 and prev/next would misfire. */
    api.els.card.setAttribute("data-index", String(index));
    api.els.card.classList.add("is-active");
    api.els.card.scrollTop = 0;
    /* each new component starts as a name-only peek on mobile */
    api.setPeek(compact);
  };
  api.clearActive = function () {
    api.activeIndex = -1;
    if (api.els.card) api.els.card.classList.remove("is-active");
  };

  /* ------------------------------------------------- static / fallback mode */
  api.renderFallback = function (reason) {
    build();
    var s = api.els.section;
    if (!s) return;
    s.classList.add("ip-static");
    if (api.els.fallback) api.els.fallback.hidden = false;
    if (api.els.loading) api.els.loading.classList.add("is-hidden");
    if (reason) s.setAttribute("data-ip-mode", reason);
  };

  win.PG_INSIDE = api;

  /* Build DOM as soon as it is available (interactive parts stay hidden until
     the module drives them; fallback grid stays hidden unless .ip-static). */
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})(window, document);
