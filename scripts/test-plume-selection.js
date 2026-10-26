'use strict';

const { selectRegionalClusters } = require('../lib/plume-selection');
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

function cluster(region, lat, lon, frp, count) {
  return { region, lat, lon, frp, count: count || 1 };
}

console.log('\n== pemilihan klaster plume lintas wilayah ==');
const spread = [
  cluster('Kalimantan Tengah', -2.3, 113.2, 1000, 10),
  cluster('Kalimantan Tengah', -2.5, 113.4, 900, 9),
  cluster('Kalimantan Tengah', -2.7, 113.6, 800, 8),
  cluster('Sumatera Selatan', -3.1, 104.1, 120, 4),
  cluster('Jambi', -1.4, 103.4, 90, 3),
  cluster('Riau', 0.5, 101.6, 80, 2)
];
const balanced = selectRegionalClusters(spread, item => item.region, { maxClusters: 4, perRegion: 2 });
check('klaster terkuat tiap wilayah dipilih sebelum klaster tambahan wilayah dominan',
  balanced.clusters.map(item => item.region).sort().join(','),
  'Jambi,Kalimantan Tengah,Riau,Sumatera Selatan');
check('jumlah wilayah sumber yang terwakili dilaporkan', balanced.selectedRegionCount, 4);
check('seleksi menyatakan sebagian klaster sengaja dilewati', balanced.truncated, true);
check('batas per wilayah ditaati', balanced.clusters.filter(item => item.region === 'Kalimantan Tengah').length, 1);

const cappedRows = [];
for (let region = 0; region < 20; region++) {
  for (let index = 0; index < 3; index++) {
    cappedRows.push(cluster('Wilayah ' + String(region).padStart(2, '0'), region - 10, 100 + region, 1000 - region * 10 - index, 1));
  }
}
const capped = selectRegionalClusters(cappedRows, item => item.region, { maxClusters: 36, perRegion: 3 });
check('batas total seleksi tetap 36', capped.clusters.length, 36);
check('putaran pertama tetap mewakili seluruh 20 wilayah', capped.selectedRegionCount, 20);
check('batas maksimal tiga klaster per wilayah dijaga',
  Math.max(...capped.regions.map(item => item.selectedClusters)), 2);
check('total klaster masukan tidak hilang dari metadata', capped.totalClusterCount, 60);
check('batas seleksi ditandai sebagai terpotong', capped.truncated, true);

const invalid = selectRegionalClusters([
  cluster('A', -1, 100, 10),
  { region: 'B', lat: null, lon: 105, frp: 999 },
  { region: 'C', lat: 95, lon: 105, frp: 999 },
  { region: 'D', lat: 4, lon: 181, frp: 999 },
  { lat: 4, lon: 115, frp: 5 }
], item => item.region, { maxClusters: 10, perRegion: 3 });
check('koordinat nonnumerik atau di luar rentang bumi diabaikan, lokasi tanpa label tetap dikelompokkan geografis',
  invalid.clusters.length, 2);
check('sel tanpa label memperoleh kelompok fallback',
  invalid.regions.some(item => item.region.indexOf('grid:') === 0), true);
check('seleksi tanpa pemotongan dilaporkan lengkap', invalid.truncated, false);

const none = selectRegionalClusters(null, () => 'A');
check('masukan non-array menghasilkan pilihan kosong yang aman', none.clusters.length, 0);

console.log('\n' + '='.repeat(40));
console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
console.log('='.repeat(40));
process.exit(failed ? 1 : 0);
