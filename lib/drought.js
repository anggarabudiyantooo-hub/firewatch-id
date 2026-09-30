'use strict';
const CONFIG = require('./config');
/**
 * Kekeringan dan status El Niño.
 *
 * Dua hal berbeda yang sengaja disatukan di sini karena saling
 * menjelaskan:
 *
 *   1. ONI (Oceanic Niño Index) dari NOAA CPC — indikator resmi apakah
 *      El Niño sedang berlangsung. Ini kondisi samudra Pasifik, bukan
 *      keadaan Indonesia.
 *   2. Curah hujan nyata per provinsi dari arsip Open-Meteo — keadaan
 *      yang benar-benar dialami di darat.
 *
 * Keduanya harus dibaca bersama, dan perbedaannya penting. El Niño
 * MENINGKATKAN PELUANG kemarau panjang di Indonesia, tetapi tidak
 * menentukannya: ada wilayah yang tetap basah saat El Niño kuat, dan
 * ada kekeringan yang terjadi tanpa El Niño sama sekali. Menyajikan
 * angka ONI saja lalu menyebutnya "kekeringan Indonesia" adalah
 * lompatan kesimpulan yang tidak dibenarkan data.
 *
 * Karena itu status kekeringan tiap provinsi dihitung dari curah hujan
 * yang benar-benar terukur, dan ONI ditampilkan terpisah sebagai
 * konteks iklim.
 *
 * Seluruh sumber terbuka dan tanpa kunci API.
 */

const ONI_URL = CONFIG.UPSTREAM_URLS.noaa.cpc;
const ARCHIVE_URL = CONFIG.UPSTREAM_URLS.openMeteo.archive;

/** Jendela pengamatan curah hujan, dalam hari. */
const WINDOW_DAYS = 90;

/**
 * Ambang hari kering beruntun (HTH — Hari Tanpa Hujan).
 *
 * Mengikuti istilah yang dipakai BMKG dalam buletin kekeringannya.
 * Sebuah hari disebut kering bila hujannya di bawah 1 mm; itu batas
 * lazim karena hujan di bawah itu menguap sebelum meresap.
 */
const HTH_BANDS = [
  { min: 61, label: 'Kekeringan ekstrem', level: 4, color: '#7f1d1d' },
  { min: 31, label: 'Kekeringan parah', level: 3, color: '#ef4444' },
  { min: 21, label: 'Kekeringan sedang', level: 2, color: '#f97316' },
  { min: 11, label: 'Waspada kering', level: 1, color: '#eab308' },
  { min: 0, label: 'Normal', level: 0, color: '#22c55e' }
];

function hthBand(days) {
  for (const b of HTH_BANDS) if (days >= b.min) return b;
  return HTH_BANDS[HTH_BANDS.length - 1];
}

/** Penafsiran resmi NOAA atas nilai ONI. */
function oniPhase(v) {
  if (v >= 2.0) return { phase: 'El Niño sangat kuat', kind: 'elnino', strength: 'sangat kuat' };
  if (v >= 1.5) return { phase: 'El Niño kuat', kind: 'elnino', strength: 'kuat' };
  if (v >= 1.0) return { phase: 'El Niño sedang', kind: 'elnino', strength: 'sedang' };
  if (v >= 0.5) return { phase: 'El Niño lemah', kind: 'elnino', strength: 'lemah' };
  if (v <= -1.5) return { phase: 'La Niña kuat', kind: 'lanina', strength: 'kuat' };
  if (v <= -1.0) return { phase: 'La Niña sedang', kind: 'lanina', strength: 'sedang' };
  if (v <= -0.5) return { phase: 'La Niña lemah', kind: 'lanina', strength: 'lemah' };
  return { phase: 'Netral', kind: 'netral', strength: null };
}

/**
 * Indeks ONI terbaru dari NOAA Climate Prediction Center.
 *
 * Berkasnya teks berkolom tetap: SEAS YR TOTAL ANOM. Nilai ANOM itulah
 * ONI — rata-rata bergerak tiga bulan anomali suhu muka laut Niño 3.4.
 */
async function fetchOni(fetchFn) {
  const r = await fetchFn(ONI_URL, {}, 20000);
  if (!r.ok) throw new Error('oni_' + r.status);
  const text = await r.text();

  const rows = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^([A-Z]{3})\s+(\d{4})\s+([\d.-]+)\s+([\d.-]+)$/);
    if (!m) continue;
    const anom = Number(m[4]);
    if (!Number.isFinite(anom)) continue;
    rows.push({ season: m[1], year: Number(m[2]), sst: Number(m[3]), oni: anom });
  }
  if (!rows.length) throw new Error('oni_kosong');

  const latest = rows[rows.length - 1];
  const info = oniPhase(latest.oni);

  // Tiga musim terakhir memperlihatkan arah pergerakannya — menguat atau
  // mereda — yang lebih berguna daripada satu angka lepas.
  const recent = rows.slice(-6).map(x => ({ season: x.season, year: x.year, oni: x.oni }));
  const prev = rows.length > 1 ? rows[rows.length - 2].oni : null;

  return {
    oni: latest.oni,
    season: latest.season,
    year: latest.year,
    ...info,
    trend: prev === null ? null : (latest.oni > prev ? 'menguat' : latest.oni < prev ? 'mereda' : 'tetap'),
    recent,
    source: 'NOAA Climate Prediction Center — Oceanic Niño Index',
    sourceUrl: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php'
  };
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/**
 * Curah hujan per provinsi.
 *
 * Open-Meteo menerima banyak koordinat dalam satu permintaan, sehingga
 * 38 provinsi cukup satu panggilan — penting karena arsip ini dipanggil
 * dari fungsi serverless yang berbatas waktu.
 *
 * Arsip berbasis reanalisis, biasanya tertinggal beberapa hari dari
 * hari ini. Itu wajar untuk memantau kekeringan yang berkembang dalam
 * hitungan minggu, tetapi tanggal data terakhir tetap dilaporkan supaya
 * tidak disangka pengukuran hari ini.
 */
async function fetchRainfall(fetchFn, sites) {
  if (!sites || !sites.length) return { provinces: [] };

  const lats = sites.map(s => s.lat).join(',');
  const lons = sites.map(s => s.lon).join(',');
  const url = `${ARCHIVE_URL}?latitude=${lats}&longitude=${lons}`
    + `&start_date=${isoDaysAgo(WINDOW_DAYS)}&end_date=${isoDaysAgo(1)}`
    + '&daily=precipitation_sum&timezone=UTC';

  const r = await fetchFn(url, {}, 30000);
  if (!r.ok) throw new Error('archive_' + r.status);
  const j = await r.json();
  const list = Array.isArray(j) ? j : [j];

  const provinces = [];
  let lastDate = null;

  for (let i = 0; i < sites.length && i < list.length; i++) {
    const loc = list[i];
    const daily = loc && loc.daily;
    if (!daily || !Array.isArray(daily.precipitation_sum)) continue;

    const times = daily.time || [];
    const mm = daily.precipitation_sum.map(v => (v === null || v === undefined ? 0 : v));
    if (!mm.length) continue;
    if (times.length) lastDate = times[times.length - 1];

    // Hari tanpa hujan beruntun, dihitung mundur dari data terakhir.
    let hth = 0;
    for (let k = mm.length - 1; k >= 0; k--) {
      if (mm[k] < 1) hth++; else break;
    }

    const total90 = mm.reduce((a, b) => a + b, 0);
    const total30 = mm.slice(-30).reduce((a, b) => a + b, 0);
    const band = hthBand(hth);

    provinces.push({
      province: sites[i].prov,
      city: sites[i].name,
      lat: sites[i].lat,
      lon: sites[i].lon,
      population: sites[i].pop || 0,
      dryDays: hth,
      rain90mm: +total90.toFixed(1),
      rain30mm: +total30.toFixed(1),
      level: band.level,
      label: band.label,
      color: band.color
    });
  }

  // Paling kering lebih dulu; pada jumlah hari kering yang sama, yang
  // curah hujannya lebih rendah didahulukan.
  provinces.sort((a, b) => b.dryDays - a.dryDays || a.rain30mm - b.rain30mm);

  return {
    provinces,
    windowDays: WINDOW_DAYS,
    lastDate,
    source: 'Open-Meteo Archive (reanalisis ERA5)',
    sourceUrl: 'https://open-meteo.com/'
  };
}

/**
 * Ringkasan gabungan.
 *
 * Kegagalan salah satu sumber tidak menjatuhkan keduanya: ONI dan curah
 * hujan berdiri sendiri, dan yang berhasil tetap berguna.
 */
async function fetchDrought(fetchFn, sites) {
  const [oniRes, rainRes] = await Promise.all([
    fetchOni(fetchFn).catch(e => ({ error: e.message })),
    fetchRainfall(fetchFn, sites).catch(e => ({ error: e.message, provinces: [] }))
  ]);

  const provs = rainRes.provinces || [];
  const counts = { 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
  for (const p of provs) counts[p.level]++;

  const affected = provs.filter(p => p.level >= 2);

  return {
    enso: oniRes.error ? null : oniRes,
    ensoError: oniRes.error || null,
    provinces: provs,
    counts,
    affectedCount: affected.length,
    worst: provs[0] || null,
    windowDays: rainRes.windowDays || WINDOW_DAYS,
    lastDate: rainRes.lastDate || null,
    rainError: rainRes.error || null,
    // Dinyatakan eksplisit supaya tidak ada yang menyimpulkan sendiri
    // bahwa angka ONI berarti Indonesia sedang kering.
    note: 'El Niño meningkatkan peluang kemarau panjang di Indonesia, '
      + 'tetapi tidak menentukannya. Status tiap provinsi di bawah dihitung '
      + 'dari curah hujan yang benar-benar terukur, bukan diturunkan dari indeks ONI.',
    sources: [
      'NOAA CPC — Oceanic Niño Index',
      'Open-Meteo Archive — curah hujan harian'
    ]
  };
}

module.exports = {
  fetchDrought, fetchOni, fetchRainfall,
  oniPhase, hthBand, HTH_BANDS, WINDOW_DAYS
};
