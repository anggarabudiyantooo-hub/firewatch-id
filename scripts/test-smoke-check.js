#!/usr/bin/env node
// Cek Asap: validasi masukan, pengumpulan bukti, putusan deterministik,
// penolakan materi, dan perilaku saat model tidak tersedia. Tanpa jaringan.
'use strict';
const fs = require('fs');
const path = require('path');
const smoke = require('../lib/smoke-check');

let pass = 0;
let fail = 0;
function ok(name, condition, detail) {
  if (condition) { pass += 1; console.log('  LULUS', name, detail || ''); }
  else { fail += 1; console.error('  GAGAL', name, detail || ''); }
}

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const IMAGE = 'data:image/jpeg;base64,' + 'A'.repeat(5000);
const nowIso = new Date().toISOString();
const baseInput = { lat: -0.5, lon: 101.5, observedAt: nowIso, image: IMAGE, language: 'id' };

const richData = {
  hotspots: [
    { lat: -0.55, lon: 101.55, frp: 20, confidence: 90, acq: nowIso },
    { lat: -0.7, lon: 101.7, frp: 8, confidence: 60, acq: nowIso },
    { lat: -7.5, lon: 110.4, frp: 90, confidence: 95, acq: nowIso }
  ],
  air: { aqi: 165, pm25: 70.2, label: 'Tidak sehat' },
  wind: { speed: 3.6, from: 90, to: 270, validTime: '2026-11-04T06:00:00Z' },
  volcanoes: [{ name: 'Sinabung', lat: 3.17, lon: 98.392, level: 'II Waspada' }],
  ashReports: 0,
  regionalHaze: [{ title: 'Sumatra', source: 'ASMC / NEA / BMKG', publishedAt: '2026-10-22T09:48:00.000Z' }]
};
// null = feed tidak terbaca. Array kosong berarti terbaca tetapi nihil.
const emptyData = { hotspots: null, air: null, wind: null, volcanoes: null, ashReports: null, regionalHaze: [] };

(async () => {
  console.log('\n== validasi masukan ==');
  ok('koordinat wajib sah', smoke.validateInput({ ...baseInput, lat: 120 }).error === 'LOCATION_INVALID');
  ok('bujur di luar rentang ditolak', smoke.validateInput({ ...baseInput, lon: -200 }).error === 'LOCATION_INVALID');
  ok('tanpa foto dan tanpa cerita ditolak', smoke.validateInput({ lat: 0, lon: 100 }).error === 'EVIDENCE_EMPTY');
  ok('cerita saja diterima', !smoke.validateInput({ lat: 0, lon: 100, description: 'langit kelabu' }).error);
  ok('gambar bukan jpeg/png ditolak', smoke.validateInput({ ...baseInput, image: 'data:image/gif;base64,AAA' }).error === 'IMAGE_INVALID');
  ok('gambar terlalu besar ditolak',
    smoke.validateInput({ ...baseInput, image: 'data:image/jpeg;base64,' + 'A'.repeat(smoke.MAX_IMAGE_CHARS + 10) }).error === 'IMAGE_TOO_LARGE');
  ok('waktu terlalu tua ditolak',
    smoke.validateInput({ ...baseInput, observedAt: new Date(Date.now() - 40 * 86400000).toISOString() }).error === 'TIME_INVALID');
  ok('waktu sedikit di masa depan masih diterima',
    !smoke.validateInput({ ...baseInput, observedAt: new Date(Date.now() + 3600000).toISOString() }).error);
  ok('cerita dipotong ke batas panjang',
    smoke.validateInput({ lat: 0, lon: 100, description: 'x'.repeat(2000) }).description.length === 600);

  console.log('\n== bukti deterministik ==');
  const input = smoke.validateInput(baseInput);
  const evidence = smoke.gatherEvidence(input, richData);
  ok('hanya deteksi dalam radius dihitung', evidence.fire.detectionsWithinRadius === 2, String(evidence.fire.detectionsWithinRadius));
  ok('keyakinan tinggi dihitung kode', evidence.fire.highConfidenceWithinRadius === 1);
  ok('jarak terdekat dihitung kode', evidence.fire.nearestDistanceKm > 0 && evidence.fire.nearestDistanceKm < 20);
  ok('AQI model dibulatkan kode', evidence.air.point.usAqi === 165);
  ok('arah angin dilaporkan', evidence.wind.point.towardDegrees === 270);
  ok('gunung jauh tidak masuk radius', evidence.volcano.nearby.length === 0);
  ok('laporan regional ikut sebagai sinyal terpisah', evidence.regionalHaze.reports.length === 1);
  ok('keterbatasan menyebut bukan laporan resmi', evidence.limitations.join(' ').includes('bukan laporan resmi'));
  ok('deteksi bukan bukti penyebab', evidence.fire.caveat.includes('bukan bukti penyebab'));

  console.log('\n== putusan dihitung kode ==');
  ok('kabut terlihat plus deteksi jadi didukung', smoke.decide('yes', evidence, input).verdict === smoke.VERDICTS.SUPPORTED);
  const noSupport = smoke.gatherEvidence(input, { hotspots: [], air: { aqi: 40, label: 'Baik' }, wind: null, volcanoes: [], regionalHaze: [] });
  ok('kabut terlihat tanpa dukungan jadi belum didukung', smoke.decide('yes', noSupport, input).verdict === smoke.VERDICTS.NOT_SUPPORTED);
  ok('belum didukung tidak disebut laporan palsu',
    smoke.decide('yes', noSupport, input).reasons.join(' ').includes('tidak berarti laporannya salah'));
  const noData = smoke.gatherEvidence(input, emptyData);
  ok('tanpa data pembanding jadi data tidak cukup', smoke.decide('yes', noData, input).verdict === smoke.VERDICTS.INSUFFICIENT);
  ok('feed gagal dibaca ditandai tidak tersedia', noData.fire.available === false && noData.volcano.available === false);
  const readOnlyEmpty = smoke.gatherEvidence(input, { hotspots: [], air: null, wind: null, volcanoes: [], regionalHaze: [] });
  ok('feed terbaca tetapi nihil tetap belum didukung', smoke.decide('yes', readOnlyEmpty, input).verdict === smoke.VERDICTS.NOT_SUPPORTED);
  ok('label tidak jelas jadi data tidak cukup', smoke.decide('unclear', evidence, input).verdict === smoke.VERDICTS.INSUFFICIENT);
  ok('tidak ada kabut terlihat jadi data tidak cukup', smoke.decide('no', evidence, input).verdict === smoke.VERDICTS.INSUFFICIENT);
  ok('AQI buruk saja sudah menjadi sinyal pendukung',
    smoke.decide('yes', smoke.gatherEvidence(input, { hotspots: [], air: { aqi: 180, label: 'Tidak sehat' }, volcanoes: [] }), input).verdict === smoke.VERDICTS.SUPPORTED);
  ok('didukung tidak mengklaim penyebab terbukti',
    smoke.decide('yes', evidence, input).reasons.join(' ').includes('bukan bahwa penyebabnya terbukti'));

  console.log('\n== parser vision dan aturan tanpa angka ==');
  const parsed = smoke.parseVision('```json\n{"scene":"outdoor_sky","haze_visible":"yes","sky_colour":"kelabu","visibility":"samar","description":"Langit tampak kelabu merata.","refusal_reason":""}\n```');
  ok('JSON dalam pagar kode tetap terbaca', parsed.haze_visible === 'yes' && parsed.scene === 'outdoor_sky');
  ok('label asing dinormalkan', smoke.parseVision('{"haze_visible":"maybe"}').haze_visible === 'unknown');
  ok('bukan JSON tidak melempar', typeof smoke.parseVision('entah').description === 'string');
  ok('angka dibuang dari deskripsi visual', smoke.stripDigits('sekitar 500 meter jarak pandang') === 'sekitar meter jarak pandang');

  console.log('\n== perilaku saat model tidak tersedia ==');
  const noKey = await smoke.checkSmoke(baseInput, richData, { apiKey: '' });
  ok('tanpa kunci putusan tetap jujur', noKey.verdict === smoke.VERDICTS.INSUFFICIENT && noKey.failureCode === 'META_API_KEY_MISSING');
  ok('tanpa kunci foto tidak diklaim dinilai', noKey.visible === null);
  ok('bukti tetap tersedia tanpa model', noKey.evidence.fire.detectionsWithinRadius === 2);
  ok('retensi dinyatakan tidak ada', noKey.retention === 'none');

  const http429 = await smoke.checkSmoke(baseInput, richData, { apiKey: 'x', fetchImpl: async () => ({ ok: false, status: 429 }) });
  ok('kuota habis dilaporkan apa adanya', http429.failureCode === 'META_API_HTTP_429' && http429.verdict === smoke.VERDICTS.INSUFFICIENT);

  const rejected = await smoke.checkSmoke(baseInput, richData, {
    apiKey: 'x',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"scene":"not_applicable","haze_visible":"unclear","refusal_reason":"foto orang"}' } }] }) })
  });
  ok('materi tidak sesuai ditolak', rejected.verdict === smoke.VERDICTS.REJECTED);
  ok('penolakan tidak menyimpan apa pun', rejected.retention === 'none');

  const supported = await smoke.checkSmoke(baseInput, richData, {
    apiKey: 'x',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"scene":"outdoor_sky","haze_visible":"yes","sky_colour":"kelabu","visibility":"samar","description":"Langit kelabu, matahari samar, jarak pandang sekitar 500 meter.","refusal_reason":""}' } }] }) })
  });
  ok('kabut terlihat dengan bukti jadi didukung', supported.verdict === smoke.VERDICTS.SUPPORTED && supported.provider === 'muse-spark');
  ok('angka dari model dibuang dari deskripsi', !/\d/.test(supported.visible.description), supported.visible.description);
  ok('deskripsi diberi label bukan pengukuran', supported.visible.label.includes('Tidak memuat pengukuran'));

  console.log('\n== kontrak rute dan halaman ==');
  const server = read('server.js');
  const html = read('public/cek-asap.html');
  const client = read('public/cek-asap.js');
  ok('rute terdaftar', server.includes("app.post('/api/cek-asap'"));
  ok('halaman terdaftar', server.includes("app.get('/cek-asap'"));
  ok('alias Inggris tersedia', server.includes("app.get('/smoke-check'"));
  ok('masuk sitemap', server.includes("'/reports', '/cek-asap', '/tentang-data'"));
  ok('parser bodi besar sebelum parser global',
    server.indexOf("app.use('/api/cek-asap', express.json({ limit: '4mb' }))") < server.indexOf("app.use(express.json({ limit: '32kb' }))"));
  ok('kelas kuota gambar dipakai bersama', server.includes('(?:map-narrative|cek-asap)'));
  ok('foto tidak ditulis ke disk', !/writeFileSync|createWriteStream/.test(read('lib/smoke-check.js')));
  ok('kunci hanya di server', server.includes('process.env.MODEL_API_KEY') && !client.includes('MODEL_API_KEY'));
  ok('EXIF dibuang lewat kodifikasi ulang', client.includes('canvas.toDataURL') && client.includes('EXIF'));
  ok('batas ukuran di klien', client.includes('MAX_BYTES = 6 * 1024 * 1024'));
  ok('pengungkapan penerusan ke Meta ada di halaman', html.includes('Meta Model API'));
  ok('larangan foto orang dan data pribadi ada', html.includes('Jangan kirim foto orang'));
  ok('nomor darurat dan bukan laporan resmi ada', html.includes('112') && html.includes('bukan laporan resmi'));
  ok('dua bahasa tersedia di halaman', html.includes('data-site-en="Smoke Check"'));
  ok('aset didaftarkan', server.includes("'cek-asap.js'") && server.includes("'cek-asap.css'"));
  ok('tautan navigasi dari beranda dan laporan',
    read('public/home.html').includes('href="/cek-asap"') && read('public/reports.html').includes('href="/cek-asap"'));
  ok('metodologi menjelaskan Cek Asap', read('public/tentang-data.html').includes('Bagaimana Cek Asap menilai laporan warga?'));

  console.log(`\n${pass}/${pass + fail} uji Cek Asap lulus.\n`);
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error('GAGAL', error && error.stack); process.exit(1); });
