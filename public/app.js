/* SIAGA ID — frontend.
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
   * "—" selamanya, pesan galat tidak muncul, dan tombol REFRESH terkunci.
   * Kegagalan yang tak terlihat lebih berbahaya daripada kegagalan yang
   * jelas — pembaca menyimpulkan "tidak ada bencana" padahal artinya
   * "kami tidak tahu".
   */
  function fetchT(url, opts, ms) {
    ms = ms || 12000;
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms);
    opts = opts || {};
    opts.signal = ctl.signal;
    return fetch(url, opts).then(
      function (r) { clearTimeout(timer); return r; },
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
      if (n.textContent === '' || n.textContent === '—') n.textContent = 'gagal';
    });
  }
  var nf = new Intl.NumberFormat('id-ID');

  /* ---------- peta ---------- */
  var map = L.map('map', { zoomControl: false, minZoom: 4, maxZoom: 12, worldCopyJump: false })
    .setView([-2.2, 117.5], 5);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  // Leaflet menyimpan ukuran petanya saat inisialisasi dan tidak
  // memperbaruinya sendiri. Bila tinggi wadah berubah karena media query
  // — misalnya perangkat diputar dari potret ke lanskap — peta tetap
  // memakai ukuran lama dan hanya memuat sebagian ubin. Pemberitahuan
  // ini dijeda agar tidak dihitung ulang pada tiap piksel saat jendela
  // diseret.
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { map.invalidateSize(); }, 200);
  });

  var AGS = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var ATTR = 'Peta dasar &copy; Esri, Maxar, Earthstar Geographics, HERE, Garmin, &copy; OpenStreetMap contributors';

  // Basemap: gelap (default), citra satelit, dan relief — mengikuti pilihan SiPongi.
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
  var activeBase = 'gelap';
  BASEMAPS.gelap.addTo(map);

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
  var gWind = L.layerGroup().addTo(map);   // aktif sejak awal (checkbox tercentang)
  var gSmoke = L.layerGroup().addTo(map);
  var gConc = L.layerGroup();
  var gFire = L.layerGroup().addTo(map);
  var gImpact = L.layerGroup().addTo(map);
  var gQuake = L.layerGroup();
  var gShelter = L.layerGroup();

  var state = {
    data: null, attr: null, news: [], newsTopics: [], newsTopic: 'semua', minConf: 0, minFrp: 10,
    concOn: false, concBusy: false, colorBy: 'confidence',
    wind: null, windKey: null, windOn: true, windBusy: false, particles: null, plumeHour: 0,
    air: null, airKey: null, airOn: false, airBusy: false,
    ash: null, ashOn: false, ashBusy: false, newsAt: '',
    // Harus cocok dengan <option selected> pada #himaSel (nonaktif),
    // jika tidak, state dan tampilan kontrol saling bertentangan.
    hima: null, himaProduct: '', himaLayer: null,
    hazard: null, hazardAt: null, quakeOn: false, shelterOn: false,
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
    // Nol karena filter dan nol karena sumber kosong ditulis berbeda —
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
        { warn: 'Model perkiraan berbasis angin — bukan model dispersi atmosfer maupun pengukuran kualitas udara.' });

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


  function drawImpact() {
    gImpact.clearLayers();
    if (!state.data) return;
    state.data.impacted.forEach(function (r) {
      var col = r.level === 'Berat' ? '#f87171' : r.level === 'Sedang' ? '#fbbf24' : '#34d399';
      L.circleMarker([r.lat, r.lon], {
        radius: 7 + r.score / 14, color: col, weight: 2, fillColor: col, fillOpacity: 0.15
      }).bindPopup(popupNode(r.name + ' — ' + r.prov, [
        'Tingkat paparan: ' + r.level + ' (indeks ' + r.score + '/100)',
        'Sumber asap terdekat: ' + nf.format(r.nearestKm) + ' km (' + r.proximity + ')',
        'Asap datang dari arah ' + r.fromDir + ' · angin ' + r.windSpeed + ' m/s',
        r.etaText.charAt(0).toUpperCase() + r.etaText.slice(1),
        'Terpapar oleh ' + r.plumes + ' pluma asap',
        'Perkiraan penduduk: ' + nf.format(r.population) + ' jiwa',
        'Saran: ' + r.advice
      ], { warn: 'Indeks paparan adalah model perkiraan dari arah angin dan intensitas api, bukan hasil pengukuran ISPU di lapangan.' })).addTo(gImpact);
    });
  }

  /* ---------- kualitas udara (AQI) ---------- */
  // Digambar sebagai sel persegi seukuran grid agar membentuk heatmap.
  function drawAir() {
    gAir.clearLayers();
    if (!state.air || !state.air.points.length) return;
    var half = (state.air.step || 1.5) / 2;
    state.air.points.forEach(function (p) {
      var bounds = [[p.lat - half, p.lon - half], [p.lat + half, p.lon + half]];
      var op = p.aqi >= 200 ? 0.3 : p.aqi >= 100 ? 0.22 : p.aqi >= 50 ? 0.15 : 0.09;
      L.rectangle(bounds, {
        pane: 'airPane',
        color: p.color, weight: 0, fillColor: p.color, fillOpacity: op, interactive: true
      }).bindPopup(popupNode('Kualitas udara — US AQI ' + nf.format(p.aqi), [
        'Kategori: ' + p.label,
        p.pm25 !== null ? 'PM2,5: ' + p.pm25 + ' µg/m³' : null,
        p.pm10 !== null ? 'PM10: ' + p.pm10 + ' µg/m³' : null,
        'Koordinat: ' + p.lat.toFixed(2) + ', ' + p.lon.toFixed(2)
      ], { warn: airAdvice(p.aqi) })).addTo(gAir);
    });
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

  function drawAsh() {
    gAsh.clearLayers();
    if (!state.ash || !state.ash.active.length) return;

    state.ash.active.forEach(function (v) {
      // Pluma tertinggi digambar lebih dulu agar lapisan rendah tampak di atasnya.
      v.plumes.slice().sort(function (a, b) { return b.altKm - a.altKm; }).forEach(function (p) {
        L.polygon(p.polygon, {
          pane: 'ashPane',
          color: p.color, weight: 1, opacity: 0.5,
          fillColor: p.color, fillOpacity: 0.13, dashArray: '5,4'
        }).bindPopup(popupNode('Sebaran abu ' + v.name + ' — ' + p.levelLabel, [
          'Arah sebaran: ' + compass(p.to) + ' (' + p.to + '°)',
          'Kecepatan angin: ' + p.speed + ' m/s pada ~' + p.altKm + ' km',
          'Perkiraan jangkauan: ' + nf.format(p.reachKm) + ' km'
        ], { warn: 'Perkiraan indikatif dari angin ketinggian, bukan advisory resmi VAAC.' }))
          .addTo(gAsh);
      });

      var o = v.official;
      L.marker([v.lat, v.lon], { icon: volcanoIcon(v), pane: 'volcanoPane' })
        .bindPopup(popupNode('Gunung ' + v.name, [
          o ? 'Status resmi PVMBG: Level ' + o.roman + ' — ' + o.status : 'Status resmi PVMBG: tidak tercatat',
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
        .addTo(gAsh);
    });
  }

  function loadAsh() {
    if (!state.ashOn || state.ashBusy) return Promise.resolve();
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
  function setHimawari(product) {
    if (state.himaLayer) { map.removeLayer(state.himaLayer); state.himaLayer = null; }
    state.himaProduct = product;
    // Saat citra satelit menyala, angin diredupkan agar awan tetap terbaca.
    syncWindOpacity();
    if (!product) { renderHimaInfo(); return; }
    // JMA hanya menerbitkan petak hingga z=5; meminta z=6 membalas 404
    // sehingga citra hilang total begitu peta diperbesar. Dengan maxNativeZoom
    // 5, Leaflet meregangkan petak z=5 untuk zoom lebih dalam.
    state.himaLayer = L.tileLayer('/api/himawari/' + product + '/{z}/{x}/{y}.jpg', {
      pane: 'himaPane', maxNativeZoom: 5, maxZoom: 12,
      opacity: (product === 'vis' || product === 'ash' || product === 'dust') ? 0.85 : 0.62,
      attribution: 'Citra: Himawari-9 / JMA'
    }).addTo(map);
    fetchT('/api/himawari/meta')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { if (m) { state.hima = m; renderHimaInfo(); } })
      .catch(function () { /* diamkan: peta tetap berfungsi tanpa label waktu */ });
    renderHimaInfo();
  }

  function renderHimaInfo() {
    var box = $('himaInfo');
    if (!box) return;
    clear(box);
    if (!state.himaProduct || !state.himaLayer) { box.hidden = true; return; }
    box.hidden = false;
    var t = state.hima && state.hima.time ? new Date(state.hima.time) : null;
    var LBL = { ir: 'Inframerah', vis: 'Warna alami', ash: 'RGB Abu Vulkanik',
      dust: 'RGB Debu', wv: 'Uap air' };
    var label = LBL[state.himaProduct] || state.himaProduct;
    box.appendChild(el('span', 'hi-sat', 'Himawari-9'));
    box.appendChild(el('span', 'hi-mode', label));
    if (t) {
      // toLocaleTimeString memakai zona perangkat, sehingga label "WIB" bisa
      // salah bagi pengguna di luar WIB. Offset dihitung manual dari UTC.
      var wib = new Date(t.getTime() + 7 * 3600000);
      box.appendChild(el('span', 'hi-time',
        pad2(wib.getUTCHours()) + '.' + pad2(wib.getUTCMinutes()) + ' WIB'));
      // JMA menerbitkan pemindaian penuh tiap 10 menit; tampilkan umurnya
      // supaya jelas ini citra terbaru, bukan gambar statis.
      var mins = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000));
      box.appendChild(el('span', 'hi-age', mins < 1 ? 'baru saja' : mins + ' mnt lalu'));
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
        // Paksa unduh ulang petak dengan penanda waktu pada URL.
        if (state.himaLayer) {
          state.himaLayer.setUrl('/api/himawari/' + state.himaProduct +
            '/{z}/{x}/{y}.jpg?t=' + encodeURIComponent(m.time), false);
        }
        renderHimaInfo();
      })
      .catch(function () { /* biarkan citra lama tetap tampil */ });
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
      $('sQuake').textContent = qc ? nf.format(qc.total) : '—';
      if (q && q.latest && q.latest.magnitude !== null) {
        $('sQuakeSub').textContent = 'terkini M ' + q.latest.magnitude
          + ' · ' + String(q.latest.area || '').slice(0, 34);
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

    // Kontrol lapisan pengungsian dimatikan saat tidak ada posko aktif —
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
    if (q && q.latest) {
      var L = q.latest;
      var box = el('div', 'hz-block');
      var hd = el('div', 'hz-head');
      hd.appendChild(el('span', 'hz-title', 'Gempa terkini'));
      var badge = el('span', 'hz-badge', 'M ' + (L.magnitude !== null ? L.magnitude : '-'));
      badge.style.background = L.color;
      hd.appendChild(badge);
      box.appendChild(hd);

      box.appendChild(el('div', 'hz-main', L.area || '-'));
      box.appendChild(el('div', 'hz-sub',
        [L.dateLabel, L.depthKm !== null ? 'kedalaman ' + L.depthKm + ' km' : null,
          L.severityLabel].filter(Boolean).join(' · ')));

      if (L.potensi) {
        var p = el('div', 'hz-note' + (L.tsunami ? ' hz-alert' : ''));
        p.textContent = 'Status BMKG: ' + L.potensi;
        box.appendChild(p);
      }
      if (L.felt) box.appendChild(el('div', 'hz-note', 'Dirasakan: ' + L.felt));

      var grid = el('div', 'hz-cards');
      grid.appendChild(hazardCard(nf.format(q.counts.total), 'gempa tercatat'));
      grid.appendChild(hazardCard(nf.format(q.counts.kuat), 'magnitudo ≥ 5'));
      grid.appendChild(hazardCard(nf.format(q.counts.tsunami), 'berpotensi tsunami'));
      box.appendChild(grid);
      body.appendChild(box);
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
      body.appendChild(tb);
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
            sb.appendChild(makeRow(i + 1, a.area, nf.format(a.people) + ' jiwa',
              null, null, (a.people / max) * 100, null));
          });
        }
        sb.appendChild(el('div', 'hz-note',
          'Sumber: ' + sh.source + (ev.updatedAt ? ' · diperbarui ' + ev.updatedAt.slice(0, 10) : '')));
        body.appendChild(sb);
      });
    } else if (sh) {
      // Tidak ada pengungsian aktif. Blok ini tetap ditampilkan agar
      // pembaca tahu datanya memang kosong — bukan gagal dimuat — dan
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
          title: 'M ' + q.magnitude + ' — ' + (q.area || 'wilayah tidak disebut'),
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
    if (meta) meta.textContent = s.healthy + '/' + s.total + ' sumber sehat · ' + s.mode;

    s.tasks.forEach(function (t) {
      var c = el('div', 'st-card' + (t.healthy ? '' : ' st-bad'));
      var top = el('div', 'st-top');
      var dot = el('i', 'st-dot');
      dot.style.background = t.healthy ? '#22c55e' : '#ef4444';
      top.appendChild(dot);
      top.appendChild(el('span', 'st-name', t.label));
      c.appendChild(top);
      c.appendChild(el('div', 'st-age', t.ageLabel));
      c.appendChild(el('div', 'st-every', 'diperbarui ' + t.everyLabel));
      body.appendChild(c);
    });
  }

  function loadStatus() {
    return fetchT('/api/status')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) { state.status = d; renderStatus(); } })
      .catch(function () { /* diamkan */ });
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

  function loadAir() {
    if (!state.airOn || state.airBusy) return Promise.resolve();
    var step = airStepFor(map.getZoom());
    var b = map.getBounds();
    var q = 'step=' + step;
    if (step < 1.5) {
      q += '&west=' + b.getWest().toFixed(2) + '&south=' + b.getSouth().toFixed(2) +
           '&east=' + b.getEast().toFixed(2) + '&north=' + b.getNorth().toFixed(2);
    }
    if (state.airKey === q) { drawAir(); return Promise.resolve(); }
    state.airBusy = true;
    showHint('Memuat data kualitas udara…');
    return fetchT('/api/air-quality?' + q, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
      .then(function (d) {
        state.air = d;
        state.airKey = q;
        drawAir();
        renderAirLegend();
        showHint(d.count
          ? nf.format(d.count) + ' sel kualitas udara · model CAMS via Open-Meteo.'
          : 'Tidak ada data kualitas udara pada area ini.', 5000);

      })
      .catch(function () { showHint('Gagal memuat data kualitas udara.'); })
      .then(function () { state.airBusy = false; });
  }

  // Legenda AQI muncul hanya saat lapisan aktif.
  function renderAirLegend() {
    var box = $('airLegend');
    if (!box) return;
    clear(box);
    if (!state.airOn || !state.air || !state.air.legend) { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('div', 'cs-title', 'Kualitas udara (US AQI)'));
    state.air.legend.forEach(function (b, i) {
      var prev = i ? state.air.legend[i - 1].upto : -1;
      var range = b.upto === null ? '> ' + prev : (prev + 1) + '–' + b.upto;
      var row = el('div', 'cs-row');
      var sw = el('i', 'cs-dot'); sw.style.background = b.color; sw.style.borderRadius = '3px';
      row.appendChild(sw);
      row.appendChild(el('span', 'cs-lab', b.label));
      row.appendChild(el('b', 'cs-num', range));
      box.appendChild(row);
    });
  }

  /* ---------- medan angin ---------- */
  // Warna panah mengikuti kecepatan (biru tenang -> merah kencang).
  function windColor(s) {
    return s >= 8 ? '#f87171' : s >= 5 ? '#fb923c' : s >= 3 ? '#fbbf24' : s >= 1.5 ? '#5eead4' : '#7dd3fc';
  }
  function windLabel(s) {
    return s >= 8 ? 'kencang' : s >= 5 ? 'sedang–kencang' : s >= 3 ? 'sedang' : s >= 1.5 ? 'lemah' : 'tenang';
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

  function loadWind() {
    if (!state.windOn || state.windBusy) return Promise.resolve();
    var z = map.getZoom();
    var step = windStepFor(z);
    var b = map.getBounds();
    var q = 'step=' + step;
    // Medan angin GFS mencakup seluruh dunia. Saat diperbesar kita minta
    // hanya area yang terlihat agar kerapatannya naik tanpa memperbesar hasil;
    // saat menjauh, ambil global supaya angin tidak terpotong di tepi peta.
    if (step < 2) {
      q += '&west=' + b.getWest().toFixed(2) + '&south=' + b.getSouth().toFixed(2) +
           '&east=' + b.getEast().toFixed(2) + '&north=' + b.getNorth().toFixed(2);
    }
    if (state.windKey === q) {
      // Data yang sama masih tersimpan, jadi tidak perlu diambil ulang —
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
        state.windKey = q;
        drawWind();
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
        if (fc.tooWide) { showHint('Area terlalu luas — perbesar peta untuk melihat batas konsesi.'); return; }
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
          box.appendChild(el('div', 'pp-warn', 'Indikasi awal dari kompilasi peta konsesi GFW — bukan bukti hukum.'));
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
  function makeRow(rank, title, sub, pillText, pillCls, barPct, onClick) {
    var row = el('button', 'row'); row.type = 'button';
    if (rank) row.appendChild(el('span', 'row-rank', rank));
    var main = el('div', 'row-main');
    main.appendChild(el('div', 'row-t', title));
    main.appendChild(el('div', 'row-s', sub));
    if (barPct !== null && barPct !== undefined) {
      var bar = el('div', 'bar'); var fill = el('i');
      fill.style.width = Math.max(2, Math.min(100, barPct)) + '%';
      bar.appendChild(fill); main.appendChild(bar);
    }
    row.appendChild(main);
    if (pillText) row.appendChild(el('span', 'pill ' + pillCls, pillText));
    if (onClick) row.addEventListener('click', onClick);
    return row;
  }

  function renderImpactList() {
    var pane = $('paneImpact'); clear(pane);
    var list = state.data ? state.data.impacted : [];
    if (!list.length) { pane.appendChild(el('p', 'empty', 'Tidak ada daerah dengan perkiraan paparan asap saat ini.')); return; }
    // Konteks singkat supaya angka indeks tidak disalahartikan sebagai ISPU resmi.
    var note = el('p', 'pane-note',
      'Perkiraan kota yang berada di jalur sebaran asap, dihitung dari arah angin ' +
      'dan intensitas api. Indeks 0-100 menandakan seberapa kuat paparan, ' +
      'bukan angka ISPU resmi.');
    pane.appendChild(note);
    list.slice(0, 60).forEach(function (r, i) {
      pane.appendChild(makeRow(i + 1, r.name + ' · ' + r.prov,
        nf.format(r.nearestKm) + ' km · dari ' + r.fromDir + ' · ' + r.etaShort,
        r.level, 'p-' + r.level, r.score,
        function () { map.setView([r.lat, r.lon], 8); }));
    });
  }

  function renderAshList() {
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

    pane.appendChild(el('p', 'pane-note',
      'Kota di bawah jalur abu menurut arah angin tiap lapisan ketinggian. '
      + 'Abu rendah (~3 km) paling berdampak ke permukaan; abu ~10 km umumnya '
      + 'melintas di atas dan lebih memengaruhi penerbangan. Model indikatif, '
      + 'bukan advisory resmi Darwin VAAC.'));

    list.forEach(function (r, i) {
      var eta = r.etaH === null ? 'waktu tiba tidak diperkirakan'
        : r.etaH < 1 ? 'tiba <1 jam'
          : r.etaH < 24 ? 'tiba ~' + Math.round(r.etaH) + ' jam' : 'tiba >1 hari';
      var sub = 'Gunung ' + r.volcano + ' · ' + nf.format(r.nearestKm) + ' km · '
        + eta + ' · lapisan ' + r.layers.join('/') + ' km'
        + (r.officialLevel ? ' · ' + r.officialLevel : '');
      pane.appendChild(makeRow(i + 1, r.name + ' · ' + r.prov, sub,
        r.level, 'p-' + r.level, r.score,
        function () { map.setView([r.lat, r.lon], 8); }));
    });
  }

  function renderProvList() {
    var pane = $('paneProv'); clear(pane);
    var list = (state.data && state.data.provinceRanking) || [];
    if (!list.length) { pane.appendChild(el('p', 'empty', 'Belum ada data peringkat provinsi.')); return; }
    var max = list[0].hotspots || 1;
    list.forEach(function (p, i) {
      pane.appendChild(makeRow(i + 1, p.province,
        nf.format(p.hotspots) + ' titik api · FRP ' + nf.format(p.frp) + ' MW',
        null, null, (p.hotspots / max) * 100, null));
    });
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
    var max = list[0].frp || 1;
    list.forEach(function (c, i) {
      var lvl = c.frp >= 400 ? 'Berat' : c.frp >= 120 ? 'Sedang' : 'Ringan';
      pane.appendChild(makeRow(i + 1, c.count + ' titik api',
        'FRP ' + nf.format(c.frp) + ' MW · ' + c.lat.toFixed(2) + ', ' + c.lon.toFixed(2),
        lvl, 'p-' + lvl, (c.frp / max) * 100,
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
    if (d.meta && d.meta.disclaimer) $('attrDisclaimer').textContent = d.meta.disclaimer;

    if (!d.units.length) {
      // Nol unit bisa berarti dua hal yang sangat berbeda. Menyatakan
      // "tidak ada" padahal analisisnya belum jalan adalah klaim keliru.
      unitPane.appendChild(el('p', 'empty', d.analyzed
        ? 'Tidak ada titik api yang jatuh di dalam batas konsesi terdata.'
        : 'Analisis atribusi sedang berjalan…'));
    } else {
      var grid = el('div', 'unit-list');
      d.units.forEach(function (u) {
        var card = el('button', 'unit'); card.type = 'button';
        var top = el('div', 'unit-top');
        var names = el('div');
        names.appendChild(el('div', 'unit-name', u.name));
        if (u.group) names.appendChild(el('div', 'unit-group', 'Grup ' + u.group));
        top.appendChild(names);
        top.appendChild(el('span', 'tag t-' + u.badge, TAGS[u.badge] || u.kind));
        card.appendChild(top);

        var m = el('div', 'unit-metrics');
        [[nf.format(u.hotspotCount), 'titik api'],
         [nf.format(Math.round(u.totalFrp)), 'total FRP (MW)'],
         [u.areaHa ? nf.format(u.areaHa) : '—', 'luas (ha)']
        ].forEach(function (pair) {
          var box = el('div', 'metric');
          box.appendChild(el('b', null, pair[0]));
          box.appendChild(el('span', null, pair[1]));
          m.appendChild(box);
        });
        card.appendChild(m);

        var meta = el('div', 'unit-meta');
        var bits = [];
        if (u.tenure) bits.push('Alas hak: ' + u.tenure);
        if (u.licenseId) bits.push('Izin: ' + u.licenseId);
        if (u.status) bits.push('Status: ' + u.status);
        if (u.mineral) bits.push('Komoditas: ' + u.mineral);
        bits.push('Sumber: ' + u.source + (u.sourceYear ? ' (' + u.sourceYear + ')' : ''));
        meta.textContent = bits.join(' · ');
        card.appendChild(meta);

        card.addEventListener('click', function () {
          map.setView([u.lat, u.lon], 10);
          if (!state.concOn) { $('lyConc').checked = true; toggleConc(true); }
          document.querySelector('.map-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        grid.appendChild(card);
      });
      unitPane.appendChild(grid);
    }

    if (!d.groups.length) {
      groupPane.appendChild(el('p', 'empty', 'Tidak ada grup korporasi teridentifikasi.'));
    } else {
      var max = d.groups[0].hotspotCount || 1;
      d.groups.forEach(function (g, i) {
        groupPane.appendChild(makeRow(i + 1, g.group,
          nf.format(g.hotspotCount) + ' titik api · FRP ' + nf.format(Math.round(g.totalFrp)) +
          ' MW · ' + g.units + ' unit lahan · ' + g.kinds.join(', '),
          null, null, (g.hotspotCount / max) * 100, null));
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
      var link = el('a', 'news-item');
      link.href = a.url; link.target = '_blank'; link.rel = 'noopener noreferrer nofollow';
      link.appendChild(el('div', 'news-t', a.title || '(tanpa judul)'));
      var meta = el('div', 'news-m');
      if (a.domain) meta.appendChild(el('span', 'news-src', a.domain));
      // Berita dari media negara tetangga ditandai jelas supaya pembaca tahu
      // itu sudut pandang luar, bukan laporan otoritas Indonesia.
      if (a.foreign && a.country) {
        meta.appendChild(el('span', 'news-tag news-foreign', a.country));
      } else if (a.topicLabel && state.newsTopic === 'semua') {
        meta.appendChild(el('span', 'news-tag', a.topicLabel));
      }
      // Waktu terbit ditampilkan lengkap dengan jam WIB dan usia relatif —
      // pada pemantauan bencana, "2 jam lalu" jauh lebih berarti daripada
      // sekadar tanggal.
      var ts = a.pubDate ? Date.parse(a.pubDate) : NaN;
      if (isFinite(ts)) {
        var age = el('span', 'news-age', timeAgo(new Date(ts).toISOString()));
        age.title = new Date(ts).toLocaleString('id-ID', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
        }) + ' WIB';
        meta.appendChild(age);
        meta.appendChild(el('span', 'news-clock', fmtJamWib(ts)));
      }
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
      var b = el('button', 'ntopic' + (state.newsTopic === t.id ? ' active' : ''));
      b.type = 'button';
      b.appendChild(document.createTextNode(t.label));
      b.appendChild(el('i', null, String(t.count)));
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
        $('updated').textContent = 'diperbarui ' + new Date(d.meta.updatedAt)
          .toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        $('srcline').textContent = 'Sumber titik api: ' + d.meta.source + ' · rentang ' + d.meta.days +
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
            $('sErupt').textContent = '—';
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
          $('sErupt').textContent = '—';
          $('sVolLvl').textContent = '—';
        }
        var wa = d.worstAir;
        $('sAir').classList.remove('skel');
        if (wa) {
          $('sAir').textContent = nf.format(wa.aqi);
          $('sAir').style.color = wa.color;
          $('sAirSub').textContent = wa.label + (wa.province ? ' · ' + wa.province : '');
        } else {
          $('sAir').textContent = '—';
          $('sAirSub').textContent = 'data tidak tersedia';
        }
        drawFires(); drawSmoke(); drawImpact();
        renderImpactList(); renderAshList(); renderProvList(); renderClusterList();
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
        $('sConc').textContent = '—';
        clear($('paneUnit'));
        $('paneUnit').appendChild(el('p', 'empty', 'Analisis atribusi lahan sedang tidak tersedia. Coba muat ulang.'));
      });
  }

  function loadNews() {
    return fetchT('/api/news', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state.news = Array.isArray(d.articles) ? d.articles : [];
        state.newsTopics = Array.isArray(d.topics) ? d.topics : [];
        // Tampilkan kapan DATA-nya ditarik dari sumber, bukan kapan browser
        // memanggil API — keduanya bisa berbeda beberapa menit karena cache.
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
      return n ? nf.format(n) + ' kota/kabupaten berada di jalur sebaran asap.'
               : 'Tidak ada daerah yang terdeteksi di jalur asap.';
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

  $('lyAir').addEventListener('change', function (e) {
    state.airOn = e.target.checked;
    if (state.airOn) {
      map.addLayer(gAir);
      loadAir();
    } else {
      map.removeLayer(gAir);
      renderAirLegend();
      showHint(null);
    }
  });

  $('lyAsh').addEventListener('change', function (e) {
    state.ashOn = e.target.checked;
    if (state.ashOn) { map.addLayer(gAsh); loadAsh(); }
    else { map.removeLayer(gAsh); renderAshInfo(); showHint(null); }
  });

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

  $('lyWind').addEventListener('change', function (e) {
    state.windOn = e.target.checked;
    if (state.windOn) { map.addLayer(gWind); loadWind(); }
    else {
      map.removeLayer(gWind);
      if (state.particles) state.particles.stop();
      showHint(null);
    }
  });

  function toggleConc(on) {
    state.concOn = on;
    if (on) { map.addLayer(gConc); loadConcessions(); }
    else { map.removeLayer(gConc); gConc.clearLayers(); showHint(null); }
  }
  $('lyConc').addEventListener('change', function (e) { toggleConc(e.target.checked); });

  var moveTimer = null;
  map.on('moveend zoomend', function () {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(function () {
      if (state.concOn) loadConcessions();
      if (state.windOn) loadWind();
      if (state.airOn) loadAir();
    }, 450);
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
    var box = $('legendPoints'); clear(box);
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

  Array.prototype.forEach.call(document.querySelectorAll('.bm'), function (btn) {
    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.bm'), function (o) {
        o.classList.toggle('active', o === btn);
      });
      setBasemap(btn.getAttribute('data-base'));
    });
  });
  $('refreshBtn').addEventListener('click', function () {
    loadOverview(); loadNews(); loadAttribution();
  });
  $('newsQ').addEventListener('input', renderNews);



  /* ---------- jam terminal ---------- */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  // WIB = UTC+7 dihitung eksplisit agar benar walau zona browser berbeda.
  function tickClock() {
    var d = new Date();
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
    $('askMeta').textContent = 'menjalankan';
    fetchT('/api/ask?q=' + encodeURIComponent(q))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('ask')); })
      .then(function (d) {
        renderAsk(d);
        $('askMeta').textContent = 'intent: ' + d.intent;
      })
      .catch(function () {
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
    { tab: 'tabCluster', pane: 'paneCluster' }
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

  // Timeline sebaran: 0 = kondisi sekarang, >0 = prakiraan angin ke depan.
  Array.prototype.forEach.call(document.querySelectorAll('.tl-b'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tl-b'), function (o) {
        o.classList.remove('active');
      });
      b.classList.add('active');
      state.plumeHour = Number(b.getAttribute('data-h')) || 0;
      if (!$('lySmoke').checked) { $('lySmoke').checked = true; map.addLayer(gSmoke); }
      drawSmoke();
      showHint(state.plumeHour === 0
        ? 'Menampilkan sebaran asap saat ini.'
        : 'Prakiraan sebaran ' + state.plumeHour + ' jam ke depan (garis putus-putus).');
    });
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
          val.appendChild(el('b', null, v.so2 === null ? '—' : String(v.so2)));
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

  /* ---------- mulai ---------- */
  tickClock();
  setInterval(tickClock, 1000);
  updateLegend();
  loadOverview();
  loadWind();
  loadNews();
  loadAttribution();
  setInterval(function () { loadOverview(); loadAttribution(); }, 10 * 60 * 1000);
  // Berita disegarkan tiap 5 menit agar panel penanganan selalu terkini.
  // Berita adalah panel yang paling terasa "mati" bila basi, jadi klien
  // memeriksa tiap 3 menit. Sumbernya sendiri disegarkan penjadwal tiap
  // 10 menit, sehingga ini hanya menarik hasil terbaru yang sudah ada.
  setInterval(loadNews, 3 * 60 * 1000);
  // Gempa & tsunami harus sesegar mungkin: perbarui tiap 2 menit.
  loadHazard();
  setInterval(loadHazard, 2 * 60 * 1000);
  // Laporan letusan menentukan apakah sebaran abu digambar, jadi disegarkan
  // serapat data gempa.
  loadEruptions();
  setInterval(loadEruptions, 5 * 60 * 1000);
  loadCasualties();
  setInterval(loadCasualties, 10 * 60 * 1000);
  loadStatus();
  setInterval(loadStatus, 60 * 1000);
  // Citra Himawari terbit tiap 10 menit; periksa tiap menit agar slot baru
  // langsung tampil tanpa perlu memuat ulang halaman.
  setInterval(refreshHimawari, 60 * 1000);
})();
