'use strict';
/**
 * Penyaringan dan penilaian relevansi berita.
 *
 * Mekanismenya diadopsi dari news scanner repo ACE, hanya kosakatanya
 * yang diganti dari kripto/makro menjadi kebencanaan:
 *
 *   1. GERBANG RELEVANSI , judul tanpa satu pun kata kunci kebencanaan
 *      tidak diteruskan sama sekali. Ini mencegah RSS negara tetangga
 *      memasukkan berita politik atau olahraga yang kebetulan menyebut
 *      "Indonesia".
 *   2. SKOR 0-10         , kata kunci berbobot menaikkan nilai, dipakai
 *      untuk mengurutkan mana yang layak tampil lebih dulu.
 *   3. KATEGORI          , DARURAT / DAMPAK / PENANGANAN / UMUM, dipakai
 *      antarmuka sebagai penanda.
 *
 * Dua penyesuaian penting terhadap rancangan asli ACE:
 *
 *   - ACE memakai substring untuk kata panjang. Dalam bahasa Indonesia
 *     itu berbahaya: "api" ada di dalam "rapi", "apik", "sapi", dan
 *     "gempa" di dalam "gempar". Karena itu SEMUA kata kunci di sini
 *     dicocokkan dengan batas kata.
 *   - Judul berbahasa Jepang tidak punya spasi antarkata, sehingga
 *     batas kata tidak berlaku. Kata kunci CJK dicocokkan sebagai
 *     substring, yang memang cara yang benar untuk aksara tersebut.
 */

/** Kata kunci inti: minimal satu harus ada, kalau tidak berita dibuang. */
const GATE = [
  // bahasa Indonesia
  'gempa', 'tsunami', 'erupsi', 'letusan', 'meletus', 'vulkanik', 'gunungapi',
  'karhutla', 'kebakaran', 'kabut asap', 'titik api', 'hotspot', 'asap',
  'banjir', 'longsor', 'bencana', 'pengungsi', 'mengungsi', 'evakuasi',
  'korban', 'siaga', 'awas', 'waspada', 'tanggap darurat', 'bpbd', 'bnpb',
  'bmkg', 'pvmbg', 'magma', 'basarnas', 'manggala agni', 'water bombing',
  'ispa', 'kualitas udara', 'polusi udara', 'abu vulkanik', 'lahar',
  'awan panas', 'magnitudo', 'richter', 'episentrum', 'gunung',
  'klhk', 'gakkum', 'konsesi', 'lahan', 'kekeringan', 'el nino', 'el niño',
  // Istilah yang muncul pada liputan penanganan dan pemulihan. Tanpa ini
  // berita seperti "Prabowo Pantau Pemulihan Flores" atau "Kapolri Lapor
  // Penanganan Kahutla" ikut terbuang, padahal justru inti liputan.
  'pemulihan', 'rekonstruksi', 'rehabilitasi', 'terdampak', 'penanganan',
  'kahutla', 'jerebu', 'ring of fire', 'kapolri', 'tenda', 'posko',
  'sekolah darurat', 'huntara', 'relokasi', 'bantuan', 'logistik',
  // bahasa Inggris (edisi negara tetangga)
  'earthquake', 'tsunami', 'eruption', 'erupts', 'volcano', 'volcanic',
  'ash', 'ashfall', 'wildfire', 'forest fire', 'haze', 'smoke', 'hotspot',
  'flood', 'landslide', 'disaster', 'evacuate', 'evacuation', 'evacuees',
  'displaced', 'shelter', 'casualties', 'fatalities', 'death toll',
  'magnitude', 'epicentre', 'epicenter', 'aftershock', 'seismic',
  'air quality', 'pollution', 'flight', 'flights', 'airport', 'airspace',
  'cancelled', 'canceled', 'grounded', 'stranded', 'alert', 'warning',
  'emergency', 'relief', 'rescue', 'drought', 'dry up', 'water source'
];

/** Kata kunci CJK, dicocokkan sebagai substring (aksara tanpa spasi). */
const GATE_CJK = [
  '噴火', '火山', '火山灰', '地震', '津波', '避難', '被災', '災害',
  '山火事', '煙害', '空港', '欠航', '警報', '救助', '死者', '負傷'
];

/** Menaikkan skor: peristiwa mendesak dan berdampak luas. */
const HIGH = [
  'erupsi', 'letusan', 'meletus', 'tsunami', 'awan panas', 'evakuasi',
  'korban', 'tewas', 'meninggal', 'hilang', 'darurat', 'awas',
  'eruption', 'tsunami', 'death toll', 'fatalities', 'killed', 'missing',
  'emergency', 'evacuation', 'stranded', 'airport', 'cancelled',
  '噴火', '津波', '死者', '避難', '欠航'
];

/** Menaikkan skor sedang: penanganan dan dampak lanjutan. */
const MED = [
  'bnpb', 'bpbd', 'basarnas', 'water bombing', 'modifikasi cuaca',
  'pengungsi', 'ispa', 'sekolah diliburkan', 'bandara', 'penerbangan',
  'tersangka', 'segel', 'sanksi',
  'relief', 'rescue', 'shelter', 'evacuees', 'air quality', 'flights',
  'airspace', 'disrupted', 'reopen'
];

/** Kata yang menandakan berita lama atau retrospektif, bukan kejadian kini. */
const STALE = [
  'tahun lalu', 'kilas balik', 'sejarah', 'mengenang', 'peringatan ke-',
  'anniversary', 'years ago', 'looking back', 'retrospective'
];

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Cocokkan kata kunci dengan batas kata untuk aksara berspasi, dan
 * sebagai substring untuk aksara CJK.
 */
function hasWord(text, word) {
  if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(word)) return text.includes(word);
  // Akhiran jamak/turunan diizinkan ("wildfire" cocok dengan "wildfires",
  // "evacuate" dengan "evacuated"). Tanpa ini gerbang membuang berita yang
  // jelas relevan hanya karena judulnya memakai bentuk jamak.
  return new RegExp(
    '(^|[^\\p{L}\\p{N}])' + esc(word) + '(s|es|d|ed)?($|[^\\p{L}\\p{N}])', 'iu'
  ).test(text);
}

function anyWord(text, list) {
  for (const w of list) if (hasWord(text, w)) return true;
  return false;
}

function countWords(text, list) {
  let n = 0;
  for (const w of list) if (hasWord(text, w)) n++;
  return n;
}

/** Gerbang: apakah teks benar-benar tentang kebencanaan. */
function isRelevant(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  return anyWord(t, GATE) || GATE_CJK.some(w => t.includes(w));
}

/**
 * Skor 0-10. Berita yang tidak lolos gerbang selalu bernilai 0 sehingga
 * tidak pernah bisa menyalip berita yang relevan.
 */
function scoreArticle(title, opts) {
  const o = opts || {};
  const t = String(title || '').toLowerCase();
  if (!isRelevant(t)) return 0;

  let score = 5;
  score += Math.min(2.0, countWords(t, HIGH) * 0.7);
  score += Math.min(1.5, countWords(t, MED) * 0.4);

  // Berita retrospektif diturunkan: pembaca butuh keadaan sekarang.
  if (anyWord(t, STALE)) score -= 2.5;

  // Kesegaran: berita beberapa jam terakhir lebih berguna daripada
  // berita kemarin, meski kata kuncinya sama kuat.
  const ms = o.publishedMs;
  if (Number.isFinite(ms)) {
    const hours = (Date.now() - ms) / 3600000;
    if (hours <= 3) score += 1.2;
    else if (hours <= 12) score += 0.6;
    else if (hours > 48) score -= 1.0;
  }

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/** Penanda kategori untuk antarmuka. */
function classify(title) {
  const t = String(title || '').toLowerCase();
  if (!isRelevant(t)) return 'UMUM';
  if (anyWord(t, ['erupsi', 'letusan', 'meletus', 'tsunami', 'awan panas', 'darurat',
    'evakuasi', 'korban', 'tewas', 'eruption', 'tsunami', 'emergency', 'evacuation',
    'death toll', 'killed', '噴火', '津波', '死者'])) return 'DARURAT';
  if (anyWord(t, ['bandara', 'penerbangan', 'ispa', 'sekolah', 'kualitas udara',
    'pengungsi', 'airport', 'flights', 'air quality', 'evacuees', 'stranded',
    'shelter', '空港', '欠航', '避難'])) return 'DAMPAK';
  if (anyWord(t, ['bnpb', 'bpbd', 'basarnas', 'water bombing', 'modifikasi cuaca',
    'relief', 'rescue', 'reopen', 'tersangka', 'sanksi', 'gakkum'])) return 'PENANGANAN';
  return 'UMUM';
}

module.exports = { isRelevant, scoreArticle, classify, GATE, GATE_CJK };
