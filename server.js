'use strict';
/**
 * SIAGA ID - server pemantauan bencana Indonesia.
 * Gunung api & sebaran abu, gempa, tsunami, pengungsi, karhutla & asap.
 * Semua kunci API dibaca di server saja dan tidak pernah dikirim ke browser.
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

// ---------- env loader sederhana (tanpa dependensi) ----------
(function loadEnv() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const PORT = Number(process.env.PORT || 3000);
const FIRMS_MAP_KEY = (process.env.FIRMS_MAP_KEY || '').trim();
const ALLOWED_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT'];
const FIRMS_SOURCE = ALLOWED_SOURCES.includes(process.env.FIRMS_SOURCE) ? process.env.FIRMS_SOURCE : 'VIIRS_SNPP_NRT';
const FIRMS_DAYS = Math.min(10, Math.max(1, Number(process.env.FIRMS_DAYS || 1)));
const BBOX = { west: 94.5, south: -11.5, east: 141.5, north: 6.5 }; // Indonesia

// Pakai require() (bukan fs.readFileSync) supaya bundler serverless seperti Vercel
// melacak berkas ini secara statis dan ikut menyertakannya ke dalam deployment.
const REGIONS = require('./data/regions.json');

/**
 * Permukiman di sekitar gunung api, dipakai khusus untuk memetakan
 * wilayah di bawah kerucut abu.
 *
 * REGIONS hanya memuat 226 kota berpenduduk >=50.000 jiwa. Kepadatan itu
 * memadai untuk asap karhutla yang menyebar ratusan kilometer, tetapi
 * terlalu jarang untuk abu vulkanik yang jangkauannya puluhan kilometer:
 * Gunung Ibu dan Ili Lewotolok tidak punya satu pun kota terdaftar dalam
 * radius sebarannya, sehingga dasbor melaporkan "tidak ada wilayah
 * terdampak" padahal ada desa tepat di bawah kolom abu.
 */
const SETTLEMENT_KIND_LABEL = {
  PPLC: 'Ibu kota negara', PPLA: 'Ibu kota provinsi', PPLA2: 'Ibu kota kabupaten',
  PPLA3: 'Pusat kecamatan', PPLA4: 'Desa/kelurahan', PPL: 'Permukiman', PPLX: 'Permukiman'
};

const SETTLEMENTS = (() => {
  const raw = require('./data/settlements.js');
  const out = [];
  for (let i = 0; i < raw.n.length; i++) {
    out.push({
      name: raw.n[i],
      lat: raw.la[i] / 1000,
      lon: raw.lo[i] / 1000,
      kind: raw.kinds[raw.k[i]] || 'PPL',
      pop: raw.p[String(i)] || 0
    });
  }
  return out;
})();
const { attributeHotspots } = require('./lib/concession');
const { fetchWindField, sampleAt, gridPoints } = require('./lib/wind-gfs');
const { openHotspots, toIsoUtc, WINDOW_HOURS: FIRMS_WINDOW_HOURS } = require('./lib/firms-open');
const { volcanicAsh } = require('./lib/volcano');
const { fetchStatus: fetchPvmbgStatus } = require('./lib/pvmbg');
const { fetchEruptions } = require('./lib/eruption');
const { fetchQuakes, fetchTsunamiBulletins, fetchShelters } = require('./lib/hazard');
const { isRelevant, scoreArticle, classify } = require('./lib/relevance');
const sentinel = require('./lib/sentinel');
const { summarize: summarizeCasualties } = require('./lib/casualty');
const { Scheduler } = require('./lib/scheduler');
const { answer: ragAnswer } = require('./lib/rag');

// batas kotak provinsi (kasar) untuk peringkat provinsi
const PROVINCE_BOXES = [
  ['Aceh', 2.0, 6.1, 95.0, 98.3], ['Sumatera Utara', 0.8, 4.3, 97.0, 100.4],
  ['Riau', -1.2, 2.6, 100.0, 103.5], ['Kepulauan Riau', -1.0, 4.8, 103.5, 109.5],
  ['Sumatera Barat', -3.4, 0.9, 98.5, 101.9], ['Jambi', -2.8, -0.7, 101.0, 104.9],
  ['Bengkulu', -5.3, -2.2, 101.0, 103.6], ['Sumatera Selatan', -4.9, -1.4, 102.0, 106.1],
  ['Bangka Belitung', -3.4, -1.3, 105.0, 109.3], ['Lampung', -6.1, -3.7, 103.5, 106.0],
  ['Banten', -7.1, -5.7, 105.0, 106.8], ['DKI Jakarta', -6.4, -6.0, 106.6, 107.0],
  ['Jawa Barat', -7.9, -5.9, 106.3, 108.9], ['Jawa Tengah', -8.3, -6.0, 108.5, 111.7],
  ['DI Yogyakarta', -8.3, -7.5, 110.0, 110.9], ['Jawa Timur', -8.9, -6.7, 111.0, 114.7],
  ['Bali', -8.9, -8.0, 114.4, 115.8], ['Nusa Tenggara Barat', -9.2, -8.0, 115.8, 119.4],
  ['Nusa Tenggara Timur', -11.1, -8.0, 118.9, 125.2],
  ['Kalimantan Barat', -3.1, 2.1, 108.6, 114.3], ['Kalimantan Tengah', -3.7, 0.1, 110.9, 115.9],
  ['Kalimantan Selatan', -4.8, -1.3, 114.3, 116.5], ['Kalimantan Timur', -2.6, 2.6, 113.6, 119.1],
  ['Kalimantan Utara', 2.0, 4.4, 114.5, 118.1],
  ['Sulawesi Utara', 0.2, 5.6, 122.9, 127.2], ['Gorontalo', 0.2, 1.4, 121.0, 123.3],
  ['Sulawesi Tengah', -3.5, 1.5, 118.9, 124.0], ['Sulawesi Barat', -3.6, -0.7, 118.6, 119.8],
  ['Sulawesi Selatan', -7.7, -1.9, 118.7, 121.5], ['Sulawesi Tenggara', -6.5, -1.9, 120.8, 124.6],
  ['Maluku', -8.5, -2.5, 125.5, 135.0], ['Maluku Utara', -3.0, 3.0, 123.9, 129.5],
  ['Papua Barat', -4.3, 0.5, 129.5, 134.5], ['Papua Barat Daya', -2.5, 1.0, 129.0, 132.8],
  ['Papua', -5.0, 0.5, 134.5, 141.5], ['Papua Tengah', -4.6, -2.0, 134.5, 138.5],
  ['Papua Pegunungan', -5.3, -3.2, 137.0, 141.0], ['Papua Selatan', -9.2, -5.0, 137.0, 141.5]
];
function provinceOf(lat, lon) {
  for (const [name, s, n, w, e] of PROVINCE_BOXES) {
    if (lat >= s && lat <= n && lon >= w && lon <= e) return name;
  }
  return null;
}

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'self'"],
      // Wildcard '*' membuat 'self' tidak bermakna: situs mana pun dapat
      // membingkai dasbor ini di bawah header palsu dan menutupinya dengan
      // tingkat bahaya karangan. Pada perangkat kebencanaan, kredibilitas
      // visual justru asetnya, jadi penyematan dibatasi ke origin sendiri.
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://server.arcgisonline.com', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"]
    }
  },
  // X-Frame-Options sebagai cadangan bagi peramban lama yang belum
  // mendukung frame-ancestors.
  frameguard: { action: 'sameorigin' },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' }
}));

/**
 * Pembatasan laju per IP.
 *
 * Dua kelas dipisahkan karena biayanya jauh berbeda. Endpoint biasa
 * dijawab dari cache memori, sedangkan endpoint "mahal" meneruskan
 * panggilan ke pihak ketiga berkuota (NASA FIRMS, Open-Meteo, NOAA).
 * Menghabiskan kuota itu membuat dasbor gelap bagi SEMUA orang, tepat
 * ketika paling dibutuhkan — jadi kelas mahal diberi jatah lebih ketat.
 *
 * Ambangnya sengaja longgar: operator seluler Indonesia banyak memakai
 * CGNAT, sehingga satu alamat IP bisa mewakili ribuan pengguna sah.
 *
 * Header RateLimit-* selalu dikirim agar klien dan pengaudit dapat
 * melihat sisa jatah tanpa harus memicu penolakan lebih dulu.
 */
const RL_WINDOW_MS = 60000;
const RL_NORMAL = 240;
// Satu sesi pemakaian aktif — memuat halaman, menyalakan empat lapisan,
// lalu memperbesar dan memperkecil peta berkali-kali — terukur hanya
// menghasilkan 4 permintaan kelas mahal per menit. Ambang 90 memberi
// ruang lebih dari dua puluh kali lipat, penting karena operator seluler
// Indonesia banyak memakai CGNAT sehingga satu alamat IP dapat mewakili
// banyak pengguna sah sekaligus. Yang ingin dicegah adalah skrip yang
// mengirim ribuan permintaan, bukan manusia yang menggeser peta.
const RL_EXPENSIVE = 90;
const RL_EXPENSIVE_PATHS = /^\/(overview|wind-field|air-quality|concessions|place|whose-land|air-point|news)/;

const hits = new Map();
app.use('/api', (req, res, next) => {
  const ip = req.ip || 'x';
  const now = Date.now();
  const expensive = RL_EXPENSIVE_PATHS.test(req.path);
  const limit = expensive ? RL_EXPENSIVE : RL_NORMAL;
  const key = ip + (expensive ? '|e' : '|n');

  const rec = hits.get(key) || { n: 0, t: now };
  if (now - rec.t > RL_WINDOW_MS) { rec.n = 0; rec.t = now; }
  rec.n++;
  hits.set(key, rec);
  if (hits.size > 5000) hits.clear();

  const resetSec = Math.max(1, Math.ceil((rec.t + RL_WINDOW_MS - now) / 1000));
  res.set('RateLimit-Limit', String(limit));
  res.set('RateLimit-Remaining', String(Math.max(0, limit - rec.n)));
  res.set('RateLimit-Reset', String(resetSec));

  if (rec.n > limit) {
    res.set('Retry-After', String(resetSec));
    return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' });
  }
  next();
});

// ---------- util ----------
const R = 6371;
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;
function haversine(a, b, c, d) {
  const dLat = toRad(c - a), dLon = toRad(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function destination(lat, lon, bearingDeg, distKm) {
  const br = toRad(bearingDeg), d = distKm / R, la = toRad(lat), lo = toRad(lon);
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
  const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [toDeg(la2), ((toDeg(lo2) + 540) % 360) - 180];
}
async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal, headers: { 'User-Agent': 'SiagaID/1.0', ...(opts.headers || {}) } }); }
  finally { clearTimeout(t); }
}
// cache in-memory
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

// ---------- sumber titik api ----------
function parseFirmsCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map(s => s.trim());
  const idx = n => head.indexOf(n);
  const iLat = idx('latitude'), iLon = idx('longitude');
  const iConf = idx('confidence'), iFrp = idx('frp');
  const iDate = idx('acq_date'), iTime = idx('acq_time'), iSat = idx('satellite'), iDn = idx('daynight');
  if (iLat < 0 || iLon < 0) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const lat = Number(c[iLat]), lon = Number(c[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const rawConf = iConf >= 0 ? String(c[iConf]).trim() : '';
    let conf = Number(rawConf);
    if (!Number.isFinite(conf)) conf = rawConf === 'h' ? 90 : rawConf === 'n' ? 60 : 30;
    // Waktu dinormalkan ke ISO 8601 supaya dapat dibandingkan dan diurutkan;
    // bentuk mentah FIRMS ("2026-09-06 0533") tidak dapat di-parse Date.
    const acqIso = toIsoUtc(iDate >= 0 ? c[iDate] : '', iTime >= 0 ? c[iTime] : '');
    if (!acqIso) continue;
    out.push({
      lat, lon,
      frp: Math.max(0, Number(iFrp >= 0 ? c[iFrp] : 0) || 0),
      confidence: Math.max(0, Math.min(100, conf)),
      acq: acqIso,
      acqRaw: `${iDate >= 0 ? c[iDate] : ''} ${iTime >= 0 ? String(c[iTime]).padStart(4, '0') : ''}`.trim(),
      satellite: iSat >= 0 ? String(c[iSat]).trim() : 'n/a',
      daynight: iDn >= 0 ? String(c[iDn]).trim() : ''
    });
  }
  return out;
}

async function firmsHotspots() {
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(FIRMS_MAP_KEY)}/${FIRMS_SOURCE}/${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}/${FIRMS_DAYS}`;
  const r = await fetchWithTimeout(url, {}, 20000);
  if (!r.ok) throw new Error('firms_http_' + r.status);
  const text = await r.text();
  if (/Invalid|error/i.test(text.slice(0, 200)) && !/latitude/i.test(text.slice(0, 200))) throw new Error('firms_rejected');
  return parseFirmsCsv(text);
}


/** Pengambilan mentah titik api; penjadwalannya diurus Scheduler. */
async function getHotspotsRaw() {
  {
    // Hasil MAP_KEY yang liputannya terlalu sempit, disimpan kalau-kalau
    // arsip terbuka juga tidak dapat dihubungi.
    let thinKeyResult = null;
    // 1) Bila pengguna memasang MAP_KEY, pakai endpoint area FIRMS
    //    (rentang hari dapat diatur dan pembaruannya paling cepat).
    if (FIRMS_MAP_KEY) {
      try {
        const rows = await firmsHotspots();
        // Endpoint MAP_KEY hanya melayani SATU satelit per permintaan dan
        // kerap membalas 200 dengan tabel kosong (slot NRT belum terbit, atau
        // satelit yang dipilih memang tidak melintas). Balasan kosong bukan
        // berarti Indonesia tidak punya titik api — arsip terbuka menggabung
        // tiga satelit dan biasanya tetap berisi. Jangan pernah menyajikan
        // nol palsu; jatuh ke arsip terbuka.
        // Jendela disaring di sini juga: endpoint berkunci pun mengembalikan
        // titik di luar 24 jam bila FIRMS_DAYS > 1, dan seluruh antarmuka
        // menjanjikan 24 jam.
        const cutoff = Date.now() - FIRMS_WINDOW_HOURS * 3600 * 1000;
        let oldestMs = null;
        let newestMs = null;
        const fresh = rows.filter(h => {
          const ms = Date.parse(h.acq);
          if (!Number.isFinite(ms) || ms < cutoff) return false;
          if (oldestMs === null || ms < oldestMs) oldestMs = ms;
          if (newestMs === null || ms > newestMs) newestMs = ms;
          return true;
        });
        // Balasan tidak kosong belum tentu memadai.
        //
        // Endpoint MAP_KEY melayani SATU satelit, dan slot NRT-nya terbit
        // bertahap: sesaat setelah sebuah lintasan diterbitkan, tabelnya
        // hanya memuat lintasan itu saja. Pengamatan nyata di produksi
        // menghasilkan 595 titik yang seluruhnya terekam dalam rentang
        // 2 menit, sementara arsip terbuka pada saat yang sama memuat
        // 6.714 titik tersebar di 24 jam penuh.
        //
        // Menyajikan yang 595 itu membuat peta tampak "berantakan": titik
        // api hanya muncul pada satu jalur lintasan satelit dan seluruh
        // wilayah lain tampak bersih, padahal sebenarnya hanya belum
        // terpotret. Karena itu balasan dinilai dari LIPUTAN WAKTUNYA,
        // bukan sekadar ada-tidaknya baris.
        const spanHours = (oldestMs !== null && newestMs !== null)
          ? (newestMs - oldestMs) / 3600000
          : 0;
        const MIN_SPAN_HOURS = FIRMS_WINDOW_HOURS / 2;

        if (fresh.length && spanHours >= MIN_SPAN_HOURS) {
          return {
            mode: 'live',
            source: `NASA FIRMS ${FIRMS_SOURCE} (MAP_KEY)`,
            days: FIRMS_DAYS,
            hotspots: fresh,
            windowHours: FIRMS_WINDOW_HOURS,
            fetched: rows.length,
            filteredOut: rows.length - fresh.length,
            oldestAcq: oldestMs ? new Date(oldestMs).toISOString() : null,
            newestAcq: newestMs ? new Date(newestMs).toISOString() : null,
            dataAgeHours: oldestMs ? +((Date.now() - oldestMs) / 3600000).toFixed(1) : null
          };
        }

        // Simpan sebagai cadangan terakhir: lebih baik menyajikan satu
        // lintasan daripada tidak sama sekali bila arsip terbuka ikut gagal.
        if (fresh.length) {
          thinKeyResult = {
            mode: 'live',
            source: `NASA FIRMS ${FIRMS_SOURCE} (MAP_KEY, liputan sebagian)`,
            days: FIRMS_DAYS,
            hotspots: fresh,
            windowHours: FIRMS_WINDOW_HOURS,
            fetched: rows.length,
            filteredOut: rows.length - fresh.length,
            oldestAcq: new Date(oldestMs).toISOString(),
            newestAcq: new Date(newestMs).toISOString(),
            dataAgeHours: +((Date.now() - oldestMs) / 3600000).toFixed(1)
          };
          console.error('[firms:key] liputan hanya ' + spanHours.toFixed(1)
            + ' jam (' + fresh.length + ' titik), beralih ke arsip terbuka');
        } else {
          console.error('[firms:key] balasan kosong, beralih ke arsip terbuka');
        }
      } catch (e) {
        console.error('[firms:key]', e.message);
      }
    }
    // 2) Arsip terbuka VIIRS 24 jam, tiga satelit. Dipakai bila tidak ada
    //    kunci, atau bila endpoint berkunci gagal/kosong/terlalu sempit.
    try {
      const r = await openHotspots(fetchWithTimeout, BBOX);

      // Bila MAP_KEY sempat memberi hasil, pilih yang liputannya lebih
      // luas. Arsip terbuka menggabung tiga satelit sehingga hampir
      // selalu menang, tetapi perbandingannya dibuat eksplisit agar
      // keputusannya tidak bergantung pada urutan kode.
      if (thinKeyResult && thinKeyResult.hotspots.length > r.hotspots.length) {
        return thinKeyResult;
      }

      return {
        mode: 'live',
        source: `NASA FIRMS VIIRS ${r.windowHours} jam — ${r.satellites.join(', ')} (arsip terbuka)`,
        days: 1,
        hotspots: r.hotspots,
        windowHours: r.windowHours,
        fetched: r.fetched,
        filteredOut: r.filteredOut,
        oldestAcq: r.oldestAcq,
        newestAcq: r.newestAcq,
        dataAgeHours: r.dataAgeHours
      };
    } catch (e) {
      // Arsip terbuka juga tidak dapat dihubungi. Satu lintasan satelit
      // masih lebih berguna daripada peta kosong, asalkan keterbatasan
      // liputannya disebutkan pada sumber data.
      if (thinKeyResult) {
        console.error('[firms:open]', e.message, '— memakai hasil MAP_KEY sebagian');
        return thinKeyResult;
      }
      throw e;
    }
  }
}

/** Titik api lewat penjadwal (satu sumber kebenaran). */
async function getHotspots() {
  return scheduler.get('hotspots');
}

// ---------- klaster + sebaran asap ----------
function clusterHotspots(hs, cell = 0.5) {
  const map = new Map();
  for (const h of hs) {
    const k = `${Math.round(h.lat / cell)}|${Math.round(h.lon / cell)}`;
    let c = map.get(k);
    if (!c) { c = { lat: 0, lon: 0, frp: 0, count: 0 }; map.set(k, c); }
    c.lat += h.lat; c.lon += h.lon; c.frp += h.frp; c.count++;
  }
  return [...map.values()]
    .map(c => ({ lat: +(c.lat / c.count).toFixed(3), lon: +(c.lon / c.count).toFixed(3), frp: +c.frp.toFixed(1), count: c.count }))
    .sort((a, b) => b.frp - a.frp);
}

async function windAt(lat, lon) {
  // Angin murni dari medan GFS global yang sudah di-cache: tidak ada
  // permintaan jaringan per klaster. Suhu & kelembapan diambil terpisah
  // secara massal oleh enrichWeather().
  try {
    const f = await gfsField(0);
    const w = sampleAt(f, lat, lon);
    if (w) return { speed: +w.speed.toFixed(2), from: Math.round(w.from), rh: null, temp: null, estimated: false };
  } catch (e) {
    console.error('[windAt:gfs]', e.message);
  }
  return { speed: 3, from: 100, rh: null, temp: null, estimated: true };
}

/**
 * Lengkapi daftar pluma dengan suhu & kelembapan dalam SATU permintaan.
 * Open-Meteo menghitung kuota per koordinat, jadi menggabungkan 14 titik
 * ke satu panggilan jauh lebih hemat daripada 14 panggilan terpisah.
 * Kegagalan di sini tidak boleh menghilangkan data angin.
 */
async function enrichWeather(plumes) {
  if (!plumes.length) return;
  const key = 'wx:' + plumes.map(p => p.lat.toFixed(1) + ',' + p.lon.toFixed(1)).join(';');
  try {
    const data = await cached(key, 30 * 60 * 1000, async () => {
      const lats = plumes.map(p => p.lat.toFixed(3)).join(',');
      const lons = plumes.map(p => p.lon.toFixed(3)).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}`
        + '&current=relative_humidity_2m,temperature_2m';
      const r = await fetchWithTimeout(url, {}, 12000);
      if (!r.ok) throw new Error('meteo_' + r.status);
      const j = await r.json();
      return Array.isArray(j) ? j : [j];
    });
    plumes.forEach((p, i) => {
      const c = (data[i] && data[i].current) || {};
      if (Number.isFinite(Number(c.relative_humidity_2m))) p.wind.rh = Number(c.relative_humidity_2m);
      if (Number.isFinite(Number(c.temperature_2m))) p.wind.temp = Number(c.temperature_2m);
    });
  } catch (e) {
    console.error('[enrichWeather]', e.message);
  }
}

// Poligon pluma: kerucut searah angin, panjang ~ f(FRP, kecepatan angin)
function plumePolygon(lat, lon, bearingTo, lengthKm, halfAngleDeg) {
  const pts = [[lat, lon]];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const a = bearingTo - halfAngleDeg + (2 * halfAngleDeg * i) / steps;
    pts.push(destination(lat, lon, a, lengthKm));
  }
  pts.push([lat, lon]);
  return pts;
}

// Prakiraan angin per jam (untuk timeline sebaran asap ke depan).
// Dipisah dari windAt() agar cache-nya sendiri dan hanya diambil sekali per klaster.
// Offset jam yang ditampilkan pada timeline sebaran.
const PLUME_STEPS = [0, 6, 12, 18];

/**
 * Batas jumlah titik api yang dikirim ke klien.
 *
 * Dipilih 2.000 setelah mengukur data nyata: pada beban puncak 7.172
 * titik, batas ini memotong pada FRP sekitar 5,8 MW dan menghasilkan
 * payload ~320 KB. Filter terendah yang tersedia di antarmuka adalah
 * 5 MW, sehingga hampir seluruh pilihan pengguna tetap terlayani utuh;
 * pilihan "semua" diberi keterangan bahwa daftarnya dipotong.
 */
const HOTSPOT_CAP = 2000;

async function windForecast(lat, lon) {
  // Prakiraan diambil dari siklus GFS yang sama (jam +6/+12/+18), sehingga
  // timeline konsisten dengan medan angin yang digambar di peta.
  const out = [];
  for (const h of PLUME_STEPS) {
    try {
      const f = await gfsField(h);
      const w = sampleAt(f, lat, lon);
      if (!w) continue;
      out.push({ hour: h, speed: w.speed, from: w.from, run: f.run });
    } catch { /* jam ini dilewati bila berkasnya belum terbit */ }
  }
  return out.length ? out : null;
}

// Bentuk pluma pada beberapa jam ke depan, memakai angin prakiraan tiap jam.
// Asap yang sudah dilepas tidak hilang: jangkauan diakumulasi dari jarak tempuh
// angin sejak sekarang, sehingga kerucut memanjang seiring waktu.
function plumeForecast(c, fc) {
  if (!fc || !fc.length) return null;
  return fc.map(w => {
    const bearingTo = (w.from + 180) % 360;
    const base = Math.min(320, 18 + Math.sqrt(c.frp) * 6 + w.speed * 12);
    // Asap yang sudah dilepas terus terbawa, jadi jangkauan bertambah
    // seiring lamanya transpor angin.
    const len = Math.min(600, base + w.speed * 3.6 * w.hour * 0.55);
    const half = Math.max(12, 34 - w.speed * 2);
    return {
      hour: w.hour,
      run: w.run,
      windSpeed: +w.speed.toFixed(1),
      windFrom: Math.round(w.from),
      bearingTo: Math.round(bearingTo),
      lengthKm: Math.round(len),
      polygon: plumePolygon(c.lat, c.lon, bearingTo, len, half),
      corePolygon: plumePolygon(c.lat, c.lon, bearingTo, len * 0.45, half * 0.7)
    };
  });
}
async function buildPlumes(clusters) {
  const top = clusters.slice(0, 14);
  const [winds, fcs] = await Promise.all([
    Promise.all(top.map(c => windAt(c.lat, c.lon))),
    Promise.all(top.map(c => windForecast(c.lat, c.lon)))
  ]);
  const built = top.map((c, i) => {
    const w = winds[i];
    const bearingTo = (w.from + 180) % 360;                  // arah tujuan asap
    const len = Math.min(320, 18 + Math.sqrt(c.frp) * 6 + w.speed * 12);
    const half = Math.max(12, 34 - w.speed * 2);
    const intensity = Math.min(1, (c.frp / 900) * 0.6 + (c.count / 40) * 0.4);
    return {
      lat: c.lat, lon: c.lon, frp: c.frp, count: c.count,
      wind: w, bearingTo: Math.round(bearingTo), lengthKm: Math.round(len),
      halfAngle: Math.round(half), intensity: +intensity.toFixed(2),
      polygon: plumePolygon(c.lat, c.lon, bearingTo, len, half),
      // Inti pekat: 45% jangkauan & kerucut lebih sempit (asap paling tebal dekat sumber).
      corePolygon: plumePolygon(c.lat, c.lon, bearingTo, len * 0.45, half * 0.7),
      forecast: plumeForecast(c, fcs[i])
    };
  });
  await enrichWeather(built);
  return built;
}

// ---------- daerah terdampak ----------
function bearingBetween(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function angDiff(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }

// Arah mata angin dalam Bahasa Indonesia (16 penjuru).
function compassId(deg) {
  const N = ['utara', 'utara-timur laut', 'timur laut', 'timur-timur laut',
             'timur', 'timur-tenggara', 'tenggara', 'selatan-tenggara',
             'selatan', 'selatan-barat daya', 'barat daya', 'barat-barat daya',
             'barat', 'barat-barat laut', 'barat laut', 'utara-barat laut'];
  return N[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

/**
 * Kota yang berada di bawah jalur sebaran abu vulkanik.
 *
 * Berbeda dari asap karhutla, abu dinilai per lapisan ketinggian: abu di
 * ~3 km jauh lebih berdampak ke permukaan (kesehatan, jarak pandang,
 * penerbangan rendah) daripada abu di ~10 km yang umumnya melintas di atas.
 * Bobot lapisan mencerminkan hal itu.
 */
/**
 * Uji titik di dalam poligon (ray casting).
 *
 * Poligon abu berukuran puluhan kilometer, jauh di bawah skala yang
 * membuat kelengkungan bumi berpengaruh, sehingga koordinat dapat
 * diperlakukan sebagai bidang datar.
 */
function pointInPolygon(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1];
    const yj = ring[j][0], xj = ring[j][1];
    const crosses = (yi > lat) !== (yj > lat)
      && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function ashImpactedRegions(volcanoes) {
  const LAYER_WEIGHT = { 3: 1, 6: 0.55, 10: 0.3 };
  const out = [];

  // Dipindai terhadap permukiman rapat, bukan 226 kota besar. Abu vulkanik
  // jatuh dalam radius puluhan kilometer, dan pada radius itu yang ada
  // umumnya desa dan pusat kecamatan — bukan kota berpenduduk ratusan ribu.
  for (const reg of SETTLEMENTS) {
    let score = 0;
    const hits = [];

    for (const v of (volcanoes || [])) {
      for (const p of (v.plumes || [])) {
        const reach = p.reachKm;
        if (!reach || !p.polygon || p.polygon.length < 4) continue;
        const dist = haversine(reg.lat, reg.lon, v.lat, v.lon);
        // Saringan murah lebih dulu supaya uji poligon hanya dijalankan
        // untuk kandidat yang masuk akal.
        if (dist > reach * 1.2) continue;

        // Diuji terhadap POLIGON yang benar-benar digambar, bukan terhadap
        // kerucut. Sejak bentuknya menjadi area bersisi lurus berujung
        // tumpul, uji sudut tidak lagi mewakili gambar: ada permukiman di
        // dalam poligon yang ditolak uji sudut, dan sebaliknya. Daftar
        // wilayah terdampak harus persis sama dengan apa yang terlihat.
        if (!pointInPolygon(reg.lat, reg.lon, p.polygon)) continue;

        const br = bearingBetween(v.lat, v.lon, reg.lat, reg.lon);
        const half = p.halfAngleDeg || 20;
        const off = angDiff(br, p.to);

        const w = LAYER_WEIGHT[p.altKm] || 0.3;
        const distFactor = Math.max(0, 1 - dist / reach);
        // Paparan meluruh dari sumbu ke tepi; di luar sudut nominal tetap
        // dihitung tetapi bobotnya kecil.
        const angFactor = Math.max(0.15, 1 - off / Math.max(half, 1));
        const s = 100 * w * distFactor * angFactor;
        if (s <= 0.5) continue;

        const etaH = p.speed > 0.3 ? dist / (p.speed * 3.6) : null;
        hits.push({
          volcano: v.name,
          km: Math.round(dist),
          altKm: p.altKm,
          etaH,
          level: v.official ? v.official.status : null
        });
        score += s;
      }
    }

    if (score <= 0.5) continue;
    score = Math.min(100, score);
    const nearest = hits.reduce((a, b) => (b.km < a.km ? b : a));
    const etas = hits.map(h => h.etaH).filter(x => x !== null);

    out.push({
      name: reg.name,
      prov: SETTLEMENT_KIND_LABEL[reg.kind] || 'Permukiman',
      kind: reg.kind,
      lat: reg.lat,
      lon: reg.lon,
      population: reg.pop,
      score: +score.toFixed(1),
      level: score >= 66 ? 'Berat' : score >= 33 ? 'Sedang' : 'Ringan',
      nearestKm: nearest.km,
      volcano: nearest.volcano,
      officialLevel: nearest.level,
      layers: [...new Set(hits.map(h => h.altKm))].sort((a, b) => a - b),
      etaH: etas.length ? Math.min(...etas) : null
    });
  }

  // Diurutkan menurut tingkat paparan; yang terdekat dan paling terpapar
  // muncul lebih dulu. Batas 120 dipilih supaya peta tetap terbaca —
  // menggambar ribuan penanda justru menyembunyikan yang penting.
  out.sort((a, b) => b.score - a.score || a.nearestKm - b.nearestKm);
  const ASH_IMPACT_CAP = 120;
  return {
    list: out.slice(0, ASH_IMPACT_CAP),
    meta: {
      returned: Math.min(ASH_IMPACT_CAP, out.length),
      total: out.length,
      truncated: out.length > ASH_IMPACT_CAP
    }
  };
}

function impactedRegions(plumes) {
  const out = [];
  for (const reg of REGIONS) {
    let score = 0; const causes = [];
    for (const p of plumes) {
      const dist = haversine(reg.lat, reg.lon, p.lat, p.lon);
      if (dist > p.lengthKm * 1.15) continue;
      const br = bearingBetween(p.lat, p.lon, reg.lat, reg.lon);
      const off = angDiff(br, p.bearingTo);
      if (off > p.halfAngle * 1.25) continue;
      const distFactor = Math.max(0, 1 - dist / (p.lengthKm * 1.15));
      const angFactor = Math.max(0, 1 - off / (p.halfAngle * 1.25));
      const s = 100 * p.intensity * distFactor * angFactor;
      if (s > 0.5) {
        // Perkiraan waktu tempuh asap = jarak / kecepatan angin.
        const etaH = p.wind.speed > 0.3 ? dist / (p.wind.speed * 3.6) : null;
        causes.push({
          km: Math.round(dist), frp: p.frp, etaH,
          from: compassId(p.bearingTo), windSpeed: p.wind.speed
        });
        score += s;
      }
    }
    if (score <= 0.5) continue;
    score = Math.min(100, score);
    const nearest = causes.reduce((a, b) => (b.km < a.km ? b : a));
    const level = score >= 66 ? 'Berat' : score >= 33 ? 'Sedang' : 'Ringan';
    // ETA tercepat di antara pluma yang mengenai kota ini.
    const etas = causes.map(c => c.etaH).filter(v => v !== null);
    const etaH = etas.length ? Math.min(...etas) : null;
    out.push({
      name: reg.name, prov: reg.prov, lat: reg.lat, lon: reg.lon, population: reg.pop,
      score: +score.toFixed(1), level,
      nearestKm: nearest.km,
      plumes: causes.length,
      windSpeed: +nearest.windSpeed.toFixed(1),
      fromDir: nearest.from,
      etaHours: etaH === null ? null : +etaH.toFixed(1),
      etaText: etaH === null ? 'angin nyaris diam — asap cenderung mengendap di sekitar sumber'
        : etaH < 1 ? 'asap bisa tiba di bawah 1 jam'
        : etaH < 24 ? 'asap diperkirakan tiba ~' + Math.round(etaH) + ' jam lagi'
        : 'asap diperkirakan tiba lebih dari sehari',
      etaShort: etaH === null ? 'angin diam'
        : etaH < 1 ? 'tiba <1 jam' : etaH < 24 ? 'tiba ~' + Math.round(etaH) + ' jam' : 'tiba >1 hari',
      proximity: nearest.km <= 50 ? 'sangat dekat' : nearest.km <= 150 ? 'dekat' : 'jauh',
      advice: level === 'Berat'
        ? 'Batasi aktivitas luar ruang, kenakan masker N95, dan pantau kelompok rentan (anak, lansia, penderita ISPA).'
        : level === 'Sedang'
        ? 'Kurangi aktivitas luar ruang yang berat dan siapkan masker bila kabut asap menebal.'
        : 'Paparan diperkirakan tipis; tetap pantau perkembangan arah angin.'
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------- berita penanganan ----------
function decodeXml(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .trim();
}
function toSeendate(d) {
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return '';
  const x = new Date(t);
  return `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, '0')}${String(x.getUTCDate()).padStart(2, '0')}`;
}
/**
 * Kanal berita. Dipisah per topik supaya kabar penanganan tingkat pusat
 * (rapat terbatas, instruksi presiden, BNPB) tidak tenggelam oleh berita
 * kejadian kebakaran yang jumlahnya jauh lebih banyak.
 */
/**
 * Kueri berita luar negeri dipisah per negara tetangga.
 *
 * Kenapa per negara, bukan satu kueri "internasional": media Singapura,
 * Malaysia, Australia, dan Jepang meliput bencana Indonesia dari sudut yang
 * berbeda dan lebih cepat untuk hal yang menyangkut mereka langsung —
 * penutupan bandara, pembatalan penerbangan, kabut asap lintas batas,
 * peringatan tsunami regional. Satu kueri global cenderung dikuasai satu-dua
 * kantor berita besar saja.
 *
 * Tiap negara memakai edisi Google Berita setempat (hl/gl/ceid), sehingga
 * yang muncul benar-benar media negara itu, bukan terjemahan.
 */
const NEIGHBOUR_EDITIONS = [
  { id: 'sg', country: 'Singapura', hl: 'en-SG', gl: 'SG', ceid: 'SG:en' },
  { id: 'my', country: 'Malaysia', hl: 'en-MY', gl: 'MY', ceid: 'MY:en' },
  { id: 'au', country: 'Australia', hl: 'en-AU', gl: 'AU', ceid: 'AU:en' },
  // Edisi bahasa Inggris untuk Jepang (JP:en) justru mengembalikan media
  // Amerika, jadi dipakai edisi bahasa Jepang: hasilnya Reuters Japan, NHK,
  // TBS, Yomiuri — yang memang meliput dampaknya bagi warga Jepang.
  { id: 'jp', country: 'Jepang', hl: 'ja', gl: 'JP', ceid: 'JP:ja', lang: 'ja' },
  { id: 'ph', country: 'Filipina', hl: 'en-PH', gl: 'PH', ceid: 'PH:en' }
];

// Istilah bencana dalam bahasa Inggris; dipakai untuk semua edisi tetangga.
const NEIGHBOUR_QUERY =
  '(Indonesia OR Indonesian OR Jakarta OR Bali OR Sumatra OR Java) '
  + '(volcano OR eruption OR "volcanic ash" OR earthquake OR tsunami OR haze OR '
  + 'wildfire OR "forest fire" OR evacuation OR "flight cancelled" OR "airport closed")';

// Kueri bahasa Jepang; istilah bencana ditulis dalam bahasa setempat agar
// yang terjaring memang liputan media Jepang, bukan kantor berita berbahasa Inggris.
const NEIGHBOUR_QUERY_JA =
  'インドネシア (噴火 OR 火山灰 OR 地震 OR 津波 OR 山火事 OR 煙害 OR 避難)';

const NEWS_TOPICS = [
  {
    id: 'kebencanaan', label: 'Gempa & tsunami',
    q: '(gempa OR tsunami OR "peringatan dini" OR BMKG OR erupsi OR "gunung api") Indonesia'
  },
  {
    id: 'kejadian', label: 'Kejadian & titik api',
    q: 'karhutla OR "kebakaran hutan" OR "kebakaran lahan" OR "titik api" OR "kabut asap"'
  },
  {
    id: 'pusat', label: 'Kebijakan pusat',
    q: '("rapat terbatas" OR ratas OR "instruksi presiden" OR "Presiden Prabowo" OR "Kepala Negara") '
      + '(karhutla OR "kebakaran hutan" OR "kabut asap" OR bencana OR erupsi OR gempa)'
  },
  {
    id: 'penanganan', label: 'Operasi penanganan',
    q: '(BNPB OR BPBD OR Manggala Agni OR "water bombing" OR "modifikasi cuaca" OR "hujan buatan" '
      + 'OR "satgas karhutla" OR TNI OR Polri OR Basarnas) '
      + '(karhutla OR "kebakaran hutan" OR erupsi OR gempa OR pengungsi)'
  },
  {
    id: 'daerah', label: 'Tanggap darurat daerah',
    q: '("status siaga darurat" OR "tanggap darurat" OR "darurat asap" OR gubernur OR bupati) '
      + '(karhutla OR "kebakaran hutan" OR "kabut asap" OR erupsi OR gempa)'
  },
  {
    id: 'penegakan', label: 'Penegakan hukum',
    q: '(KLHK OR "Gakkum" OR tersangka OR "segel lahan" OR "sanksi perusahaan" OR penyidikan) '
      + '(karhutla OR "kebakaran hutan" OR "kebakaran lahan")'
  },
  {
    id: 'kesehatan', label: 'Dampak kesehatan & pendidikan',
    q: '(ISPA OR "kualitas udara" OR ISPU OR "sekolah diliburkan" OR "libur sekolah" OR posko kesehatan) '
      + '(kabut asap OR karhutla OR "abu vulkanik")'
  },
  {
    id: 'penerbangan', label: 'Penerbangan & bandara',
    q: '("bandara ditutup" OR "penerbangan dibatalkan" OR NOTAM OR "abu vulkanik" OR AirNav) '
      + '(bandara OR penerbangan OR maskapai)'
  },
  // Satu topik per negara tetangga, memakai edisi Google Berita setempat.
  ...NEIGHBOUR_EDITIONS.map(e => ({
    id: 'luar-' + e.id,
    label: e.country,
    q: e.lang === 'ja' ? NEIGHBOUR_QUERY_JA : NEIGHBOUR_QUERY,
    edition: e,
    foreign: true
  }))
];

async function googleNewsTopic(topic) {
  // Topik luar negeri memakai edisi Google Berita negara bersangkutan agar
  // yang muncul memang media setempat, bukan hasil terjemahan.
  const ed = topic.edition || { hl: 'id', gl: 'ID', ceid: 'ID:id' };
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic.q)}`
    + `&hl=${ed.hl}&gl=${ed.gl}&ceid=${ed.ceid}`;
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SiagaID/1.0)' } }, 15000);
  if (!r.ok) throw new Error('gnews_' + r.status);
  const xml = await r.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const out = [];
  for (const it of items) {
    const pick = tag => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(it);
      return m ? decodeXml(m[1]) : '';
    };
    const link = pick('link');
    if (!/^https?:\/\//.test(link)) continue;
    let domain = pick('source');
    if (!domain) { try { domain = new URL(link).hostname.replace(/^www\./, ''); } catch { domain = ''; } }
    let title = pick('title');
    if (domain && title.endsWith(' - ' + domain)) title = title.slice(0, -(domain.length + 3));
    const pub = pick('pubDate');
    const cleanTitle = title.slice(0, 300);

    // Gerbang relevansi (pola dari news scanner ACE, kosakata bencana).
    // Edisi negara tetangga paling banyak menyumbang derau: kueri
    // menyebut "Indonesia", jadi berita politik dan olahraga ikut
    // terjaring. Judul tanpa satu pun kata kunci kebencanaan dibuang
    // di sini, sebelum sempat memakan jatah topik.
    if (!isRelevant(cleanTitle)) continue;

    out.push({
      title: cleanTitle, url: link, domain: domain.slice(0, 80),
      seendate: toSeendate(pub),
      pubDate: pub,
      topic: topic.id, topicLabel: topic.label,
      foreign: !!topic.foreign,
      country: topic.edition ? topic.edition.country : null,
      score: scoreArticle(cleanTitle, { publishedMs: Date.parse(pub) || null }),
      category: classify(cleanTitle)
    });
  }
  return out;
}

async function googleNews() {
  const batches = await Promise.all(
    NEWS_TOPICS.map(t => googleNewsTopic(t).catch(e => {
      console.error('[news:' + t.id + ']', e.message);
      return [];
    }))
  );
  // Gabung lalu buang duplikat: satu artikel bisa cocok di beberapa topik.
  //
  // Menyaring dengan URL saja tidak cukup. Berita kawat (AP, Reuters)
  // diterbitkan ulang puluhan media dengan judul identik tetapi tautan
  // berbeda, sehingga satu peristiwa memenuhi layar. Teknik yang dipakai
  // di repo ACE diterapkan di sini: judul dinormalkan lalu dibandingkan
  // lewat tumpang-tindih token (Jaccard). Ambang 0,80 dipilih karena
  // menangkap "Flights to and from Indonesia's capital resume..." yang
  // sama persis dari enam penerbit, tanpa menggabungkan dua peristiwa
  // berbeda yang kebetulan memakai kata serupa.
  //
  // Artikel pertama yang lolos dipertahankan; karena tiap topik diambil
  // berurutan, yang bertahan adalah versi dari topik paling spesifik.
  const seen = new Set();
  const recentTokens = [];
  const all = [];

  const normTitle = (t) => String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff\u3040-\u30ff ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const arr of batches) {
    for (const a of arr) {
      const key = a.url.split('?')[0];
      if (seen.has(key)) continue;

      const tokens = new Set(normTitle(a.title).split(' ').filter(Boolean));
      if (tokens.size) {
        let dup = false;
        for (const prev of recentTokens) {
          let inter = 0;
          for (const t of tokens) if (prev.has(t)) inter++;
          const union = tokens.size + prev.size - inter;
          if (union && inter / union >= 0.80) { dup = true; break; }
        }
        if (dup) continue;
        recentTokens.push(tokens);
        // Jendela pembanding dibatasi agar biaya tetap linear pada
        // jumlah artikel, bukan kuadratik penuh.
        if (recentTokens.length > 300) recentTokens.shift();
      }

      seen.add(key);
      all.push(a);
    }
  }
  if (!all.length) throw new Error('empty');
  all.sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));

  // Memotong daftar gabungan begitu saja membuat topik bervolume rendah
  // (mis. peringatan luar negeri) hilang sepenuhnya. Karena itu tiap topik
  // dijamin mendapat jatah minimum lebih dulu, sisanya diisi yang terbaru.
  // 13 topik (8 dalam negeri + 5 negara tetangga) x jatah 12 = 156,
  // sisanya diisi artikel terbaru lintas topik.
  const LIMIT = 200;
  const QUOTA = 12;
  const chosen = new Set();
  const picked = [];

  // Jatah tiap topik diisi menurut skor relevansi, bukan semata urutan
  // waktu. Dengan begitu erupsi yang menutup bandara mengalahkan berita
  // seremonial yang kebetulan terbit semenit lebih baru. Kesegaran tetap
  // ikut diperhitungkan karena sudah menjadi komponen skor.
  for (const t of NEWS_TOPICS) {
    const pool = all
      .filter(a => a.topic === t.id && !chosen.has(a.url))
      .sort((a, b) => (b.score - a.score)
        || ((Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0)));
    for (const a of pool.slice(0, QUOTA)) {
      chosen.add(a.url);
      picked.push(a);
    }
  }
  for (const a of all) {
    if (picked.length >= LIMIT) break;
    if (chosen.has(a.url)) continue;
    chosen.add(a.url);
    picked.push(a);
  }
  picked.sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));

  const counts = {};
  for (const t of NEWS_TOPICS) counts[t.id] = picked.filter(a => a.topic === t.id).length;
  return {
    ok: true,
    source: 'Google Berita — edisi Indonesia + edisi negara tetangga',
    fetchedAt: new Date().toISOString(),
    topics: NEWS_TOPICS.map(t => ({
      id: t.id, label: t.label, count: counts[t.id],
      foreign: !!t.foreign,
      country: t.edition ? t.edition.country : null
    })),
    articles: picked
  };
}
async function gdeltNews() {
  const q = '(karhutla OR "kebakaran hutan") sourcecountry:indonesia';
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=40&sort=datedesc&format=json`;
  const r = await fetchWithTimeout(url, {}, 15000);
  if (!r.ok) throw new Error('gdelt_' + r.status);
  const j = JSON.parse(await r.text());
  const arts = (j.articles || []).map(a => ({
    title: String(a.title || '').slice(0, 300),
    url: String(a.url || ''),
    domain: String(a.domain || ''),
    seendate: String(a.seendate || '')
  })).filter(a => /^https?:\/\//.test(a.url));
  if (!arts.length) throw new Error('empty');
  return { ok: true, source: 'GDELT Project (agregator berita terbuka)', articles: arts };
}
/** Berita lewat penjadwal; sumber cadangan GDELT ditangani di tugasnya. */
async function getNews() {
  const v = await scheduler.get('news');
  return v || { ok: false, source: 'tidak tersedia', topics: [], articles: [] };
}

// ---------- API ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Dibungkus jadi fungsi agar bisa dipakai ulang oleh mesin pencarian (/api/ask).
async function buildOverview() {
  {
    const hs = await getHotspots();
    const { mode, source, days, hotspots, notice } = hs;
    const clusters = clusterHotspots(hotspots);
    const plumes = await buildPlumes(clusters);
    const impacted = impactedRegions(plumes);
    const highConf = hotspots.filter(h => h.confidence >= 80).length;
    const totalFrp = hotspots.reduce((s, h) => s + h.frp, 0);
    const byProvince = {};
    for (const r of impacted) byProvince[r.prov] = Math.max(byProvince[r.prov] || 0, r.score);

    // peringkat provinsi berdasarkan jumlah titik api (ala Fire Season Progress)
    const provAgg = new Map();
    for (const h of hotspots) {
      const p = provinceOf(h.lat, h.lon);
      if (!p) continue;
      let rec = provAgg.get(p);
      if (!rec) { rec = { province: p, hotspots: 0, frp: 0 }; provAgg.set(p, rec); }
      rec.hotspots++; rec.frp += h.frp;
    }
    const provinceRanking = [...provAgg.values()]
      .map(p => ({ ...p, frp: +p.frp.toFixed(0) }))
      .sort((a, b) => b.hotspots - a.hotspots).slice(0, 15);

    // Kota di jalur abu vulkanik. Opsional: kegagalan data gunung tidak
    // boleh menggugurkan seluruh ringkasan karhutla.
    let ashImpacted = { list: [], meta: null };
    let volcanoSummary = null;
    try {
      const va = await scheduler.get('volcano');
      ashImpacted = ashImpactedRegions(va.active || []);

      // Data gunung (termasuk geometri sebaran) disegarkan tiap 30 menit,
      // sedangkan laporan letusan tiap 10 menit. Hitung jumlah gunung yang
      // meletus dari tugas letusan secara langsung supaya angka di kepala
      // halaman tidak tertinggal satu siklus di belakang panel kejadian.
      // Hanya pakai nilai yang SUDAH ada di cache. scheduler.get() akan
      // menarik dari MAGMA bila kosong, dan halaman itu bisa memakan 40 detik
      // sehingga permintaan overview ikut kehabisan waktu (504). Penyegaran
      // laporan letusan sudah ditangani penjadwalnya sendiri.
      const er = scheduler.peek('eruption');

      volcanoSummary = {
        // "dipantau" = berstatus Waspada ke atas; "meletus" = ada laporan
        // pos pengamatan dalam 24 jam. Keduanya sengaja dipisah agar gunung
        // berstatus tinggi yang sedang tenang tidak terhitung sebagai erupsi.
        monitored: va.monitoredCount || va.activeCount || 0,
        erupting: er ? er.volcanoes.length : (va.eruptingCount || 0),
        // null berarti BELUM DIKETAHUI, bukan nol. Klien wajib membedakannya.
        eruptionReports: er ? er.total : (va.eruptions ? va.eruptions.total : null),
        eruptingNames: er
          ? er.volcanoes.map(v => v.name)
          : (va.active || []).filter(v => v.eruption).map(v => v.name),
        counts: va.official ? va.official.counts : null,
        stale: !!(va.official && va.official.stale)
      };
    } catch (e) {
      console.error('[overview:ash]', e.message);
    }

    // titik AQI terburuk secara nasional (opsional — jangan gagalkan overview)
    let worstAir = null;
    try {
      const field = await airQualityField(1.5);
      const top = field.points.slice().sort((a, b) => b.aqi - a.aqi)[0];
      if (top) {
        worstAir = {
          aqi: top.aqi, pm25: top.pm25, label: top.label, color: top.color,
          lat: top.lat, lon: top.lon, province: provinceOf(top.lat, top.lon)
        };
      }
    } catch (e) { console.error('[overview:aq]', e.message); }
    // Pemotongan payload titik api.
    //
    // Saat kemarau memuncak, jumlah titik melonjak dari ratusan menjadi
    // ribuan; pada satu pengukuran, 7.172 titik menghasilkan 1,16 MB
    // sementara antarmuka hanya menggambar 998 di antaranya. Sisanya
    // tetap harus diurai peramban — beban nyata pada perangkat murah,
    // justru perangkat yang banyak dipakai di daerah terdampak.
    //
    // Yang dipertahankan adalah titik ber-FRP tertinggi, karena itulah
    // yang membentuk klaster, pluma asap, dan daftar daerah terdampak.
    // `acqRaw` dibuang dari payload: nilainya hanya bentuk mentah dari
    // `acq` yang sudah ISO 8601, berguna saat menelusuri di server
    // tetapi tidak pernah dipakai klien.
    const hotspotsSorted = hotspots.slice().sort((a, b) => b.frp - a.frp);
    const hotspotsOut = hotspotsSorted.slice(0, HOTSPOT_CAP).map(h => ({
      lat: h.lat, lon: h.lon, frp: h.frp, confidence: h.confidence,
      acq: h.acq, satellite: h.satellite, daynight: h.daynight
    }));

    return {
      meta: {
        mode, source, days, notice,
        updatedAt: new Date().toISOString(),
        // Kesegaran dilaporkan apa adanya. Antarmuka membaca nilai ini
        // alih-alih menuliskan "24 jam" secara tetap, supaya klaim di layar
        // tidak pernah melampaui data yang benar-benar dimiliki.
        windowHours: hs.windowHours != null ? hs.windowHours : null,
        oldestAcq: hs.oldestAcq || null,
        newestAcq: hs.newestAcq || null,
        dataAgeHours: hs.dataAgeHours != null ? hs.dataAgeHours : null,
        filteredOut: hs.filteredOut != null ? hs.filteredOut : null,
        bbox: BBOX,
        attribution: ['NASA FIRMS', 'Open-Meteo', 'GDELT Project', 'Global Forest Watch', 'Esri']
      },
      stats: {
        hotspots: hotspots.length,
        highConfidence: highConf,
        totalFrp: +totalFrp.toFixed(0),
        clusters: clusters.length,
        impactedRegions: impacted.length,
        // Semua kota di jalur asap dihitung; ambang 'sedang' dipisah agar
        // angka tidak menjadi nol saat paparan tersebar tipis di banyak kota.
        peopleExposed: impacted.reduce((s, r) => s + r.population, 0),
        peopleExposedModerate: impacted.reduce((s, r) => s + (r.score >= 33 ? r.population : 0), 0)
      },
      hotspots: hotspotsOut, clusters: clusters.slice(0, 40), plumes, impacted,
      // Titik api dipotong ke yang paling kuat agar payload tidak
      // membengkak saat musim kebakaran memuncak. Metadata di bawah
      // membuat pemotongan itu terbaca, bukan tersembunyi: antarmuka
      // tetap melaporkan TOTAL sebenarnya dan memberi tahu pengguna
      // ketika filter yang dipilih meminta titik di bawah ambang potong.
      hotspotsMeta: {
        returned: hotspotsOut.length,
        total: hotspots.length,
        truncated: hotspots.length > HOTSPOT_CAP,
        selection: 'top-FRP',
        minFrpIncluded: hotspotsOut.length ? hotspotsOut[hotspotsOut.length - 1].frp : null
      },
      // Array klaster sengaja dipotong agar payload tidak membengkak.
      // Jumlah sebenarnya tetap dilaporkan supaya stats.clusters tidak
      // bertentangan dengan panjang array yang dikirim.
      clustersMeta: {
        returned: Math.min(40, clusters.length),
        total: clusters.length,
        truncated: clusters.length > 40
      },
      ashImpacted: ashImpacted.list || ashImpacted,
      ashImpactedMeta: ashImpacted.meta || null,
      volcano: volcanoSummary,
      provinceScores: byProvince, provinceRanking, worstAir
    };
  }
}

app.get('/api/overview', async (_req, res) => {
  try {
    const d = await buildOverview();
    // Pada instance yang baru hidup, data gunung bisa belum selesai ditarik
    // sehingga ringkasan sementara melaporkan "0 gunung meletus". Balasan
    // seperti itu tidak boleh mengendap di cache CDN selama dua menit dan
    // menampilkan angka yang salah kepada pengguna berikutnya.
    const incomplete = !d.volcano || d.volcano.eruptionReports === null;
    res.set('Cache-Control', incomplete ? 'no-store' : 'public, max-age=120');
    res.json(d);
  } catch (e) {
    console.error('[overview]', e.message);
    res.status(502).json({ error: 'Data pemantauan sedang tidak tersedia. Silakan coba lagi.' });
  }
});

// Atribusi titik api ke unit lahan / pemegang izin.
async function buildAttribution() {
  {
    const { hotspots, mode } = await getHotspots();
    const result = await cached('attr:' + mode + ':' + hotspots.length, 30 * 60 * 1000,
      () => attributeHotspots(hotspots));
    return {
      meta: {
        mode,
        updatedAt: new Date().toISOString(),
        datasets: ['GFW Oil Palm 2025', 'GFW Wood Fiber 2025', 'GFW Logging 2021', 'GFW Mining 2025', 'RSPO 2025'],
        disclaimer:
          'Data batas konsesi adalah kompilasi Global Forest Watch dari sumber pemerintah (KLHK, ESDM) dan RSPO. ' +
          'Ini BUKAN sertifikat HGU resmi ATR/BPN, yang tidak dipublikasikan terbuka. ' +
          'Titik api di dalam batas konsesi TIDAK otomatis berarti perusahaan tersebut membakar — ' +
          'api dapat merambat dari luar. Gunakan sebagai indikasi awal, bukan bukti hukum.'
      },
      ...result
    };
  }
}

app.get('/api/attribution', async (_req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=600');
    res.json(await buildAttribution());
  } catch (e) {
    console.error('[attribution]', e.message);
    res.status(502).json({ error: 'Analisis atribusi lahan sedang tidak tersedia.' });
  }
});

// ---------- medan angin (grid) ----------
// Satu permintaan Open-Meteo multi-titik untuk seluruh Indonesia.
// Medan angin global dari GFS. Satu berkas GRIB2 (~160 KB) memuat seluruh
// bumi, jadi tidak ada lagi batas 320 titik maupun jepitan ke bbox Indonesia.
// Cache lama disimpan terpisah agar tetap bisa dipakai bila NOMADS sedang
// menolak permintaan (batas laju). Angin 3 jam lalu jauh lebih berguna
// daripada tidak ada angin sama sekali.
const gfsLast = new Map();

async function gfsField(fhour) {
  try {
    const f = await cached(`gfs:${fhour}`, 3 * 60 * 60 * 1000,
      () => fetchWindField(fetchWithTimeout, fhour));
    gfsLast.set(fhour, f);
    return f;
  } catch (e) {
    const stale = gfsLast.get(fhour);
    if (stale) {
      console.error('[gfs] memakai data lama:', e.message);
      return stale;
    }
    throw e;
  }
}

async function windField(stepDeg, box) {
  const step = [0.25, 0.5, 1, 1.5, 2, 3, 5].includes(stepDeg) ? stepDeg : 2;
  const f = await gfsField(0);
  const points = gridPoints(f, step, box);
  return { step, count: points.length, points, run: f.run, global: !box };
}


/**
 * Baca parameter `step` dari himpunan nilai yang diizinkan.
 *
 * Sebelumnya nilai apa pun diterima lalu diabaikan diam-diam. Itu bukan
 * sekadar tidak rapi: tiap nilai unik menghasilkan kunci cache CDN yang
 * berbeda, sehingga `?step=1.0001`, `?step=1.0002`, dan seterusnya
 * masing-masing menjadi cache miss yang meneruskan panggilan ke pihak
 * ketiga berkuota. Membatasi ke himpunan diskret menutup jalur
 * amplifikasi itu sekaligus membuat penolakan menjadi jujur.
 */
function readStep(raw, allowed, fallback) {
  if (raw === undefined || raw === '') return { value: fallback };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: 'Parameter step harus berupa angka.' };
  if (!allowed.includes(n)) {
    return { error: 'Parameter step harus salah satu dari: ' + allowed.join(', ') + '.' };
  }
  return { value: n };
}

const WIND_STEPS = [1, 1.5, 2, 3];
// Nilai-nilai ini harus cocok dengan airStepFor() dan windStepFor() di
// public/app.js. Menambah tingkat zoom baru di klien tanpa menambahkannya
// di sini akan membuat lapisan gagal dengan 400.
const AQ_STEPS = [0.25, 0.5, 1, 1.5];

app.get('/api/wind-field', async (req, res) => {
  const sp = readStep(req.query.step, WIND_STEPS, 2);
  if (sp.error) return res.status(400).json({ error: sp.error });
  const step = sp.value;
  const w = Number(req.query.west), so = Number(req.query.south);
  const e = Number(req.query.east), n = Number(req.query.north);
  let box = null;
  if ([w, so, e, n].every(Number.isFinite)) {
    if (w >= e || so >= n || so < -90 || n > 90 || w < -180 || e > 180) {
      return res.status(400).json({ error: 'Area peta tidak valid.' });
    }
    // Tidak dijepit ke Indonesia supaya angin tetap menyambung saat
    // pengguna menggeser peta keluar, hanya dibatasi lintang agar kutub
    // tidak memenuhi hasil.
    box = { west: w, south: Math.max(-85, so), east: e, north: Math.min(85, n) };
  } else {
    // Tanpa kotak pandang, sebelumnya seluruh grid global dikirim: 15.189
    // titik, 800 KB, dan hanya 1,4% di antaranya berada di Indonesia.
    // Muatan awal itu 68% dari seluruh payload aplikasi, di jaringan yang
    // justru sedang buruk saat bencana. Default kini kawasan Indonesia
    // beserta margin 10 derajat supaya partikel tidak terpotong di tepi.
    box = { west: 84.5, south: -21.5, east: 151.5, north: 16.5 };
  }
  try {
    const wf = await windField(step, box);
    res.set('Cache-Control', 'public, max-age=1800');
    res.json({
      updatedAt: new Date().toISOString(),
      source: `NOAA GFS 1° (siklus ${wf.run}) — angin permukaan 10 m`,
      ...wf
    });
  } catch (e) {
    console.error('[wind-field]', e.message);
    res.status(502).json({ error: 'Data angin gagal dimuat.' });
  }
});

// ---------- kualitas udara (AQI) ----------
// Kategori mengikuti skala US AQI (EPA).
const AQI_BANDS = [
  { max: 50,  label: 'Baik',            color: '#22c55e', advice: 'Kualitas udara memuaskan, risiko minim.' },
  { max: 100, label: 'Sedang',          color: '#facc15', advice: 'Kelompok sangat sensitif sebaiknya kurangi aktivitas berat di luar.' },
  { max: 150, label: 'Tidak sehat bagi kelompok sensitif', color: '#fb923c', advice: 'Anak, lansia, penderita asma/jantung batasi aktivitas luar ruang.' },
  { max: 200, label: 'Tidak sehat',     color: '#ef4444', advice: 'Semua orang mulai merasakan dampak. Kurangi aktivitas luar ruang, gunakan masker N95.' },
  { max: 300, label: 'Sangat tidak sehat', color: '#a855f7', advice: 'Peringatan kesehatan. Hindari aktivitas luar ruang, gunakan penyaring udara.' },
  { max: Infinity, label: 'Berbahaya',  color: '#7f1d1d', advice: 'Darurat kesehatan. Tetap di dalam ruangan tertutup, ikuti arahan dinas kesehatan.' }
];
function aqiBand(v) {
  for (const b of AQI_BANDS) if (v <= b.max) return b;
  return AQI_BANDS[AQI_BANDS.length - 1];
}

async function airQualityField(stepDeg, box) {
  const step = [0.25, 0.5, 1, 1.5, 2, 3].includes(stepDeg) ? stepDeg : 1.5;
  const b = box || BBOX;
  const key = box
    ? `aq:${step}:${b.west.toFixed(1)},${b.south.toFixed(1)},${b.east.toFixed(1)},${b.north.toFixed(1)}`
    : `aq:${step}`;
  return cached(key, 30 * 60 * 1000, async () => {
    const lats = [], lons = [];
    for (let la = b.south + step / 2; la <= b.north && lats.length < 400; la += step) {
      for (let lo = b.west + step / 2; lo <= b.east && lats.length < 400; lo += step) {
        lats.push(la.toFixed(2)); lons.push(lo.toFixed(2));
      }
    }
    if (!lats.length) return { step, count: 0, points: [] };

    const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
      + `?latitude=${lats.join(',')}&longitude=${lons.join(',')}`
      + '&current=pm2_5,pm10,us_aqi';
    const r = await fetchWithTimeout(url, {}, 25000);
    if (!r.ok) throw new Error('aq_' + r.status);
    const j = await r.json();
    const arr = Array.isArray(j) ? j : [j];

    const points = [];
    for (const p of arr) {
      const c = p && p.current;
      if (!c) continue;
      const aqi = Number(c.us_aqi);
      if (!Number.isFinite(aqi)) continue;
      const band = aqiBand(aqi);
      points.push({
        lat: +Number(p.latitude).toFixed(3),
        lon: +Number(p.longitude).toFixed(3),
        aqi: Math.round(aqi),
        pm25: Number.isFinite(Number(c.pm2_5)) ? +Number(c.pm2_5).toFixed(1) : null,
        pm10: Number.isFinite(Number(c.pm10)) ? +Number(c.pm10).toFixed(1) : null,
        label: band.label,
        color: band.color
      });
    }
    return { step, count: points.length, points };
  });
}

app.get('/api/air-quality', async (req, res) => {
  const sp = readStep(req.query.step, AQ_STEPS, 1.5);
  if (sp.error) return res.status(400).json({ error: sp.error });
  const step = sp.value;
  const w = Number(req.query.west), s = Number(req.query.south);
  const e = Number(req.query.east), n = Number(req.query.north);
  let box = null;
  if ([w, s, e, n].every(Number.isFinite)) {
    if (w >= e || s >= n || s < -90 || n > 90 || w < -180 || e > 180) {
      return res.status(400).json({ error: 'Area peta tidak valid.' });
    }
    box = {
      west: Math.max(BBOX.west, w), south: Math.max(BBOX.south, s),
      east: Math.min(BBOX.east, e), north: Math.min(BBOX.north, n)
    };
    if (box.west >= box.east || box.south >= box.north) {
      return res.json({
        updatedAt: new Date().toISOString(),
        source: 'Open-Meteo Air Quality (CAMS)', step: 0, count: 0, points: [], legend: []
      });
    }
  }
  try {
    const field = await airQualityField(step, box);
    res.set('Cache-Control', 'public, max-age=900');
    res.json({
      updatedAt: new Date().toISOString(),
      source: 'Open-Meteo Air Quality (model CAMS) — skala US AQI',
      legend: AQI_BANDS.map(b => ({
        upto: b.max === Infinity ? null : b.max, label: b.label, color: b.color, advice: b.advice
      })),
      ...field
    });
  } catch (err) {
    console.error('[air-quality]', err.message);
    res.status(502).json({ error: 'Data kualitas udara sedang tidak tersedia.' });
  }
});

// AQI pada satu koordinat (dipakai popup "cek titik").
app.get('/api/air-point', async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Koordinat tidak valid.' });
  }
  try {
    const out = await cached(`ap:${lat.toFixed(2)},${lon.toFixed(2)}`, 30 * 60 * 1000, async () => {
      const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
        + `?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,us_aqi,sulphur_dioxide,carbon_monoxide`;
      const r = await fetchWithTimeout(url, {}, 12000);
      if (!r.ok) throw new Error('aqp_' + r.status);
      const c = (await r.json()).current || {};
      const aqi = Number(c.us_aqi);
      if (!Number.isFinite(aqi)) return null;
      const band = aqiBand(aqi);
      return {
        aqi: Math.round(aqi),
        pm25: Number.isFinite(Number(c.pm2_5)) ? +Number(c.pm2_5).toFixed(1) : null,
        pm10: Number.isFinite(Number(c.pm10)) ? +Number(c.pm10).toFixed(1) : null,
        so2: Number.isFinite(Number(c.sulphur_dioxide)) ? +Number(c.sulphur_dioxide).toFixed(1) : null,
        co: Number.isFinite(Number(c.carbon_monoxide)) ? Math.round(Number(c.carbon_monoxide)) : null,
        label: band.label, color: band.color, advice: band.advice
      };
    });
    res.json({ lat, lon, air: out });
  } catch {
    res.json({ lat, lon, air: null });
  }
});

// Lokasi administratif (desa/kecamatan/kabupaten/provinsi) untuk satu koordinat.
app.get('/api/place', async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Koordinat tidak valid.' });
  }
  try {
    const key = `pl:${lat.toFixed(3)},${lon.toFixed(3)}`;
    const out = await cached(key, 24 * 60 * 60 * 1000, async () => {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}` +
                  `&format=json&zoom=12&accept-language=id`;
      const r = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'SiagaID/1.0 (pemantauan bencana)' }
      }, 10000);
      if (!r.ok) throw new Error('nominatim_' + r.status);
      const j = await r.json();
      const a = j.address || {};
      const pick = (...k) => { for (const x of k) if (a[x]) return String(a[x]).slice(0, 80); return null; };
      return {
        desa: pick('village', 'hamlet', 'suburb', 'neighbourhood'),
        kecamatan: pick('municipality', 'city_district', 'subdistrict'),
        kabupaten: pick('county', 'city', 'regency'),
        provinsi: pick('state', 'region'),
        negara: pick('country')
      };
    });
    res.set('Cache-Control', 'public, max-age=86400');
    res.json({ lat, lon, ...out });
  } catch {
    res.json({ lat, lon, desa: null, kecamatan: null, kabupaten: null, provinsi: provinceOf(lat, lon), negara: null });
  }
});

// Poligon konsesi untuk area peta yang sedang dilihat.
app.get('/api/concessions', async (req, res) => {
  const w = Number(req.query.west), s = Number(req.query.south);
  const e = Number(req.query.east), n = Number(req.query.north);
  if (![w, s, e, n].every(Number.isFinite) || w >= e || s >= n ||
      s < -90 || n > 90 || w < -180 || e > 180) {
    return res.status(400).json({ error: 'Area peta tidak valid.' });
  }
  if ((e - w) > 14 || (n - s) > 14) {
    return res.json({ type: 'FeatureCollection', features: [], tooWide: true });
  }
  try {
    const { concessionsInBbox } = require('./lib/concession');
    const key = `cc:${w.toFixed(2)},${s.toFixed(2)},${e.toFixed(2)},${n.toFixed(2)}`;
    const fc = await cached(key, 60 * 60 * 1000, () => concessionsInBbox(w, s, e, n));
    res.set('Cache-Control', 'public, max-age=1800');
    res.json(fc);
  } catch (err) {
    console.error('[concessions]', err.message);
    res.status(502).json({ error: 'Gagal memuat batas konsesi.' });
  }
});

// Cari pemilik/pemegang izin pada satu koordinat.
app.get('/api/whose-land', async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Koordinat tidak valid.' });
  }
  try {
    const { lookupPoint } = require('./lib/concession');
    const units = await cached(`wl:${lat.toFixed(3)},${lon.toFixed(3)}`, 60 * 60 * 1000,
      () => lookupPoint(lat, lon));
    res.json({ lat, lon, province: provinceOf(lat, lon), units });
  } catch {
    res.status(502).json({ error: 'Pencarian unit lahan gagal.' });
  }
});

app.get('/api/news', async (_req, res) => {
  // Penjadwal menyegarkan berita tiap 10 menit; cache CDN 60 detik sudah
  // cukup meredam lonjakan tanpa membuat artikel baru tertahan lama.
  try { res.set('Cache-Control', 'public, max-age=60'); res.json(await getNews()); }
  catch { res.status(502).json({ ok: false, articles: [], message: 'Umpan berita gagal dimuat.' }); }
});

/* ---------- pencarian & tanya-jawab berbasis data (RAG lokal) ---------- */
app.get('/api/ask', async (req, res) => {
  const raw = String(req.query.q || '').trim();
  if (!raw) return res.status(400).json({ error: 'Pertanyaan tidak boleh kosong.' });
  // Klien membatasi 200 karakter lewat atribut maxlength. Server menolak
  // secara tegas alih-alih diam-diam memotong: memangkas tanpa memberi
  // tahu membuat pengguna menerima jawaban atas pertanyaan yang bukan
  // pertanyaannya, dan menyembunyikan penyalahgunaan dari log.
  if (raw.length > 200) {
    return res.status(400).json({ error: 'Pertanyaan maksimal 200 karakter.' });
  }
  const q = raw;
  try {
    const [overview, attribution, news, volcano, quakes, shelters] = await Promise.all([
      buildOverview().catch(() => ({})),
      buildAttribution().catch(() => ({})),
      getNews().catch(() => ({ articles: [] })),
      scheduler.get('volcano').catch(() => ({})),
      scheduler.get('quake').catch(() => null),
      scheduler.get('shelter').catch(() => null)
    ]);
    const hazard = { quakes, shelters };
    const casualties = summarizeCasualties((news && news.articles) || []);
    const ctx = {
      overview,
      attribution,
      news: (news && news.articles) || [],
      volcano,
      hazard,
      casualties,
      air: { worst: overview && overview.worstAir }
    };
    res.set('Cache-Control', 'no-store');
    res.json(ragAnswer(q, ctx));
  } catch {
    res.status(502).json({ error: 'Pencarian sedang tidak tersedia.' });
  }
});

/* ---------- orkestrasi penyegaran data ---------- */
/**
 * Satu tempat yang menentukan seberapa sering tiap sumber diperbarui.
 * Interval dipilih mengikuti irama penerbitan sumbernya: tidak ada gunanya
 * menarik GFS tiap menit karena NOAA hanya menerbitkannya 6 jam sekali.
 */
const scheduler = new Scheduler();

scheduler
  .register('quake', {
    label: 'Gempa bumi (BMKG)',
    everyMs: 2 * 60 * 1000,
    critical: true,
    run: () => fetchQuakes(fetchWithTimeout)
  })
  .register('tsunami', {
    label: 'Buletin tsunami (NOAA PTWC)',
    everyMs: 10 * 60 * 1000,
    critical: true,
    run: () => fetchTsunamiBulletins(fetchWithTimeout)
  })
  .register('news', {
    label: 'Berita (Google Berita)',
    everyMs: 10 * 60 * 1000,
    run: () => googleNews().catch(() => gdeltNews())
  })
  .register('hotspots', {
    label: 'Titik api (NASA FIRMS)',
    everyMs: 10 * 60 * 1000,
    critical: true,
    run: () => getHotspotsRaw()
  })
  .register('shelter', {
    label: 'Pengungsi (BNPB)',
    everyMs: 30 * 60 * 1000,
    run: () => fetchShelters(fetchWithTimeout)
  })
  .register('volcano', {
    label: 'Gunung api & sebaran abu',
    everyMs: 30 * 60 * 1000,
    critical: true,
    run: () => volcanicAsh(fetchWithTimeout, pvmbgStatus, eruptionReports)
  })
  .register('pvmbg', {
    label: 'Status resmi PVMBG (MAGMA)',
    everyMs: 3 * 60 * 60 * 1000,
    run: () => fetchPvmbgStatus(fetchWithTimeout)
  })
  .register('eruption', {
    // Laporan pos pengamatan adalah satu-satunya bukti resmi bahwa sebuah
    // gunung benar-benar meletus, dan menentukan apakah sebaran abu digambar.
    // Rentetan erupsi bisa dimulai kapan saja, jadi intervalnya rapat.
    label: 'Laporan letusan pos pengamatan',
    everyMs: 10 * 60 * 1000,
    critical: true,
    run: () => fetchEruptions(fetchWithTimeout)
  });

/**
 * Penyegaran terjadwal.
 *
 * Vercel Hobby membatasi cron bawaan ke sekali sehari, jadi jadwal
 * sesungguhnya dijalankan penjadwal luar (GitHub Actions) yang memanggil
 * endpoint ini. Dilindungi CRON_SECRET bila variabel itu dipasang.
 */
app.get('/api/cron', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const hdr = String(req.get('authorization') || '');
    const key = String(req.query.key || '');
    if (hdr !== 'Bearer ' + secret && key !== secret) {
      return res.status(401).json({ error: 'Tidak diizinkan.' });
    }
  }
  try {
    // Batas fungsi Vercel 60 detik; sisakan ruang untuk menyusun balasan
    // agar cron tidak pernah dibunuh di tengah jalan dan terbaca "gagal".
    const r = await scheduler.tick({ force: req.query.force === '1', budgetMs: 45000 });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, ...r });
  } catch {
    res.status(500).json({ error: 'Penyegaran gagal.' });
  }
});

/**
 * Angka korban yang dilaporkan MEDIA (bukan BNPB).
 * Dipisahkan dari /api/hazard supaya asal-usul angka tidak tercampur:
 * hazard = data resmi, casualties = kutipan berita yang wajib diverifikasi.
 */
app.get('/api/casualties', async (_req, res) => {
  try {
    const news = await getNews();
    const arts = (news && news.articles) || [];
    const out = summarizeCasualties(arts);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ updatedAt: new Date().toISOString(), ...out });
  } catch {
    res.status(502).json({ error: 'Ringkasan korban tidak tersedia.' });
  }
});

/** Status tiap sumber data — dipakai panel "Status data" di antarmuka. */
app.get('/api/status', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(scheduler.status());
});

/* ---------- gempa, tsunami & pengungsi ---------- */
// Gempa diperbarui sangat sering, jadi cache-nya pendek (2 menit).
app.get('/api/hazard', async (_req, res) => {
  try {
    const [quakes, tsunami, shelters] = await Promise.all([
      scheduler.get('quake').catch(() => null),
      scheduler.get('tsunami').catch(() => null),
      scheduler.get('shelter').catch(() => null)
    ]);
    if (!quakes && !tsunami && !shelters) {
      return res.status(502).json({ error: 'Data kebencanaan tidak tersedia.' });
    }
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ updatedAt: new Date().toISOString(), quakes, tsunami, shelters });
  } catch {
    res.status(502).json({ error: 'Data kebencanaan tidak tersedia.' });
  }
});

/* ---------- gunung api & sebaran abu vulkanik ---------- */
// Hasil sukses terakhir; dipakai bila sumber hulu (MAGMA/GVP) sedang gagal
// agar peta tidak tiba-tiba kosong.
let ashLast = null;

/**
 * Status resmi PVMBG dengan cache sendiri (3 jam).
 * MAGMA butuh ~22 detik, hampir seluruh anggaran waktu fungsi serverless
 * (30 detik). Dengan cache terpisah dan berumur panjang, biaya itu hanya
 * dibayar sesekali, bukan tiap kali data gunung dibangun ulang.
 */
function pvmbgStatus() {
  return scheduler.get('pvmbg');
}

/** Laporan letusan pos pengamatan, lewat cache penjadwal. */
function eruptionReports() {
  return scheduler.get('eruption');
}
app.get('/api/volcano-ash', async (_req, res) => {
  try {
    const d = await scheduler.get('volcano');
    if (d && d.activeCount) ashLast = d;
    res.set('Cache-Control', 'public, max-age=900');
    res.json(d);
  } catch {
    if (ashLast) {
      res.set('Cache-Control', 'no-store');
      return res.json({ ...ashLast, stale: true });
    }
    res.status(502).json({ error: 'Data gunung api gagal dimuat.' });
  }
});

/**
 * Laporan letusan mentah dari pos pengamatan gunung api.
 *
 * Dipisah dari /api/volcano-ash supaya panel kejadian bisa menampilkan
 * rentetan letusan (waktu, tinggi kolom, nama petugas) tanpa harus memuat
 * seluruh geometri sebaran abu.
 */
app.get('/api/eruptions', async (_req, res) => {
  try {
    const d = await scheduler.get('eruption');
    res.set('Cache-Control', 'public, max-age=300');
    res.json(d);
  } catch {
    res.status(502).json({ error: 'Laporan letusan gagal dimuat.' });
  }
});

// Gas SO2 di sekitar gunung yang sedang erupsi.
// SO2 adalah indikator magma bergerak naik, dan menyebar terpisah dari abu.
// Ambang SO2 permukaan (ug/m3). WHO: rata-rata 24 jam sebaiknya <= 40 ug/m3.
function so2Band(v) {
  if (!Number.isFinite(v)) return { label: 'tidak ada data', color: '#64748b', note: 'Model CAMS belum memberi nilai untuk titik ini.' };
  if (v < 40) return { label: 'normal', color: '#22c55e', note: 'Di bawah acuan WHO (40 ug/m3 rata-rata 24 jam).' };
  if (v < 120) return { label: 'meningkat', color: '#facc15', note: 'Di atas acuan WHO. Penderita asma sebaiknya waspada.' };
  if (v < 350) return { label: 'tinggi', color: '#fb923c', note: 'Bisa memicu iritasi mata dan saluran napas.' };
  return { label: 'sangat tinggi', color: '#ef4444', note: 'Hindari aktivitas luar ruang di sekitar kawah.' };
}

app.get('/api/volcano-so2', async (_req, res) => {
  try {
    const out = await cached('volcano-so2', 30 * 60 * 1000, async () => {
      const d = await scheduler.get('volcano');
      // Open-Meteo menghitung tiap koordinat sebagai satu permintaan, dan
      // kuota hariannya terbatas. Prioritaskan gunung yang benar-benar
      // dilaporkan meletus pos pengamatan; sisanya baru yang berstatus
      // Siaga/Awas, karena SO2 juga bisa naik sebelum erupsi.
      const all = d.active || [];
      const act = [
        ...all.filter(v => v.eruption),
        ...all.filter(v => !v.eruption && v.official && v.official.level >= 3)
      ].slice(0, 6);
      if (!act.length) return { volcanoes: [] };
      const lats = act.map(v => v.lat).join(',');
      const lons = act.map(v => v.lon).join(',');
      const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
        + `?latitude=${lats}&longitude=${lons}&current=sulphur_dioxide,pm2_5,us_aqi`;
      const r = await fetchWithTimeout(url, {}, 12000);
      if (!r.ok) throw new Error('so2_' + r.status + (r.status === 429 ? '_limit' : ''));
      let j = await r.json();
      if (!Array.isArray(j)) j = [j];
      return {
        volcanoes: act.map((v, i) => {
          const c = (j[i] && j[i].current) || {};
          const so2 = Number(c.sulphur_dioxide);
          return {
            name: v.name, lat: v.lat, lon: v.lon, elevM: v.elevM,
            // v.activity adalah objek laporan mingguan GVP; ambil periode + ringkasannya.
            activity: v.activity ? {
              period: v.activity.period || null,
              status: v.activity.status || null,
              summary: typeof v.activity.summary === 'string'
                ? (v.activity.summary.length > 260
                    ? v.activity.summary.slice(0, 260).replace(/\s+\S*$/, '') + '…'
                    : v.activity.summary)
                : null
            } : null,
            so2: Number.isFinite(so2) ? +so2.toFixed(1) : null,
            band: so2Band(so2),
            aqi: Number.isFinite(Number(c.us_aqi)) ? Math.round(Number(c.us_aqi)) : null
          };
        })
      };
    });
    res.set('Cache-Control', 'public, max-age=900');
    res.json(out);
  } catch (e) {
    // Kuota harian Open-Meteo bisa habis, dan itu bukan kondisi galat yang
    // perlu ditampilkan sebagai kegagalan sistem. Balas 200 dengan daftar
    // kosong + alasan, supaya panel menyembunyikan diri dengan tenang
    // alih-alih memunculkan 502 di konsol pengguna.
    const quota = /429|limit/i.test(e.message || '');
    console.error('[so2]', e.message);
    res.set('Cache-Control', 'no-store');
    res.json({
      volcanoes: [],
      unavailable: true,
      reason: quota
        ? 'Kuota harian layanan kualitas udara terbuka sudah tercapai. Data akan tersedia lagi besok.'
        : 'Data gas SO2 sedang tidak tersedia dari sumbernya.'
    });
  }
});

/* ---------- citra satelit Himawari (Jepang) ----------
 * Diproksikan lewat server agar CSP klien tetap ketat ('self') dan
 * agar rentang waktu/produk tervalidasi di sisi server.
 */
// Produk citra JMA. 'ash' adalah RGB Ash resmi (split-window) yang memang
// dirancang untuk membedakan abu vulkanik dari awan air/es - inilah lapisan
// yang benar-benar "menangkap" semburan abu. Sebelumnya kunci 'ash' keliru
// menunjuk uap air B08, sehingga abu tidak pernah terlihat.
const HIMAWARI_PRODUCTS = {
  ir: { path: 'B13/TBB', label: 'Inframerah B13 (siang & malam)' },
  vis: { path: 'B03/ALBD', label: 'Warna alami B03 (siang saja)' },
  ash: { path: 'ASH/ETC', label: 'Deteksi abu vulkanik (RGB Ash)' },
  dust: { path: 'SND/ETC', label: 'Debu & aerosol (RGB Dust)' },
  wv: { path: 'B08/TBB', label: 'Uap air B08' }
};

async function himawariLatest() {
  return cached('hima:times', 60 * 1000, async () => {
    const r = await fetchWithTimeout('https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json', {}, 15000);
    if (!r.ok) throw new Error('hima_times_' + r.status);
    const j = await r.json();
    const last = Array.isArray(j) && j.length ? j[j.length - 1] : null;
    if (!last || !/^\d{14}$/.test(String(last.basetime)) || !/^\d{14}$/.test(String(last.validtime))) {
      throw new Error('hima_times_bad');
    }
    return { basetime: String(last.basetime), validtime: String(last.validtime) };
  });
}

app.get('/api/himawari/meta', async (_req, res) => {
  try {
    const t = await himawariLatest();
    const y = t.validtime;
    const iso = `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T${y.slice(8, 10)}:${y.slice(10, 12)}:00Z`;
    res.set('Cache-Control', 'public, max-age=120');
    res.json({
      time: iso,
      products: Object.keys(HIMAWARI_PRODUCTS).map(k => ({ id: k, label: HIMAWARI_PRODUCTS[k].label })),
      maxZoom: 5,
      source: 'Himawari-9 / Japan Meteorological Agency (JMA)'
    });
  } catch {
    res.status(502).json({ error: 'Citra Himawari tidak tersedia.' });
  }
});

app.get('/api/himawari/:product/:z/:x/:y.jpg', async (req, res) => {
  const prod = HIMAWARI_PRODUCTS[req.params.product];
  const z = Number(req.params.z), x = Number(req.params.x), y = Number(req.params.y);
  // JMA menyediakan z=2..5 saja untuk citra full-disk.
  if (!prod || !Number.isInteger(z) || z < 2 || z > 5) return res.status(404).end();
  const n = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) return res.status(404).end();
  try {
    const t = await himawariLatest();
    const url = `https://www.jma.go.jp/bosai/himawari/data/satimg/${t.basetime}/fd/${t.validtime}/${prod.path}/${z}/${x}/${y}.jpg`;
    const r = await fetchWithTimeout(url, {}, 15000);
    if (!r.ok) return res.status(204).end();      // petak kosong: jangan tampilkan error di peta
    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', 'image/jpeg');
    // Petak diberi penanda waktu oleh klien (?t=), jadi isinya tidak pernah
    // berubah untuk URL yang sama dan aman di-cache lama.
    res.set('Cache-Control', 'public, max-age=600');
    res.send(buf);
  } catch {
    res.status(204).end();
  }
});

/* ---------- Sentinel-2 L2A (Copernicus) ---------- */

/**
 * Citra resolusi 10 m untuk memeriksa rupa gunung dari dekat.
 *
 * Berbeda dari Himawari yang menyegar tiap 10 menit, Sentinel-2 melintas
 * tiap 5 hari dan sering tertutup awan. Endpoint meta di bawah melaporkan
 * tanggal perekaman apa adanya supaya pengguna tahu citra yang dilihatnya
 * berasal dari kapan — citra tiga minggu lalu yang disajikan tanpa
 * keterangan lebih menyesatkan daripada tidak ada citra sama sekali.
 */
const SENTINEL_MAX_CLOUD = [10, 20, 30, 50, 80];

/**
 * Diagnostik Sentinel — hanya terbuka bila DEBUG_KEY dipasang dan cocok.
 *
 * Pesan galat hulu sengaja tidak dikirim ke klien biasa: isinya dapat
 * memuat potongan permintaan beserta petunjuk konfigurasi internal.
 * Namun tanpa cara melihatnya sama sekali, kekeliruan seperti salah
 * jalur API hanya tampak sebagai 502 tanpa sebab. Endpoint ini menjadi
 * jalan tengahnya.
 */
app.get('/api/sentinel/diag', async (req, res) => {
  const key = (process.env.DEBUG_KEY || '').trim();
  if (!key || String(req.query.key || '') !== key) return res.status(404).end();

  const out = { configured: sentinel.isConfigured() };
  try {
    await sentinel.getToken(fetchWithTimeout);
    out.token = 'ok';
  } catch (e) {
    out.token = 'gagal: ' + e.message;
    res.set('Cache-Control', 'no-store');
    return res.json(out);
  }
  try {
    const info = await sentinel.sceneInfo(fetchWithTimeout, { lat: -8.108, lon: 112.922 });
    out.catalog = 'ok';
    out.scenes = (info.scenes || []).length;
    out.displayed = info.displayed || null;
  } catch (e) {
    out.catalog = 'gagal: ' + e.message;
  }
  res.set('Cache-Control', 'no-store');
  res.json(out);
});

app.get('/api/sentinel/meta', async (req, res) => {
  if (!sentinel.isConfigured()) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({
      available: false,
      reason: 'Kredensial Copernicus belum dipasang di server.',
      register: 'https://dataspace.copernicus.eu/',
      products: sentinel.productList()
    });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const cloud = SENTINEL_MAX_CLOUD.includes(Number(req.query.cloud))
    ? Number(req.query.cloud) : 30;

  const base = {
    available: true,
    products: sentinel.productList(),
    cloudOptions: SENTINEL_MAX_CLOUD,
    maxZoom: 16,
    windowDays: sentinel.LOOKBACK_DAYS,
    source: 'Sentinel-2 L2A · Copernicus Data Space Ecosystem',
    licence: 'Mengandung data Copernicus Sentinel yang dimodifikasi',
    note: 'Satelit melintas tiap 5 hari dan sering tertutup awan. '
      + 'Ini BUKAN citra langsung; gunakan Himawari untuk pemantauan menit-per-menit.'
  };

  if (!Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.set('Cache-Control', 'public, max-age=600');
    return res.json(base);
  }

  try {
    const info = await cached(`s2:meta:${lat.toFixed(2)},${lon.toFixed(2)}:${cloud}`,
      30 * 60 * 1000,
      () => sentinel.sceneInfo(fetchWithTimeout, { lat, lon, maxCloud: cloud }));
    res.set('Cache-Control', 'public, max-age=1800');
    res.json({ ...base, ...info });
  } catch (e) {
    console.error('[sentinel:meta]', e.message);
    res.set('Cache-Control', 'no-store');
    res.status(502).json({ ...base, error: 'Metadata citra sedang tidak tersedia.' });
  }
});

app.get('/api/sentinel/:product/:z/:x/:y.jpg', async (req, res) => {
  // Validasi dijalankan lebih dulu, sebelum pemeriksaan kredensial.
  // Kalau urutannya dibalik, permintaan cacat ikut dijawab 204 sehingga
  // kekeliruan pada klien tidak pernah terlihat saat pengembangan.
  const prod = req.params.product;
  if (!sentinel.PRODUCTS[prod]) return res.status(404).end();

  const z = Number(req.params.z), x = Number(req.params.x), y = Number(req.params.y);
  // Di bawah zoom 8 satu petak mencakup ribuan kilometer; memintanya dari
  // Process API memboroskan kuota tanpa menambah informasi karena Himawari
  // sudah melayani tampilan seluas itu. Batas atas 16 mengikuti resolusi
  // asli 10 m — memperbesar lebih jauh hanya memperbesar piksel.
  if (!Number.isInteger(z) || z < 8 || z > 16) return res.status(404).end();
  const n = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y)
    || x < 0 || y < 0 || x >= n || y >= n) return res.status(404).end();

  const cloud = SENTINEL_MAX_CLOUD.includes(Number(req.query.cloud))
    ? Number(req.query.cloud) : 30;

  // Belum dikonfigurasi: 204 supaya peta dasar tetap terlihat, bukan
  // kotak error bertebaran di seluruh layar.
  if (!sentinel.isConfigured()) return res.status(204).end();

  try {
    const key = `s2:${prod}:${z}/${x}/${y}:${cloud}`;
    // Citra Sentinel untuk satu petak praktis tidak berubah selama
    // berhari-hari, jadi di-cache lama untuk menghemat kuota.
    const buf = await cached(key, 6 * 60 * 60 * 1000,
      () => sentinel.fetchTile(fetchWithTimeout, { product: prod, z, x, y, maxCloud: cloud }));

    // Tidak ada adegan bebas awan di petak ini — biarkan peta dasar terlihat.
    if (!buf) { res.set('Cache-Control', 'public, max-age=3600'); return res.status(204).end(); }

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=21600');
    res.send(buf);
  } catch (e) {
    console.error('[sentinel:tile]', e.message);
    res.status(204).end();
  }
});

/**
 * Versi aset: hash isi app.js/app.css/wind-particles.js.
 * Ditempelkan ke URL aset di index.html sehingga setiap penerapan baru
 * menghasilkan URL baru — peramban pengguna tidak akan lagi memakai
 * berkas lama dari cache tanpa perlu hard-refresh manual.
 */
const ASSET_FILES = ['app.js', 'app.css', 'wind-particles.js'];
let assetVersion = null;

function getAssetVersion() {
  if (assetVersion) return assetVersion;
  const h = crypto.createHash('sha1');
  for (const f of ASSET_FILES) {
    try { h.update(fs.readFileSync(path.join(__dirname, 'public', f))); }
    catch { /* berkas opsional */ }
  }
  assetVersion = h.digest('hex').slice(0, 10);
  return assetVersion;
}

let indexCache = null;

function renderIndex() {
  if (indexCache) return indexCache;
  const v = getAssetVersion();
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
    .replace(/(href|src)="\/(app\.css|app\.js|wind-particles\.js)"/g,
      (_m, attr, file) => `${attr}="/${file}?v=${v}"`);
  indexCache = html;
  return html;
}

function sendIndex(res, status = 200) {
  res.status(status);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.send(renderIndex());
}

app.get('/', (_req, res) => sendIndex(res));

// index.html tidak boleh di-cache: berkas inilah yang menunjuk versi aset,
// sehingga peramban wajib memeriksanya ulang setiap kunjungan. Aset lain
// aman di-cache lama karena URL-nya sudah bertanda versi (?v=ASSET_VERSION).
/**
 * Situs kepentingan publik seharusnya dapat ditemukan mesin pencari.
 * Endpoint API dikecualikan supaya perayap tidak menghabiskan kuota
 * sumber pihak ketiga hanya untuk mengindeks JSON.
 */
app.get('/robots.txt', (req, res) => {
  const host = (req.get('x-forwarded-host') || req.get('host') || 'firewatch-id.vercel.app');
  const proto = (req.get('x-forwarded-proto') || 'https');
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('text/plain').send(
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /api/\n' +
    '\n' +
    `Sitemap: ${proto}://${host}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const host = (req.get('x-forwarded-host') || req.get('host') || 'firewatch-id.vercel.app');
  const proto = (req.get('x-forwarded-proto') || 'https');
  const today = new Date().toISOString().slice(0, 10);
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url>\n' +
    `    <loc>${proto}://${host}/</loc>\n` +
    `    <lastmod>${today}</lastmod>\n` +
    '    <changefreq>hourly</changefreq>\n' +
    '    <priority>1.0</priority>\n' +
    '  </url>\n' +
    '</urlset>\n'
  );
});

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  // Permintaan berkas (punya ekstensi) dijawab ringkas. Sebelumnya setiap
  // probe .php atau .env memperoleh seluruh dokumen 30 KB; itu pemborosan
  // pita untuk pemindai dan perayap.
  if (/\.[a-z0-9]{2,5}$/i.test(req.path)) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(404).type('text/plain').send('404 Tidak ditemukan.\n');
  }
  // Dokumen penuh hanya dikirim kepada peramban yang memang sedang
  // menavigasi; aplikasi ini satu halaman, jadi rute tak dikenal perlu
  // tetap memuatnya agar riwayat peramban berfungsi. Perayap, pemindai,
  // dan pemanggil API memperoleh balasan ringkas.
  const wantsHtml = String(req.get('accept') || '').indexOf('text/html') !== -1;
  if (!wantsHtml) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(404).type('text/plain').send('404 Tidak ditemukan.\n');
  }
  sendIndex(res, 404);
});
// jangan bocorkan stack trace
app.use((err, _req, res, _next) => { console.error('[err]', err && err.message); res.status(500).json({ error: 'Terjadi kesalahan pada server.' }); });

// Di Vercel modul ini dipakai sebagai serverless function (lihat api/index.js),
// sehingga server hanya boleh listen saat dijalankan langsung: `node server.js`.
if (require.main === module) {
  // Hanya pada server berkelanjutan timer internal dapat diandalkan.
  // Di serverless proses mati di antara permintaan, sehingga penjadwalan
  // diserahkan ke /api/cron yang dipanggil penjadwal luar.
  scheduler.start();
  app.listen(PORT, '0.0.0.0', () =>
    console.log(`SIAGA ID berjalan di :${PORT} (FIRMS: ${FIRMS_MAP_KEY ? 'MAP_KEY' : 'arsip terbuka'})`));
}

module.exports = app;
