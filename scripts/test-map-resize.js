'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const createMapResizeController = require('../public/map-resize');

let passed = 0;
function pass(message) {
  passed++;
  console.log('  LULUS ' + message);
}

function makeWindow(withObserver) {
  let nextTimer = 0;
  const timers = new Map();
  const observers = [];
  const root = {
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    }
  };

  if (withObserver) {
    root.ResizeObserver = class FakeResizeObserver {
      constructor(callback) {
        this.callback = callback;
        this.target = null;
        this.disconnected = false;
        observers.push(this);
      }
      observe(target) {
        this.target = target;
      }
      disconnect() {
        this.disconnected = true;
      }
    };
  }

  function runTimers() {
    while (timers.size) {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.callback();
    }
  }

  return { root, timers, observers, runTimers };
}

const browser = makeWindow(true);
const resize = createMapResizeController(browser.root);
assert.equal(resize.invalidate(10), false);
assert.equal(browser.timers.size, 0);
pass('permintaan sebelum map siap diabaikan');

const container = { clientWidth: 900, clientHeight: 600 };
const invalidations = [];
const map = {
  getContainer() { return container; },
  invalidateSize(options) { invalidations.push(options); }
};
assert.equal(resize.attach(map), true);
assert.equal(browser.observers.length, 1);
assert.equal(browser.observers[0].target, container);
pass('ResizeObserver dipasang pada container Leaflet, bukan elemen tetangga');

resize.invalidate(180);
const firstTimer = browser.timers.keys().next().value;
resize.invalidate(240);
assert.equal(browser.timers.size, 1);
assert.equal(browser.timers.has(firstTimer), false);
assert.equal(browser.timers.values().next().value.delay, 240);
browser.runTimers();
assert.deepEqual(invalidations, [{ pan: false, debounceMoveend: true }]);
pass('buka/lipat dock menggabungkan invalidasi dan mempertahankan pusat peta');

container.clientWidth = 0;
resize.invalidate(0);
browser.runTimers();
assert.equal(invalidations.length, 1);
container.clientWidth = 900;
browser.observers[0].callback([{
  target: container,
  contentRect: { width: 900, height: 600 }
}]);
assert.equal(browser.timers.size, 1);
browser.runTimers();
assert.equal(invalidations.length, 2);
pass('container tersembunyi dilewati, perubahan ukuran positif memuat ulang peta');

const oldObserver = browser.observers[0];
const secondContainer = { clientWidth: 700, clientHeight: 400 };
const secondInvalidations = [];
assert.equal(resize.attach({
  getContainer() { return secondContainer; },
  invalidateSize(options) { secondInvalidations.push(options); }
}), true);
assert.equal(oldObserver.disconnected, true);
resize.invalidate(0);
browser.runTimers();
assert.equal(secondInvalidations.length, 1);
pass('observer lama dilepas saat instance peta diganti');

const noObserver = makeWindow(false);
const fallbackResize = createMapResizeController(noObserver.root);
let fallbackCount = 0;
fallbackResize.attach({
  getContainer() { return { clientWidth: 640, clientHeight: 360 }; },
  invalidateSize() { fallbackCount++; }
});
fallbackResize.invalidate(0);
noObserver.runTimers();
assert.equal(fallbackCount, 1);
pass('invalidasi eksplisit tetap bekerja tanpa ResizeObserver');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '../public/v3-ui.js'), 'utf8');
assert.match(app, /MapResize\.attach\(map\)/);
assert.match(app, /MapResize\.invalidate\(200\)/);
assert.match(ui, /window\.MapResize\.invalidate\(delay\)/);
assert.match(ui, /invalidateMapSize\(180\)/);
assert.match(ui, /invalidateMapSize\(240\)/);
assert.doesNotMatch(ui, /window\.map/);
pass('dock dan resize jendela memakai API peta yang sama');

console.log('\n' + passed + ' uji peta-resize lulus.');
