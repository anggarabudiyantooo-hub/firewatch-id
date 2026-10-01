'use strict';
/**
 * Fase 2.3 — Refresh snapshot PVMBG & data/regions.json otomatis
 *
 * - Mengambil status PVMBG terbaru dari https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas
 * - Menulis ulang lib/pvmbg-snapshot.js sebagai cadangan bila MAGMA 502/timeout
 * - Memvalidasi & merapikan data/regions.json (urut, dedup, cek koordinat)
 *
 * Dijalankan via: node scripts/refresh-snapshots.js
 * Dan via GitHub Actions mingguan (lihat .github/workflows/snapshots.yml)
 */

const fs = require('fs');
const path = require('path');

const PVMBG_URL = process.env.MAGMA_STATUS_URL || 'https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas';
const SNAPSHOT_PATH = path.join(__dirname, '..', 'lib', 'pvmbg-snapshot.js');
const REGIONS_PATH = path.join(__dirname, '..', 'data', 'regions.json');
const COORDS_PATH = path.join(__dirname, '..', 'lib', 'volcano-coords-snapshot.js');
const GVP_WFS = 'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows';

const LEVELS = {
  Awas: { level: 4, roman: 'IV', color: '#ef4444', order: 0 },
  Siaga: { level: 3, roman: 'III', color: '#fb923c', order: 1 },
  Waspada: { level: 2, roman: 'II', color: '#facc15', order: 2 },
  Normal: { level: 1, roman: 'I', color: '#22c55e', order: 3 }
};
const MEANING = {
  Awas: 'Erupsi utama berpotensi terjadi atau sedang berlangsung dan sudah mengancam permukiman. Warga di zona bahaya harus mengungsi mengikuti arahan BPBD/pemda.',
  Siaga: 'Aktivitas meningkat nyata dari pengamatan visual maupun alat. Ancaman dapat meluas di sekitar area erupsi, tetapi belum mengancam permukiman. Warga di zona rawan diminta bersiap mengungsi sewaktu-waktu dan menjauhi radius bahaya.',
  Waspada: 'Terjadi peningkatan aktivitas di atas kondisi normal, biasanya berupa kenaikan kegempaan atau perubahan visual kawah. Masyarakat diminta tidak mendekati radius bahaya yang ditetapkan.',
  Normal: 'Tidak ada gejala tekanan magma yang berarti. Aktivitas berada pada tingkat dasar, namun kawah tetap tidak boleh didekati pada radius yang ditentukan.'
};

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ').trim();
}
function normalizeName(n) {
  return String(n).toLowerCase().replace(/^(gunung|gn\.?|g\.)\s+/, '').replace(/\b(laki-laki|perempuan)\b/g, '').replace(/[^a-z0-9]+/g, '').trim();
}

async function fetchWithTimeout(url, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FireWatch-ID/1.0 snapshot-refresh)' },
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} dari ${url}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchPvmbg() {
  console.log(`[snapshot] Mengambil ${PVMBG_URL} ...`);
  let html = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      html = await fetchWithTimeout(PVMBG_URL, attempt === 0 ? 26000 : 15000);
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[snapshot] Percobaan ${attempt + 1} gagal: ${e.message}`);
      if (attempt < 2) await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
  if (!html) throw lastErr || new Error('Gagal mengambil PVMBG');

  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  const out = [];
  const counts = { Awas: 0, Siaga: 0, Waspada: 0, Normal: 0 };
  let current = null;

  for (const row of rows) {
    const cells = (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) || []).map(stripTags).filter(Boolean);
    if (!cells.length) continue;
    const lv = /^Level (?:IV|III|II|I) \((Awas|Siaga|Waspada|Normal)\)/.exec(cells[0]);
    if (lv) { current = lv[1]; continue; }
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

  if (!out.length) throw new Error('Tabel PVMBG tidak terbaca — struktur HTML mungkin berubah');

  out.sort((a, b) => LEVELS[a.status].order - LEVELS[b.status].order || a.name.localeCompare(b.name, 'id'));

  const result = {
    updatedAt: new Date().toISOString(),
    counts,
    total: out.length,
    volcanoes: out,
    source: 'PVMBG / Badan Geologi (MAGMA Indonesia)',
    sourceUrl: PVMBG_URL
  };

  console.log(`[snapshot] Sukses: ${result.total} gunung — Awas:${counts.Awas} Siaga:${counts.Siaga} Waspada:${counts.Waspada} Normal:${counts.Normal}`);
  return result;
}

function writeSnapshot(data) {
  const header = `/* eslint-disable */\n// Snapshot status PVMBG sebagai cadangan bila MAGMA tidak dapat dihubungi.\n// Dibuat otomatis dari ${PVMBG_URL} pada ${data.updatedAt}\n`;
  const body = `module.exports = ${JSON.stringify(data, null, 1)};\n`;
  fs.writeFileSync(SNAPSHOT_PATH, header + body, 'utf8');
  console.log(`[snapshot] Ditulis ${SNAPSHOT_PATH} (${(body.length / 1024).toFixed(1)} KB)`);
}

function refreshRegions() {
  console.log(`[regions] Membaca ${REGIONS_PATH} ...`);
  if (!fs.existsSync(REGIONS_PATH)) {
    console.warn('[regions] File tidak ditemukan, dilewati');
    return { changed: false };
  }
  const raw = JSON.parse(fs.readFileSync(REGIONS_PATH, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('regions.json bukan array');

  const before = raw.length;
  // dedup by name+prov lower
  const seen = new Map();
  for (const r of raw) {
    if (!r.name || !r.prov) continue;
    if (typeof r.lat !== 'number' || typeof r.lon !== 'number') continue;
    // validasi koordinat Indonesia
    if (r.lat < -11.5 || r.lat > 6.5 || r.lon < 94.5 || r.lon > 141.5) {
      console.warn(`[regions] Koordinat di luar Indonesia: ${r.name} ${r.lat},${r.lon}`);
      continue;
    }
    const key = `${r.name.toLowerCase()}|${r.prov.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, r);
    else {
      // simpan yang populasi lebih besar
      const prev = seen.get(key);
      if ((r.pop || 0) > (prev.pop || 0)) seen.set(key, r);
    }
  }

  let cleaned = [...seen.values()];
  // urut: provinsi lalu nama
  cleaned.sort((a, b) => a.prov.localeCompare(b.prov, 'id') || a.name.localeCompare(b.name, 'id'));

  const after = cleaned.length;
  const changed = after !== before || JSON.stringify(raw) !== JSON.stringify(cleaned);

  if (changed) {
    fs.writeFileSync(REGIONS_PATH, JSON.stringify(cleaned, null, 1) + '\n', 'utf8');
    console.log(`[regions] Dirapikan: ${before} → ${after} entri, dedup ${before - after} duplikat`);
  } else {
    console.log(`[regions] OK: ${after} entri, tidak ada perubahan`);
  }

  // ringkasan
  const provCount = new Set(cleaned.map(r => r.prov)).size;
  console.log(`[regions] ${provCount} provinsi, ${after} kota/kabupaten`);

  return { changed, before, after };
}

/** Perbarui snapshot koordinat gunung dari GVP WFS (sumber kanonik).
 *  Berkas lama TIDAK ditimpa bila GVP gagal/down atau katalog mencurigakan
 *  (< 100 entri) - supaya seed OSM/Wikidata tidak hilang sia-sia. */
async function refreshVolcanoCoords() {
  console.log('[coords] Mengambil katalog GVP WFS Indonesia untuk snapshot koordinat ...');
  let j = null;
  for (let attempt = 0; attempt < 2 && !j; attempt++) {
    try {
      const url = GVP_WFS
        + '?service=WFS&version=2.0.0&request=GetFeature'
        + '&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes'
        + '&outputFormat=application/json&count=1000'
        + '&CQL_FILTER=' + encodeURIComponent("Country='Indonesia'");
      j = JSON.parse(await fetchWithTimeout(url, 30000));
    } catch (e) {
      console.warn(`[coords] Percobaan ${attempt + 1} gagal: ${e.message}`);
      j = null;
      if (attempt === 0) await new Promise(res => setTimeout(res, 2500));
    }
  }
  if (!j) { console.warn('[coords] GVP tidak bisa dihubungi - snapshot lama dipertahankan'); return false; }
  const valid = [];
  for (const f of (j.features || [])) {
    const g = f.geometry, p = f.properties || {};
    if (!g || g.type !== 'Point') continue;
    const lon = Number(g.coordinates[0]), lat = Number(g.coordinates[1]);
    const name = String(p.Volcano_Name || '').trim();
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -12 || lat > 8 || lon < 93 || lon > 143) continue;
    valid.push({ name, lat: +lat.toFixed(4), lon: +lon.toFixed(4), elevM: Number(p.Elevation) || null });
  }
  if (valid.length < 100) {
    console.warn(`[coords] Katalog janggal (${valid.length} entri) - snapshot lama dipertahankan`);
    return false;
  }
  valid.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const snap = {
    updatedAt: new Date().toISOString(),
    source: 'GVP / Smithsonian VOTW (WFS)',
    total: valid.length,
    volcanoes: valid
  };
  const header = '/* eslint-disable */\n'
    + '// Snapshot koordinat gunung api (fallback bila katalog GVP WFS hidup tetapi\n'
    + '// kosong/down). Nama mengikuti katalog GVP - pencocokan PVMBG dilakukan\n'
    + '// terhadapnya di lib/volcano.js. Dibuat otomatis oleh\n'
    + '// scripts/refresh-snapshots.js; jangan disunting manual.\n';
  fs.writeFileSync(COORDS_PATH, header + 'module.exports = ' + JSON.stringify(snap, null, 1) + ';\n', 'utf8');
  console.log(`[coords] Ditulis ${COORDS_PATH} (${valid.length} gunung)`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyRegions = args.includes('--only-regions');
  const onlyPvmbg = args.includes('--only-pvmbg');

  let pvmbgOk = false;
  let regionsOk = false;

  if (!onlyRegions) {
    try {
      const data = await fetchPvmbg();
      writeSnapshot(data);
      pvmbgOk = true;
    } catch (e) {
      console.error(`[snapshot] GAGAL: ${e.message}`);
      // jangan hapus snapshot lama — biarkan cadangan tetap ada
      if (!fs.existsSync(SNAPSHOT_PATH)) throw e;
      console.warn('[snapshot] Menggunakan snapshot lama sebagai cadangan');
    }
  }

  let coordsOk = false;
  if (!onlyPvmbg) {
    try {
      coordsOk = await refreshVolcanoCoords();
    } catch (e) {
      console.error(`[coords] GAGAL: ${e.message}`);
    }
  }

  if (!onlyPvmbg) {
    try {
      refreshRegions();
      regionsOk = true;
    } catch (e) {
      console.error(`[regions] GAGAL: ${e.message}`);
      throw e;
    }
  }

  console.log(`[done] PVMBG: ${pvmbgOk ? 'OK' : 'SKIP/GAGAL'} | Coords: ${coordsOk ? 'OK' : 'SKIP/GAGAL'} | Regions: ${regionsOk ? 'OK' : 'SKIP/GAGAL'}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { fetchPvmbg, refreshRegions, refreshVolcanoCoords };
