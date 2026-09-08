'use strict';
/**
 * Titik api VIIRS dari arsip terbuka NASA FIRMS.
 *
 * Berbeda dari endpoint /api/area/csv yang menuntut MAP_KEY, berkas
 * "active_fire" di bawah ini dipublikasikan bebas dan diperbarui tiap
 * beberapa jam. Artinya aplikasi menampilkan data satelit sungguhan
 * bahkan ketika pengguna belum memasang kunci apa pun.
 *
 * Tiga satelit digabung agar liputan harian lebih rapat:
 *   Suomi-NPP, NOAA-20 (J1), NOAA-21 (J2).
 *
 * Wilayah yang memotong Indonesia: SouthEast_Asia dan Australia_NewZealand.
 */

const SATS = [
  { dir: 'suomi-npp-viirs-c2', pre: 'SUOMI_VIIRS_C2', label: 'Suomi-NPP' },
  { dir: 'noaa-20-viirs-c2', pre: 'J1_VIIRS_C2', label: 'NOAA-20' },
  { dir: 'noaa-21-viirs-c2', pre: 'J2_VIIRS_C2', label: 'NOAA-21' }
];
const REGIONS = ['SouthEast_Asia', 'Australia_NewZealand'];

/** FIRMS memakai kata untuk keyakinan VIIRS; peta ke angka agar seragam. */
function confToNumber(c) {
  const v = String(c || '').trim().toLowerCase();
  if (v === 'h' || v === 'high') return 90;
  if (v === 'n' || v === 'nominal') return 65;
  if (v === 'l' || v === 'low') return 30;
  const n = Number(v);
  return Number.isFinite(n) ? n : 50;
}

/**
 * Ubah acq_date + acq_time FIRMS menjadi ISO 8601 UTC.
 *
 * FIRMS menyimpan jam sebagai bilangan HHMM tanpa titik dua ("533" =
 * 05:33). Bentuk mentah "2026-09-06 0533" tidak dapat di-parse
 * `new Date()` secara andal lintas peramban, sehingga setiap
 * perhitungan umur diam-diam menghasilkan Invalid Date.
 */
function toIsoUtc(date, timeHHMM) {
  const t = String(timeHHMM || '').padStart(4, '0');
  const iso = `${date}T${t.slice(0, 2)}:${t.slice(2, 4)}:00Z`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

function parseCsv(text, bbox, satLabel, out, seen) {
  const lines = text.split('\n');
  if (lines.length < 2) return;
  const head = lines[0].split(',').map(h => h.trim());
  const idx = {};
  head.forEach((h, i) => { idx[h] = i; });
  const need = ['latitude', 'longitude', 'acq_date', 'acq_time'];
  if (need.some(k => idx[k] === undefined)) return;

  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const c = l.split(',');
    const lat = Number(c[idx.latitude]);
    const lon = Number(c[idx.longitude]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lon < bbox.west || lon > bbox.east || lat < bbox.south || lat > bbox.north) continue;

    const date = (c[idx.acq_date] || '').trim();
    const time = (c[idx.acq_time] || '').trim().padStart(4, '0');
    // Titik yang sama bisa muncul di dua berkas wilayah yang bertampalan.
    const key = lat.toFixed(4) + ',' + lon.toFixed(4) + ',' + date + time;
    if (seen.has(key)) continue;
    seen.add(key);

    const acqIso = toIsoUtc(date, time);
    if (!acqIso) continue;

    out.push({
      lat: +lat.toFixed(4),
      lon: +lon.toFixed(4),
      frp: idx.frp !== undefined ? +(Number(c[idx.frp]) || 0).toFixed(1) : 0,
      confidence: confToNumber(idx.confidence !== undefined ? c[idx.confidence] : null),
      acq: acqIso,
      acqRaw: `${date} ${time}`,
      satellite: satLabel,
      daynight: idx.daynight !== undefined ? (c[idx.daynight] || '').trim() : ''
    });
  }
}

/**
 * @param {function} fetchFn fetch berbatas waktu
 * @param {object} bbox {west,south,east,north}
 * @returns {{hotspots:Array, satellites:string[], files:number}}
 */
/**
 * Jendela waktu yang dijanjikan ke pengguna, dalam jam.
 *
 * Berkas NASA bernama "_24h" TIDAK berisi tepat 24 jam terakhir: berkas
 * disusun ulang secara berkala, sehingga pengambilan nyata pada
 * 8 Sep 2026 memuat titik berumur hingga 50 jam dan 69% di antaranya
 * lebih tua dari 24 jam. Karena seluruh antarmuka menjanjikan
 * "24 jam", penyaringan dilakukan sendiri di sini alih-alih memercayai
 * nama berkas.
 */
const WINDOW_HOURS = 24;

async function openHotspots(fetchFn, bbox) {
  const jobs = [];
  for (const s of SATS) {
    for (const r of REGIONS) {
      const url = `https://firms.modaps.eosdis.nasa.gov/data/active_fire/${s.dir}/csv/${s.pre}_${r}_24h.csv`;
      jobs.push(
        fetchFn(url, {}, 25000)
          .then(res => (res.ok ? res.text() : null))
          .then(t => ({ text: t, label: s.label }))
          .catch(() => ({ text: null, label: s.label }))
      );
    }
  }
  const results = await Promise.all(jobs);
  const out = [];
  const seen = new Set();
  const sats = new Set();
  let files = 0;
  for (const r of results) {
    if (!r.text) continue;
    files++;
    sats.add(r.label);
    parseCsv(r.text, bbox, r.label, out, seen);
  }
  if (!files) throw new Error('firms_terbuka_tidak_tersedia');

  // Saring tegas ke jendela yang dijanjikan. Titik yang sudah padam dua
  // hari lalu tidak boleh ikut membentuk klaster, pluma asap, maupun
  // hitungan warga terpapar.
  const cutoff = Date.now() - WINDOW_HOURS * 3600 * 1000;
  const fresh = [];
  let oldestMs = null;
  let newestMs = null;
  for (const h of out) {
    const ms = Date.parse(h.acq);
    if (!Number.isFinite(ms) || ms < cutoff) continue;
    if (oldestMs === null || ms < oldestMs) oldestMs = ms;
    if (newestMs === null || ms > newestMs) newestMs = ms;
    fresh.push(h);
  }

  fresh.sort((a, b) => b.frp - a.frp);
  return {
    hotspots: fresh,
    satellites: [...sats],
    files,
    windowHours: WINDOW_HOURS,
    // Dilaporkan apa adanya supaya antarmuka dapat menjelaskan keadaan
    // ketika arsip NASA sedang tertinggal, bukan menyajikan nol diam-diam.
    fetched: out.length,
    filteredOut: out.length - fresh.length,
    oldestAcq: oldestMs ? new Date(oldestMs).toISOString() : null,
    newestAcq: newestMs ? new Date(newestMs).toISOString() : null,
    dataAgeHours: oldestMs ? +((Date.now() - oldestMs) / 3600000).toFixed(1) : null
  };
}

module.exports = { openHotspots, toIsoUtc, WINDOW_HOURS };
