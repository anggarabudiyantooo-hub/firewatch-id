'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'public/wind-particles.js'), 'utf8');
const sandbox = { window: { L: {} } };
vm.runInNewContext(source, sandbox);
const WindParticles = sandbox.window.WindParticles;
const particles = new WindParticles({}, {});
particles.w = 100;
particles.h = 100;
particles.particles = [{ x: 10, y: 10, age: 12 }];
let seedCalls = 0;
particles._seed = function () { seedCalls++; };

const frame = {
  hour: 6,
  targetTime: '2026-10-29T18:00:00.000Z',
  validTime: '2026-10-29T18:00:00.000Z',
  level: '10m',
  points: [
    { lat: 0, lon: 100, speed: 5, from: 270, to: 90 },
    { lat: 0, lon: 101, speed: 5, from: 270, to: 90 },
    { lat: 1, lon: 100, speed: 5, from: 270, to: 90 },
    { lat: 1, lon: 101, speed: 5, from: 270, to: 90 }
  ]
};

console.log('\n== flow angin model mandiri ==');
particles.setField(frame, { preserveParticles: true });
assert.equal(seedCalls, 0);
const wind = particles._lookup(0.5, 100.5);
assert.ok(wind && Math.abs(wind[0] - 5) < 0.01 && Math.abs(wind[1]) < 0.01);
const sampledWind = particles.sampleAt(0.5, 100.5);
assert.ok(sampledWind && Math.abs(sampledWind[0] - 5) < 0.01 && Math.abs(sampledWind[1]) < 0.01);
assert.equal(particles.sampleAt(2, 100.5), null);
console.log('  LULUS frame angin dari batch grid dapat disampel bilinear; luar cakupan dilaporkan null');

particles.setField(frame);
assert.equal(seedCalls, 1);
console.log('  LULUS perubahan area/grid tetap menginisialisasi ulang posisi partikel');

assert.ok(/function independentWindTimelineNote\(\)/.test(app));
assert.ok(/var field = state\.windOn \? state\.wind : null;/.test(app));
assert.ok(app.includes("q += '&wind=0';"));
assert.ok(app.includes('not synchronized to the selected CAMS or plume time.'));
assert.ok(app.includes('tidak diselaraskan dengan waktu CAMS atau plume yang dipilih.'));
assert.ok(/if \(state\.windOn\) loadWind\(\);/.test(app));
assert.ok(app.includes('state.windPending = true;'));
assert.ok(app.includes('if (pending && state.windOn) loadWind();'));
assert.ok(/state\.particles\.setField\(field, \{ preserveParticles: !!preserveParticlePositions \}\)/.test(app));
assert.ok(/function ensureForecastLayers\(skipCachedFrameDraw\)/.test(app));
assert.ok(/loadAir\(!!skipCachedFrameDraw\)/.test(app));
assert.ok(/ensureForecastLayers\(true\);/.test(app));
assert.ok(/if \(modelRasterIsOn\(\)\) drawActiveModelRaster\(true\)/.test(app));
assert.ok(/productTag = kind === 'pm25'/.test(app) && /'AOD'/.test(app) && /'DEBU'/.test(app));
console.log('  LULUS flow angin tetap mandiri dari CAMS/playback dan memakai medan /api/wind-field');

assert.ok(source.includes('if (ts - last > 33)'));
assert.ok(source.includes("'(prefers-reduced-motion: reduce)'"));
assert.ok(source.includes('Math.min(2000, Math.max(350'));
console.log('  LULUS animasi dibatasi sekitar 30 FPS, hormati reduced-motion, dan batasi jumlah partikel');

console.log('\n4/4 uji partikel grid asap lulus.');
