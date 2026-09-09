'use strict';
/**
 * Modul gunung api & sebaran abu vulkanik.
 *
 * Sumber terbuka:
 *  - Smithsonian Global Volcanism Program (GVP) WFS  -> daftar & posisi gunung api Indonesia
 *  - GVP Weekly Volcanic Activity Report (RSS)       -> gunung yang sedang erupsi pekan ini
 *  - Open-Meteo (model ECMWF/GFS)                    -> angin ketinggian 700/500/250 hPa
 *
 * Model sebaran abu di sini adalah PERKIRAAN INDIKATIF berbasis angin ketinggian,
 * bukan produk resmi VAAC. Untuk penerbangan, rujukan resmi wilayah Indonesia
 * adalah Darwin VAAC (BoM) dan PVMBG/MAGMA ESDM.
 */

const { fetchStatus, normalizeName } = require('./pvmbg');
const { fetchEruptions } = require('./eruption');

const BBOX = { west: 94.5, south: -11.5, east: 141.5, north: 6.5 };

const GVP_WFS = 'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows';
const GVP_RSS = 'https://volcano.si.edu/news/WeeklyVolcanoRSS.xml';

// Ketinggian kolom abu -> lapisan tekanan angin yang dipakai.
const ASH_LEVELS = [
  { id: 'low', hPa: 700, km: 3, label: 'Rendah (~3 km)', color: '#fbbf24' },
  { id: 'mid', hPa: 500, km: 6, label: 'Menengah (~6 km)', color: '#fb923c' },
  { id: 'high', hPa: 250, km: 10, label: 'Tinggi (~10 km)', color: '#f87171' }
];

const R = 6371;
const toRad = d => (d * Math.PI) / 180;
const toDeg = r => (r * 180) / Math.PI;

function destPoint(lat, lon, bearingDeg, distKm) {
  const br = toRad(bearingDeg), d = distKm / R, la = toRad(lat), lo = toRad(lon);
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
  const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [toDeg(la2), ((toDeg(lo2) + 540) % 360) - 180];
}

/** Ambil daftar gunung api Holosen Indonesia dari GVP (WFS GeoJSON). */
async function fetchVolcanoes(fetchWithTimeout) {
  const url = GVP_WFS
    + '?service=WFS&version=2.0.0&request=GetFeature'
    + '&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes'
    + '&outputFormat=application/json&count=1000'
    + "&CQL_FILTER=" + encodeURIComponent("Country='Indonesia'");
  const r = await fetchWithTimeout(url, {}, 25000);
  if (!r.ok) throw new Error('gvp_wfs_' + r.status);
  const j = await r.json();
  const out = [];
  for (const f of (j.features || [])) {
    const g = f.geometry, p = f.properties || {};
    if (!g || g.type !== 'Point') continue;
    const lon = Number(g.coordinates[0]), lat = Number(g.coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < BBOX.south || lat > BBOX.north || lon < BBOX.west || lon > BBOX.east) continue;
    out.push({
      id: Number(p.Volcano_Number) || null,
      name: String(p.Volcano_Name || '').trim(),
      type: String(p.Primary_Volcano_Type || '').trim(),
      elevM: Number(p.Elevation) || null,
      lastEruption: p.Last_Eruption_Year != null ? String(p.Last_Eruption_Year) : null,
      region: String(p.Subregion || p.Region || '').trim(),
      lat: +lat.toFixed(4),
      lon: +lon.toFixed(4)
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

/**
 * Isi RSS GVP ter-escape (&lt;p&gt;), jadi entitas harus didekode DULU,
 * baru tag HTML-nya dibuang. Diulang agar escape ganda ikut bersih.
 */
function stripTags(s) {
  let t = String(s);
  for (let i = 0; i < 2; i++) t = decodeEntities(t).replace(/<[^>]*>/g, ' ');
  // Feed asli kadang memuat '?' menggantikan apostrof (mis. "Karangetang?s").
  t = t.replace(/([A-Za-z])\?(s|t|re|ve|ll|d)\b/g, "$1'$2");
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * Laporan aktivitas mingguan GVP -> gunung Indonesia yang sedang erupsi.
 * Judul item berbentuk: "Nama (Indonesia) - Report for ... - New/Continuing Eruptive Activity".
 */
async function fetchWeeklyActivity(fetchWithTimeout) {
  const r = await fetchWithTimeout(GVP_RSS, {}, 20000);
  if (!r.ok) throw new Error('gvp_rss_' + r.status);
  // Feed GVP dideklarasikan ISO-8859-1 dan memakai byte Windows-1252
  // (mis. 0x92 = apostrof kurung). Tanpa dekode ini muncul karakter '?'.
  const raw = Buffer.from(await r.arrayBuffer());
  const xml = new TextDecoder('windows-1252').decode(raw);
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const out = [];
  for (const it of items) {
    const tm = /<title>([\s\S]*?)<\/title>/.exec(it);
    if (!tm) continue;
    const title = stripTags(tm[1]);
    const m = /^(.+?)\s*\((.+?)\)\s*-\s*(.*)$/.exec(title);
    if (!m) continue;
    const country = m[2].trim();
    if (!/indonesia/i.test(country)) continue;
    const rest = m[3];
    const status = /new eruptive/i.test(rest) ? 'baru'
      : /continuing eruptive/i.test(rest) ? 'berlanjut'
        : 'dilaporkan';
    const dm = /<description>([\s\S]*?)<\/description>/.exec(it);
    let summary = dm ? stripTags(dm[1]) : '';
    if (summary.length > 420) summary = summary.slice(0, 417).trimEnd() + '…';
    const lm = /<link>([\s\S]*?)<\/link>/.exec(it);
    const link = lm ? stripTags(lm[1]) : '';
    out.push({
      name: m[1].trim(),
      status,
      period: (/Report for (.+?)\s*-\s*(?:New|Continuing|Ongoing)\b/i.exec(rest)
        || /Report for (.+)$/i.exec(rest) || [, ''])[1].trim(),
      summary,
      link: /^https:\/\/(volcano\.si\.edu|www\.volcano\.si\.edu)\//.test(link) ? link : ''
    });
  }
  return out;
}

/** Nama GVP kadang berbeda ejaan; samakan secara longgar. */
function normName(s) {
  return String(s).toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^gunung|^mount|^mt/, '');
}

/** Angin ketinggian di posisi gunung untuk tiap lapisan abu. */
async function fetchAloftWind(fetchWithTimeout, pts) {
  if (!pts.length) return [];
  const lats = pts.map(p => p.lat.toFixed(3)).join(',');
  const lons = pts.map(p => p.lon.toFixed(3)).join(',');
  const params = ASH_LEVELS
    .map(l => `wind_speed_${l.hPa}hPa,wind_direction_${l.hPa}hPa`)
    .join(',');
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lats}&longitude=${lons}`
    + `&current=${params}&wind_speed_unit=ms`;
  const r = await fetchWithTimeout(url, {}, 25000);
  if (!r.ok) throw new Error('aloft_' + r.status);
  const j = await r.json();
  return Array.isArray(j) ? j : [j];
}

/**
 * Pluma abu: kerucut searah angin di setiap lapisan ketinggian.
 * Panjang jangkauan tumbuh dengan kecepatan angin & ketinggian kolom.
 */
function ashPlume(lat, lon, level, speed, fromDeg, observedToDeg) {
  // Angin dilaporkan sebagai arah ASAL; abu bergerak ke arah sebaliknya.
  // Bila petugas pos pantau mencatat arah condong kolom secara visual,
  // pengamatan itu mengalahkan model — untuk lapisan terendah, yang paling
  // dekat dengan bagian kolom yang benar-benar terlihat dari pos.
  const to = Number.isFinite(observedToDeg) ? observedToDeg : (fromDeg + 180) % 360;
  // abu di lapisan lebih tinggi terbawa lebih jauh sebelum jatuh
  const reach = Math.min(600, 25 + speed * 11 * (level.km / 3) ** 0.6);

  // Bentuk mengikuti cara VAAC menggambar advisory abu: poligon area
  // dengan ujung tumpul, bukan potongan lingkaran beralas satu titik.
  //
  // Kerucut beralas titik keliru menggambarkan dua hal. Pertama, abu tidak
  // keluar dari satu titik matematis — kolom erupsi sudah punya lebar
  // beberapa kilometer di atas kawah. Kedua, ujung runcing-melengkung
  // membuat batas terjauh tampak lebih pasti daripada kenyataannya,
  // padahal di sanalah ketidakpastiannya paling besar.
  //
  // Lebar dihitung dari sudut sebaran yang sama seperti sebelumnya,
  // sehingga cakupannya setara; yang berubah hanya bentuknya menjadi
  // area tertutup yang benar-benar menyelimuti wilayah terdampak.
  const half = Math.max(10, 30 - speed * 1.4);
  const spread = Math.tan(toRad(half));

  // Lebar di kawah, di tengah jalur, dan di ujung terjauh.
  const wNear = Math.max(3, reach * 0.05);
  const wMid = Math.max(wNear, reach * 0.5 * spread);
  const wFar = Math.max(wMid, reach * spread);

  const left = to - 90;
  const right = to + 90;

  // Titik tengah sumbu pada tiga jarak, lalu digeser tegak lurus ke kiri
  // dan kanan. Hasilnya poligon bersisi lurus dengan ujung tumpul —
  // bentuk yang sama seperti pada bagan advisory resmi.
  const axis = [
    { d: 0, w: wNear },
    { d: reach * 0.5, w: wMid },
    { d: reach, w: wFar }
  ].map(seg => {
    const c = seg.d === 0 ? [lat, lon] : destPoint(lat, lon, to, seg.d);
    return {
      l: destPoint(c[0], c[1], left, seg.w),
      r: destPoint(c[0], c[1], right, seg.w)
    };
  });

  const ring = [
    axis[0].l, axis[1].l, axis[2].l,   // sisi kiri, dari kawah ke ujung
    axis[2].r, axis[1].r, axis[0].r,   // sisi kanan, kembali ke kawah
    axis[0].l
  ];

  return {
    level: level.id,
    levelLabel: level.label,
    altKm: level.km,
    color: level.color,
    speed: +speed.toFixed(1),
    from: Math.round(fromDeg),
    to: Math.round(to),
    observedDirection: Number.isFinite(observedToDeg),
    // Setengah sudut tetap diekspor sebagai keterangan sebaran.
    halfAngleDeg: +half.toFixed(1),
    reachKm: Math.round(reach),
    widthNearKm: +wNear.toFixed(1),
    widthFarKm: +wFar.toFixed(1),
    polygon: ring.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)])
  };
}

/**
 * Gabungan: gunung erupsi + posisi + pluma abu per lapisan.
 * Dipanggil lewat wrapper `cached()` di server.js.
 */
async function volcanicAsh(fetchWithTimeout, statusProvider, eruptionProvider) {
  // statusProvider memungkinkan server.js menyuntikkan status PVMBG yang
  // sudah di-cache terpisah, supaya permintaan MAGMA yang lambat (~22 dtk)
  // tidak diulang setiap kali data gunung dibangun.
  const getStatus = statusProvider || (() => fetchStatus(fetchWithTimeout));
  const [volcanoes, weekly, status, eruptions] = await Promise.all([
    fetchVolcanoes(fetchWithTimeout).catch(() => []),
    fetchWeeklyActivity(fetchWithTimeout).catch(() => []),
    Promise.resolve().then(getStatus).catch(e => { console.error('[pvmbg]', e.message); return null; }),
    // Laporan letusan dijadwalkan terpisah; pakai hasil yang sudah di-cache
    // agar halaman MAGMA yang lambat (~40 dtk) tidak ditarik dua kali dalam
    // satu putaran penyegaran.
    Promise.resolve()
      .then(eruptionProvider || (() => fetchEruptions(fetchWithTimeout)))
      .catch(e => { console.error('[letusan]', e.message); return null; })
  ]);

  const byName = new Map();
  for (const v of volcanoes) byName.set(normName(v.name), v);

  // Sebuah gunung dianggap perlu dipantau bila SALAH SATU terpenuhi:
  //   (a) muncul di laporan mingguan GVP, atau
  //   (b) status resmi PVMBG minimal Waspada (level >= 2).
  // Tanpa (b), gunung yang baru naik status tidak akan tampil sampai GVP
  // menerbitkan laporan pekan berikutnya - bisa tertinggal berhari-hari.
  const picked = new Map();

  for (const w of weekly) {
    const v = byName.get(normName(w.name));
    if (!v) continue;
    picked.set(v.name, { ...v, activity: w, sources: ['GVP'] });
  }

  if (status) {
    // Cocokkan nama PVMBG dengan katalog GVP (penamaan bisa berbeda,
    // mis. "Anak Krakatau" vs "Krakatau", "Lewotobi Laki-laki" vs "Lewotobi").
    const gvpKeys = new Map();
    for (const v of volcanoes) gvpKeys.set(normalizeName(v.name), v);

    for (const st of status.volcanoes) {
      let v = gvpKeys.get(st.key);
      if (!v) {
        for (const [k, cand] of gvpKeys) {
          if (k.includes(st.key) || st.key.includes(k)) { v = cand; break; }
        }
      }
      if (!v) continue;

      const prev = picked.get(v.name);
      if (prev) {
        // Satu entri GVP bisa mewakili beberapa puncak PVMBG
        // (mis. Lewotobi Laki-laki & Perempuan). Ambil status TERTINGGI
        // agar puncak yang Siaga tidak tertimpa puncak yang Normal.
        if (!prev.official || st.level > prev.official.level) prev.official = st;
        if (!prev.sources.includes('PVMBG')) prev.sources.push('PVMBG');
      } else if (st.level >= 2) {
        picked.set(v.name, { ...v, activity: null, official: st, sources: ['PVMBG'] });
      }
    }
  }

  // Prioritaskan status resmi tertinggi, lalu yang sedang erupsi menurut GVP.
  const erupting = [...picked.values()].sort((a, b) => {
    const la = a.official ? a.official.level : 0;
    const lb = b.official ? b.official.level : 0;
    if (lb !== la) return lb - la;
    return (b.activity ? 1 : 0) - (a.activity ? 1 : 0);
  });

  // Lekatkan laporan pos pantau ke tiap gunung.
  const erKey = eruptions ? eruptions.byKey : {};
  for (const v of erupting) {
    const k = normalizeName(v.name);
    let rep = erKey[k];
    if (!rep) {
      for (const [rk, cand] of Object.entries(erKey)) {
        if (rk.includes(k) || k.includes(rk)) { rep = cand; break; }
      }
    }
    v.eruption = rep || null;
  }

  // GERBANG SEBARAN ABU.
  //
  // Pluma HANYA digambar bila ada laporan letusan dari pos pengamatan dalam
  // 24 jam terakhir. Status Siaga/Awas TIDAK lagi cukup: status menyatakan
  // tingkat kewaspadaan, bukan bahwa gunung sedang melontarkan material.
  // Merapi berstatus Siaga menahun tanpa erupsi eksplosif — aturan lama
  // membuat peta menampilkan kepulan abu dan daftar wilayah terdampak untuk
  // peristiwa yang tidak pernah terjadi.
  //
  // Bila MAGMA sedang tidak bisa dihubungi (eruptions === null), lebih baik
  // tidak menggambar pluma apa pun daripada menebak dari status.
  const needPlume = erupting.filter(v => v.eruption);

  let winds = [];
  try { winds = await fetchAloftWind(fetchWithTimeout, needPlume); } catch { winds = []; }
  const windIdx = new Map(needPlume.map((v, i) => [v.name, i]));

  const active = erupting.map(v => {
    const i = windIdx.has(v.name) ? windIdx.get(v.name) : -1;
    const c = (i >= 0 && winds[i] && winds[i].current) || {};
    const plumes = [];

    if (v.eruption) {
      // Tinggi kolom yang benar-benar teramati membatasi lapisan mana yang
      // masuk akal digambar. Kolom 700 m tidak mencapai 6 km, apalagi 10 km;
      // menggambar ketiga lapisan untuk letusan kecil melebih-lebihkan dampak.
      // Toleransi 1,5x diberikan karena tinggi kolom hanya terbaca sampai
      // batas awan dan sering terlapor lebih rendah dari sebenarnya.
      const hKm = v.eruption.maxHeightM ? v.eruption.maxHeightM / 1000 : null;
      const obsTo = Number.isFinite(v.eruption.bearingDeg) ? v.eruption.bearingDeg : null;

      for (const lv of ASH_LEVELS) {
        // Tinggi tidak teramati (letusan malam/tertutup kabut) berarti kolomnya
        // TIDAK diketahui besar — bukan berarti boleh diasumsikan raksasa.
        // Batasi pada lapisan terendah saja supaya ketidaktahuan tidak
        // berubah menjadi klaim sebaran ratusan kilometer.
        if (hKm === null && lv.id !== 'low') continue;
        if (hKm !== null && lv.km > Math.max(3, hKm * 1.5)) continue;
        const sp = Number(c[`wind_speed_${lv.hPa}hPa`]);
        const fr = Number(c[`wind_direction_${lv.hPa}hPa`]);
        if (!Number.isFinite(sp) || !Number.isFinite(fr)) continue;
        // Pengamatan visual hanya diterapkan pada lapisan terendah; arah
        // lapisan atas tetap dari model karena tak terlihat dari darat.
        plumes.push(ashPlume(v.lat, v.lon, lv, sp, fr, lv.id === 'low' ? obsTo : null));
      }
    }

    return { ...v, plumes };
  });

  return {
    updatedAt: new Date().toISOString(),
    levels: ASH_LEVELS,
    // "Aktif" kini berarti ada laporan letusan pos pantau dalam 24 jam,
    // bukan sekadar berstatus tinggi.
    eruptingCount: active.filter(v => v.eruption).length,
    monitoredCount: active.length,
    activeCount: active.filter(v => v.eruption).length,
    eruptions: eruptions ? {
      updatedAt: eruptions.updatedAt,
      windowHours: eruptions.windowHours,
      total: eruptions.total,
      stale: !!eruptions.stale,
      sourceUrl: eruptions.sourceUrl,
      reports: eruptions.reports.slice(0, 30),
      volcanoes: eruptions.volcanoes
    } : null,
    totalVolcanoes: volcanoes.length,
    active,
    volcanoes,
    official: status ? {
      stale: !!status.stale, counts: status.counts, total: status.total, sourceUrl: status.sourceUrl } : null,
    source: 'Pos Pengamatan Gunung Api PVMBG (laporan letusan & status resmi) + Smithsonian GVP (katalog) '
      + '+ angin ketinggian Open-Meteo',
    disclaimer: 'Sebaran abu hanya digambar untuk gunung yang dilaporkan meletus oleh pos pengamatan '
      + 'dalam 24 jam terakhir. Status Siaga/Awas saja tidak menghasilkan sebaran, karena status menyatakan '
      + 'tingkat kewaspadaan — bukan bahwa gunung sedang melontarkan abu. Bentuk sebaran bersifat indikatif '
      + 'dari model angin ketinggian, bukan advisory resmi. Rujukan penerbangan: Darwin VAAC (BoM).'
  };
}

module.exports = { volcanicAsh, ASH_LEVELS, BBOX };
