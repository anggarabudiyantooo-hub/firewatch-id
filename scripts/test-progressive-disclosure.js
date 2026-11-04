'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/dashboard-clean.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/dashboard-clean.css'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

console.log('\n== progressive disclosure dashboard ==');
['lyFire', 'lyAir', 'lyWind'].forEach(id => {
  assert.ok(new RegExp(`data-config-for="${id}" hidden`).test(html), `config ${id} tersembunyi sampai aktif`);
});
assert.ok(html.includes('id="mapLegend"'));
['confSummary', 'airLegend', 'ashLegend', 'pm25Legend', 'himaInfo'].forEach(id => {
  const legendBlock = html.slice(html.indexOf('id="mapLegend"'), html.indexOf('</details>', html.indexOf('id="mapLegend"')));
  assert.ok(legendBlock.includes(`id="${id}"`), `${id} berada di legenda peta`);
});
assert.ok(js.includes('cfg.hidden = !active'));
assert.ok(js.includes('syncMapLegend'));
assert.ok(js.includes('mapLegendBadge'));
assert.ok(css.includes('#statsPanel.kpi-rail'));
assert.ok(css.includes('.map-legend'));
assert.ok(!html.includes('Aktifkan layer KUALITAS UDARA untuk melihat data'));
assert.ok(/test-progressive-disclosure\.js/.test(pkg));
console.log('  LULUS kontrol layer, strip ikhtisar, legenda pojok, dan badge model');
console.log('\n1/1 uji progressive disclosure lulus.');
