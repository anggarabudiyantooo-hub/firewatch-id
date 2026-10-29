'use strict';

const fs = require('fs');
const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const model = fs.readFileSync(require.resolve('../lib/plume-model.js'), 'utf8');
const cloud = fs.readFileSync(require.resolve('../public/smoke-cloud-layer.js'), 'utf8');
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    passed++;
    console.log('  LULUS ' + name);
  } else {
    failed++;
    console.log('  GAGAL ' + name + ': dapat ' + JSON.stringify(actual) + ', harap ' + JSON.stringify(expected));
  }
}

console.log('\n== integrasi UI haze regional dan cakupan plume ==');
check('toggle haze regional terpisah dan aktif secara default',
  /id="lyRegionalHaze" checked/.test(html), true);
check('status kesegaran dan panel sumber regional tersedia',
  /id="regionalHazeStatus"/.test(html) && /id="regionalHazeReport"/.test(html), true);
check('grup regional dipisah dari plume asap dan PM2.5',
  /var gRegionalHaze = L\.layerGroup\(\)/.test(app)
    && /bindLayer\('lyRegionalHaze', gRegionalHaze\)/.test(app)
    && /var gSmoke = L\.layerGroup\(\)/.test(app)
    && (/var gPm25 = L\.layerGroup\(\)/.test(app)
      || /var gPm25 = window\.SiagaSmokeGridLayer[\s\S]*?\.create\(L/.test(app)), true);
check('sapuan ASMC melewati freshness window sementara marker historis tetap tersedia',
  /ageMs <= maxAgeMs/.test(app) && /if \(!\$\('lyRegionalHaze'\)\.checked\) return/.test(app)
    && /marker\.source !== 'bmkg' && !fresh/.test(app), true);
check('marker NEA Singapura dibuat terpisah dari cloud footprints',
  /report\.markers/.test(app) && /marker\.source === 'nea'/.test(app)
    && /L\.circleMarker\(\[lat, lon\]/.test(app), true);
check('marker BMKG Jakarta bertanggal dan tidak dibuat sebagai cloud footprint',
  /id: 'jakarta-bmkg-observation'/.test(fs.readFileSync(require.resolve('../lib/regional-haze.js'), 'utf8'))
    && /label: 'Jakarta · laporan BMKG 16\/20 Okt'/.test(fs.readFileSync(require.resolve('../lib/regional-haze.js'), 'utf8'))
    && /Observasi historis BMKG/.test(app)
    && /marker\.source !== 'bmkg' && !fresh/.test(app), true);
check('kartu BMKG menautkan sumber resmi dan kutipan Kepala BMKG',
  /meta\.bmkg\.officialSourceUrl/.test(app) && /meta\.bmkg\.quotedSourceUrl/.test(app)
    && /durationHours/.test(app) && /altitudeMinimumKm/.test(app), true);
check('observasi Jakarta muncul sebagai kejadian historis dengan ambiguitas tanggal yang eksplisit',
  /Observasi atmosfer BMKG/.test(app)
    && /timeLabel: english \? officialDateLabel \+ ' · historical, media dates differ'[\s\S]*?: officialDateLabel \+ ' · historis, tanggal media berbeda'/.test(app)
    && /eventDateStatus: 'source-conflict'/.test(fs.readFileSync(require.resolve('../lib/regional-haze.js'), 'utf8'))
    && /dateAttributionNoteId/.test(app), true);
check('lapisan regional memakai radial cloud, plume angin tetap directional',
  /plume\.kind === 'reported-region'/.test(cloud)
    && /createRadialGradient/.test(cloud) && /createLinearGradient/.test(cloud), true);
check('cakupan klaster visual dibedakan dari perhitungan dampak seluruh klaster',
  /plumeCoverageStatus/.test(html)
    && /buildImpactPlumes\(clusters/.test(server)
    && /impactedRegions\(plumeBuild\.impactPlumes, REGIONS\)/.test(server)
    && /geometri indikatif, bukan dispersi atau observasi/i.test(app), true);
check('pusat model cocok dengan poligon raster, bukan cone yang diperlebar',
  /pointInPolygon\(regionLat, regionLon, plume\.polygon\)/.test(model), true);
check('status UI membedakan model angin tak tersedia dari nol pusat',
  /status === 'wind-unavailable'/.test(app)
    && /Pusat model tidak dihitung/.test(app), true);
check('waktu akuisisi hotspot terbaru ditampilkan terpisah dari umur data tertua',
  /m\.newestAcq/.test(app) && /m\.latestAcqAgeHours/.test(app), true);
check('hitungan pusat model bukan statistik orang terpapar',
  /modeledCenterCount/.test(app)
    && /peopleExposed: null/.test(server)
    && /Dalam plume model/.test(html)
    && /sImpSub/.test(app) && /pusat kota\/kabupaten · indikatif/.test(app), true);
check('kartu laporan kesehatan menyebut tanggal data dan keterbatasan ISPA',
  /health\.dataThrough/.test(app) && /bukan jumlah orang terpapar plume/i.test(app), true);
check('laporan kesehatan Kemenkes dan ASMC memakai jenis kejadian tersendiri',
  /kind: 'Laporan regional ASMC'/.test(app)
    && /kind: 'Laporan kesehatan Kemenkes'/.test(app), true);
check('ringkasan awal tidak memuat angka contoh dampak yang stale',
  /id="sImp">-/.test(html) && !html.includes('6 kota/kabupaten terdampak asap'), true);
check('daftar kejadian dan linimasa diisi dari data, bukan fixture statis',
  /var compactList = \$\('kejadianList'\)/.test(app)
    && /var timeline = \$\('timelineCards'\)/.test(app), true);

console.log('\n========================================');
console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
console.log('========================================');
if (failed) process.exitCode = 1;
