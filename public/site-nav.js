(function (window, document) {
  'use strict';
  if (!window || !document) return;

  function language() {
    return window.SiagaI18n && window.SiagaI18n.getLanguage
      ? window.SiagaI18n.getLanguage() : (document.documentElement.lang === 'en' ? 'en' : 'id');
  }

  function applyCopy() {
    var lang = language();
    var key = lang === 'en' ? 'data-site-en' : 'data-site-id';
    document.querySelectorAll('[data-site-id][data-site-en]').forEach(function (node) {
      node.textContent = node.getAttribute(key) || '';
    });
    document.querySelectorAll('[data-site-aria-id][data-site-aria-en]').forEach(function (node) {
      node.setAttribute('aria-label', node.getAttribute(lang === 'en' ? 'data-site-aria-en' : 'data-site-aria-id'));
    });
    var root = document.documentElement;
    var title = root.getAttribute(lang === 'en' ? 'data-site-title-en' : 'data-site-title-id');
    var description = root.getAttribute(lang === 'en' ? 'data-site-description-en' : 'data-site-description-id');
    if (title) document.title = title;
    var meta = document.querySelector('meta[name="description"]');
    if (description && meta) meta.setAttribute('content', description);
  }

  function setMenu(open) {
    var button = document.getElementById('siteNavToggle');
    var nav = document.getElementById('siteNav');
    if (!button || !nav) return;
    button.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  }

  var toggle = document.getElementById('siteNavToggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('click', function (event) {
      var nav = document.getElementById('siteNav');
      if (nav && !nav.contains(event.target) && !toggle.contains(event.target)) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        setMenu(false);
        toggle.focus();
      }
    });
    document.querySelectorAll('#siteNav a').forEach(function (link) {
      link.addEventListener('click', function () { setMenu(false); });
    });
  }

  applyCopy();
  window.addEventListener('siaga:languagechange', applyCopy);
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
