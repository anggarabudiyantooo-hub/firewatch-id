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

    out.push({
      lat: +lat.toFixed(4),
      lon: +lon.toFixed(4),
      frp: idx.frp !== undefined ? +(Number(c[idx.frp]) || 0).toFixed(1) : 0,
      confidence: confToNumber(idx.confidence !== undefined ? c[idx.confidence] : null),
      acq: `${date} ${time}`,
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
  out.sort((a, b) => b.frp - a.frp);
  return { hotspots: out, satellites: [...sats], files };
}

module.exports = { openHotspots };
