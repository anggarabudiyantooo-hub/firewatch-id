'use strict';
/**
 * Status resmi tingkat aktivitas gunung api dari PVMBG / Badan Geologi
 * (MAGMA Indonesia, ESDM).
 *
 * Kenapa perlu, padahal sudah ada GVP:
 *   - Laporan mingguan GVP terbit sekali sepekan dan kerap tertinggal
 *     berhari-hari, sehingga gunung yang baru naik status tidak muncul.
 *   - PVMBG adalah otoritas resmi Indonesia yang menetapkan
 *     Normal/Waspada/Siaga/Awas dari kegempaan, deformasi, dan visual kawah.
 *
 * Halaman sumber berupa HTML (tidak ada API terbuka tanpa token), jadi
 * tabelnya diurai. Bila strukturnya berubah, fungsi ini melempar galat dan
 * pemanggil harus tetap berjalan tanpa data ini.
 */

const URL = 'https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas';

const LEVELS = {
  Awas: { level: 4, roman: 'IV', color: '#ef4444', order: 0 },
  Siaga: { level: 3, roman: 'III', color: '#fb923c', order: 1 },
  Waspada: { level: 2, roman: 'II', color: '#facc15', order: 2 },
  Normal: { level: 1, roman: 'I', color: '#22c55e', order: 3 }
};

// Penjelasan bahasa awam. Bukan kutipan langsung PVMBG, tapi mengikuti
// definisi resmi tiap tingkat.
const MEANING = {
  Awas: 'Erupsi utama berpotensi terjadi atau sedang berlangsung dan sudah mengancam permukiman. '
    + 'Warga di zona bahaya harus mengungsi mengikuti arahan BPBD/pemda.',
  Siaga: 'Aktivitas meningkat nyata dari pengamatan visual maupun alat. Ancaman dapat meluas di sekitar '
    + 'area erupsi, tetapi belum mengancam permukiman. Warga di zona rawan diminta bersiap mengungsi '
    + 'sewaktu-waktu dan menjauhi radius bahaya.',
  Waspada: 'Terjadi peningkatan aktivitas di atas kondisi normal, biasanya berupa kenaikan kegempaan '
    + 'atau perubahan visual kawah. Masyarakat diminta tidak mendekati radius bahaya yang ditetapkan.',
  Normal: 'Tidak ada gejala tekanan magma yang berarti. Aktivitas berada pada tingkat dasar, '
    + 'namun kawah tetap tidak boleh didekati pada radius yang ditentukan.'
};

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** Normalisasi nama agar bisa dicocokkan dengan penamaan GVP. */
function normalizeName(n) {
  return String(n)
    .toLowerCase()
    .replace(/^(gunung|gn\.?|g\.)\s+/, '')
    .replace(/\b(laki-laki|perempuan)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/**
 * @param {function} fetchFn fetch berbatas waktu
 * @returns {{updatedAt:string, counts:object, volcanoes:Array}}
 */
// Salinan hasil sukses terakhir, dipakai bila MAGMA sedang tidak sehat.
let lastGood = null;

async function fetchStatus(fetchFn) {
  // MAGMA sesekali membalas 502 saat sedang sibuk. Satu kegagalan tidak boleh
  // menghapus seluruh daftar gunung, jadi dicoba beberapa kali dengan jeda,
  // dan hasil terakhir yang sukses disimpan sebagai cadangan.
  let html = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchFn(URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FireWatchID/1.0)' }
      }, 45000);
      if (!r.ok) throw new Error('magma_' + r.status);
      html = await r.text();
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
  if (html === null) {
    if (lastGood) return { ...lastGood, stale: true };
    throw lastErr || new Error('magma_gagal');
  }

  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  const out = [];
  const counts = { Awas: 0, Siaga: 0, Waspada: 0, Normal: 0 };
  let current = null;

  for (const row of rows) {
    const cells = (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) || [])
      .map(stripTags).filter(Boolean);
    if (!cells.length) continue;

    const lv = /^Level (?:IV|III|II|I) \((Awas|Siaga|Waspada|Normal)\)/.exec(cells[0]);
    if (lv) { current = lv[1]; continue; }

    // Baris gunung berbentuk "Nama - Provinsi Lihat laporan".
    if (!current || cells.length !== 1) continue;
    const text = cells[0].replace(/Lihat laporan/gi, '').trim();
    const m = /^(.+?)\s+-\s+(.+)$/.exec(text);
    if (!m) continue;

    const name = m[1].trim();
    if (!name || /^Tidak ada gunung api/i.test(name)) continue;

    const meta = LEVELS[current];
    counts[current]++;
    out.push({
      name,
      key: normalizeName(name),
      province: m[2].trim(),
      status: current,
      level: meta.level,
      roman: meta.roman,
      color: meta.color,
      meaning: MEANING[current]
    });
  }

  if (!out.length) throw new Error('magma_tabel_tidak_terbaca');

  out.sort((a, b) => LEVELS[a.status].order - LEVELS[b.status].order
    || a.name.localeCompare(b.name, 'id'));

  const result = {
    updatedAt: new Date().toISOString(),
    counts,
    total: out.length,
    volcanoes: out,
    source: 'PVMBG / Badan Geologi (MAGMA Indonesia)',
    sourceUrl: URL
  };
  lastGood = result;
  return result;
}

module.exports = { fetchStatus, normalizeName, LEVELS, MEANING };
