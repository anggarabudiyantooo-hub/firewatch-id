#!/usr/bin/env node
// Tahap f: safety bar permanen, drawer mobile, skeleton, shortcut F1-F8.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0;
let fail = 0;
function ok(name, condition) {
  if (condition) { pass += 1; console.log('PASS', name); }
  else { fail += 1; console.error('FAIL', name); }
}
const html = read('public/index.html');
const css = read('public/dashboard-clean.css');
const js = read('public/dashboard-clean.js');

ok('safety bar permanen ada', /class="foot safety-bar"/.test(html));
ok('disclaimer bukan peringatan resmi', /Bukan peringatan resmi/.test(html));
ok('darurat 112', /Darurat <b>112<\/b>/.test(html));
for (const label of ['BMKG', 'BNPB', 'PVMBG']) ok(`tautan ${label}`, html.includes(label));
ok('tautan Tentang data', /href="\/tentang-data"/.test(html));
ok('misi dan cakupan', /Misi: pemantauan dini/.test(html) && /Indonesia · WGS84/.test(html));
ok('safety bar override display none', /\.foot\.safety-bar[\s\S]*display: flex !important/.test(css));
ok('drawer mobile ada', /layer-drawer-btn/.test(html) && /body\.layer-drawer-open #inspector/.test(css));
ok('tombol tutup drawer', /inspectorClose/.test(html));
ok('skeleton loading', /\.skeleton/.test(css) && /skeletonizeNode/.test(js));
ok('prefers-reduced-motion', /prefers-reduced-motion: reduce/.test(css));
for (const key of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) ok(`shortcut ${key}`, js.includes(`'${key}'`));
for (const id of ['layoutSave', 'layoutExport', 'layoutReset']) ok(`layout ${id} tetap ada`, html.includes(`id="${id}"`));
ok('AI assistant tetap ada', html.includes('assistant-widget.js'));

console.log(`visual-polish: ${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
