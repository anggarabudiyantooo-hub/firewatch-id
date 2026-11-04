#!/usr/bin/env node
// Regresi tab Tampilan: umpan balik kontrol terkunci raster asap,
// legenda AQI selaras sistem desain, dan tautan Operator tanpa membuka auth.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0;
let fail = 0;
function ok(name, condition) {
  if (condition) { pass += 1; console.log('  LULUS', name); }
  else { fail += 1; console.error('  GAGAL', name); }
}

const html = read('public/index.html');
const css = read('public/dashboard-clean.css');
const js = read('public/dashboard-clean.js');
const i18n = read('public/i18n.js');
const app = read('public/app.js');
const ops = read('lib/ops-routes.js');

console.log('\n== kontrol tab Tampilan ==');

// Penyebab "tombol tidak berfungsi": setBasemap memaksa Gelap saat raster
// asap aktif, dan himaPane (250) berada di bawah pm25Pane (340).
ok('app.js tetap mengunci basemap saat raster asap aktif', /smokeBaseActive && name !== 'gelap'/.test(app));
ok('himaPane memang di bawah pane raster asap', /himaPane'\)\.style\.zIndex = 250/.test(app) && /pm25Pane'\)\.style\.zIndex = 340/.test(app));
ok('binding baseSel dan himaSel tidak dihapus', /_baseSel\.addEventListener\('change'/.test(app) && /\$\('himaSel'\)\.addEventListener\('change'/.test(app));

ok('setupTampilan dipasang saat boot', /function setupTampilan\(\)/.test(js) && /\n\s*setupTampilan\(\);/.test(js));
ok('nilai pilihan direkam pada fase capture', /panel\.addEventListener\('change', function \(event\) \{[\s\S]*?pendingBase = event\.target\.value;[\s\S]*?\}, true\)/.test(js));
ok('catatan terkunci punya role status', /note\.setAttribute\('role', 'status'\)/.test(js));
ok('aksi mematikan raster memakai change asli, bukan bypass', /dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/.test(js));
ok('catatan disinkronkan saat bahasa berganti', /siaga:languagechange', syncTampilanNote/.test(js));
ok('ID/EN untuk pesan terkunci tersedia',
  i18n.includes('Peta dasar dikunci Gelap selama raster asap aktif.') &&
  i18n.includes('Citra satelit tertutup raster asap yang aktif.') &&
  i18n.includes('Matikan raster asap'));

console.log('\n== legenda AQI selaras sistem desain ==');
ok('cfg-lg punya aturan gaya sendiri', /\.cfg-lg \{/.test(css));
ok('cfg-lg memakai font data, bukan warisan prosa 13px', /\.cfg-lg \{[\s\S]*?font: 500 11px\/1\.35 var\(--font-data\)/.test(css));
ok('cfg-lg satu kolom agar tidak terpotong di sidebar sempit', /\.cfg-lg \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/.test(css));
ok('titik legenda diperbesar dan tidak menyusut', /\.cfg-lg \.dot \{ width: 7px; height: 7px;[\s\S]*?flex: 0 0 7px/.test(css));
ok('baris legenda menumpuk label di atas isi', html.includes('class="row legend-row"') && /#p-tampilan \.legend-row \{/.test(css));
ok('label dan isi legenda memakai ukuran sama', /#p-tampilan \.rl \{ font: 500 var\(--clean-font-control\)/.test(css));

console.log('\n== akses Operator ==');
ok('tautan Operator menuju halaman login, bukan data', html.includes('href="/admin-login" class="safety-ops">Operator</a>'));
ok('rute operations tetap menuntut sesi admin', /app\.get\(\['\/operations', '\/operations\/', '\/operations\.html'\],\s*\n?\s*adminAuth\.requirePageSession/.test(ops));
ok('aset operations tetap dilindungi requirePageSession', /app\.use\(\['\/operations', '\/insiden'\], adminAuth\.requirePageSession/.test(ops));
ok('tautan Operator punya padanan EN', /'Operator': 'Operator'/.test(i18n));

console.log(`\n${pass}/${pass + fail} uji tab Tampilan lulus.\n`);
process.exit(fail ? 1 : 0);
