#!/usr/bin/env node
// Regresi tangkapan peta dan narasi multimodal.
// Bagian statis memeriksa kontrak berkas; bagian unit memeriksa fungsi
// murni di lib/map-narrative.js. Tidak ada panggilan jaringan di sini.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const narrative = require('../lib/map-narrative');

let pass = 0;
let fail = 0;
function ok(name, condition) {
  if (condition) { pass += 1; console.log('  LULUS', name); }
  else { fail += 1; console.error('  GAGAL', name); }
}

const shot = read('public/map-screenshot.js');
const ui = read('public/map-capture-ui.js');
const app = read('public/app.js');
const index = read('public/index.html');
const server = read('server.js');

console.log('\n== tangkapan peta tidak menodai kanvas ==');
const crossOriginCount = (app.match(/crossOrigin: 'anonymous'/g) || []).length;
ok('semua lapisan petak memakai crossOrigin anonymous (9)', crossOriginCount === 9);
ok('kegagalan CORS dilaporkan, tidak ditutupi', shot.includes("throw new Error('CANVAS_TAINTED_CORS')"));
ok('peta belum siap dilaporkan', shot.includes("throw new Error('MAP_NOT_READY')"));
ok('hasil kosong ditolak', shot.includes("throw new Error('CAPTURE_EMPTY')"));
ok('urutan pane dihormati', shot.includes('function paneOrder') && shot.includes('a.z - b.z'));
ok('opacity induk diperhitungkan', shot.includes('function effectiveOpacity'));

console.log('\n== chrome gambar memuat bukti dan disclaimer ==');
ok('stempel WIB dihitung tanpa zona waktu proses', shot.includes('7 * 3600000') && shot.includes('WIB'));
ok('bbox dicetak', shot.includes("'BBOX '"));
ok('zoom dan peta dasar dicetak', shot.includes("'ZOOM '") && shot.includes("'DASAR '"));
ok('frame linimasa dicetak', shot.includes('Frame linimasa: '));
ok('legenda warna ikut tercetak', shot.includes('function legendEntries') && shot.includes('LEGEND'));
ok('atribusi sumber dicetak', shot.includes('meta.attribution'));
ok('disclaimer dan 112 dicetak', shot.includes('Bukan peringatan resmi. Darurat: 112.'));
ok('versi Inggris tersedia', shot.includes('Not an official warning. Emergency: 112.'));
ok('tata letak diukur supaya tidak terpotong di layar sempit', shot.includes('function chromeLayout') && shot.includes('wrapText(m, disclaimer'));

console.log('\n== konteks peta baca-saja ==');
ok('hook konteks tersedia', app.includes('window.SiagaMapContext = function ()'));
ok('instance peta tidak dibocorkan', !/window\.SiagaMapContext[\s\S]{0,900}return\s*\{[\s\S]{0,900}\bmap:\s*map\b/.test(app));
ok('konteks memuat batas, zoom, lapisan, frame', app.includes('activeLayers: layers') && app.includes('timelineFrame:') && app.includes('zoom: map.getZoom()'));

console.log('\n== antarmuka tangkap dan kirim ke laporan ==');
ok('tombol ada di kepala peta', index.includes('id="mapCaptureBtn"'));
ok('aset didaftarkan di server', server.includes("'map-screenshot.js'") && server.includes("'map-capture-ui.js'") && server.includes("'map-capture.css'"));
ok('skrip dimuat di halaman', index.includes('src="/map-screenshot.js"') && index.includes('src="/map-capture-ui.js"'));
ok('ada aksi unduh PNG', ui.includes('Unduh PNG') && ui.includes('MapScreenshot.download'));
ok('ada aksi tambahkan ke laporan', ui.includes('Tambahkan ke laporan') && ui.includes('sessionStorage.setItem'));
ok('label narasi wajib muncul', ui.includes('Narasi AI dibuat dari data dan gambar peta; bukan peringatan resmi.'));
ok('kegagalan narasi dijelaskan jujur', ui.includes('Narasi AI tidak tersedia: '));
ok('angka tak terverifikasi ditandai di UI', ui.includes('unverifiedNumbers'));
ok('dialog punya peran dan label aksesibel', ui.includes("setAttribute('role', 'dialog')") && ui.includes('aria-labelledby'));

console.log('\n== endpoint narasi ==');
ok('rute terdaftar', server.includes("app.post('/api/map-narrative'"));
ok('parser bodi besar dipasang sebelum parser global',
  server.indexOf("app.use('/api/map-narrative', express.json({ limit: '4mb' }))") < server.indexOf("app.use(express.json({ limit: '32kb' }))"));
ok('kelas rate limit sendiri untuk narasi bergambar', server.includes('RL_AI_IMAGE') && server.includes('RL_AI_IMAGE_PATHS'));
ok('kunci API hanya dibaca di server', server.includes('process.env.MODEL_API_KEY') && !ui.includes('MODEL_API_KEY'));
ok('kotak pandang divalidasi di server', server.includes('mapNarrative.normalizeBox(body.meta && body.meta.bounds)'));
ok('angka dihitung dari data server, bukan kiriman klien', server.includes('buildMapNarrativeData(queryBox)'));

console.log('\n== integrasi halaman Laporan ==');
const reportsHtml = read('public/reports.html');
const reportMap = read('public/report-map.js');
const reportCapture = read('public/report-capture.js');
const reportPdf = read('public/report-pdf.js');
ok('seksi tangkapan ada di laporan', reportsHtml.includes('id="tangkapan-peta"') && reportsHtml.includes('id="reportCaptureBody"'));
ok('tombol tangkap peta ada di laporan', reportsHtml.includes('id="reportMapCaptureBtn"'));
ok('leaflet dan aset baru dimuat di laporan',
  reportsHtml.includes('src="/vendor/leaflet.js"') && reportsHtml.includes('src="/report-pdf.js"') && reportsHtml.includes('src="/report-capture.js"'));
ok('aset laporan didaftarkan di server',
  server.includes("'report-map.js'") && server.includes("'report-capture.js'") && server.includes("'report-pdf.js'") && server.includes("'report-capture.css'"));
ok('peta laporan memakai crossOrigin anonymous', reportMap.includes("crossOrigin: 'anonymous'"));
ok('peta laporan memakai kontrak konteks yang sama', reportMap.includes('window.SiagaMapContext = function ()'));
ok('batas render 2000 dilaporkan, tidak disembunyikan',
  reportMap.includes('renderedHotspotLimit') && reportMap.includes('maksimal 2000 deteksi teratas FRP'));
ok('narasi menyebut batas render sebagai keterbatasan',
  read('lib/map-narrative.js').includes('subset teratas FRP yang dibatasi'));
ok('gambar tidak diunggah ke server',
  reportCapture.includes('sessionStorage') && !reportCapture.includes("fetch('/api/upload"));
ok('maksimal dua frame disimpan', ui.includes('MAX_FRAMES = 2') && reportCapture.includes('slice(0, 2)'));
ok('ringkasan angka diminta sebelum masuk laporan',
  ui.includes('await loadSummary();') && ui.includes("fetch('/api/map-summary'"));
ok('rute ringkasan tanpa model terdaftar', server.includes("app.post('/api/map-summary'"));
ok('PDF ditulis tanpa dependensi eksternal',
  reportPdf.includes('%PDF-1.4') && reportPdf.includes('/DCTDecode') && !reportPdf.includes('import('));
ok('PDF satu halaman', reportPdf.includes('/Count 1') && reportPdf.includes('/MediaBox [0 0 '));
ok('PDF memuat disclaimer dan 112', reportPdf.includes('Bukan peringatan resmi. Darurat: 112.'));
ok('PDF menandai pemotongan bila teks kelebihan', reportPdf.includes('dipotong agar laporan tetap satu halaman'));
ok('PDF menyebut fallback bila model tidak dipakai', reportPdf.includes('Muse Spark tidak tersedia'));
ok('uji manual peramban tersedia dan tidak masuk gerbang CI',
  fs.existsSync(path.join(root, 'scripts/manual-map-capture.js'))
  && !JSON.parse(read('package.json')).scripts.check.includes('manual-map-capture'));

console.log('\n== unit: angka narasi wajib berasal dari data ==');
const meta = {
  bounds: { west: 100, south: -4, east: 106, north: 2 },
  zoom: 6,
  basemap: 'GELAP',
  timelineFrame: 'SEKARANG',
  capturedAt: '2026-11-04T03:00:00Z',
  activeLayers: [{ id: 'lyFire', label: 'Titik api' }],
  attribution: 'NASA FIRMS, Esri'
};
const data = {
  hotspots: [
    { lat: -1, lon: 102, frp: 12.4, confidence: 90, province: 'Riau' },
    { lat: -2, lon: 103, frp: 5, confidence: 60, province: 'Riau' },
    { lat: 40, lon: 10, frp: 99, confidence: 95, province: 'Luar bingkai' }
  ],
  windowHours: 24,
  airPoints: [{ lat: -1, lon: 102, aqi: 151, pm25: 55.4, label: 'Tidak sehat' }],
  windPoints: [{ lat: -1, lon: 103, speed: 3.4, to: 270 }],
  regions: [{ name: 'Pekanbaru', prov: 'Riau', lat: 0.5, lon: 101.4 }],
  volcanoes: []
};
const structured = narrative.buildStructured(meta, data, 'id');
const allowed = narrative.collectAllowedNumbers(structured);
ok('hanya titik di dalam bingkai dihitung', structured.fire.hotspotsInFrame === 2);
ok('keyakinan tinggi dihitung dari data', structured.fire.highConfidenceInFrame === 1);
ok('FRP dijumlahkan oleh kode', structured.fire.totalFrpInFrameMw === 17);
ok('titik AQI terburuk dipilih oleh kode', structured.air.worstPointsInFrame[0].aqi === 151);
ok('arah angin diterjemahkan oleh kode', structured.wind.sample.blowingToward === 'barat');
ok('waktu WIB benar', structured.view.capturedAtWib === '2026-11-04 10:00 WIB (UTC+7)');
ok('pusat permukiman diberi peringatan bukan daftar terdampak',
  structured.settlementCentersInFrame.caveat.includes('BUKAN daftar wilayah terdampak'));
ok('narasi dengan angka sah lolos verifikasi',
  narrative.findUnverifiedNumbers('Ada 2 deteksi dan AQI 151 pada 2026-11-04 10:00 WIB.', allowed).length === 0);
const bad = narrative.findUnverifiedNumbers('Sekitar 5000 orang terdampak dan 12,5 persen wilayah.', allowed);
ok('angka rekaan ditandai', bad.length === 2 && bad.includes('5000'));
ok('penanda daftar dan sitasi tidak dianggap angka',
  narrative.findUnverifiedNumbers('1. Ada 2 deteksi [E1].\n2. AQI 151 [1].', allowed).length === 0);
ok('pemisah ribuan dinormalkan', narrative.normalizeNumber('1.234') === '1234' && narrative.normalizeNumber('12,5') === '12.5');
const local = narrative.localNarrative(structured, 'id');
ok('narasi fallback lokal tidak memuat angka asing', narrative.findUnverifiedNumbers(local, allowed).length === 0);
ok('narasi fallback menyebut 112 dan bukan peringatan resmi', local.includes('112') && local.includes('bukan peringatan resmi'));
const localEn = narrative.localNarrative(narrative.buildStructured(meta, data, 'en'), 'en');
ok('versi Inggris tersedia untuk fallback', localEn.includes('What the map shows') && localEn.includes('not an official warning'));
ok('narasi tetap jujur saat data kosong',
  narrative.localNarrative(narrative.buildStructured(meta, { hotspots: [], airPoints: [], windPoints: [] }, 'id'), 'id')
    .includes('tidak tersedia'));

console.log('\n== unit: gagal provider tidak melempar ==');
(async () => {
  const missing = await narrative.narrateMap({ meta, data, language: 'id' }, { apiKey: '' });
  ok('kunci kosong jatuh ke fallback berlabel', missing.provider === 'local-fallback' && missing.failureCode === 'META_API_KEY_MISSING');
  ok('fallback tetap menyertakan data terstruktur', !!missing.structured && missing.structured.fire.hotspotsInFrame === 2);
  const badImage = await narrative.narrateMap({ meta, data, image: 'data:text/html;base64,AAA', language: 'id' }, { apiKey: 'x' });
  ok('gambar bukan PNG ditolak', badImage.failureCode === 'META_API_IMAGE_INVALID');
  const failing = await narrative.narrateMap({ meta, data, image: 'data:image/png;base64,' + 'A'.repeat(4000), language: 'id' }, {
    apiKey: 'x',
    fetchImpl: async () => ({ ok: false, status: 429 })
  });
  ok('HTTP 429 dilaporkan apa adanya', failing.provider === 'local-fallback' && failing.failureCode === 'META_API_HTTP_429');
  const timeout = await narrative.narrateMap({ meta, data, image: 'data:image/png;base64,' + 'A'.repeat(4000), language: 'id' }, {
    apiKey: 'x',
    timeoutMs: 5,
    fetchImpl: (_url, init) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({}) }), 200);
      init.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    })
  });
  ok('timeout dilaporkan apa adanya', timeout.failureCode === 'META_API_TIMEOUT');

  const goodImage = 'data:image/png;base64,' + 'A'.repeat(4000);
  let calls = 0;
  const repaired = await narrative.narrateMap({ meta, data, image: goodImage, language: 'id' }, {
    apiKey: 'x',
    fetchImpl: async () => {
      calls += 1;
      const text = calls === 1
        ? 'Yang terlihat di peta\nAda 9999 deteksi.'
        : 'Yang terlihat di peta\nAda 2 deteksi panas satelit.';
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }) };
    }
  });
  ok('angka asing memicu satu perbaikan', calls === 2 && repaired.repairAttempts === 1);
  ok('hasil perbaikan terverifikasi', repaired.verified === true && repaired.unverifiedNumbers.length === 0);
  ok('provider dilaporkan sebagai muse-spark', repaired.provider === 'muse-spark');

  let stubbornCalls = 0;
  const stubborn = await narrative.narrateMap({ meta, data, image: goodImage, language: 'id' }, {
    apiKey: 'x',
    fetchImpl: async () => {
      stubbornCalls += 1;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Ada 9999 deteksi.' } }] }) };
    }
  });
  ok('model yang keras kepala hanya diperbaiki sekali', stubbornCalls === 2);
  ok('sisa angka asing ditandai, tidak disembunyikan', stubborn.verified === false && stubborn.unverifiedNumbers.includes('9999'));

  console.log(`\n${pass}/${pass + fail} uji tangkapan peta dan narasi lulus.\n`);
  process.exit(fail ? 1 : 0);
})();
