'use strict';
/**
 * Mesin pencarian & penjawab lokal (RAG tanpa LLM eksternal).
 *
 * Alur:
 *  1. Seluruh data langsung (titik api, daerah terdampak, provinsi, konsesi,
 *     kualitas udara, gunung api, berita) diubah jadi "dokumen" berteks.
 *  2. Dokumen diindeks dengan BM25 + normalisasi bahasa Indonesia sederhana.
 *  3. Kueri pengguna diambil dokumen paling relevan, lalu jawaban disusun
 *     dari ANGKA NYATA pada dokumen tersebut — bukan karangan model.
 *
 * Setiap jawaban selalu menyertakan sumber sehingga bisa ditelusuri.
 */

// Kata umum bahasa Indonesia yang tidak membantu pencarian.
const STOP = new Set(('yang di ke dari dan atau untuk pada dengan ini itu ada adalah '
  + 'apa siapa mana bagaimana berapa kapan mengapa kenapa saja juga akan sudah telah '
  + 'the of in on at a an is are was were to for and or').split(/\s+/));

// Imbuhan yang dipangkas agar "kebakaran"~"bakar", "terdampak"~"dampak".
function stem(w) {
  let s = w;
  s = s.replace(/^(mem|men|meng|meny|me|pem|pen|peng|peny|di|ter|ke|se|ber|per)/, m =>
    (s.length - m.length >= 4 ? '' : m));
  s = s.replace(/(kan|an|nya|i)$/, m => (s.length - m.length >= 4 ? '' : m));
  return s;
}

function tokenize(text) {
  return String(text).toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s.-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w))
    .map(stem);
}

/** Indeks BM25 sederhana. */
class BM25 {
  constructor(docs, k1 = 1.4, b = 0.72) {
    this.docs = docs;
    this.k1 = k1; this.b = b;
    this.df = new Map();
    this.tf = [];
    this.len = [];
    let total = 0;
    for (const d of docs) {
      const toks = tokenize(d.text);
      const m = new Map();
      for (const t of toks) m.set(t, (m.get(t) || 0) + 1);
      this.tf.push(m);
      this.len.push(toks.length);
      total += toks.length;
      for (const t of m.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    }
    this.avg = docs.length ? total / docs.length : 1;
  }

  search(query, limit = 8) {
    const q = tokenize(query);
    if (!q.length) return [];
    const N = this.docs.length;
    const out = [];
    for (let i = 0; i < N; i++) {
      let score = 0;
      for (const t of q) {
        const f = this.tf[i].get(t);
        if (!f) continue;
        const n = this.df.get(t) || 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        const norm = f * (this.k1 + 1) /
          (f + this.k1 * (1 - this.b + this.b * (this.len[i] / this.avg)));
        score += idf * norm;
      }
      // dokumen prioritas tinggi (mis. ringkasan nasional) sedikit diangkat
      if (score > 0) out.push({ doc: this.docs[i], score: score * (this.docs[i].boost || 1) });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }
}

const nf = new Intl.NumberFormat('id-ID');
const fmt = n => nf.format(Math.round(Number(n) || 0));

/** Susun seluruh data langsung menjadi dokumen teks yang bisa dicari. */
function buildDocs(ctx) {
  const docs = [];
  const ov = ctx.overview || {};
  const st = ov.stats || {};

  if (ov.meta) {
    docs.push({
      id: 'ringkasan',
      kind: 'ringkasan',
      title: 'Ringkasan nasional karhutla',
      boost: 1.35,
      text: `ringkasan nasional titik api hotspot kebakaran hutan lahan karhutla Indonesia total `
        + `${st.hotspots || 0} titik api terdeteksi, ${st.highConfidence || 0} keyakinan tinggi, `
        + `total daya radiasi FRP ${Math.round(st.totalFrp || 0)} megawatt, `
        + `${st.impactedRegions || 0} daerah terdampak asap, `
        + `${fmt(st.peopleExposed || 0)} warga terpapar. Sumber data ${ov.meta.source || ''}.`,
      data: { stats: st, meta: ov.meta }
    });
  }

  for (const im of (ov.impacted || [])) {
    docs.push({
      id: 'dampak:' + im.name,
      kind: 'daerah',
      title: im.name + ' · ' + (im.prov || ''),
      text: `daerah terdampak asap kabut ${im.name} ${im.prov || ''} indeks dampak `
        + `${im.score} tingkat ${im.level || ''} jarak ${Math.round(im.nearestKm || 0)} km dari klaster api `
        + `penduduk ${fmt(im.population || 0)} jiwa`,
      data: im
    });
  }

  for (const pv of (ov.provinceRanking || [])) {
    docs.push({
      id: 'provinsi:' + pv.province,
      kind: 'provinsi',
      title: 'Provinsi ' + pv.province,
      text: `provinsi ${pv.province} jumlah titik api hotspot ${pv.hotspots} `
        + `daya radiasi FRP ${Math.round(pv.frp || 0)} megawatt kebakaran hutan lahan`,
      data: pv
    });
  }

  const cl = (ov.plumes || []).slice(0, 25);
  for (const c of cl) {
    docs.push({
      id: 'klaster:' + c.lat + ',' + c.lon,
      kind: 'klaster',
      title: 'Klaster api ' + (c.province || (c.lat.toFixed(2) + ', ' + c.lon.toFixed(2))),
      text: `klaster titik api kebakaran sebaran asap ${c.province || ''} berisi ${c.count} titik `
        + `daya radiasi ${Math.round(c.frp || 0)} megawatt koordinat ${c.lat.toFixed(2)} ${c.lon.toFixed(2)} `
        + `angin ${c.wind ? c.wind.speed + ' meter per detik' : ''} panjang pluma ${c.lengthKm || 0} km`,
      data: c
    });
  }

  const at = ctx.attribution || {};
  for (const u of (at.units || []).slice(0, 30)) {
    docs.push({
      id: 'konsesi:' + (u.name || '') + ':' + (u.badge || ''),
      kind: 'konsesi',
      title: u.name || 'Unit lahan',
      text: `konsesi perusahaan pemilik lahan tanggung jawab perizinan ${u.name || ''} `
        + `${u.company || ''} jenis ${u.kind || u.badge || ''} grup ${u.group || ''} `
        + `berisi ${u.hotspotCount || 0} titik api kebakaran di dalam batas konsesi `
        + `luas ${fmt(u.areaHa || 0)} hektar daya radiasi ${Math.round(u.totalFrp || 0)} megawatt`,
      data: u
    });
  }
  if (at.analyzed) {
    docs.push({
      id: 'atribusi',
      kind: 'konsesi',
      title: 'Ringkasan titik api di dalam konsesi',
      boost: 1.2,
      text: `atribusi tanggung jawab lahan konsesi perusahaan siapa bertanggung jawab `
        + `${at.insideConcession || 0} dari ${at.analyzed || 0} titik api berada di dalam batas konsesi `
        + `sawit kayu tambang HPH RSPO`,
      data: { analyzed: at.analyzed, insideConcession: at.insideConcession }
    });
  }

  const air = ctx.air || {};
  if (air.worst) {
    docs.push({
      id: 'udara',
      kind: 'udara',
      title: 'Kualitas udara terburuk',
      boost: 1.2,
      text: `kualitas udara polusi ISPA asap AQI indeks ${air.worst.aqi} kategori ${air.worst.label} `
        + `PM2.5 ${air.worst.pm25 || '-'} mikrogram di ${air.worst.province || ''} `
        + `koordinat ${air.worst.lat} ${air.worst.lon}`,
      data: air.worst
    });
  }

  const vo = ctx.volcano || {};
  for (const v of (vo.active || [])) {
    const dirs = (v.plumes || []).map(p => p.reachKm + ' km').join(', ');
    docs.push({
      id: 'gunung:' + v.name,
      kind: 'gunung',
      title: 'Gunung ' + v.name,
      text: `gunung api vulkanik erupsi abu vulkanik ${v.name} status erupsi ${v.activity ? v.activity.status : ''} `
        + `${v.official ? 'status resmi pvmbg level ' + v.official.level + ' ' + v.official.status
            + ' ' + (v.official.province || '') + ' siaga awas waspada normal' : ''} `
        + `tipe ${v.type || ''} ketinggian ${v.elevM || ''} mdpl wilayah ${v.region || ''} `
        + `jangkauan sebaran abu ${dirs} ${v.activity ? v.activity.summary : ''}`,
      data: v
    });
  }

  const hz = ctx.hazard || {};
  const qk = hz.quakes || {};
  if (qk.latest) {
    const L = qk.latest;
    docs.push({
      id: 'gempa:latest',
      kind: 'gempa',
      title: 'Gempa M' + L.magnitude + ' — ' + L.area,
      text: `gempa bumi terkini magnitudo ${L.magnitude} kedalaman ${L.depthKm} km `
        + `${L.area} ${L.dateLabel} ${L.potensi || ''} ${L.felt || ''} `
        + `${L.tsunami ? 'berpotensi tsunami peringatan dini' : 'tidak berpotensi tsunami'} bmkg`,
      data: L
    });
  }
  for (const ev of ((hz.shelters && hz.shelters.events) || [])) {
    docs.push({
      id: 'pengungsi:' + ev.id,
      kind: 'pengungsi',
      title: 'Pengungsi ' + ev.label,
      text: `pengungsi mengungsi korban terdampak posko pengungsian ${ev.label} ${ev.hazard} `
        + `${ev.total} jiwa ${ev.sites} titik bnpb `
        + ev.topAreas.map(a => a.area + ' ' + a.people).join(' '),
      data: ev
    });
  }

  for (const a of (ctx.news || [])) {
    docs.push({
      id: 'berita:' + a.url,
      kind: 'berita',
      title: a.title,
      text: `berita penanganan ${a.topicLabel || ''} ${a.title} sumber ${a.domain || ''} `
        + (a.topic === 'pusat' ? 'presiden ratas rapat terbatas instruksi pemerintah pusat kebijakan ' : '')
        + (a.topic === 'penanganan' ? 'bnpb bpbd manggala agni water bombing modifikasi cuaca satgas operasi pemadaman ' : '')
        + (a.topic === 'daerah' ? 'gubernur bupati status siaga darurat tanggap darurat daerah provinsi ' : '')
        + (a.topic === 'penegakan' ? 'klhk gakkum tersangka sanksi segel penyidikan hukum korporasi ' : '')
        + (a.topic === 'kesehatan' ? 'ispa kualitas udara ispu sekolah diliburkan kesehatan warga ' : ''),
      data: a
    });
  }

  return docs;
}

/** Deteksi maksud kueri agar jawaban langsung menjawab, bukan sekadar daftar. */
function detectIntent(q) {
  const s = q.toLowerCase();
  if (/\b(siapa|perusahaan|pemilik|konsesi|tanggung jawab|hgu|bertanggung)\b/.test(s)) return 'konsesi';
  if (/\b(udara|aqi|ispa|polusi|pm2|napas|asap.*sehat)\b/.test(s)) return 'udara';
  if (/\b(gempa|magnitudo|richter|seismik|tsunami|guncang)\b/.test(s)) return 'gempa';
  if (/\b(pengungsi|mengungsi|posko|pengungsian|korban)\b/.test(s)) return 'pengungsi';
  if (/\b(gunung|vulkanik|erupsi|abu|letusan)\b/.test(s)) return 'gunung';
  if (/\b(berita|kabar|terkini|penanganan|update)\b/.test(s)) return 'berita';
  if (/\b(provinsi|wilayah|daerah mana|paling banyak)\b/.test(s)) return 'provinsi';
  if (/\b(terdampak|kota|kabupaten|warga|penduduk|terpapar)\b/.test(s)) return 'daerah';
  if (/\b(angin|arah|sebaran|kemana|ke mana)\b/.test(s)) return 'angin';
  return 'umum';
}

/** Rangkai jawaban dari data nyata pada dokumen teratas. */
function compose(intent, hits, ctx) {
  const lines = [];
  const ov = ctx.overview || {};
  const st = ov.stats || {};
  const pick = k => hits.filter(h => h.doc.kind === k).map(h => h.doc);

  if (intent === 'konsesi') {
    const at = ctx.attribution || {};
    if (at.analyzed) {
      lines.push(`${fmt(at.insideConcession)} dari ${fmt(at.analyzed)} titik api yang dianalisis `
        + `berada di dalam batas konsesi.`);
    }
    const units = pick('konsesi').filter(d => d.data && d.data.hotspotCount);
    const top = (units.length ? units : (at.units || []).slice(0, 5).map(u => ({ data: u })))
      .slice(0, 5);
    for (const u of top) {
      const d = u.data;
      lines.push(`${d.name} (${d.kind || 'konsesi'}${d.group ? ' · ' + d.group : ''}) — `
        + `${d.hotspotCount} titik api, FRP ${fmt(d.totalFrp || 0)} MW.`);
    }
    lines.push('Catatan: batas konsesi berasal dari kompilasi Global Forest Watch (KLHK/ESDM/RSPO), '
      + 'bukan sertifikat HGU resmi ATR/BPN. Titik api di dalam konsesi tidak otomatis berarti '
      + 'perusahaan yang membakar.');
    return lines;
  }

  if (intent === 'udara') {
    const air = (ctx.air || {}).worst;
    if (air) {
      lines.push(`Kualitas udara terburuk saat ini US AQI ${air.aqi} (${air.label})`
        + `${air.province ? ' di ' + air.province : ''}`
        + `${air.pm25 ? `, PM2,5 ${air.pm25} µg/m³` : ''}.`);
      if (air.aqi > 150) lines.push('Pada tingkat ini warga disarankan membatasi aktivitas luar ruang dan memakai masker N95.');
    } else lines.push('Data kualitas udara belum tersedia.');
    return lines;
  }

  if (intent === 'gempa') {
    const qk2 = (ctx.hazard && ctx.hazard.quakes) || {};
    if (qk2.latest) {
      const L = qk2.latest;
      lines.push(`Gempa terkini: M${L.magnitude} di ${L.area}, kedalaman ${L.depthKm} km (${L.dateLabel}).`);
      if (L.potensi) lines.push(`Status BMKG: ${L.potensi}.`);
      if (L.felt) lines.push(`Dirasakan: ${L.felt}.`);
      lines.push(`${qk2.counts.total} gempa tercatat pada data terkini, ${qk2.counts.kuat} di antaranya magnitudo 5 atau lebih.`);
    } else lines.push('Data gempa BMKG belum tersedia.');
    return lines;
  }

  if (intent === 'pengungsi') {
    const evs = ((ctx.hazard && ctx.hazard.shelters && ctx.hazard.shelters.events) || []);
    if (!evs.length) { lines.push('Belum ada data pengungsi resmi BNPB yang aktif.'); return lines; }
    for (const ev of evs) {
      lines.push(`${ev.label}: ${fmt(ev.total)} jiwa mengungsi di ${fmt(ev.sites)} titik `
        + `(${fmt(ev.terpusat)} di posko terpusat, ${fmt(ev.mandiri)} mandiri).`);
      for (const a of ev.topAreas.slice(0, 4)) lines.push(`  ${a.area}: ${fmt(a.people)} jiwa.`);
    }
    lines.push('Sumber: BNPB. Angka mengikuti laporan BPBD dan dapat berubah.');
    return lines;
  }

  if (intent === 'gunung') {
    const vo = ctx.volcano || {};
    const oc = (vo.official && vo.official.counts) || null;
    if (oc) {
      lines.push(`Status resmi PVMBG saat ini: ${oc.Awas} Awas, ${oc.Siaga} Siaga, `
        + `${oc.Waspada} Waspada, dari ${vo.official.total} gunung api yang dipantau.`);
    }
    lines.push(`${vo.activeCount || 0} gunung sedang dipantau di dasbor ini `
      + '(berstatus minimal Waspada atau dilaporkan erupsi).');
    for (const d of pick('gunung').slice(0, 4)) {
      const v = d.data;
      const far = (v.plumes || []).reduce((m, p) => Math.max(m, p.reachKm), 0);
      const st = v.official ? `Level ${v.official.level} (${v.official.status})` : 'status resmi tidak tercatat';
      lines.push(`${v.name} — ${st}`
        + `${v.activity ? ' · erupsi ' + v.activity.status + ' menurut GVP' : ''}`
        + `${v.region ? ' · ' + v.region : ''}${far ? `, abu diperkirakan terbawa hingga ${fmt(far)} km` : ''}.`);
    }
    lines.push('Status Normal/Waspada/Siaga/Awas ditetapkan PVMBG. Sebaran abu di peta bersifat indikatif '
      + 'dari angin ketinggian, bukan advisory resmi Darwin VAAC.');
    return lines;
  }

  if (intent === 'provinsi') {
    const pv = pick('provinsi').slice(0, 5);
    const list = pv.length ? pv : (ov.provinceRanking || []).slice(0, 5).map(p => ({ data: p }));
    lines.push('Provinsi dengan titik api terbanyak:');
    list.forEach((d, i) => lines.push(`${i + 1}. ${d.data.province} — ${d.data.hotspots} titik api, FRP ${fmt(d.data.frp)} MW.`));
    return lines;
  }

  if (intent === 'daerah') {
    const im = pick('daerah').slice(0, 5);
    const list = im.length ? im : (ov.impacted || []).slice(0, 5).map(p => ({ data: p }));
    lines.push(`${(ov.impacted || []).length} kota/kabupaten terdampak asap, `
      + `sekitar ${fmt(st.peopleExposed || 0)} warga terpapar.`);
    list.forEach(d => lines.push(`${d.data.name} · ${d.data.prov || ''} — indeks ${d.data.score} `
      + `(${d.data.level || ''}), ${fmt(d.data.population || 0)} jiwa, ${Math.round(d.data.nearestKm || 0)} km dari klaster api.`));
    return lines;
  }

  if (intent === 'angin') {
    const cl = (ov.plumes || []).filter(c => c.wind).slice(0, 4);
    if (cl.length) {
      lines.push('Arah sebaran asap dari klaster api terbesar:');
      for (const c of cl) {
        lines.push(`${c.lat.toFixed(2)}, ${c.lon.toFixed(2)} (${c.count} titik) — `
          + `angin ${c.wind.speed} m/s, asap terbawa ke arah ${c.bearingTo}° sejauh ~${c.lengthKm} km.`);
      }
    } else lines.push('Data angin per klaster belum tersedia.');
    return lines;
  }

  if (intent === 'berita') {
    const ns = pick('berita').slice(0, 5);
    const list = ns.length ? ns : (ctx.news || []).slice(0, 5).map(a => ({ data: a, title: a.title }));
    lines.push('Berita penanganan terbaru:');
    list.forEach(d => lines.push(`${d.title || d.data.title} — ${d.data.domain || ''}`));
    return lines;
  }

  // umum: ringkasan situasi + cuplikan dokumen paling relevan
  lines.push(`${fmt(st.hotspots || 0)} titik api terdeteksi (${fmt(st.highConfidence || 0)} keyakinan tinggi), `
    + `total FRP ${fmt(st.totalFrp || 0)} MW, ${st.impactedRegions || 0} daerah terdampak, `
    + `${fmt(st.peopleExposed || 0)} warga terpapar.`);
  for (const h of hits.slice(0, 4)) lines.push(h.doc.title);
  return lines;
}

/** Titik masuk: kembalikan jawaban + sumber terkait. */
function answer(query, ctx) {
  const docs = buildDocs(ctx);
  const idx = new BM25(docs);
  const hits = idx.search(query, 10);
  const intent = detectIntent(query);
  const lines = compose(intent, hits, ctx);

  const sources = hits.slice(0, 6).map(h => ({
    kind: h.doc.kind,
    title: h.doc.title,
    url: h.doc.kind === 'berita' && h.doc.data ? h.doc.data.url : null,
    score: +h.score.toFixed(2)
  }));

  return {
    query,
    intent,
    answer: lines,
    sources,
    indexed: docs.length,
    updatedAt: new Date().toISOString()
  };
}

module.exports = { answer, buildDocs, BM25, tokenize };
