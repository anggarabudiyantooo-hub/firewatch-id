/* FireWatch ID — frontend.
   Semua data eksternal dirender lewat textContent / createElement (tidak ada innerHTML). */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat('id-ID');

  /* ---------- peta ---------- */
  var map = L.map('map', { zoomControl: false, minZoom: 4, maxZoom: 12, worldCopyJump: false })
    .setView([-2.2, 117.5], 5);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

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

  var state = {
    data: null, attr: null, news: [], newsTopics: [], newsTopic: 'semua', minConf: 0, minFrp: 10,
    concOn: false, concBusy: false, colorBy: 'confidence',
    wind: null, windKey: null, windOn: true, windBusy: false, particles: null, plumeHour: 0,
    air: null, airKey: null, airOn: false, airBusy: false,
    ash: null, ashOn: false, ashBusy: false, newsAt: '',
    hima: null, himaProduct: 'ir', himaLayer: null
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
    $('sHotSub').textContent = nf.format(hs.length) + ' tampil pada filter ini';
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
      'Waktu (UTC): ' + (h.acq || 'tidak tersedia'),
      'Satelit: ' + h.satellite + (h.daynight === 'N' ? ' · malam' : h.daynight === 'D' ? ' · siang' : ''),
      'Koordinat: ' + h.lat.toFixed(4) + ', ' + h.lon.toFixed(4)
    ].forEach(function (t) { box.appendChild(el('div', 'pp-r', t)); });

    // hasil reverse-geocode disimpan pada objek hotspot agar tidak dimuat ulang
    if (h._place !== undefined) {
      box.appendChild(el('div', 'pp-r', h._place || 'Wilayah administratif tidak terdata.'));
      return box;
    }

    box.appendChild(el('div', 'pp-r pp-load', 'Memuat wilayah administratif…'));
    fetch('/api/place?lat=' + h.lat.toFixed(5) + '&lon=' + h.lon.toFixed(5), { headers: { Accept: 'application/json' } })
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
    return fetch('/api/volcano-ash')
      .then(function (r) { if (!r.ok) throw new Error('ash'); return r.json(); })
      .then(function (d) {
        state.ash = d;
        drawAsh();
        renderAshInfo();
        var oc = d.official && d.official.counts;
        showHint(d.activeCount
          ? d.activeCount + ' gunung dipantau' + (oc ? ' · ' + oc.Awas + ' Awas, ' + oc.Siaga + ' Siaga, ' + oc.Waspada + ' Waspada (PVMBG)' : '') + '.'
          : 'Tidak ada gunung berstatus siaga maupun erupsi saat ini.');
        setTimeout(function () { if (state.ashOn) showHint(null); }, 6000);
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
    box.appendChild(el('div', 'cs-note',
      state.ash.activeCount + ' gunung dipantau · status resmi PVMBG + laporan GVP'));
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
      opacity: product === 'vis' ? 0.85 : 0.62,
      attribution: 'Citra: Himawari-9 / JMA'
    }).addTo(map);
    fetch('/api/himawari/meta')
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
    var label = state.himaProduct === 'ir' ? 'Inframerah'
      : state.himaProduct === 'vis' ? 'Warna alami' : 'Uap air';
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
    fetch('/api/himawari/meta')
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
    return fetch('/api/air-quality?' + q, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
      .then(function (d) {
        state.air = d;
        state.airKey = q;
        drawAir();
        renderAirLegend();
        showHint(d.count
          ? nf.format(d.count) + ' sel kualitas udara · model CAMS via Open-Meteo.'
          : 'Tidak ada data kualitas udara pada area ini.');
        setTimeout(function () { if (state.airOn) showHint(null); }, 5000);
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
    if (state.windKey === q) { drawWind(); return Promise.resolve(); }
    state.windBusy = true;
    showHint('Memuat arah angin…');
    return fetch('/api/wind-field?' + q, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
      .then(function (d) {
        state.wind = d;
        state.windKey = q;
        drawWind();
        showHint(d.count
          ? nf.format(d.count) + ' titik medan angin · ' + (d.source || 'NOAA GFS') + '. Garis mengalir ke arah asap terbawa.'
          : 'Tidak ada data angin pada area ini.');
        setTimeout(function () { if (state.windOn) showHint(null); }, 5000);
      })
      .catch(function () { showHint('Gagal memuat data arah angin.'); })
      .then(function () { state.windBusy = false; });
  }

  /* ---------- batas konsesi ---------- */
  var CONC_COLOR = { sawit: '#ff9f1c', kayu: '#34d399', hph: '#7aa7ff', tambang: '#a78bfa', rspo: '#2dd4bf' };

  function showHint(msg) {
    var h = $('mapHint');
    h.style.bottom = (state.airOn ? '150px' : '');
    if (!msg) { h.hidden = true; h.textContent = ''; return; }
    h.hidden = false; h.textContent = msg;
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
    fetch('/api/concessions?' + q, { headers: { Accept: 'application/json' } })
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
    fetch('/api/whose-land?lat=' + lat.toFixed(5) + '&lon=' + lon.toFixed(5), { headers: { Accept: 'application/json' } })
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

        fetch('/api/air-point?lat=' + lat.toFixed(4) + '&lon=' + lon.toFixed(4), { headers: { Accept: 'application/json' } })
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

    $('attrMeta').textContent = nf.format(d.analyzed) + ' titik api dianalisis · ' +
      nf.format(d.insideConcession) + ' di dalam batas konsesi · ' +
      nf.format(d.outsideConcession) + ' di luar';
    if (d.meta && d.meta.disclaimer) $('attrDisclaimer').textContent = d.meta.disclaimer;

    if (!d.units.length) {
      unitPane.appendChild(el('p', 'empty', 'Tidak ada titik api yang jatuh di dalam batas konsesi terdata.'));
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
      ? nf.format(list.length) + ' artikel · ' + state.newsAt
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
      if (a.topicLabel && state.newsTopic === 'semua') {
        meta.appendChild(el('span', 'news-tag', a.topicLabel));
      }
      var d = a.seendate && a.seendate.length >= 8
        ? a.seendate.slice(6, 8) + '-' + a.seendate.slice(4, 6) + '-' + a.seendate.slice(0, 4) : '';
      if (d) meta.appendChild(el('span', null, d));
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
    $('refreshBtn').disabled = true;
    return fetch('/api/overview', { headers: { Accept: 'application/json' } })
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
        ['sHot', 'sConf', 'sFrp', 'sImp', 'sPop'].forEach(function (id) { $(id).classList.remove('skel'); });
        $('sHot').textContent = nf.format(d.stats.hotspots);
        $('sConf').textContent = nf.format(d.stats.highConfidence);
        $('sFrp').textContent = nf.format(d.stats.totalFrp);
        $('sImp').textContent = nf.format(d.stats.impactedRegions);
        $('sPop').textContent = d.stats.peopleExposed >= 1e6
          ? (d.stats.peopleExposed / 1e6).toFixed(1).replace('.', ',') + ' jt'
          : nf.format(d.stats.peopleExposed);
        var mod = d.stats.peopleExposedModerate || 0;
        $('sPopSub').textContent = mod > 0
          ? (mod >= 1e6 ? (mod / 1e6).toFixed(1).replace('.', ',') + ' jt' : nf.format(mod)) +
            ' pada paparan sedang–berat'
          : 'semuanya paparan ringan saat ini';
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
        renderImpactList(); renderProvList(); renderClusterList();
      })
      .catch(function () { setNotice('Gagal memuat data pemantauan. Periksa koneksi lalu tekan "Muat ulang".'); })
      .then(function () { $('refreshBtn').disabled = false; });
  }

  function loadAttribution() {
    return fetch('/api/attribution', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('x')); })
      .then(function (d) {
        state.attr = d;
        buildTicker();
        $('sConc').classList.remove('skel');
        $('sConc').textContent = nf.format(d.insideConcession);
        $('sConcSub').textContent = 'dari ' + nf.format(d.analyzed) + ' titik api dianalisis';
        renderAttribution();
      })
      .catch(function () {
        $('sConc').textContent = '—';
        clear($('paneUnit'));
        $('paneUnit').appendChild(el('p', 'empty', 'Analisis atribusi lahan sedang tidak tersedia. Coba muat ulang.'));
      });
  }

  function loadNews() {
    return fetch('/api/news', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state.news = Array.isArray(d.articles) ? d.articles : [];
        state.newsTopics = Array.isArray(d.topics) ? d.topics : [];
        state.newsAt = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
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
  function bindLayer(id, group) {
    $(id).addEventListener('change', function (e) {
      if (e.target.checked) map.addLayer(group); else map.removeLayer(group);
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
    fetch('/api/ask?q=' + encodeURIComponent(q))
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

  function tabGroup(buttons) {
    buttons.forEach(function (b) {
      $(b.tab).addEventListener('click', function () {
        buttons.forEach(function (o) {
          var active = o.tab === b.tab;
          $(o.tab).classList.toggle('active', active);
          $(o.tab).setAttribute('aria-selected', String(active));
          $(o.pane).hidden = !active;
        });
      });
    });
  }
  tabGroup([
    { tab: 'tabImpact', pane: 'paneImpact' },
    { tab: 'tabProv', pane: 'paneProv' },
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
    fetch('/api/volcano-so2', { headers: { Accept: 'application/json' } })
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
  setInterval(loadNews, 5 * 60 * 1000);
  // Citra Himawari terbit tiap 10 menit; periksa tiap menit agar slot baru
  // langsung tampil tanpa perlu memuat ulang halaman.
  setInterval(refreshHimawari, 60 * 1000);
})();
