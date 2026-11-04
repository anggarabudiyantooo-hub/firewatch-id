'use strict';

// Progressive disclosure untuk dashboard clean UI.
// Tidak mengubah binding layer di app.js; hanya menyinkronkan tampilan kontrol.

(function () {
  function byId(id) { return document.getElementById(id); }

  function ensureBadge(row, text) {
    if (!row || row.querySelector('.layer-badge')) return;
    var badge = document.createElement('span');
    badge.className = 'layer-badge';
    badge.textContent = text;
    var info = row.querySelector('.ui-info-btn');
    row.insertBefore(badge, info || null);
  }

  function syncLayerUI() {
    var rows = document.querySelectorAll('[data-layer-row]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var input = byId(row.getAttribute('data-layer-row'));
      if (input) row.classList.toggle('is-active', !!input.checked);
    }

    var modeRow = document.querySelector('.layer-row.mode-row');
    var modeIds = ['lyPm25', 'lyAod', 'lyDust', 'lySmoke'];
    var modeOn = modeIds.some(function (id) { return byId(id) && byId(id).checked; });
    if (modeRow) {
      modeRow.classList.toggle('is-active', modeOn);
      ensureBadge(modeRow, byId('lySmoke') && byId('lySmoke').checked ? 'Indikatif' : 'Model');
    }
    ensureBadge(document.querySelector('[data-layer-row="lyWind"]'), 'Model');
    ensureBadge(document.querySelector('[data-layer-row="lyAir"]'), 'Model');
    ensureBadge(document.querySelector('[data-layer-row="lyAsh"]'), 'Indikatif');
    ensureBadge(document.querySelector('[data-layer-row="lyImpact"]'), 'Indikatif');

    var configs = document.querySelectorAll('[data-config-for]');
    for (var j = 0; j < configs.length; j++) {
      var cfg = configs[j];
      var owner = byId(cfg.getAttribute('data-config-for'));
      var active = !!(owner && owner.checked);
      cfg.hidden = !active;
      if (!active) cfg.open = false;
    }

    var groups = document.querySelectorAll('[data-layer-group]');
    for (var k = 0; k < groups.length; k++) {
      var group = groups[k];
      var count = group.querySelectorAll('input[type="checkbox"]:checked').length;
      var badge = group.querySelector('[data-layer-count]');
      if (badge) {
        badge.hidden = count === 0;
        badge.textContent = String(count);
      }
    }
    syncMapLegend();
  }

  function syncMapLegend() {
    var legend = byId('mapLegend');
    if (!legend) return;
    var ids = ['confSummary', 'airLegend', 'ashLegend', 'pm25Legend', 'himaInfo'];
    var any = false;
    for (var i = 0; i < ids.length; i++) {
      var node = byId(ids[i]);
      if (node && !node.hidden && (node.innerHTML || '').trim()) any = true;
    }
    legend.hidden = !any;
    if (any && !legend.hasAttribute('data-user-toggled')) legend.open = true;

    var badge = byId('mapLegendBadge');
    if (badge) {
      var cams = ['lyPm25', 'lyAod', 'lyDust'].some(function (id) { return byId(id) && byId(id).checked; });
      var plume = byId('lySmoke') && byId('lySmoke').checked;
      badge.hidden = !(cams || plume);
      badge.textContent = plume && !cams ? 'Indikatif' : 'Model';
    }
  }

  function watchLegend() {
    var ids = ['confSummary', 'airLegend', 'ashLegend', 'pm25Legend', 'himaInfo'];
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(syncMapLegend);
    ids.forEach(function (id) {
      var node = byId(id);
      if (node) observer.observe(node, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true, characterData: true });
    });
    var legend = byId('mapLegend');
    if (legend) {
      legend.addEventListener('toggle', function () {
        legend.setAttribute('data-user-toggled', '1');
      });
    }
  }

  document.addEventListener('change', function (event) {
    var target = event.target;
    if (!target) return;
    if (target.closest && target.closest('#layerPanel')) syncLayerUI();
  });
  window.addEventListener('siaga:languagechange', syncLayerUI);
  window.addEventListener('resize', syncMapLegend);


  function setupDrawer() {
    var btn = byId('layerDrawerBtn');
    var closeBtn = byId('inspectorClose');
    var inspector = byId('inspector');
    if (!btn || !inspector) return;
    function isMobile() { return window.matchMedia('(max-width: 768px)').matches; }
    function setOpen(open) {
      document.body.classList.toggle('layer-drawer-open', open);
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        var layerTab = byId('t-lapisan');
        if (layerTab) layerTab.click();
        var focusable = inspector.querySelector('button, input, select, [tabindex]');
        if (focusable) focusable.focus();
      }
    }
    btn.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('layer-drawer-open'));
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && document.body.classList.contains('layer-drawer-open')) setOpen(false);
    });
    document.addEventListener('pointerdown', function (event) {
      if (!isMobile() || !document.body.classList.contains('layer-drawer-open')) return;
      if (inspector.contains(event.target) || btn.contains(event.target)) return;
      setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (!isMobile()) setOpen(false);
    });
  }

  function openDockTab(id) {
    var tab = byId(id);
    if (!tab) return;
    tab.click();
    tab.scrollIntoView({ block: 'nearest' });
  }

  function setupShortcuts() {
    document.addEventListener('keydown', function (event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      var key = event.key;
      if (key === 'F1') { event.preventDefault(); var map = byId('mapCard'); if (map) map.scrollIntoView({ block: 'start' }); }
      else if (key === 'F2') { event.preventDefault(); openDockTab('dt-kejadian'); }
      else if (key === 'F3' || key === 'F4') { event.preventDefault(); openDockTab('dt-bahaya'); }
      else if (key === 'F5') { event.preventDefault(); openDockTab('dt-berita'); }
      else if (key === 'F6') { event.preventDefault(); openDockTab('dt-sumber'); }
      else if (key === 'F7') { if (!event.defaultPrevented) { var fab = byId('aiFab'); if (fab) fab.click(); } }
      else if (key === 'F8') { event.preventDefault(); openDockTab('dt-sumber'); var status = byId('statusBody'); if (status) status.scrollIntoView({ block: 'nearest' }); }
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function skeletonizeNode(node) {
    if (!node || node.nodeType !== 1) return;
    var targets = [];
    if (node.matches && node.matches('.empty, .kpi-sub')) targets.push(node);
    if (node.querySelectorAll) {
      var found = node.querySelectorAll('.empty, .kpi-sub');
      for (var i = 0; i < found.length; i++) targets.push(found[i]);
    }
    for (var j = 0; j < targets.length; j++) {
      var el = targets[j];
      var text = (el.textContent || '').trim();
      if (/^(memuat|menunggu)/i.test(text) && !el.querySelector('.skeleton')) {
        el.innerHTML = '<span class="skeleton" aria-hidden="true"></span><span class="sr-only">' + escapeHtml(text) + '</span>';
      }
    }
  }

  function setupSkeletons() {
    skeletonizeNode(document.body);
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (record.type === 'childList') {
          for (var j = 0; j < record.addedNodes.length; j++) skeletonizeNode(record.addedNodes[j]);
        } else if (record.type === 'characterData') {
          skeletonizeNode(record.target.parentElement);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function boot() {
    syncLayerUI();
    watchLegend();
    setupDrawer();
    setupShortcuts();
    setupSkeletons();
    if (window.matchMedia('(min-width: 769px)').matches) {
      var layerTab = byId('t-lapisan');
      if (layerTab) layerTab.click();
    }
    setTimeout(syncLayerUI, 400);
    setTimeout(syncLayerUI, 1600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.DashboardClean = { sync: syncLayerUI, syncLegend: syncMapLegend, skeletonize: skeletonizeNode };
})();
