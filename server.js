'use strict';
/**
 * FireWatch ID - server pemantauan kebakaran hutan & lahan.
 * Semua kunci API dibaca di server saja dan tidak pernah dikirim ke browser.
 */
const fs = require('fs');
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

const REGIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'regions.json'), 'utf8'));
const { attributeHotspots } = require('./lib/concession');
const { volcanicAsh } = require('./lib/volcano');
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
      frameAncestors: ["'self'", '*'],
      formAction: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://server.arcgisonline.com', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"]
    }
  },
  frameguard: false, // izinkan embed preview; pembatasan tetap lewat CSP frame-ancestors
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' }
}));

// rate limit ringan per IP
const hits = new Map();
app.use('/api', (req, res, next) => {
  const ip = req.ip || 'x';
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60000) { rec.n = 0; rec.t = now; }
  rec.n++; hits.set(ip, rec);
  if (hits.size > 5000) hits.clear();
  if (rec.n > 120) return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' });
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
  try { return await fetch(url, { ...opts, signal: ac.signal, headers: { 'User-Agent': 'FireWatchID/1.0', ...(opts.headers || {}) } }); }
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
    out.push({
      lat, lon,
      frp: Math.max(0, Number(iFrp >= 0 ? c[iFrp] : 0) || 0),
      confidence: Math.max(0, Math.min(100, conf)),
      acq: `${iDate >= 0 ? c[iDate] : ''} ${iTime >= 0 ? String(c[iTime]).padStart(4, '0') : ''}`.trim(),
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

// Demo deterministik (harian) di area rawan karhutla
function demoHotspots() {
  const seedBase = Math.floor(Date.now() / 86400000);
  let s = seedBase * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const clusters = [
    { name: 'OKI, Sumsel', lat: -3.35, lon: 105.10, n: 34 },
    { name: 'Pelalawan, Riau', lat: 0.30, lon: 102.10, n: 26 },
    { name: 'Muaro Jambi', lat: -1.55, lon: 103.90, n: 21 },
    { name: 'Pulang Pisau, Kalteng', lat: -2.75, lon: 114.20, n: 30 },
    { name: 'Ketapang, Kalbar', lat: -1.85, lon: 110.20, n: 24 },
    { name: 'Kubu Raya, Kalbar', lat: -0.35, lon: 109.50, n: 14 },
    { name: 'Kotawaringin Timur', lat: -2.45, lon: 112.85, n: 18 },
    { name: 'Merauke, Papua Selatan', lat: -8.20, lon: 140.10, n: 12 },
    { name: 'Sumba Timur, NTT', lat: -9.75, lon: 120.30, n: 9 }
  ];
  const now = Date.now();
  const out = [];
  for (const c of clusters) {
    for (let i = 0; i < c.n; i++) {
      const lat = c.lat + (rnd() - 0.5) * 0.55;
      const lon = c.lon + (rnd() - 0.5) * 0.75;
      const t = new Date(now - rnd() * 20 * 3600 * 1000);
      out.push({
        lat: +lat.toFixed(4), lon: +lon.toFixed(4),
        frp: +(3 + rnd() * 120).toFixed(1),
        confidence: Math.round(40 + rnd() * 60),
        acq: `${t.toISOString().slice(0, 10)} ${String(t.getUTCHours()).padStart(2, '0')}${String(t.getUTCMinutes()).padStart(2, '0')}`,
        satellite: 'DEMO', daynight: rnd() > 0.5 ? 'D' : 'N'
      });
    }
  }
  return out;
}

async function getHotspots() {
  return cached('hotspots', 10 * 60 * 1000, async () => {
    if (FIRMS_MAP_KEY) {
      try {
        const rows = await firmsHotspots();
        return { mode: 'live', source: `NASA FIRMS ${FIRMS_SOURCE}`, days: FIRMS_DAYS, hotspots: rows };
      } catch (e) {
        console.error('[firms]', e.message);
        return { mode: 'demo', source: 'Data contoh (FIRMS tidak tersedia saat ini)', days: 1, hotspots: demoHotspots(), notice: 'Gagal mengambil data FIRMS, menampilkan data contoh.' };
      }
    }
    return { mode: 'demo', source: 'Data contoh (FIRMS MAP_KEY belum diisi)', days: 1, hotspots: demoHotspots() };
  });
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
  const key = `w:${lat.toFixed(1)},${lon.toFixed(1)}`;
  return cached(key, 30 * 60 * 1000, async () => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m,relative_humidity_2m,temperature_2m&wind_speed_unit=ms`;
      const r = await fetchWithTimeout(url, {}, 10000);
      if (!r.ok) throw new Error('meteo_' + r.status);
      const j = await r.json();
      const c = j.current || {};
      return {
        speed: Number(c.wind_speed_10m) || 2,
        from: Number(c.wind_direction_10m) || 90,
        rh: Number(c.relative_humidity_2m) || null,
        temp: Number(c.temperature_2m) || null,
        estimated: false
      };
    } catch {
      return { speed: 3, from: 100, rh: null, temp: null, estimated: true };
    }
  });
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

async function buildPlumes(clusters) {
  const top = clusters.slice(0, 14);
  const winds = await Promise.all(top.map(c => windAt(c.lat, c.lon)));
  return top.map((c, i) => {
    const w = winds[i];
    const bearingTo = (w.from + 180) % 360;                  // arah tujuan asap
    const len = Math.min(320, 18 + Math.sqrt(c.frp) * 6 + w.speed * 12);
    const half = Math.max(12, 34 - w.speed * 2);
    const intensity = Math.min(1, (c.frp / 900) * 0.6 + (c.count / 40) * 0.4);
    return {
      lat: c.lat, lon: c.lon, frp: c.frp, count: c.count,
      wind: w, bearingTo: Math.round(bearingTo), lengthKm: Math.round(len),
      halfAngle: Math.round(half), intensity: +intensity.toFixed(2),
      polygon: plumePolygon(c.lat, c.lon, bearingTo, len, half)
    };
  });
}

// ---------- daerah terdampak ----------
function bearingBetween(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function angDiff(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }

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
      if (s > 0.5) { score += s; causes.push({ km: Math.round(dist), frp: p.frp }); }
    }
    if (score <= 0.5) continue;
    score = Math.min(100, score);
    out.push({
      name: reg.name, prov: reg.prov, lat: reg.lat, lon: reg.lon, population: reg.pop,
      score: +score.toFixed(1),
      level: score >= 66 ? 'Berat' : score >= 33 ? 'Sedang' : 'Ringan',
      nearestKm: Math.min(...causes.map(c => c.km)),
      plumes: causes.length
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
async function googleNews() {
  const q = 'karhutla OR "kebakaran hutan" OR "kebakaran lahan" OR "titik api" OR "kabut asap"';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=id&gl=ID&ceid=ID:id`;
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FireWatchID/1.0)' } }, 15000);
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
    out.push({ title: title.slice(0, 300), url: link, domain: domain.slice(0, 80), seendate: toSeendate(pick('pubDate')) });
  }
  if (!out.length) throw new Error('empty');
  return { ok: true, source: 'Google Berita (agregator media Indonesia)', articles: out.slice(0, 40) };
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
async function getNews() {
  return cached('news', 20 * 60 * 1000, async () => {
    for (const fn of [googleNews, gdeltNews]) {
      try { return await fn(); } catch (e) { console.error('[news]', fn.name, e.message); }
    }
    return {
      ok: false,
      source: 'Umpan berita tidak tersedia',
      message: 'Umpan berita sedang tidak dapat diakses. Coba muat ulang beberapa saat lagi.',
      articles: []
    };
  });
}

// ---------- API ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Dibungkus jadi fungsi agar bisa dipakai ulang oleh mesin pencarian (/api/ask).
async function buildOverview() {
  {
    const { mode, source, days, hotspots, notice } = await getHotspots();
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
    return {
      meta: {
        mode, source, days, notice,
        updatedAt: new Date().toISOString(),
        bbox: BBOX,
        attribution: ['NASA FIRMS', 'Open-Meteo', 'GDELT Project', 'Global Forest Watch', 'Esri']
      },
      stats: {
        hotspots: hotspots.length,
        highConfidence: highConf,
        totalFrp: +totalFrp.toFixed(0),
        clusters: clusters.length,
        impactedRegions: impacted.length,
        peopleExposed: impacted.reduce((s, r) => s + (r.score >= 33 ? r.population : 0), 0)
      },
      hotspots, clusters: clusters.slice(0, 40), plumes, impacted,
      provinceScores: byProvince, provinceRanking, worstAir
    };
  }
}

app.get('/api/overview', async (_req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=120');
    res.json(await buildOverview());
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
async function windField(stepDeg, box) {
  const step = [0.25, 0.5, 1, 1.5, 2, 3].includes(stepDeg) ? stepDeg : 2;
  const b = box || BBOX;
  const key = box
    ? `wf:${step}:${b.west.toFixed(1)},${b.south.toFixed(1)},${b.east.toFixed(1)},${b.north.toFixed(1)}`
    : `wf:${step}`;
  return cached(key, 30 * 60 * 1000, async () => {
    const lats = [], lons = [];
    for (let la = b.south + step / 2; la <= b.north && lats.length < 320; la += step) {
      for (let lo = b.west + step / 2; lo <= b.east && lats.length < 320; lo += step) {
        lats.push(la.toFixed(2)); lons.push(lo.toFixed(2));
      }
    }
    if (!lats.length) return { step, count: 0, points: [] };
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lats.join(',')}&longitude=${lons.join(',')}`
      + '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms';
    const r = await fetchWithTimeout(url, {}, 20000);
    if (!r.ok) throw new Error('windfield_' + r.status);
    const j = await r.json();
    const arr = Array.isArray(j) ? j : [j];
    const points = [];
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const c = p && p.current;
      if (!c) continue;
      const speed = Number(c.wind_speed_10m), from = Number(c.wind_direction_10m);
      if (!Number.isFinite(speed) || !Number.isFinite(from)) continue;
      // Open-Meteo membalas koordinat pusat sel modelnya, bukan titik yang diminta.
      // Untuk animasi partikel kisi harus teratur, jadi pakai koordinat grid asli.
      points.push({
        lat: +Number(lats[i]),
        lon: +Number(lons[i]),
        speed: +speed.toFixed(1),
        from: Math.round(from),               // arah datangnya angin
        to: Math.round((from + 180) % 360)    // arah tujuan (pergerakan asap)
      });
    }
    return { step, count: points.length, points };
  });
}

app.get('/api/wind-field', async (req, res) => {
  const step = Number(req.query.step);
  const w = Number(req.query.west), s = Number(req.query.south);
  const e = Number(req.query.east), n = Number(req.query.north);
  let box = null;
  if ([w, s, e, n].every(Number.isFinite)) {
    if (w >= e || s >= n || s < -90 || n > 90 || w < -180 || e > 180) {
      return res.status(400).json({ error: 'Area peta tidak valid.' });
    }
    // dibatasi ke wilayah pantauan agar tidak memicu permintaan berlebihan
    box = {
      west: Math.max(BBOX.west, w), south: Math.max(BBOX.south, s),
      east: Math.min(BBOX.east, e), north: Math.min(BBOX.north, n)
    };
    // area yang diminta tidak beririsan dengan wilayah pantauan
    if (box.west >= box.east || box.south >= box.north) {
      return res.json({
        updatedAt: new Date().toISOString(),
        source: 'Open-Meteo (angin permukaan 10 m)',
        step: 0, count: 0, points: []
      });
    }
  }
  try {
    const wf = await windField(Number.isFinite(step) ? step : 2, box);
    res.set('Cache-Control', 'public, max-age=900');
    res.json({
      updatedAt: new Date().toISOString(),
      source: 'Open-Meteo (angin permukaan 10 m)',
      ...wf
    });
  } catch (e) {
    console.error('[wind-field]', e.message);
    res.status(502).json({ error: 'Data arah angin sedang tidak tersedia.' });
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
  const step = Number(req.query.step);
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
    const field = await airQualityField(Number.isFinite(step) ? step : 1.5, box);
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
        + `?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,us_aqi`;
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
        headers: { 'User-Agent': 'FireWatchID/1.0 (pemantauan karhutla)' }
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
  try { res.set('Cache-Control', 'public, max-age=300'); res.json(await getNews()); }
  catch { res.status(502).json({ ok: false, articles: [], message: 'Umpan berita gagal dimuat.' }); }
});

/* ---------- pencarian & tanya-jawab berbasis data (RAG lokal) ---------- */
app.get('/api/ask', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (!q) return res.status(400).json({ error: 'Pertanyaan tidak boleh kosong.' });
  try {
    const [overview, attribution, news, volcano] = await Promise.all([
      buildOverview().catch(() => ({})),
      buildAttribution().catch(() => ({})),
      getNews().catch(() => ({ articles: [] })),
      cached('volcano-ash', 30 * 60 * 1000, () => volcanicAsh(fetchWithTimeout)).catch(() => ({}))
    ]);
    const ctx = {
      overview,
      attribution,
      news: (news && news.articles) || [],
      volcano,
      air: { worst: overview && overview.worstAir }
    };
    res.set('Cache-Control', 'no-store');
    res.json(ragAnswer(q, ctx));
  } catch {
    res.status(502).json({ error: 'Pencarian sedang tidak tersedia.' });
  }
});

/* ---------- gunung api & sebaran abu vulkanik ---------- */
app.get('/api/volcano-ash', async (_req, res) => {
  try {
    const d = await cached('volcano-ash', 30 * 60 * 1000, () => volcanicAsh(fetchWithTimeout));
    res.set('Cache-Control', 'public, max-age=900');
    res.json(d);
  } catch {
    res.status(502).json({ error: 'Data gunung api gagal dimuat.' });
  }
});

/* ---------- citra satelit Himawari (Jepang) ----------
 * Diproksikan lewat server agar CSP klien tetap ketat ('self') dan
 * agar rentang waktu/produk tervalidasi di sisi server.
 */
const HIMAWARI_PRODUCTS = {
  ir: { path: 'B13/TBB', label: 'Inframerah B13 (siang & malam)' },
  vis: { path: 'B03/ALBD', label: 'Warna alami B03 (siang saja)' },
  ash: { path: 'B08/TBB', label: 'Uap air B08' }
};

async function himawariLatest() {
  return cached('hima:times', 5 * 60 * 1000, async () => {
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
      maxZoom: 6,
      source: 'Himawari-9 / Japan Meteorological Agency (JMA)'
    });
  } catch {
    res.status(502).json({ error: 'Citra Himawari tidak tersedia.' });
  }
});

app.get('/api/himawari/:product/:z/:x/:y.jpg', async (req, res) => {
  const prod = HIMAWARI_PRODUCTS[req.params.product];
  const z = Number(req.params.z), x = Number(req.params.x), y = Number(req.params.y);
  if (!prod || !Number.isInteger(z) || z < 2 || z > 6) return res.status(404).end();
  const n = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) return res.status(404).end();
  try {
    const t = await himawariLatest();
    const url = `https://www.jma.go.jp/bosai/himawari/data/satimg/${t.basetime}/fd/${t.validtime}/${prod.path}/${z}/${x}/${y}.jpg`;
    const r = await fetchWithTimeout(url, {}, 15000);
    if (!r.ok) return res.status(204).end();      // petak kosong: jangan tampilkan error di peta
    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(buf);
  } catch {
    res.status(204).end();
  }
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m', index: 'index.html' }));
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});
// jangan bocorkan stack trace
app.use((err, _req, res, _next) => { console.error('[err]', err && err.message); res.status(500).json({ error: 'Terjadi kesalahan pada server.' }); });

// Di Vercel modul ini dipakai sebagai serverless function (lihat api/index.js),
// sehingga server hanya boleh listen saat dijalankan langsung: `node server.js`.
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () =>
    console.log(`FireWatch ID berjalan di :${PORT} (mode kunci: ${FIRMS_MAP_KEY ? 'live' : 'demo'})`));
}

module.exports = app;
