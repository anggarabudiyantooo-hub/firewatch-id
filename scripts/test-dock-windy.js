'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const v3 = fs.readFileSync(path.join(root, 'public/v3-ui.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

console.log('\n== dock bawah dan Windy nonaktif ==');
assert.ok(html.includes('<section class="dock collapsed" id="dock"'));
assert.ok(html.includes('id="dockToggle" type="button" aria-expanded="false"'));
assert.ok(v3.includes('dselect(0,false,false)'));
assert.ok(html.includes('id="windySection" hidden'));
assert.ok(app.includes('section.hidden = !active'));
assert.ok(!app.includes('unauthenticated requests return 403'));
assert.ok(!app.includes('permintaan tanpa kunci dijawab 403'));
assert.ok(/test-dock-windy\.js/.test(pkg));
console.log('  LULUS dock default tertutup, satu tab aktif, Windy nonaktif disembunyikan');
console.log('\n1/1 uji dock/Windy lulus.');
