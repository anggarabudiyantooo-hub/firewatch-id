#!/usr/bin/env node
/**
 * Pelari eval untuk asisten SIAGA.ID.
 *
 * Dua fase, dipisah supaya hasilnya jujur:
 *
 *  1. FASE ALAT (tanpa model, tanpa kunci API). Setiap kasus data dijalankan
 *     langsung pada alat baca-sagen dengan konteks dari data publik yang
 *     sama dengan dasbor. Yang dinilai: alat mengembalikan data yang bisa
 *     diperiksa, batas interpretasi tetap ada, dan angka masuk akal.
 *
 *  2. FASE AGEN (butuh MODEL_API_KEY di server). Pertanyaan dikirim ke
 *     /api/ask dan jawabannya dinilai: kata kunci wajib, frasa terlarang,
 *     sitasi bukti, status verifier angka, dan penolakan untuk kasus batas.
 *     Tanpa kunci, fase ini DILEWATI dan dilaporkan sebagai dilewati, bukan
 *     dihitung lulus.
 *
 * Pakai:
 *   node server.js
 *   node evals/run.js                      # keduanya, fase agen bila ada kunci
 *   node evals/run.js --tools-only
 *   node evals/run.js --origin=https://... # terhadap produksi
 *
 * Hasil ditulis ke evals/results.json dan evals/results.md.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const agent = require('../lib/muse-agent');
const REGIONS = require('../data/regions.json');
const PVMBG = require('../lib/pvmbg-snapshot');
const VOLCANO_COORDS = require('../lib/volcano-coords-snapshot');

const args = process.argv.slice(2);
const originArg = args.find(a => a.startsWith('--origin='));
const ORIGIN = (originArg ? originArg.slice('--origin='.length) : process.env.SIAGA_ORIGIN || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TOOLS_ONLY = args.includes('--tools-only');
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8')).cases;

const results = [];
function record(phase, id, name, passed, detail) {
  results.push({ phase, id, name, passed: passed === true, detail: detail == null ? '' : String(detail).slice(0, 300) });
  const mark = passed === true ? 'LULUS' : (passed === null ? 'LEWAT' : 'GAGAL');
  console.log('  ' + mark, phase, id, name, detail ? '- ' + String(detail).slice(0, 120) : '');
}

async function getJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 30000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error('HTTP_' + response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function buildContext() {
  const [overview, status] = await Promise.all([
    getJson(ORIGIN + '/api/overview', 60000),
    getJson(ORIGIN + '/api/status', 20000).catch(() => ({ tasks: [] }))
  ]);
  const coords = new Map((VOLCANO_COORDS.volcanoes || []).map(v => [String(v.name).toLowerCase(), v]));
  const volcanoPoints = (PVMBG.volcanoes || []).map(v => {
    const c = coords.get(String(v.name).toLowerCase());
    return c ? { name: v.name, lat: c.lat, lon: c.lon, level: [v.roman, v.status].filter(Boolean).join(' ') } : null;
  }).filter(Boolean);
  const sourceState = {};
  for (const task of (status.tasks || [])) {
    sourceState[task.id] = { hasData: task.hasData, healthy: task.healthy, lastOkAgeMs: task.ageMs };
  }
  return {
    overview,
    // /api/overview memotong titik api ke subset teratas FRP. Eval alat
    // karena itu menilai konsistensi, bukan jumlah nasional mutlak.
    hotspotsAll: overview.hotspots || [],
    regions: REGIONS,
    volcanoPoints,
    sourceState,
    resolveAirPoint: async (lat, lon) => {
      const body = await getJson(ORIGIN + '/api/air-point?lat=' + lat + '&lon=' + lon, 30000);
      return body && body.air;
    },
    resolveWindAt: async (lat, lon) => {
      const box = { west: lon - 1, east: lon + 1, south: lat - 1, north: lat + 1 };
      const body = await getJson(ORIGIN + '/api/wind-field?step=1&west=' + box.west + '&east=' + box.east
        + '&south=' + box.south + '&north=' + box.north, 40000);
      const points = (body && body.points) || [];
      let best = null;
      let bestDist = Infinity;
      for (const p of points) {
        const dist = Math.pow(p.lat - lat, 2) + Math.pow(p.lon - lon, 2);
        if (dist < bestDist) { bestDist = dist; best = p; }
      }
      return best ? { speed: best.speed, from: best.from, to: best.to, run: body.run, validTime: body.validTime } : null;
    }
  };
}

function toolInvariants(name, result) {
  const problems = [];
  if (!result || typeof result !== 'object') return ['hasil bukan objek'];
  if (typeof result.available !== 'boolean') problems.push('tidak menyatakan available');
  if (!result.note && name !== 'get_source_health') problems.push('tidak ada batas interpretasi');
  if (name === 'get_hotspots_in_area') {
    const c = result.counts || {};
    if (!Number.isFinite(c.detections)) problems.push('jumlah deteksi bukan angka');
    if (c.highConfidence > c.detections) problems.push('keyakinan tinggi melebihi total');
    if (c.detections < 0 || c.totalFrpMw < 0) problems.push('angka negatif');
    if (!result.mapHint || result.mapHint.kind !== 'bbox') problems.push('tidak ada petunjuk peta');
  }
  if (name === 'get_places_in_area') {
    if (!/NOT a list of affected places/.test(result.note || '')) problems.push('kehilangan peringatan bukan daftar terdampak');
    if ((result.places || []).some(p => !p.name)) problems.push('ada permukiman tanpa nama');
  }
  if (name === 'get_air_quality_at') {
    if (result.available && (!result.current || !Number.isFinite(result.current.usAqi))) problems.push('AQI tidak tersedia padahal available');
    if (!/no medical advice/.test(result.note || '')) problems.push('kehilangan larangan nasihat medis');
  }
  if (name === 'get_wind_at' && result.available && !Number.isFinite(result.surfaceWind.speedMs)) problems.push('kecepatan angin bukan angka');
  if (name === 'get_volcano_near') {
    if ((result.volcanoes || []).some(v => v.distanceKm > result.searchRadiusKm)) problems.push('gunung di luar radius dicari');
    if (!/set by PVMBG/.test(result.note || '')) problems.push('kehilangan catatan radius resmi');
  }
  if (name === 'compare_time_windows') {
    const a = result.detectionsInWindowA;
    const b = result.detectionsInWindowB;
    if (!Number.isFinite(a) || !Number.isFinite(b)) problems.push('hitungan jendela bukan angka');
    if (result.windowAHours >= result.windowBHours && b > a) problems.push('jendela pendek melebihi jendela panjang');
    if (result.difference !== a - b) problems.push('selisih tidak cocok');
  }
  if (name === 'get_source_health' && !Array.isArray(result.feeds)) problems.push('tidak ada daftar feed');
  return problems;
}

async function toolsPhase() {
  console.log('\n== FASE ALAT (tanpa model) ==');
  let context;
  try { context = await buildContext(); }
  catch (error) {
    record('tool', 'SETUP', 'konteks dari data publik', false, error.message);
    return;
  }
  record('tool', 'SETUP', 'konteks dari data publik', true,
    'hotspots=' + context.hotspotsAll.length + ' feeds=' + Object.keys(context.sourceState).length);
  for (const item of CASES) {
    if (!item.tool) continue;
    let result;
    try { result = await agent.executeTool(item.tool.name, item.tool.args, context); }
    catch (error) { record('tool', item.id, item.tool.name, false, error.message); continue; }
    const problems = toolInvariants(item.tool.name, result);
    record('tool', item.id, item.tool.name, problems.length === 0, problems.join('; ') || 'available=' + result.available);
  }
  // Penolakan argumen rusak: alat tidak boleh menebak.
  const badArgs = [
    ['get_hotspots_in_area', { west: 106, east: 100, south: -4, north: 2 }],
    ['get_air_quality_at', { lat: 120, lon: 100 }],
    ['get_places_in_area', {}]
  ];
  for (const [name, toolArgs] of badArgs) {
    let rejected = false;
    try { await agent.executeTool(name, toolArgs, context); } catch { rejected = true; }
    record('tool', 'ARG', name + ' menolak argumen rusak', rejected);
  }
}

function scoreAnswer(item, body) {
  const text = (body.answer || []).join('\n').toLowerCase();
  const checks = item.checks || {};
  const problems = [];
  if (!text) problems.push('jawaban kosong');
  if (checks.mustIncludeAny && checks.mustIncludeAny.length) {
    const hit = checks.mustIncludeAny.some(k => text.includes(String(k).toLowerCase()));
    if (!hit) problems.push('tidak memuat kata kunci wajib');
  }
  if (checks.mustNotInclude) {
    const bad = checks.mustNotInclude.filter(k => text.includes(String(k).toLowerCase()));
    if (bad.length) problems.push('memuat frasa terlarang: ' + bad.join(', '));
  }
  const provider = body.provider || 'unknown';
  if (provider !== 'muse-spark') problems.push('bukan keluaran Muse Spark (' + provider + ')');
  if (checks.expectCitation && provider === 'muse-spark') {
    const evidence = Array.isArray(body.evidence) ? body.evidence : [];
    if (!evidence.length) problems.push('tidak ada jejak bukti');
    else if (!/\[[EC][1-8]\]/.test((body.answer || []).join('\n'))) problems.push('jawaban tidak merujuk ID bukti');
  }
  const verification = body.verification || {};
  if (verification.status === 'flagged') problems.push('verifier menandai angka: ' + (verification.unverifiedNumbers || []).join(', '));
  if (checks.expectRefusal) {
    const refusalMarker = (checks.mustIncludeAny || []).some(k => text.includes(String(k).toLowerCase()));
    if (!refusalMarker) problems.push('tidak menolak dengan jelas');
  }
  return problems;
}

async function agentPhase() {
  console.log('\n== FASE AGEN (Muse Spark) ==');
  let status;
  try { status = await getJson(ORIGIN + '/api/ask/status', 20000); }
  catch (error) {
    record('agent', 'SETUP', 'status API', null, 'tidak dapat dihubungi: ' + error.message);
    return;
  }
  if (!status.metaApiConfigured) {
    for (const item of CASES) record('agent', item.id, item.kind, null, 'MODEL_API_KEY tidak disetel di server; fase agen dilewati');
    return;
  }
  for (const item of CASES) {
    let body;
    try {
      body = await getJson(ORIGIN + '/api/ask?q=' + encodeURIComponent(item.question) + '&lang=' + item.lang, 60000);
    } catch (error) {
      record('agent', item.id, item.kind, false, error.message);
      continue;
    }
    const problems = scoreAnswer(item, body);
    record('agent', item.id, item.kind, problems.length === 0,
      problems.join('; ') || ((body.verification || {}).status || 'tanpa status verifier'));
    // Hormati kuota per IP: jeda singkat antar pertanyaan.
    await new Promise(resolve => setTimeout(resolve, 6000));
  }
}

function summarize() {
  const phases = ['tool', 'agent'];
  const lines = ['# Hasil eval SIAGA.ID', '', 'Sumber kasus: `evals/cases.json`.', '',
    'Dijalankan: ' + new Date().toISOString(), '', 'Origin: ' + ORIGIN, ''];
  const summary = {};
  for (const phase of phases) {
    const rows = results.filter(r => r.phase === phase);
    const passed = rows.filter(r => r.passed && r.detail.indexOf('dilewati') < 0).length;
    const skipped = rows.filter(r => !r.passed && /dilewati|tidak dapat dihubungi/.test(r.detail)).length;
    const failed = rows.length - passed - skipped;
    summary[phase] = { total: rows.length, passed, failed, skipped };
    lines.push('## Fase ' + (phase === 'tool' ? 'alat (tanpa model)' : 'agen (Muse Spark)'), '',
      '- Lulus: ' + passed, '- Gagal: ' + failed, '- Dilewati: ' + skipped, '',
      '| Kasus | Nama | Hasil | Catatan |', '| --- | --- | --- | --- |');
    for (const row of rows) {
      const state = row.passed ? 'LULUS' : (/dilewati|tidak dapat dihubungi/.test(row.detail) ? 'LEWAT' : 'GAGAL');
      lines.push('| ' + row.id + ' | ' + row.name + ' | ' + state + ' | ' + row.detail.replace(/\|/g, '/') + ' |');
    }
    lines.push('');
  }
  lines.push('## Cara membaca hasil', '',
    'Fase alat memeriksa lapisan data dan batas interpretasi tanpa memanggil model, jadi hasilnya bisa diulang siapa pun tanpa kunci API.',
    'Fase agen hanya dinilai bila server memegang MODEL_API_KEY. Tanpa kunci, kasus agen dilaporkan DILEWATI, bukan lulus.',
    'Verifier angka menolak angka yang tidak ada di hasil alat; status `flagged` dihitung gagal walau jawabannya terdengar masuk akal.', '');
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ origin: ORIGIN, ranAt: new Date().toISOString(), summary, results }, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, 'results.md'), lines.join('\n'));
  console.log('\n== RINGKASAN ==');
  for (const phase of phases) {
    const s = summary[phase];
    console.log('  ' + phase + ': ' + s.passed + '/' + s.total + ' lulus, ' + s.failed + ' gagal, ' + s.skipped + ' dilewati');
  }
  console.log('\nHasil: evals/results.json dan evals/results.md\n');
  return summary;
}

(async () => {
  await toolsPhase();
  if (!TOOLS_ONLY) await agentPhase();
  else for (const item of CASES) record('agent', item.id, item.kind, null, '--tools-only: fase agen dilewati');
  const summary = summarize();
  process.exit(summary.tool.failed > 0 || summary.agent.failed > 0 ? 1 : 0);
})().catch((error) => { console.error('GAGAL', error && error.stack); process.exit(1); });
