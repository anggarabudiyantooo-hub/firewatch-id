'use strict';

/**
 * Antarmuka "Tangkap peta": pratinjau, narasi AI multimodal, unduh PNG,
 * dan kirim ke halaman Laporan. Semua angka pada metadata berasal dari
 * SiagaMapContext, bukan dari model.
 */
(function (window, document) {
  if (!window || !document) return;

  var STORAGE_KEY = 'siaga.mapCapture.v1';
  var last = null;

  function english() {
    return !!(window.SiagaI18n && window.SiagaI18n.getLanguage() === 'en');
  }
  function t(id, en) { return english() ? en : id; }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function ensureDialog() {
    var dialog = document.getElementById('mapCaptureDialog');
    if (dialog) return dialog;
    dialog = el('div', 'map-capture-dialog');
    dialog.id = 'mapCaptureDialog';
    dialog.hidden = true;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'mapCaptureTitle');

    var panel = el('div', 'map-capture-panel');
    var head = el('div', 'map-capture-head');
    var title = el('h2', 'map-capture-title', t('Tangkapan peta', 'Map snapshot'));
    title.id = 'mapCaptureTitle';
    var close = el('button', 'map-capture-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', t('Tutup', 'Close'));
    close.addEventListener('click', hide);
    head.appendChild(title);
    head.appendChild(close);

    var status = el('p', 'map-capture-status');
    status.id = 'mapCaptureStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    var figure = el('figure', 'map-capture-figure');
    var img = el('img', 'map-capture-img');
    img.id = 'mapCaptureImg';
    img.alt = t('Pratinjau tangkapan peta', 'Map snapshot preview');
    figure.appendChild(img);

    var metaBox = el('dl', 'map-capture-meta');
    metaBox.id = 'mapCaptureMeta';

    var narrative = el('div', 'map-capture-narrative');
    narrative.id = 'mapCaptureNarrative';
    narrative.hidden = true;

    var actions = el('div', 'map-capture-actions');
    var btnNarrate = el('button', 'map-capture-btn-primary', t('Narasi AI dari gambar', 'AI narrative from image'));
    btnNarrate.type = 'button';
    btnNarrate.id = 'mapCaptureNarrate';
    btnNarrate.addEventListener('click', requestNarrative);
    var btnPng = el('button', 'map-capture-btn', t('Unduh PNG', 'Download PNG'));
    btnPng.type = 'button';
    btnPng.addEventListener('click', function () {
      if (!last) return;
      window.MapScreenshot.download(last.dataUrl, 'siaga-peta-' + Date.now() + '.png');
    });
    var btnReport = el('button', 'map-capture-btn', t('Tambahkan ke laporan', 'Add to report'));
    btnReport.type = 'button';
    btnReport.addEventListener('click', sendToReport);
    actions.appendChild(btnNarrate);
    actions.appendChild(btnPng);
    actions.appendChild(btnReport);

    panel.appendChild(head);
    panel.appendChild(status);
    panel.appendChild(figure);
    panel.appendChild(metaBox);
    panel.appendChild(narrative);
    panel.appendChild(actions);
    dialog.appendChild(panel);
    document.body.appendChild(dialog);

    dialog.addEventListener('click', function (event) { if (event.target === dialog) hide(); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !dialog.hidden) hide();
    });
    return dialog;
  }

  function hide() {
    var dialog = document.getElementById('mapCaptureDialog');
    if (dialog) dialog.hidden = true;
  }

  function setStatus(text, kind) {
    var status = document.getElementById('mapCaptureStatus');
    if (!status) return;
    status.textContent = text || '';
    status.dataset.kind = kind || 'info';
  }

  function renderMeta(meta) {
    var box = document.getElementById('mapCaptureMeta');
    if (!box) return;
    while (box.firstChild) box.removeChild(box.firstChild);
    var b = meta.bounds;
    var rows = [
      [t('Waktu (WIB)', 'Time (WIB)'), window.MapScreenshot.wibStamp(meta.capturedAt)],
      [t('Batas peta', 'Bounds'), b.west + ',' + b.south + ' → ' + b.east + ',' + b.north],
      [t('Zoom / dasar', 'Zoom / base'), meta.zoom + ' / ' + meta.basemap],
      [t('Frame linimasa', 'Timeline frame'), meta.timelineFrame || '-'],
      [t('Lapisan aktif', 'Active layers'), (meta.activeLayers || []).map(function (l) { return l.label; }).join(', ') || '-']
    ];
    rows.forEach(function (row) {
      box.appendChild(el('dt', null, row[0]));
      box.appendChild(el('dd', null, String(row[1])));
    });
  }

  async function open() {
    var dialog = ensureDialog();
    dialog.hidden = false;
    var narrative = document.getElementById('mapCaptureNarrative');
    narrative.hidden = true;
    narrative.textContent = '';
    setStatus(t('Menangkap peta…', 'Capturing map…'), 'info');
    try {
      last = await window.MapScreenshot.capture({ language: english() ? 'en' : 'id' });
    } catch (error) {
      last = null;
      var code = String(error && error.message || 'CAPTURE_FAILED');
      var reason = code === 'CANVAS_TAINTED_CORS'
        ? t('Gagal: sumber peta menolak pengambilan gambar (CORS). Coba peta dasar lain.', 'Failed: a map source blocks image capture (CORS). Try another basemap.')
        : code === 'MAP_NOT_READY'
          ? t('Peta belum selesai dimuat. Tunggu sebentar lalu coba lagi.', 'The map has not finished loading. Wait a moment and try again.')
          : t('Penangkapan gagal: ', 'Capture failed: ') + code;
      setStatus(reason, 'error');
      return;
    }
    document.getElementById('mapCaptureImg').src = last.dataUrl;
    renderMeta(last.meta);
    var extra = last.warnings.length ? ' ' + t('Sebagian lapisan dilewati.', 'Some layers were skipped.') : '';
    setStatus(t('Tangkapan siap. Atribusi dan disclaimer sudah ada di dalam gambar.', 'Snapshot ready. Attribution and disclaimer are embedded in the image.') + extra, 'ok');
  }

  async function requestNarrative() {
    if (!last) return;
    var box = document.getElementById('mapCaptureNarrative');
    var btn = document.getElementById('mapCaptureNarrate');
    btn.disabled = true;
    box.hidden = false;
    box.textContent = t('Meminta narasi dari gambar dan data…', 'Requesting narrative from image and data…');
    try {
      var response = await fetch('/api/map-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: last.dataUrl, meta: last.meta, language: english() ? 'en' : 'id' })
      });
      var body = await response.json().catch(function () { return null; });
      if (!response.ok || !body || !body.ok) {
        var code = body && body.error ? body.error : 'HTTP_' + response.status;
        if (code === 'BOUNDS_INVALID') {
          box.textContent = t('Bingkai peta ini tidak bisa dipakai (melintasi batas tanggal atau koordinat tidak sah). Geser peta lalu tangkap ulang.',
            'This map frame cannot be used (it crosses the date line or has invalid coordinates). Pan the map and capture again.');
          return;
        }
        box.textContent = t('Narasi AI tidak tersedia: ', 'AI narrative unavailable: ') + code
          + '. ' + t('Gambar dan angka di atas tetap berasal dari data, bukan model.', 'The image and figures above still come from data, not the model.');
        return;
      }
      while (box.firstChild) box.removeChild(box.firstChild);
      var label = el('p', 'map-capture-narrative-label',
        t('Narasi AI dibuat dari data dan gambar peta; bukan peringatan resmi.',
          'AI narrative generated from data and the map image; not an official warning.'));
      var text = el('div', 'map-capture-narrative-text');
      String(body.narrative || '').split('\n').forEach(function (line) {
        if (line.trim()) text.appendChild(el('p', null, line.trim()));
      });
      box.appendChild(label);
      box.appendChild(text);
      if (body.unverifiedNumbers && body.unverifiedNumbers.length) {
        box.appendChild(el('p', 'map-capture-narrative-warn',
          t('Sebagian angka tidak cocok dengan data dan ditandai: ', 'Some figures did not match the data and were flagged: ')
          + body.unverifiedNumbers.join(', ')));
      }
      last.narrative = body.narrative || '';
      last.narrativeModel = body.model || '';
      last.unverifiedNumbers = body.unverifiedNumbers || [];
    } catch (error) {
      box.textContent = t('Narasi AI gagal diminta. Jaringan atau kuota bermasalah.', 'Could not request the AI narrative. Network or quota problem.');
    } finally {
      btn.disabled = false;
    }
  }

  function sendToReport() {
    if (!last) return;
    try {
      var payload = {
        dataUrl: last.dataUrl,
        meta: last.meta,
        narrative: last.narrative || '',
        narrativeModel: last.narrativeModel || '',
        unverifiedNumbers: last.unverifiedNumbers || [],
        savedAt: new Date().toISOString()
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setStatus(t('Tersimpan untuk laporan. Membuka halaman Laporan…', 'Saved for the report. Opening Reports…'), 'ok');
      window.setTimeout(function () { window.location.href = '/reports#tangkapan-peta'; }, 500);
    } catch (error) {
      setStatus(t('Gagal menyimpan ke laporan (penyimpanan peramban penuh atau diblokir). Unduh PNG sebagai gantinya.',
        'Could not save to the report (browser storage full or blocked). Download the PNG instead.'), 'error');
    }
  }

  function boot() {
    var btn = document.getElementById('mapCaptureBtn');
    if (!btn) return;
    btn.addEventListener('click', function () { open(); });
    window.addEventListener('siaga:languagechange', function () {
      var dialog = document.getElementById('mapCaptureDialog');
      if (dialog && !dialog.hidden && last) renderMeta(last.meta);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.MapCaptureUI = { open: open, STORAGE_KEY: STORAGE_KEY };
})(window, document);
