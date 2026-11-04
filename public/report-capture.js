'use strict';

/**
 * Blok "Tangkapan peta" pada halaman Laporan.
 *
 * Gambar hanya hidup di sessionStorage peramban: tidak diunggah, tidak
 * disimpan di server, dan hilang saat tab ditutup. Blok ini menampilkan
 * angka yang dihitung kode, narasi berlabel, dan ekspor PNG/PDF.
 */
(function (window, document) {
  if (!window || !document) return;

  var STORAGE_KEY = 'siaga.mapCapture.v2';

  function english() { return !!(window.SiagaI18n && window.SiagaI18n.getLanguage() === 'en'); }
  function t(id, en) { return english() ? en : id; }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function read() {
    try {
      var parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || !Array.isArray(parsed.frames)) return null;
      var frames = parsed.frames.filter(function (f) {
        return f && typeof f.dataUrl === 'string' && f.dataUrl.indexOf('data:image/png;base64,') === 0;
      });
      return frames.length ? { frames: frames.slice(0, 2), savedAt: parsed.savedAt } : null;
    } catch (error) { return null; }
  }

  function clear() {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch (error) { /* noop */ }
    render();
  }

  function summaryRows(frame) {
    var s = frame.structured || {};
    var fire = s.fire || {};
    var air = s.air || {};
    var wind = s.wind || {};
    var view = s.view || {};
    var rows = [];
    rows.push([t('Waktu tangkapan', 'Captured'), view.capturedAtWib || frame.capturedAt || '-']);
    rows.push([t('Jendela deteksi', 'Detection window'), view.timelineFrame || (frame.meta && frame.meta.timelineFrame) || '-']);
    if (fire.hotspotsInFrame != null) {
      rows.push([t('Deteksi panas dalam bingkai', 'Thermal detections in frame'), String(fire.hotspotsInFrame)]);
      rows.push([t('Keyakinan tinggi', 'High confidence'), String(fire.highConfidenceInFrame)]);
      rows.push([t('Total FRP dalam bingkai', 'Total FRP in frame'), fire.totalFrpInFrameMw + ' MW']);
    } else {
      rows.push([t('Deteksi panas', 'Thermal detections'), t('tidak tersedia', 'unavailable')]);
    }
    if (air.worstPointsInFrame && air.worstPointsInFrame.length) {
      var a = air.worstPointsInFrame[0];
      rows.push([t('AQI model terburuk', 'Worst modelled AQI'), a.aqi + ' (' + a.category + ')']);
      if (a.pm25UgM3 != null) rows.push(['PM2.5', a.pm25UgM3 + ' µg/m³']);
    }
    if (wind.sample) {
      rows.push([t('Angin permukaan model', 'Modelled surface wind'),
        wind.sample.blowingToward + ', ' + wind.sample.speedMs + ' m/s']);
    }
    var prov = fire.topProvincesInFrame || [];
    if (prov.length) {
      rows.push([t('Deteksi per provinsi', 'Detections by province'),
        prov.map(function (p) { return p.province + ' ' + p.hotspots; }).join(', ')]);
    }
    var places = (s.settlementCentersInFrame && s.settlementCentersInFrame.places) || [];
    if (places.length) {
      rows.push([t('Pusat permukiman dalam bingkai', 'Settlement centers in frame'),
        places.map(function (p) { return p.name; }).join(', ')]);
    }
    return rows;
  }

  function frameBlock(frame, index, total) {
    var block = el('figure', 'report-capture-frame');
    var label = total > 1
      ? (index === 0 ? t('Sebelum', 'Before') : t('Sesudah', 'After'))
      : t('Tangkapan peta', 'Map snapshot');
    block.appendChild(el('figcaption', 'report-capture-frame-label', label));
    var img = el('img');
    img.src = frame.dataUrl;
    img.alt = t('Tangkapan peta SIAGA.ID beserta legenda, atribusi, dan disclaimer',
      'SIAGA.ID map snapshot with legend, attribution, and disclaimer');
    block.appendChild(img);

    var rows = summaryRows(frame);
    if (rows.length) {
      var dl = el('dl', 'report-capture-summary');
      rows.forEach(function (row) {
        dl.appendChild(el('dt', null, row[0]));
        dl.appendChild(el('dd', null, row[1]));
      });
      block.appendChild(dl);
      block.appendChild(el('p', 'report-capture-note',
        t('Angka di atas dihitung oleh kode dari data publik. Pusat permukiman dalam bingkai bukan daftar wilayah terdampak.',
          'The figures above are computed by code from public data. Settlement centers in frame are not a list of affected areas.')));
    } else {
      block.appendChild(el('p', 'report-capture-note',
        t('Ringkasan angka belum diminta untuk tangkapan ini. Tekan Narasi AI di dialog tangkapan untuk menghitungnya.',
          'No numeric summary was requested for this snapshot yet. Use AI narrative in the capture dialog to compute it.')));
    }

    var actions = el('div', 'report-capture-actions');
    var png = el('button', 'site-button', t('Unduh PNG', 'Download PNG'));
    png.type = 'button';
    png.addEventListener('click', function () {
      window.MapScreenshot.download(frame.dataUrl, 'siaga-peta-' + (index + 1) + '.png');
    });
    actions.appendChild(png);
    block.appendChild(actions);
    return block;
  }

  function narrativeBlock(frame) {
    var box = el('div', 'report-capture-narrative');
    var provider = frame.narrativeProvider || '';
    box.appendChild(el('p', 'report-capture-narrative-label',
      provider === 'local-fallback'
        ? t('Narasi disusun kode dari data karena Muse Spark tidak tersedia; bukan peringatan resmi.',
          'Narrative assembled by code from data because Muse Spark was unavailable; not an official warning.')
        : t('Narasi AI dibuat dari data dan gambar peta; bukan peringatan resmi.',
          'AI narrative generated from data and the map image; not an official warning.')));
    var text = el('div', 'report-capture-narrative-text');
    String(frame.narrative || '').split('\n').forEach(function (line) {
      if (line.trim()) text.appendChild(el('p', null, line.trim()));
    });
    box.appendChild(text);
    if (frame.unverifiedNumbers && frame.unverifiedNumbers.length) {
      box.appendChild(el('p', 'report-capture-warn',
        t('Angka berikut tidak cocok dengan data dan ditandai: ', 'These figures did not match the data and were flagged: ')
        + frame.unverifiedNumbers.join(', ')));
    }
    return box;
  }

  function render() {
    var host = document.getElementById('reportCaptureBody');
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    var payload = read();
    if (!payload) {
      host.appendChild(el('p', 'report-capture-empty',
        t('Belum ada tangkapan. Tekan Tangkap peta di peta laporan di atas, atau buka dashboard, atur lapisan dan frame linimasa, lalu pilih Tambahkan ke laporan. Gambar hanya disimpan di peramban Anda dan hilang saat tab ditutup.',
          'No snapshot yet. Use Capture map on the report map above, or open the dashboard, set layers and the timeline frame, then choose Add to report. Images stay in your browser and disappear when the tab closes.')));
      return;
    }
    var frames = payload.frames;
    var grid = el('div', 'report-capture-grid' + (frames.length > 1 ? ' two' : ''));
    frames.forEach(function (frame, index) { grid.appendChild(frameBlock(frame, index, frames.length)); });
    host.appendChild(grid);

    var last = frames[frames.length - 1];
    if (last.narrative) host.appendChild(narrativeBlock(last));

    var actions = el('div', 'report-capture-actions report-capture-main-actions');
    var pdf = el('button', 'site-button primary', t('Ekspor PDF satu halaman', 'Export one-page PDF'));
    pdf.type = 'button';
    pdf.addEventListener('click', async function () {
      pdf.disabled = true;
      var status = document.getElementById('reportCaptureStatus');
      if (status) status.textContent = t('Menyusun PDF…', 'Building PDF…');
      try {
        var blob = await window.ReportPdf.build({ frames: frames, language: english() ? 'en' : 'id' });
        window.ReportPdf.download(blob, 'siaga-laporan-peta.pdf');
        if (status) status.textContent = t('PDF satu halaman diunduh. Tidak ada data pribadi di dalamnya.', 'One-page PDF downloaded. It contains no personal data.');
      } catch (error) {
        if (status) status.textContent = t('Ekspor PDF gagal: ', 'PDF export failed: ')
          + String(error && error.message || 'PDF_FAILED')
          + '. ' + t('Unduh PNG sebagai gantinya.', 'Download the PNG instead.');
      } finally { pdf.disabled = false; }
    });
    var remove = el('button', 'site-button', t('Hapus tangkapan', 'Remove snapshot'));
    remove.type = 'button';
    remove.addEventListener('click', clear);
    actions.appendChild(pdf);
    actions.appendChild(remove);
    host.appendChild(actions);
    host.appendChild(el('p', 'report-capture-note',
      t('Tangkapan disimpan di sessionStorage peramban, tidak diunggah ke server. Maksimal dua frame; frame tertua dibuang saat frame baru ditambahkan.',
        'Snapshots live in browser sessionStorage and are never uploaded. At most two frames are kept; the oldest is dropped when a new one is added.')));
  }

  function boot() {
    if (!document.getElementById('reportCaptureBody')) return;
    render();
    window.addEventListener('siaga:reportcapture', render);
    window.addEventListener('siaga:languagechange', render);
    if (window.location.hash === '#tangkapan-peta') {
      var section = document.getElementById('tangkapan-peta');
      if (section) section.scrollIntoView({ block: 'start' });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.ReportCapture = { render: render, clear: clear, STORAGE_KEY: STORAGE_KEY };
})(window, document);
