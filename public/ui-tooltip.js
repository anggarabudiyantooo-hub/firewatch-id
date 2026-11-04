'use strict';

// Komponen tooltip ringan untuk kontrol dashboard.
// Trigger memakai data-tooltip-target="id-sumber-tersembunyi".
// Mendukung hover 400 ms, fokus keyboard, klik ikon info, dan long-press 500 ms.

(function () {
  var HOVER_DELAY = 400;
  var LONG_PRESS_DELAY = 500;
  var EDGE = 8;
  var MAX_WIDTH = 280;

  var tip = null;
  var activeTrigger = null;
  var pinned = false;
  var hoverTimer = null;
  var pressTimer = null;
  var pressStart = null;
  var suppressClickUntil = 0;

  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'ui-tooltip-active';
    tip.className = 'ui-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }

  // Hanya tag presentasi ringan yang diizinkan. Semua atribut dibuang kecuali
  // href pada tautan http(s)/relatif, sehingga markup sumber tidak pernah
  // ditafsirkan sebagai HTML aktif di dalam tooltip.
  var ALLOWED_TAGS = ['B', 'STRONG', 'I', 'EM', 'BR', 'SPAN', 'SMALL', 'CODE', 'A'];
  var DROP_TAGS = ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'SVG', 'MATH', 'TEMPLATE'];

  function safeHref(value) {
    var href = String(value || '').trim();
    if (!href) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      return /^https?:$/i.test(href.split(':')[0]) ? href : null;
    }
    if (href.indexOf('//') === 0) return null;
    return href;
  }

  // Menyalin isi sumber menjadi simpul DOM baru. Teks selalu masuk lewat
  // createTextNode, jadi metakarakter tidak ditafsirkan sebagai markup.
  function buildContent(sourceNode) {
    var fragment = document.createDocumentFragment();
    if (!sourceNode) return fragment;
    var walk = function (from, to) {
      for (var i = 0; i < from.childNodes.length; i++) {
        var node = from.childNodes[i];
        if (node.nodeType === 3) {
          to.appendChild(document.createTextNode(node.nodeValue));
          continue;
        }
        if (node.nodeType !== 1) continue;
        var tag = node.tagName.toUpperCase();
        if (DROP_TAGS.indexOf(tag) >= 0) continue;
        if (ALLOWED_TAGS.indexOf(tag) < 0) {
          walk(node, to);
          continue;
        }
        var clean = document.createElement(tag.toLowerCase());
        if (tag === 'A') {
          var href = safeHref(node.getAttribute('href'));
          if (href) {
            clean.setAttribute('href', href);
            clean.setAttribute('rel', 'noopener noreferrer');
            clean.setAttribute('target', '_blank');
          }
        }
        walk(node, clean);
        to.appendChild(clean);
      }
    };
    walk(sourceNode, fragment);
    return fragment;
  }

  function renderInto(trigger) {
    while (tip.firstChild) tip.removeChild(tip.firstChild);
    var id = trigger.getAttribute('data-tooltip-target');
    var source = id ? document.getElementById(id) : null;
    if (source) {
      tip.appendChild(buildContent(source));
      return true;
    }
    var text = trigger.getAttribute('data-tooltip-text');
    if (!text) return false;
    tip.appendChild(document.createTextNode(text));
    return true;
  }

  function clearTimers() {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    pressStart = null;
  }

  function position() {
    if (!tip || tip.hidden || !activeTrigger) return;
    var rect = activeTrigger.getBoundingClientRect();
    tip.style.maxWidth = MAX_WIDTH + 'px';
    tip.style.left = '0px';
    tip.style.top = '0px';
    var size = tip.getBoundingClientRect();
    var left = rect.left + rect.width / 2 - size.width / 2;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - size.width - EDGE));
    var top = rect.top - size.height - 8;
    if (top < EDGE) top = rect.bottom + 8;
    top = Math.max(EDGE, Math.min(top, window.innerHeight - size.height - EDGE));
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }

  function open(trigger, pin) {
    ensureTip();
    if (!renderInto(trigger)) return;
    if (activeTrigger && activeTrigger !== trigger) {
      activeTrigger.removeAttribute('aria-describedby');
    }
    activeTrigger = trigger;
    pinned = !!pin;
    tip.hidden = false;
    trigger.setAttribute('aria-describedby', tip.id);
    position();
  }

  function close() {
    clearTimers();
    if (activeTrigger) activeTrigger.removeAttribute('aria-describedby');
    activeTrigger = null;
    pinned = false;
    if (tip) {
      tip.hidden = true;
      while (tip.firstChild) tip.removeChild(tip.firstChild);
    }
  }

  function isInfoButton(trigger) {
    return trigger.classList && trigger.classList.contains('ui-info-btn');
  }

  function bind(trigger) {
    if (trigger.__uiTooltipBound) return;
    trigger.__uiTooltipBound = true;

    trigger.addEventListener('mouseenter', function () {
      if (pinned) return;
      clearTimers();
      hoverTimer = setTimeout(function () { open(trigger, false); }, HOVER_DELAY);
    });
    trigger.addEventListener('mouseleave', function () {
      if (pinned) return;
      clearTimers();
      if (activeTrigger === trigger) close();
    });
    trigger.addEventListener('focusin', function () {
      open(trigger, false);
    });
    trigger.addEventListener('focusout', function (event) {
      if (pinned) return;
      if (trigger.contains(event.relatedTarget)) return;
      if (activeTrigger === trigger) close();
    });
    trigger.addEventListener('click', function (event) {
      if (!isInfoButton(trigger)) return;
      event.preventDefault();
      event.stopPropagation();
      if (activeTrigger === trigger && pinned && tip && !tip.hidden) close();
      else open(trigger, true);
    });

    trigger.addEventListener('touchstart', function (event) {
      if (!event.touches || event.touches.length !== 1) return;
      var touch = event.touches[0];
      pressStart = { x: touch.clientX, y: touch.clientY };
      clearTimers();
      pressTimer = setTimeout(function () {
        open(trigger, true);
        suppressClickUntil = Date.now() + 700;
      }, LONG_PRESS_DELAY);
    }, { passive: true });
    trigger.addEventListener('touchmove', function (event) {
      if (!pressStart || !event.touches || !event.touches.length) return;
      var touch = event.touches[0];
      if (Math.abs(touch.clientX - pressStart.x) > 10 || Math.abs(touch.clientY - pressStart.y) > 10) {
        clearTimers();
      }
    }, { passive: true });
    trigger.addEventListener('touchend', function (event) {
      if (pressTimer) clearTimers();
      if (Date.now() < suppressClickUntil) {
        event.preventDefault();
      }
    }, { passive: false });
    trigger.addEventListener('touchcancel', function () { clearTimers(); }, { passive: true });
  }

  function refresh() {
    var nodes = document.querySelectorAll('[data-tooltip-target], [data-tooltip-text]');
    for (var i = 0; i < nodes.length; i++) bind(nodes[i]);
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') close();
  });
  document.addEventListener('pointerdown', function (event) {
    if (!pinned || !tip || tip.hidden) return;
    if (tip.contains(event.target)) return;
    if (activeTrigger && activeTrigger.contains(event.target)) return;
    close();
  });
  document.addEventListener('click', function (event) {
    if (Date.now() < suppressClickUntil && activeTrigger && activeTrigger.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  window.addEventListener('siaga:languagechange', function () {
    if (activeTrigger && tip && !tip.hidden) {
      renderInto(activeTrigger);
      position();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }

  window.UiTooltip = { refresh: refresh, close: close, open: open };
})();
