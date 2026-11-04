#!/usr/bin/env node
// Regresi: toggle "Tanya AI" global tidak menutupi tautan footer, dan
// halaman login admin punya jalan kembali ke situs.
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

const widgetJs = read('public/assistant-widget.js');
const widgetCss = read('public/assistant-widget.css');
const login = read('public/admin-login.html');

console.log('\n== toggle Tanya AI tidak menutupi footer ==');
ok('halaman ditandai saat toggle global dibuat', /document\.body\.classList\.add\('has-global-ai'\)/.test(widgetJs));
ok('penanda dipasang bersama pembuatan fab', /fab\.id = 'globalAiFab';[\s\S]{0,260}classList\.add\('has-global-ai'\)/.test(widgetJs));
ok('footer menyisakan ruang setinggi toggle', /body\.has-global-ai \.site-footer \{ padding-bottom: 84px; \}/.test(widgetCss));
ok('ruang disesuaikan untuk layar kecil', /@media \(max-width: 600px\) \{[\s\S]*?body\.has-global-ai \.site-footer \{ padding-bottom: 76px; \}/.test(widgetCss));
ok('cetak tidak mewarisi ruang kosong besar', /@media print \{[\s\S]*?body\.has-global-ai \.site-footer \{ padding-bottom: 18px; \}/.test(widgetCss));
ok('tautan Operator tetap ada di footer kedua halaman',
  read('public/home.html').includes('href="/admin-login"') && read('public/reports.html').includes('href="/admin-login"'));

console.log('\n== halaman login punya jalan kembali ==');
ok('ada navigasi kembali berlabel', /<nav class="back" aria-label="Kembali ke situs">/.test(login));
ok('tautan ke beranda', /<a href="\/">&larr; Kembali ke beranda<\/a>/.test(login));
ok('tautan ke dashboard', /<a href="\/dashboard">Buka dashboard<\/a>/.test(login));
ok('tautan ke Tentang data', /<a href="\/tentang-data">Tentang data<\/a>/.test(login));
ok('gaya tautan kembali tersedia', /\.back a \{/.test(login) && /\.back a:focus-visible \{/.test(login));
ok('form login tidak berubah', /id="formLogin"/.test(login) && /id="password"/.test(login) && /id="submit"/.test(login));
ok('skrip login tetap dimuat', login.includes('src="/admin-login.js"'));
ok('halaman login tetap noindex', /content="noindex, nofollow, noarchive"/.test(login));
ok('tidak ada kredensial tertanam di halaman', !/ghp_|password\s*=\s*["'][^"']+["']/.test(login));

console.log(`\n${pass}/${pass + fail} uji toggle global dan login lulus.\n`);
process.exit(fail ? 1 : 0);
