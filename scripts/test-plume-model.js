'use strict';

const {
  buildIndicativePlume,
  buildImpactPlumes,
  impactedRegions,
  pointInPolygon
} = require('../lib/plume-model');

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

console.log('\n== model plume dari seluruh klaster FIRMS ==');
const clusters = Array.from({ length: 588 }, (_, index) => ({
  lat: -10 + index * 0.01,
  lon: 100 + (index % 10) * 0.01,
  frp: index + 1,
  count: 1 + (index % 5)
}));
const all = buildImpactPlumes(clusters, () => ({ speed: 5, from: 270 }), () => 'Provinsi uji');
check('seluruh 588 klaster diproses tanpa batas sampling visual', all.modeledClusters, 588);
check('jumlah masukan dilaporkan terpisah dari sampel peta', all.inputClusters, 588);
check('setiap klaster yang berhasil memakai sampel angin valid', all.plumes.every(plume => plume.wind.estimated === false), true);
check('bujur angin dinormalisasi ke 0-359 derajat', buildIndicativePlume(
  { lat: 0, lon: 0, frp: 10, count: 1 }, { speed: 2, from: 360 }
).wind.from, 0);
check('plume memiliki poligon tertutup yang sama untuk uji model dan raster',
  all.plumes[0].polygon[0][0] === all.plumes[0].polygon[all.plumes[0].polygon.length - 1][0]
    && all.plumes[0].polygon[0][1] === all.plumes[0].polygon[all.plumes[0].polygon.length - 1][1], true);

const partial = buildImpactPlumes([
  { lat: 0, lon: 0, frp: 100, count: 2 },
  { lat: 91, lon: 0, frp: 100, count: 2 },
  { lat: 1, lon: 1, frp: 100, count: 2 },
  { lat: 2, lon: 2, frp: 100, count: 2 }
], (lat) => lat === 0 ? { speed: 4, from: 270, estimated: true } : null);
check('klaster berkoordinat tidak valid dihitung sebagai invalid', partial.invalidClusters, 1);
check('angin hilang atau fallback estimasi tidak masuk perhitungan dampak', partial.windUnavailableClusters, 3);
check('fallback angin buatan tidak menghasilkan plume model', partial.modeledClusters, 0);

const plume = buildIndicativePlume(
  { lat: 0, lon: 0, frp: 100, count: 2 },
  { speed: 5, from: 270 },
  () => 'Provinsi uji'
);
function pointAt(bearing, distanceKm) {
  const radians = bearing * Math.PI / 180;
  return [distanceKm * Math.cos(radians) / 111, distanceKm * Math.sin(radians) / 111];
}
const inside = pointAt(90, 100);
const justOutsideAngle = pointAt(65, 100);
const tooFar = pointAt(90, 200);
const centers = impactedRegions([plume], [
  { name: 'dalam', prov: 'P', lat: inside[0], lon: inside[1], pop: 1000 },
  { name: 'batas-sumber', prov: 'P', lat: 0, lon: 0, pop: 100 },
  { name: 'di-luar-sudut', prov: 'P', lat: justOutsideAngle[0], lon: justOutsideAngle[1], pop: 200 },
  { name: 'di-luar-jangkauan', prov: 'P', lat: tooFar[0], lon: tooFar[1], pop: 300 }
]);
check('pusat di dalam poligon model terhitung', centers.some(center => center.name === 'dalam'), true);
check('pusat sumber tepat di vertex plume tidak hilang karena bearing nol',
  centers.some(center => center.name === 'batas-sumber'), true);
check('pusat tepat di luar sudut poligon tidak dihitung oleh cone yang diperlebar',
  centers.some(center => center.name === 'di-luar-sudut'), false);
check('pusat di luar panjang poligon tidak dihitung',
  centers.some(center => center.name === 'di-luar-jangkauan'), false);
check('daftar pusat model hanya berisi titik yang masuk geometri aktual',
  centers.length, 2);
check('fungsi geometri menolak koordinat atau ring rusak',
  pointInPolygon(NaN, 0, plume.polygon) === false
    && pointInPolygon(0, 0, [[0, 0], [1, 1]]) === false, true);

console.log('\n' + '='.repeat(40));
console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
console.log('='.repeat(40));
process.exit(failed ? 1 : 0);
