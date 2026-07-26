/**
 * Panglima Gadget — bilingual runtime (Bahasa Malaysia default, English toggle).
 *
 * The site's markup stays in English; this layer swaps visible text at runtime
 * using a dictionary keyed by the exact English source string. That keeps a
 * single source of truth in the HTML and avoids sprinkling data-i18n across
 * ~80 elements (and re-doing it every time the copy changes).
 *
 * Dynamic sections (services, steps, reasons) are rendered by index.html's own
 * script after load, so translation is re-applied on demand via PG_I18N.apply().
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "pg_lang";
  var DEFAULT_LANG = "bm";

  var dict = Object.create(null); // english -> malay
  var lang = DEFAULT_LANG;
  var ready = false;
  var listeners = [];

  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "bm" || saved === "en") lang = saved;
  } catch (e) {}

  /* Translate a single English string. Returns input unchanged when the
     language is English or no translation exists — never throws. */
  function t(en) {
    if (lang !== "bm" || !en) return en;
    var key = String(en).replace(/\s+/g, " ").trim();
    var hit = dict[key];
    if (!hit) return en;
    // Preserve the original leading/trailing whitespace so inline layout holds.
    var lead = String(en).match(/^\s*/)[0];
    var tail = String(en).match(/\s*$/)[0];
    return lead + hit + tail;
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };

  /* Walk visible text nodes and swap them. Each node keeps its original English
     in a property so switching back to EN is lossless. */
  function translateTree(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = node.parentNode;
        if (!p || SKIP_TAGS[p.nodeName]) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest("[data-i18n-skip]")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    var node;
    while ((node = walker.nextNode())) {
      if (node.__pgEn === undefined) node.__pgEn = node.nodeValue;
      var out = lang === "bm" ? t(node.__pgEn) : node.__pgEn;
      if (node.nodeValue !== out) node.nodeValue = out;
    }
  }

  /* Attributes that are user-visible and worth translating. */
  var ATTRS = ["placeholder", "title", "aria-label", "alt"];
  function translateAttributes(root) {
    if (!root || !root.querySelectorAll) return;
    var els = root.querySelectorAll("[placeholder],[title],[aria-label],[alt]");
    for (var i = 0; i < els.length; i++) {
      for (var a = 0; a < ATTRS.length; a++) {
        var name = ATTRS[a];
        if (!els[i].hasAttribute(name)) continue;
        var store = "__pgAttr_" + name;
        if (els[i][store] === undefined) els[i][store] = els[i].getAttribute(name);
        var val = lang === "bm" ? t(els[i][store]) : els[i][store];
        if (els[i].getAttribute(name) !== val) els[i].setAttribute(name, val);
      }
    }
  }

  var observer = null;
  var applying = false;

  function apply(root) {
    if (!ready || applying) return;
    applying = true;
    if (observer) observer.disconnect();
    try {
      var target = root || document.body;
      translateTree(target);
      translateAttributes(target);
      document.documentElement.lang = lang === "bm" ? "ms" : "en";
    } finally {
      if (observer) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      applying = false;
    }
  }

  /* Several sections (services, steps, reasons) are rendered by the page's own
     script after load, and the open/closed badge rewrites itself every 30s.
     Rather than hooking each render site, watch for changes and re-translate.
     Safe against loops: the observer is detached while we write, and each text
     node caches its English original so re-running is idempotent. */
  function watch() {
    if (observer || typeof MutationObserver === "undefined") return;
    var pending = null;
    observer = new MutationObserver(function () {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = null;
        apply();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function setLang(next) {
    if (next !== "bm" && next !== "en") return;
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    apply();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](lang); } catch (e) {}
    }
    document.dispatchEvent(new CustomEvent("pg:langchange", { detail: { lang: lang } }));
  }

  function load(url) {
    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (json) {
        var pairs = (json && json.pairs) || [];
        for (var i = 0; i < pairs.length; i++) {
          var p = pairs[i];
          if (p && p.en && p.bm) dict[String(p.en).replace(/\s+/g, " ").trim()] = p.bm;
        }
        // Page-level metadata, translated separately from body text.
        if (json && json.meta && json.meta.bm) {
          dict["__title__"] = json.meta.bm.title || "";
          dict["__description__"] = json.meta.bm.description || "";
        }
        ready = true;
        apply();
        watch();
        /* Lets pages re-render JS-composed strings (e.g. the open/closed badge)
           that were built before the dictionary arrived. */
        document.dispatchEvent(new CustomEvent("pg:dictready", { detail: { lang: lang } }));
        return dict;
      })
      .catch(function () {
        // Dictionary unavailable → site simply stays in English. Never blocks render.
        ready = false;
      });
  }

  global.PG_I18N = {
    t: t,
    apply: apply,
    load: load,
    setLang: setLang,
    onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); },
    get lang() { return lang; },
    get ready() { return ready; },
  };
})(window);
