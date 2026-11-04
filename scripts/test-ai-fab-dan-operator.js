#!/usr/bin/env node
// Regresi: toggle AI tidak menutupi kontrol, tombol lipat dok selalu
// terjangkau, dan pintu Operator tidak dipromosikan di halaman publik.
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
const ops = read('lib/ops-routes.js');

console.log('\n== letak toggle AI ==');
ok('posisi toggle memakai variabel terukur', /\.ai-fab \{ bottom: var\(--ai-fab-bottom/.test(css));
ok('panel AI memakai variabel yang sama', /\.ai-popup \{ bottom: var\(--ai-fab-bottom/.test(css));
ok('letak diukur dari geometri dok dan safety bar', /function placeAiFab\(\)/.test(js) && /dock\.getBoundingClientRect\(\)\.top/.test(js) && /bar\.getBoundingClientRect\(\)\.top/.test(js));
ok('dipasang saat boot', /\n\s*setupAiFabPlacement\(\);/.test(js));
ok('mengikuti perubahan tinggi dok', /new ResizeObserver\(placeAiFab\)/.test(js));
ok('inspeksi menyisakan ruang bawah untuk toggle', /\.inspector \.scroll \{ padding-bottom: 52px; \}/.test(css));
ok('ponsel memakai toggle bundar tanpa label terlihat', /\.ai-fab \.ai-fab-txt \{ display: none; \}/.test(css));
ok('label tetap tersedia untuk pembaca layar', /id="aiFab"[\s\S]*?aria-label="Buka AI Asisten"/.test(html));

console.log('\n== tombol lipat dok terjangkau ==');
// Sebelumnya dock-spacer berada di dalam .dock-tabs yang bergulung,
// sehingga tombol lipat terdorong keluar layar pada ponsel.
ok('dock-spacer berada di luar strip tab', /<\/div>\s*\n\s*<span class="dock-spacer">/.test(html));
ok('dock-spacer dipaku di kanan kepala dok', /\.dock-head > \.dock-spacer \{[\s\S]*?flex: 0 0 auto/.test(css));
ok('strip tab tetap boleh menyusut', /\.dock-head \.dock-tabs \{ flex: 1 1 auto; min-width: 0; \}/.test(css));
ok('kepala dok menyisakan ruang untuk toggle AI di ponsel', /\.dock-head \{ padding-right: 60px; \}/.test(css));

console.log('\n== lebar layout tidak meluber ==');
ok('kolom body dibatasi lebar layar', /body\.bloomberg \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css));
ok('rantai utama memakai min-width nol', /#main \{ min-width: 0; \}/.test(css) && /#main-bloomberg-grid > \.inspector \{ min-width: 0; \}/.test(css));
ok('dua kolom hanya di layar lebar', /@media \(min-width: 769px\) \{\s*\n\s*#main-bloomberg-grid \{ grid-template-columns: minmax\(0, 1fr\) var\(--inspector-w\); \}/.test(css));
ok('ponsel tetap satu kolom agar peta penuh', /@media \(max-width: 768px\) \{\s*\n\s*#main-bloomberg-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css));

console.log('\n== pintu Operator tidak dipromosikan di halaman publik ==');
ok('safety bar ponsel membungkus, tidak menyembunyikan tautan', /\.foot\.safety-bar \{[\s\S]*?flex-wrap: wrap;[\s\S]*?overflow-x: visible;/.test(css));
// Tautan Operator sengaja dihapus dari footer publik supaya pengunjung biasa
// tidak diarahkan ke pintu masuk operator. Rute loginnya sendiri tetap ada dan
// tetap menuntut sesi; yang diuji di bawah adalah proteksinya, bukan tautannya.
for (const page of ['public/index.html', 'public/home.html', 'public/reports.html', 'public/tentang-data.html', 'public/cek-asap.html']) {
  ok(`tautan Operator tidak ada di ${page}`, !read(page).includes('href="/admin-login"'));
}
ok('halaman login tetap tersedia sebagai rute', read('public/admin-login.html').length > 0);
ok('rute operations tetap menuntut sesi admin', /adminAuth\.requirePageSession, \(_req, res\) => sendPrivatePage\('operations\.html'/.test(ops));
ok('aset operations tetap dilindungi', /app\.use\(\['\/operations', '\/insiden'\], adminAuth\.requirePageSession/.test(ops));

console.log(`\n${pass}/${pass + fail} uji toggle AI dan Operator lulus.\n`);
process.exit(fail ? 1 : 0);
