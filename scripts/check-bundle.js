'use strict';
/**
 * Pemeriksa pra-deploy: mensimulasikan lingkungan serverless Vercel.
 *
 * Dua kelas bug yang pernah lolos ke produksi dan dicegah skrip ini:
 *
 *  1. Berkas tidak ikut ter-bundle.
 *     Bundler Vercel hanya melacak berkas yang dijangkau lewat require().
 *     Berkas yang dibuka dengan fs.readFileSync tidak terlacak, sehingga
 *     hilang di produksi (ENOENT) walau aman di lokal.
 *
 *  2. Dependensi ESM-only di-require() dari CommonJS.
 *     Sebagian Node/loader mengizinkannya (require-esm), sebagian menolak
 *     dengan ERR_REQUIRE_ESM. Runtime Vercel menolak, jadi aplikasi crash
 *     hanya di produksi.
 *
 * Jalankan: npm run check
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
let failed = 0;

function ok(msg) { console.log('  OK   ' + msg); }
function bad(msg) { console.log('  GAGAL ' + msg); failed++; }

/* --- 1. Semua dependensi runtime harus CommonJS --- */
console.log('\n[1] Memeriksa dependensi ESM-only yang di-require()');
const deps = Object.keys(require(path.join(ROOT, 'package.json')).dependencies || {});
for (const dep of deps) {
  // Jangan pakai require.resolve: paket ESM-only sering memblokir resolusi
  // './package.json', sehingga dependensi bermasalah justru terlewat diam-diam.
  const pkgPath = path.join(ROOT, 'node_modules', dep, 'package.json');
  if (!fs.existsSync(pkgPath)) { bad(`${dep} — tidak terpasang di node_modules`); continue; }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const hasRequireCondition = (function scan(x) {
    if (!x || typeof x !== 'object') return false;
    if (Object.prototype.hasOwnProperty.call(x, 'require')) return true;
    return Object.values(x).some(scan);
  })(pkg.exports);
  const isEsmOnly = pkg.type === 'module' && !hasRequireCondition;

  if (!isEsmOnly) { ok(`${dep}@${pkg.version} — CommonJS`); continue; }

  // ESM-only hanya aman bila memang tidak pernah di-require dari kode kita.
  const used = ['server.js', 'lib', 'api']
    .map(p => path.join(ROOT, p))
    .flatMap(p => (fs.existsSync(p) && fs.statSync(p).isDirectory()
      ? fs.readdirSync(p).map(f => path.join(p, f))
      : [p]))
    .filter(f => f.endsWith('.js'))
    .some(f => new RegExp(`require\\(['"]${dep.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]\\)`)
      .test(fs.readFileSync(f, 'utf8')));

  if (used) bad(`${dep}@${pkg.version} — ESM-only tapi di-require() → ERR_REQUIRE_ESM di Vercel`);
  else ok(`${dep}@${pkg.version} — ESM-only, tidak di-require()`);
}

/* --- 2. Tidak boleh membaca berkas data lewat fs saat modul dimuat --- */
console.log('\n[2] Memeriksa pembacaan berkas yang tak terlacak bundler');
for (const f of ['server.js', ...fs.readdirSync(path.join(ROOT, 'lib')).map(x => 'lib/' + x)]) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const hit = /readFileSync\([^)]*(json|geojson|csv)/i.test(src);
  if (hit) bad(`${f} — membaca berkas data via fs; pakai require() agar ikut ter-bundle`);
  else ok(`${f}`);
}

/* --- 3. Muat aplikasi seolah-olah di dalam bundle --- */
console.log('\n[3] Memuat aplikasi seperti di serverless');
let app;
try {
  app = require(path.join(ROOT, 'api', 'index.js'));
  ok('api/index.js termuat, tipe: ' + typeof app);
} catch (e) {
  bad('api/index.js gagal dimuat: ' + e.message);
}

/* --- 4. Uji rute nyata --- */
if (typeof app === 'function') {
  console.log('\n[4] Menguji rute');
  const http = require('http');
  const srv = http.createServer(app).listen(0, '127.0.0.1', async () => {
    const port = srv.address().port;
    const paths = ['/api/health', '/', '/app.css', '/wind-particles.js', '/vendor/leaflet.js'];
    for (const p of paths) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}${p}`);
        if (r.status === 200) ok(`${r.status} ${p}`); else bad(`${r.status} ${p}`);
      } catch (e) { bad(`${p} — ${e.message}`); }
    }
    srv.close();
    console.log(failed ? `\nGAGAL: ${failed} masalah ditemukan.\n` : '\nSemua pemeriksaan lolos.\n');
    process.exit(failed ? 1 : 0);
  });
} else {
  console.log(failed ? `\nGAGAL: ${failed} masalah ditemukan.\n` : '\nSemua pemeriksaan lolos.\n');
  process.exit(failed ? 1 : 0);
}
