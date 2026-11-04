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

  function boot() {
    syncLayerUI();
    watchLegend();
    setTimeout(syncLayerUI, 400);
    setTimeout(syncLayerUI, 1600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.DashboardClean = { sync: syncLayerUI, syncLegend: syncMapLegend };
})();
