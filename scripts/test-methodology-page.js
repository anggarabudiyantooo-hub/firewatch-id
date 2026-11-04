'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'public/tentang-data.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

console.log('\n== halaman Tentang data ==');
assert.ok(!index.includes('Memahami data ini'));
assert.ok(!index.includes('Sumber data &amp; batasan'));
assert.ok(index.includes('href="/tentang-data"'));
assert.ok(page.includes('Memahami data ini'));
assert.ok(page.includes('Sumber data &amp; batasan'));
assert.ok((page.match(/<details>/g) || []).length >= 20);
assert.ok(page.includes('telepon 112'));
assert.ok(page.includes('BMKG'));
assert.ok(page.includes('BNPB'));
assert.ok(page.includes('PVMBG'));
assert.ok(page.includes('src="/i18n.js"'));
assert.ok(server.includes("app.get('/tentang-data'"));
assert.ok(server.includes("app.get('/metodologi'"));
assert.ok(/test-methodology-page\.js/.test(pkg));
console.log('  LULUS metodologi dipindah, isi tetap ada, rute dan dua bahasa tersedia');
console.log('\n1/1 uji halaman metodologi lulus.');
