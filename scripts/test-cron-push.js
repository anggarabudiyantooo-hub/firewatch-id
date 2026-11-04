'use strict';
/**
 * Uji penjaga: cron yang menulis artefak harus tahan terhadap cron lain.
 *
 * Latar belakang nyata. Pada 2026-11-04 cron arsip mendorong commit ke main
 * sementara cron grid CAMS masih mengunduh selama sebelas menit. Checkout grid
 * itu basi, `git push` ditolak dengan "fetch first", dan artefak yang sudah
 * berhasil diunduh terbuang. Kegagalannya bukan izin dan bukan jaringan.
 *
 * Uji ini menuntut setiap workflow yang menulis ke main memakai skrip bersama
 * yang melakukan fetch dan rebase sebelum mencoba lagi, dan menuntut skrip itu
 * tidak pernah memaksa push.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const wfDir = path.join(root, '.github', 'workflows');
const read = f => fs.readFileSync(path.join(wfDir, f), 'utf8');

let pass = 0;
function ok(name, condition) {
  assert.ok(condition, name);
  pass++;
  console.log('  LULUS ' + name);
}

console.log('\n== skrip push bersama ==');
const scriptPath = path.join(root, 'scripts', 'ci-commit-push.sh');
const script = fs.readFileSync(scriptPath, 'utf8');
ok('skrip ada dan bisa dibaca', script.length > 0);
ok('mengatur set -euo pipefail supaya gagal tidak ditelan', /set -euo pipefail/.test(script));
ok('mencoba ulang push paling banyak tiga kali', /for attempt in 1 2 3; do/.test(script));
ok('fetch main sebelum mencoba lagi', /git fetch origin main/.test(script));
ok('rebase ke main sebelum mencoba lagi', /git rebase origin\/main/.test(script));
ok('tidak pernah memaksa push', !/push\s+(-f|--force)/.test(script));
ok('membatalkan rebase saat bertabrakan, bukan menimpa', /git rebase --abort/.test(script));
ok('keluar tanpa commit bila artefak tidak berubah', /git diff --cached --quiet/.test(script));

console.log('\n== workflow penulis artefak memakai skrip itu ==');
// flights-snapshot sengaja tidak ikut: ia menulis ke cabang snapshot-flights,
// bukan main, dan memakai push -f secara sadar untuk cabang bayangan.
const writers = ['refresh-smoke-grid.yml', 'snapshots.yml', 'archive-daily-reports.yml'];
for (const file of writers) {
  const y = read(file);
  ok(file + ' memakai ci-commit-push.sh', /bash scripts\/ci-commit-push\.sh/.test(y));
  ok(file + ' tidak melakukan git push sendiri', !/^\s+git push\b/m.test(y));
  ok(file + ' checkout riwayat penuh supaya rebase mungkin', /fetch-depth: 0/.test(y));
}

console.log('\n== cabang bayangan tetap terpisah ==');
const flights = read('flights-snapshot.yml');
ok('flights menulis ke cabang snapshot, bukan main', /refs\/heads\/snapshot-flights/.test(flights));
ok('flights tidak mendorong ke main', !/HEAD:main/.test(flights));

console.log(`\n${pass}/${pass} uji cron push lulus.\n`);