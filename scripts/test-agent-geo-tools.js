#!/usr/bin/env node
// Alat agen berbasis koordinat dan verifier angka. Semua resolver di-stub,
// jadi uji ini tidak memanggil jaringan atau model.
'use strict';
const assert = require('node:assert/strict');
const agent = require('../lib/muse-agent');
const { collectAllowedNumbers, findUnverifiedNumbers } = require('../lib/map-narrative');

let pass = 0;
let fail = 0;
function ok(name, condition, detail) {
  if (condition) { pass += 1; console.log('  LULUS', name, detail || ''); }
  else { fail += 1; console.error('  GAGAL', name, detail || ''); }
}
async function rejectsAsync(name, fn) {
  try { await fn(); ok(name, false, 'tidak melempar'); }
  catch (error) { ok(name, error.message === 'invalid_tool_arguments', error.message); }
}
function rejects(name, fn) {
  try { fn(); ok(name, false, 'tidak melempar'); }
  catch (error) { ok(name, error.message === 'invalid_tool_arguments', error.message); }
}

const NOW = Date.now();
const iso = (hoursAgo) => new Date(NOW - hoursAgo * 3600 * 1000).toISOString();
const context = {
  hotspotsAll: [
    { lat: -0.5, lon: 101.5, frp: 30, confidence: 90, acq: iso(2), province: 'Riau' },
    { lat: -1.0, lon: 102.0, frp: 12, confidence: 65, acq: iso(10), province: 'Riau' },
    { lat: -2.0, lon: 103.0, frp: 8, confidence: 30, acq: iso(30), province: 'Jambi' },
    { lat: -7.0, lon: 110.0, frp: 50, confidence: 95, acq: iso(1), province: 'Jawa Tengah' }
  ],
  regions: [
    { name: 'Pekanbaru', prov: 'Riau', lat: 0.5, lon: 101.4 },
    { name: 'Jambi', prov: 'Jambi', lat: -1.6, lon: 103.6 },
    { name: 'Semarang', prov: 'Jawa Tengah', lat: -6.99, lon: 110.42 }
  ],
  volcanoPoints: [
    { name: 'Merapi', lat: -7.54, lon: 110.446, level: 'III Siaga' },
    { name: 'Sinabung', lat: 3.17, lon: 98.392, level: 'II Waspada' }
  ],
  sourceState: {
    hotspots: { hasData: true, healthy: true, lastOkAgeMs: 60000, consecutiveFails: 0 },
    pvmbg: { hasData: false, healthy: false, lastOkAgeMs: null, consecutiveFails: 3 }
  },
  resolveAirPoint: async (lat) => (lat > 5 ? null : { aqi: 156, pm25: 62.4, pm10: 80, label: 'Tidak sehat' }),
  resolvePm25Forecast: async () => ({ hours: 3, peakPm25UgM3: 71.2, series: [{ time: '2026-11-04T10:00', pm25UgM3: 71.2 }] }),
  resolveWindAt: async (lat) => (lat > 5 ? null : { speed: 4.2, from: 90, to: 270, run: '20261104/00', validTime: '2026-11-04T06:00:00Z' })
};
const box = { west: 100, south: -4, east: 106, north: 2 };

(async () => {
  console.log('\n== validasi argumen koordinat ==');
  rejects('kotak terbalik ditolak', () => agent.executeTool('get_hotspots_in_area', { west: 106, east: 100, south: -4, north: 2 }, context));
  rejects('kotak terlalu besar ditolak', () => agent.executeTool('get_hotspots_in_area', { west: -30, east: 40, south: -4, north: 2 }, context));
  await rejectsAsync('lintang di luar rentang ditolak', () => agent.executeTool('get_air_quality_at', { lat: 120, lon: 100 }, context));
  await rejectsAsync('bujur di luar rentang ditolak', () => agent.executeTool('get_wind_at', { lat: 0, lon: 999 }, context));
  rejects('alat tanpa argumen wajib ditolak', () => agent.executeTool('get_places_in_area', {}, context));

  console.log('\n== get_hotspots_in_area ==');
  const area = agent.executeTool('get_hotspots_in_area', { ...box, hours: 24 }, context);
  ok('hanya titik dalam kotak dan jendela dihitung', area.counts.detections === 2, JSON.stringify(area.counts));
  ok('keyakinan tinggi dihitung kode', area.counts.highConfidence === 1);
  ok('FRP dijumlahkan kode', area.counts.totalFrpMw === 42);
  ok('provinsi teratas dikembalikan', area.topProvinces[0].province === 'Riau');
  ok('akuisisi terbaru dilaporkan', typeof area.newestAcquisition === 'string');
  ok('petunjuk peta berbentuk kotak', area.mapHint.kind === 'bbox');
  ok('peringatan deteksi bukan kebakaran terkonfirmasi', area.note.includes('not confirmed fires'));
  const wide = agent.executeTool('get_hotspots_in_area', { ...box, hours: 72 }, context);
  ok('jendela lebih panjang memakai himpunan yang sama', wide.counts.detections === 3);

  console.log('\n== get_places_in_area ==');
  const places = agent.executeTool('get_places_in_area', { ...box, top_n: 5 }, context);
  ok('permukiman dalam kotak dikembalikan', places.returned === 2, JSON.stringify(places.places.map(p => p.name)));
  ok('bukan daftar terdampak', places.note.includes('NOT a list of affected places'));

  console.log('\n== get_air_quality_at dan get_wind_at ==');
  const air = await agent.executeTool('get_air_quality_at', { lat: -0.5, lon: 101.5, include_forecast: true }, context);
  ok('AQI titik dibaca dari resolver', air.current.usAqi === 156);
  ok('kategori dikutip, bukan nasihat medis', air.current.category === 'Tidak sehat' && air.note.includes('no medical advice'));
  ok('prakiraan PM2.5 ikut saat diminta', air.pm25Forecast.peakPm25UgM3 === 71.2);
  ok('petunjuk peta menunjuk lapisan udara', air.mapHint.layer === 'lyAir');
  const airMissing = await agent.executeTool('get_air_quality_at', { lat: 20, lon: 101.5 }, context);
  ok('data kosong dilaporkan tidak tersedia', airMissing.available === false && airMissing.current === null);
  const noResolver = await agent.executeTool('get_air_quality_at', { lat: 0, lon: 100 }, {});
  ok('tanpa resolver tidak mengarang angka', noResolver.available === false && noResolver.error === 'resolver_unavailable');
  const wind = await agent.executeTool('get_wind_at', { lat: -0.5, lon: 101.5 }, context);
  ok('angin titik dibaca dari resolver', wind.surfaceWind.speedMs === 4.2 && wind.surfaceWind.towardDegrees === 270);
  ok('waktu valid model dilaporkan', wind.surfaceWind.validTime === '2026-11-04T06:00:00Z');
  ok('bukan lintasan asap teramati', wind.note.includes('not an observed plume track'));

  console.log('\n== get_volcano_near ==');
  const near = agent.executeTool('get_volcano_near', { lat: -7.8, lon: 110.36, radius_km: 100 }, context);
  ok('gunung terdekat ditemukan', near.volcanoes.length === 1 && near.volcanoes[0].name === 'Merapi');
  ok('jarak dihitung kode', near.volcanoes[0].distanceKm > 20 && near.volcanoes[0].distanceKm < 40, String(near.volcanoes[0].distanceKm));
  ok('radius bahaya tetap milik otoritas', near.note.includes('set by PVMBG'));
  ok('radius dicari dibatasi', agent.executeTool('get_volcano_near', { lat: 0, lon: 100, radius_km: 9999 }, context).searchRadiusKm === 300);

  console.log('\n== compare_time_windows dan get_source_health ==');
  const compare = agent.executeTool('compare_time_windows', { window_a_hours: 24, window_b_hours: 6, ...box }, context);
  ok('dua jendela dibandingkan', compare.detectionsInWindowA === 2 && compare.detectionsInWindowB === 1);
  ok('selisih dihitung kode', compare.difference === 1);
  ok('bukan perbandingan dua lintasan satelit', compare.note.includes('not two satellite passes'));
  const health = agent.executeTool('get_source_health', {}, context);
  ok('kesehatan per sumber dilaporkan', health.feeds.length === 2);
  ok('sumber gagal tidak dianggap nol', health.feeds[1].hasData === false && health.note.includes('not zero'));

  console.log('\n== verifier angka jawaban ==');
  const allowed = collectAllowedNumbers([area, air, wind, compare]);
  ok('angka dari alat diterima', findUnverifiedNumbers('Ada 2 deteksi, AQI 156, angin 4.2 m/s [E1].', allowed).length === 0);
  ok('angka rekaan ditandai', findUnverifiedNumbers('Sekitar 9000 warga terdampak.', allowed).join(',') === '9000');

  const messages = [{ role: 'system', content: 'x' }, { role: 'user', content: 'berapa titik api' }];
  let calls = 0;
  const repairedOptions = {
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: 'Ringkasan\nAda 2 deteksi panas [E1].' } }] })
      };
    }
  };
  const repaired = await agent.verifyAnswerNumbers('k', messages, ['Ringkasan', 'Ada 9000 deteksi panas [E1].'], allowed, 'id', repairedOptions);
  ok('perbaikan diminta satu kali', calls === 1 && repaired.verification.repairAttempts === 1);
  ok('hasil perbaikan terverifikasi', repaired.verification.status === 'verified');
  ok('angka asing hilang dari jawaban', !repaired.answer.join(' ').includes('9000'));

  const clean = await agent.verifyAnswerNumbers('k', messages, ['Ada 2 deteksi [E1].'], allowed, 'id', {
    fetchImpl: async () => { throw new Error('seharusnya tidak dipanggil'); }
  });
  ok('jawaban bersih tidak memanggil model lagi', clean.extraRequests === 0 && clean.verification.status === 'verified');

  const stubborn = await agent.verifyAnswerNumbers('k', messages, ['Ada 9000 deteksi.'], allowed, 'id', {
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Ada 9000 deteksi.' } }] }) })
  });
  ok('model keras kepala ditandai', stubborn.verification.status === 'flagged');
  ok('catatan ketidakcocokan ditambahkan', stubborn.answer.join(' ').includes('belum terverifikasi'));

  const brokenRepair = await agent.verifyAnswerNumbers('k', messages, ['Ada 9000 deteksi.'], allowed, 'id', {
    fetchImpl: async () => { throw new Error('META_API_TIMEOUT'); }
  });
  ok('perbaikan gagal tidak menggugurkan jawaban', brokenRepair.verification.status === 'flagged' && brokenRepair.answer.length >= 2);

  console.log('\n== definisi alat ==');
  const names = agent.TOOL_DEFINITIONS.map(t => t.function.name);
  ['get_hotspots_in_area', 'get_places_in_area', 'get_air_quality_at', 'get_wind_at', 'get_volcano_near', 'compare_time_windows', 'get_source_health']
    .forEach((name) => ok('alat terdaftar: ' + name, names.includes(name)));
  const geo = agent.TOOL_DEFINITIONS.filter(t => ['get_hotspots_in_area', 'get_air_quality_at', 'get_wind_at', 'get_volcano_near', 'get_places_in_area'].includes(t.function.name));
  ok('argumen koordinat diwajibkan skema', geo.every(t => Array.isArray(t.function.parameters.required) && t.function.parameters.required.length > 0));
  ok('jumlah alat tetap terbatas', agent.TOOL_DEFINITIONS.length === 17, String(agent.TOOL_DEFINITIONS.length));

  // find_place: nama tempat harus diselesaikan kode, bukan dikarang model, dan
  // model tidak boleh lagi meminta pengguna memberi kotak koordinat.
  {
    const ctx = { regions: [
      { name: 'Pekanbaru', prov: 'Riau', lat: 0.5167, lon: 101.4417 },
      { name: 'Palembang', prov: 'Sumatera Selatan', lat: -2.9167, lon: 104.7458 }
    ] };
    const hit = await agent.executeTool('find_place', { name: 'Pekanbaru' }, ctx);
    ok('find_place menyelesaikan nama ke koordinat', hit.matchCount === 1 && hit.matches[0].lat === 0.5167);
    ok('find_place memberi kotak siap pakai', !!hit.suggestedBox && hit.suggestedBox.west < hit.suggestedBox.east && hit.suggestedBox.south < hit.suggestedBox.north);
    ok('kotak usulan selebar satu derajat', Math.abs((hit.suggestedBox.east - hit.suggestedBox.west) - 1) < 0.01);
    const miss = await agent.executeTool('find_place', { name: 'Atlantis' }, ctx);
    ok('nama tidak dikenal tidak menghasilkan koordinat karangan', miss.matchCount === 0 && miss.suggestedBox === null);
    let rejectedEmpty = false;
    try { await agent.executeTool('find_place', { name: '' }, ctx); } catch { rejectedEmpty = true; }
    ok('find_place menolak nama kosong', rejectedEmpty);
    const prompt = agent.buildDeveloperPrompt('en', 'brief');
    ok('prompt EN melarang meminta kotak ke pengguna', /never ask the user for a bounding box/i.test(prompt));
    ok('prompt EN menyuruh find_place lebih dulu', /find_place FIRST/.test(prompt));
  }

  // Batas putaran naik ke 4 (lihat test-muse-agent.js); batas alat tetap 8 dan
  // anggaran dinding wajib lebih kecil dari batas fungsi serverless 60 detik.
  ok('batas putaran dan panggilan alat tetap ada', agent.MAX_TURNS === 4 && agent.MAX_TOOL_CALLS === 8);
  ok('anggaran dinding di bawah batas fungsi serverless', agent.TOTAL_BUDGET_MS <= 50000 && agent.DEFAULT_TIMEOUT_MS < agent.TOTAL_BUDGET_MS);

  console.log('\n== antarmuka: cek angka dan tampilkan di peta ==');
  const fs = require('fs');
  const path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.css'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  ok('lencana cek angka dirender', app.includes('function renderAskVerification') && app.includes('CEK ANGKA: semua angka cocok dengan hasil alat'));
  ok('versi Inggris lencana tersedia', app.includes('NUMBER CHECK: every figure matched a tool result'));
  ok('angka tak terverifikasi ditampilkan', app.includes('verification.unverifiedNumbers.join'));
  ok('tombol tampilkan di peta dirender', app.includes('function renderAskMapHints') && app.includes('TAMPILKAN DI PETA'));
  ok('petunjuk peta hanya dari alat', app.includes('function applyAskMapHint') && app.includes("hint.kind === 'bbox'"));
  ok('id lapisan divalidasi sebelum dipakai', app.includes('/^ly[A-Za-z0-9]{1,20}$/'));
  ok('petunjuk peta tidak mengekspos instance peta ke luar', !app.includes('window.SiagaMap ='));
  ok('gaya lencana dan tombol tersedia', css.includes('.ask-verify{') && css.includes('.ask-map-hint-btn{'));
  ok('jawaban lokal ditandai deterministik', server.includes("status: 'local_deterministic'"));
  ok('konteks agen memuat himpunan titik api penuh', server.includes('hotspotsAll:') && server.includes('resolveAirPoint:'));
  ok('kunci API tidak pernah dikirim ke klien', !app.includes('MODEL_API_KEY'));

/* ---------- regresi: angka bertanda dan jumlah baris alat ---------- */
// Verifier dulu membuang tanda minus, sehingga setiap koordinat lintang
// selatan dianggap angka karangan. Besaran kini ikut diizinkan.
{
  const allowed = collectAllowedNumbers({ lat: -6.2146, lon: 106.8451 });
  ok('koordinat negatif tidak ditandai', findUnverifiedNumbers('lat -6.2146, lon 106.8451', allowed).length === 0);
  ok('penulisan hemisphere tidak ditandai', findUnverifiedNumbers('6.2146 LS, 106.8451 BT', allowed).length === 0);
  ok('angka karangan tetap ditandai', findUnverifiedNumbers('lat -9.9999', allowed).includes('9.9999'));

  // Nama polutan dan satuan bukan besaran. "PM2.5" dulu terbaca sebagai angka
  // 2.5 sehingga jawaban kualitas udara yang benar ditandai karangan.
  {
    const air = collectAllowedNumbers({ aqi: 67, pm25UgM3: 13.3 });
    ok('nama PM2.5 bukan angka', findUnverifiedNumbers('Modelled PM2.5 is 13.3 ug/m3 and AQI is 67.', air).length === 0);
    ok('nama PM10 bukan angka', findUnverifiedNumbers('PM10 is not reported.', air).length === 0);
    ok('satuan angin 10 m bukan angka', findUnverifiedNumbers('GFS 10 m wind at 4.6 m/s.', collectAllowedNumbers({ speedMs: 4.6 })).length === 0);
    ok('angka karangan di kalimat PM2.5 tetap ditandai', findUnverifiedNumbers('PM2.5 is 999 ug/m3.', air).includes('999'));
  }

  // Nomor tingkat gunung harus ikut di hasil alat. Sebelumnya server hanya
  // mengirim "III Siaga", sehingga "Level 3" ditandai sebagai angka karangan.
  {
    const ctx = { volcanoPoints: [{ name: 'Merapi', lat: -7.54, lon: 110.446, level: 'III Siaga', levelNumber: 3, levelRoman: 'III', levelStatus: 'Siaga' }] };
    const vol = await agent.executeTool('get_volcano_near', { lat: -7.7956, lon: 110.3695, radius_km: 100 }, ctx);
    ok('alat gunung memaparkan nomor tingkat resmi', vol.volcanoes[0].levelNumber === 3);
    const volAllowed = collectAllowedNumbers(vol);
    ok('Level 3 tidak ditandai sebagai karangan', !findUnverifiedNumbers('Merapi, Level 3 (Siaga).', volAllowed).includes('3'));
    ok('jarak karangan tetap ditandai', findUnverifiedNumbers('Merapi is 999 km away.', volAllowed).includes('999'));
  }
}

  console.log(`\n${pass}/${pass + fail} uji alat koordinat dan verifier lulus.\n`);
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error('GAGAL', error && error.stack); process.exit(1); });
