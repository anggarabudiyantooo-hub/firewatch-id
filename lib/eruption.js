'use strict';
const CONFIG = require('./config');
/**
 * Laporan letusan dari POS PENGAMATAN GUNUNG API (PGA) PVMBG,
 * halaman "Informasi Letusan" MAGMA Indonesia.
 *
 * KENAPA MODUL INI ADA
 * --------------------
 * Sebelumnya sebaran abu digambar untuk setiap gunung berstatus Siaga (level 3).
 * Itu keliru secara faktual: status Siaga menyatakan TINGKAT KEWASPADAAN, bukan
 * bahwa gunung sedang melontarkan abu. Merapi berstatus Siaga selama bertahun-tahun
 * tanpa erupsi eksplosif, sehingga peta menampilkan kepulan abu dan daftar wilayah
 * terdampak untuk peristiwa yang tidak pernah terjadi.
 *
 * Satu-satunya pernyataan resmi bahwa sebuah gunung BENAR-BENAR meletus adalah
 * laporan petugas pos pantau. Laporan itu juga memuat dua besaran yang selama ini
 * hanya ditebak oleh model: tinggi kolom abu dan arah condongnya, hasil pengamatan
 * visual langsung.
 *
 * Karena itu modul ini menjadi gerbang: tanpa laporan letusan, tidak ada pluma.
 */

const BASE = CONFIG.UPSTREAM_URLS.magma.eruption;

// Berapa lama sebuah letusan dianggap masih relevan untuk digambar di peta.
// Erupsi Ibu/Semeru berlangsung sebagai rentetan singkat berjam-jam; jendela
// 24 jam menangkap rentetan yang sedang berlangsung tanpa menghidupkan kembali
// gunung yang sudah tenang berhari-hari.
const WINDOW_HOURS = 24;

// Halaman pertama memuat ~15 laporan terbaru. Tiga halaman cukup untuk
// menjangkau lebih dari 24 jam bahkan saat sedang ramai erupsi.
const PAGES = 3;

const TZ_OFFSET = { WIB: 7, WITA: 8, WIT: 9 };

const MONTHS = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11
};

// Arah mata angin bahasa Indonesia -> derajat kompas (arah TUJUAN condongnya abu).
const BEARINGS = {
  'utara': 0,
  'timur laut': 45,
  'timur': 90,
  'tenggara': 135,
  'selatan': 180,
  'barat daya': 225,
  'barat': 270,
  'barat laut': 315,
  'utara timur laut': 22.5,
  'timur timur laut': 67.5,
  'timur tenggara': 112.5,
  'selatan tenggara': 157.5,
  'selatan barat daya': 202.5,
  'barat barat daya': 247.5,
  'barat barat laut': 292.5,
  'utara barat laut': 337.5
};

function decode(s) {
  return String(s)
    .replace(/&plusmn;/g, '±').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'");
}

function stripTags(s) {
  return decode(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Samakan penamaan dengan katalog GVP/PVMBG ("G. Ili Lewotolok" -> "ililewotolok"). */
function normKey(n) {
  return String(n)
    .toLowerCase()
    .replace(/^(gunung|gn\.?|g\.)\s+/, '')
    .replace(/\b(laki-laki|perempuan)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * "pada hari Senin, 07 September 2026, pukul 21:49 WIT" -> Date (UTC).
 * Zona waktu Indonesia ditulis eksplisit di tiap laporan, jadi tidak boleh
 * diperlakukan sebagai waktu lokal server (Vercel berjalan di UTC).
 */
function parseWhen(text) {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}),?\s*pukul\s*(\d{1,2})[.:](\d{2})\s*(WIB|WITA|WIT)/i);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return null;
  const off = TZ_OFFSET[m[6].toUpperCase()];
  if (off === undefined) return null;
  const ms = Date.UTC(+m[3], mon, +m[1], +m[4] - off, +m[5]);
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Tinggi kolom abu di atas PUNCAK, dalam meter.
 * Laporan menyebut dua angka ("± 700 m di atas puncak (± 2123 m di atas
 * permukaan laut)"); yang dipakai adalah relatif puncak, karena itulah
 * tebal kolom yang sebenarnya.
 */
function parseHeight(text) {
  const m = text.match(/tinggi\s+kolom\s+abu[^.]*?±?\s*([\d.,]+)\s*m\s+di\s+atas\s+puncak/i);
  if (!m) return null;
  const v = Number(String(m[1]).replace(/[.,]/g, ''));
  // Kolom abu di Indonesia berkisar ratusan meter sampai belasan kilometer.
  return Number.isFinite(v) && v > 0 && v <= 20000 ? v : null;
}

/** Arah condong kolom abu hasil pengamatan visual, dalam derajat kompas. */
function parseBearing(text) {
  const m = text.match(/ke\s+arah\s+([a-z\s]+?)(?:\s*[.,]|\s+dengan\b|\s+dan\b|$)/i);
  if (!m) return null;
  const raw = m[1].toLowerCase().replace(/\s+/g, ' ').trim();
  if (BEARINGS[raw] !== undefined) return { deg: BEARINGS[raw], label: raw };
  // Bentuk majemuk tak baku, mis. "barat-laut" atau "barat laut dan utara".
  for (const key of Object.keys(BEARINGS).sort((a, b) => b.length - a.length)) {
    if (raw.startsWith(key)) return { deg: BEARINGS[key], label: key };
  }
  return null;
}

/** Warna/intensitas kolom — penanda kasar seberapa pekat material yang keluar. */
function parseColour(text) {
  const m = text.match(/kolom\s+abu\s+teramati\s+berwarna\s+([a-z\s]+?)\s+dengan\s+intensitas\s+([a-z\s]+?)(?:\s+ke\s+arah|\s*[.,])/i);
  if (!m) return null;
  return { colour: m[1].trim(), intensity: m[2].trim() };
}

function parseAmplitude(text) {
  const m = text.match(/amplitudo\s+maksimum\s+([\d.,]+)\s*mm/i);
  return m ? Number(String(m[1]).replace(',', '.')) : null;
}

function parseDuration(text) {
  const m = text.match(/durasi\s+([\d.,]+)\s*detik/i);
  return m ? Number(String(m[1]).replace(',', '.')) : null;
}

/** Urai satu halaman timeline menjadi daftar laporan. */
function parsePage(html) {
  const out = [];
  const items = String(html).split('class="timeline-item').slice(1);
  for (const chunk of items) {
    const ti = chunk.match(/timeline-title"[^>]*>\s*<a[^>]*>(.*?)<\/a>/s);
    const tx = chunk.match(/timeline-text"[^>]*>(.*?)<\/p>/s);
    if (!ti || !tx) continue;

    const name = stripTags(ti[1]);
    const text = stripTags(tx[1]);
    if (!name || !/erupsi|letusan/i.test(text)) continue;

    const when = parseWhen(text);
    if (!when) continue;

    const author = (chunk.match(/timeline-author"[^>]*>(.*?)<\/p>/s) || [])[1];
    const colour = parseColour(text);
    const bearing = parseBearing(text);

    out.push({
      name,
      key: normKey(name),
      at: when.toISOString(),
      heightM: parseHeight(text),
      bearingDeg: bearing ? bearing.deg : null,
      bearingLabel: bearing ? bearing.label : null,
      colour: colour ? colour.colour : null,
      intensity: colour ? colour.intensity : null,
      amplitudeMm: parseAmplitude(text),
      durationS: parseDuration(text),
      // Kolom abu tidak selalu terlihat (malam hari, tertutup kabut).
      // Bedakan "tidak meletus" dari "meletus tapi tak teramati".
      visualObserved: !/visual\s+letusan\s+tidak\s+teramati/i.test(text),
      observer: author ? stripTags(author).replace(/^Dibuat oleh\s*/i, '') : null,
      text
    });
  }
  return out;
}

let lastGood = null;

/**
 * Ambil laporan letusan terbaru dan ringkas per gunung.
 *
 * @returns {{updatedAt:string, windowHours:number, reports:Array, volcanoes:Array, byKey:Object}}
 */
async function fetchEruptions(fetchFn) {
  // MAGMA membalas 502 bila beberapa halaman diminta serentak dari satu IP,
  // jadi halaman diambil berurutan. Halaman pertama saja sudah cukup untuk
  // mengetahui gunung mana yang meletus hari ini; halaman berikutnya hanya
  // memperlebar jendela, sehingga kegagalannya tidak boleh menggagalkan
  // keseluruhan.
  // MAGMA membalas 502 untuk permintaan berheader minimal (mis. hanya
  // user-agent + accept). Dengan set header peramban yang lengkap, endpoint
  // yang sama konsisten membalas 200 — jadi ini bukan sekadar kosmetik.
  const headers = {
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'id-ID,id;q=0.9,en;q=0.8',
    'accept-encoding': 'gzip, deflate, br',
    'connection': 'keep-alive',
    'upgrade-insecure-requests': '1'
  };

  // MAGMA kerap membalas 502 secara sporadis, terutama bila beberapa halaman
  // diminta serentak dari satu IP. Halaman diambil berurutan, dan halaman
  // pertama — satu-satunya yang wajib berhasil — dicoba beberapa kali.
  // MAGMA sering butuh 20-40 detik untuk membalas halaman ini, jadi batas
  // waktunya longgar. Karena anggaran satu pemanggilan serverless terbatas,
  // seluruh pengambilan dibatasi satu anggaran bersama: halaman pertama
  // (yang wajib) diberi porsi terbesar, halaman berikutnya hanya diambil
  // bila masih ada sisa waktu.
  const started = Date.now();
  const BUDGET_MS = 75000;

  async function grab(url, timeout) {
    try {
      const r = await fetchFn(url, { headers }, timeout);
      if (!r.ok) return '';
      const t = await r.text();
      return t.includes('timeline-item') ? t : '';
    } catch {
      return '';
    }
  }

  const htmls = [];
  let first = await grab(BASE, 40000);
  // Satu percobaan ulang bila balasan pertama gagal/502, selama anggaran cukup.
  if (!first && Date.now() - started < BUDGET_MS - 30000) {
    await new Promise(s => setTimeout(s, 1200));
    first = await grab(BASE, 28000);
  }
  htmls.push(first);

  if (first) {
    for (let p = 2; p <= PAGES; p++) {
      const left = BUDGET_MS - (Date.now() - started);
      if (left < 12000) break;
      htmls.push(await grab(`${BASE}?page=${p}`, Math.min(20000, left)));
    }
  }
  const seen = new Set();
  let reports = [];
  for (const h of htmls) {
    if (!h) continue;
    for (const r of parsePage(h)) {
      const id = `${r.key}|${r.at}`;
      if (seen.has(id)) continue;
      seen.add(id);
      reports.push(r);
    }
  }

  if (!reports.length) {
    // Halaman MAGMA sering 502. Jangan menghapus kondisi terakhir yang diketahui,
    // karena "tidak ada data" akan tersalahartikan sebagai "tidak ada erupsi".
    if (lastGood) return { ...lastGood, stale: true };
    throw new Error('laporan letusan tidak terbaca');
  }

  const cutoff = Date.now() - WINDOW_HOURS * 3600 * 1000;
  reports.sort((a, b) => new Date(b.at) - new Date(a.at));
  const recent = reports.filter(r => new Date(r.at).getTime() >= cutoff);

  // Ringkas per gunung: berapa kali meletus, dan letusan TERTINGGI yang
  // teramati — kolom tertinggi itulah yang menentukan jangkauan sebaran abu.
  const byKey = {};
  for (const r of recent) {
    const cur = byKey[r.key];
    if (!cur) {
      byKey[r.key] = {
        name: r.name, key: r.key, count: 1,
        lastAt: r.at, firstAt: r.at,
        maxHeightM: r.heightM, bearingDeg: r.bearingDeg, bearingLabel: r.bearingLabel,
        colour: r.colour, intensity: r.intensity,
        observer: r.observer, lastText: r.text,
        observedAny: r.visualObserved
      };
      continue;
    }
    cur.count += 1;
    if (new Date(r.at) < new Date(cur.firstAt)) cur.firstAt = r.at;
    cur.observedAny = cur.observedAny || r.visualObserved;
    if (r.heightM && (!cur.maxHeightM || r.heightM > cur.maxHeightM)) {
      cur.maxHeightM = r.heightM;
      // Arah diambil dari letusan tertinggi, bukan yang paling akhir:
      // kolom tertinggi menjelaskan sebaran terjauh.
      if (r.bearingDeg !== null) {
        cur.bearingDeg = r.bearingDeg;
        cur.bearingLabel = r.bearingLabel;
      }
      if (r.colour) { cur.colour = r.colour; cur.intensity = r.intensity; }
    }
    if (cur.bearingDeg === null && r.bearingDeg !== null) {
      cur.bearingDeg = r.bearingDeg;
      cur.bearingLabel = r.bearingLabel;
    }
  }

  const result = {
    updatedAt: new Date().toISOString(),
    windowHours: WINDOW_HOURS,
    total: recent.length,
    reports: recent.slice(0, 60),
    volcanoes: Object.values(byKey).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt)),
    byKey,
    sourceUrl: BASE,
    source: 'Pos Pengamatan Gunung Api (PVMBG) via MAGMA Indonesia'
  };
  lastGood = result;
  return result;
}

module.exports = { fetchEruptions, WINDOW_HOURS, normKey, parsePage, parseWhen, parseHeight, parseBearing };
