'use strict';
/**
 * Atribusi titik api ke unit lahan (konsesi / izin) menggunakan vector tile
 * publik Global Forest Watch. Semua pengambilan dilakukan di server.
 *
 * PENTING: dataset ini adalah KOMPILASI peta konsesi (sumber: KLHK, ESDM, RSPO,
 * dikumpulkan GFW). Ini BUKAN sertifikat HGU resmi dari ATR/BPN, yang di
 * Indonesia bukan data yang dipublikasikan terbuka. Hasil = indikasi awal,
 * wajib diverifikasi ke instansi berwenang.
 */
const { VectorTile } = require('@mapbox/vector-tile');
const Pbf = require('pbf');

const Z = 9;            // level zoom tile yang dipakai untuk uji titik-dalam-poligon
const EXTENT = 4096;

const DATASETS = [
  { id: 'gfw_oil_palm/v2025',            kind: 'Perkebunan sawit',      badge: 'sawit' },
  { id: 'gfw_wood_fiber/v2025',          kind: 'HTI / serat kayu',      badge: 'kayu' },
  { id: 'gfw_logging/v202106',           kind: 'Konsesi tebang (HPH)',  badge: 'hph' },
  { id: 'gfw_mining_concessions/v2025',  kind: 'Konsesi tambang',       badge: 'tambang' },
  { id: 'rspo_oil_palm/v2025',           kind: 'Sawit anggota RSPO',    badge: 'rspo' }
];

function lonLatToTile(lat, lon, z) {
  const n = 2 ** z;
  const x = (lon + 180) / 360 * n;
  const la = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n;
  return { xt: Math.floor(x), yt: Math.floor(y), px: (x - Math.floor(x)) * EXTENT, py: (y - Math.floor(y)) * EXTENT };
}

function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y, xj = ring[j].x, yj = ring[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function pointInPolygons(px, py, rings) {
  // loadGeometry() mengembalikan daftar ring; ring luar searah jarum jam.
  let inside = false;
  for (const ring of rings) if (pointInRing(px, py, ring)) inside = !inside;
  return inside;
}

const tileCache = new Map();          // key -> {t, layers}
const TILE_TTL = 6 * 60 * 60 * 1000;  // batas konsesi jarang berubah
const MAX_TILES = 600;

async function getTile(dsId, xt, yt, z) {
  z = z || Z;
  const key = `${dsId}/${z}/${xt}/${yt}`;
  const hit = tileCache.get(key);
  if (hit && Date.now() - hit.t < TILE_TTL) return hit.v;
  let v = null;
  try {
    const url = `https://tiles.globalforestwatch.org/${dsId}/dynamic/${z}/${xt}/${yt}.pbf`;
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 12000);
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'FireWatchID/1.0' } });
    clearTimeout(to);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      v = buf.length ? new VectorTile(new Pbf(buf)) : null;
    }
  } catch { v = null; }
  if (tileCache.size > MAX_TILES) tileCache.clear();
  tileCache.set(key, { t: Date.now(), v });
  return v;
}

function readProps(p, kind, badge) {
  const name = p.conc_name || p.name || p.company || '(nama tidak tercantum)';
  const company = p.company || p.name || p.conc_name || null;
  return {
    kind, badge,
    name: String(name).slice(0, 160),
    company: company ? String(company).slice(0, 160) : null,
    group: p.comp_group && p.comp_group !== 'No group' ? String(p.comp_group).slice(0, 160) : null,
    tenure: p.cont_type ? String(p.cont_type).slice(0, 60) : null,   // mis. "HGU", "OPERASI PRODUKSI"
    licenseId: p.cont_id ? String(p.cont_id).slice(0, 60) : null,
    status: p.conc_stat ? String(p.conc_stat).slice(0, 60) : null,
    mineral: p.mineral ? String(p.mineral).slice(0, 60) : null,
    areaHa: Number(p.gfw_area__ha) ? Math.round(Number(p.gfw_area__ha)) : null,
    source: p.source ? String(p.source).slice(0, 140) : 'Global Forest Watch',
    sourceYear: p.source_yr || p.last_updat || null
  };
}

/** Cari unit lahan yang memuat satu titik. Mengembalikan array (bisa tumpang tindih). */
async function lookupPoint(lat, lon) {
  const { xt, yt, px, py } = lonLatToTile(lat, lon, Z);
  const found = [];
  const tiles = await Promise.all(DATASETS.map(d => getTile(d.id, xt, yt)));
  tiles.forEach((vt, i) => {
    if (!vt) return;
    const ds = DATASETS[i];
    for (const lname of Object.keys(vt.layers)) {
      const layer = vt.layers[lname];
      for (let f = 0; f < layer.length; f++) {
        const feat = layer.feature(f);
        if (feat.type !== 3) continue; // hanya poligon
        let geom;
        try { geom = feat.loadGeometry(); } catch { continue; }
        if (!pointInPolygons(px, py, geom)) continue;
        found.push(readProps(feat.properties || {}, ds.kind, ds.badge));
        break; // satu kecocokan per dataset sudah cukup
      }
    }
  });
  return found;
}

/**
 * Atribusi sekelompok titik api. Membatasi jumlah titik yang diperiksa
 * agar tidak membanjiri layanan tile pihak ketiga.
 */
async function attributeHotspots(hotspots, limit = 220) {
  const subset = hotspots
    .slice()
    .sort((a, b) => b.frp - a.frp)
    .slice(0, limit);

  const results = [];
  const CHUNK = 12;
  for (let i = 0; i < subset.length; i += CHUNK) {
    const part = subset.slice(i, i + CHUNK);
    const hits = await Promise.all(part.map(h => lookupPoint(h.lat, h.lon).catch(() => [])));
    part.forEach((h, k) => results.push({ hotspot: h, units: hits[k] }));
  }

  // agregasi per unit lahan
  const byUnit = new Map();
  let inside = 0, outside = 0;
  for (const { hotspot, units } of results) {
    if (!units.length) { outside++; continue; }
    inside++;
    for (const u of units) {
      const key = `${u.badge}|${u.name}`;
      let rec = byUnit.get(key);
      if (!rec) {
        rec = { ...u, hotspotCount: 0, totalFrp: 0, lat: 0, lon: 0 };
        byUnit.set(key, rec);
      }
      rec.hotspotCount++;
      rec.totalFrp += hotspot.frp;
      rec.lat += hotspot.lat;
      rec.lon += hotspot.lon;
    }
  }
  const units = [...byUnit.values()].map(u => ({
    ...u,
    lat: +(u.lat / u.hotspotCount).toFixed(4),
    lon: +(u.lon / u.hotspotCount).toFixed(4),
    totalFrp: +u.totalFrp.toFixed(1)
  })).sort((a, b) => b.hotspotCount - a.hotspotCount || b.totalFrp - a.totalFrp);

  // agregasi per grup korporasi
  const byGroup = new Map();
  for (const u of units) {
    const g = u.group || u.company || u.name;
    let rec = byGroup.get(g);
    if (!rec) { rec = { group: g, hotspotCount: 0, totalFrp: 0, units: 0, kinds: new Set() }; byGroup.set(g, rec); }
    rec.hotspotCount += u.hotspotCount; rec.totalFrp += u.totalFrp; rec.units++; rec.kinds.add(u.kind);
  }
  const groups = [...byGroup.values()]
    .map(g => ({ group: g.group, hotspotCount: g.hotspotCount, totalFrp: +g.totalFrp.toFixed(1), units: g.units, kinds: [...g.kinds] }))
    .sort((a, b) => b.hotspotCount - a.hotspotCount);

  return {
    analyzed: subset.length,
    insideConcession: inside,
    outsideConcession: outside,
    units: units.slice(0, 50),
    groups: groups.slice(0, 25)
  };
}

/** Ubah koordinat tile lokal menjadi lon/lat. */
function tileToLonLat(xt, yt, z, px, py) {
  const n = 2 ** z;
  const lon = ((xt + px / EXTENT) / n) * 360 - 180;
  const ly = Math.PI - 2 * Math.PI * (yt + py / EXTENT) / n;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(ly) - Math.exp(-ly)));
  return [+lon.toFixed(5), +lat.toFixed(5)];
}

/** Ambil poligon konsesi sebagai GeoJSON untuk sebuah bbox (untuk layer peta). */
async function concessionsInBbox(west, south, east, north, maxTiles = 16) {
  // pilih zoom terbesar (detail tertinggi) yang jumlah tile-nya masih wajar
  let z = 0, box = null;
  for (let cand = Z; cand >= 5; cand--) {
    const a = lonLatToTile(north, west, cand), b = lonLatToTile(south, east, cand);
    const x0 = Math.min(a.xt, b.xt), x1 = Math.max(a.xt, b.xt);
    const y0 = Math.min(a.yt, b.yt), y1 = Math.max(a.yt, b.yt);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= maxTiles) { z = cand; box = { x0, x1, y0, y1 }; break; }
  }
  if (!box) return { type: 'FeatureCollection', features: [], tooWide: true };

  const jobs = [];
  for (let x = box.x0; x <= box.x1; x++) for (let y = box.y0; y <= box.y1; y++)
    for (const d of DATASETS) jobs.push({ d, x, y });

  const tiles = await Promise.all(jobs.map(j => getTile(j.d.id, j.x, j.y, z)));
  const features = [];
  const seen = new Set();
  tiles.forEach((vt, i) => {
    if (!vt) return;
    const { d, x, y } = jobs[i];
    for (const lname of Object.keys(vt.layers)) {
      const layer = vt.layers[lname];
      for (let f = 0; f < layer.length && features.length < 900; f++) {
        const feat = layer.feature(f);
        if (feat.type !== 3) continue;
        const p = feat.properties || {};
        const props = readProps(p, d.kind, d.badge);
        const key = `${d.badge}|${props.name}|${x}|${y}|${f}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let rings;
        try { rings = feat.loadGeometry(); } catch { continue; }
        const coords = rings
          .map(r => r.map(pt => tileToLonLat(x, y, z, pt.x, pt.y)))
          .filter(r => r.length >= 4);
        if (!coords.length) continue;
        features.push({
          type: 'Feature',
          properties: props,
          geometry: { type: 'Polygon', coordinates: coords }
        });
      }
    }
  });
  return { type: 'FeatureCollection', features };
}

module.exports = { attributeHotspots, lookupPoint, concessionsInBbox, DATASETS };
