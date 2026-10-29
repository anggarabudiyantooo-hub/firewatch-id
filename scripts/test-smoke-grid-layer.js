'use strict';

const raster = require('../public/smoke-grid-layer');
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const good = typeof expected === 'function' ? expected(actual) : actual === expected;
  if (good) {
    passed++;
    console.log('  LULUS ' + name);
  } else {
    failed++;
    console.log('  GAGAL ' + name + ': dapat ' + JSON.stringify(actual) + ', harap ' + JSON.stringify(expected));
  }
}

const points = [
  { lat: 0, lon: 100, values: [0, 4] },
  { lat: 0, lon: 101, values: [10, 5] },
  { lat: 1, lon: 100, values: [20, 6] },
  { lat: 1, lon: 101, values: [30, 7] }
];
const grid = raster.buildGrid(points, 0);
console.log('\n== grid PM2.5 total CAMS ==');
check('grid 2x2 dibuat dari titik batch', !!grid && grid.nx === 2 && grid.ny === 2, true);
check('nilai di simpul dipertahankan', raster.sampleGrid(grid, 0, 101), 10);
check('nilai di tengah dihitung dengan interpolasi bilinear', raster.sampleGrid(grid, 0.5, 100.5), 15);
check('lintang di luar grid tidak diekstrapolasi', raster.sampleGrid(grid, 1.01, 100.5), null);
check('bujur di luar grid tidak diekstrapolasi', raster.sampleGrid(grid, 0.5, 99.99), null);
check('indeks frame dapat dipilih untuk sinkronisasi timeline', raster.sampleGrid(raster.buildGrid(points, 1), 0.5, 100.5), 5.5);
check('grid tanpa empat titik valid ditolak', raster.buildGrid([
  { lat: 0, lon: 100, values: [1] },
  { lat: 1, lon: 101, values: [2] }
], 0), null);
const sparseGrid = raster.buildGrid([
  points[0], points[1], points[2],
  { lat: 1, lon: 101, values: [-1] },
  { lat: 0, lon: 102, values: [40] },
  { lat: 1, lon: 102, values: [50] }
], 0);
check('grid dengan satu simpul hilang tetap tersedia untuk area lain', !!sparseGrid && sparseGrid.nx === 3, true);
check('sel grid yang kehilangan satu simpul tetap transparan, bukan diisi tebakan',
  raster.sampleGrid(sparseGrid, 0.5, 100.5), null);

const clear = raster.colorForValue(0);
const yellow = raster.colorForValue(5);
const orange = raster.colorForValue(12);
const red = raster.colorForValue(25);
const purple = raster.colorForValue(50);
check('nol PM2.5 transparan', clear[3], 0);
check('titik tengah kuning berwarna kuning', yellow[0] > yellow[2] && yellow[1] > yellow[2] && yellow[3] > 0, true);
check('warna bergerak melalui oranye dan merah', orange[0] > orange[1] && red[0] > red[1], true);
check('nilai tinggi beralih ke ungu', purple[2] > purple[0] && purple[2] > purple[1], true);
check('opasitas tetap lembut dan paling tinggi 60 persen',
  raster.colorStops[raster.colorStops.length - 1].alpha <= 0.6 && purple[3] <= 153, true);
check('sampel hilang atau tidak numerik tetap transparan',
  raster.colorForValue(null)[3] === 0 && raster.colorForValue('rusak')[3] === 0, true);

let capturedImage = null;
let callbackState = null;
const context = {
  createImageData: function (width, height) {
    return { width: width, height: height, data: new Uint8ClampedArray(width * height * 4) };
  },
  putImageData: function (image) { capturedImage = image; }
};
const canvas = {
  style: {},
  setAttribute: function () {},
  getContext: function () { return context; }
};
const fakeLeaflet = {
  GridLayer: {
    extend: function (definition) {
      function Layer(options) { definition.initialize.call(this, options); }
      Layer.prototype.getTileSize = function () { return { x: 256, y: 256 }; };
      Layer.prototype.redraw = function () {};
      Object.keys(definition).forEach(function (key) { Layer.prototype[key] = definition[key]; });
      return Layer;
    }
  },
  DomUtil: { create: function () { return canvas; } },
  setOptions: function (layer, options) { layer.options = options; },
  point: function (x, y) { return { x: x, y: y }; }
};
const tileLayer = raster.create(fakeLeaflet, { sampleRate: 4 });
tileLayer.setFrame(points, 0);
tileLayer._map = {
  getSize: function () { return { x: 800, y: 600 }; },
  unproject: function () { return { lat: 0.5, lng: 100.5 }; }
};
const tile = tileLayer.createTile({ x: 0, y: 0, z: 0 }, function (error, readyTile) {
  callbackState = { error: error, tile: readyTile };
});
check('tile canvas dirender pada resolusi rendah untuk menekan kerja CPU',
  tile.width === 64 && tile.height === 64 && tile.style.width === '256px', true);
check('tile raster tidak menangkap klik/drag peta', tile.style.pointerEvents, 'none');

setTimeout(function () {
  const expectedColor = raster.colorForValue(15);
  check('setiap piksel tile memakai interpolasi nilai kontinu',
    !!capturedImage && capturedImage.data[0] === expectedColor[0]
      && capturedImage.data[1] === expectedColor[1]
      && capturedImage.data[2] === expectedColor[2]
      && capturedImage.data[3] === expectedColor[3], true);
  check('callback tile menerima hasil tanpa galat setelah render',
    !!callbackState && callbackState.error === null && callbackState.tile === tile, true);
  console.log('\n' + '='.repeat(40));
  console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
  console.log('='.repeat(40));
  process.exit(failed ? 1 : 0);
}, 10);
