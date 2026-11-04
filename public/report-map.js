'use strict';

/**
 * Peta kecil di halaman Laporan supaya tangkapan bisa dibuat tanpa
 * meninggalkan halaman. Sengaja ringan: peta dasar Esri, titik api FIRMS,
 * dan pusat permukiman hasil model. Tidak ada animasi partikel di sini;
 * animasi tetap milik dashboard.
 *
 * Semua petak diminta dengan crossOrigin anonymous agar kanvas tidak
 * tainted saat diekspor.
 */
(function (window, document) {
  if (!window || !document || !window.L) return;

  var map = null;
  var baseLayer = null;
  var gFire = null;
  var gPlaces = null;
  var hotspots = [];
  var places = [];
  var activeBase = 'GELAP';
  var windowHours = 24;
  var renderedCount = 0;
  // /api/overview memotong titik api ke subset teratas FRP. Batas itu ikut
  // dilaporkan supaya gambar dan narasi tidak terlihat bertentangan.
  var RENDER_LIMIT = 2000;
  var statusEl = null;

  function english() { return !!(window.SiagaI18n && window.SiagaI18n.getLanguage() === 'en'); }
  function t(id, en) { return english() ? en : id; }

  var BASES = {
    GELAP: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    CITRA: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  };

  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  function fireColor(confidence) {
    var c = Number(confidence);
    if (c >= 80) return '#ff5a3c';
    if (c >= 50) return '#ffb020';
    return '#ffe066';
  }

  function windowLabel() {
    return t(windowHours + ' jam terakhir', 'last ' + windowHours + ' hours');
  }

  function redraw() {
    if (!map) return;
    gFire.clearLayers();
    gPlaces.clearLayers();
    var cutoff = Date.now() - windowHours * 3600 * 1000;
    var shown = hotspots.filter(function (h) {
      var time = h.acq ? Date.parse(h.acq) : NaN;
      return !Number.isFinite(time) || time >= cutoff;
    });
    renderedCount = shown.length;
    shown.forEach(function (h) {
      window.L.circleMarker([h.lat, h.lon], {
        radius: 3.4,
        color: 'rgba(0,0,0,.45)',
        weight: 0.8,
        fillColor: fireColor(h.confidence),
        fillOpacity: 0.9
      }).addTo(gFire);
    });
    places.forEach(function (p) {
      window.L.circleMarker([p.lat, p.lon], {
        radius: 2.6, color: '#fb7185', weight: 1, fillColor: '#fb7185', fillOpacity: 0.5
      }).addTo(gPlaces);
    });
    setStatus(t('Deteksi digambar: ', 'Detections drawn: ') + shown.length
      + ' · ' + t('jendela ', 'window ') + windowLabel()
      + '. ' + t('Peta ini menggambar maksimal 2000 deteksi teratas FRP; ringkasan angka memakai seluruh deteksi yang tersedia.',
        'This map draws at most the top 2000 detections by FRP; the numeric summary uses every available detection.')
      + ' ' + t('Titik adalah deteksi panas satelit, bukan kebakaran terkonfirmasi.', 'Points are satellite thermal detections, not confirmed fires.'));
    var frame = document.getElementById('rmFrameLabel');
    if (frame) frame.textContent = windowLabel();
  }

  function setBase(name) {
    activeBase = BASES[name] ? name : 'GELAP';
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = window.L.tileLayer(BASES[activeBase], {
      maxZoom: 12,
      crossOrigin: 'anonymous',
      attribution: 'Esri, Maxar, Earthstar Geographics'
    }).addTo(map);
    if (baseLayer.bringToBack) baseLayer.bringToBack();
  }

  async function load() {
    setStatus(t('Memuat titik api…', 'Loading hotspots…'));
    try {
      var response = await fetch('/api/overview', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP_' + response.status);
      var body = await response.json();
      hotspots = Array.isArray(body.hotspots) ? body.hotspots : [];
      places = Array.isArray(body.impacted) ? body.impacted : [];
      redraw();
    } catch (error) {
      hotspots = [];
      places = [];
      redraw();
      setStatus(t('Data titik api tidak dapat dimuat. Peta tetap bisa ditangkap, tetapi tanpa lapisan titik api.',
        'Hotspot data could not be loaded. The map can still be captured, but without the hotspot layer.'));
    }
  }

  function boot() {
    var host = document.getElementById('reportMap');
    if (!host) return;
    statusEl = document.getElementById('reportMapStatus');
    map = window.L.map('reportMap', {
      center: [-2.2, 118],
      zoom: 5,
      minZoom: 3,
      maxZoom: 12,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: false
    });
    setBase('GELAP');
    gFire = window.L.layerGroup().addTo(map);
    gPlaces = window.L.layerGroup();

    var fireToggle = document.getElementById('rmFire');
    var placeToggle = document.getElementById('rmPlaces');
    if (fireToggle) fireToggle.addEventListener('change', function () {
      if (fireToggle.checked) map.addLayer(gFire); else map.removeLayer(gFire);
    });
    if (placeToggle) placeToggle.addEventListener('change', function () {
      if (placeToggle.checked) map.addLayer(gPlaces); else map.removeLayer(gPlaces);
    });
    var windowSelect = document.getElementById('rmWindow');
    if (windowSelect) windowSelect.addEventListener('change', function () {
      var value = Number(windowSelect.value);
      windowHours = [6, 12, 24].indexOf(value) >= 0 ? value : 24;
      redraw();
    });
    var baseSelect = document.getElementById('rmBase');
    if (baseSelect) baseSelect.addEventListener('change', function () { setBase(baseSelect.value); });
    window.addEventListener('siaga:languagechange', function () { redraw(); });
    window.setTimeout(function () { try { map.invalidateSize(); } catch (error) { /* noop */ } }, 250);
    load();
  }

  /** Kontrak yang sama dengan dashboard, dibaca oleh MapScreenshot. */
  window.SiagaMapContext = function () {
    if (!map) return null;
    var b = map.getBounds();
    var c = map.getCenter();
    var layers = [];
    var fireToggle = document.getElementById('rmFire');
    var placeToggle = document.getElementById('rmPlaces');
    if (fireToggle && fireToggle.checked) layers.push({ id: 'lyFire', label: t('Titik api', 'Hotspots') });
    if (placeToggle && placeToggle.checked) layers.push({ id: 'lyImpact', label: t('Pusat permukiman model', 'Modeled settlement centers') });
    var attr = document.querySelector('#reportMap .leaflet-control-attribution');
    return {
      bounds: { west: +b.getWest().toFixed(4), south: +b.getSouth().toFixed(4), east: +b.getEast().toFixed(4), north: +b.getNorth().toFixed(4) },
      center: { lat: +c.lat.toFixed(4), lon: +c.lng.toFixed(4) },
      zoom: map.getZoom(),
      basemap: activeBase,
      satelliteProduct: null,
      timelineFrame: windowLabel(),
      renderedHotspots: renderedCount,
      renderedHotspotLimit: RENDER_LIMIT,
      activeLayers: layers,
      attribution: attr ? attr.textContent.replace(/\s+/g, ' ').trim() : 'Esri',
      capturedAt: new Date().toISOString()
    };
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
