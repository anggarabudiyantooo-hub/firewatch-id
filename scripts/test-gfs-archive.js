'use strict';

const grib2 = require('../lib/grib2');
const fakeData = new Float32Array(360 * 181);
const fakeV = new Float32Array(360 * 181);
fakeData.fill(3);
fakeV.fill(4);
const grid = { ni: 360, nj: 181, la1: 90, lo1: 0, di: 1, dj: 1 };
grib2.parse = function () {
  return [
    { category: 2, number: 2, grid, data: fakeData },
    { category: 2, number: 3, grid, data: fakeV }
  ];
};
const { fetchWindFieldAt, runForValidTime, sampleAt } = require('../lib/wind-gfs');
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

console.log('\n== arsip GFS historis ==');
const atAnalysis = runForValidTime('2026-10-22T13:03:00.000Z');
check('waktu di awal siklus memilih run 12Z dan analisis',
  atAnalysis.run.ymd + '/' + atAnalysis.run.cyc + '/f' + String(atAnalysis.fhour).padStart(3, '0'),
  '20261022/12/f000');
const atForecast = runForValidTime('2026-10-22T15:30:00.000Z');
check('target di antara valid time memakai lead tiga jam terdekat',
  atForecast.run.ymd + '/' + atForecast.run.cyc + '/f' + String(atForecast.fhour).padStart(3, '0'),
  '20261022/12/f003');
check('waktu berlaku arsip adalah valid time GFS, bukan target yang diminta',
  atForecast.validTime, '2026-10-22T15:00:00.000Z');
const nearNextCycle = runForValidTime('2026-10-22T17:30:00.000Z');
check('lead enam jam boleh sedikit melewati target',
  nearNextCycle.validTime, '2026-10-22T18:00:00.000Z');
check('invalid target ditolak tanpa memilih siklus sekarang', runForValidTime('bukan-waktu'), null);
check('target null tidak dibaca sebagai waktu Unix 1970', runForValidTime(null), null);

const requests = [];
const indexText = [
  '1:0:d=2026102112:TMP:surface:anl:',
  '585:100:d=2026102112:UGRD:10 m above ground:anl:',
  '586:500:d=2026102112:VGRD:10 m above ground:anl:',
  '587:5900:d=2026102112:TMP:surface:anl:'
].join('\n');
const gribBytes = Buffer.alloc(5800);
gribBytes.write('GRIB', 0, 'ascii');
async function fakeFetch(url, options) {
  requests.push({ url, options: options || {} });
  if (url.endsWith('.idx')) {
    return { ok: true, status: 200, text: async () => indexText };
  }
  return { status: 206, arrayBuffer: async () => gribBytes };
}

(async () => {
  const field = await fetchWindFieldAt(fakeFetch, '2026-10-21T15:30:00.000Z');
  check('arsip memilih file run dan lead historis', field.run + '/f' + String(field.fhour).padStart(3, '0'), '20261021 12Z/f003');
  check('valid time dibawa bersama medan', field.validTime, '2026-10-21T15:00:00.000Z');
  check('indeks dan berkas binari diminta dari bucket arsip publik',
    requests.length === 2 && requests[0].url.includes('/gfs.20261021/12/atmos/')
      && requests[0].url.endsWith('.f003.idx') && requests[1].url.endsWith('.f003'), true);
  check('pengambilan hanya meminta rentang byte UGRD/VGRD', requests[1].options.headers.Range, 'bytes=100-5899');
  const sample = sampleAt(field, -7.56, 110.82);
  check('grid hasil parsing dapat disampel pada lokasi Indonesia',
    !!sample && Number.isFinite(sample.speed) && sample.speed > 0, true);

  console.log('\n' + '='.repeat(40));
  console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
  console.log('='.repeat(40));
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
