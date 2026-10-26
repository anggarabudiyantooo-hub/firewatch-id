'use strict';
/**
 * Mesin pencarian & penjawab lokal (RAG tanpa LLM eksternal).
 *
 * Alur:
 *  1. Seluruh data langsung (titik api, daerah terdampak, provinsi, konsesi,
 *     kualitas udara, gunung api, berita) diubah jadi "dokumen" berteks.
 *  2. Dokumen diindeks dengan BM25 + normalisasi bahasa Indonesia sederhana.
 *  3. Kueri pengguna diambil dokumen paling relevan, lalu jawaban disusun
 *     dari ANGKA NYATA pada dokumen tersebut, bukan karangan model.
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
const nfEn = new Intl.NumberFormat('en-US');
const fmt = (n, language = 'id') => (language === 'en' ? nfEn : nf).format(Math.round(Number(n) || 0));

function impactSummary(overview, language = 'id') {
  const model = overview && overview.impactModel;
  if (language === 'en') {
    if (model && model.status === 'wind-unavailable') {
      return 'the modeled plume center count is unavailable because NOAA GFS 10 m wind data is missing; this does not mean there is no smoke';
    }
    if (model && model.status === 'no-detections') {
      return 'no FIRMS clusters were present in the data window for calculating modeled plume centers';
    }
    const stats = (overview && overview.stats) || {};
    const count = stats.modeledCenterCount != null ? stats.modeledCenterCount : stats.impactedRegions;
    let summary = `${fmt(count || 0, 'en')} city or regency centers intersect indicative plume geometry based on NOAA GFS 10 m winds`;
    if (model && model.status === 'partial') {
      summary += `; valid wind data for ${fmt(model.modeledClusters, 'en')} of ${fmt(model.inputClusters, 'en')} clusters`;
    }
    return summary;
  }
  if (model && model.status === 'wind-unavailable') {
    return 'perhitungan pusat plume model belum tersedia karena angin NOAA GFS 10 m tidak tersedia, bukan berarti tidak ada asap';
  }
  if (model && model.status === 'no-detections') {
    return 'tidak ada klaster FIRMS pada jendela data untuk menghitung pusat dalam plume model';
  }
  const stats = (overview && overview.stats) || {};
  const count = stats.modeledCenterCount != null ? stats.modeledCenterCount : stats.impactedRegions;
  let summary = `${fmt(count || 0)} pusat kota/kabupaten masuk geometri plume indikatif berbasis NOAA GFS 10 m`;
  if (model && model.status === 'partial') {
    summary += `; angin valid untuk ${fmt(model.modeledClusters)} dari ${fmt(model.inputClusters)} klaster`;
  }
  return summary;
}

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
      text: `ringkasan nasional titik api hotspot kebakaran hutan lahan karhutla Indonesia fire hotspot wildfire total `
        + `${st.hotspots || 0} titik api terdeteksi, ${st.highConfidence || 0} keyakinan tinggi, `
        + `total daya radiasi FRP ${Math.round(st.totalFrp || 0)} megawatt. `
        + `${impactSummary(ov)}, bukan laporan resmi dampak atau hitungan penduduk terpapar. `
        + `Sumber data ${ov.meta.source || ''}.`,
      data: { stats: st, meta: ov.meta }
    });
  }

  for (const im of (ov.impacted || [])) {
    docs.push({
      id: 'dampak:' + im.name,
      kind: 'daerah',
      title: 'Pusat kota dalam plume model: ' + im.name + ' · ' + (im.prov || ''),
      text: `model plume indikatif pusat permukiman ${im.name} ${im.prov || ''} `
        + `skor kedekatan model ${im.score} kategori ${im.level || ''} `
        + `jarak ${Math.round(im.nearestKm || 0)} km dari klaster api. `
        + `Bukan ukuran asap, paparan, laporan kesehatan, atau jumlah orang terdampak.`,
      data: im
    });
  }

  const reports = (ov.regionalHaze && ov.regionalHaze.meta) || {};
  if (reports.asmc) {
    const a = reports.asmc;
    docs.push({
      id: 'laporan:asmc', kind: 'regional',
      title: 'Laporan ASMC haze regional ' + (a.reportDate || ''),
      text: `laporan regional ASMC haze kabut asap lintas batas ${a.summary || ''} `
        + `${ov.regionalHaze.meta.spatialNote || ''} `
        + `Cakupan visual dibuat umum, bukan batas resmi, kontur observasi, atau konsentrasi.`,
      data: a
    });
  }
  if (reports.kemenkes) {
    const h = reports.kemenkes;
    docs.push({
      id: 'laporan:kemenkes', kind: 'health',
      title: 'Laporan kesehatan Kemenkes ' + (h.dataThrough || ''),
      text: `laporan kesehatan ISPA Kemenkes health acute respiratory infection ARI cases report ${h.cumulativeIspaCases || 0} kasus kumulatif `
        + `${h.districtCount || 0} kabupaten/kota ${h.provinceCount || 0} provinsi `
        + `${(h.provinces || []).join(', ')} data sampai ${h.dataThrough || ''}. `
        + `Angka kasus ISPA bukan jumlah penduduk terpapar plume atau ukuran konsentrasi asap.`,
      data: h
    });
  }
  if (reports.nea) {
    const n = reports.nea;
    docs.push({
      id: 'laporan:nea', kind: 'regional',
      title: 'Laporan NEA Singapura ' + (n.reportDate || ''),
      text: `laporan haze NEA Singapura ${n.statement || ''} `
        + `PM2.5 satu jam ${n.pm25OneHour ? n.pm25OneHour.min + '-' + n.pm25OneHour.max + ' ' + n.pm25OneHour.unit : ''} `
        + `PSI 24 jam ${n.psi24Hour ? n.psi24Hour.min + '-' + n.psi24Hour.max : ''}. `
        + `${n.airQualityNoteId || n.airQualityNote || 'Kualitas udara ambien bukan konsentrasi asap spesifik.'}`,
      data: n
    });
  }
  if (reports.bmkg) {
    const b = reports.bmkg;
    const duration = b.durationHours || {};
    const durationText = duration.minimum != null && duration.maximum != null
      ? `${duration.minimum}-${duration.maximum} jam` : 'durasi tidak tersedia';
    const altitudeText = b.altitudeMinimumKm != null
      ? `lebih dari ${b.altitudeMinimumKm} km` : 'ketinggian tidak tersedia';
    const sources = [
      {
        id: 'laporan:bmkg',
        title: 'Siaran resmi BMKG, observasi Jakarta ' + (b.officialObservationDate || ''),
        url: b.officialSourceUrl,
        evidence: [b.officialSummaryId, b.surfaceNoteId].filter(Boolean).join(' ')
      },
      {
        id: 'laporan:bmkg-kompas',
        title: 'Kutipan Kepala BMKG melalui Kompas ' + (b.publishedAt || ''),
        url: b.quotedSourceUrl,
        evidence: [b.quotedStatementId, b.dateAttributionNoteId,
          `${durationText}; ketinggian ${altitudeText}.`].filter(Boolean).join(' ')
      }
    ];
    sources.forEach(source => {
      if (!source.url) return;
      docs.push({
        id: source.id, kind: 'regional', title: source.title,
        text: `laporan BMKG asap smoke haze Jakarta Greater Jakarta Jabodetabek langit atmosfer satelit `
          + `${b.officialObservationDate || ''} ${b.mediaSummaryDate || ''} ${b.mediaBodyDate || ''} ${source.evidence} `
          + `Observasi historis, bukan kondisi saat ini, bukan PM2.5 permukaan atau lintasan model.`,
        data: { ...b, sourceUrl: source.url, productUrl: source.url }
      });
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
        + `${v.eruption ? 'sedang meletus letusan pos pengamatan ' + v.eruption.count + ' kali tinggi kolom '
            + (v.eruption.maxHeightM || '') + ' meter arah ' + (v.eruption.bearingLabel || '') : 'tidak ada laporan letusan'} `
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
      title: 'Gempa M' + L.magnitude + ', ' + L.area,
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
  if (/\b(siapa|perusahaan|pemilik|konsesi|tanggung jawab|hgu|bertanggung|company|owner|concession|responsible)\b/.test(s)) return 'konsesi';
  if (/\b(kemenkes|ispa|data kesehatan|laporan kesehatan|health|healthcare|ari cases|health report)\b/.test(s)) return 'health';
  if (/\b(asmc|nea|bmkg|haze|kabut regional|singapura|singapore|malaysia)\b/.test(s)
      || /asap.{0,30}(jakarta|jabotabek)|(jakarta|jabotabek).{0,30}(asap|smoke)/.test(s)
      || /smoke.{0,30}(jakarta|jabotabek)/.test(s)) return 'regional';
  if (/\b(udara|aqi|ispa|polusi|pm2|napas|asap.*sehat|air quality|pollution|smoke exposure)\b/.test(s)) return 'udara';
  if (/\b(gempa|magnitudo|richter|seismik|tsunami|guncang|earthquake|magnitude|seismic)\b/.test(s)) return 'gempa';
  if (/\b(korban|meninggal|tewas|luka|hilang|casualties|fatalities|injured|deaths)\b/.test(s)) return 'korban';
  if (/\b(pengungsi|mengungsi|posko|pengungsian|displaced|displacement|refugees|shelters)\b/.test(s)) return 'pengungsi';
  if (/\b(gunung|vulkanik|erupsi|abu|letusan|volcano|volcanic|eruption|ash)\b/.test(s)) return 'gunung';
  if (/\b(berita|kabar|terkini|penanganan|update|news|headlines|latest)\b/.test(s)) return 'berita';
  if (/\b(provinsi|wilayah|daerah mana|paling banyak|province|provinces|region|regions|most hotspots)\b/.test(s)) return 'provinsi';
  if (/\b(terdampak|kota|kabupaten|warga|penduduk|terpapar|affected|city|cities|regency|people|population|exposed)\b/.test(s)) return 'daerah';
  if (/\b(angin|arah|sebaran|kemana|ke mana|wind|direction|trajectory|plume)\b/.test(s)) return 'angin';
  return 'umum';
}

/** Rangkai jawaban dari data nyata pada dokumen teratas. */
function compose(intent, hits, ctx) {
  const lines = [];
  const ov = ctx.overview || {};
  const st = ov.stats || {};
  const pick = k => hits.filter(h => h.doc.kind === k).map(h => h.doc);

  if (intent === 'health') {
    const report = ov.regionalHaze && ov.regionalHaze.meta && ov.regionalHaze.meta.kemenkes;
    if (!report) {
      lines.push('Snapshot laporan Kemenkes tidak tersedia pada data yang dimuat.');
      return lines;
    }
    lines.push(`${fmt(report.cumulativeIspaCases)} kasus ISPA kumulatif dilaporkan sampai ${report.dataThrough}, `
      + `di ${fmt(report.districtCount)} kabupaten/kota pada ${fmt(report.provinceCount)} provinsi.`);
    lines.push('Provinsi yang disebut: ' + (report.provinces || []).join(', ') + '.');
    lines.push(report.note || 'Angka kesehatan bukan jumlah penduduk terpapar plume dan bukan ukuran konsentrasi asap.');
    lines.push('Sumber: laporan Kemenkes yang dikutip dalam berita; periksa tautan sumber untuk rincian dan tanggal.');
    return lines;
  }

  if (intent === 'regional') {
    const report = ov.regionalHaze && ov.regionalHaze.meta;
    if (!report) {
      lines.push('Snapshot laporan haze regional tidak tersedia pada data yang dimuat.');
      return lines;
    }
    if (report.asmc) {
      lines.push('ASMC ' + (report.asmc.reportDate || '') + ': '
        + (report.asmc.summaryId || report.asmc.summary));
    }
    if (report.nea) {
      lines.push('NEA Singapura: ' + (report.nea.statementId || report.nea.statement));
      if (report.nea.pm25OneHour && report.nea.psi24Hour) {
        lines.push('Pembacaan NEA ' + report.nea.pm25OneHour.period + ': PM2.5 '
          + report.nea.pm25OneHour.min + '-' + report.nea.pm25OneHour.max + ' '
          + report.nea.pm25OneHour.unit + '; PSI 24 jam '
          + report.nea.psi24Hour.min + '-' + report.nea.psi24Hour.max + '.');
      }
      lines.push(report.nea.airQualityNoteId || report.nea.airQualityNote);
    }
    if (report.bmkg && hits.some(hit => /^laporan:bmkg/.test(hit.doc.id))) {
      const b = report.bmkg;
      const duration = b.durationHours || {};
      const durationText = duration.minimum != null && duration.maximum != null
        ? `${duration.minimum}-${duration.maximum} jam` : 'durasi tidak tersedia';
      const altitudeText = b.altitudeMinimumKm != null
        ? `lebih dari ${b.altitudeMinimumKm} km` : 'ketinggian tidak tersedia';
      lines.push('Laporan historis Jakarta. Tanggal pengamatan pada siaran resmi BMKG: '
        + (b.officialObservationDate || 'tidak tersedia') + '; cuplikan ringkasan Kompas: '
        + (b.mediaSummaryDate || 'tidak tersedia') + '; badan artikel: '
        + (b.mediaBodyDate || 'tidak tersedia') + '. Tanggal kutipan tidak dipastikan.');
      lines.push(b.officialSummaryId || 'Laporan observasi asap Jakarta tidak tersedia.');
      lines.push((b.quotedStatementId || 'Rincian Kepala BMKG tidak tersedia.')
        + ' Durasi yang dikutip: ' + durationText + '; ketinggian: ' + altitudeText + '.');
      if (b.dateAttributionNoteId) lines.push(b.dateAttributionNoteId);
      lines.push(b.surfaceNoteId || 'Observasi atmosfer bukan pengukuran kualitas udara permukaan.');
    }
    lines.push(report.spatialNoteId || report.spatialNote || 'Cakupan visual bukan batas resmi atau pengukuran konsentrasi.');
    return lines;
  }

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
      lines.push(`${d.name} (${d.kind || 'konsesi'}${d.group ? ' · ' + d.group : ''}), `
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

  if (intent === 'korban') {
    const cs = ctx.casualties || {};
    if (!cs.items || !cs.items.length) {
      lines.push('Belum ada angka korban yang terbaca dari berita terkini.');
      lines.push('Untuk angka resmi, lihat data pengungsi BNPB pada panel kebencanaan.');
      return lines;
    }
    lines.push('Angka berikut dikutip dari LAPORAN MEDIA, bukan data resmi BNPB:');
    for (const i of cs.items.slice(0, 5)) {
      lines.push(`  ${i.label}: ${fmt(i.value)}, "${i.quote}" (${i.domain || 'sumber'}).`);
    }
    lines.push(cs.caution);
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
    // Bedakan tegas "meletus" dari "berstatus tinggi", inilah kekeliruan
    // yang paling sering muncul saat orang membaca status Siaga.
    const erupt = (vo.active || []).filter(v => v.eruption);
    if (erupt.length) {
      lines.push(`${erupt.length} gunung dilaporkan MELETUS oleh pos pengamatan dalam 24 jam terakhir: `
        + erupt.map(v => v.name).join(', ') + '.');
    } else {
      lines.push('Tidak ada laporan letusan dari pos pengamatan dalam 24 jam terakhir.');
    }
    lines.push(`${vo.monitoredCount || vo.activeCount || 0} gunung dipantau di dasbor ini `
      + '(berstatus minimal Waspada). Status Siaga/Awas berarti tingkat kewaspadaan, '
      + 'bukan bahwa gunung sedang melontarkan abu.');
    for (const d of pick('gunung').slice(0, 4)) {
      const v = d.data;
      const far = (v.plumes || []).reduce((m, p) => Math.max(m, p.reachKm), 0);
      const st = v.official ? `Level ${v.official.level} (${v.official.status})` : 'status resmi tidak tercatat';
      lines.push(`${v.name}, ${st}`
        + `${v.eruption ? ' · MELETUS ' + v.eruption.count + 'x dalam 24 jam'
            + (v.eruption.maxHeightM ? ', kolom abu ' + fmt(v.eruption.maxHeightM) + ' m di atas puncak' : '')
            + (v.eruption.bearingLabel ? ' condong ke ' + v.eruption.bearingLabel : '') : ''}`
        + `${v.activity ? ' · erupsi ' + v.activity.status + ' menurut GVP' : ''}`
        + `${v.region ? ' · ' + v.region : ''}${far ? `, abu diperkirakan terbawa hingga ${fmt(far)} km` : ''}.`);
    }
    lines.push('Sebaran abu hanya digambar untuk gunung yang dilaporkan meletus oleh pos pengamatan. '
      + 'Bentuknya indikatif dari angin ketinggian, bukan advisory resmi Darwin VAAC.');
    return lines;
  }

  if (intent === 'provinsi') {
    const pv = pick('provinsi').slice(0, 5);
    const list = pv.length ? pv : (ov.provinceRanking || []).slice(0, 5).map(p => ({ data: p }));
    lines.push('Provinsi dengan titik api terbanyak:');
    list.forEach((d, i) => lines.push(`${i + 1}. ${d.data.province}, ${d.data.hotspots} titik api, FRP ${fmt(d.data.frp)} MW.`));
    return lines;
  }

  if (intent === 'daerah') {
    const model = ov.impactModel;
    if (model && model.status === 'wind-unavailable') {
      lines.push('Pusat dalam plume model belum dihitung karena angin NOAA GFS 10 m tidak tersedia. Ini bukan bukti tidak ada asap.');
      return lines;
    }
    if (model && model.status === 'no-detections') {
      lines.push('Tidak ada klaster FIRMS pada jendela data untuk menghitung pusat dalam plume model.');
      return lines;
    }
    const im = pick('daerah').slice(0, 5);
    const list = im.length ? im : (ov.impacted || []).slice(0, 5).map(p => ({ data: p }));
    lines.push(impactSummary(ov) + ' saat ini.');
    lines.push('Angin GFS 10 m mewakili lapisan dekat permukaan, bukan transport asap pada ketinggian lebih dari 4 km. Angka ini bukan hitungan orang terpapar, kasus kesehatan, batas administratif, lintasan asap teramati, atau laporan resmi dampak.');
    list.forEach(d => lines.push(`${d.data.name} · ${d.data.prov || ''}, kategori model `
      + `${d.data.level || ''} (skor kedekatan ${d.data.score}/100), `
      + `pusat kota berjarak ${Math.round(d.data.nearestKm || 0)} km dari klaster api.`));
    return lines;
  }

  if (intent === 'angin') {
    const cl = (ov.plumes || []).filter(c => c.wind).slice(0, 4);
    if (cl.length) {
      lines.push('Arah plume indikatif dari beberapa klaster titik api terpilih:');
      for (const c of cl) {
        lines.push(`${c.lat.toFixed(2)}, ${c.lon.toFixed(2)} (${c.count} titik), `
          + `angin ${c.wind.speed} m/s, arah model ${c.bearingTo}° dan jangkauan visual ~${c.lengthKm} km.`);
      }
      lines.push('Ini bukan lintasan asap teramati, model dispersi, atau pengukuran konsentrasi.');
    } else lines.push('Data angin per klaster belum tersedia.');
    return lines;
  }

  if (intent === 'berita') {
    const ns = pick('berita').slice(0, 5);
    const list = ns.length ? ns : (ctx.news || []).slice(0, 5).map(a => ({ data: a, title: a.title }));
    lines.push('Berita penanganan terbaru:');
    list.forEach(d => lines.push(`${d.title || d.data.title}, ${d.data.domain || ''}`));
    return lines;
  }

  // umum: ringkasan situasi + cuplikan dokumen paling relevan
  lines.push(`${fmt(st.hotspots || 0)} titik api terdeteksi (${fmt(st.highConfidence || 0)} keyakinan tinggi), `
    + `total FRP ${fmt(st.totalFrp || 0)} MW, ${impactSummary(ov)}.`);
  lines.push('Jumlah pusat model bukan hitungan penduduk terpapar, kasus ISPA, lintasan asap teramati, atau batas resmi dampak.');
  for (const h of hits.slice(0, 4)) lines.push(h.doc.title);
  return lines;
}

function englishAirLabel(label) {
  const labels = {
    'baik': 'Good',
    'sedang': 'Moderate',
    'tidak sehat bagi kelompok sensitif': 'Unhealthy for sensitive groups',
    'tidak sehat': 'Unhealthy',
    'sangat tidak sehat': 'Very unhealthy',
    'berbahaya': 'Hazardous',
    'normal': 'Normal',
    'meningkat': 'Elevated',
    'tinggi': 'High',
    'sangat tinggi': 'Very high'
  };
  return labels[String(label || '').toLowerCase()] || label || 'not available';
}

function englishVolcanoStatus(status) {
  const statuses = { Normal: 'Normal', Waspada: 'Alert', Siaga: 'Watch', Awas: 'Warning' };
  return statuses[status] || status || 'not recorded';
}

function englishDirection(direction) {
  const directions = {
    Utara: 'north', Timurlaut: 'northeast', 'Timur laut': 'northeast', Timur: 'east',
    Tenggara: 'southeast', Selatan: 'south', Baratdaya: 'southwest', 'Barat daya': 'southwest',
    Barat: 'west', Baratlaut: 'northwest', 'Barat laut': 'northwest'
  };
  return directions[direction] || direction || 'not recorded';
}

function composeEnglish(intent, hits, ctx) {
  const lines = [];
  const ov = ctx.overview || {};
  const st = ov.stats || {};
  const pick = kind => hits.filter(hit => hit.doc.kind === kind).map(hit => hit.doc);

  if (intent === 'health') {
    const report = ov.regionalHaze && ov.regionalHaze.meta && ov.regionalHaze.meta.kemenkes;
    if (!report) {
      lines.push('The Ministry of Health report snapshot is not available in the loaded data.');
      return lines;
    }
    lines.push(`${fmt(report.cumulativeIspaCases, 'en')} cumulative acute respiratory infection (ARI) cases were reported through ${report.dataThrough}, across ${fmt(report.districtCount, 'en')} districts or cities in ${fmt(report.provinceCount, 'en')} provinces.`);
    lines.push('Provinces named in the report: ' + (report.provinces || []).join(', ') + '.');
    lines.push(report.noteEn || 'These are cumulative health reports, not counts of people exposed to smoke or plume boundaries.');
    lines.push('Source: a Ministry of Health report cited in news coverage. Check the linked source for details and its reporting date.');
    return lines;
  }

  if (intent === 'regional') {
    const report = ov.regionalHaze && ov.regionalHaze.meta;
    if (!report) {
      lines.push('The regional haze report snapshot is not available in the loaded data.');
      return lines;
    }
    if (report.asmc) {
      lines.push(`ASMC, ${report.asmc.reportDate || 'date not available'}: ${report.asmc.summary || report.asmc.summaryId || 'No summary is available.'}`);
    }
    if (report.nea) {
      lines.push('Singapore NEA: ' + (report.nea.statement || report.nea.statementId || 'No statement is available.'));
      if (report.nea.pm25OneHour && report.nea.psi24Hour) {
        lines.push(`NEA reading for ${report.nea.pm25OneHour.period}: PM2.5 ${report.nea.pm25OneHour.min}-${report.nea.pm25OneHour.max} ${report.nea.pm25OneHour.unit}; 24-hour PSI ${report.nea.psi24Hour.min}-${report.nea.psi24Hour.max}.`);
      }
      lines.push(report.nea.airQualityNote || report.nea.airQualityNoteId || 'Ambient air-quality readings are not smoke-specific concentrations.');
    }
    if (report.bmkg && hits.some(hit => /^laporan:bmkg/.test(hit.doc.id))) {
      const b = report.bmkg;
      const duration = b.durationHours || {};
      const durationText = duration.minimum != null && duration.maximum != null
        ? `${duration.minimum}-${duration.maximum} hours` : 'duration not available';
      const altitudeText = b.altitudeMinimumKm != null
        ? `above ${b.altitudeMinimumKm} km` : 'altitude not available';
      lines.push(`Historical Jakarta report. Observation date in the official BMKG release: ${b.officialObservationDate || 'not available'}; date in a Kompas search snippet: ${b.mediaSummaryDate || 'not available'}; date in the accessible article body: ${b.mediaBodyDate || 'not available'}. The quoted event date is not confirmed.`);
      lines.push('Official BMKG report, English summary: ' + (b.officialSummaryEn || b.officialSummaryId || 'The official observation summary is not available.'));
      lines.push('Media report summary in English, paraphrased, not a direct quote: '
        + (b.quotedStatementEn || b.quotedStatementId || 'The reported duration and altitude are not available.')
        + ` Reported duration: ${durationText}; altitude: ${altitudeText}.`);
      if (b.dateAttributionNoteEn || b.dateAttributionNoteId) {
        lines.push('Source-date note, English rendering: ' + (b.dateAttributionNoteEn || b.dateAttributionNoteId));
      }
      lines.push('Surface-air note, English rendering: '
        + (b.surfaceNoteEn || b.surfaceNoteId || 'An atmospheric observation is not a surface air-quality measurement.'));
    }
    lines.push('Map coverage note: ' + (report.spatialNoteEn || report.spatialNote || 'The visual coverage is not an official boundary or concentration measurement.'));
    return lines;
  }

  if (intent === 'konsesi') {
    const at = ctx.attribution || {};
    if (at.analyzed) {
      lines.push(`${fmt(at.insideConcession, 'en')} of ${fmt(at.analyzed, 'en')} analyzed fire hotspots were inside mapped concession boundaries.`);
    }
    const units = pick('konsesi').filter(doc => doc.data && doc.data.hotspotCount);
    const top = (units.length ? units : (at.units || []).slice(0, 5).map(data => ({ data }))).slice(0, 5);
    for (const unit of top) {
      const data = unit.data;
      lines.push(`${data.name} (${data.kind || 'concession'}${data.group ? ' · ' + data.group : ''}): ${fmt(data.hotspotCount, 'en')} hotspots, FRP ${fmt(data.totalFrp || 0, 'en')} MW.`);
    }
    lines.push('Caution: concession boundaries are a Global Forest Watch compilation of KLHK, ESDM, and RSPO data, not official ATR/BPN land-use-rights certificates. A hotspot inside a concession does not prove that the company started the fire; fires can spread from elsewhere.');
    return lines;
  }

  if (intent === 'udara') {
    const air = (ctx.air || {}).worst;
    if (air) {
      lines.push(`Highest modeled air-quality value: US AQI ${air.aqi} (${englishAirLabel(air.label)})`
        + `${air.province ? ' in ' + air.province : ''}`
        + `${air.pm25 ? `, modeled PM2.5 ${air.pm25} µg/m³` : ''}.`);
      if (air.aqi > 150) lines.push('At this level, reduce time outdoors and consider a well-fitted N95 mask.');
      lines.push('The air-quality grid is a model output, not a ground-station reading. Total CAMS PM2.5 is not specific to fire smoke.');
    } else lines.push('Air-quality data is not available.');
    return lines;
  }

  if (intent === 'gempa') {
    const quakes = (ctx.hazard && ctx.hazard.quakes) || {};
    if (quakes.latest) {
      const latest = quakes.latest;
      lines.push(`Latest earthquake: M${latest.magnitude} near ${latest.area}, depth ${latest.depthKm} km (${latest.dateLabel}).`);
      if (latest.potensi) {
        const tsunami = /tidak/i.test(latest.potensi) ? 'No tsunami potential reported by BMKG.'
          : /tsunami/i.test(latest.potensi) ? 'BMKG tsunami status: ' + latest.potensi : 'BMKG status: ' + latest.potensi;
        lines.push(tsunami);
      }
      if (latest.felt) lines.push('Felt reports, source wording: ' + latest.felt + '.');
      const counts = quakes.counts || {};
      lines.push(`${fmt(counts.total, 'en')} earthquakes appear in the latest data; ${fmt(counts.kuat, 'en')} have magnitude 5 or higher.`);
    } else lines.push('BMKG earthquake data is not available.');
    return lines;
  }

  if (intent === 'korban') {
    const casualties = ctx.casualties || {};
    if (!casualties.items || !casualties.items.length) {
      lines.push('No casualty figures were found in recent news reports.');
      lines.push('For official displacement figures, see BNPB data in the hazards panel.');
      return lines;
    }
    lines.push('The figures below are from MEDIA REPORTS, not official BNPB data:');
    for (const item of casualties.items.slice(0, 5)) {
      lines.push(`Reported category, source wording: ${item.label}: ${fmt(item.value, 'en')}. Original-language media quote: "${item.quote}" (${item.domain || 'source'}).`);
    }
    if (casualties.caution) lines.push('Source note, original wording: ' + casualties.caution);
    return lines;
  }

  if (intent === 'pengungsi') {
    const events = ((ctx.hazard && ctx.hazard.shelters && ctx.hazard.shelters.events) || []);
    if (!events.length) {
      lines.push('No active official BNPB displacement data is available.');
      return lines;
    }
    for (const event of events) {
      lines.push(`${event.label}: ${fmt(event.total, 'en')} people displaced across ${fmt(event.sites, 'en')} sites (${fmt(event.terpusat, 'en')} at organized shelters, ${fmt(event.mandiri, 'en')} self-arranged).`);
      for (const area of (event.topAreas || []).slice(0, 4)) {
        lines.push(`  ${area.area}: ${fmt(area.people, 'en')} people.`);
      }
    }
    lines.push('Source: BNPB. Figures follow BPBD reports and may change.');
    return lines;
  }

  if (intent === 'gunung') {
    const volcano = ctx.volcano || {};
    const counts = volcano.official && volcano.official.counts;
    if (counts) {
      lines.push(`Current official PVMBG alert levels: ${fmt(counts.Awas, 'en')} Warning (Awas), ${fmt(counts.Siaga, 'en')} Watch (Siaga), and ${fmt(counts.Waspada, 'en')} Alert (Waspada), across ${fmt(volcano.official.total, 'en')} monitored volcanoes.`);
    }
    const erupting = (volcano.active || []).filter(item => item.eruption);
    if (erupting.length) {
      lines.push(`${erupting.length} volcanoes were reported erupting by observatories in the past 24 hours: ${erupting.map(item => item.name).join(', ')}.`);
    } else lines.push('No eruption reports from observatories were recorded in the past 24 hours.');
    lines.push(`${fmt(volcano.monitoredCount || volcano.activeCount || 0, 'en')} volcanoes are monitored on this dashboard. Watch or Warning status is an alert level, not proof that a volcano is currently erupting.`);
    for (const doc of pick('gunung').slice(0, 4)) {
      const item = doc.data;
      const reach = (item.plumes || []).reduce((max, plume) => Math.max(max, plume.reachKm), 0);
      const status = item.official
        ? `Level ${item.official.level} (${englishVolcanoStatus(item.official.status)})`
        : 'official status not recorded';
      let line = `${item.name}, ${status}`;
      if (item.eruption) {
        line += ` · ERUPTING ${item.eruption.count} times in 24 hours`;
        if (item.eruption.maxHeightM) line += `, ash column ${fmt(item.eruption.maxHeightM, 'en')} m above the summit`;
        if (item.eruption.bearingLabel) line += `, drifting ${englishDirection(item.eruption.bearingLabel)}`;
      }
      if (item.activity) line += ` · GVP activity: ${item.activity.status}`;
      if (item.region) line += ` · ${item.region}`;
      if (reach) line += `, ash may travel up to ${fmt(reach, 'en')} km`;
      lines.push(line + '.');
    }
    lines.push('Ash plumes are drawn only for volcanoes reported erupting by observatories. Their shapes are indicative, based on winds aloft, and are not official Darwin VAAC advisories.');
    return lines;
  }

  if (intent === 'provinsi') {
    const ranked = pick('provinsi').slice(0, 5);
    const list = ranked.length ? ranked : (ov.provinceRanking || []).slice(0, 5).map(data => ({ data }));
    lines.push('Provinces with the most detected fire hotspots:');
    list.forEach((doc, index) => lines.push(`${index + 1}. ${doc.data.province}: ${fmt(doc.data.hotspots, 'en')} hotspots, FRP ${fmt(doc.data.frp, 'en')} MW.`));
    return lines;
  }

  if (intent === 'daerah') {
    const model = ov.impactModel;
    if (model && model.status === 'wind-unavailable') {
      lines.push('Modeled plume centers have not been calculated because NOAA GFS 10 m wind data is unavailable. This is not evidence that there is no smoke.');
      return lines;
    }
    if (model && model.status === 'no-detections') {
      lines.push('No FIRMS clusters were present in the data window for calculating modeled plume centers.');
      return lines;
    }
    const matched = pick('daerah').slice(0, 5);
    const list = matched.length ? matched : (ov.impacted || []).slice(0, 5).map(data => ({ data }));
    lines.push(impactSummary(ov, 'en') + ' at the current model time.');
    lines.push('GFS 10 m winds represent near-surface flow, not smoke transport at altitudes above 4 km. This is not a count of people exposed, health cases, administrative boundaries, observed smoke trajectories, or official impact reports.');
    list.forEach(doc => {
      const data = doc.data;
      const level = { Rendah: 'Low', Sedang: 'Moderate', Tinggi: 'High' }[data.level] || data.level || 'not classified';
      lines.push(`${data.name} · ${data.prov || ''}, model category ${level} (proximity score ${data.score}/100); settlement center is ${Math.round(data.nearestKm || 0)} km from a fire cluster.`);
    });
    return lines;
  }

  if (intent === 'angin') {
    const clusters = (ov.plumes || []).filter(cluster => cluster.wind).slice(0, 4);
    if (clusters.length) {
      lines.push('Indicative plume directions from selected fire clusters:');
      for (const cluster of clusters) {
        lines.push(`${cluster.lat.toFixed(2)}, ${cluster.lon.toFixed(2)} (${fmt(cluster.count, 'en')} hotspots), wind ${cluster.wind.speed} m/s, indicative model bearing ${cluster.bearingTo}°, visual reach about ${cluster.lengthKm} km.`);
      }
      lines.push('These are not observed smoke trajectories, an atmospheric dispersion model, or concentration measurements.');
    } else lines.push('Wind data for the fire clusters is not available.');
    return lines;
  }

  if (intent === 'berita') {
    const hitsNews = pick('berita').slice(0, 5);
    const list = hitsNews.length ? hitsNews : (ctx.news || []).slice(0, 5).map(data => ({ data, title: data.title }));
    lines.push('Recent response coverage. Headlines are kept in their original language:');
    list.forEach(doc => lines.push(`Original headline: ${doc.title || doc.data.title} (${doc.data.domain || 'source'}).`));
    return lines;
  }

  lines.push(`${fmt(st.hotspots || 0, 'en')} fire hotspots detected (${fmt(st.highConfidence || 0, 'en')} high-confidence), total FRP ${fmt(st.totalFrp || 0, 'en')} MW, ${impactSummary(ov, 'en')}.`);
  lines.push('Modeled-center counts are not counts of exposed people or ARI cases, observed smoke trajectories, or official impact boundaries.');
  for (const hit of hits.slice(0, 4)) lines.push('Relevant source title, original wording: ' + hit.doc.title);
  return lines;
}

/** Titik masuk: kembalikan jawaban + sumber terkait. */
function answer(query, ctx, language = 'id') {
  const lang = String(language || '').toLowerCase() === 'en' ? 'en' : 'id';
  const docs = buildDocs(ctx);
  const idx = new BM25(docs);
  const hits = idx.search(query, 10);
  const intent = detectIntent(query);
  const lines = lang === 'en' ? composeEnglish(intent, hits, ctx) : compose(intent, hits, ctx);

  const sources = hits.slice(0, 6).map(h => {
    const data = h.doc.data || {};
    const url = h.doc.kind === 'health'
      ? data.sourceUrl || data.officialSourceUrl
      : h.doc.kind === 'regional'
        ? data.productUrl || data.sourceUrl
        : data.url || null;
    return { kind: h.doc.kind, title: h.doc.title, url: url || null, score: +h.score.toFixed(2) };
  });

  return {
    query,
    language: lang,
    intent,
    answer: lines,
    sources,
    indexed: docs.length,
    updatedAt: new Date().toISOString()
  };
}

module.exports = { answer, buildDocs, BM25, tokenize };
