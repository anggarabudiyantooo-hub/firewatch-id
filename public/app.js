/* SIAGA ID, frontend.
   Semua data eksternal dirender lewat textContent / createElement (tidak ada innerHTML). */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /**
   * fetch dengan batas waktu.
   *
   * Tanpa ini, permintaan yang menggantung (khas cold start serverless)
   * tidak pernah resolve maupun reject, sehingga .catch() dan .then()
   * penutup tidak pernah berjalan: kartu tetap memperlihatkan kerangka
   * "-" selamanya, pesan galat tidak muncul, dan tombol REFRESH terkunci.
   * Kegagalan yang tak terlihat lebih berbahaya daripada kegagalan yang
   * jelas, pembaca menyimpulkan "tidak ada bencana" padahal artinya
   * "kami tidak tahu".
   */
  /* ---------- selisih jam perangkat terhadap server ---------- */
  // Jam di kepala halaman dihitung dari jam PERANGKAT. Bila jam perangkat
  // meleset, seluruh halaman ikut meleset, pengguna lalu menyimpulkan
  // dashboard-nya yang lambat. Setiap balasan API membawa header Date dari
  // server; selisihnya dicatat (median 5 sampel terakhir) supaya jam yang
  // ditampilkan mengikuti server dan selisihnya ditulis apa adanya.
  var clockSkewMs = 0;
  var skewSamples = [];
  var SKEW_VISIBLE_MS = 90000;

  function noteServerTime(res) {
    try {
      var h = res.headers;
      if (!h || !h.get) return;
      // Balasan yang datang dari cache CDN membawa header Date dari saat
      // salinan itu dibuat, bukan saat ini, pernah membuat estimasi
      // meleset 3 menit (persis max-age berita). Sampel seperti itu dibuang.
      var age = parseInt(h.get('age') || '0', 10);
      if (!isNaN(age) && age > 2) return;
      var d = h.get('date');
      if (!d) return;
      var t = Date.parse(d);
      if (isNaN(t)) return;
      skewSamples.push(t - Date.now());
      if (skewSamples.length > 5) skewSamples.shift();
      // Semua galat bersifat satu arah: permintaan yang lambat dan salinan
      // cache hanya membuat sampel LEBIH KECIL dari selisih sebenarnya.
      // Karena itu nilai terbesar dari beberapa sampel terakhir adalah
      // taksiran terbaik, bukan nilai tengahnya.
      clockSkewMs = Math.max.apply(null, skewSamples);
      renderSkewNote();
    } catch (e) { /* header tak terbaca: pertahankan nilai terakhir */ }
  }

  function renderSkewNote() {
    var n = $('clockSkew');
    if (!n) return;
    if (Math.abs(clockSkewMs) < SKEW_VISIBLE_MS) { n.hidden = true; n.textContent = ''; return; }
    var mnt = Math.round(Math.abs(clockSkewMs) / 60000);
    n.textContent = 'jam perangkat meleset ' + mnt + ' mnt ' +
      (clockSkewMs > 0 ? 'lebih lambat' : 'lebih cepat') + ' · jam di sini dari server';
    n.hidden = false;
  }

  function fetchT(url, opts, ms) {
    ms = ms || 12000;
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms);
    opts = opts || {};
    opts.signal = ctl.signal;
    return fetch(url, opts).then(
      function (r) { clearTimeout(timer); noteServerTime(r); return r; },
      function (e) { clearTimeout(timer); throw e; }
    );
  }

  /**
   * Waktu akuisisi satelit dalam bentuk terbaca plus umur relatif.
   * Nilai mentah FIRMS ("2026-09-06 0533") memaksa pembaca menghitung
   * sendiri bahwa titik itu sudah berumur dua hari.
   */
  function fmtAcq(iso) {
    if (!iso) return 'tidak tersedia';
    var ms = Date.parse(iso);
    if (!isFinite(ms)) return String(iso);
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var utc = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate())
      + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' UTC';
    var rel = timeAgo(ms);
    return rel ? utc + ' (' + rel + ')' : utc;
  }

  /** Tandai kartu statistik sebagai gagal, bukan sekadar berhenti memuat. */
  function markFailed(ids) {
    ids.forEach(function (id) {
      var n = $(id);
      if (!n) return;
      // Kerangka dilepas supaya kegagalan terbaca berbeda dari "sedang memuat".
      n.classList.remove('skel');
      if (n.textContent === '' || n.textContent === '-') n.textContent = 'gagal';

      // Sub-teks ikut dibereskan. Tanpa ini kartu dapat berbunyi
      // "gagal" di atas "memuat…", dua keadaan yang bertentangan
      // dalam satu kartu, dan pembaca tidak tahu mana yang berlaku.
      var sub = $(id + 'Sub');
      if (sub && /memuat/i.test(sub.textContent)) {
        sub.textContent = 'sumber tidak dapat dihubungi';
      }
    });
  }
  var nf = new Intl.NumberFormat('id-ID');

  /* ---------- peta ---------- */
  // Fase 2.1: BBOX dari config terpusat (harus sinkron dengan server lib/config.js)
  var BBOX = { west: 94.5, south: -11.5, east: 141.5, north: 6.5 };
  function fmtLat(lat) {
    return (lat >= 0 ? lat + '°N' : Math.abs(lat) + '°S');
  }
  function fmtLon(lon) {
    return (lon >= 0 ? lon + '°E' : Math.abs(lon) + '°W');
  }
  function setMapCorners(bbox) {
    var corners = {
      nw: fmtLat(bbox.north) + ' ' + fmtLon(bbox.west),
      ne: fmtLat(bbox.north) + ' ' + fmtLon(bbox.east),
      sw: fmtLat(bbox.south) + ' ' + fmtLon(bbox.west),
      se: fmtLat(bbox.south) + ' ' + fmtLon(bbox.east)
    };
    // Update span[data-corner]
    var mapWrap = document.getElementById('mapWrap');
    if (mapWrap) {
      var els = mapWrap.querySelectorAll('[data-corner]');
      for (var i = 0; i < els.length; i++) {
        var key = els[i].getAttribute('data-corner');
        if (corners[key]) els[i].textContent = corners[key];
      }
    }
    // Fallback: update legacy .map-corner.tr etc jika masih ada tanpa data-corner
    var legacy = {
      'tr': corners.ne,
      'bl': corners.sw,
      'br': corners.se
    };
    for (var cls in legacy) {
      var el = document.querySelector('.map-corner.' + cls + ':not([data-corner])');
      if (el) el.textContent = legacy[cls];
    }
  }
  setMapCorners(BBOX);

  var map = L.map('map', { zoomControl: false, minZoom: 4, maxZoom: 12, worldCopyJump: false })
    .setView([-2.2, 117.5], 5);

  // Leaflet menyimpan ukuran petanya saat inisialisasi dan tidak
  // memperbaruinya sendiri. Bila tinggi wadah berubah karena media query
  //, misalnya perangkat diputar dari potret ke lanskap, peta tetap
  // memakai ukuran lama dan hanya memuat sebagian ubin. Pemberitahuan
  // ini dijeda agar tidak dihitung ulang pada tiap piksel saat jendela
  // diseret.
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { map.invalidateSize(); }, 200);
  });

  // Skala kartu peta dihitung dari zoom, bukan ditulis tetap: label "20m"
  // milik prototipe meleset ~10.000 kali karena satu piksel di zoom 5
  // mewakili 4,9 km. Tangga 1-2-3-5 x pangkat sepuluh sama seperti kontrol
  // skala Leaflet; tangga yang lebih kasar membuat batang melompat 2x.
  var SKALA_M = [];
  for (var p = 1; p <= 1000000; p *= 10) {
    [1, 2, 3, 5].forEach(function (d) { SKALA_M.push(d * p); });
  }
  var skalaBar = document.querySelector('.scale-bar');
  var skalaLab = document.querySelector('.scale-lab');
  function updateScale() {
    if (!skalaBar || !skalaLab) return;
    // Resolusi Web Mercator untuk ubin 256 px, terkoreksi lintang.
    var mPerPx = 156543.03392 * Math.cos(map.getCenter().lat * Math.PI / 180)
      / Math.pow(2, map.getZoom());
    var pilih = SKALA_M[0], beda = Infinity;
    SKALA_M.forEach(function (m) {
      var d = Math.abs(m / mPerPx - 40);
      if (d < beda) { beda = d; pilih = m; }
    });
    skalaBar.style.width = Math.round(pilih / mPerPx) + 'px';
    skalaLab.textContent = pilih >= 1000 ? (pilih / 1000) + ' km' : pilih + ' m';
  }
  updateScale();
  // Skala ikut berubah saat zoom maupun lintang bergeser.
  map.on('zoomend moveend', updateScale);

  // Tiga tombol di prototipe hanya ikon tanpa penangan, dan kontrol zoom
  // bawaan Leaflet membuat pasangan tombol jadi ganda. Kini hanya tiga ini.
  var alat = document.querySelectorAll('.map-tools .tool');
  if (alat.length >= 3) {
    alat[0].addEventListener('click', function () { map.zoomIn(); });
    alat[1].addEventListener('click', function () { map.zoomOut(); });
    alat[2].addEventListener('click', function () {
      // Umpan balik wajib saat klik: dialog izin peramban bisa menggantung lama,
      // dan tanpanya tombol terasa mati. Petunjuk menahan diri sampai ada jawaban.
      if (!('geolocation' in navigator)) {
        // Peramban dalam aplikasi (WhatsApp/Telegram) dan mode privat sering tidak
        // punya geolocation sama sekali. Tombol harus tetap berguna: pusatkan ke
        // kejadian terpanas dari data yang sudah dimuat, jangan sekadar mengeluh.
        showHint('Peramban ini tidak menyediakan layanan lokasi.' + pusatKeKejadianTerpanas(), 9000);
        return;
      }
      showHint('Meminta izin lokasi ke peramban…');
      // Timeout wajib: bila pertanyaan izin ditutup tanpa dijawab, geolocation
      // tidak pernah memanggil callback dan tombol tampak mati selamanya.
      map.locate({ setView: true, maxZoom: 12, timeout: 10000, enableHighAccuracy: false });
    });
  }
  var tandaLokasi = null;
  map.on('locationfound', function (e) {
    if (tandaLokasi) map.removeLayer(tandaLokasi);
    tandaLokasi = L.circleMarker(e.latlng, {
      radius: 6, color: '#64D2FF', weight: 2, fillColor: '#64D2FF', fillOpacity: 0.3
    }).addTo(map);
    var akurasi = (typeof e.accuracy === 'number') ? ' (±' + Math.round(e.accuracy) + ' m)' : '';
    showHint('Perkiraan posisi Anda ditandai pada peta' + akurasi + '.', 5000);
  });
  map.on('locationerror', function (e) {
    // Bedakan penyebabnya; pesan generik membuat pengguna tidak tahu apa yang
    // harus dilakukan. Kode mengikuti GeolocationPositionError milik peramban.
    var msg = 'Posisi tidak dapat dibaca.';
    if (e && e.code === 1) msg = 'Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan peramban, lalu klik lagi.';
    else if (e && e.code === 2) msg = 'Perangkat tidak dapat membaca posisi saat ini, cek layanan lokasi (GPS) perangkat.';
    else if (e && e.code === 3) msg = 'Waktu pembacaan posisi habis. Pastikan pertanyaan izin lokasi dijawab, lalu klik lagi.';
    else if (e && e.message) msg = 'Posisi tidak dapat dibaca: ' + e.message;
    showHint(msg + pusatKeKejadianTerpanas(), 10000);
  });
  // Kalimat tambahan bila pemusatan darurat berhasil; kosong bila data belum tiba,
  // sehingga petunjuk galat tidak pernah menjanjikan hal yang tidak terjadi.
  function pusatKeKejadianTerpanas() {
    var hs = (state.data && state.data.hotspots) || [];
    var puncak = null;
    for (var i = 0; i < hs.length; i++) {
      if (!puncak || (hs[i].frp || 0) > (puncak.frp || 0)) puncak = hs[i];
    }
    if (puncak && typeof puncak.lat === 'number' && typeof puncak.lon === 'number') {
      map.setView([puncak.lat, puncak.lon], 8);
      return ' Peta dipusatkan ke titik api terpanas saat ini sebagai gantinya.';
    }
    return '';
  }

  var AGS = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var ATTR = 'Peta dasar &copy; Esri, Maxar, Earthstar Geographics, HERE, Garmin, &copy; OpenStreetMap contributors';

  // Basemap: gelap (default), citra satelit, dan relief, mengikuti pilihan SiPongi.
  var BASEMAPS = {
    gelap: L.layerGroup([
      L.tileLayer(AGS + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, attribution: ATTR }),
      L.tileLayer(AGS + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12 })
    ]),
    citra: L.layerGroup([
      L.tileLayer(AGS + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, attribution: ATTR }),
      L.tileLayer(AGS + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12 })
    ]),
    relief: L.layerGroup([
      L.tileLayer(AGS + 'World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12, attribution: ATTR }),
      L.tileLayer(AGS + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12 })
    ])
  };
  // Peta dasar citra satelit dipakai sejak awal: bentang alam, punggungan
  // gunung, dan tutupan lahan langsung terbaca, sehingga posisi titik api
  // maupun sebaran abu punya konteks geografis tanpa perlu diatur dulu.
  var activeBase = 'citra';
  BASEMAPS.citra.addTo(map);
  document.body.classList.add('basemap-citra');

  function setBasemap(name) {
    if (!BASEMAPS[name] || name === activeBase) return;
    map.removeLayer(BASEMAPS[activeBase]);
    BASEMAPS[name].addTo(map);
    BASEMAPS[name].eachLayer(function (l) { l.bringToBack(); });
    activeBase = name;
    document.body.classList.toggle('basemap-citra', name === 'citra');
  }

  map.createPane('airPane');
  map.getPane('airPane').style.zIndex = 350;      // di bawah overlayPane (400)
  map.getPane('airPane').style.pointerEvents = 'auto';
  // Citra Himawari ditaruh tepat di atas basemap, di bawah semua data.
  map.createPane('himaPane');
  map.getPane('himaPane').style.zIndex = 250;
  map.getPane('himaPane').style.pointerEvents = 'none';
  // Pluma abu vulkanik di bawah titik api namun di atas sel AQI.
  map.createPane('ashPane');
  map.getPane('ashPane').style.zIndex = 380;
  // Marker gunung harus di atas panah angin agar tetap bisa diklik.
  map.createPane('windParticlePane');
  map.getPane('windParticlePane').style.zIndex = 360;
  map.getPane('windParticlePane').style.pointerEvents = 'none';
  map.createPane('volcanoPane');
  map.getPane('volcanoPane').style.zIndex = 640;

  var gAir = L.layerGroup();
  var gAsh = L.layerGroup();
  // Marker status gunung berdiri sendiri; dulu menempel di gAsh sehingga
  // ikut padam saat lapisan Abu vulkanik dimatikan - padahal data status tetap
  // relevan dan justru itu yang diminta prototipe (baris 'Letusan gunung api').
  var gVolcano = L.layerGroup();
  // Lapisan data mulai dalam keadaan mati.
  //
  // Sebelumnya empat lapisan menyala otomatis, sehingga peta langsung
  // penuh ribuan titik dan kerucut asap sebelum pengguna sempat melihat
  // bentang alamnya. Memulai dari peta bersih membuat orang memilih
  // sendiri apa yang ingin dilihat, dan membuat setiap lapisan yang
  // dinyalakan terbaca jelas karena tidak bertumpuk dengan yang lain.
  var gWind = L.layerGroup();
  var gSmoke = L.layerGroup();
  var gConc = L.layerGroup();
  var gFire = L.layerGroup();
  var gImpact = L.layerGroup();
  var gQuake = L.layerGroup();
  var gShelter = L.layerGroup();
  // Lalu lintas udara sipil (ADS-B publik). Grup terpisah supaya
  // mematikannya tidak menyentuh lapisan lain mana pun.
  var gFlights = L.layerGroup();

  var state = {
    data: null, attr: null, news: [], newsTopics: [], newsTopic: 'semua', minConf: 0, minFrp: 10,
    concOn: false, concBusy: false, colorBy: 'confidence',
    // windOn harus cocok dengan keadaan awal kotak-centang di index.html.
    // Bila keduanya tidak sinkron, loadWind() berjalan untuk lapisan yang
    // kotaknya kosong dan menghabiskan kuota tanpa ada yang tergambar.
    // windLevel 'auto' berarti mengikuti ketinggian abu yang sedang aktif.
    // Default itu dipilih supaya perbandingan angin-abu selalu berada pada
    // lapisan atmosfer yang sama, bukan permukaan lawan ketinggian.
    windLevel: 'auto', windLevelUsed: '10m', windMeta: null,
    wind: null, windKey: null, windOn: false, windBusy: false, particles: null, plumeHour: 0,
    air: null, airKey: null, airOn: false, airBusy: false, airPendingQ: null,
    airMinAqi: 0, airFilteredCount: 0, // Fase 2.5: filter AQI UI friendly
    ash: null, ashOn: false, volcanoOn: false, ashBusy: false, newsAt: '',
    // Harus cocok dengan <option selected> pada #himaSel (nonaktif),
    // jika tidak, state dan tampilan kontrol saling bertentangan.
    drought: null,
    hima: null, himaProduct: '', himaLayer: null,
    himaPlaying: false, himaTimer: null, himaFrame: null, himaFrameLayers: null,
    // Sentinel-2: ambang tutupan awan 30% memberi keseimbangan antara
    // citra yang cukup jernih dan cukup sering tersedia di iklim tropis.
    s2Product: null, s2Layer: null, s2Meta: null, s2MetaKey: null, s2Cloud: 30,
    hazard: null, hazardAt: null, quakeOn: false, shelterOn: false,
    flightsOn: false, flights: null, flightsAt: null,
    casualties: null, status: null, eruptions: null, newsFetchedAt: null
  };

  /* ---------- util DOM ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function popupNode(title, rows, extra) {
    var d = document.createElement('div');
    if (extra && extra.tag) {
      var t = el('span', 'tag t-' + extra.tag.cls + ' pp-tag', extra.tag.text);
      d.appendChild(t);
    }
    d.appendChild(el('div', 'pp-t', title));
    rows.forEach(function (r) { if (r) d.appendChild(el('div', 'pp-r', r)); });
    if (extra && extra.warn) d.appendChild(el('div', 'pp-warn', extra.warn));
    return d;
  }
  function frpColor(f) { return f >= 50 ? '#ff4d2e' : f >= 15 ? '#ff9f1c' : '#ffd166'; }

  // Skema SiPongi: hijau = rendah, kuning = sedang, merah = tinggi.
  function confColor(c) { return c >= 80 ? '#ef4444' : c >= 50 ? '#facc15' : '#22c55e'; }
  function confLabel(c) { return c >= 80 ? 'Tinggi' : c >= 50 ? 'Sedang' : 'Rendah'; }
  function hotspotColor(h) {
    return state.colorBy === 'confidence' ? confColor(h.confidence) : frpColor(h.frp);
  }
  function levelOf(score) { return score >= 66 ? 'Berat' : score >= 33 ? 'Sedang' : 'Ringan'; }

  var TAGS = {
    sawit: 'Sawit', kayu: 'HTI kayu', hph: 'HPH tebang', tambang: 'Tambang', rspo: 'RSPO'
  };

  /* ---------- lapisan peta ---------- */
  function drawFires() {
    gFire.clearLayers();
    if (!state.data) return;
    var hs = state.data.hotspots.filter(function (h) {
      return h.confidence >= state.minConf && h.frp >= state.minFrp;
    });
    hs.forEach(function (h) {
      var c = hotspotColor(h);
      var mk = L.circleMarker([h.lat, h.lon], {
        radius: Math.max(3.5, Math.min(11, 3 + Math.sqrt(h.frp) * 0.85)),
        color: c, weight: 1.2, fillColor: c, fillOpacity: 0.7
      }).addTo(gFire);
      mk.bindPopup(function () { return hotspotPopup(h, mk); });
    });
    // Sublabel harus menjawab tiga hal sekaligus: berapa yang tampil dari
    // berapa total, mengapa selisihnya ada, dan seberapa tua datanya.
    // Nol karena filter dan nol karena sumber kosong ditulis berbeda -
    // pada dasbor bencana keduanya berkonsekuensi sangat berbeda.
    // Angka pembanding harus TOTAL sebenarnya, bukan panjang array yang
    // sudah dipotong server. Kalau memakai panjang array, "semua titik"
    // akan terbaca 2.000 padahal satelit mendeteksi 7.172.
    var hm = state.data.hotspotsMeta || null;
    var total = hm ? hm.total : state.data.hotspots.length;
    var m = state.data.meta || {};
    // Keterangan dijaga ringkas supaya tinggi kartu tetap seragam;
    // rincian umur data lengkap tetap tersedia di popup tiap titik.
    var age = (m.dataAgeHours != null && m.windowHours != null)
      ? ' · ' + m.windowHours + 'j, tertua ' + Math.round(m.dataAgeHours) + 'j lalu'
      : '';

    // Bila server memotong daftar, filter yang meminta titik di bawah
    // ambang potong tidak dapat dilayani sepenuhnya. Itu harus dikatakan,
    // bukan dibiarkan pengguna menyimpulkan sendiri dari angka yang
    // kelihatan ganjil.
    var capped = hm && hm.truncated && hm.minFrpIncluded !== null
      && state.minFrp < hm.minFrpIncluded;
    var capNote = capped
      ? ' · daftar dipotong ke ' + nf.format(hm.returned) + ' titik terkuat (FRP \u2265 '
        + hm.minFrpIncluded + ' MW)'
      : '';

    var txt;
    if (!total) {
      txt = 'tidak ada data dari sumber';
    } else if (!hs.length) {
      txt = '0 dari ' + nf.format(total) + ' lolos filter' + age;
    } else if (hs.length < total) {
      txt = nf.format(hs.length) + ' dari ' + nf.format(total) + ' tampil' + age + capNote;
    } else {
      txt = nf.format(total) + ' titik' + age;
    }
    $('sHotSub').textContent = txt;
    renderConfSummary(hs);
  }

  // Popup titik api: detail satelit + alamat administratif (dimuat asinkron).
  function hotspotPopup(h, marker) {
    var box = document.createElement('div');
    box.appendChild(el('span', 'tag conf-' + confLabel(h.confidence).toLowerCase() + ' pp-tag',
      'Keyakinan ' + confLabel(h.confidence)));
    box.appendChild(el('div', 'pp-t', 'Titik api terdeteksi'));
    [
      'Daya radiasi (FRP): ' + h.frp + ' MW',
      'Tingkat keyakinan: ' + h.confidence + '%',
      'Waktu: ' + fmtAcq(h.acq),
      'Satelit: ' + h.satellite + (h.daynight === 'N' ? ' · malam' : h.daynight === 'D' ? ' · siang' : ''),
      'Koordinat: ' + h.lat.toFixed(4) + ', ' + h.lon.toFixed(4)
    ].forEach(function (t) { box.appendChild(el('div', 'pp-r', t)); });

    // hasil reverse-geocode disimpan pada objek hotspot agar tidak dimuat ulang
    if (h._place !== undefined) {
      box.appendChild(el('div', 'pp-r', h._place || 'Wilayah administratif tidak terdata.'));
      return box;
    }

    box.appendChild(el('div', 'pp-r pp-load', 'Memuat wilayah administratif…'));
    fetchT('/api/place?lat=' + h.lat.toFixed(5) + '&lon=' + h.lon.toFixed(5), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
      .then(function (p) {
        var parts = [p.desa, p.kecamatan, p.kabupaten, p.provinsi].filter(Boolean);
        h._place = parts.length ? 'Wilayah: ' + parts.join(', ') : '';
      })
      .catch(function () { h._place = ''; })
      .then(function () {
        if (marker && marker.isPopupOpen && marker.isPopupOpen()) marker.getPopup().update();
      });
    return box;
  }

  // Ringkasan jumlah titik per tingkat kepercayaan (panel kiri peta, ala SiPongi).
  function renderConfSummary(hs) {
    var box = $('confSummary');
    if (!box) return;
    clear(box);
    var buckets = [
      { key: 'tinggi', label: 'Tinggi', color: '#ef4444', n: 0 },
      { key: 'sedang', label: 'Sedang', color: '#facc15', n: 0 },
      { key: 'rendah', label: 'Rendah', color: '#22c55e', n: 0 }
    ];
    hs.forEach(function (h) {
      if (h.confidence >= 80) buckets[0].n++;
      else if (h.confidence >= 50) buckets[1].n++;
      else buckets[2].n++;
    });
    box.appendChild(el('div', 'cs-title', 'Titik panas'));
    buckets.forEach(function (b) {
      var row = el('div', 'cs-row');
      var dot = el('i', 'cs-dot'); dot.style.background = b.color;
      row.appendChild(dot);
      row.appendChild(el('span', 'cs-lab', b.label));
      row.appendChild(el('b', 'cs-num', nf.format(b.n)));
      box.appendChild(row);
    });
    var tot = el('div', 'cs-total');
    tot.appendChild(el('span', null, 'Total'));
    tot.appendChild(el('b', null, nf.format(hs.length)));
    box.appendChild(tot);
  }

  function drawSmoke() {
    gSmoke.clearLayers();
    if (!state.data) return;
    var h = state.plumeHour;
    state.data.plumes.forEach(function (p) {
      // Pada jam > 0 pakai bentuk hasil prakiraan angin; jika tak tersedia, lewati.
      var f = p;
      if (h > 0) {
        var found = null;
        if (p.forecast) {
          p.forecast.forEach(function (x) { if (x.hour === h) found = x; });
        }
        if (!found) return;
        f = found;
      }

      // Dua lapis: inti pekat di dekat sumber + selubung tipis sejauh jangkauan,
      // supaya bentuk kepulan terbaca jelas di atas peta gelap.
      var op = Math.min(0.55, 0.22 + p.intensity * 0.33);
      var spd = h > 0 ? f.windSpeed : p.wind.speed;
      var lines = [
        'Sumber: klaster ' + p.count + ' titik api · FRP ' + nf.format(p.frp) + ' MW',
        'Angin ' + spd.toFixed(1) + ' m/s, asap bergerak ke ' + compass(f.bearingTo) + ' (' + f.bearingTo + '°)',
        'Jangkauan perkiraan: ± ' + nf.format(f.lengthKm) + ' km'
      ];
      if (h === 0) {
        lines.push((p.wind.rh !== null ? 'Kelembapan ' + p.wind.rh + '%' : '') +
          (p.wind.temp !== null ? (p.wind.rh !== null ? ' · ' : '') + 'Suhu ' + p.wind.temp + '°C' : ''));
      } else {
        lines.push('Prakiraan +' + h + ' jam' + (f.run ? ' · siklus GFS ' + f.run : ''));
      }
      var info = popupNode(h === 0 ? 'Perkiraan sebaran asap' : 'Prakiraan sebaran +' + h + ' jam', lines,
        { warn: 'Model perkiraan berbasis angin, bukan model dispersi atmosfer maupun pengukuran kualitas udara.' });

      L.polygon(f.polygon, {
        color: h > 0 ? '#8ab4d8' : '#e2b184', weight: 1.2, opacity: 0.75,
        fillColor: h > 0 ? '#6f9bc4' : '#d9a273',
        fillOpacity: op * (h > 0 ? 0.35 : 0.45),
        smoothFactor: 1, dashArray: h > 0 ? '4,3' : null
      }).bindPopup(info).addTo(gSmoke);

      if (f.corePolygon) {
        L.polygon(f.corePolygon, {
          color: 'transparent', weight: 0,
          fillColor: h > 0 ? '#4f7ea8' : '#c98b52',
          fillOpacity: op * (h > 0 ? 0.75 : 1), smoothFactor: 1
        }).bindPopup(info).addTo(gSmoke);
      }
    });
  }


  // Zona terdampak digambar sebagai POLIGON area, bukan titik. Bentuknya
  // buffer melingkar berjari-jari tetap per tingkat paparan, bukan batas
  // administratif dan bukan data kerusakan; tujuannya pembaca melihat luas
  // wilayah yang terpapar, bukan sebuah koordinat.
  var ZONE_RADIUS_KM = { 'Berat': 18, 'Sedang': 12, 'Ringan': 7 };
  function zoneRingKm(lat, lon, km) {
    var out = [], n = 56, kLat = 110.57, kLon = 111.32 * Math.cos(lat * Math.PI / 180);
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * 2 * Math.PI;
      out.push([
        +(lat + (km * Math.cos(a)) / kLat).toFixed(4),
        +(lon + (km * Math.sin(a)) / kLon).toFixed(4)
      ]);
    }
    return out;
  }
  function kmBetween(a, b) {
    var R = 6371, t = Math.PI / 180;
    var dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
      Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  /** Peristiwa bahaya lain di sekitar sebuah zona, dihitung dari data yang
   *  SUDAH termuat (overview/hazard/gunung/udara) - tanpa permintaan baru.
   *  Jendela mengikuti sumbernya masing-masing: 24 jam untuk api & gunung,
   *  24 jam BMKG untuk gempa. Yang tidak ada dikatakan tidak ada. */
  function zoneDossier(lat, lon, rKm, skipVolcano) {
    var here = [lat, lon], kinds = [], rows = [];
    // 1) titik api: klaster di dalam zona; di luar itu jarak klaster terdekat
    var cl = (state.data && state.data.clusters) || [];
    var inside = [], near = Infinity, nearFrp = 0;
    cl.forEach(function (c) {
      var d = kmBetween(here, [c.lat, c.lon]);
      if (d < near) { near = d; nearFrp = c.frp; }
      if (d <= rKm) inside.push({ d: d, c: c });
    });
    if (inside.length) {
      inside.sort(function (a, b) { return a.d - b.d; });
      var frpMax = inside.reduce(function (m, x) { return Math.max(m, x.c.frp); }, 0);
      rows.push('Titik api: ' + nf.format(inside.length) + ' klaster di dalam zona · FRP tertinggi '
        + nf.format(Math.round(frpMax)) + ' · terdekat ' + nf.format(Math.round(inside[0].d)) + ' km');
      kinds.push('api');
    } else if (isFinite(near)) {
      rows.push('Titik api: tidak ada klaster di dalam zona · terdekat '
        + nf.format(Math.round(near)) + ' km (FRP ' + nf.format(Math.round(nearFrp)) + ')');
    }
    // 2) abu vulkanik (hanya bila data gunung termuat)
    if (state.ash && state.ash.active) {
      var vs = state.ash.active
        .map(function (v) { return { v: v, d: kmBetween(here, [v.lat, v.lon]) }; })
        .filter(function (x) { return x.d <= 100 && x.v.name !== skipVolcano; })
        .sort(function (a, b) { return a.d - b.d; })
        .slice(0, 2);
      vs.forEach(function (x) {
        var st = x.v.official ? (x.v.official.level >= 3 ? x.v.official.status : 'status ' + x.v.official.status) : '';
        rows.push('Gunung ' + x.v.name + (st ? ', ' + st : '') + ' · ' + nf.format(Math.round(x.d)) + ' km dari zona'
          + ((x.v.plumes || []).length ? ' · dilaporkan erupsi dengan sebaran abu' : ''));
        kinds.push('gunung');
      });
    }
    // 3) gempa BMKG 24 jam dalam 200 km
    var qs = (state.hazard && state.hazard.quakes && state.hazard.quakes.quakes) || [];
    var qh = qs.map(function (q) { return { q: q, d: kmBetween(here, [q.lat, q.lon]) }; })
      .filter(function (x) { return x.d <= 200; })
      .sort(function (a, b) { return a.d - b.d; })
      .slice(0, 2);
    qh.forEach(function (x) {
      rows.push('Gempa M ' + x.q.magnitude + ' · kedalaman ' + x.q.depthKm + ' km · '
        + nf.format(Math.round(x.d)) + ' km dari zona · ' + (x.q.area || '')
        + (x.q.felt ? ' · dirasakan' : '') + (x.q.tsunami ? ' · berpotensi tsunami' : ''));
      kinds.push('gempa');
    });
    // 4) pengungsian dalam 3x jari-jari zona
    var sh = state.hazard && state.hazard.shelters;
    if (sh && sh.events) {
      var pts = [];
      sh.events.forEach(function (ev) {
        (ev.points || []).forEach(function (p) {
          var d = kmBetween(here, [p.lat, p.lon]);
          if (d <= rKm * 3) pts.push({ p: p, d: d, ev: ev });
        });
      });
      pts.sort(function (a, b) { return b.p.jumlah - a.p.jumlah; });
      if (pts.length) {
        var tot = pts.reduce(function (m, x) { return m + (x.p.jumlah || 0); }, 0);
        rows.push('Pengungsian: ' + nf.format(tot) + ' jiwa di ' + nf.format(pts.length)
          + ' titik terdekat · ' + nf.format(Math.round(pts[0].d)) + ' km dari zona');
        kinds.push('pengungsi');
      }
    }
    // 5) kualitas udara, hanya bila layer udara sudah dimuat
    var ap = state.air && state.air.points;
    if (ap) {
      var best = null;
      ap.forEach(function (pt) {
        var d = kmBetween(here, [pt.lat, pt.lon]);
        if (d <= 35 && pt.aqi >= 100 && (!best || pt.aqi > best.aqi)) best = pt;
      });
      if (best) {
        rows.push('Kualitas udara: AQI ' + best.aqi + (best.label ? ' · ' + best.label : '') + ' di grid terdekat');
        kinds.push('udara');
      }
    }
    if (!kinds.length) rows.push('Tidak ada peristiwa bahaya lain yang tercatat di sekitar zona ini (jendela 24 jam).');
    return { rows: rows, kinds: kinds };
  }

  function drawImpact() {
    gImpact.clearLayers();
    if (!state.data) return;
    state.data.impacted.forEach(function (r) {
      var col = r.level === 'Berat' ? '#f87171' : r.level === 'Sedang' ? '#fbbf24' : '#34d399';
      var rad = ZONE_RADIUS_KM[r.level] || 10;
      var dos = zoneDossier(r.lat, r.lon, rad);
      var head = dos.kinds.length
        ? 'Peristiwa di lokasi sekitar zona (24 jam)'
        : 'Peristiwa di lokasi sekitar zona';
      L.polygon(zoneRingKm(r.lat, r.lon, rad), {
        color: col, weight: 2, fillColor: col, fillOpacity: 0.16
      }).bindTooltip(r.name + ' \u00b7 paparan ' + r.level + ' \u00b7 radius ' + rad + ' km', {
        direction: 'top', className: 'zone-tip'
      }).bindPopup(popupNode(r.name + ' \u2014 ' + r.prov, [
        'Zona terdampak = area terpapar dengan radius ' + rad + ' km dari pusat permukiman (bukan batas administratif, bukan data kerusakan).',
        'Tingkat paparan: ' + r.level + ' (indeks ' + r.score + '/100)',
        'Sumber asap terdekat: ' + nf.format(r.nearestKm) + ' km (' + r.proximity + ')',
        'Asap datang dari arah ' + r.fromDir + ' \u00b7 angin ' + r.windSpeed + ' m/s',
        r.etaText.charAt(0).toUpperCase() + r.etaText.slice(1),
        'Terpapar oleh ' + r.plumes + ' pluma asap',
        'Perkiraan penduduk: ' + nf.format(r.population) + ' jiwa',
        head + ':'
      ].concat(dos.rows).concat(['Saran: ' + r.advice]),
        { warn: 'Indeks paparan adalah model perkiraan dari arah angin dan intensitas api, bukan hasil pengukuran ISPU di lapangan.' })).addTo(gImpact);
    });
  }

  /* ---------- kualitas udara (AQI) ---------- */
  // Digambar sebagai sel persegi seukuran grid agar membentuk heatmap.
  // Fase 2.5: filter AQI + UI friendly + opacity lebih terlihat
  function drawAir() {
    gAir.clearLayers();
    if (!state.air || !state.air.points || !state.air.points.length) {
      state.airFilteredCount = 0;
      return;
    }
    var half = (state.air.step || 1.5) / 2;
    var minAqi = state.airMinAqi || 0;
    var filtered = state.air.points.filter(function (p) { return p.aqi >= minAqi; });
    state.airFilteredCount = filtered.length;

    // Urutkan: AQI tinggi di atas agar terlihat (gambar terakhir di atas)
    filtered.sort(function (a, b) { return a.aqi - b.aqi; });

    filtered.forEach(function (p) {
      var bounds = [[p.lat - half, p.lon - half], [p.lat + half, p.lon + half]];
      // Opacity ditingkatkan agar lebih terlihat, sebelumnya 0.09-0.3 terlalu tipis
      var op = p.aqi >= 300 ? 0.55 : p.aqi >= 200 ? 0.45 : p.aqi >= 150 ? 0.38 : p.aqi >= 100 ? 0.32 : p.aqi >= 50 ? 0.24 : 0.18;
      var borderOp = p.aqi >= 100 ? 0.35 : 0.18;
      L.rectangle(bounds, {
        pane: 'airPane',
        color: p.color,
        weight: p.aqi >= 150 ? 1 : 0.6,
        opacity: borderOp,
        fillColor: p.color,
        fillOpacity: op,
        interactive: true
      }).bindPopup(popupNode('Kualitas udara, US AQI ' + nf.format(p.aqi), [
        'Kategori: ' + p.label,
        p.pm25 !== null ? 'PM2,5: ' + p.pm25 + ' µg/m³' : null,
        p.pm10 !== null ? 'PM10: ' + p.pm10 + ' µg/m³' : null,
        'Koordinat: ' + p.lat.toFixed(2) + ', ' + p.lon.toFixed(2),
        minAqi > 0 ? 'Filter: AQI ≥ ' + minAqi : null
      ], { warn: airAdvice(p.aqi) }))
      .bindTooltip('AQI ' + p.aqi + ' · ' + p.label, {
        direction: 'top',
        offset: [0, -4],
        opacity: 0.9,
        className: 'aqi-tip'
      })
      .addTo(gAir);
    });

    // Update summary di panel jika ada
    var confBox = $('confSummary');
    if (confBox && state.airOn && state.air) {
      // Jangan timpa confSummary bila sedang menampilkan hotspot summary
      // confSummary dipakai bersama, hanya update jika air layer aktif dan tidak ada hotspot filter aktif
    }
  }

  /* ---------- gunung api & sebaran abu vulkanik ---------- */
  // Sumber: Smithsonian GVP + angin ketinggian Open-Meteo. Indikatif, bukan advisory VAAC.
  function volcanoIcon(v) {
    // Warna mengikuti status resmi PVMBG; bila tak ada, pakai status GVP.
    var col = v.official
      ? v.official.color
      : (v.activity && v.activity.status === 'baru' ? '#f87171' : '#fb923c');
    var svg =
      '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">' +
        '<path d="M13 5.5 L21.5 20.5 H4.5 Z" fill="' + col + '" fill-opacity="0.9" ' +
          'stroke="#0b1016" stroke-width="1.4" stroke-linejoin="round"/>' +
        '<path d="M10.4 11 H15.6 L14 13.4 H12 Z" fill="#fde68a" fill-opacity="0.95"/>' +
      '</svg>';
    return L.divIcon({ className: 'volcano-mark', html: svg, iconSize: [26, 26], iconAnchor: [13, 20] });
  }

  /** Selisih dua sudut kompas dalam derajat, 0-180. */
  function angGap(a, b) {
    var d = Math.abs(((a % 360) + 360) % 360 - ((b % 360) + 360) % 360);
    return d > 180 ? 360 - d : d;
  }

  function drawAsh() {
    gAsh.clearLayers();
    gVolcano.clearLayers();
    if (!state.ash || !state.ash.active.length) return;

    state.ash.active.forEach(function (v) {
      // Pluma tertinggi digambar lebih dulu agar lapisan rendah tampak di atasnya.
      v.plumes.slice().sort(function (a, b) { return b.altKm - a.altKm; }).forEach(function (p) {
        // Gaya garis membedakan asal data tanpa perlu membuka popup:
        // observasi lapangan digambar utuh, model putus-putus.
        L.polygon(p.polygon, {
          pane: 'ashPane',
          color: p.color,
          weight: p.dataMode === 'observed' ? 1.8 : 1,
          opacity: p.dataMode === 'observed' ? 0.85 : 0.45,
          fillColor: p.color,
          fillOpacity: p.dataMode === 'observed' ? 0.16 : 0.1,
          dashArray: p.dataMode === 'observed' ? null : '5,4'
        }).bindPopup(popupNode('Sebaran abu ' + v.name + ', ' + p.levelLabel, [
          (p.dataMode === 'observed' ? 'STATUS: OBSERVASI LAPANGAN' : 'STATUS: MODEL ATMOSFER'),
          'Arah sebaran: ' + compass(p.to) + ' (' + p.to + '\u00b0)',
          v.ash && v.ash.summitElevM ? 'Tinggi puncak: ' + nf.format(v.ash.summitElevM) + ' m AMSL' : null,
          v.ash && v.ash.columnAboveSummitM
            ? 'Tinggi kolom: ' + nf.format(v.ash.columnAboveSummitM) + ' m di atas puncak' : null,
          v.ash && v.ash.ashTopM
            ? 'Puncak abu: ' + nf.format(v.ash.ashTopM) + ' m AMSL (' + v.ash.heightBasis + ')'
            : 'Puncak abu: tidak dapat dihitung (' + ((v.ash && v.ash.heightBasis) || 'tinggi tidak teramati') + ')',
          'Angin dipakai: ' + p.windLevelHpa + ' hPa @ ' + nf.format(p.windHeightM) + ' m'
            + (p.windInterpolated ? ' (interpolasi ' + (p.windLevels || []).join('/') + ' hPa)' : ''),
          p.shearDeg !== null && p.shearDeg !== undefined && p.shearDeg > 30
            ? 'Catatan: arah teramati berbeda ' + p.shearDeg + '\u00b0 dari arah model '
              + '(' + compass(p.modelToDeg) + '). Geser angin vertikal atau '
              + 'pengamatan pada bagian kolom yang lebih rendah.'
            : null,
          // Arah kerucut bisa berasal dari dua sumber yang berbeda, dan
          // perbedaannya penting: laporan visual petugas pos pantau
          // mengalahkan model angin. Tanpa keterangan ini, pembaca yang
          // membandingkan arah abu dengan arah angin akan mengira ada
          // kekeliruan padahal justru pengamatan lapangan yang dipakai.
          p.observedDirection
            ? 'Sumber arah: laporan visual petugas pos pengamatan'
            : 'Sumber arah: model angin ketinggian (NOAA GFS)',
          'Angin di ~' + p.altKm + ' km: ' + p.speed + ' m/s, dari '
            + compass(p.from) + ' (' + p.from + '\u00b0)',
          p.observedDirection && angGap(p.from + 180, p.to) > 45
            ? 'Catatan: arah kolom teramati berbeda dari arah angin model. '
              + 'Angka yang ditampilkan mengikuti pengamatan lapangan.'
            : null,
          'Perkiraan jangkauan: ' + nf.format(p.reachKm) + ' km'
        ], { warn: 'Perkiraan indikatif dari angin ketinggian, bukan advisory resmi VAAC.' }))
          .addTo(gAsh);
      });

      var o = v.official;
      L.marker([v.lat, v.lon], { icon: volcanoIcon(v), pane: 'volcanoPane' })
        .bindPopup(popupNode('Gunung ' + v.name, [
          o ? 'Status resmi PVMBG: Level ' + o.roman + ', ' + o.status : 'Status resmi PVMBG: tidak tercatat',
          o && o.province ? 'Wilayah administratif: ' + o.province : null,
          v.activity
            ? 'Laporan GVP: erupsi ' + v.activity.status + (v.activity.period ? ' · ' + v.activity.period : '')
            : 'Tidak ada laporan erupsi pada laporan mingguan GVP terakhir',
          v.type ? 'Tipe: ' + v.type : null,
          v.elevM ? 'Ketinggian: ' + nf.format(v.elevM) + ' mdpl' : null,
          'Koordinat: ' + v.lat.toFixed(3) + ', ' + v.lon.toFixed(3),
          v.plumes.length
            ? 'Abu terbawa ke ' + v.plumes.map(function (p) { return compass(p.to); }).join(' / ')
            : 'Sebaran abu tidak dimodelkan (belum berstatus Siaga dan tidak dilaporkan erupsi)'
        ], { warn: (o ? o.meaning : null) || (v.activity && v.activity.summary) || null }))
        .addTo(gVolcano);
    });

    drawAshImpacted();
  }

  /**
   * Kota yang berada di dalam kerucut abu, digambar langsung di peta.
   *
   * Kerucut saja hanya menjawab "ke arah mana"; yang ingin diketahui
   * pembaca adalah "daerah mana yang kena". Nama kota dan perkiraan
   * waktu tiba ditulis di peta supaya pertanyaan itu terjawab tanpa
   * perlu membuka panel terpisah dan mencocokkan sendiri.
   */
  function drawAshImpacted() {
    var list = (state.data && state.data.ashImpacted) || [];
    if (!list.length) return;

    list.forEach(function (r) {
      var col = r.score >= 66 ? '#ef4444' : r.score >= 33 ? '#f97316' : '#eab308';
      var eta = r.etaH === null ? 'waktu tiba tidak diperkirakan'
        : r.etaH < 1 ? 'abu diperkirakan tiba <1 jam'
          : r.etaH < 24 ? 'abu diperkirakan tiba ~' + Math.round(r.etaH) + ' jam lagi'
            : 'abu diperkirakan tiba >1 hari';

      // Zona digambar poligon (bukan titik) seluas area terpapar; ukuran mengikuti
        // tingkat paparan, bukan jumlah penduduk, supaya yang menonjol adalah yang
        // paling terdampak.
        var aRad = r.score >= 66 ? 18 : r.score >= 33 ? 12 : 7;
        var aDos = zoneDossier(r.lat, r.lon, aRad, r.volcano);
        var aHead = aDos.kinds.length
          ? 'Peristiwa di lokasi sekitar zona (24 jam)'
          : 'Peristiwa di lokasi sekitar zona';
        L.polygon(zoneRingKm(r.lat, r.lon, aRad), {
          pane: 'volcanoPane',
          color: col, weight: 2, fillColor: col, fillOpacity: 0.22
        }).bindPopup(popupNode(r.name + ' \u00b7 ' + r.prov, [
          'Zona terdampak = area terpapar abu dengan radius ' + aRad + ' km dari pusat permukiman (bukan batas administratif).',
          'Tingkat paparan: ' + r.level + ' (indeks ' + r.score + ' dari 100)',
          'Sumber abu: Gunung ' + r.volcano + ' \u00b7 ' + nf.format(r.nearestKm) + ' km',
          eta,
          'Lapisan ketinggian: ' + r.layers.join(' / ') + ' km',
          r.population ? 'Penduduk: ' + nf.format(r.population) + ' jiwa' : null,
          r.officialLevel ? 'Status gunung: ' + r.officialLevel : null,
          aHead + ':'
        ].concat(aDos.rows),
          { warn: 'Perkiraan model dari angin ketinggian, bukan pengukuran sebaran abu.' }))
          .addTo(gAsh);

      // Nama kota ditulis permanen agar terbaca tanpa harus diklik.
      L.marker([r.lat, r.lon], {
        pane: 'volcanoPane',
        icon: L.divIcon({
          className: 'ash-city-label',
          html: '<span></span>',
          iconSize: [0, 0]
        })
      }).addTo(gAsh)
        .bindTooltip(r.name, {
          permanent: true, direction: 'right', offset: [8, 0],
          className: 'ash-city-tip ash-city-' + r.level.toLowerCase()
        });
    });
  }

  function loadAsh() {
    if ((!state.ashOn && !state.volcanoOn) || state.ashBusy) return Promise.resolve();
    state.ashBusy = true;
    return fetchT('/api/volcano-ash')
      .then(function (r) { if (!r.ok) throw new Error('ash'); return r.json(); })
      .then(function (d) {
        state.ash = d;
        drawAsh();
        renderAshInfo();
        var oc = d.official && d.official.counts;
        showHint(d.activeCount
          ? (d.eruptingCount || 0) + ' gunung meletus (24 jam)'
            + (oc ? ' · ' + oc.Awas + ' Awas, ' + oc.Siaga + ' Siaga, ' + oc.Waspada + ' Waspada (PVMBG)' : '') + '.'
          : 'Tidak ada gunung berstatus siaga maupun erupsi saat ini.', 6000);

      })
      .catch(function () { showHint('Gagal memuat data gunung api.'); })
      .then(function () { state.ashBusy = false; });
  }

  function renderAshInfo() {
    var box = $('ashLegend');
    if (!box) return;
    clear(box);
    if (!state.ashOn || !state.ash) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('div', 'cs-title', 'Sebaran abu vulkanik'));
    (state.ash.levels || []).forEach(function (lv) {
      var row = el('div', 'cs-row');
      var sw = el('i', 'cs-dot');
      sw.style.background = lv.color; sw.style.borderRadius = '2px';
      row.appendChild(sw);
      row.appendChild(el('span', 'cs-lab', lv.label));
      box.appendChild(row);
    });
    var oc = state.ash.official && state.ash.official.counts;
    if (oc) {
      box.appendChild(el('div', 'cs-sep'));
      [['Awas', oc.Awas, '#ef4444'], ['Siaga', oc.Siaga, '#fb923c'],
       ['Waspada', oc.Waspada, '#facc15']].forEach(function (x) {
        var row = el('div', 'cs-row');
        var sw = el('i', 'cs-dot');
        sw.style.background = x[2];
        row.appendChild(sw);
        row.appendChild(el('span', 'cs-lab', x[0]));
        row.appendChild(el('b', 'cs-val', String(x[1])));
        box.appendChild(row);
      });
    }
    var stale = state.ash.official && state.ash.official.stale;
    box.appendChild(el('div', 'cs-note',
      (state.ash.eruptingCount || 0) + ' meletus · '
      + (state.ash.monitoredCount || 0) + ' dipantau · laporan pos pengamatan PVMBG'
      + (stale ? ' · status tersimpan (MAGMA tidak merespons)' : '')));
  }

  /* ---------- citra satelit Himawari-9 (JMA, Jepang) ---------- */
  /**
   * Pemilih citra satelit menampung dua sumber yang sangat berbeda sifatnya.
   *
   * Himawari-9 menyegar tiap 10 menit tetapi resolusinya ~2 km, bagus
   * untuk melihat awan dan pergerakan abu, tidak untuk melihat kawah.
   * Sentinel-2 beresolusi 10 m sehingga bekas aliran lava terlihat, tetapi
   * satelitnya hanya melintas tiap 5 hari dan sering tertutup awan.
   *
   * Keduanya sengaja diberi awalan berbeda supaya tidak pernah tertukar,
   * dan lapisan Sentinel selalu menampilkan tanggal perekamannya.
   */
  function setHimawari(product) {
    if (state.himaTimer) { clearInterval(state.himaTimer); state.himaTimer = null; }
    state.himaPlaying = false;
    state.himaFrame = null;
    clearHimaFrames();
    if (state.himaLayer) { map.removeLayer(state.himaLayer); state.himaLayer = null; }
    if (state.s2Layer) {
      map.removeLayer(state.s2Layer);
      state.s2Layer = null;
      map.off('moveend', refreshSentinelMeta);
      map.off('zoomend', onSentinelZoom);
    }
    state.himaProduct = product;
    state.s2Product = null;
    state.s2MetaKey = null;
    // Saat citra satelit menyala, angin diredupkan agar awan tetap terbaca.
    syncWindOpacity();

    if (product && product.indexOf('s2:') === 0) {
      state.himaProduct = null;
      setSentinel(product.slice(3));
      renderHimaInfo();
      return;
    }

    if (!product) { renderHimaInfo(); return; }
    // JMA hanya menerbitkan petak hingga z=5; meminta z=6 membalas 404
    // sehingga citra hilang total begitu peta diperbesar. Dengan maxNativeZoom
    // 5, Leaflet meregangkan petak z=5 untuk zoom lebih dalam.
    state.himaLayer = L.tileLayer('/api/himawari/' + product + '/{z}/{x}/{y}.jpg', {
      pane: 'himaPane', maxNativeZoom: 5, maxZoom: 12,
      opacity: himaOpacity(product),
      attribution: 'Citra: Himawari-9 / JMA'
    }).addTo(map);
    fetchT('/api/himawari/meta')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { if (m) { state.hima = m; renderHimaInfo(); } })
      .catch(function () { /* diamkan: peta tetap berfungsi tanpa label waktu */ });
    renderHimaInfo();
  }

  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  /** Tanggal perekaman dalam WIB. Zona dihitung eksplisit, bukan zona perangkat. */
  function fmtTanggal(d) {
    var w = new Date(d.getTime() + 7 * 3600000);
    return w.getUTCDate() + ' ' + BULAN[w.getUTCMonth()] + ' ' + w.getUTCFullYear();
  }

  /**
   * Aktifkan lapisan Sentinel-2.
   *
   * Petak hanya diminta mulai zoom 8. Pada zoom lebih jauh satu petak
   * mencakup ribuan kilometer sehingga tidak menambah informasi apa pun
   * dibanding Himawari, sementara tiap permintaan tetap memakan kuota
   * Copernicus. Leaflet menangani ini lewat minZoom pada lapisan.
   */
  function setSentinel(product) {
    state.s2Product = product;
    state.s2Meta = null;

    state.s2Layer = L.tileLayer(
      '/api/sentinel/' + product + '/{z}/{x}/{y}.jpg?cloud=' + (state.s2Cloud || 30), {
        pane: 'himaPane',
        minZoom: 7,
        // Resolusi asli 10 m tercapai penuh sekitar z14. Petak di atas itu
        // tetap dilayani sampai z17 supaya pengguna bisa memeriksa kawah
        // dari dekat; di atas z17 yang bertambah hanya ukuran piksel.
        maxNativeZoom: 17,
        maxZoom: 18,
        opacity: 1,
        attribution: 'Citra: Sentinel-2 L2A &middot; Copernicus'
      }).addTo(map);

    refreshSentinelMeta();
    renderHimaInfo();

    // Peringatan zoom harus MENONJOL, bukan tersembunyi di bilah kecil
    // pojok peta.
    //
    // Petak Sentinel sengaja tidak diminta di bawah zoom 8: satu petak
    // mencakup ribuan kilometer sehingga tidak menambah informasi apa pun
    // dibanding Himawari, sementara tiap permintaan tetap memakan kuota
    // Copernicus. Tetapi dari sisi pengguna, memilih produk lalu melihat
    // peta yang sama sekali tidak berubah tampak seperti fitur yang rusak.
    if (map.getZoom() < 7) {
      showHint('Citra Sentinel-2 beresolusi 10 m dan baru dimuat mulai zoom 7. '
        + 'Perbesar peta, atau buka tab Kekeringan lalu pilih sebuah provinsi '
        + 'untuk langsung melompat ke sana.', 12000);
    }

    // Tanggal perekaman berbeda antar wilayah, jadi diperbarui setiap kali
    // pengguna berpindah tempat. Panel juga digambar ulang agar keterangan
    // "perbesar peta" hilang begitu zoom mencukupi.
    map.on('moveend', refreshSentinelMeta);
    map.on('zoomend', onSentinelZoom);
  }

  /**
   * Perbarui panel saat zoom berubah, dan beri tahu begitu ambang
   * terlampaui supaya pengguna tahu citranya sedang datang.
   */
  var s2ZoomWarned = false;
  function onSentinelZoom() {
    if (!state.s2Product) return;
    var z = map.getZoom();
    if (z >= 7 && s2ZoomWarned) {
      s2ZoomWarned = false;
      showHint('Memuat citra Sentinel-2…', 4000);
    } else if (z < 7) {
      s2ZoomWarned = true;
    }
    renderHimaInfo();
  }

  function refreshSentinelMeta() {
    if (!state.s2Product) return;
    var c = map.getCenter();
    var key = c.lat.toFixed(1) + ',' + c.lng.toFixed(1) + ':' + (state.s2Cloud || 30);
    if (state.s2MetaKey === key) return;
    state.s2MetaKey = key;

    fetchT('/api/sentinel/meta?lat=' + c.lat.toFixed(4)
      + '&lon=' + c.lng.toFixed(4) + '&cloud=' + (state.s2Cloud || 30))
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (m) {
        if (!state.s2Product) return;
        // Kegagalan metadata TIDAK boleh membuat panel tertahan di
        // "memuat..." selamanya. Citranya sendiri tetap tergambar; yang
        // hilang hanya keterangan tanggal, dan itu harus dikatakan.
        state.s2Meta = m || { available: true, metaError: true };
        if (m && m.error) state.s2Meta.metaError = true;
        renderHimaInfo();
        if (m && m.available === false) {
          showHint('Citra Sentinel-2 belum aktif: kredensial Copernicus belum dipasang '
            + 'di server. Daftar gratis di dataspace.copernicus.eu.', 9000);
        }
      })
      .catch(function () {
        if (!state.s2Product) return;
        state.s2Meta = { available: true, metaError: true };
        renderHimaInfo();
      });
  }

  function renderHimaInfo() {
    var box = $('himaInfo');
    if (!box) return;
    clear(box);

    // Sentinel-2: yang penting ditampilkan adalah TANGGAL perekaman dan
    // tutupan awannya. Tanpa itu pengguna mudah mengira sedang melihat
    // keadaan sekarang, padahal citranya bisa berumur berminggu-minggu.
    if (state.s2Product) {
      box.hidden = false;
      var P = {
        natural: 'Warna alami', swir: 'Inframerah SWIR', vegetation: 'Vegetasi',
        moisture: 'Kelembapan tanaman', water: 'Genangan air',
        flood: 'Genangan radar'
      };
      var radar = state.s2Product === 'flood';
      box.appendChild(el('span', 'hi-sat', radar ? 'Sentinel-1 SAR' : 'Sentinel-2'));
      box.appendChild(el('span', 'hi-mode', P[state.s2Product] || state.s2Product));

      var m = state.s2Meta;
      if (m && m.available === false) {
        box.appendChild(el('span', 'hi-age', 'belum dikonfigurasi'));
      } else if (m && m.displayed) {
        var d = new Date(m.displayed.at);
        box.appendChild(el('span', 'hi-time', fmtTanggal(d)));
        var hrs = m.displayedAgeHours;
        box.appendChild(el('span', 'hi-age',
          hrs != null && hrs < 48
            ? Math.round(hrs) + ' jam lalu'
            : Math.round((hrs || 0) / 24) + ' hari lalu'));
        // Radar menembus awan, jadi persentase tutupan awan tidak relevan
        // dan menampilkannya justru menyesatkan.
        if (!radar && m.displayed.cloud !== null && m.displayed.cloud !== undefined) {
          box.appendChild(el('span', 'hi-age', 'awan ' + m.displayed.cloud + '%'));
        }
        if (radar) box.appendChild(el('span', 'hi-age', 'tembus awan'));
      } else if (m && m.metaError) {
        box.appendChild(el('span', 'hi-age', 'tanggal perekaman tidak tersedia'));
      } else if (m) {
        box.appendChild(el('span', 'hi-age',
          'tidak ada citra bebas awan ' + (m.windowDays || 60) + ' hari terakhir'));
      } else {
        box.appendChild(el('span', 'hi-age', 'memuat…'));
      }

      if (map.getZoom() < 7) {
        // Ditandai berbeda dari keterangan biasa: ini bukan informasi
        // tambahan melainkan alasan mengapa layar belum berubah.
        box.appendChild(el('span', 'hi-warn', '\u26a0 perbesar peta ke zoom 7+ agar citra muncul'));
      }
      return;
    }

    if (!state.himaProduct || !state.himaLayer) { box.hidden = true; return; }
    box.hidden = false;
    var t = state.hima && state.hima.time ? new Date(state.hima.time) : null;
    var LBL = { ir: 'Inframerah', vis: 'Warna alami', ash: 'RGB Abu Vulkanik',
      dust: 'RGB Debu', wv: 'Uap air' };
    var label = LBL[state.himaProduct] || state.himaProduct;
    box.appendChild(el('span', 'hi-sat', 'Himawari-9'));
    box.appendChild(el('span', 'hi-mode', label));
    // Saat animasi berjalan, yang ditampilkan adalah waktu bingkai yang
    // sedang diputar, bukan waktu slot terbaru.
    var shown = state.himaFrame ? new Date(state.himaFrame) : t;
    if (shown) {
      // toLocaleTimeString memakai zona perangkat, sehingga label "WIB" bisa
      // salah bagi pengguna di luar WIB. Offset dihitung manual dari UTC.
      var wib = new Date(shown.getTime() + 7 * 3600000);
      box.appendChild(el('span', 'hi-time',
        pad2(wib.getUTCHours()) + '.' + pad2(wib.getUTCMinutes()) + ' WIB'));
      var mins = Math.max(0, Math.round((Date.now() - shown.getTime()) / 60000));
      box.appendChild(el('span', 'hi-age', mins < 1 ? 'baru saja' : mins + ' mnt lalu'));
    }

    var frames = state.hima && state.hima.frames;
    if (frames && frames.length > 1) {
      var btn = el('button', 'hi-play', state.himaPlaying ? '\u25a0 Hentikan' : '\u25b6 Putar 1 jam');
      btn.type = 'button';
      btn.title = state.himaPlaying
        ? 'Hentikan animasi dan kembali ke citra terbaru'
        : 'Putar enam citra terakhir untuk melihat gerak awan';
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        toggleHimaPlay();
      });
      box.appendChild(btn);
    }
  }

  /**
   * Ambil ulang citra Himawari bila JMA sudah menerbitkan slot baru.
   * Petak lama diganti hanya ketika waktunya benar-benar berubah, supaya
   * peta tidak berkedip setiap kali pengecekan dilakukan.
   */
  function syncWindOpacity() {
    var o = state.himaProduct ? '0.55' : '1';
    if (state.particles) state.particles.opts.baseOpacity = o;
    var c = document.querySelector('.wind-particle-canvas');
    if (c) c.style.opacity = o;
  }

  function refreshHimawari() {
    if (!state.himaProduct || !state.himaLayer) return;
    fetchT('/api/himawari/meta')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        if (!m || !m.time) return;
        if (state.hima && state.hima.time === m.time) { renderHimaInfo(); return; }
        state.hima = m;
        // Saat sedang memutar animasi, jangan lompat ke slot terbaru di
        // tengah pemutaran, daftar slotnya saja yang diperbarui.
        if (!state.himaPlaying && state.himaLayer) {
          state.himaFrame = null;
          state.himaLayer.setUrl('/api/himawari/' + state.himaProduct +
            '/{z}/{x}/{y}.jpg?t=' + encodeURIComponent(m.time), false);
        }
        renderHimaInfo();
      })
      .catch(function () { /* biarkan citra lama tetap tampil */ });
  }

  /**
   * Putar dua jam terakhir citra Himawari sebagai animasi.
   *
   * Satu citra diam tidak memperlihatkan apa pun tentang pergerakan awan,
   * sehingga mudah disangka beku. JMA menyimpan riwayat slot per 10 menit;
   * memutarnya berurutan membuat arah dan kecepatan gerak awan terlihat -
   * dan itulah yang sebenarnya ingin diketahui saat memantau sebaran abu.
   */
  function himaUrl(t) {
    return '/api/himawari/' + state.himaProduct
      + '/{z}/{x}/{y}.jpg?t=' + encodeURIComponent(t);
  }

  /** Bersihkan seluruh lapisan bingkai animasi. */
  function clearHimaFrames() {
    if (state.himaFrameLayers) {
      state.himaFrameLayers.forEach(function (l) {
        if (map.hasLayer(l)) map.removeLayer(l);
      });
    }
    state.himaFrameLayers = null;
  }

  function stopHimaPlay() {
    if (state.himaTimer) { clearInterval(state.himaTimer); state.himaTimer = null; }
    state.himaPlaying = false;
    state.himaFrame = null;
    clearHimaFrames();
    // Lapisan utama disembunyikan selama animasi; kembalikan opasitasnya.
    if (state.himaLayer) state.himaLayer.setOpacity(himaOpacity(state.himaProduct));
    renderHimaInfo();
  }

  function himaOpacity(product) {
    return (product === 'vis' || product === 'ash' || product === 'dust') ? 0.85 : 0.62;
  }

  /**
   * Putar animasi tanpa kedip.
   *
   * Pendekatan sebelumnya memakai setUrl() pada satu lapisan. Leaflet
   * membuang seluruh petak lama sebelum petak baru selesai diunduh,
   * sehingga peta dasar tersingkap sesaat pada setiap pergantian -
   * inilah yang membuat animasi tampak patah-patah dan sulit dibaca.
   *
   * Sekarang tiap bingkai mendapat lapisannya sendiri yang dimuat lebih
   * dulu dalam keadaan tembus pandang. Pergantian hanya menukar opasitas
   * antar lapisan yang petaknya sudah ada di peramban, jadi tidak pernah
   * ada saat di mana tidak ada citra yang tergambar.
   */
  function toggleHimaPlay() {
    if (state.himaPlaying) { stopHimaPlay(); return; }
    var f = state.hima && state.hima.frames;
    if (!f || f.length < 2 || !state.himaLayer) return;

    state.himaPlaying = true;
    renderHimaInfo();

    var op = himaOpacity(state.himaProduct);

    // Enam bingkai, bukan dua belas. Setiap bingkai menuntut 18-30 petak,
    // sehingga memuat semuanya serentak mengirim ratusan permintaan dalam
    // sekejap, cukup untuk memicu pembatasan laju dan justru membuat
    // animasi tersendat. Enam slot mencakup satu jam terakhir, rentang
    // yang sudah memperlihatkan arah gerak awan dengan jelas.
    var pick = f.slice(-6);

    var layers = pick.map(function (t) {
      return L.tileLayer(himaUrl(t), {
        pane: 'himaPane', maxNativeZoom: 5, maxZoom: 12,
        opacity: 0, className: 'hima-frame',
        // Batasi unduhan serentak agar jaringan tidak tersumbat oleh
        // bingkai belakang sementara bingkai pertama belum tampil.
        keepBuffer: 0
      }).addTo(map);
    });
    state.himaFrameLayers = layers;
    f = pick;

    // Sembunyikan lapisan utama; bingkai animasi yang mengambil alih.
    state.himaLayer.setOpacity(0);

    var i = 0;
    var step = function () {
      if (!state.himaPlaying) return;
      layers.forEach(function (l, k) { l.setOpacity(k === i ? op : 0); });
      state.himaFrame = f[i];
      renderHimaInfo();
      i = (i + 1) % layers.length;
    };

    // Beri jeda agar bingkai-bingkai awal sempat terunduh sebelum
    // pemutaran dimulai; tanpa ini putaran pertama tetap tersendat.
    var ready = 0;
    var begin = function () {
      if (!state.himaPlaying || state.himaTimer) return;
      step();
      state.himaTimer = setInterval(step, 900);
    };
    layers.forEach(function (l) {
      l.once('load', function () {
        ready++;
        if (ready >= Math.min(3, layers.length)) begin();
      });
    });
    // Jaring pengaman bila peristiwa load tidak pernah datang.
    setTimeout(begin, 4000);
  }

  /* ---------- gempa, tsunami & pengungsi ---------- */
  // Sumber: BMKG (gempa), NOAA PTWC (tsunami kawasan), BNPB GIS (pengungsi).

  function hazardCard(title, sub) {
    var c = el('div', 'hz-card');
    c.appendChild(el('div', 'hz-card-t', title));
    if (sub) c.appendChild(el('div', 'hz-card-s', sub));
    return c;
  }

  function renderHazard() {
    var panel = $('hazardPanel');
    var body = $('hazardBody');
    // Buletin tsunami kawasan dan rincian pengungsi bukan bagian dari kartu
    // "Gempa terkini". Di audit keduanya berada di bawah ketiga kartu sebagai
    // catatan kaki panel, sehingga kartu 1 tetap memuat gempa saja.
    var foot = $('hazardFoot') || body;
    var meta = $('hazardMeta');
    if (!panel || !body) return;
    var d = state.hazard;
    if (!d) { panel.hidden = true; return; }
    panel.hidden = false;
    clear(body);

    var q = d.quakes;
    var t = d.tsunami;
    var sh = d.shelters;

    // Kartu ringkas di kepala halaman ikut disegarkan dari sumber yang sama,
    // supaya tidak ada dua angka berbeda untuk kejadian yang sama.
    if ($('sQuake')) {
      $('sQuake').classList.remove('skel');
      var qc = (q && q.counts) || null;
      $('sQuake').textContent = qc ? nf.format(qc.total) : '-';
      if (q && q.latest && q.latest.magnitude !== null) {
        $('sQuakeSub').textContent = 'terkini M ' + q.latest.magnitude
          + ' · ' + String(q.latest.area || '').slice(0, 34);
      } else if (qc && !qc.total) {
        // Nol gempa dalam 24 jam adalah kabar baik, bukan kegagalan memuat.
        // Kapan terakhir kali terjadi tetap disebutkan supaya pembaca tahu
        // datanya memang hidup.
        var la = q && q.latestAny;
        $('sQuakeSub').textContent = (la && q.latestAnyAgeHours != null)
          ? 'nihil 24 jam · terakhir M ' + la.magnitude + ', '
            + Math.round(q.latestAnyAgeHours) + ' jam lalu'
          : 'tidak ada gempa tercatat 24 jam terakhir';
      } else if (qc) {
        $('sQuakeSub').textContent = qc.kuat + ' gempa M ≥ 5';
      }
    }
    if ($('sShelter')) {
      $('sShelter').classList.remove('skel');
      var tot = sh && sh.totalPeople ? sh.totalPeople : 0;
      $('sShelter').textContent = tot >= 1e6
        ? (tot / 1e6).toFixed(1).replace('.', ',') + ' jt'
        : nf.format(tot);
      var ev = (sh && sh.events && sh.events[0]) || null;
      var top = ev && ev.topAreas && ev.topAreas[0];
      if (top) {
        $('sShelterSub').textContent = 'terbanyak ' + top.area + ' · ' + nf.format(top.people) + ' jiwa';
      } else if (!tot) {
        // Nol harus terbaca sebagai "memang tidak ada", bukan "gagal muat".
        var ended0 = sh && sh.recentlyEnded && sh.recentlyEnded[0];
        $('sShelterSub').textContent = ended0 && ended0.ageDays != null
          ? 'nihil · terakhir ' + ended0.ageDays + ' hari lalu'
          : 'tidak ada pengungsian aktif';
      }
    }

    if (meta) {
      meta.textContent = 'BMKG · NOAA PTWC · BNPB'
        + (state.hazardAt ? ' · ' + state.hazardAt : '');
    }

    // Kontrol lapisan pengungsian dimatikan saat tidak ada posko aktif -
    // mencentangnya hanya akan memberi peta kosong tanpa penjelasan.
    // Begitu BNPB melaporkan pengungsi lagi, kontrolnya hidup sendiri.
    var shBox = $('lyShelter');
    if (shBox) {
      var hasShelter = !!(sh && sh.events && sh.events.length);
      var wrap = shBox.closest('.chk');
      shBox.disabled = !hasShelter;
      if (wrap) {
        wrap.classList.toggle('chk-off', !hasShelter);
        wrap.title = hasShelter ? '' : 'Tidak ada pengungsian aktif saat ini';
      }
      if (!hasShelter && shBox.checked) {
        shBox.checked = false;
        state.shelterOn = false;
        if (map.hasLayer(gShelter)) map.removeLayer(gShelter);
      }
    }

    /* --- gempa terbaru --- */
    // Kepala kartu mengikuti struktur prototipe audit: magnitudo sebagai
    // angka utama berkelas .t (15 px) dengan tingkat kegempaan di sampingnya,
    // lalu baris .s dan .m. Sebelumnya di sini disuntikkan blok .hz-block /
    // .hz-head / .hz-title / .hz-badge / .hz-main / .hz-sub / .hz-cards yang
    // tidak punya satu pun aturan CSS: magnitudo hanya tampil sebagai lencana
    // kecil, judul "Gempa terkini" muncul dua kali (markup + suntikan), dan
    // tiga angka ringkasnya menumpuk vertikal alih-alih berjajar.
    if (q && q.latest) {
      var L = q.latest;
      var isi = $('hazardBody');
      if (isi) {
        clear(isi);
        var gt = el('span', 't');
        gt.style.cssText = 'font-size:15px;display:block;margin-top:4px';
        gt.appendChild(document.createTextNode(
          'M ' + (L.magnitude !== null && L.magnitude !== undefined ? L.magnitude : '-') + ' '));
        if (L.severityLabel) {
          var gsev = el('span', 't-tertiary', L.severityLabel);
          gsev.style.cssText = 'font-weight:400;font-size:11px';
          gt.appendChild(gsev);
        }
        isi.appendChild(gt);
        isi.appendChild(el('span', 's',
          [L.area, L.dateLabel,
            L.depthKm !== null && L.depthKm !== undefined ? 'kedalaman ' + L.depthKm + ' km' : null]
            .filter(Boolean).join(' · ')));
        if (L.felt) isi.appendChild(el('span', 'm', 'Dirasakan: ' + L.felt));
        if (L.potensi) {
          var gnote = el('span', 'm');
          var gb = el('b', L.tsunami ? 't-danger' : 't-nominal',
            'Status BMKG: ' + L.potensi);
          gnote.appendChild(gb);
          isi.appendChild(gnote);
        }
      }
      // Angka ringkas mengisi .metric pada kartu "Tsunami & pengungsi" yang
      // sudah ada di markup. Sebelumnya nilainya tertulis tetap di HTML
      // (0 / 3 / 0) dan tidak pernah ikut berubah saat data bergerak.
      var mkT = $('hzTsunami'), mkQ = $('hzQuake'), mkS = $('hzStrong');
      if (mkT) mkT.textContent = nf.format(q.counts.tsunami);
      if (mkQ) mkQ.textContent = nf.format(q.counts.total);
      if (mkS) mkS.textContent = nf.format(q.counts.kuat);
    }

    /* --- tsunami / lembaga asing --- */
    if (t) {
      var tb = el('div', 'hz-block');
      var th = el('div', 'hz-head');
      th.appendChild(el('span', 'hz-title', 'Peringatan tsunami kawasan'));
      var tbadge = el('span', 'hz-badge', t.active ? 'AKTIF' : 'aman');
      tbadge.style.background = t.active ? '#ef4444' : '#22c55e';
      th.appendChild(tbadge);
      tb.appendChild(th);
      tb.appendChild(el('div', 'hz-sub',
        t.source + (t.scope ? ' · disaring untuk ' + t.scope : '')));

      if (!t.bulletins.length) {
        tb.appendChild(el('div', 'hz-note',
          'Tidak ada buletin tsunami yang menyangkut Indonesia saat ini. '
          + 'Buletin untuk kawasan Pasifik lain sengaja tidak ditampilkan.'));
      } else {
        t.bulletins.slice(0, 3).forEach(function (b) {
          var row = el('div', 'hz-bul');
          var a = el('a', 'hz-bul-t', b.title);
          if (b.url) { a.href = b.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          row.appendChild(a);
          if (b.summary) row.appendChild(el('div', 'hz-bul-s', b.summary.slice(0, 190)));
          tb.appendChild(row);
        });
      }
      foot.appendChild(tb);
    }

    /* --- pengungsi --- */
    if (sh && sh.events && sh.events.length) {
      sh.events.forEach(function (ev) {
        var sb = el('div', 'hz-block');
        var sh2 = el('div', 'hz-head');
        sh2.appendChild(el('span', 'hz-title', 'Pengungsi · ' + ev.label));
        sb.appendChild(sh2);

        var g = el('div', 'hz-cards');
        g.appendChild(hazardCard(nf.format(ev.total), 'total mengungsi'));
        g.appendChild(hazardCard(nf.format(ev.terpusat), 'di posko terpusat'));
        g.appendChild(hazardCard(nf.format(ev.mandiri), 'mengungsi mandiri'));
        g.appendChild(hazardCard(nf.format(ev.sites), 'titik pengungsian'));
        sb.appendChild(g);

        if (ev.topAreas && ev.topAreas.length) {
          var max = ev.topAreas[0].people || 1;
          ev.topAreas.forEach(function (a, i) {
            sb.appendChild(makeRow(i + 1, a.area, nf.format(a.people), 'jiwa'));
          });
        }
        sb.appendChild(el('div', 'hz-note',
          'Sumber: ' + sh.source + (ev.updatedAt ? ' · diperbarui ' + ev.updatedAt.slice(0, 10) : '')));
        foot.appendChild(sb);
      });
    } else if (sh) {
      // Tidak ada pengungsian aktif. Blok ini tetap ditampilkan agar
      // pembaca tahu datanya memang kosong, bukan gagal dimuat, dan
      // kapan terakhir kali ada pengungsi.
      var nb = el('div', 'hz-block');
      var nh = el('div', 'hz-head');
      nh.appendChild(el('span', 'hz-title', 'Pengungsi'));
      var ok = el('span', 'hz-badge', 'NIHIL');
      ok.style.background = '#22c55e';
      nh.appendChild(ok);
      nb.appendChild(nh);
      nb.appendChild(el('div', 'hz-empty',
        'Tidak ada pengungsian aktif yang dilaporkan BNPB dalam '
        + (sh.maxAgeDays || 10) + ' hari terakhir.'));

      var ended = sh.recentlyEnded || [];
      if (ended.length) {
        var last = ended[0];
        nb.appendChild(el('div', 'hz-note',
          'Terakhir tercatat: ' + last.label + ' · ' + nf.format(last.total)
          + ' jiwa · ' + timeAgo(Date.parse(last.updatedAt))
          + '. Angka itu sudah tidak menggambarkan keadaan sekarang.'));
      }
      nb.appendChild(el('div', 'hz-note', 'Sumber: ' + sh.source
        + ' · panel ini menyala sendiri begitu ada laporan pengungsi baru.'));
      body.appendChild(nb);
    }
  }

  /* ============================================================
   * KEJADIAN AKTIF
   *
   * Satu daftar lintas jenis bencana, diurutkan menurut tingkat
   * keparahan, bukan menurut jenisnya. Pengguna yang membuka halaman
   * ini ingin tahu "apa yang sedang terjadi", bukan harus memeriksa
   * empat panel terpisah satu per satu.
   * ============================================================ */

  /** Jam terbit dalam WIB. Zona dihitung eksplisit, bukan zona perangkat. */
  function fmtJamWib(ms) {
    var d = new Date(ms + 7 * 3600000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + ' '
      + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' WIB';
  }

  function timeAgo(iso) {
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return '';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'baru saja';
    if (m < 60) return m + ' menit lalu';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' jam lalu';
    return Math.round(h / 24) + ' hari lalu';
  }

  /** Kumpulkan kejadian dari semua sumber yang sudah dimuat. */
  function collectEvents() {
    var ev = [];

    // -- letusan gunung api (laporan pos pengamatan) --
    var er = state.eruptions;
    if (er && er.volcanoes) {
      er.volcanoes.forEach(function (v) {
        var det = [v.count + 'x letusan'];
        if (v.maxHeightM) det.push('kolom ' + nf.format(v.maxHeightM) + ' m di atas puncak');
        if (v.bearingLabel) det.push('condong ke ' + v.bearingLabel);
        // Kolom tinggi = ancaman penerbangan & hujan abu lebih luas.
        var sev = 60 + Math.min(30, (v.maxHeightM || 0) / 100) + Math.min(10, v.count);
        ev.push({
          kind: 'Gunung api', tone: 'volcano', severity: sev,
          title: 'Erupsi ' + v.name,
          detail: det.join(' · '),
          at: v.lastAt,
          note: v.maxHeightM ? null : 'tinggi kolom tidak teramati'
        });
      });
    }

    // -- gempa bumi --
    var hz = state.hazard;
    if (hz && hz.quakes && hz.quakes.quakes) {
      hz.quakes.quakes.slice(0, 6).forEach(function (q) {
        if (!(q.magnitude >= 5) && !q.tsunami) return;
        ev.push({
          kind: 'Gempa', tone: 'quake',
          severity: 40 + q.magnitude * 8 + (q.tsunami ? 40 : 0),
          title: 'M ' + q.magnitude + ', ' + (q.area || 'wilayah tidak disebut'),
          detail: 'kedalaman ' + (q.depthKm !== undefined && q.depthKm !== null ? q.depthKm + ' km' : '-')
            + (q.felt ? ' · dirasakan ' + String(q.felt).slice(0, 60) : ''),
          at: q.time,
          note: q.tsunami ? 'berpotensi tsunami' : (q.potensi || null)
        });
      });
    }

    // -- buletin tsunami --
    if (hz && hz.tsunami && hz.tsunami.bulletins) {
      hz.tsunami.bulletins.slice(0, 3).forEach(function (b) {
        ev.push({
          kind: 'Tsunami', tone: 'tsunami', severity: 95,
          title: b.title || 'Buletin tsunami',
          detail: b.region || b.category || 'NOAA PTWC',
          at: b.updated
        });
      });
    }

    // -- pengungsi --
    if (hz && hz.shelters && hz.shelters.events) {
      hz.shelters.events.forEach(function (e) {
        if (!e.total) return;
        var top = (e.topAreas && e.topAreas[0]) ? e.topAreas[0].area : null;
        ev.push({
          kind: 'Pengungsi', tone: 'shelter',
          severity: 50 + Math.min(35, e.total / 6000),
          title: nf.format(e.total) + ' jiwa mengungsi',
          detail: e.label + (top ? ' · terbanyak ' + top : '') + ' · ' + nf.format(e.sites) + ' titik',
          at: e.updatedAt
        });
      });
    }

    // -- kekeringan --
    var dr = state.drought;
    if (dr && dr.provinces && dr.provinces.length) {
      // Hanya provinsi berstatus kekeringan sedang ke atas yang diangkat.
      // Musim kemarau biasa bukan kejadian yang perlu diwartakan.
      var kering = dr.provinces.filter(function (p) { return p.level >= 2; });
      if (kering.length) {
        var top = kering[0];
        ev.push({
          kind: 'Kekeringan', tone: 'drought',
          severity: 35 + Math.min(30, top.dryDays / 2),
          title: nf.format(kering.length) + ' provinsi dilanda kekeringan',
          detail: 'terparah ' + top.province + ' · ' + top.dryDays + ' hari tanpa hujan'
            + (dr.enso && dr.enso.kind === 'elnino' ? ' · ' + dr.enso.phase : ''),
          at: dr.lastDate ? dr.lastDate + 'T00:00:00Z' : null
        });
      }
    }

    // -- karhutla: hanya diangkat bila memang menonjol --
    var ov = state.data;
    if (ov && ov.stats && ov.stats.hotspots > 0) {
      var prov = (ov.provinceRanking && ov.provinceRanking[0]) || null;
      ev.push({
        kind: 'Karhutla', tone: 'fire',
        severity: 30 + Math.min(35, ov.stats.hotspots / 150),
        title: nf.format(ov.stats.hotspots) + ' titik api terdeteksi',
        detail: (prov ? 'terbanyak ' + (prov.province || prov.name) : '')
          + ' · ' + nf.format(ov.stats.impactedRegions) + ' daerah terdampak asap',
        at: ov.meta ? ov.meta.updatedAt : null
      });
    }

    // Kejadian lama harus turun peringkat. Tanpa ini, pengungsian yang
    // tercatat dua pekan lalu bisa menutupi erupsi yang terjadi satu jam
    // lalu, padahal yang mendesak justru yang sedang berlangsung.
    // Pelemahan dibuat landai supaya peristiwa besar tidak langsung hilang:
    // penuh sampai 24 jam, lalu meluruh perlahan hingga separuh bobot.
    ev.forEach(function (e) {
      var days = e.at ? (Date.now() - new Date(e.at).getTime()) / 86400000 : 0;
      var decay = days <= 1 ? 1 : Math.max(0.5, 1 - (days - 1) * 0.05);
      e.severity = e.severity * decay;
    });

    return ev.sort(function (a, b) { return b.severity - a.severity; });
  }

  function renderEvents() {
    var body = $('eventsBody');
    var meta = $('eventsMeta');
    if (!body) return;
    var ev = collectEvents();
    clear(body);

    if (meta) {
      meta.textContent = ev.length
        ? ev.length + ' kejadian dipantau'
        : 'memuat…';
    }

    if (!ev.length) {
      body.appendChild(el('p', 'empty', 'Belum ada kejadian menonjol yang terpantau.'));
      return;
    }

    ev.slice(0, 8).forEach(function (e) {
      var row = el('article', 'ev ev-' + e.tone);
      var top = el('div', 'ev-top');
      top.appendChild(el('span', 'ev-kind', e.kind));
      if (e.at) top.appendChild(el('span', 'ev-age', timeAgo(e.at)));
      row.appendChild(top);
      row.appendChild(el('h3', 'ev-title', e.title));
      row.appendChild(el('p', 'ev-detail', e.detail));
      if (e.note) row.appendChild(el('p', 'ev-note', e.note));
      body.appendChild(row);
    });
  }

  function loadEruptions() {
    return fetchT('/api/eruptions')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) { state.eruptions = d; renderEvents(); } })
      .catch(function () { /* panel kejadian tetap tampil dari sumber lain */ });
  }

  /**
   * Angka korban dari berita. Dipisah visual dari data resmi BNPB dan
   * setiap angka menautkan artikel sumbernya agar bisa diverifikasi.
   */
  function renderCasualties() {
    var box = $('casualtyBox');
    if (!box) return;
    clear(box);
    var c = state.casualties;
    if (!c || !c.items || !c.items.length) { box.hidden = true; return; }
    box.hidden = false;

    var hd = el('div', 'hz-head');
    hd.appendChild(el('span', 'hz-title', 'Korban menurut laporan media'));
    var b = el('span', 'hz-badge', 'BELUM RESMI');
    b.style.background = '#a78bfa';
    hd.appendChild(b);
    box.appendChild(hd);

    box.appendChild(el('div', 'hz-note hz-warn', c.caution));

    var grid = el('div', 'cas-grid');
    c.items.forEach(function (i) {
      var card = el('div', 'cas-item');
      card.appendChild(el('div', 'cas-n', nf.format(i.value)));
      card.appendChild(el('div', 'cas-l', i.label));
      card.appendChild(el('div', 'cas-q', '“' + i.quote + '”'));
      var a = el('a', 'cas-src', (i.domain || 'sumber') + ' →');
      if (i.url) { a.href = i.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      a.title = i.title || '';
      card.appendChild(a);
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  function loadCasualties() {
    return fetchT('/api/casualties')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) { state.casualties = d; renderCasualties(); } })
      .catch(function () { /* panel disembunyikan bila gagal */ });
  }

  /** Panel transparansi: kapan tiap sumber terakhir berhasil diperbarui. */
  function renderStatus() {
    var panel = $('statusPanel');
    var body = $('statusBody');
    var meta = $('statusMeta');
    if (!panel || !body) return;
    var s = state.status;
    if (!s || !s.tasks) { panel.hidden = true; return; }
    panel.hidden = false;
    clear(body);
    if (meta) meta.textContent = s.healthy + '/' + s.total + ' sumber aktif · ' + s.mode;
    // Angka kepala & metrik panel dulu tertulis statis di HTML ("9/9", "0",
    // "1 / 0") dan tak pernah disentuh JS, kini seluruhnya ikut status.
    function put(id, txt) { var n = $(id); if (n) n.textContent = txt; }
    var frac = s.total ? s.healthy / s.total : 0;
    put('srcTxt', s.healthy + '/' + s.total + ' sumber aktif');
    put('srcHealthy', s.healthy + '/' + s.total);
    put('srcQ429', s.quota ? String(s.quota['429'] || 0) : '-');
    put('srcQ5xx', s.quota ? String(s.quota['5xx'] || 0) : '-');
    put('srcRuns', s.summary ? s.summary.totalRuns + ' / ' + s.summary.totalFails : '-');
    var chipDot = $('srcDot');
    if (chipDot) {
      chipDot.className = 'dot ' + (frac >= 1 ? 'd-nominal' : frac >= .5 ? 'd-caution'
        : frac > 0 ? 'd-alert' : 'd-danger');
    }

    // Fase 2.2: alert kritis menonjol di atas
    if (s.criticalAlerts && s.criticalAlerts.length) {
      var alertBox = el('div', 'st-alert-box');
      
      alertBox.appendChild(el('div', '', '⚠️ ' + s.criticalAlerts.length + ' tugas kritis gagal berturut:'));
      s.criticalAlerts.forEach(function (a) {
        alertBox.appendChild(el('div', '', '• ' + a.id + ': ' + a.message));
      });
      body.appendChild(alertBox);
    }

    // Fase 2.2: ringkasan kuota & log
    if (s.quota || s.summary) {
      var qBox = el('div', 'st-quota');
      
      if (s.quota) {
        var qText = 'Kuota: 429=' + (s.quota['429']||0) + ' · 5xx=' + (s.quota['5xx']||0) + ' · total=' + (s.quota.total||0);
        if (s.quota.last429At) qText += ' · terakhir 429: ' + s.quota.last429At.slice(11,19);
        qBox.appendChild(el('span', '', qText));
      }
      if (s.summary) {
        qBox.appendChild(el('span', '', 'Runs: ' + s.summary.totalRuns + ' · Fails: ' + s.summary.totalFails));
      }
      body.appendChild(qBox);
    }

    // Baris per sumber mengikuti bentuk audit: .kv dengan label di kiri dan
    // waktu di kanan (justify-content:space-between sudah ada di app.css).
    // Sebelumnya tiap sumber dibungkus kartu .st-card berisi .st-top, .st-dot,
    // .st-name, .st-age, .st-every, lima kelas tanpa satu pun aturan CSS -
    // sehingga label dan waktunya menempel menjadi "Gempa bumi (BMKG)1 menit
    // lalu" dan bintang penanda tugas kritis menggantung di ujung teks.
    var onDemandMode = /penjadwal luar/.test(s.mode || '');
    // Kebohongan yang harus dicegah #2: di serverless, /api/status bisa
    // dijawab salinan server yang belum pernah melayani permintaan data ini,
    // sementara halaman jelas sedang memakai data segar. Jadi umur DATA YANG
    // DITAMPILKAN (stempel tiap payload) ikut menentukan status, bukan hanya
    // umur scheduler salinan server yang menjawab /api/status.
    function feedStamp(id) {
      var d = state.data, hz = state.hazard;
      var ov = d && d.meta && d.meta.updatedAt;
      var hzt = hz && hz.updatedAt;
      var m = {
        hotspots: (d && d.hotspots) ? ov : null,
        volcano: (state.ash && state.ash.updatedAt) || (d && d.volcano ? ov : null),
        pvmbg: (d && d.volcano) ? ov : null,
        // 'eruption' sengaja tanpa pemetaan: tidak ada feed halaman yang
        // membuktikannya, kalau scheduler gagal, biarkan barisnya jujur.
        quake: (hz && hz.quakes && hz.quakes.quakes && hz.quakes.quakes.length) ? hzt : null,
        tsunami: (hz && hz.tsunami) ? hzt : null,
        shelter: (hz && hz.shelters && hz.shelters.events && hz.shelters.events.length) ? hzt : null,
        news: state.newsAt || null,
        drought: state.droughtAt ? new Date(state.droughtAt).toISOString() : null
      };
      var v = m[id];
      var t0 = v ? Date.parse(v) : NaN;
      return isNaN(t0) ? null : t0;
    }
    function agoLabel(ms) {
      var sc = Math.round(ms / 1000);
      if (sc < 90) return sc + ' detik lalu';
      var mi = Math.round(sc / 60);
      if (mi < 90) return mi + ' menit lalu';
      return Math.round(mi / 60) + ' jam lalu';
    }
    s.tasks.forEach(function (t) {
      var row = el('div', 'kv');
      // el(tag, cls, text), argumen kedua adalah KELAS, bukan teks.
      var lab = el('span', null, t.label);
      if (t.critical) {
        var star = el('b', 't-alert', ' ★');
        star.title = 'Tugas kritis';
        lab.appendChild(star);
      }
      if (!t.healthy) lab.classList.add('st-bad');
      row.appendChild(lab);
      // Status ditulis dengan kata yang berarti, bukan sekadar umur:
      // penguna harus bisa membedakan "hidup", "lambat", "masih cache
      // terakhir" dan "tidak aktif", tanpa perlu menebak dari angka.
      var late = t.ageMs != null && t.everyMs > 0 && t.ageMs > t.everyMs * 2.5;
      var fAt = feedStamp(t.id);
      var fAge = fAt != null ? Date.now() - fAt : null;
      var fedFresh = fAge != null && fAge <= Math.max(t.everyMs * 3, 30 * 60000);
      var right;
      if (fedFresh && !t.hasData) right = 'AKTIF · data di halaman ' + agoLabel(fAge);
      else if (!t.hasData && t.runs === 0 && onDemandMode) right = 'ON-DEMAND · belum diminta';
      else if (!t.hasData) right = 'TIDAK AKTIF';
      else if (!t.healthy) right = 'CACHE ' + t.ageLabel;
      else if (late) right = 'TERLAMBAT · ' + t.ageLabel;
      else right = 'AKTIF · ' + t.ageLabel;
      if (t.consecutiveFails) right += ' · gagal ' + t.consecutiveFails + '×';
      // Sejak penjadwal menjeda sumber yang terus gagal, lambatnya pembaruan
      // punya sebab yang harus terbaca, bukan sumber yang diam-diam lupa.
      if (t.backoff) right += ' · dijeda 30 mnt agar sumber tak dihujani';
      var rightEl = el('b', null, right);
      if (!t.healthy || late) rightEl.classList.add('kv-bad');
      row.appendChild(rightEl);
      row.title = t.everyLabel + ' · run ' + t.runs + '/' + t.fails +
        (fAge != null ? ' · data di halaman ' + agoLabel(fAge) : '') +
        (t.lastErrorAt ? ' · galat terakhir ' + t.lastErrorAt.slice(11, 19) + ' UTC' : '');
      body.appendChild(row);
      if (t.alert) body.appendChild(el('div', 'st-task-alert', t.alert));
      if (t.errorNote && (!t.healthy || !t.hasData)) {
        body.appendChild(el('div', 'st-task-alert',
          'Penyebab: ' + t.errorNote + ', angka dari sumber ini belum terverifikasi saat ini.'));
      }
    });
    if (onDemandMode) {
      body.appendChild(el('div', 'st-ondemand',
        'Host ini memakai penjadwal luar: sumber disegarkan saat datanya diminta. ' +
        'Baris "AKTIF · data di halaman …" diukur dari stempel data yang SEDANG Anda ' +
        'baca; "ON-DEMAND · belum diminta" berarti salinan server yang menjawab status ' +
        'belum menerima permintaan itu, bukan bahwa sumbernya mati.'));
    }

    // Fase 2.2: log terstruktur terbaru
    if (s.recentLogs && s.recentLogs.length) {
      var logBox = el('div', 'st-logs');
      
      var logTitle = el('div', '', 'Log terbaru:');
      
      logBox.appendChild(logTitle);
      s.recentLogs.slice(0,10).forEach(function (lg) {
        var l = el('div', 'st-log');
      l.className = 'st-log st-log-' + (lg.level || 'info');
        l.textContent = (lg.at?lg.at.slice(11,19):'') + ' [' + (lg.level||'info') + '] ' + (lg.task||'') + ' ' + (lg.message||'').slice(0,120);
        l.title = JSON.stringify(lg);
        logBox.appendChild(l);
      });
      body.appendChild(logBox);
    }
  }

  function loadStatus() {
    return fetchT('/api/status')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) { state.status = d; renderStatus(); } })
      .catch(function () { /* diamkan */ });
  }

  /**
   * Kekeringan & status El Nino.
   *
   * Disegarkan jarang karena kekeringan berkembang dalam hitungan minggu
   * dan arsip curah hujannya sendiri tertinggal sehari.
   */
  function loadDrought() {
    return fetchT('/api/drought')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || d.error) return;
        state.drought = d;
        state.droughtAt = Date.now();
        renderEvents();
        renderDroughtCard();
        renderDryList();
      })
      .catch(function () { /* panel lain tetap berjalan */ });
  }

  function renderDroughtCard() {
    var d = state.drought;
    var val = $('sDrought');
    var sub = $('sDroughtSub');
    if (!val || !sub) return;
    val.classList.remove('skel');

    if (!d) { val.textContent = '-'; return; }

    val.textContent = nf.format(d.affectedCount || 0);

    // Status ENSO ditulis sebagai konteks, bukan sebagai sebab. El Nino
    // meningkatkan peluang kemarau panjang tetapi tidak menentukannya,
    // dan angka provinsi di sebelahnya dihitung dari hujan yang benar-
    // benar terukur.
    var parts = [];
    if (d.worst && d.worst.dryDays > 0) {
      parts.push('terkering ' + d.worst.province + ' ' + d.worst.dryDays + ' hari');
    }
    if (d.enso && d.enso.kind !== 'netral') {
      parts.push(d.enso.phase + ' (ONI ' + d.enso.oni.toFixed(1) + ')');
    } else if (d.enso) {
      parts.push('ENSO netral');
    }
    sub.textContent = parts.length ? parts.join(' · ') : 'tidak ada provinsi kering';
  }

  function loadHazard() {
    return fetchT('/api/hazard')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('hz')); })
      .then(function (d) {
        state.hazard = d;
        state.hazardAt = new Date().toLocaleTimeString('id-ID',
          { hour: '2-digit', minute: '2-digit' });
        renderHazard();
        renderEvents();
        drawQuakes();
        drawShelters();
      })
      .catch(function () { /* panel disembunyikan bila data tidak tersedia */ });
  }

  /** Lingkaran gempa: ukuran mengikuti magnitudo agar cepat terbaca. */
  function drawQuakes() {
    gQuake.clearLayers();
    if (!state.quakeOn || !state.hazard || !state.hazard.quakes) return;
    state.hazard.quakes.quakes.forEach(function (q) {
      if (q.magnitude === null) return;
      var r = Math.max(5, Math.pow(q.magnitude, 2) * 0.9);
      L.circleMarker([q.lat, q.lon], {
        pane: 'volcanoPane', radius: r,
        color: q.color, weight: 1.6, opacity: 0.95,
        fillColor: q.color, fillOpacity: 0.22
      }).bindPopup(popupNode('Gempa M ' + q.magnitude, [
        q.area,
        q.dateLabel,
        q.depthKm !== null ? 'Kedalaman: ' + q.depthKm + ' km' : null,
        q.potensi ? 'Status: ' + q.potensi : null,
        q.felt ? 'Dirasakan: ' + q.felt : null
      ], { warn: q.tsunami ? 'BMKG menyatakan gempa ini BERPOTENSI TSUNAMI.' : null }))
        .addTo(gQuake);
    });
  }

  function drawShelters() {
    gShelter.clearLayers();
    if (!state.shelterOn || !state.hazard || !state.hazard.shelters) return;
    (state.hazard.shelters.events || []).forEach(function (ev) {
      (ev.points || []).forEach(function (p) {
        var r = Math.max(4, Math.min(18, Math.sqrt(p.jumlah) / 3));
        L.circleMarker([p.lat, p.lon], {
          pane: 'volcanoPane', radius: r,
          color: '#38bdf8', weight: 1.2, opacity: 0.9,
          fillColor: '#38bdf8', fillOpacity: 0.25
        }).bindPopup(popupNode('Pengungsian · ' + (p.desa || p.kec), [
          'Jumlah: ' + nf.format(p.jumlah) + ' jiwa',
          p.kec ? 'Kecamatan: ' + p.kec : null,
          p.kab ? 'Kabupaten: ' + p.kab : null,
          p.jenis ? 'Jenis: ' + p.jenis : null,
          'Kejadian: ' + ev.label
        ], { warn: 'Data resmi BNPB; angka dapat berubah mengikuti laporan BPBD.' }))
          .addTo(gShelter);
      });
    });
  }

  function airAdvice(aqi) {
    var lg = (state.air && state.air.legend) || [];
    for (var i = 0; i < lg.length; i++) {
      if (lg[i].upto === null || aqi <= lg[i].upto) return lg[i].advice;
    }
    return '';
  }

  function airStepFor(z) {
    return z >= 10 ? 0.25 : z >= 9 ? 0.5 : z >= 7 ? 1 : 1.5;
  }

  // Fase 1.3: fetch dengan retry backoff + jitter untuk klien (3 percobaan)
  function fetchTRetry(url, opts, ms, retries) {
    ms = ms || 12000;
    retries = retries || 3;
    var attempt = 0;
    function tryOnce() {
      return fetchT(url, opts, ms).then(function (r) {
        // 429 atau 5xx → retry
        if ((r.status === 429 || (r.status >= 500 && r.status <= 599)) && attempt < retries - 1) {
          attempt++;
          var backoff = Math.pow(2, attempt - 1) * 600 + Math.random() * 300;
          var retryAfter = r.headers.get('Retry-After');
          if (retryAfter) {
            var sec = Number(retryAfter);
            if (isFinite(sec)) backoff = Math.max(backoff, sec * 1000);
          }
          return new Promise(function (res) { setTimeout(res, backoff); }).then(tryOnce);
        }
        return r;
      }).catch(function (e) {
        if (attempt < retries - 1) {
          attempt++;
          var backoff = Math.pow(2, attempt - 1) * 600 + Math.random() * 300;
          return new Promise(function (res) { setTimeout(res, backoff); }).then(tryOnce);
        }
        throw e;
      });
    }
    return tryOnce();
  }

  function loadAir() {
    if (!state.airOn) return Promise.resolve();
    var step = airStepFor(map.getZoom());
    var b = map.getBounds();
    var q = 'step=' + step;
    if (step < 1.5) {
      q += '&west=' + b.getWest().toFixed(2) + '&south=' + b.getSouth().toFixed(2) +
           '&east=' + b.getEast().toFixed(2) + '&north=' + b.getNorth().toFixed(2);
    }
    // Fase 2.5: jika key sama, tetap redraw karena filter AQI mungkin berubah, jangan skip renderAirLegend
    if (state.airKey === q) {
      drawAir();
      renderAirLegend();
      try { if (typeof updateAirCfg === 'function') updateAirCfg(); } catch (e) {}
      return Promise.resolve();
    }
    // Jika sedang sibuk, simpan pending agar tidak miss update saat geser peta cepat
    if (state.airBusy) {
      state.airPendingQ = q;
      return Promise.resolve();
    }
    state.airBusy = true;
    showHint('Memuat data kualitas udara…');
    return fetchTRetry('/api/air-quality?' + q, { headers: { Accept: 'application/json' } }, 15000, 3)
      .then(function (r) {
        if (r.status === 429) {
          return r.json().then(function (j) {
            var sec = j.retryAfter || 60;
            showHint('Kuota udara tercapai, coba lagi ' + sec + ' detik. Memakai cache terakhir.', 8000);
            // Jika ada cache lama, tetap gambar, jangan kosongkan
            if (state.air) { drawAir(); renderAirLegend(); try { if (typeof updateAirCfg === 'function') updateAirCfg(); } catch (e) {} }
            return Promise.reject(new Error('quota'));
          });
        }
        return r.ok ? r.json() : Promise.reject(new Error('x'));
      })
      .then(function (d) {
        state.air = d;
        state.airKey = q;
        drawAir();
        renderAirLegend();
        try { if (typeof updateAirCfg === 'function') updateAirCfg(); } catch (e) {}
        showHint(d.count
          ? nf.format(d.count) + ' sel kualitas udara (filter: ' + nf.format(state.airFilteredCount) + ' tampil) · model CAMS via Open-Meteo.'
          : 'Tidak ada data kualitas udara pada area ini.', 5000);
      })
      .catch(function (err) {
        if (err && err.message === 'quota') {
          // sudah ditangani di atas, jangan tampilkan gagal lagi
        } else {
          showHint('Gagal memuat data kualitas udara. Akan coba lagi saat peta digeser.', 6000);
        }
      })
      .then(function () {
        state.airBusy = false;
        // Jika ada pending request saat sibuk tadi, jalankan sekarang
        if (state.airPendingQ && state.airPendingQ !== state.airKey) {
          var pending = state.airPendingQ;
          state.airPendingQ = null;
          // Panggil ulang, akan cek key lagi
          if (state.airOn) loadAir();
        } else {
          state.airPendingQ = null;
        }
      });
  }

  // Legenda AQI muncul hanya saat lapisan aktif, Fase 2.5 UI friendly + filter interaktif
  function renderAirLegend() {
    var box = $('airLegend');
    if (!box) return;
    clear(box);
    if (!state.airOn || !state.air || !state.air.legend) { box.hidden = true; return; }
    box.hidden = false;

    var total = state.air.count || (state.air.points ? state.air.points.length : 0);
    var filtered = state.airFilteredCount || total;
    var minAqi = state.airMinAqi || 0;

    // Header dengan count
    var head = el('div', 'cs-title');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px';
    var titleSpan = el('span', '', 'Kualitas udara (US AQI)');
    var countSpan = el('span', 'cs-count');
    countSpan.style.cssText = 'font-size:10px;color:var(--tx-faint);font-weight:400';
    countSpan.textContent = filtered === total ? nf.format(total) + ' sel' : nf.format(filtered) + '/' + nf.format(total) + ' sel';
    head.appendChild(titleSpan);
    head.appendChild(countSpan);
    box.appendChild(head);

    // Filter info jika aktif
    if (minAqi > 0) {
      var filterInfo = el('div', 'cs-filter-info');
      filterInfo.style.cssText = 'font-size:10px;color:#fbbf24;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.25);border-radius:6px;padding:4px 7px;margin:4px 0 6px;display:flex;justify-content:space-between;align-items:center';
      filterInfo.appendChild(el('span', '', 'Filter: AQI ≥ ' + minAqi));
      var clearBtn = el('button', 'cs-clear');
      clearBtn.type = 'button';
      clearBtn.textContent = '✕ Reset';
      clearBtn.style.cssText = 'background:none;border:0;color:#fbbf24;font-size:10px;cursor:pointer;padding:0 2px';
      clearBtn.addEventListener('click', function () {
        state.airMinAqi = 0;
        var sel = $('airAqiSel');
        if (sel) sel.value = '0';
        drawAir();
        renderAirLegend();
        showHint('Filter AQI direset, menampilkan semua ' + nf.format(total) + ' sel.', 3000);
      });
      filterInfo.appendChild(clearBtn);
      box.appendChild(filterInfo);
    }

    // Hitung count per kategori untuk ditampilkan di legenda
    var catCounts = {};
    if (state.air.points) {
      state.air.points.forEach(function (p) {
        var cat = p.label || 'Tidak diketahui';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });
    }

    state.air.legend.forEach(function (b, i) {
      var prev = i ? state.air.legend[i - 1].upto : -1;
      var range = b.upto === null ? '> ' + prev : (prev + 1) + '-' + b.upto;
      var row = el('div', 'cs-row');
      row.style.cssText = 'cursor:pointer;padding:2px 4px;border-radius:5px;transition:background 0.15s';
      // Highlight jika row ini sesuai filter aktif
      var isActive = minAqi > 0 && b.upto !== null && b.upto >= minAqi && (i === 0 || state.air.legend[i-1].upto < minAqi) || (b.upto === null && minAqi > (i ? state.air.legend[i-1].upto : 0)) || (minAqi === 0);
      // Simpler: highlight semua yang lolos filter
      var rowMin = i ? state.air.legend[i-1].upto + 1 : 0;
      var rowMax = b.upto === null ? 999 : b.upto;
      var passes = rowMax >= minAqi;
      if (!passes) row.style.opacity = '0.35';
      if (passes && minAqi > 0) row.style.background = 'rgba(255,255,255,0.06)';

      var sw = el('i', 'cs-dot'); sw.style.background = b.color; sw.style.borderRadius = '3px'; sw.style.width = '12px'; sw.style.height = '12px'; sw.style.flexShrink = '0';
      row.appendChild(sw);
      var lab = el('span', 'cs-lab', b.label);
      lab.style.cssText = 'flex:1;font-size:11px';
      row.appendChild(lab);
      var cnt = catCounts[b.label] || 0;
      var num = el('b', 'cs-num', cnt ? nf.format(cnt) + ' · ' + range : range);
      num.style.cssText = 'font-size:10px;color:var(--tx-faint);white-space:nowrap';
      row.appendChild(num);

      // Klik baris legenda untuk filter ke kategori tersebut
      row.title = 'Klik untuk filter AQI ≥ ' + rowMin;
      row.addEventListener('click', function () {
        state.airMinAqi = rowMin;
        var sel = $('airAqiSel');
        if (sel) {
          // Cari option terdekat
          var opts = [0, 50, 100, 150, 200, 300];
          var closest = opts.reduce(function (a, b) { return Math.abs(b - rowMin) < Math.abs(a - rowMin) ? b : a; });
          sel.value = String(closest);
          state.airMinAqi = closest;
        }
        drawAir();
        renderAirLegend();
        showHint('Filter AQI ≥ ' + state.airMinAqi + ', ' + nf.format(state.airFilteredCount) + ' sel ditampilkan. Klik Reset untuk tampil semua.', 4000);
      });

      box.appendChild(row);
    });

    // Footer: sumber + update time
    var foot = el('div', 'cs-foot');
    foot.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid var(--line);font-size:9.5px;color:var(--tx-faint);line-height:1.4';
    if (state.air.updatedAt) {
      var upd = new Date(state.air.updatedAt);
      foot.appendChild(el('div', '', 'Update: ' + upd.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB · CAMS via Open-Meteo'));
    } else {
      foot.appendChild(el('div', '', 'Sumber: CAMS via Open-Meteo · Skala US EPA'));
    }
    if (state.air.step) {
      foot.appendChild(el('div', '', 'Resolusi: ' + state.air.step + '° (~' + Math.round(state.air.step * 111) + ' km) · Zoom untuk detail'));
    }
    box.appendChild(foot);
  }

  /* ---------- medan angin ---------- */
  // Warna panah mengikuti kecepatan (biru tenang -> merah kencang).
  function windColor(s) {
    return s >= 8 ? '#f87171' : s >= 5 ? '#fb923c' : s >= 3 ? '#fbbf24' : s >= 1.5 ? '#5eead4' : '#7dd3fc';
  }
  function windLabel(s) {
    return s >= 8 ? 'kencang' : s >= 5 ? 'sedang-kencang' : s >= 3 ? 'sedang' : s >= 1.5 ? 'lemah' : 'tenang';
  }
  function compass(deg) {
    var a = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'];
    return a[Math.round((deg % 360) / 45) % 8];
  }


  function drawWind() {
    gWind.clearLayers();
    if (!state.wind) return;

    // Aliran angin bergaya Windy (animasi garis arus). Mode panah dihapus.
    if (!state.particles) state.particles = new WindParticles(map, { fade: 0.16, density: 1900 });
    state.particles.setField(state.wind);
    if (state.windOn) state.particles.start();

  }

  // Kerapatan grid mengikuti zoom agar panah tetap terlihat saat diperbesar.
  function windStepFor(z) {
    // Grid GFS aslinya 1 derajat; meminta lebih rapat dari itu tidak
    // menambah informasi, hanya memperbesar hasil.
    return z >= 8 ? 1 : z >= 6 ? 1.5 : z >= 4 ? 2 : 3;
  }

  /**
   * Aras angin yang benar-benar dipakai.
   *
   * Pada mode AUTO, ketinggian mengikuti abu yang sedang digambar. Ini
   * menyelesaikan sumber kebingungan utama: sebelumnya layer angin selalu
   * menggambarkan permukaan 10 m, sementara abu dimodelkan pada 3-10 km.
   * Perbedaan arah di antara keduanya benar secara meteorologi, tetapi
   * tidak ada cara bagi pengguna untuk mengetahuinya.
   */
  /**
   * Badge ketinggian angin di atas peta.
   *
   * Tanpa ini, pengguna tidak punya cara mengetahui bahwa panah angin
   * menggambarkan lapisan atmosfer yang berbeda dari abu, dan menyimpulkan
   * aplikasinya keliru padahal keduanya benar.
   */
  function renderWindBadge() {
    var box = $('windBadge');
    if (!box) return;
    clear(box);
    var m = state.windMeta;
    if (!state.windOn || !m) { box.hidden = true; return; }
    box.hidden = false;

    box.appendChild(el('span', 'wb-lab', 'ANGIN'));
    box.appendChild(el('span', 'wb-h', m.levelLabel || 'permukaan'));
    if (state.windLevel === 'auto') {
      box.appendChild(el('span', 'wb-auto', 'AUTO \u2014 ikut abu'));
    }
    box.appendChild(el('span', 'wb-src', m.hPa ? 'Open-Meteo' : 'NOAA GFS'));
    box.appendChild(el('span', 'wb-mode', 'MODEL'));
  }

  function resolveWindLevel() {
    if (state.windLevel !== 'auto') return state.windLevel;

    // Cari pluma abu tertinggi yang sedang aktif.
    var tinggiM = null;
    var ash = state.ash && state.ash.active;
    if (state.ashOn && ash) {
      for (var i = 0; i < ash.length; i++) {
        var pl = ash[i].plumes || [];
        for (var k = 0; k < pl.length; k++) {
          var h = pl[k].windHeightM || (pl[k].altKm ? pl[k].altKm * 1000 : null);
          if (h && (tinggiM === null || h > tinggiM)) tinggiM = h;
        }
      }
    }
    // Tanpa abu aktif, permukaan adalah pilihan yang wajar: itulah angin
    // yang membawa asap karhutla, lapisan lain yang paling sering dilihat.
    if (tinggiM === null) return '10m';

    var pilih = [[1000, '10m'], [2200, '850'], [3600, '700'],
      [4900, '600'], [7400, '500'], [99999, '300']];
    for (var j = 0; j < pilih.length; j++) {
      if (tinggiM <= pilih[j][0]) return pilih[j][1];
    }
    return '300';
  }

  function loadWind() {
    if (!state.windOn || state.windBusy) return Promise.resolve();
    var z = map.getZoom();
    var step = windStepFor(z);
    var b = map.getBounds();
    var lvl = resolveWindLevel();
    state.windLevelUsed = lvl;
    var q = 'step=' + step + '&level=' + lvl;
    // Medan angin GFS mencakup seluruh dunia. Saat diperbesar kita minta
    // hanya area yang terlihat agar kerapatannya naik tanpa memperbesar hasil;
    // saat menjauh, ambil global supaya angin tidak terpotong di tepi peta.
    if (step < 2) {
      q += '&west=' + b.getWest().toFixed(2) + '&south=' + b.getSouth().toFixed(2) +
           '&east=' + b.getEast().toFixed(2) + '&north=' + b.getNorth().toFixed(2);
    }
    if (state.windKey === q) {
      // Data yang sama masih tersimpan, jadi tidak perlu diambil ulang -
      // tetapi pengguna baru saja menyalakan lapisan dan tetap berhak
      // memperoleh konfirmasi bahwa ada sesuatu yang tergambar.
      drawWind();
      var n = state.wind && state.wind.count;
      showHint(n
        ? nf.format(n) + ' titik medan angin · ' + ((state.wind && state.wind.source) || 'NOAA GFS')
          + '. Garis mengalir ke arah asap terbawa.'
        : 'Tidak ada data angin pada area ini.', 5000);
      return Promise.resolve();
    }
    state.windBusy = true;
    showHint('Memuat arah angin…');
    return fetchT('/api/wind-field?' + q, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
      .then(function (d) {
        state.wind = d;
        state.windMeta = d;
        state.windKey = q;
        drawWind();
        renderWindBadge();
        showHint(d.count
          ? nf.format(d.count) + ' titik medan angin · ' + (d.source || 'NOAA GFS') + '. Garis mengalir ke arah asap terbawa.'
          : 'Tidak ada data angin pada area ini.', 5000);

      })
      .catch(function () { showHint('Gagal memuat data arah angin.'); })
      .then(function () { state.windBusy = false; });
  }

  /* ---------- batas konsesi ---------- */
  var CONC_COLOR = { sawit: '#ff9f1c', kayu: '#34d399', hph: '#7aa7ff', tambang: '#a78bfa', rspo: '#2dd4bf' };

  /**
   * Pesan singkat di atas peta.
   *
   * Timer penyembunyi milik pesan sebelumnya wajib dibatalkan. Tanpa itu,
   * pesan lapisan yang baru dinyalakan bisa lenyap oleh hitungan mundur
   * lapisan sebelumnya, atau lebih buruk: lapisan yang tidak menulis
   * pesannya sendiri membiarkan teks lapisan lain tetap terbaca. Pengguna
   * lalu menyalakan lapisan gempa dan membaca statistik gunung api.
   */
  var hintTimer = null;
  function showHint(msg, autoHideMs) {
    var h = $('mapHint');
    if (!h) return;
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    h.style.bottom = (state.airOn ? '150px' : '');
    if (!msg) { h.hidden = true; h.textContent = ''; return; }
    h.hidden = false;
    h.textContent = msg;
    if (autoHideMs) {
      hintTimer = setTimeout(function () {
        hintTimer = null;
        h.hidden = true;
        h.textContent = '';
      }, autoHideMs);
    }
  }

  function loadConcessions() {
    if (!state.concOn) return;
    var z = map.getZoom();
    if (z < 6) { gConc.clearLayers(); showHint('Perbesar peta (zoom 6+) untuk menampilkan batas konsesi.'); return; }
    if (state.concBusy) return;
    state.concBusy = true;
    showHint('Memuat batas konsesi…');
    var b = map.getBounds();
    var q = 'west=' + b.getWest().toFixed(3) + '&south=' + b.getSouth().toFixed(3) +
            '&east=' + b.getEast().toFixed(3) + '&north=' + b.getNorth().toFixed(3);
    fetchT('/api/concessions?' + q, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
      .then(function (fc) {
        gConc.clearLayers();
        if (fc.tooWide) { showHint('Area terlalu luas, perbesar peta untuk melihat batas konsesi.'); return; }
        if (!fc.features || !fc.features.length) { showHint('Tidak ada batas konsesi terdata pada area ini.'); return; }
        fc.features.forEach(function (f) {
          var p = f.properties;
          var col = CONC_COLOR[p.badge] || '#7cc4ff';
          var latlngs = f.geometry.coordinates.map(function (ring) {
            return ring.map(function (c) { return [c[1], c[0]]; });
          });
          L.polygon(latlngs, {
            color: col, weight: 1.2, opacity: 0.8, dashArray: '5,4',
            fillColor: col, fillOpacity: 0.02
          }).bindPopup(unitPopup(p)).addTo(gConc);
        });
        showHint(nf.format(fc.features.length) + ' unit lahan pada tampilan ini. Klik poligon untuk detail.');
      })
      .catch(function () { showHint('Gagal memuat batas konsesi.'); })
      .then(function () { state.concBusy = false; });
  }

  function unitPopup(p) {
    var rows = [];
    if (p.company && p.company !== p.name) rows.push('Perusahaan: ' + p.company);
    if (p.group) rows.push('Grup korporasi: ' + p.group);
    if (p.tenure) rows.push('Jenis alas hak: ' + p.tenure);
    if (p.licenseId) rows.push('Nomor izin: ' + p.licenseId);
    if (p.status) rows.push('Status: ' + p.status);
    if (p.mineral) rows.push('Komoditas: ' + p.mineral);
    if (p.areaHa) rows.push('Luas: ' + nf.format(p.areaHa) + ' ha');
    rows.push('Sumber: ' + p.source + (p.sourceYear ? ' (' + p.sourceYear + ')' : ''));
    return popupNode(p.name, rows, {
      tag: { cls: p.badge, text: TAGS[p.badge] || p.kind },
      warn: 'Kompilasi peta konsesi, bukan sertifikat HGU resmi ATR/BPN.'
    });
  }

  /* ---------- klik peta: cek pemilik lahan ---------- */
  map.on('click', function (ev) {
    var lat = ev.latlng.lat, lon = ev.latlng.lng;
    var pop = L.popup({ maxWidth: 320 })
      .setLatLng(ev.latlng)
      .setContent(popupNode('Memeriksa status lahan…', ['Koordinat ' + lat.toFixed(4) + ', ' + lon.toFixed(4)]))
      .openOn(map);
    fetchT('/api/whose-land?lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
      .then(function (d) {
        var box = document.createElement('div');
        box.appendChild(el('div', 'pp-t', 'Status lahan pada titik ini'));
        box.appendChild(el('div', 'pp-r', 'Koordinat ' + lat.toFixed(4) + ', ' + lon.toFixed(4) +
          (d.province ? ' · ' + d.province : '')));
        if (!d.units || !d.units.length) {
          box.appendChild(el('div', 'pp-r', 'Tidak berada di dalam batas konsesi yang terdata.'));
          box.appendChild(el('div', 'pp-warn', 'Bisa berarti lahan masyarakat, kawasan hutan negara, atau konsesi yang belum terpetakan dalam basis data terbuka.'));
        } else {
          d.units.forEach(function (u) {
            var line = el('div', 'pp-r');
            var tg = el('span', 'tag t-' + u.badge, TAGS[u.badge] || u.kind);
            line.appendChild(tg);
            line.appendChild(document.createTextNode(' ' + u.name));
            box.appendChild(line);
            var det = [];
            if (u.group) det.push('grup ' + u.group);
            if (u.tenure) det.push('alas hak ' + u.tenure);
            if (u.areaHa) det.push(nf.format(u.areaHa) + ' ha');
            if (det.length) box.appendChild(el('div', 'pp-r', '· ' + det.join(' · ')));
          });
          box.appendChild(el('div', 'pp-warn', 'Indikasi awal dari kompilasi peta konsesi GFW, bukan bukti hukum.'));
        }
        var airLine = el('div', 'pp-r pp-load', 'Memeriksa kualitas udara…');
        box.appendChild(airLine);
        pop.setContent(box);

        fetchT('/api/air-point?lat=' + lat.toFixed(4) + '&lon=' + lon.toFixed(4), { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
          .then(function (d2) {
            airLine.className = 'pp-r';
            clear(airLine);
            if (!d2.air) { airLine.textContent = 'Kualitas udara tidak tersedia.'; return; }
            var chip = el('span', 'aqi-chip', 'AQI ' + nf.format(d2.air.aqi));
            chip.style.background = d2.air.color;
            airLine.appendChild(chip);
            airLine.appendChild(document.createTextNode(' ' + d2.air.label +
              (d2.air.pm25 !== null ? ' · PM2,5 ' + d2.air.pm25 + ' µg/m³' : '')));
          })
          .catch(function () { airLine.className = 'pp-r'; airLine.textContent = 'Kualitas udara tidak tersedia.'; })
          .then(function () { pop.update(); });
      })
      .catch(function () {
        pop.setContent(popupNode('Gagal memeriksa lahan', ['Silakan coba lagi.']));
      });
  });

  /* ---------- daftar samping ---------- */
  // Baris peringkat, mengikuti struktur prototipe audit apa adanya:
  //   .listrow.rank  →  .no (01)  .nm (nama)  .val (angka)  .a-ago (satuan)
  // Sebelumnya di sini dibuat .row, .row-rank, .row-main, .row-t, .row-s,
  // .bar, dan .pill, tujuh kelas yang tidak punya satu pun aturan CSS di
  // app.css maupun di prototipe, sehingga seluruh daftar yang memakainya
  // tampil tanpa tata letak. Empat kolomnya sudah ada di audit
  // (.rank{grid-template-columns:18px 1fr auto auto}).
  function makeRow(rank, name, value, unit, onClick) {
    var row = el(onClick ? 'button' : 'div', 'listrow rank');
    if (onClick) row.type = 'button';
    if (rank !== null && rank !== undefined) {
      row.appendChild(el('span', 'no', rank < 10 ? '0' + rank : String(rank)));
    }
    row.appendChild(el('span', 'nm', name));
    row.appendChild(el('span', 'val', value));
    row.appendChild(el('span', 'a-ago', unit || ''));
    if (onClick) row.addEventListener('click', onClick);
    return row;
  }

  // Kartu ringkas untuk sub-panel yang di audit memakai .grid4/.grid2:
  //   .card  →  .t (judul + keterangan)  .s (baris kedua)  .m (baris ketiga)
  function makeCard(title, extra, extraCls, sub, meta, onClick) {
    var card = el(onClick ? 'button' : 'div', 'card');
    if (onClick) card.type = 'button';
    var t = el('span', 't');
    t.appendChild(document.createTextNode(title));
    if (extra) {
      var ex = el('span', extraCls || 't-tertiary', extra);
      ex.style.fontWeight = '400';
      t.appendChild(document.createTextNode(' '));
      t.appendChild(ex);
    }
    card.appendChild(t);
    card.appendChild(el('span', 's', sub || ''));
    card.appendChild(el('span', 'm', meta || ''));
    if (onClick) card.addEventListener('click', onClick);
    return card;
  }

  function renderImpactList() {
      var pane = $('paneImpact'); clear(pane);
      var list = state.data ? state.data.impacted : [];
      if (!list.length) { pane.appendChild(el('p', 'empty', 'Tidak ada zona terdampak saat ini, tidak ada kota/kabupaten yang dijangkau paparan asap atau abu (jendela 24 jam).')); return; }
      var jml = list.length;
      pane.appendChild(el('div', 'micro',
        'Zona terdampak aktif · ' + nf.format(jml) + ' kota/kabupaten · jendela data 24 jam'));
      pane.appendChild(el('p', 'pane-note',
        'Wilayah terdampak = kota/kabupaten yang KINI berada di dalam jangkauan paparan: ' +
        'jalur pluma asap dari titik api dan/atau sebaran abu vulkanik, dihitung dari arah angin ' +
        'dan intensitas sumbernya. Yang digambar adalah ZONA PAPARAN, poligon buffer berjari-jari ' +
        '7-18 km sesuai tingkat paparan (bukan batas administratif dan bukan data kerusakan). ' +
        'Indeks 0-100 menandakan seberapa kuat paparan, bukan angka ISPU resmi. Klik sebuah zona di ' +
        'peta untuk melihat semua peristiwa bahaya lain yang tercatat di lokasi sekitar zona itu.'));
      // Satu kartu per zona. Baris bawah memuat badge multi-bahaya: jenis
      // peristiwa lain yang terhitung ada di sekitar zona (bukan hanya asap).
      var grid = el('div', 'grid4');
      list.slice(0, 60).forEach(function (r) {
        var dos = zoneDossier(r.lat, r.lon, ZONE_RADIUS_KM[r.level] || 10);
        var badge = dos.kinds.length ? ' · \u26a0 ' + dos.kinds.join('+') : '';
        grid.appendChild(makeCard(
          r.name, '· ' + r.prov, 't-tertiary',
          nf.format(r.nearestKm) + ' km · dari ' + r.fromDir,
          r.etaShort + ' · intensitas ' + r.level + badge,
          function () { map.setView([r.lat, r.lon], 8); }));
      });
      pane.appendChild(grid);
        }function renderAshList() {
    var pane = $('paneAsh'); clear(pane);
    var v = state.data && state.data.volcano;
    var list = (state.data && state.data.ashImpacted) || [];

    if (v) {
      var known = v.eruptionReports !== null && v.eruptionReports !== undefined;
      var head = el('p', 'pane-note',
        (known
          ? v.erupting + ' gunung dilaporkan meletus pos pengamatan dalam 24 jam, '
          : 'Laporan letusan pos pengamatan belum termuat; ')
        + v.monitored + ' dipantau (status minimal Waspada).'
        + (v.counts ? ' Status resmi PVMBG: ' + v.counts.Awas + ' Awas, '
          + v.counts.Siaga + ' Siaga, ' + v.counts.Waspada + ' Waspada.' : '')
        + (v.stale ? ' (status dari data tersimpan)' : ''));
      pane.appendChild(head);
    }

    if (!list.length) {
      pane.appendChild(el('p', 'empty',
        'Tidak ada kota yang diperkirakan berada di jalur sebaran abu saat ini.'));
      return;
    }

    var am = state.data && state.data.ashImpactedMeta;
    pane.appendChild(el('p', 'pane-note',
      'Permukiman di bawah jalur abu menurut arah angin tiap lapisan ketinggian. '
      + 'Abu rendah (~3 km) paling berdampak ke permukaan; abu ~10 km umumnya '
      + 'melintas di atas dan lebih memengaruhi penerbangan. '
      + (am && am.truncated
        ? 'Menampilkan ' + nf.format(am.returned) + ' paling terpapar dari '
          + nf.format(am.total) + ' terdeteksi. '
        : '')
      + 'Model indikatif, bukan advisory resmi Darwin VAAC.'));

    // Audit memakai grid kartu dua kolom untuk kolom abu, dengan status
    // gunung sebagai keterangan di samping namanya.
    var gridAbu = el('div', 'grid2');
    list.forEach(function (r) {
      var eta = r.etaH === null ? 'waktu tiba tidak diperkirakan'
        : r.etaH < 1 ? 'tiba <1 jam'
          : r.etaH < 24 ? 'tiba ~' + Math.round(r.etaH) + ' jam' : 'tiba >1 hari';
      gridAbu.appendChild(makeCard(
        r.name, r.officialLevel ? '· ' + r.officialLevel : '', 't-alert',
        'Gunung ' + r.volcano + ' · ' + nf.format(r.nearestKm) + ' km · ' + eta,
        'Lapisan ' + r.layers.join('/') + ' km · indeks paparan ' + r.score
        + ' · ' + r.level,
        function () { map.setView([r.lat, r.lon], 8); }));
    });
    pane.appendChild(gridAbu);
  }

  function renderProvList() {
    var pane = $('paneProv'); clear(pane);
    var list = (state.data && state.data.provinceRanking) || [];
    if (!list.length) { pane.appendChild(el('p', 'empty', 'Belum ada data peringkat provinsi.')); return; }
    list.forEach(function (p, i) {
      pane.appendChild(makeRow(i + 1, p.province,
        nf.format(p.hotspots), 'titik · FRP ' + nf.format(p.frp) + ' MW'));
    });
  }

  /**
   * Daftar kekeringan per provinsi, dengan jalan pintas ke citranya.
   *
   * Angka hari tanpa hujan menjawab "seberapa kering", tetapi tidak
   * menjawab "seperti apa keadaannya di lapangan". Tombol di tiap baris
   * memindahkan peta ke provinsi itu sekaligus menyalakan lapisan citra
   * yang sesuai, sehingga jaraknya satu klik, bukan mencari sendiri
   * koordinatnya lalu memilih produk yang tepat.
   */
  function renderDryList() {
    var pane = $('paneDry'); clear(pane);
    var d = state.drought;
    if (!d) { pane.appendChild(el('p', 'empty', 'Memuat data kekeringan…')); return; }

    if (d.enso) {
      var e = d.enso;
      pane.appendChild(el('p', 'pane-note',
        'Status iklim: ' + e.phase + ' (ONI ' + e.oni.toFixed(1) + ', ' + e.season + ' '
        + e.year + (e.trend ? ', ' + e.trend : '') + '). '
        + 'El Niño meningkatkan peluang kemarau panjang tetapi tidak menentukannya, '
        + 'status tiap provinsi di bawah dihitung dari curah hujan yang benar-benar '
        + 'terukur, bukan dari indeks ini.'));
    }

    var list = d.provinces || [];
    if (!list.length) { pane.appendChild(el('p', 'empty', 'Data curah hujan tidak tersedia.')); return; }

    pane.appendChild(el('p', 'pane-note',
      'Hari tanpa hujan beruntun sampai ' + (d.lastDate || '-')
      + ' · jendela ' + (d.windowDays || 90) + ' hari · sumber Open-Meteo (ERA5). '
      + 'Tombol "citra" memindahkan peta ke provinsi itu dan menyalakan '
      + 'lapisan kelembapan tanaman.'));

    var max = list[0].dryDays || 1;
    list.slice(0, 20).forEach(function (p, i) {
      // makeRow menghasilkan elemen <button>; menyisipkan tombol lain di
      // dalamnya tidak sah dalam HTML dan perilakunya tidak dapat
      // diandalkan. Barisnya sendiri yang dijadikan pemicu.
      var row = makeRow(i + 1, p.province, p.dryDays + ' hari',
        'tanpa hujan · hujan 30 hari ' + p.rain30mm + ' mm · ' + p.label,
        function () { lihatCitra(p.lat, p.lon, 'moisture'); });
      row.title = 'Lihat citra satelit ' + p.province;
      pane.appendChild(row);
    });
  }

  /**
   * Pindahkan peta ke satu titik dan nyalakan lapisan citra tertentu.
   *
   * Zoom 11 dipilih karena di bawah itu resolusi 10 m Sentinel-2 tidak
   * terasa bedanya, sementara lebih dalam membuat cakupan terlalu sempit
   * untuk menilai keadaan satu wilayah.
   */
  function lihatCitra(lat, lon, produk) {
    map.setView([lat, lon], 11);
    var sel = $('himaSel');
    if (sel) { sel.value = 's2:' + produk; }
    setHimawari('s2:' + produk);
    showHint('Memuat citra Sentinel-2, satelit melintas tiap 5 hari, '
      + 'jadi ini bukan citra hari ini. Tanggal perekaman tampil di panel citra.', 8000);
  }

  function renderClusterList() {
    var pane = $('paneCluster'); clear(pane);
    var list = state.data ? state.data.clusters : [];
    if (!list.length) { pane.appendChild(el('p', 'empty', 'Tidak ada klaster titik api terdeteksi.')); return; }
    // Daftar ini dipotong demi ukuran payload; katakan berapa yang
    // sebenarnya terdeteksi supaya angka di kartu tidak tampak bertentangan.
    var cm = state.data ? state.data.clustersMeta : null;
    if (cm && cm.truncated) {
      pane.appendChild(el('p', 'pane-note',
        'Menampilkan ' + nf.format(cm.returned) + ' klaster terbesar dari '
        + nf.format(cm.total) + ' terdeteksi.'));
    }
    list.forEach(function (c, i) {
      var lvl = c.frp >= 400 ? 'Berat' : c.frp >= 120 ? 'Sedang' : 'Ringan';
      pane.appendChild(makeRow(i + 1, c.count + ' titik api',
        nf.format(c.frp) + ' MW',
        lvl + ' · ' + c.lat.toFixed(2) + ', ' + c.lon.toFixed(2),
        function () { map.setView([c.lat, c.lon], 9); }));
    });
  }

  /* ---------- atribusi ---------- */
  function renderAttribution() {
    var d = state.attr;
    var unitPane = $('paneUnit'), groupPane = $('paneGroup');
    clear(unitPane); clear(groupPane);
    if (!d) { unitPane.appendChild(el('p', 'empty', 'Analisis atribusi tidak tersedia.')); return; }

    // Angka sampel dan populasi harus berdampingan. Menyandingkan
    // "88 di dalam konsesi" dengan "30.060 titik api" tanpa keterangan
    // membuat pembaca menghitung 0,3% padahal rasio sebenarnya 40%.
    var pct = d.analyzed ? Math.round((d.insideConcession / d.analyzed) * 100) : 0;
    var attrTxt = nf.format(d.insideConcession) + ' dari ' + nf.format(d.analyzed)
      + ' titik sampel (' + pct + '%) di dalam batas konsesi · '
      + nf.format(d.outsideConcession) + ' di luar';
    if (d.sampled && d.population) {
      attrTxt += ' · sampel ' + nf.format(d.analyzed) + ' titik ber-FRP tertinggi dari '
        + nf.format(d.population) + ' titik';
    }
    $('attrMeta').textContent = attrTxt;
    var _ad = $('attrDisclaimer');
    if (d.meta && d.meta.disclaimer && _ad) _ad.textContent = d.meta.disclaimer;

    if (!d.units.length) {
      unitPane.appendChild(el('p', 'empty', d.analyzed
        ? 'Tidak ada titik api yang jatuh di dalam batas konsesi terdata.'
        : 'Analisis atribusi sedang berjalan…'));
    } else {
      // Baris unit lahan mengikuti struktur prototipe audit:
      //   .listrow.whois → [.nm + .h] [.chips > .chip] [.val] [.a-ago]
      // Empat kolomnya (1fr 92px 80px 70px) sudah ada di app.css. Sebelumnya
      // di sini dibangun .unit, .unit-row, .unit-top, .unit-left, .unit-name,
      // .unit-group, .unit-right, .tag, .unit-count, .unit-detail, sepuluh
      // kelas yang tidak punya satu pun aturan CSS, sehingga nama perusahaan,
      // lencana, jumlah titik, dan rincian lisensi saling menumpuk.
      d.units.forEach(function (u) {
        var row = el('button', 'listrow whois'); row.type = 'button';
        row.title = 'Klik untuk zoom ke ' + u.name + ' di peta';

        var who = el('span');
        who.appendChild(el('span', 'nm', u.name));

        var bits = [];
        if (u.group) bits.push('Grup ' + u.group);
        bits.push(nf.format(Math.round(u.totalFrp)) + ' MW FRP');
        if (u.areaHa) bits.push(nf.format(u.areaHa) + ' ha');
        if (u.tenure) bits.push(u.tenure);
        if (u.licenseId) bits.push(u.licenseId);
        if (u.status) bits.push(u.status);
        if (u.mineral) bits.push(u.mineral);
        bits.push(u.source + (u.sourceYear ? ' ' + u.sourceYear : ''));
        who.appendChild(el('span', 'h', bits.join(' · ')));
        row.appendChild(who);

        var chips = el('span', 'chips');
        chips.appendChild(el('span', 'chip ' + (u.badge || ''),
          TAGS[u.badge] || u.kind || ''));
        row.appendChild(chips);

        row.appendChild(el('span', 'val', nf.format(u.hotspotCount) + ' titik'));
        row.appendChild(el('span', 'a-ago', 'Lihat di peta'));

        row.addEventListener('click', function () {
          map.setView([u.lat, u.lon], 10);
          if (!state.concOn) { $('lyConc').checked = true; toggleConc(true); }
          document.querySelector('.map-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        unitPane.appendChild(row);
      });
    }

    if (!d.groups.length) {
      groupPane.appendChild(el('p', 'empty', 'Tidak ada grup korporasi teridentifikasi.'));
    } else {
      d.groups.forEach(function (g, i) {
        groupPane.appendChild(makeRow(i + 1, g.group,
          nf.format(g.hotspotCount),
          'titik · FRP ' + nf.format(Math.round(g.totalFrp)) + ' MW · '
          + g.units + ' unit lahan · ' + g.kinds.join(', ')));
      });
    }
  }

  /* ---------- berita ---------- */
  function renderNews() {
    var box = $('news'); clear(box);
    var q = $('newsQ').value.trim().toLowerCase();
    var list = state.news.filter(function (a) {
      if (state.newsTopic !== 'semua' && a.topic !== state.newsTopic) return false;
      return !q || a.title.toLowerCase().indexOf(q) >= 0 || a.domain.toLowerCase().indexOf(q) >= 0;
    });
    $('newsCount').textContent = state.news.length
      ? nf.format(list.length) + ' artikel · diperbarui ' + state.newsAt
        + (state.newsFetchedAt ? ' (' + timeAgo(state.newsFetchedAt) + ')' : '')
      : '';
    if (!list.length) {
      box.appendChild(el('p', 'empty', q ? 'Tidak ada berita yang cocok dengan pencarian.' : 'Belum ada berita yang dapat ditampilkan.'));
      return;
    }
    list.slice(0, 40).forEach(function (a) {
      if (!/^https?:\/\//i.test(a.url)) return;
      // Tata letak baris mengikuti audit: satu .listrow.news dengan tiga
      // kolom tetap (sumber 64px · judul · waktu), memakai .src, .hl, dan
      // .meta yang aturannya sudah ada di app.css. Sebelumnya di sini
      // dibangun taksonomi kelas sendiri (.news-item, .news-t, .news-m,
      // .news-src, .news-age, .news-clock) yang tidak punya aturan CSS,
      // sehingga sumber, judul, dan dua bentuk waktu saling menempel.
      var link = el('a', 'listrow news');
      link.href = a.url; link.target = '_blank'; link.rel = 'noopener noreferrer nofollow';
      var src = el('span', 'src', a.domain || '');
      if (a.domain) src.title = a.domain;
      link.appendChild(src);
      link.appendChild(el('span', 'hl', a.title || '(tanpa judul)'));

      // Waktu terbit ditampilkan lengkap dengan jam WIB dan usia relatif -
      // pada pemantauan bencana, "2 jam lalu" jauh lebih berarti daripada
      // sekadar tanggal. Berita dari media negara tetangga ditandai jelas
      // supaya pembaca tahu itu sudut pandang luar, bukan laporan otoritas.
      var meta = el('span', 'meta');
      var bagian = [];
      var ts = a.pubDate ? Date.parse(a.pubDate) : NaN;
      if (isFinite(ts)) {
        bagian.push(timeAgo(new Date(ts).toISOString()));
        bagian.push(fmtJamWib(ts));
        meta.title = new Date(ts).toLocaleString('id-ID', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
        }) + ' WIB';
      }
      // Hanya negara asal yang ikut di kolom waktu. Label kategori tidak
      // diulang di sini karena chip di atas sudah menyatakan kategori yang
      // sedang aktif, pada audit kolomnya cukup "usia · jam".
      if (a.foreign && a.country) bagian.push(a.country);
      meta.textContent = bagian.join(' · ');
      link.appendChild(meta);
      box.appendChild(link);
    });
  }

  function renderNewsTopics() {
    var box = $('newsTopics'); clear(box);
    if (!state.newsTopics.length) return;
    var opts = [{ id: 'semua', label: 'Semua', count: state.news.length }]
      .concat(state.newsTopics.filter(function (t) { return t.count > 0; }));
    opts.forEach(function (t) {
      // Kelas mengikuti audit apa adanya: .chip / .chip.on, dengan jumlah
      // sebagai bagian teks ("Semua 200") seperti pada prototipe. Sebelumnya
      // di sini dipakai kelas .ntopic yang tidak punya aturan CSS sama
      // sekali, dan angka jumlah ditempel sebagai <i> tanpa jarak sehingga
      // terbaca "Semua200".
      var b = el('button', 'chip' + (state.newsTopic === t.id ? ' on' : ''));
      b.type = 'button';
      b.appendChild(document.createTextNode(t.label + ' ' + String(t.count)));
      b.addEventListener('click', function () {
        state.newsTopic = t.id;
        renderNewsTopics();
        renderNews();
      });
      box.appendChild(b);
    });
  }

  /* ---------- pemuatan ---------- */
  function setNotice(msg) {
    var n = $('notice');
    if (!msg) { n.hidden = true; n.textContent = ''; return; }
    n.hidden = false; n.textContent = msg;
  }

  /* Stempel "diperbarui" dalam WIB eksplisit. Sebelumnya memakai
     toLocaleString tanpa label zona: pengguna di luar WIB melihat jam zona
     perangkat sendiri, dan tak ada jaminan zona. Kini UTC+7 dihitung
     eksplisit, konvensi yang sama dengan penanggalan lain di halaman. */
  var NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function stampWIB(iso) {
    var ms = Date.parse(iso);
    if (isNaN(ms)) return null;
    var w = new Date(ms + 7 * 3600000);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(w.getUTCDate()) + ' ' + NAMA_BULAN[w.getUTCMonth()] + ' ' +
      p(w.getUTCHours()) + '.' + p(w.getUTCMinutes()) + ' WIB';
  }

  function loadOverview() {
    var btn = $('refreshBtn');
    btn.disabled = true;
    // Pelepasan tombol tidak boleh bergantung pada rantai promise: bila
    // permintaan tidak pernah selesai, satu-satunya jalan pemulihan
    // pengguna akan hilang. Pengaman ini berjalan terlepas dari hasilnya.
    var release = setTimeout(function () { btn.disabled = false; }, 12000);
    // Overview adalah payload terbesar, tetapi tenggatnya tetap harus di
    // bawah 15 detik: itu batas wajar sebelum pengguna menyimpulkan
    // sendiri bahwa "tidak ada apa-apa" dari kartu yang kosong.
    return fetchT('/api/overview', { headers: { Accept: 'application/json' } }, 12000)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
      .then(function (d) {
        state.data = d;
        var b = $('modeBadge');
        b.textContent = 'Data langsung';
        b.className = 'badge badge-live';
        buildTicker();
        var _st = stampWIB(d.meta.updatedAt);
        $('updated').textContent = _st ? 'diperbarui ' + _st : 'diperbarui -';
        var _sl = $('srcline'); if (_sl) _sl.textContent = 'Sumber titik api: ' + d.meta.source + ' · rentang ' + d.meta.days +
          ' hari · atribusi: ' + d.meta.attribution.join(', ') + '.';
        setNotice(d.meta.notice || '');
        renderEvents();
        ['sHot', 'sImp'].forEach(function (id) { $(id).classList.remove('skel'); });
        $('sHot').textContent = nf.format(d.stats.hotspots);
        $('sImp').textContent = nf.format(d.stats.impactedRegions);
        // Sublabel titik api ditulis oleh drawFires() supaya angka yang
        // tampil selalu cocok dengan yang benar-benar digambar di peta.
        $('sHotSub').textContent = nf.format(d.stats.highConfidence) + ' keyakinan tinggi · '
          + nf.format(d.stats.totalFrp) + ' MW';

        // Kartu gunung api diisi dari ringkasan overview supaya angka di
        // kepala halaman selalu konsisten dengan panel kejadian.
        var vs = d.volcano;
        $('sErupt').classList.remove('skel');
        $('sVolLvl').classList.remove('skel');
        if (vs) {
          // eruptionReports === null berarti laporan pos pengamatan belum
          // sempat ditarik (instance baru hidup / MAGMA sedang lambat).
          // Itu BUKAN sama dengan "tidak ada letusan", jadi jangan pernah
          // menampilkannya sebagai angka nol yang meyakinkan.
          if (vs.eruptionReports === null || vs.eruptionReports === undefined) {
            $('sErupt').textContent = '-';
            $('sEruptSub').textContent = 'menunggu laporan pos pengamatan…';
            // Coba lagi sebentar lagi; penyegaran latar biasanya sudah selesai.
            if (!state.eruptRetry) {
              state.eruptRetry = true;
              setTimeout(loadOverview, 20000);
            }
          } else {
            $('sErupt').textContent = nf.format(vs.erupting || 0);
            var names = (vs.eruptingNames || []).slice(0, 3).join(', ');
            $('sEruptSub').textContent = vs.erupting
              ? names + (vs.eruptingNames.length > 3 ? ' +' + (vs.eruptingNames.length - 3) : '')
              : 'tidak ada laporan letusan 24 jam';
          }
          var c = vs.counts || {};
          var sa = (c.Siaga || 0) + (c.Awas || 0);
          $('sVolLvl').textContent = nf.format(sa);
          $('sVolLvlSub').textContent = 'Awas ' + (c.Awas || 0) + ' · Siaga ' + (c.Siaga || 0)
            + ' · Waspada ' + (c.Waspada || 0);
        } else {
          $('sErupt').textContent = '-';
          $('sVolLvl').textContent = '-';
        }
        var wa = d.worstAir;
        $('sAir').classList.remove('skel');
        if (wa) {
          $('sAir').textContent = nf.format(wa.aqi);
          $('sAir').style.color = wa.color;
          $('sAirSub').textContent = wa.label + (wa.province ? ' · ' + wa.province : '');
        } else {
          $('sAir').textContent = '-';
          $('sAirSub').textContent = 'data tidak tersedia';
        }
        drawFires(); drawSmoke(); drawImpact();
        // Kota terdampak abu berasal dari overview, sedangkan kerucutnya
        // dari endpoint gunung api. Keduanya tiba terpisah, jadi lapisan
        // abu digambar ulang begitu daftar kotanya siap.
        if ((state.ashOn || state.volcanoOn) && state.ash) drawAsh();
        renderImpactList(); renderAshList(); renderProvList(); renderClusterList();
        // Jumlah klaster titik api pernah tertulis harfiah "504" di markup
        // sementara server menghitungnya sendiri (kini 40). Angka mati pada
        // dasbor bencana menyesatkan pembaca; ambil dari data yang sama
        // dengan daftar klaster di bawah peta.
        var cl = document.getElementById('sClusters');
        if (cl) cl.textContent = nf.format((d.clusters || []).length);
      })
      .catch(function () {
        setNotice('Gagal memuat data pemantauan. Periksa koneksi lalu tekan "Muat ulang".');
        // Kartu yang bergantung pada overview ditandai gagal supaya tidak
        // tertukar dengan "sedang memuat" atau, lebih buruk, dibaca sebagai
        // "tidak ada kejadian".
        markFailed(['sHot', 'sImp', 'sConc', 'sAir', 'sErupt', 'sVolLvl']);
        var badge = $('modeBadge');
        if (badge) { badge.textContent = 'gagal memuat'; badge.className = 'badge badge-bad'; }
      })
      .then(function () { clearTimeout(release); btn.disabled = false; });
  }

  function loadAttribution() {
    return fetchT('/api/attribution', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
      .then(function (d) {
        state.attr = d;
        buildTicker();
        $('sConc').classList.remove('skel');
        $('sConc').textContent = nf.format(d.insideConcession);
        $('sConcSub').textContent = d.sampled && d.population
          ? 'dari ' + nf.format(d.analyzed) + ' sampel FRP teratas'
          : 'dari ' + nf.format(d.analyzed) + ' titik api dianalisis';
        renderAttribution();
      })
      .catch(function () {
        $('sConc').textContent = '-';
        clear($('paneUnit'));
        $('paneUnit').appendChild(el('p', 'empty', 'Analisis atribusi lahan sedang tidak tersedia. Coba muat ulang.'));
      });
  }

  function loadNews() {
    return fetchT('/api/news', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state.news = Array.isArray(d.articles) ? d.articles : [];
        state.newsAt = d.fetchedAt || new Date().toISOString();
        state.newsTopics = Array.isArray(d.topics) ? d.topics : [];
        // Tampilkan kapan DATA-nya ditarik dari sumber, bukan kapan browser
        // memanggil API, keduanya bisa berbeda beberapa menit karena cache.
        state.newsFetchedAt = d.fetchedAt || null;
        state.newsAt = d.fetchedAt
          ? fmtJamWib(Date.parse(d.fetchedAt))
          : new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        renderNewsTopics();
        renderNews();
        buildTicker();
        if (!state.news.length && d.message) {
          clear($('news')); $('news').appendChild(el('p', 'empty', d.message));
        }
      })
      .catch(function () { clear($('news')); $('news').appendChild(el('p', 'empty', 'Berita gagal dimuat.')); });
  }

  /* ---------- interaksi ---------- */

  /**
   * Keterangan singkat saat sebuah lapisan dinyalakan.
   *
   * Lapisan yang diam sama sekali menimbulkan keraguan: pengguna tidak
   * dapat membedakan "lapisan menyala tetapi memang tidak ada data" dari
   * "gagal dimuat". Pada dasbor bencana keduanya berkonsekuensi sangat
   * berbeda, jadi setiap lapisan menyebut jumlah yang benar-benar
   * digambar.
   */
  var LAYER_HINTS = {
    lyFire: function () {
      if (!state.data) return 'Titik api sedang dimuat…';
      var total = state.data.hotspots.length;
      var shown = state.data.hotspots.filter(function (h) {
        return h.confidence >= state.minConf && h.frp >= state.minFrp;
      }).length;
      if (!total) return 'Tidak ada data titik api dari sumber.';
      return nf.format(shown) + ' dari ' + nf.format(total)
        + ' titik api ditampilkan (NASA FIRMS VIIRS, 24 jam).';
    },
    lySmoke: function () {
      var n = state.data && state.data.plumes ? state.data.plumes.length : 0;
      return n ? nf.format(n) + ' pluma asap dimodelkan dari arah angin dan intensitas api.'
               : 'Tidak ada pluma asap pada data saat ini.';
    },
    lyImpact: function () {
      var n = state.data && state.data.impacted ? state.data.impacted.length : 0;
      return n
        ? 'Wilayah terdampak = kota/kabupaten yang KINI berada dalam jangkauan paparan asap/abu hasil hitungan ('
          + nf.format(n) + ' zona). Poligon = radius tetap per tingkat paparan, bukan batas administratif; klik zona untuk rincian bahaya lain di lokasi itu.'
        : 'Belum ada kota/kabupaten yang dijangkau paparan asap atau abu (jendela 24 jam).';
    },
    lyQuake: function () {
      var q = state.hazard && state.hazard.quakes;
      if (!q || !q.counts) return 'Data gempa sedang dimuat…';
      var m = q.latest && q.latest.magnitude !== null ? ' · terkini M ' + q.latest.magnitude : '';
      return nf.format(q.counts.total) + ' gempa tercatat 24 jam terakhir' + m + ' (BMKG).';
    },
    lyShelter: function () {
      var sh = state.hazard && state.hazard.shelters;
      if (!sh) return 'Data pengungsi sedang dimuat…';
      if (!sh.events || !sh.events.length) return 'Tidak ada pengungsian aktif yang dilaporkan BNPB.';
      return nf.format(sh.totalPeople) + ' jiwa mengungsi di '
        + nf.format(sh.events.length) + ' kejadian (BNPB).';
    },
    lyVolcano: function () {
      if (!state.ash) return 'Data gunung api sedang dimuat…';
      var a = state.ash.active || [];
      if (!a.length) return 'Tidak ada gunung berstatus Siaga/Awas atau dilaporkan erupsi saat ini.';
      var oc = state.ash.official && state.ash.official.counts;
      return nf.format(a.length) + ' gunung aktif dipantau di peta'
        + (oc ? ', status PVMBG: ' + oc.Awas + ' Awas, ' + oc.Siaga + ' Siaga, ' + oc.Waspada + ' Waspada.' : '.');
    }
  };

  function layerHint(id) {
    var fn = LAYER_HINTS[id];
    if (!fn) return;
    var txt = '';
    try { txt = fn(); } catch (err) { txt = ''; }
    if (txt) showHint(txt, 6000);
  }

  function bindLayer(id, group) {
    $(id).addEventListener('change', function (e) {
      if (e.target.checked) { map.addLayer(group); layerHint(id); }
      else { map.removeLayer(group); showHint(null); }
    });
  }
  bindLayer('lyFire', gFire);
  bindLayer('lySmoke', gSmoke);
  bindLayer('lyImpact', gImpact);

  var _lyAir = $('lyAir'); _lyAir && _lyAir.addEventListener('change', function (e) {
    state.airOn = e.target.checked;
    if (state.airOn) {
      map.addLayer(gAir);
      loadAir();
      updateAirCfg();
    } else {
      map.removeLayer(gAir);
      renderAirLegend();
      updateAirCfg();
      showHint(null);
    }
  });

  // Fase 2.5: filter AQI, UI friendly
  function updateAirCfg() {
    var cntEl = $('airCfgCount');
    if (!cntEl) return;
    if (!state.airOn) {
      cntEl.textContent = 'Aktifkan layer KUALITAS UDARA untuk melihat data';
      return;
    }
    if (!state.air) {
      cntEl.textContent = 'Memuat data kualitas udara…';
      return;
    }
    var total = state.air.count || (state.air.points ? state.air.points.length : 0);
    var filtered = state.airFilteredCount || total;
    var minAqi = state.airMinAqi || 0;
    if (minAqi === 0) {
      cntEl.textContent = nf.format(total) + ' sel kualitas udara ditampilkan · Semua AQI';
    } else {
      cntEl.textContent = nf.format(filtered) + ' dari ' + nf.format(total) + ' sel (AQI ≥ ' + minAqi + ')';
    }
  }

  var airSel = $('airAqiSel');
  if (airSel) {
    airSel.addEventListener('change', function (e) {
      var v = parseInt(e.target.value, 10);
      if (!isFinite(v)) v = 0;
      state.airMinAqi = v;
      if (state.airOn && state.air) {
        drawAir();
        renderAirLegend();
        updateAirCfg();
        showHint(
          v === 0
            ? 'Filter AQI direset, menampilkan semua ' + nf.format(state.air.count || 0) + ' sel.'
            : 'Filter AQI ≥ ' + v + ', ' + nf.format(state.airFilteredCount) + ' dari ' + nf.format(state.air.count || 0) + ' sel ditampilkan.',
          4000
        );
      }
    });
  }

  $('lyAsh').addEventListener('change', function (e) {
    state.ashOn = e.target.checked;
    if (state.ashOn) { map.addLayer(gAsh); loadAsh(); }
    else { map.removeLayer(gAsh); renderAshInfo(); showHint(null); }
  });

  // Sakelar 'Letusan gunung api' (paritas prototipe v3, baris pertama Lapisan):
  // marker status gunung hidup sendiri - tidak ikut padam saat Abu vulkanik
  // OFF, dan kerucut sebaran abu tidak ikut menyala saat Letusan dimatikan.
  $('lyVolcano').addEventListener('change', function (e) {
    state.volcanoOn = e.target.checked;
    if (state.volcanoOn) {
      map.addLayer(gVolcano);
      if (state.ash) drawAsh(); else loadAsh();
      layerHint('lyVolcano');
    } else {
      map.removeLayer(gVolcano);
      showHint(null);
    }
  });

  // Fase 3 UX: collapse kontrol peta untuk optimasi ruang
  (function () {
    var row = $('ctlRow');
    var btn = $('ctlCollapse');
    if (!row || !btn) return;
    var key = 'siaga_ctl_collapsed';
    var collapsed = false;
    try { collapsed = localStorage.getItem(key) === '1'; } catch (e) {}
    if (collapsed) {
      row.classList.add('is-collapsed');
      btn.textContent = '☰ TAMPILKAN KONTROL';
      btn.setAttribute('aria-label', 'Tampilkan kontrol');
    }
    btn.addEventListener('click', function () {
      collapsed = !collapsed;
      row.classList.toggle('is-collapsed', collapsed);
      btn.textContent = collapsed ? '☰ TAMPILKAN KONTROL' : '☰ KONTROL';
      btn.setAttribute('aria-label', collapsed ? 'Tampilkan kontrol' : 'Sembunyikan kontrol');
      try { localStorage.setItem(key, collapsed ? '1' : '0'); } catch (e) {}
      // Resize map agar tidak ada gap kosong setelah collapse
      setTimeout(function () { if (map && map.invalidateSize) map.invalidateSize(); }, 220);
      showHint(collapsed ? 'Kontrol disembunyikan, hemat ruang. Klik lagi untuk tampil.' : 'Kontrol ditampilkan.', 2500);
    });
  })();

  // Fase 3.5 Bloomberg single design, user request: hapus tombol BLM COMPACT, jadikan satu desain permanen
  // Normal = compact, tidak ada toggle lagi
  (function () {
    try { document.body.classList.add('bloomberg'); } catch (e) {}
    // Bersihkan localStorage lama siaga_bloomberg agar tidak ganggu
    try { localStorage.removeItem('siaga_bloomberg'); } catch (e) {}
    function fixMap() {
      try {
        var mw = document.getElementById('mapWrap');
        var m = document.getElementById('map');
        if (mw) {
          mw.style.height = '60vh';
          mw.style.minHeight = '520px';
        }
        if (m) {
          m.style.height = '100%';
          m.style.minHeight = '520px';
        }
        if (window.map && map && map.invalidateSize) map.invalidateSize();
        else if (map && map.invalidateSize) map.invalidateSize();
      } catch (e) {}
    }
    setTimeout(fixMap, 100);
    setTimeout(fixMap, 350);
    setTimeout(fixMap, 800);
    setTimeout(fixMap, 1500);
  })();

  // Fase 3.6 AI Asisten popup draggable, gantikan panel Kueri data, Berita scroll terbatas
  (function () {
    var fab = $('aiFab');
    var popup = $('aiPopup');
    var head = $('aiPopupHead');
    var closeBtn = $('aiClose');
    var footAi = $('footAi');
    if (!fab || !popup || !head) return;

    function placeDefault() {
      // Letak awal di ATAS dock, bukan menutupinya: panel Sumber dan metrik
      // dock justru sering dibaca bersamaan dengan jawaban asisten.
      popup.style.left = '';
      popup.style.top = '';
      popup.style.right = '20px';
      var dk = document.querySelector('.dock');
      var off = 72;
      if (dk) {
        var t = dk.getBoundingClientRect().top;
        if (t > 0) {
          off = Math.min(Math.max(72, Math.round(window.innerHeight - t + 10)),
            Math.round(window.innerHeight * 0.45));
        }
      }
      popup.style.bottom = off + 'px';
      popup.style.maxHeight = Math.max(220, window.innerHeight - off - 70) + 'px';
    }

    /**
     * Jaga popup selalu di dalam layar. Posisi geser disimpan sebagai
     * left/top, jadi popup yang pernah digeser di jendela besar bisa
     * mendarat di luar layar ketika jendela menyusut (mis. pindah ke
     * 390 px), popup tak terlihat sama saja dengan hilang.
     */
    function clampIntoView() {
      if (popup.hidden) return;
      var r = popup.getBoundingClientRect();
      var maxLeft = window.innerWidth - popup.offsetWidth - 4;
      var maxTop = window.innerHeight - popup.offsetHeight - 4;
      var off = r.left < 4 || r.top < 4 || r.left > maxLeft || r.top > maxTop;
      if (!off) return;
      if (popup.dataset.dragged) {
        popup.style.left = Math.max(4, Math.min(maxLeft, r.left)) + 'px';
        popup.style.top = Math.max(4, Math.min(maxTop, r.top)) + 'px';
        popup.style.right = 'auto';
        popup.style.bottom = 'auto';
      } else {
        placeDefault();
      }
    }

    function openAi() {
      popup.hidden = false;
      if (!popup.dataset.dragged) placeDefault();
      // Ukur setelah browser sempat menata ulang (lebar dock dsb. bisa
      // berubah karena popup muncul), lalu pastikan tetap di dalam layar.
      requestAnimationFrame(clampIntoView);
      setTimeout(function () {
        var q = $('askQ');
        if (q) q.focus();
      }, 100);
      showHint('AI Asisten dibuka, drag header ⋮⋮ untuk geser posisi, ketik pertanyaan tentang data bencana.', 3500);
    }
    function closeAi() {
      popup.hidden = true;
    }
    function toggleAi() {
      if (popup.hidden) openAi();
      else closeAi();
    }

    fab.addEventListener('click', toggleAi);
    if (closeBtn) closeBtn.addEventListener('click', closeAi);
    if (footAi) footAi.addEventListener('click', function (e) {
      e.preventDefault();
      openAi();
    });

    // Shortcut F7 untuk AI
    document.addEventListener('keydown', function (e) {
      if (e.key === 'F7') {
        e.preventDefault();
        toggleAi();
      }
      if (e.key === 'Escape' && !popup.hidden) {
        closeAi();
      }
    });

    // Draggable logic
    var isDragging = false;
    var startX = 0, startY = 0, startLeft = 0, startTop = 0;

    function getClient(e) {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    function onStart(e) {
      // Jangan drag jika klik tombol close
      if (e.target && e.target.closest && e.target.closest('#aiClose')) return;
      var c = getClient(e);
      isDragging = true;
      startX = c.x;
      startY = c.y;
      var rect = popup.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      // Convert bottom/right to left/top for dragging
      popup.style.left = startLeft + 'px';
      popup.style.top = startTop + 'px';
      popup.style.right = 'auto';
      popup.style.bottom = 'auto';
      popup.dataset.dragged = '1';
      popup.style.transition = 'none';
      head.style.cursor = 'grabbing';
      if (e.type === 'mousedown') e.preventDefault();
    }

    function onMove(e) {
      if (!isDragging) return;
      var c = getClient(e);
      var dx = c.x - startX;
      var dy = c.y - startY;
      var newLeft = startLeft + dx;
      var newTop = startTop + dy;
      // Clamp dalam viewport
      var maxLeft = window.innerWidth - popup.offsetWidth - 4;
      var maxTop = window.innerHeight - popup.offsetHeight - 4;
      newLeft = Math.max(4, Math.min(maxLeft, newLeft));
      newTop = Math.max(4, Math.min(maxTop, newTop));
      popup.style.left = newLeft + 'px';
      popup.style.top = newTop + 'px';
      if (e.type === 'touchmove') e.preventDefault();
    }

    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      popup.style.transition = '';
      head.style.cursor = 'move';
    }

    head.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    head.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);

    // Reset posisi saat resize agar tidak keluar layar
    window.addEventListener('resize', function () {
      clampIntoView();
    });
  })();

  // Fase 3.8 Panel fleksibel free floating draggable + resize + font auto-scale + save default + mobile
  (function () {
    var toggleBtn = $('layoutToggle');
    var bar = $('layoutBar');
    var saveBtn = $('layoutSave');
    var exportBtn = $('layoutExport');
    var resetBtn = $('layoutReset');
    var closeBtn = $('layoutClose');
    if (!toggleBtn || !bar) return;

    var PANEL_IDS = ['mapCard','statsPanel','ctlRow','eventsPanel','analysisPanel','newsPanel','attrSection','hazardPanel','statusPanel','so2Panel','eduPanel','sourcePanel'];
    var STORAGE_KEY = 'siaga_layout_flex_v1';
    var isEdit = false;
    var dragState = null; // {panel, startX, startY, startLeft, startTop, z}

    function isMobileView() { return window.innerWidth <= 768; }

    function getPanels() {
      var list = [];
      PANEL_IDS.forEach(function (id) {
        var el = $(id);
        if (el) list.push(el);
      });
      return list;
    }

    function getMainRect() {
      var main = $('main');
      if (!main) return { left:0, top:0 };
      var r = main.getBoundingClientRect();
      return { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height };
    }

    function enterEdit() {
      if (isEdit) return;
      isEdit = true;
      document.body.classList.add('layout-edit');
      document.body.classList.remove('layout-free');
      bar.hidden = false;
      toggleBtn.textContent = '✦ EDIT AKTIF';
      toggleBtn.classList.add('active');

      var mainRect = getMainRect();
      var panels = getPanels();
      // Convert to absolute based on current position
      panels.forEach(function (p, idx) {
        if (!p.dataset.origPosition) {
          p.dataset.origPosition = p.style.position || '';
          p.dataset.origLeft = p.style.left || '';
          p.dataset.origTop = p.style.top || '';
          p.dataset.origWidth = p.style.width || '';
          p.dataset.origHeight = p.style.height || '';
        }
        var rect = p.getBoundingClientRect();
        // Only convert if not already absolute with saved pos
        if (p.style.position !== 'absolute' || !p.dataset.flexPlaced) {
          p.style.position = 'absolute';
          p.style.left = (rect.left - mainRect.left + window.scrollX) + 'px';
          p.style.top = (rect.top - mainRect.top + window.scrollY) + 'px';
          p.style.width = rect.width + 'px';
          p.style.height = rect.height + 'px';
          p.style.margin = '0';
        }
        p.style.zIndex = 10 + idx;
        p.dataset.flexPlaced = '1';
        // Enable resize observer for font auto-scale + map
        attachResizeObserver(p);
      });

      // Ensure main has relative and enough height
      var main = $('main');
      if (main) {
        var maxBottom = 0;
        panels.forEach(function (p) {
          var top = parseFloat(p.style.top) || 0;
          var h = parseFloat(p.style.height) || p.offsetHeight;
          maxBottom = Math.max(maxBottom, top + h);
        });
        main.style.minHeight = (maxBottom + 20) + 'px';
      }

      showHint('Mode atur layout aktif, drag header ⋮⋮ untuk geser, drag sudut kanan-bawah untuk resize. Font auto-scale ikut ukuran panel. Klik SIMPAN LOKAL jika sudah pas.', 5000);
    }

    function exitEdit() {
      if (!isEdit) return;
      isEdit = false;
      document.body.classList.remove('layout-edit');
      bar.hidden = true;
      toggleBtn.textContent = '✦ ATUR LAYOUT';
      toggleBtn.classList.remove('active');
      // Keep absolute positions if saved, otherwise they stay as is for free mode
      var hasSaved = false;
      try { hasSaved = !!localStorage.getItem(STORAGE_KEY); } catch(e){}
      if (hasSaved) {
        document.body.classList.add('layout-free');
      }
      showHint('Mode atur selesai, layout tetap free floating. Klik ATUR LAYOUT lagi untuk edit, atau SIMPAN LOKAL untuk patenkan.', 4000);
    }

    function toggleEdit() {
      if (isEdit) exitEdit();
      else enterEdit();
    }

    // Drag logic for panels
    function onDragStart(e, panel) {
      if (!isEdit) return;
      // Only drag via header
      var head = panel.querySelector('.panel-head');
      if (!head) return;
      // If click on close or button inside header, ignore
      if (e.target.closest && e.target.closest('button')) return;
      if (e.target.closest && e.target.closest('.tab')) return;
      // Must be header or its children
      if (!head.contains(e.target)) return;

      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      dragState = {
        panel: panel,
        startX: clientX,
        startY: clientY,
        startLeft: parseFloat(panel.style.left) || 0,
        startTop: parseFloat(panel.style.top) || 0,
        z: parseInt(panel.style.zIndex) || 10
      };
      // Bring to front
      var maxZ = 10;
      getPanels().forEach(function (p) {
        var z = parseInt(p.style.zIndex) || 10;
        if (z > maxZ) maxZ = z;
      });
      panel.style.zIndex = maxZ + 1;
      panel.style.transition = 'none';
      if (e.type === 'mousedown') e.preventDefault();
    }

    function onDragMove(e) {
      if (!dragState) return;
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      var dx = clientX - dragState.startX;
      var dy = clientY - dragState.startY;
      var newLeft = dragState.startLeft + dx;
      var newTop = dragState.startTop + dy;
      // Clamp within main + viewport a bit
      var main = $('main');
      var mainW = main ? main.offsetWidth : window.innerWidth;
      var maxLeft = mainW - dragState.panel.offsetWidth - 4;
      var maxTop = (main ? main.offsetHeight : 2000) - 50;
      newLeft = Math.max(0, Math.min(maxLeft, newLeft));
      newTop = Math.max(0, Math.min(maxTop, newTop));
      dragState.panel.style.left = newLeft + 'px';
      dragState.panel.style.top = newTop + 'px';
      if (e.type === 'touchmove') e.preventDefault();
    }

    function onDragEnd() {
      if (!dragState) return;
      dragState.panel.style.transition = '';
      dragState = null;
      // Update main height
      var main = $('main');
      if (main) {
        var maxBottom = 0;
        getPanels().forEach(function (p) {
          var top = parseFloat(p.style.top) || 0;
          var h = parseFloat(p.style.height) || p.offsetHeight;
          maxBottom = Math.max(maxBottom, top + h);
        });
        main.style.minHeight = (maxBottom + 20) + 'px';
      }
      // Invalidate map if mapCard moved/resized
      if (map && map.invalidateSize) {
        setTimeout(function(){ map.invalidateSize(); }, 100);
      }
    }

    // Attach drag listeners to each panel header
    function attachDrag(panel) {
      var head = panel.querySelector('.panel-head');
      if (!head) return;
      head.addEventListener('mousedown', function (e) { onDragStart(e, panel); });
      head.addEventListener('touchstart', function (e) { onDragStart(e, panel); }, { passive:false });
    }

    // Resize observer for auto-scale font + map
    var ro = null;
    try {
      ro = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
          var p = entry.target;
          var w = entry.contentRect.width;
          var h = entry.contentRect.height;
          // Auto-scale font via CSS variable --panel-scale
          var scale = w / 400; // base 400px
          scale = Math.max(0.7, Math.min(1.4, scale));
          p.style.setProperty('--panel-scale', scale);
          // If mapCard, invalidate map
          if (p.id === 'mapCard' && map && map.invalidateSize) {
            map.invalidateSize();
          }
        });
      });
    } catch(e) { ro = null; }

    function attachResizeObserver(panel) {
      if (!ro) return;
      try { ro.observe(panel); } catch(e){}
    }

    // Save layout
    function saveLayout() {
      var mode = isMobileView() ? 'mobile' : 'desktop';
      var data = null;
      try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e){ data = {}; }
      if (!data.desktop) data.desktop = [];
      if (!data.mobile) data.mobile = [];
      var panels = getPanels();
      var layout = panels.map(function (p) {
        return {
          id: p.id,
          left: p.style.left || '',
          top: p.style.top || '',
          width: p.style.width || '',
          height: p.style.height || '',
          zIndex: p.style.zIndex || ''
        };
      });
      data[mode] = layout;
      data.version = 1;
      data.savedAt = new Date().toISOString();
      data.mode = mode;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        showHint('Layout ' + mode + ' disimpan lokal, ' + layout.length + ' panel. Export JSON untuk dipatenkan jadi default semua user.', 4000);
      } catch(e){
        showHint('Gagal simpan, localStorage penuh atau blocked', 3000);
      }
    }

    // Load layout, cek localStorage dulu, jika tidak ada pakai default paten dari /layout-default.json
    function applyLayoutData(data) {
      var mode = isMobileView() ? 'mobile' : 'desktop';
      var layout = data[mode] && data[mode].length ? data[mode] : data.desktop;
      if (!layout || !layout.length) return false;
      var main = $('main');
      if (main) main.style.position = 'relative';
      layout.forEach(function (item) {
        var p = $(item.id);
        if (!p) return;
        // Skip jika width/height 0 (panel disembunyikan)
        if (item.width === '0px' || item.height === '0px') {
          p.style.display = 'none';
          return;
        }
        p.style.display = '';
        p.style.position = 'absolute';
        if (item.left) p.style.left = item.left;
        if (item.top) p.style.top = item.top;
        if (item.width) p.style.width = item.width;
        if (item.height) p.style.height = item.height;
        if (item.zIndex) p.style.zIndex = item.zIndex;
        p.dataset.flexPlaced = '1';
        attachResizeObserver(p);
      });
      document.body.classList.add('layout-free');
      // Adjust main height
      var maxBottom = 0;
      getPanels().forEach(function (p) {
        if (p.style.display === 'none') return;
        var top = parseFloat(p.style.top) || 0;
        var h = parseFloat(p.style.height) || p.offsetHeight;
        maxBottom = Math.max(maxBottom, top + h);
      });
      if (main) main.style.minHeight = (maxBottom + 20) + 'px';
      setTimeout(function(){ if (map && map.invalidateSize) map.invalidateSize(); }, 300);
      return true;
    }

    function loadLayout() {
      var raw = null;
      try { raw = localStorage.getItem(STORAGE_KEY); } catch(e){ raw = null; }
      if (raw) {
        try {
          var data = JSON.parse(raw);
          if (applyLayoutData(data)) {
            console.log('[layout] loaded from localStorage');
            return true;
          }
        } catch(e){}
      }
      // Jika tidak ada localStorage, pakai default paten
      fetch('/layout-default.json', { cache: 'no-store' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
          if (!data) return;
          if (applyLayoutData(data)) {
            console.log('[layout] loaded from /layout-default.json (patented default)');
            showHint('Layout default paten dimuat, klik ATUR LAYOUT untuk edit lagi', 3500);
          }
        })
        .catch(function(){});
      return false;
    }

    // Export JSON
    function exportLayout() {
      var raw = null;
      try { raw = localStorage.getItem(STORAGE_KEY); } catch(e){}
      if (!raw) {
        // Export current positions even if not saved
        var panels = getPanels();
        var layout = panels.map(function (p) {
          return {
            id: p.id,
            left: p.style.left || '',
            top: p.style.top || '',
            width: p.style.width || '',
            height: p.style.height || '',
            zIndex: p.style.zIndex || ''
          };
        });
        raw = JSON.stringify({ desktop: layout, mobile: layout, version:1, exportedAt: new Date().toISOString() }, null, 2);
      } else {
        try {
          var obj = JSON.parse(raw);
          raw = JSON.stringify(obj, null, 2);
        } catch(e){}
      }
      // Try clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(raw).then(function(){
          showHint('JSON layout disalin ke clipboard, paste ke docs/layout-default.json untuk dipatenkan', 4000);
        }).catch(function(){
          prompt('Copy JSON layout ini untuk dipatenkan sebagai default:', raw);
        });
      } else {
        prompt('Copy JSON layout ini untuk dipatenkan sebagai default:', raw);
      }
      console.log('LAYOUT EXPORT:', raw);
    }

    // Reset layout
    function resetLayout() {
      if (!confirm('Reset layout ke default grid? Ini akan hapus simpanan lokal desktop & mobile.')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
      // Reset styles
      getPanels().forEach(function (p) {
        p.style.position = '';
        p.style.left = '';
        p.style.top = '';
        p.style.width = '';
        p.style.height = '';
        p.style.zIndex = '';
        p.style.margin = '';
        p.dataset.flexPlaced = '';
        if (p.dataset.origPosition !== undefined) {
          // restore orig if needed
        }
      });
      var main = $('main');
      if (main) { main.style.minHeight = ''; main.style.position = ''; }
      document.body.classList.remove('layout-free');
      document.body.classList.remove('layout-edit');
      bar.hidden = true;
      isEdit = false;
      toggleBtn.textContent = '✦ ATUR LAYOUT';
      toggleBtn.classList.remove('active');
      showHint('Layout direset ke default grid, reload halaman', 3000);
      setTimeout(function(){ location.reload(); }, 800);
    }

    // Init drag for all panels
    getPanels().forEach(function (p) { attachDrag(p); });

    // Global move/end listeners
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragMove, { passive:false });
    document.addEventListener('touchend', onDragEnd);

    // Buttons
    toggleBtn.addEventListener('click', toggleEdit);
    if (closeBtn) closeBtn.addEventListener('click', exitEdit);
    if (saveBtn) saveBtn.addEventListener('click', saveLayout);
    if (exportBtn) exportBtn.addEventListener('click', exportLayout);
    if (resetBtn) resetBtn.addEventListener('click', resetLayout);

    // Shortcut L
    document.addEventListener('keydown', function (e) {
      if (e.key && e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        toggleEdit();
      }
    });

    // Load saved layout on startup
    setTimeout(function(){ loadLayout(); }, 500);

    // Also load on resize to switch desktop/mobile layout if exists
    var resizeTimer = null;
    window.addEventListener('resize', function(){
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function(){
        // If not in edit mode, try to load appropriate layout
        if (!isEdit) loadLayout();
        if (map && map.invalidateSize) map.invalidateSize();
      }, 400);
    });
  })();

  // Fase 3.9 Panel toggle collapsible, hemat ruang, jika tidak muat pakai toggle
  (function () {
    var STORAGE_KEY = 'siaga_panel_collapsed_v1';
    var collapsed = {};
    try { collapsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e){ collapsed = {}; }

    function saveCollapsed() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed)); } catch(e){}
    }

    function togglePanel(panel, force) {
      var id = panel.id;
      if (!id) return;
      var isCollapsed = typeof force === 'boolean' ? force : !panel.classList.contains('is-collapsed');
      panel.classList.toggle('is-collapsed', isCollapsed);
      collapsed[id] = isCollapsed;
      saveCollapsed();
      // Update button icon
      var btn = panel.querySelector('.panel-toggle');
      if (btn) btn.textContent = isCollapsed ? '›' : '⌄';
      // Invalidate map if needed and adjust main height if free layout
      if (map && map.invalidateSize) setTimeout(function(){ map.invalidateSize(); }, 150);
      if (document.body.classList.contains('layout-free') || document.body.classList.contains('layout-edit')) {
        var main = $('main');
        if (main) {
          var maxBottom = 0;
          var panels = document.querySelectorAll('#main .panel, #main .map-card');
          for (var i=0;i<panels.length;i++) {
            var p = panels[i];
            if (p.style.display === 'none') continue;
            var top = parseFloat(p.style.top) || 0;
            var h = p.classList.contains('is-collapsed') ? (p.querySelector('.panel-head') ? p.querySelector('.panel-head').offsetHeight : 40) : (parseFloat(p.style.height) || p.offsetHeight);
            maxBottom = Math.max(maxBottom, top + h);
          }
          main.style.minHeight = (maxBottom + 20) + 'px';
        }
      }
    }

    function initPanels() {
      var panels = document.querySelectorAll('#main .panel, #main .map-card');
      for (var i=0;i<panels.length;i++) {
        var panel = panels[i];
        if (!panel.id) continue;
        // Skip mapCard toggle (peta jangan collapse total)
        if (panel.id === 'mapCard') continue;
        var head = panel.querySelector('.panel-head');
        if (!head) continue;
        // Cek apakah sudah ada toggle
        if (head.querySelector('.panel-toggle')) continue;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'panel-toggle';
        btn.title = 'Sembunyikan/tampilkan panel';
        btn.textContent = '⌄';
        btn.setAttribute('aria-label', 'Toggle panel');
        (function(p, b){
          b.addEventListener('click', function(e){
            e.stopPropagation();
            togglePanel(p);
          });
        })(panel, btn);
        head.appendChild(btn);
        // Apply saved collapsed state
        if (collapsed[panel.id]) {
          panel.classList.add('is-collapsed');
          btn.textContent = '›';
        }
      }
    }

    // Berita topics toggle khusus, banyak chip
    function initNewsTopicsToggle() {
      var topicsBox = $('newsTopics');
      var newsPanel = $('newsPanel');
      if (!topicsBox || !newsPanel) return;
      // Tambah tombol toggle topics jika belum ada
      var searchbar = newsPanel.querySelector('.searchbar');
      if (!searchbar) return;
      if (searchbar.querySelector('.ntopics-toggle')) return;
      var toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'ntopics-toggle';
      toggleBtn.textContent = '▼ topik';
      toggleBtn.title = 'Sembunyikan/tampilkan filter topik';
      toggleBtn.addEventListener('click', function(){
        topicsBox.classList.toggle('is-collapsed');
        toggleBtn.textContent = topicsBox.classList.contains('is-collapsed') ? '► topik' : '▼ topik';
      });
      // Default collapsed jika banyak topik (>8)
      if (topicsBox.children.length > 8) {
        topicsBox.classList.add('is-collapsed');
        toggleBtn.textContent = '► topik (' + topicsBox.children.length + ')';
      }
      searchbar.appendChild(toggleBtn);
    }

    // Init setelah DOM ready + setelah news render
    setTimeout(initPanels, 600);
    setTimeout(initNewsTopicsToggle, 1000);
    // Re-init saat news topics berubah
    var newsObsTimer = null;
    var origRenderNewsTopics = window.renderNewsTopics;
    // Poll untuk cek perubahan topics
    setInterval(function(){
      var topicsBox = $('newsTopics');
      if (topicsBox && topicsBox.children.length > 0) {
        var searchbar = document.querySelector('#newsPanel .searchbar');
        if (searchbar && !searchbar.querySelector('.ntopics-toggle')) {
          initNewsTopicsToggle();
        }
      }
    }, 2000);

    // Global toggle all, tekan T untuk toggle semua panel yang tidak muat
    document.addEventListener('keydown', function(e){
      if (e.key && e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        // Toggle semua panel kecuali peta dan stats
        var panels = document.querySelectorAll('#main .panel');
        var anyCollapsed = false;
        for (var i=0;i<panels.length;i++) {
          if (panels[i].classList.contains('is-collapsed')) { anyCollapsed = true; break; }
        }
        for (var i=0;i<panels.length;i++) {
          var p = panels[i];
          if (p.id === 'mapCard' || p.id === 'statsPanel') continue;
          togglePanel(p, !anyCollapsed);
        }
        showHint(anyCollapsed ? 'Semua panel ditampilkan' : 'Panel disembunyikan hemat ruang, tekan T lagi untuk tampilkan', 3000);
      }
    });
  })();

  $('lyQuake').addEventListener('change', function (e) {
    state.quakeOn = e.target.checked;
    if (state.quakeOn) {
      map.addLayer(gQuake);
      (state.hazard ? Promise.resolve() : loadHazard()).then(function () {
        drawQuakes();
        layerHint('lyQuake');
      });
    } else { map.removeLayer(gQuake); showHint(null); }
  });

  $('lyShelter').addEventListener('change', function (e) {
    state.shelterOn = e.target.checked;
    if (state.shelterOn) {
      map.addLayer(gShelter);
      (state.hazard ? Promise.resolve() : loadHazard()).then(function () {
        drawShelters();
        layerHint('lyShelter');
      });
    } else { map.removeLayer(gShelter); showHint(null); }
  });

  $('himaSel').addEventListener('change', function (e) {
    setHimawari(e.target.value);
  });

  var _lyWind = $('lyWind'); _lyWind && _lyWind.addEventListener('change', function (e) {
    state.windOn = e.target.checked;
    if (state.windOn) { map.addLayer(gWind); loadWind(); }
    else {
      map.removeLayer(gWind);
      if (state.particles) state.particles.stop();
      showHint(null);
      renderWindBadge();
    }
  });

  $('windLevel').addEventListener('change', function (e) {
    state.windLevel = e.target.value;
    // Kunci cache dikosongkan supaya aras baru benar-benar diambil,
    // bukan dijawab dari hasil aras sebelumnya.
    state.windKey = null;
    if (!state.windOn) {
      // Menyalakan sendiri lebih membantu daripada mengubah pilihan pada
      // lapisan yang sedang mati tanpa efek apa pun.
      $('lyWind').checked = true;
      state.windOn = true;
      map.addLayer(gWind);
    }
    loadWind();
  });

  function toggleConc(on) {
    state.concOn = on;
    if (on) { map.addLayer(gConc); loadConcessions(); }
    else { map.removeLayer(gConc); gConc.clearLayers(); showHint(null); }
  }
  $('lyConc').addEventListener('change', function (e) { toggleConc(e.target.checked); });

  // Fase 1.3: debounce naik 450ms → 800ms untuk kurangi beban hulu
  // loadAir() tiap moveend dengan 450ms memicu 9 request berurutan → 502
  var moveTimer = null;
  map.on('moveend zoomend', function () {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(function () {
      if (state.concOn) loadConcessions();
      if (state.windOn) loadWind();
      if (state.airOn) loadAir();
    }, 800);
  });

  $('confSel').addEventListener('change', function (e) {
    state.minConf = Number(e.target.value) || 0; drawFires();
  });

  // FRP menyaring jauh lebih tajam daripada keyakinan: VIIRS hanya punya tiga
  // tingkat keyakinan, sehingga hampir semua titik masuk kategori "nominal".
  $('frpSel').addEventListener('change', function (e) {
    state.minFrp = Number(e.target.value) || 0; drawFires();
  });

  $('colorSel').addEventListener('change', function (e) {
    state.colorBy = e.target.value === 'frp' ? 'frp' : 'confidence';
    updateLegend();
    drawFires();
  });

  function updateLegend() {
    var box = $('legendPoints'); if (!box) return; clear(box);
    var sets = state.colorBy === 'confidence'
      ? [['#ef4444', 'keyakinan tinggi'], ['#facc15', 'sedang'], ['#22c55e', 'rendah']]
      : [['#ff4d2e', 'FRP tinggi'], ['#ff9f1c', 'sedang'], ['#ffd166', 'rendah']];
    sets.forEach(function (s, i) {
      var d = el('i', 'dot');
      d.style.background = s[0];
      if (i) d.style.marginLeft = '10px';
      box.appendChild(d);
      box.appendChild(document.createTextNode(s[1]));
    });
  }

  var _baseSel = $('baseSel');
  if (_baseSel) _baseSel.addEventListener('change', function (e) { setBasemap(e.target.value); });
  $('refreshBtn').addEventListener('click', function () {
    loadOverview(); loadNews(); loadAttribution();
  });
  $('newsQ').addEventListener('input', renderNews);

  /* ---------- fullscreen peta, dapat dikeluarkan ke layar penuh ---------- */
  // Tujuan: analisis butuh ruang, terutama saat koordinasi darurat atau layar kecil.
  // Menggunakan Fullscreen API native, fallback ke class .is-fullscreen bila tidak tersedia.
  // Keluar via ESC, tombol ✕, atau tombol FULL lagi.
  (function () {
    var card = document.getElementById('mapCard') || document.querySelector('.map-card');
    var btn = $('mapFullscreenBtn');
    var exitBtn = $('mapFsExit');
    if (!card || !btn) return;

    function isFullscreen() {
      return !!(document.fullscreenElement === card || card.classList.contains('is-fullscreen'));
    }

    function updateBtn() {
      var fs = isFullscreen();
      btn.classList.toggle('is-active', fs);
      btn.setAttribute('aria-pressed', fs ? 'true' : 'false');
      var txt = btn.querySelector('.fs-txt');
      if (txt) txt.textContent = fs ? 'EXIT' : 'FULL';
      btn.title = fs ? 'Keluar layar penuh (ESC)' : 'Layar penuh (F), ESC untuk keluar';
      if (exitBtn) exitBtn.hidden = !fs;
      document.body.classList.toggle('has-fullscreen-map', fs);
      // Leaflet perlu tahu ukurannya berubah, kalau tidak ubinnya berantakan
      setTimeout(function () { map.invalidateSize(); }, 120);
      setTimeout(function () { map.invalidateSize(); }, 400);
    }

    function enterFs() {
      if (card.requestFullscreen) {
        card.requestFullscreen().catch(function () {
          // Fallback bila ditolak (mis. iframe tanpa allow)
          card.classList.add('is-fullscreen');
          updateBtn();
        });
      } else {
        card.classList.add('is-fullscreen');
        updateBtn();
      }
    }

    function exitFs() {
      if (document.fullscreenElement === card && document.exitFullscreen) {
        document.exitFullscreen();
      } else {
        card.classList.remove('is-fullscreen');
        updateBtn();
      }
    }

    function toggleFs() {
      if (isFullscreen()) exitFs();
      else enterFs();
    }

    btn.addEventListener('click', toggleFs);
    if (exitBtn) exitBtn.addEventListener('click', exitFs);

    // ESC dan F sebagai shortcut, F untuk masuk, ESC untuk keluar
    document.addEventListener('keydown', function (e) {
      // Jangan ganggu saat sedang mengetik di input
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'f' || e.key === 'F') {
        // Hanya aktif bila fokus tidak di dalam form dan peta terlihat
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          toggleFs();
        }
      } else if (e.key === 'Escape' || e.key === 'Esc') {
        if (isFullscreen()) {
          e.preventDefault();
          exitFs();
        }
      }
    });

    // Sinkron saat fullscreen berubah via browser (mis. ESC native)
    document.addEventListener('fullscreenchange', function () {
      // Jika keluar fullscreen native tapi class fallback masih ada, bersihkan
      if (!document.fullscreenElement && card.classList.contains('is-fullscreen') && !card.matches(':fullscreen')) {
        // Biarkan, karena is-fullscreen adalah fallback yang sengaja, tapi jika fullscreenElement null dan kita tidak dalam fallback mode yang diminta, bersihkan
        // Untuk membedakan, cek apakah kita baru saja exitFs via fallback
      }
      // Jika document.fullscreenElement bukan card, berarti sudah keluar
      if (document.fullscreenElement !== card) {
        card.classList.remove('is-fullscreen');
      }
      updateBtn();
    });

    // Awal: pastikan tombol dalam keadaan tidak aktif
    updateBtn();
  })();



  /* ---------- jam terminal ---------- */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  // WIB = UTC+7 dihitung eksplisit agar benar walau zona browser berbeda.
  function tickClock() {
    // Waktu server (jam perangkat + selisih terukur), lihat noteServerTime.
    var d = new Date(Date.now() + clockSkewMs);
    var wib = new Date(d.getTime() + (7 * 60 + d.getTimezoneOffset()) * 60000);
    var lo = $('clockLocal'), ut = $('clockUtc');
    if (lo) lo.textContent = pad2(wib.getHours()) + ':' + pad2(wib.getMinutes()) + ':' + pad2(wib.getSeconds());
    if (ut) ut.textContent = pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
  }

  /* ---------- ticker berjalan ---------- */
  // Digulirkan via requestAnimationFrame agar mulus dan bisa dijeda saat hover.
  var ticker = { x: 0, w: 0, paused: false, raf: null };

  function tickerItem(k, v, cls) {
    var s = el('span', 'tk');
    s.appendChild(el('span', 'tk-k', k));
    s.appendChild(el('span', 'tk-v' + (cls ? ' ' + cls : ''), v));
    return s;
  }

  function buildTicker() {
    var track = $('tickerTrack');
    if (!track) return;
    var d = state.data, at = state.attr, items = [];
    if (d && d.stats) {
      items.push(['HOTSPOT', nf.format(d.stats.hotspots), 'tk-up']);
      items.push(['CONF>=80', nf.format(d.stats.highConfidence), '']);
      items.push(['FRP MW', nf.format(d.stats.totalFrp), 'tk-am']);
      items.push(['KLASTER', nf.format(d.stats.clusters), '']);
      items.push(['TERDAMPAK', nf.format(d.stats.impactedRegions), '']);
      items.push(['TERPAPAR', nf.format(d.stats.peopleExposed), 'tk-up']);
    }
    if (d && d.worstAir) items.push(['AQI MAX', d.worstAir.aqi + ' ' + d.worstAir.label.toUpperCase(), 'tk-up']);
    if (at && at.analyzed) items.push(['DLM KONSESI', at.insideConcession + '/' + at.analyzed, 'tk-am']);
    if (state.ash && state.ash.activeCount) items.push(['GUNUNG ERUPSI', String(state.ash.activeCount), 'tk-am']);
    if (d && d.provinceRanking) {
      d.provinceRanking.slice(0, 6).forEach(function (p) {
        items.push([p.province.toUpperCase(), p.hotspots + ' TITIK', '']);
      });
    }
    if (state.news && state.news.length) items.push(['BERITA', state.news.length + ' ARTIKEL', '']);
    if (!items.length) return;

    clear(track);
    // isi dua kali supaya gulungan tampak tak terputus
    for (var rep = 0; rep < 2; rep++) {
      items.forEach(function (it, i) {
        track.appendChild(tickerItem(it[0], it[1], it[2]));
        if (i < items.length - 1) track.appendChild(el('span', 'tk-sep', '|'));
      });
      track.appendChild(el('span', 'tk-sep', '|'));
    }
    ticker.w = track.scrollWidth / 2;
    if (!ticker.raf) runTicker();
  }

  function runTicker() {
    function frame() {
      var track = $('tickerTrack');
      if (track && ticker.w > 0 && !ticker.paused) {
        ticker.x -= 0.55;
        if (-ticker.x >= ticker.w) ticker.x += ticker.w;
        track.style.transform = 'translateX(' + ticker.x + 'px)';
      }
      ticker.raf = requestAnimationFrame(frame);
    }
    ticker.raf = requestAnimationFrame(frame);
  }

  /* ---------- panel kueri (RAG lokal) ---------- */
  function renderAsk(d) {
    var box = $('askOut');
    clear(box);
    if (!d || !d.answer || !d.answer.length) {
      box.appendChild(el('p', 'empty', 'Tidak ada hasil untuk kueri itu.'));
      return;
    }
    d.answer.forEach(function (line, i) {
      var cls = 'ask-line';
      if (i === 0) cls += ' ask-head';
      else if (/^Catatan:|indikatif|bukan advisory|bukan sertifikat/i.test(line)) cls += ' ask-note';
      box.appendChild(el('div', cls, line));
    });
    if (d.sources && d.sources.length) {
      var srcWrap = el('div', 'ask-src');
      srcWrap.appendChild(el('span', 'ask-src-lab', 'SUMBER (' + d.indexed + ' dokumen terindeks)'));
      d.sources.forEach(function (s) {
        if (s.url) {
          var a = el('a', 'src-pill', s.title.slice(0, 46));
          a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          srcWrap.appendChild(a);
        } else {
          srcWrap.appendChild(el('span', 'src-pill', s.title.slice(0, 46)));
        }
      });
      box.appendChild(srcWrap);
    }
  }

  function runAsk(q) {
    if (!q) return;
    var box = $('askOut');
    clear(box);
    box.appendChild(el('p', 'ask-busy', 'MENCARI…'));
    // Sumber dingin di serverless bisa butuh belasan detik; hitungan detik
    // memberi tahu bahwa permintaan masih hidup, bukan menggantung.
    var t0 = Date.now();
    $('askMeta').textContent = 'menjalankan · 0 dtk';
    var tick = setInterval(function () {
      $('askMeta').textContent = 'menjalankan · ' + Math.round((Date.now() - t0) / 1000) + ' dtk';
    }, 1000);
    function stopTick() { clearInterval(tick); }
    // Batas waktu klien 30 dtk, bukan bawaan 12 dtk: server membatasi
    // dirinya 20 dtk per sumber saat instance dingin (lihat ASK_SOURCE_
    // DEADLINE_MS), jadi 12 dtk membuat klien menyerah sebelum jawaban
    // yang sebenarnya tersedia sempat tiba.
    fetchT('/api/ask?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } }, 30000)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('ask')); })
      .then(function (d) {
        stopTick();
        renderAsk(d);
        $('askMeta').textContent = 'intent: ' + d.intent;
      })
      .catch(function () {
        stopTick();
        clear(box);
        box.appendChild(el('p', 'empty', 'Pencarian sedang tidak tersedia. Coba lagi.'));
        $('askMeta').textContent = 'indeks lokal';
      });
  }

  /**
   * Grup tab sesuai pola ARIA.
   *
   * Selain klik, pola ini mewajibkan roving tabindex dan navigasi panah:
   * hanya tab aktif yang masuk urutan Tab, sisanya dijangkau dengan
   * panah kiri/kanan. Tanpa itu pengguna keyboard harus menekan Tab
   * melewati setiap tab satu per satu untuk mencapai isi panel.
   */
  function tabGroup(buttons) {
    function select(idx, focus) {
      buttons.forEach(function (o, i) {
        var active = i === idx;
        var btn = $(o.tab);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
        btn.tabIndex = active ? 0 : -1;
        $(o.pane).hidden = !active;
        // Panel menyebut tab pengendalinya agar pembaca layar tahu
        // isi ini milik tab yang mana.
        $(o.pane).setAttribute('aria-labelledby', o.tab);
      });
      if (focus) $(buttons[idx].tab).focus();
    }

    buttons.forEach(function (b, i) {
      var btn = $(b.tab);
      btn.tabIndex = btn.getAttribute('aria-selected') === 'true' ? 0 : -1;
      $(b.pane).setAttribute('aria-labelledby', b.tab);
      btn.addEventListener('click', function () { select(i, false); });
      btn.addEventListener('keydown', function (e) {
        var n = buttons.length;
        var to = null;
        if (e.key === 'ArrowRight') to = (i + 1) % n;
        else if (e.key === 'ArrowLeft') to = (i - 1 + n) % n;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = n - 1;
        if (to === null) return;
        e.preventDefault();
        select(to, true);
      });
    });
  }
  // Urutan daftar ini menentukan arah panah kiri/kanan, jadi harus sama
  // dengan urutan tombol di layar. Sebelumnya Abu dan Provinsi tertukar,
  // sehingga panah kanan melompati satu tab.
  tabGroup([
    { tab: 'tabImpact', pane: 'paneImpact' },
    { tab: 'tabProv', pane: 'paneProv' },
    { tab: 'tabAsh', pane: 'paneAsh' },
    { tab: 'tabCluster', pane: 'paneCluster' },
    { tab: 'tabDry', pane: 'paneDry' }
  ]);
  tabGroup([
    { tab: 'tabUnit', pane: 'paneUnit' },
    { tab: 'tabGroup', pane: 'paneGroup' }
  ]);

  $('askForm').addEventListener('submit', function (e) {
    e.preventDefault();
    runAsk($('askQ').value.trim());
  });
  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (c) {
    c.addEventListener('click', function () {
      $('askQ').value = c.getAttribute('data-q');
      runAsk(c.getAttribute('data-q'));
    });
  });

// Linimasa sebaran: 0 = kondisi sekarang, >0 = prakiraan angin ke depan.
  // Idiomnya select .field seperti baris lain panel, grup tombol lamanya bekerja
  // tetapi tidak pernah diberi gaya, sehingga muncul sebagai tombol bawaan
  // peramban yang menabrak gelapnya panel (laporan: "ada yang tidak sesuai").
  var _tlSel = $('tlSel');
  if (_tlSel) _tlSel.addEventListener('change', function (e) {
    state.plumeHour = Number(e.target.value) || 0;
    // Memilih prakiraan tanpa lapisan asap hanya menghasilkan petunjuk kosong,
    // jadi asapnya dinyalakan sendiri seperti perilaku tombol sebelumnya.
    if (!$('lySmoke').checked) { $('lySmoke').checked = true; map.addLayer(gSmoke); }
    drawSmoke();
    showHint(state.plumeHour === 0
      ? 'Menampilkan sebaran asap saat ini.'
      : 'Prakiraan sebaran ' + state.plumeHour + ' jam ke depan (garis putus-putus).');
  });

  // Panel SO2: hanya muncul bila ada gunung yang sedang erupsi.
  function loadSo2() {
    fetchT('/api/volcano-so2', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.volcanoes || !d.volcanoes.length) return;
        var grid = $('so2Grid'); clear(grid);
        d.volcanoes.forEach(function (v) {
          var card = el('div', 'so2card');
          var hd = el('div', 'so2hd');
          hd.appendChild(el('h3', null, 'G. ' + v.name));
          var b = el('span', 'so2badge', v.band.label);
          b.style.color = v.band.color;
          b.style.borderColor = v.band.color;
          hd.appendChild(b);
          card.appendChild(hd);

          var val = el('div', 'so2val');
          val.appendChild(el('b', null, v.so2 === null ? '-' : String(v.so2)));
          val.appendChild(el('span', null, ' µg/m³'));
          card.appendChild(val);

          card.appendChild(el('p', 'so2note', v.band.note));
          if (v.activity && v.activity.summary) {
            var act = el('p', 'so2act');
            if (v.activity.period) act.appendChild(el('b', null, 'Laporan GVP ' + v.activity.period + ': '));
            act.appendChild(document.createTextNode(v.activity.summary));
            card.appendChild(act);
          }
          card.appendChild(el('p', 'so2meta',
            'Puncak ' + nf.format(v.elevM) + ' m' + (v.aqi !== null ? ' · US AQI sekitar ' + v.aqi : '')));

          card.addEventListener('click', function () { map.setView([v.lat, v.lon], 9); });
          card.title = 'Klik untuk memusatkan peta ke G. ' + v.name;
          grid.appendChild(card);
        });
        $('so2Panel').hidden = false;
      })
      .catch(function () {
        // Kuota model CAMS bisa habis; panel disembunyikan, bukan menampilkan
        // angka kosong yang bisa disalahartikan sebagai "SO2 nol".
      });
  }
  loadSo2();

  var tickerView = document.querySelector('.ticker-view');
  if (tickerView) {
    tickerView.addEventListener('mouseenter', function () { ticker.paused = true; });
    tickerView.addEventListener('mouseleave', function () { ticker.paused = false; });
  }


  /* ---------- panel Siaran: kamera & siaran publik ---------- */
  /**
   * Daftar ini bukan hasil pengambilan berkala dari YouTube, melainkan
   * kurasi yang disimpan di repo (data/kamera.js). Konsekuensinya di layar:
   * yang ditampilkan adalah identitas kanal, tautan, dan dasar pemeriksaannya,
   * bukan klaim "sedang live", sebab status siaran tidak kami ukur.
   *
   * Pemutar disematkan hanya setelah pengguna menekan tombol, jadi membuka
   * panel tidak otomatis menghubungi pihak ketiga, dan bila kanal sedang
   * tidak menyiarkan, YouTube sendiri yang menampilkan pesannya.
   */
  function muatSiaran() {
    var box = $('daftarSiaran');
    if (!box) return;
    fetchT('/api/kamera', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) { renderSiaran(d); })
      .catch(function (e) {
        box.textContent = '';
        box.appendChild(el('p', 'empty', 'Daftar siaran tidak dapat dimuat ('
          + ((e && e.message) || 'galat') + '). Kanalnya tetap ada di YouTube; '
          + 'aplikasi ini tidak menyimpan salinan siaran.'));
        var m = $('siaranMeta');
        if (m) m.textContent = 'gagal dimuat';
      });
  }

  function renderSiaran(d) {
    var box = $('daftarSiaran');
    if (!box) return;
    box.textContent = '';
    var items = (d && d.item) || [];
    var meta = $('siaranMeta');
    if (meta) {
      var r = (d && d.ringkas) || {};
      meta.textContent = items.length
        ? items.length + ' sumber (' + (r.resmi || 0) + ' resmi, ' + (r.komunitas || 0)
          + ' komunitas), kurasi manual, diperiksa '
          + (r.diperiksa ? fmtTanggal(new Date(r.diperiksa + 'T00:00:00Z')) : 'tidak dicatat')
          + ' · status siaran milik sumber, bukan diukur di sini'
        : 'belum ada sumber terdaftar';
    }
    if (!items.length) {
      box.appendChild(el('p', 'empty', 'Belum ada sumber siaran yang terdaftar.'));
      return;
    }
    items.forEach(function (k) { box.appendChild(kartuSiaran(k)); });
  }

  /* ---------- kamera web komunitas (Windy) ----------
     Sumber ini butuh kunci API milik kita. Bila kunci belum ada, yang
     ditampilkan adalah keadaan sebenarnya beserta sebabnya; daftar kosong
     tanpa keterangan akan terbaca sebagai "tidak ada kamera di Indonesia",
     dan itu tidak benar. */
  var PETA_WINDY = 'https://www.windy.com/id/-Kamera-web/webcams';

  function muatWindy() {
    var box = $('daftarWindy');
    if (!box) return;
    fetchT('/api/webcams', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) { renderWindy(d); })
      .catch(function (e) {
        var m = $('windyMeta');
        if (m) m.textContent = 'gagal dimuat';
        box.textContent = '';
        box.appendChild(el('p', 'empty', 'Keadaan sumber kamera Windy tidak dapat diperiksa ('
          + ((e && e.message) || 'galat') + '). Daftar kamera Windy tetap ada di situsnya.'));
      });
  }

  function renderWindy(d) {
    var box = $('daftarWindy');
    if (!box) return;
    box.textContent = '';
    var meta = $('windyMeta');
    var item = (d && d.item) || [];

    if (!d || d.aktif === false) {
      if (meta) meta.textContent = 'belum aktif';
      var p = el('p', 'empty',
        'Belum aktif: kunci API Windy belum dipasang pada lingkungan ini, jadi daftar kamera tidak diambil. '
        + 'Windy tidak menyediakan daftar kamera tanpa kunci (permintaan tanpa kunci dijawab 403), '
        + 'sehingga halaman ini menyatakan keadaannya apa adanya alih-alih menampilkan kotak kosong.');
      box.appendChild(p);
      var baris = el('div', 'siaran-aksi');
      var a = el('a', 'btn btn-ghost', 'BUKA PETA KAMERA DI WINDY');
      a.href = PETA_WINDY;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      baris.appendChild(a);
      box.appendChild(baris);
      return;
    }

    if (!d.ok) {
      if (meta) meta.textContent = 'sumber sedang gagal';
      box.appendChild(el('p', 'empty', 'Sumber kamera Windy sedang gagal ('
        + ((d.galat) || 'sebab tidak diketahui') + '). Tidak ada kamera yang ditampilkan, '
        + 'bukan berarti tidak ada kamera di sana.'));
      return;
    }

    if (meta) {
      var bagian = [item.length + ' kamera komunitas'];
      bagian.push('sumber Windy.com');
      bagian.push('diperbarui ' + umurTeks(d.umurMs));
      if (d.basi) bagian.push('salinan lama, sumber sedang gagal');
      bagian.push('waktu foto milik sumber, bukan siaran langsung yang diukur di sini');
      meta.textContent = bagian.join(' · ');
    }
    if (!item.length) {
      box.appendChild(el('p', 'empty', 'Windy menjawab, tetapi tidak ada kamera komunitas untuk Indonesia.'));
      return;
    }
    item.forEach(function (c) { box.appendChild(kartuWindy(c)); });
  }

  function kartuWindy(c) {
    var card = el('div', 'siaran-card');
    var head = el('div', 'siaran-card-head');
    head.appendChild(el('b', null, c.judul));
    head.appendChild(el('span', 'siaran-badge komunitas', 'KOMUNITAS'));
    card.appendChild(head);
    card.appendChild(el('div', 'siaran-owner',
      [c.kota, c.wilayah, c.negara].filter(Boolean).join(', ') || 'lokasi tidak dicatat sumber'));

    if (c.adaFoto) {
      var bingkai = el('div', 'siaran-thumb');
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = 'Pratinjau kamera ' + c.judul;
      // Gambar dialirkan lewat server; daftar CSP tidak perlu dibuka ke CDN
      // pihak ketiga hanya untuk pratinjau.
      img.src = '/api/webcams/foto?id=' + encodeURIComponent(c.id);
      img.addEventListener('error', function () {
        bingkai.textContent = 'pratinjau tidak dapat dimuat';
        bingkai.classList.add('gagal');
      });
      bingkai.appendChild(img);
      card.appendChild(bingkai);
    }

    card.appendChild(el('div', 'siaran-bukti', c.waktuFoto
      ? 'Foto terakhir menurut sumber: ' + fmtJamWib(Date.parse(c.waktuFoto)) + ' · Windy.com'
      : 'Waktu foto tidak dicatat sumber · Windy.com'));

    var aksi = el('div', 'siaran-aksi');
    var a = el('a', 'btn btn-ghost', 'BUKA DI WINDY');
    a.href = c.tautan;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    aksi.appendChild(a);
    card.appendChild(aksi);
    return card;
  }

  function kartuSiaran(k) {
    var card = el('div', 'siaran-card');
    var head = el('div', 'siaran-card-head');
    head.appendChild(el('b', null, k.nama));
    head.appendChild(el('span', 'siaran-badge ' + (k.sifat === 'resmi' ? 'resmi' : 'komunitas'),
      k.sifat === 'resmi' ? 'RESMI' : 'KOMUNITAS'));
    card.appendChild(head);
    card.appendChild(el('div', 'siaran-owner', k.pemilik + ' · ' + k.wilayah));
    card.appendChild(el('div', 'siaran-note-body', k.catatan));

    var aksi = el('div', 'siaran-aksi');
    if (k.kanal) {
      var tombol = el('button', 'btn btn-ghost', 'TAMPILKAN SIARAN');
      tombol.type = 'button';
      tombol.addEventListener('click', function () { sematSiaran(k, card, tombol); });
      aksi.appendChild(tombol);
    }
    var tautan = el('a', 'btn btn-ghost', 'BUKA DI YOUTUBE');
    tautan.href = k.tautan;
    tautan.target = '_blank';
    tautan.rel = 'noopener noreferrer';
    aksi.appendChild(tautan);
    card.appendChild(aksi);
    card.appendChild(el('div', 'siaran-bukti', 'Dasar pemeriksaan: ' + k.bukti));
    return card;
  }

  function sematSiaran(k, card, tombol) {
    // Sekali semat per kartu: menekan berulang dulu akan menumpuk bingkai
    // dan menyalakan beberapa pemutar sekaligus di dalam satu panel.
    if (card.querySelector('iframe')) return;
    var wrap = el('div', 'siaran-frame');
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/live_stream?channel=' + encodeURIComponent(k.kanal);
    f.title = 'Siaran ' + k.kanalNama;
    f.loading = 'lazy';
    f.setAttribute('allow', 'encrypted-media; picture-in-picture');
    f.setAttribute('allowfullscreen', '');
    wrap.appendChild(f);
    card.appendChild(wrap);
    card.appendChild(el('div', 'siaran-frame-note',
      'Bila kotak di atas kosong atau berbunyi tidak ada siaran, berarti kanal '
      + 'sedang tidak menyiarkan. Status siaran diatur YouTube, bukan diukur aplikasi ini.'));
    if (tombol) { tombol.disabled = true; tombol.textContent = 'SIARAN DISEMATKAN'; }
  }


  /* ---------- lalu lintas udara sipil (ADS-B publik) ---------- */
  /**
   * Dua hal yang tidak boleh terjadi di lapisan ini, dan karena itu ditulis
   * di kode bukan hanya di niat: (a) menyajikan salinan lama seolah baru, dan
   * (b) membiarkan pembaca menyimpulkan bahwa peta ini lengkap. Jaringan
   * penerima ADS-B tidak rapat di banyak wilayah Indonesia, jadi ketiadaan
   * pesawat di satu kotak bukan bukti tidak ada penerbangan - itu ditulis di
   * keterangan panel, bukan disembunyikan.
   */
  var WARNA_PESAWAT = { darat: '#8E96A3', rendah: '#fb923c', sedang: '#facc15', tinggi: '#7dd3fc' };

  function warnaPesawat(p) {
    if (p.diDarat) return WARNA_PESAWAT.darat;
    if (p.altM == null) return WARNA_PESAWAT.sedang;
    if (p.altM < 3000) return WARNA_PESAWAT.rendah;
    if (p.altM < 9000) return WARNA_PESAWAT.sedang;
    return WARNA_PESAWAT.tinggi;
  }

  function loadFlights() {
    return fetchT('/api/flights', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        state.flights = d;
        state.flightsAt = new Date();
        drawFlights();
      })
      .catch(function (e) {
        // Kegagalan pengambilan TIDAK diubah menjadi "tidak ada pesawat".
        state.flights = { ok: false, items: [], galat: (e && e.message) || 'galat' };
        state.flightsAt = new Date();
        drawFlights();
      });
  }

  function umurTeks(ms) {
    if (ms == null) return 'umur tidak diketahui';
    var mnt = Math.round(ms / 60000);
    if (mnt < 1) return 'baru saja';
    if (mnt < 60) return mnt + ' mnt lalu';
    return Math.round(mnt / 60) + ' jam lalu';
  }

  function drawFlights() {
    gFlights.clearLayers();
    var meta = $('fltMeta');
    var d = state.flights;
    if (!d) return;
    var items = d.items || [];

    if (!d.ok) {
      if (meta) {
        meta.textContent = 'Sumber lalu lintas udara tidak tersedia (' + (d.galat || 'sebab tidak diketahui')
          + '). Tidak ada pesawat yang digambar, bukan berarti tidak ada penerbangan.';
      }
      return;
    }

    items.forEach(function (p) {
      var warna = warnaPesawat(p);
      var mk = L.circleMarker([p.lat, p.lon], {
        radius: p.diDarat ? 2.8 : 3.6,
        color: warna, weight: 1.1, fillColor: warna, fillOpacity: p.diDarat ? 0.5 : 0.75
      }).addTo(gFlights);
      mk.bindPopup(function () { return popupPesawat(p); });
    });

    if (meta) {
      var bagian = [];
      bagian.push(items.length
        ? items.length + ' pesawat terpancar'
        : 'tidak ada pesawat terpancar di wilayah cakupan');
      if (d.penyedia) {
        bagian.push('sumber ' + d.penyedia + (d.sumberAsal ? ' (' + d.sumberAsal + ')' : ''));
      }
      // Cakupan wajib disebut: adsb.lol hanya menutup titik-titik yang
      // terdaftar, dan menyembunyikan itu sama dengan mengklaim peta ini
      // menampilkan seluruh langit Indonesia.
      if (d.cakupan && d.cakupan.keterangan) bagian.push('cakupan ' + d.cakupan.keterangan);
      bagian.push('diperbarui ' + umurTeks(d.umurMs));
      if (d.basi) bagian.push('salinan lama, sumber sedang gagal: ' + (d.galat || 'sebab tidak diketahui'));
      bagian.push('data publik ADS-B, jaringan penerima tidak rapat');
      meta.textContent = bagian.join(' · ');
    }
  }

  function popupPesawat(p) {
    var box = document.createElement('div');
    box.appendChild(el('div', 'pp-t', p.callsign || p.icao || 'Pesawat tanpa callsign'));
    var baris = [];
    if (p.negara) baris.push('Negara pendaftaran: ' + p.negara);
    baris.push('Ketinggian: ' + (p.altM == null ? 'tidak terukur'
      : nf.format(p.altM) + ' m (' + nf.format(Math.round(p.altM * 3.28084)) + ' kaki)'));
    if (p.kecepatanMs != null) {
      baris.push('Kecepatan: ' + nf.format(Math.round(p.kecepatanMs * 3.6)) + ' km/j');
    }
    if (p.arahDeg != null) baris.push('Arah: ' + Math.round(p.arahDeg) + ' derajat');
    baris.push(p.diDarat ? 'Status: di darat' : 'Status: di udara');
    if (p.terakhirKontak) baris.push('Kontak terakhir: ' + fmtJamWib(Date.parse(p.terakhirKontak)));
    baris.push('Kode ICAO24: ' + p.icao);
    baris.forEach(function (t) { box.appendChild(el('div', 'pp-r', t)); });
    var penyedia = (state.flights && (state.flights.sumberAsal || state.flights.penyedia))
      || 'jaringan ADS-B publik';
    box.appendChild(el('div', 'pp-r pp-load',
      'Sumber: ' + penyedia + '. Tidak semua pesawat terpancar ke penerima darat; '
      + 'ketiadaan pesawat di satu wilayah bukan bukti tidak ada penerbangan.'));
    return box;
  }

  var _lyFlights = $('lyFlights');
  if (_lyFlights) {
    _lyFlights.addEventListener('change', function (e) {
      state.flightsOn = e.target.checked;
      if (state.flightsOn) {
        // Tanda memuat dipasang lebih dulu. Sebelum ini layar diam sampai
        // data tiba, dan jeda itu nyata: terukur 6,2 detik di produksi
        // karena percobaan ke sumber langsung menghabiskan batas waktunya.
        // Diam selama itu terbaca sebagai fitur rusak.
        var m = $('fltMeta');
        if (m && !state.flights) {
          m.textContent = 'memuat lalu lintas udara sipil...';
        }
        map.addLayer(gFlights);
        loadFlights();
      } else {
        map.removeLayer(gFlights);
        gFlights.clearLayers();
      }
    });
  }

  /* ---------- mulai ---------- */
  tickClock();
  var clockIv = setInterval(tickClock, 1000);
  updateLegend();
  loadOverview();
  muatSiaran();
  muatWindy();
  // loadWind() tidak dipanggil di sini: lapisan angin mulai mati, dan
  // pengambilannya akan berjalan sendiri begitu pengguna menyalakannya.
  loadNews();
  loadAttribution();
  loadDrought();

  // Fase 2.4: Page Visibility API, hentikan polling saat tab tersembunyi
  // 5 tab terbuka = 5x beban hulu. Saat hidden, pause semua interval kecuali jam.
  var intervals = [];
  function addInterval(fn, ms) {
    var id = setInterval(fn, ms);
    intervals.push(id);
    return id;
  }
  function clearAllIntervals() {
    for (var i = 0; i < intervals.length; i++) clearInterval(intervals[i]);
    intervals = [];
  }
  function startIntervals() {
    clearAllIntervals();
    // 5 menit, bukan 10: max-age CDN overview 2 menit, jadi pada 5 menit
    // stempel "diperbarui" di layar tidak pernah tertinggal lebih dari itu.
    // Tab tersembunyi tetap dijeda oleh clearAllIntervals(), kuota aman.
    intervals.push(setInterval(function () { loadOverview(); loadAttribution(); }, 5 * 60 * 1000));
    intervals.push(setInterval(loadDrought, 60 * 60 * 1000));
    intervals.push(setInterval(loadNews, 3 * 60 * 1000));
    intervals.push(setInterval(loadHazard, 2 * 60 * 1000));
    // Lalu lintas udara hanya disegarkan saat lapisannya menyala. Sumber
    // punya jatah permintaan harian, jadi jangan memanggil saat tak terlihat.
    intervals.push(setInterval(function () { if (state.flightsOn) loadFlights(); }, 5 * 60 * 1000));
    intervals.push(setInterval(loadEruptions, 5 * 60 * 1000));
    intervals.push(setInterval(loadCasualties, 10 * 60 * 1000));
    intervals.push(setInterval(loadStatus, 60 * 1000));
    intervals.push(setInterval(refreshHimawari, 60 * 1000));
  }
  startIntervals();

  // Gempa & tsunami harus sesegar mungkin: perbarui tiap 2 menit.
  loadHazard();
  // Laporan letusan menentukan apakah sebaran abu digambar, jadi disegarkan
  // serapat data gempa.
  loadEruptions();
  loadCasualties();
  // Chip status di kepala dan tautan F6 "SUMBER" dulu tidak melakukan apa
  // pun (tanpa handler; anchor menunjuk elemen hidden). Keduanya kini benar-
  // benar membuka tab Sumber di dock bawah.
  function openSumberTab() {
    var tb = $('dt-sumber');
    if (!tb) return;
    tb.click();
    tb.scrollIntoView({ block: 'nearest' });
  }
  var chipBtn = $('srcChip');
  if (chipBtn) chipBtn.addEventListener('click', openSumberTab);
  Array.prototype.forEach.call(
    document.querySelectorAll('a[href="#sourcePanel"]'),
    function (a) { a.addEventListener('click', function (e) { e.preventDefault(); openSumberTab(); }); }
  );

  loadStatus();
  // Di host tanpa penjadwal internal, sumber baru disegarkan saat datanya
  // diminta, jadi status SEBELUM data pertama tiba selalu terlihat mati.
  // Satu penyegaran status tertunda membuat panel converge ke keadaan
  // sebenarnya (~setelah data boot masuk) tanpa membebani poll rutin.
  setTimeout(loadStatus, 15000);

  // Visibility handling
  var wasHidden = false;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      wasHidden = true;
      clearAllIntervals();
      // Hentikan animasi ticker dan partikel angin juga untuk hemat CPU
      if (ticker) ticker.paused = true;
      if (state.particles) state.particles.stop();
      showHint('Tab tersembunyi, polling dijeda untuk hemat kuota.', 4000);
    } else {
      if (wasHidden) {
        wasHidden = false;
        if (ticker) ticker.paused = false;
        if (state.windOn && state.particles) state.particles.start();
        // Saat kembali terlihat, segarkan data yang mungkin basi
        loadOverview();
        loadHazard();
        loadStatus();
        startIntervals();
        showHint('Tab aktif kembali, data disegarkan.', 4000);
      }
    }
  });

  // Citra Himawari terbit tiap 10 menit; periksa tiap menit agar slot baru
  // langsung tampil tanpa perlu memuat ulang halaman.

  // Lapisan peta harus mengikuti keadaan kotak centang saat halaman dibuka.
  // Sebelum ini setiap map.addLayer() hanya hidup di dalam change handler,
  // jadi lapisan yang sudah tercentang di markup, termasuk titik api yang
  // menjadi inti produk, tidak pernah muncul sampai seseorang mengklik
  // sakelarnya dua kali. Diukur: 0 titik di peta, menjadi 2.000 setelah
  // satu toggle.
  //
  // Penambahan layer group hampir tanpa biaya dan tetap aman meski panel
  // Lapisan sedang tersembunyi, justru itu keadaan normal saat halaman
  // dibuka, jadi tab tersembunyi sengaja TIDAK dijadikan penjaga. Data
  // titik api sendiri sudah dimuat dan digambar oleh alur yang ada
  // (drawFires dipanggil begitu /api/overview tiba), sehingga yang perlu
  // ditambahkan di sini hanyalah memasang layer group-nya ke peta.
  // Abu dan angin dikecualikan: keduanya sudah punya pemeriksaan sendiri
  // saat mulai, dan menambahkannya di sini akan memicu muat dua kali.
  (function syncLayers() {
    var _lv = $('lyVolcano');
    if (_lv) state.volcanoOn = _lv.checked;
    [['lyFire', gFire], ['lyAir', gAir], ['lyQuake', gQuake],
     ['lyShelter', gShelter], ['lySmoke', gSmoke], ['lyConc', gConc],
     ['lyFlights', gFlights],
     ['lyVolcano', gVolcano]
    ].forEach(function (t) {
      var el = $(t[0]);
      if (!el || !el.checked) return;
      try { map.addLayer(t[1]); } catch (e) {}
    });
    // Data gunung dibutuhkan dua sakelar (abu & letusan); muat sekali di awal
    // bila salah satunya ON - loadAsh punya gerbang ashOn||volcanoOn sendiri.
    if (state.volcanoOn || state.ashOn) loadAsh();
    if (state.flightsOn) loadFlights();
    setTimeout(function () {
      try { map.invalidateSize(); } catch (e) {}
    }, 260);
  })();
})();
