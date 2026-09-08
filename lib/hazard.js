'use strict';
/**
 * Peringatan kebencanaan lintas lembaga.
 *
 *  - Gempa bumi & potensi tsunami  : BMKG (resmi Indonesia)
 *  - Konfirmasi tsunami kawasan    : PTWC/NTWC NOAA (Amerika Serikat)
 *  - Pengungsi                     : BNPB GIS (resmi Indonesia)
 *
 * Semua sumber terbuka dan tidak memerlukan kunci API.
 */

const BMKG = 'https://data.bmkg.go.id/DataMKG/TEWS';
const BNPB = 'https://gis.bnpb.go.id/server/rest/services';

/* ---------------- utilitas ---------------- */

function num(v) {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** "-8.34,121.30" -> {lat, lon} */
function parseCoords(s) {
  const p = String(s || '').split(',');
  if (p.length !== 2) return null;
  const lat = Number(p[0]);
  const lon = Number(p[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * Tingkat perhatian sebuah gempa.
 * Mengikuti kaidah umum BMKG: potensi tsunami ditentukan oleh magnitudo
 * besar pada kedalaman dangkal di laut.
 */
function quakeSeverity(mag, depthKm, tsunamiFlag) {
  if (tsunamiFlag) return { level: 3, label: 'Peringatan tsunami', color: '#ef4444' };
  if (mag >= 7) return { level: 3, label: 'Gempa sangat kuat', color: '#ef4444' };
  if (mag >= 6) return { level: 2, label: 'Gempa kuat', color: '#fb923c' };
  if (mag >= 5) return { level: 1, label: 'Gempa sedang', color: '#facc15' };
  return { level: 0, label: 'Gempa ringan', color: '#7dd3fc' };
}

function mapQuake(g) {
  const c = parseCoords(g.Coordinates);
  if (!c) return null;
  const mag = num(g.Magnitude);
  const depth = num(g.Kedalaman);
  // Field Potensi punya dua makna berbeda di BMKG: pada autogempa berisi
  // status tsunami ("Tidak berpotensi tsunami"), tetapi pada gempadirasakan
  // berisi imbauan biasa. Hanya teks yang benar-benar menyebut tsunami yang
  // boleh diperlakukan sebagai status tsunami.
  const raw = String(g.Potensi || '');
  const mentionsTsunami = /tsunami/i.test(raw);
  const potensi = mentionsTsunami ? raw : null;
  const tsunami = mentionsTsunami && !/tidak\s+berpotensi/i.test(raw);
  const sev = quakeSeverity(mag || 0, depth || 0, tsunami);
  return {
    time: g.DateTime || null,
    dateLabel: [g.Tanggal, g.Jam].filter(Boolean).join(' '),
    lat: c.lat,
    lon: c.lon,
    magnitude: mag,
    depthKm: depth,
    area: g.Wilayah || '',
    felt: g.Dirasakan || null,
    potensi: potensi || null,
    tsunami,
    severity: sev.level,
    severityLabel: sev.label,
    color: sev.color
  };
}

/* ---------------- BMKG ---------------- */

/**
 * Gempa terkini (15 kejadian) + gempa dirasakan, digabung tanpa duplikat.
 * autogempa dipakai lebih dulu karena hanya berkas itu memuat field Potensi.
 */
async function fetchQuakes(fetchFn) {
  const get = async (file) => {
    const r = await fetchFn(`${BMKG}/${file}`, {}, 12000);
    if (!r.ok) throw new Error('bmkg_' + r.status);
    const j = await r.json();
    const g = j && j.Infogempa && j.Infogempa.gempa;
    return Array.isArray(g) ? g : (g ? [g] : []);
  };

  const [auto, terkini, dirasakan] = await Promise.all([
    get('autogempa.json').catch(() => []),
    get('gempaterkini.json').catch(() => []),
    get('gempadirasakan.json').catch(() => [])
  ]);

  const seen = new Set();
  const out = [];
  for (const g of [...auto, ...terkini, ...dirasakan]) {
    const q = mapQuake(g);
    if (!q) continue;
    const key = (q.time || '') + '|' + q.lat + '|' + q.lon;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  out.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));

  const latest = out[0] || null;
  return {
    latest,
    quakes: out.slice(0, 30),
    counts: {
      total: out.length,
      kuat: out.filter(q => (q.magnitude || 0) >= 5).length,
      tsunami: out.filter(q => q.tsunami).length
    },
    source: 'BMKG — Badan Meteorologi, Klimatologi, dan Geofisika',
    sourceUrl: 'https://www.bmkg.go.id/gempabumi'
  };
}

/* ---------------- PTWC (NOAA) ---------------- */

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Buletin tsunami Pasifik. Berguna sebagai pembanding lembaga asing:
 * bila gempa besar terjadi di Indonesia, PTWC juga menerbitkan pernyataan.
 * Hanya buletin yang menyebut Indonesia/kawasan sekitarnya yang diambil.
 */
async function fetchTsunamiBulletins(fetchFn) {
  const feeds = [
    'https://www.tsunami.gov/events/xml/PHEBAtom.xml',
    'https://www.tsunami.gov/events/xml/PAAQAtom.xml'
  ];
  const items = [];
  for (const url of feeds) {
    try {
      const r = await fetchFn(url, {}, 12000);
      if (!r.ok) continue;
      const xml = await r.text();
      const entries = xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
      for (const e of entries) {
        const title = stripTags((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
        const updated = (e.match(/<updated>([\s\S]*?)<\/updated>/) || [])[1] || null;
        const link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || null;
        const body = stripTags((e.match(/<summary[\s\S]*?>([\s\S]*?)<\/summary>/) || [])[1]);
        const lat = Number((e.match(/<geo:lat>([\s\S]*?)<\/geo:lat>/) || [])[1]);
        const lon = Number((e.match(/<geo:long>([\s\S]*?)<\/geo:long>/) || [])[1]);
        if (!title) continue;

        const text = title + ' ' + body;
        const danger = /warning|watch/i.test(text) && !/no tsunami (danger|threat)/i.test(text);

        // Buletin PTWC mencakup seluruh Pasifik/Atlantik. Peristiwa di lepas
        // pantai Oregon atau Laut Scotia tidak berarti apa pun bagi Indonesia,
        // jadi hanya yang relevan kawasan kita yang ditampilkan: disebut
        // namanya, atau titik episentrum berada di sekitar Indonesia.
        const NEAR = /indonesia|java|sumatra|sumatera|sulawesi|borneo|kalimantan|papua|banda|flores|timor|malacca|makassar|molucca|maluku|celebes|sunda|bali|lombok|halmahera|philippine|malaysia|singapore|timor-leste/i;
        const inBox = Number.isFinite(lat) && Number.isFinite(lon)
          && lat > -15 && lat < 12 && lon > 90 && lon < 145;
        if (!NEAR.test(text) && !inBox) continue;

        items.push({
          title,
          time: updated,
          url: link,
          summary: body.slice(0, 400),
          lat: Number.isFinite(lat) ? lat : null,
          lon: Number.isFinite(lon) ? lon : null,
          danger
        });
      }
    } catch { /* satu feed gagal tidak menggugurkan yang lain */ }
  }
  items.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
  return {
    bulletins: items.slice(0, 10),
    active: items.filter(i => i.danger).length,
    scope: 'Indonesia & kawasan sekitarnya',
    source: 'NOAA Pacific / National Tsunami Warning Center (AS)',
    sourceUrl: 'https://www.tsunami.gov/'
  };
}

/* ---------------- BNPB: pengungsi ---------------- */

/**
 * Berapa lama data pengungsian masih dianggap menggambarkan keadaan
 * sekarang. Posko yang laporan terakhirnya lebih tua dari ini dianggap
 * sudah bubar: BNPB berhenti memperbarui layanan begitu warga pulang,
 * jadi angka lama akan terus tampil selamanya kalau tidak dibatasi.
 */
const SHELTER_MAX_AGE_DAYS = 10;

/**
 * Kejadian yang sudah diketahui. Dipakai untuk memberi nama yang enak
 * dibaca; kejadian di luar daftar ini tetap ditemukan lewat pemindaian
 * katalog, hanya saja namanya diturunkan dari nama folder.
 */
const SHELTER_KNOWN = {
  '2026_gempabumi_ntt': { label: 'Gempa NTT 2026', hazard: 'Gempa bumi' }
};

/** Ubah "2026_gempabumi_ntt" menjadi "Gempabumi Ntt 2026". */
function folderLabel(folder) {
  const year = (folder.match(/(20\d{2})/) || [])[1] || '';
  const rest = folder.replace(/20\d{2}/g, '').replace(/[_-]+/g, ' ').trim();
  const title = rest.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  return (title + (year ? ' ' + year : '')).trim() || folder;
}

function guessHazard(text) {
  const t = String(text).toLowerCase();
  if (/gempa/.test(t)) return 'Gempa bumi';
  if (/tsunami/.test(t)) return 'Tsunami';
  if (/erupsi|gunung|volkan|vulkan/.test(t)) return 'Erupsi gunung api';
  if (/karhutla|kebakaran|asap/.test(t)) return 'Karhutla & asap';
  if (/banjir|bandang/.test(t)) return 'Banjir';
  if (/longsor/.test(t)) return 'Tanah longsor';
  return 'Bencana';
}

/**
 * Cari sendiri layanan pengungsian yang sedang diterbitkan BNPB.
 *
 * Sebelumnya daftar layanan ditulis tangan, sehingga setiap kali BNPB
 * membuka kejadian baru dashboard tetap menampilkan kejadian lama sampai
 * kode diubah manual. Katalog ArcGIS BNPB bisa ditelusuri, jadi folder
 * dipindai langsung: folder bertahun berjalan diperiksa lebih dulu, dan
 * layanan yang namanya mengandung "pengungsi"/"posko" diambil.
 */
async function discoverShelterSets(fetchFn) {
  const root = await fetchFn(BNPB + '?f=json', {}, 20000);
  if (!root.ok) throw new Error('bnpb_root_' + root.status);
  const folders = (await root.json()).folders || [];

  // SELURUH folder dipindai, bukan hanya yang bernama tahun berjalan.
  // Bencana berikutnya bisa muncul di mana saja dan BNPB tidak selalu
  // menamai foldernya dengan tahun — "Gunung_Semeru", "Marapi", dan
  // "Longsor_Sumedang" tidak punya angka tahun sama sekali. Membatasi
  // pemindaian pada pola tahun berarti kejadian baru di folder semacam
  // itu tidak akan pernah terlihat. Relevansi tetap terjaga karena
  // saringan kesegaran di bawah membuang laporan yang sudah lewat.
  //
  // Folder dijalankan berkelompok agar 40-an permintaan tidak dikirim
  // sekaligus (BNPB membalas 502 bila diserbu) namun tetap selesai
  // dalam anggaran waktu fungsi.
  const found = [];
  const CONCURRENCY = 6;

  async function scanFolder(folder) {
    try {
      const r = await fetchFn(`${BNPB}/${encodeURIComponent(folder)}?f=json`, {}, 20000);
      if (!r.ok) return;
      const services = (await r.json()).services || [];
      for (const svc of services) {
        if (svc.type !== 'FeatureServer') continue;
        if (!/pengungsi|posko/i.test(svc.name)) continue;
        const known = SHELTER_KNOWN[folder];
        // Folder "Hosted" tidak menyebut kejadian apa pun, jadi namanya
        // diambil dari nama layanan ("titik_pengungsian_sumatera").
        const base = /^Hosted$/i.test(folder) ? svc.name.split('/').pop() : folder;
        found.push({
          id: svc.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
          label: known ? known.label : folderLabel(base),
          hazard: known ? known.hazard : guessHazard(base + ' ' + svc.name),
          service: `${BNPB}/${svc.name}/FeatureServer`
        });
      }
    } catch { /* folder bermasalah, lanjut ke berikutnya */ }
  }

  for (let i = 0; i < folders.length; i += CONCURRENCY) {
    await Promise.all(folders.slice(i, i + CONCURRENCY).map(scanFolder));
  }
  return found;
}

/**
 * Temukan lapisan yang benar-benar memuat jumlah jiwa.
 * Nomor lapisan berbeda-beda antar layanan (NTT memakai 39, bukan 0),
 * jadi tidak boleh diasumsikan.
 */
async function resolveShelterLayer(fetchFn, set) {
  const r = await fetchFn(set.service + '?f=json', {}, 20000);
  if (!r.ok) throw new Error('svc_' + r.status);
  const meta = await r.json();
  const layers = [...(meta.layers || []), ...(meta.tables || [])];

  for (const lyr of layers) {
    const d = await fetchFn(`${set.service}/${lyr.id}?f=json`, {}, 20000);
    if (!d.ok) continue;
    const fields = ((await d.json()).fields || []).map(f => f.name);
    const countField = fields.find(f => /^jumlah$/i.test(f))
      || fields.find(f => /jumlah|jiwa|total/i.test(f));
    if (!countField) continue;
    return {
      layerId: lyr.id,
      countField,
      dateField: fields.find(f => /sumber_tgl|tanggal|tgl|last_edited_date|updated/i.test(f)) || null,
      fields
    };
  }
  return null;
}

/**
 * Titik pengungsian resmi BNPB, ditemukan otomatis dari katalog.
 *
 * Dua hal yang dijaga di sini:
 *  1. Daftar kejadian tidak lagi ditulis tangan — katalog BNPB dipindai
 *     setiap kali, sehingga kejadian baru langsung muncul sendiri.
 *  2. Kejadian yang laporan terakhirnya sudah lewat SHELTER_MAX_AGE_DAYS
 *     ditandai tidak aktif. BNPB tidak menghapus layanan saat pengungsi
 *     sudah pulang, jadi tanpa saringan ini angka lama akan menempel
 *     selamanya dan menyesatkan pembaca.
 */
async function fetchShelters(fetchFn) {
  let discovered = [];
  try {
    discovered = await discoverShelterSets(fetchFn);
  } catch { /* katalog sedang tidak bisa diakses */ }

  const sets = [];
  const stale = [];
  const now = Date.now();

  for (const s of discovered) {
    try {
      const layer = await resolveShelterLayer(fetchFn, s);
      if (!layer) continue;

      const wanted = ['kab', 'kec', 'desa', 'lokasi', 'jumlah', 'jumlah_terpusat',
        'jumlah_mandiri', 'sumber', 'sumber_tgl', 'lat', 'lng', layer.countField, layer.dateField]
        .filter(Boolean)
        .filter(f => layer.fields.includes(f));
      const outFields = [...new Set(wanted)].join(',') || '*';

      const q = `${s.service}/${layer.layerId}/query?where=1%3D1`
        + `&outFields=${encodeURIComponent(outFields)}`
        + '&returnGeometry=false&resultRecordCount=2000&f=json';
      const r = await fetchFn(q, {}, 25000);
      if (!r.ok) throw new Error('bnpb_' + r.status);
      const j = await r.json();
      const feats = Array.isArray(j.features) ? j.features : [];
      if (!feats.length) continue;

      let total = 0;
      let terpusat = 0;
      let mandiri = 0;
      let updatedMs = null;
      const byKab = new Map();
      const points = [];

      for (const f of feats) {
        const a = f.attributes || {};
        const n = Number(a[layer.countField]) || 0;
        total += n;
        terpusat += Number(a.jumlah_terpusat) || 0;
        mandiri += Number(a.jumlah_mandiri) || 0;

        if (layer.dateField && a[layer.dateField] != null) {
          // ArcGIS memberi epoch milidetik untuk kolom date, tapi teks
          // ISO untuk kolom string — keduanya harus ditangani.
          const raw = a[layer.dateField];
          const ms = typeof raw === 'number' ? raw : Date.parse(raw);
          if (Number.isFinite(ms) && (!updatedMs || ms > updatedMs)) updatedMs = ms;
        }

        const kab = String(a.kab || '').trim();
        if (kab) byKab.set(kab, (byKab.get(kab) || 0) + n);

        const lat = Number(a.lat);
        const lon = Number(a.lng);
        if (Number.isFinite(lat) && Number.isFinite(lon) && n > 0) {
          points.push({
            lat, lon, jumlah: n,
            kab, kec: String(a.kec || ''), desa: String(a.desa || ''),
            jenis: String(a.lokasi || '')
          });
        }
      }

      if (total <= 0) continue;

      const ageDays = updatedMs ? (now - updatedMs) / 86400000 : null;
      // Tanpa kolom tanggal, kesegaran tidak bisa dibuktikan; jangan
      // ditampilkan sebagai keadaan sekarang.
      const active = ageDays != null && ageDays <= SHELTER_MAX_AGE_DAYS;

      // Nama kabupaten dari BNPB tidak konsisten ("KAB. SIKKA" vs "Manggarai
      // Barat"); dirapikan agar tampilan tidak terlihat berantakan.
      const tidy = (s0) => s0.replace(/^KAB\.?\s*/i, '').replace(/^KOTA\s*/i, 'Kota ')
        .toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

      const entry = {
        id: s.id,
        label: s.label,
        hazard: s.hazard,
        total,
        terpusat,
        mandiri,
        sites: feats.length,
        updatedAt: updatedMs ? new Date(updatedMs).toISOString() : null,
        ageDays: ageDays == null ? null : Math.floor(ageDays),
        topAreas: [...byKab.entries()]
          .map(([k, v]) => ({ area: tidy(k), people: v }))
          .sort((a, b) => b.people - a.people)
          .slice(0, 6),
        points: points.sort((a, b) => b.jumlah - a.jumlah).slice(0, 500)
      };

      (active ? sets : stale).push(entry);
    } catch { /* lewati kejadian yang layanannya sedang bermasalah */ }
  }

  sets.sort((a, b) => b.total - a.total);
  stale.sort((a, b) => (a.ageDays ?? 1e9) - (b.ageDays ?? 1e9));

  return {
    events: sets,
    // Kejadian yang sudah lewat tetap dikirim terpisah supaya antarmuka
    // dapat menjelaskan "tidak ada pengungsi aktif, terakhir N hari lalu"
    // alih-alih diam tanpa keterangan.
    recentlyEnded: stale.slice(0, 3),
    totalPeople: sets.reduce((a, b) => a + b.total, 0),
    active: sets.length > 0,
    maxAgeDays: SHELTER_MAX_AGE_DAYS,
    source: 'BNPB — Badan Nasional Penanggulangan Bencana',
    sourceUrl: 'https://gis.bnpb.go.id/'
  };
}

module.exports = { fetchQuakes, fetchTsunamiBulletins, fetchShelters };
