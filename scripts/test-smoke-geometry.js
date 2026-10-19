'use strict';

const geometry = require('../public/smoke-geometry');
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

const square = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
const concave = [[0, 0], [0, 10], [4, 10], [4, 4], [10, 4], [10, 0], [0, 0]];

console.log('\n== geometri seleksi asap ==');
check('titik di dalam poligon tertutup', geometry.containsPoint(square, 5, 5), true);
check('titik di luar poligon', geometry.containsPoint(square, 12, 5), false);
check('titik tepat pada sisi horizontal masuk', geometry.containsPoint(square, 0, 5), true);
check('titik tepat pada sisi vertikal masuk', geometry.containsPoint(square, 5, 0), true);
check('titik tepat pada sudut masuk', geometry.containsPoint(square, 10, 10), true);
check('poligon tanpa titik penutup diterima', geometry.containsPoint(square.slice(0, -1), 5, 5), true);
check('bagian lebar bentuk konkaf masuk', geometry.containsPoint(concave, 2, 8), true);
check('bagian tegak bentuk konkaf masuk', geometry.containsPoint(concave, 8, 2), true);
check('lekukan konkaf tidak salah dianggap masuk', geometry.containsPoint(concave, 8, 8), false);
check('poligon kosong ditolak', geometry.containsPoint([], 0, 0), false);
check('poligon dengan titik rusak ditolak', geometry.containsPoint([[0, 0], [0, 2], ['bukan angka', 2]], 0.5, 0.5), false);
check('koordinat masukan tidak valid ditolak', geometry.containsPoint(square, 'bukan angka', 4), false);

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public/v3-ui.js'), 'utf8');
check('modul geometri dimuat sebelum app.js',
  html.indexOf('<script src="/smoke-geometry.js">') >= 0 &&
  html.indexOf('<script src="/smoke-geometry.js">') < html.indexOf('<script src="/app.js">'), true);
check('app.js memakai fungsi geometri bersama',
  app.indexOf('window.SiagaSmokeGeometry') >= 0 && app.indexOf('geometry.containsPoint(polygon, lat, lon)') >= 0, true);
check('versi aset server meliputi modul geometri', server.indexOf("'smoke-geometry.js'") >= 0, true);
check('pane wilayah mengikuti subtab yang dipilih',
  ui.indexOf('const id=bs[i].dataset.sub;') > ui.indexOf('bs.forEach((x,j)=>{'), true);

console.log('\n' + '='.repeat(40));
console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
console.log('='.repeat(40));
process.exit(failed ? 1 : 0);
