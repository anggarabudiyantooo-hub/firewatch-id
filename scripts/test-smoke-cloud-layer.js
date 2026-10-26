'use strict';

const smokeCloud = require('../public/smoke-cloud-layer');
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

const map = {
  project: function (latlng) { return { x: Number(latlng[1]), y: Number(latlng[0]) }; },
  getPixelWorldBounds: function () { return { min: { x: 0 }, max: { x: 256 } }; }
};
const tile = { x: 0, y: 0, z: 0 };
const tileSize = { x: 256, y: 256 };
const ring = [[20, 20], [20, 80], [80, 80], [80, 20]];

console.log('\n== raster kabut asap ==');
const projected = smokeCloud.projectRing(map, ring, tile, tileSize, 0);
check('poligon diproyeksikan ke koordinat petak', Array.isArray(projected) && projected.length === 4, true);
check('bujur menjadi sumbu x dan lintang menjadi sumbu y',
  projected && projected[0].x === 20 && projected[0].y === 20, true);
check('poligon dengan koordinat null ditolak',
  smokeCloud.projectRing(map, [[20, 20], [null, 80], [80, 20]], tile, tileSize, 0), null);
check('poligon dengan koordinat nonangka ditolak',
  smokeCloud.projectRing(map, [[20, 20], ['rusak', 80], [80, 20]], tile, tileSize, 0), null);
const wrapped = smokeCloud.projectRing(map, [[10, 355], [10, 359], [20, 359]], tile, tileSize, 0);
check('poligon dekat antimeridian diproyeksikan ke salinan dunia terdekat',
  Array.isArray(wrapped) && wrapped.every(function (point) { return point.x >= 0 && point.x <= 256; }), true);
check('intensitas visual dibatasi dari nol sampai satu',
  smokeCloud.clampIntensity(-1) === 0 && smokeCloud.clampIntensity(2) === 1
    && smokeCloud.clampIntensity('rusak') === 0, true);

function fakeContext() {
  return {
    fills: 0,
    gradients: 0,
    radialGradients: 0,
    clearRect: function () {},
    beginPath: function () {},
    moveTo: function () {},
    lineTo: function () {},
    closePath: function () {},
    fill: function () { this.fills++; },
    createLinearGradient: function () {
      this.gradients++;
      return { addColorStop: function () {} };
    },
    createRadialGradient: function () {
      this.radialGradients++;
      return { addColorStop: function () {} };
    }
  };
}

const context = fakeContext();
const drawn = smokeCloud.drawMask(context, map, tile, tileSize, [
  { polygon: ring, lat: 50, lon: 50, intensity: 0.5 }
], 0);
check('satu selubung menggambar satu jalur raster, tanpa inti poligon terpisah',
  drawn === 1 && context.fills === 1, true);
check('gradasi lembut berawal dari sumber menuju ujung plume', context.gradients, 1);
const regionalContext = fakeContext();
const regionalDrawn = smokeCloud.drawMask(regionalContext, map, tile, tileSize, [
  { kind: 'reported-region', polygon: ring, lat: 50, lon: 50 }
], 0);
check('cakupan regional memakai radial cloud yang berbeda dari arah plume',
  regionalDrawn === 1 && regionalContext.radialGradients === 1 && regionalContext.gradients === 0, true);
const outsideCount = smokeCloud.drawMask(fakeContext(), map, tile, tileSize, [

  { polygon: [[500, 500], [500, 520], [520, 520], [520, 500]], intensity: 0 }
], 0);
check('plume di luar petak dilewati', outsideCount, 0);
check('tepi kabut dirender dengan blur luas dan blur badan',
  smokeCloud.constants.broadBlur > smokeCloud.constants.bodyBlur
    && smokeCloud.constants.padding >= smokeCloud.constants.broadBlur * 3, true);

const fakeLeaflet = {
  GridLayer: {
    extend: function (definition) {
      function Layer(items, options) { definition.initialize.call(this, items, options); }
      Layer.prototype.getTileSize = function () { return { x: 256, y: 256 }; };
      Layer.prototype.createTile = definition.createTile;
      return Layer;
    }
  },
  DomUtil: {
    create: function () { return { style: {}, getContext: function () { return fakeContext(); } }; }
  },
  setOptions: function (layer, options) { layer.options = options; }
};
const layer = smokeCloud.create(fakeLeaflet, [], { pane: 'smokeCloudPane' });
layer._map = map;
let callbackCalled = false;
let callbackError = null;
let callbackTile = null;
const returnedTile = layer.createTile(tile, function (error, renderedTile) {
  callbackCalled = true;
  callbackError = error;
  callbackTile = renderedTile;
});
check('tile memiliki ukuran kanvas sesuai grid Leaflet',
  returnedTile.width === 256 && returnedTile.height === 256, true);
check('callback kesiapan tile ditunda sampai setelah createTile kembali', callbackCalled, false);

setTimeout(function () {
  check('callback tile berjalan tanpa galat setelah Leaflet dapat mendaftarkannya',
    callbackCalled && callbackError === null && callbackTile === returnedTile, true);
  console.log('\n' + '='.repeat(40));
  console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
  console.log('='.repeat(40));
  process.exit(failed ? 1 : 0);
}, 10);
