'use strict';
/**
 * Ekstraksi angka korban & pengungsi dari judul/ringkasan berita.
 *
 * Ini SELALU merupakan pelaporan media, bukan data resmi BNPB. Karena itu
 * setiap angka yang dikeluarkan modul ini wajib membawa kutipan sumbernya
 * (judul + tautan + penerbit) supaya pembaca bisa memverifikasi sendiri.
 *
 * Pendekatannya sengaja konservatif: lebih baik melewatkan sebuah angka
 * daripada menampilkan angka yang salah pada dasbor kebencanaan.
 */

/** Kata-bilangan Indonesia yang lazim dipakai media. */
const SCALE = {
  ribu: 1e3,
  puluh: 10,
  ratus: 100,
  juta: 1e6
};

const CATEGORIES = [
  {
    id: 'meninggal',
    label: 'Meninggal dunia',
    // "tewas", "meninggal", "korban jiwa", "meninggal dunia"
    words: /(meninggal(?:\s+dunia)?|tewas|korban\s+jiwa|wafat|gugur)/i
  },
  {
    id: 'hilang',
    label: 'Hilang',
    words: /(hilang|belum\s+ditemukan|dinyatakan\s+hilang)/i
  },
  {
    id: 'luka',
    label: 'Luka-luka',
    words: /(luka(?:-luka)?|terluka|cedera|dirawat)/i
  },
  {
    id: 'mengungsi',
    label: 'Mengungsi',
    words: /(mengungsi|pengungsi|diungsikan)/i
  },
  {
    id: 'terdampak',
    label: 'Terdampak',
    words: /(terdampak|terkena\s+dampak|menderita)/i
  }
];

/** Satuan orang — memastikan angka memang merujuk manusia. */
const UNIT = /(orang|jiwa|warga|penduduk|korban|siswa|kepala\s+keluarga|kk)/i;

/**
 * Ubah teks angka menjadi bilangan.
 * Menangani "1.234" (pemisah ribuan Indonesia), "2,5" (desimal), dan
 * "3 ribu" / "1,2 juta".
 */
function toNumber(digits, scaleWord) {
  if (!digits) return null;
  // Titik = pemisah ribuan, koma = desimal (kaidah Indonesia).
  const norm = digits.replace(/\./g, '').replace(',', '.');
  let n = Number(norm);
  if (!Number.isFinite(n)) return null;
  if (scaleWord) {
    const mult = SCALE[scaleWord.toLowerCase()];
    if (mult) n *= mult;
  }
  return Math.round(n);
}

/**
 * Cari angka korban dalam satu potong teks.
 * Pola yang diterima (angka dan kategori harus berdekatan):
 *   "12 orang meninggal", "3.000 warga mengungsi", "korban tewas 25 orang",
 *   "1,2 juta jiwa terdampak"
 */
function extractFromText(text) {
  if (!text) return [];
  const s = String(text).replace(/\s+/g, ' ');
  const out = [];

  for (const cat of CATEGORIES) {
    // Pola A: <angka> [skala] [satuan] ... <kata kategori>
    const reA = new RegExp(
      '(\\d[\\d.,]*)\\s*(ribu|juta|ratus|puluh)?\\s*'
      + '(?:' + UNIT.source + ')?\\s*'
      + '(?:\\w+\\s+){0,2}?'
      + cat.words.source,
      'gi'
    );
    // Pola B: <kata kategori> ... <angka> [skala] [satuan]
    const reB = new RegExp(
      cat.words.source
      + '\\s*(?:\\w+\\s+){0,2}?'
      + '(\\d[\\d.,]*)\\s*(ribu|juta|ratus|puluh)?\\s*'
      + '(?:' + UNIT.source + ')',
      'gi'
    );

    for (const re of [reA, reB]) {
      let m;
      while ((m = re.exec(s)) !== null) {
        // Grup angka berada di posisi berbeda antara pola A dan B.
        const isA = re === reA;
        const digits = isA ? m[1] : m[m.length - 3];
        const scale = isA ? m[2] : m[m.length - 2];
        const n = toNumber(digits, scale);
        if (n === null) continue;

        // Saring nilai tidak masuk akal: tahun, nomor, atau angka raksasa.
        if (n <= 0 || n > 5e6) continue;
        if (!scale && /^(19|20)\d{2}$/.test(digits.replace(/[.,]/g, ''))) continue;

        out.push({ category: cat.id, label: cat.label, value: n, quote: m[0].trim() });
      }
    }
  }
  return out;
}

/**
 * Ringkas laporan korban dari sekumpulan artikel.
 *
 * Untuk tiap kategori diambil angka TERBESAR yang dilaporkan, karena laporan
 * korban umumnya bertambah seiring waktu dan media memberitakan angka
 * kumulatif terbaru. Nilai itu selalu disertai artikel sumbernya.
 *
 * @param {Array} articles hasil /api/news
 * @param {object} opts    { hazard: RegExp } penyaring topik bencana
 */
function summarize(articles, opts = {}) {
  const filter = opts.hazard || /(gempa|tsunami|erupsi|gunung|banjir|longsor|karhutla|kebakaran)/i;
  const best = new Map();
  let scanned = 0;

  for (const a of (articles || [])) {
    const title = String(a.title || '');
    const blob = title + ' ' + String(a.summary || '');
    if (!filter.test(blob)) continue;
    scanned++;

    for (const hit of extractFromText(blob)) {
      const cur = best.get(hit.category);
      if (cur && cur.value >= hit.value) continue;
      best.set(hit.category, {
        category: hit.category,
        label: hit.label,
        value: hit.value,
        quote: hit.quote,
        title,
        url: a.url || null,
        domain: a.domain || null,
        pubDate: a.pubDate || null
      });
    }
  }

  const items = [...best.values()].sort((a, b) => b.value - a.value);
  return {
    items,
    scanned,
    basis: 'Laporan media, bukan angka resmi BNPB',
    caution: 'Angka diambil otomatis dari teks berita dan bisa keliru '
      + 'atau tertinggal. Selalu periksa tautan sumber sebelum dikutip.'
  };
}

module.exports = { summarize, extractFromText };
