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

console.log('\n== sinkronisasi partikel angin dengan grid PM2.5 ==');
particles.setField(frame, { preserveParticles: true });
assert.equal(seedCalls, 0);
const wind = particles._lookup(0.5, 100.5);
assert.ok(wind && Math.abs(wind[0] - 5) < 0.01 && Math.abs(wind[1]) < 0.01);
console.log('  LULUS frame angin dari batch grid dapat langsung diinterpolasi oleh partikel');

particles.setField(frame);
assert.equal(seedCalls, 1);
console.log('  LULUS perubahan area/grid tetap menginisialisasi ulang posisi partikel');

assert.ok(/function smokeWindFrame\(\)/.test(app));
assert.ok(/var frame = frames\[index\]/.test(app));
assert.ok(/frame\.targetTime \|\| frame\.validTime/.test(app));
assert.ok(/Math\.abs\(camsMs - windMs\) > 90 \* 60 \* 1000/.test(app));
assert.ok(/state\.particles\.setField\(field, \{ preserveParticles: !!preserveParticlePositions \}\)/.test(app));
assert.ok(/function ensureForecastLayers\(skipCachedFrameDraw\)/.test(app));
assert.ok(/loadAir\(!!skipCachedFrameDraw\)/.test(app));
assert.ok(/ensureForecastLayers\(true\);/.test(app));
assert.ok(/if \(state\.pm25On\) drawPm25\(true\)/.test(app));
console.log('  LULUS CAMS dan angin dipilih dengan indeks sama, target waktu divalidasi, dan timeline mempertahankan jejak');

assert.ok(source.includes('if (ts - last > 33)'));
assert.ok(source.includes("'(prefers-reduced-motion: reduce)'"));
assert.ok(source.includes('Math.min(2000, Math.max(350'));
console.log('  LULUS animasi dibatasi sekitar 30 FPS, hormati reduced-motion, dan batasi jumlah partikel');

console.log('\n4/4 uji partikel grid asap lulus.');
