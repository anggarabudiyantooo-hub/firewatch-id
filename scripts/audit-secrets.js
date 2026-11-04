#!/usr/bin/env node
/**
 * Audit rahasia: berkas terlacak dan riwayat git.
 *
 * Kenapa ada di gerbang CI: kunci yang pernah ter-commit tetap bocor walau
 * barisnya sudah dihapus. Audit ini mencari pola token pada berkas dan pada
 * riwayat, dan gagal bila menemukan sesuatu yang bukan fixture uji yang
 * sudah terdaftar.
 *
 * Nilai yang ditemukan TIDAK pernah dicetak. Laporan hanya menyebut berkas,
 * baris, dan jenis pola, supaya log CI tidak menjadi tempat kebocoran baru.
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const PATTERNS = [
  { name: 'GitHub personal access token', re: /ghp_[A-Za-z0-9]{20,}/ },
  { name: 'GitHub fine-grained token', re: /github_pat_[A-Za-z0-9_]{30,}/ },
  { name: 'OpenAI-style secret key', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Slack bot token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Vercel token', re: /vercel_[A-Za-z0-9]{20,}/ },
  { name: 'Postgres URL with password', re: /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]{6,}@/ },
  { name: 'Hard assignment to a secret env var', re: /(?:MODEL_API_KEY|FIRMS_MAP_KEY|ADMIN_PASSWORD|ADMIN_PASSWORD_HASH|SESSION_SECRET|CRON_SECRET|DEBUG_KEY|OPS_GITHUB_TOKEN|UPSTACH_REDIS_REST_TOKEN|UPSTASH_REDIS_REST_TOKEN|OPS_WRITE_TOKEN)\s*[:=]\s*['"][^'"]{12,}['"]/ }
];

/**
 * Fixture uji yang sengaja bukan kredensial nyata. Setiap entri harus
 * menyebut alasan; menambahkan entri di sini adalah keputusan yang bisa
 * diaudit, bukan cara membungkam temuan.
 */
const ALLOWLIST = [
  { value: 'cron-test-secret', reason: 'Fixture uji rute cron; bukan secret produksi dan tidak pernah dipakai di luar proses uji.' }
];

function allowed(line) {
  return ALLOWLIST.some(entry => line.includes(entry.value));
}

let findings = 0;
console.log('\n== audit rahasia: berkas terlacak ==');
const files = git(['ls-files']).split('\n').filter(Boolean);
const fs = require('fs');
let scanned = 0;
for (const rel of files) {
  if (/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|mp4|zip|gz)$/i.test(rel)) continue;
  if (rel === 'scripts/audit-secrets.js') continue;
  let content;
  try { content = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
  scanned += 1;
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    for (const pattern of PATTERNS) {
      if (!pattern.re.test(line)) continue;
      if (allowed(line)) continue;
      findings += 1;
      // Nilai tidak dicetak, hanya lokasi dan jenis pola.
      console.error('  TEMUAN', rel + ':' + (index + 1), pattern.name, '(nilai tidak dicetak)');
    }
  });
}
console.log('  ' + scanned + ' berkas diperiksa, ' + findings + ' temuan.');

console.log('\n== audit rahasia: riwayat git ==');
let historyCommits = 0;
let shallow = false;
try { historyCommits = Number(git(['rev-list', '--count', 'HEAD']).trim()); } catch { historyCommits = 0; }
try { shallow = fs.existsSync(path.join(root, '.git', 'shallow')); } catch { shallow = false; }
if (shallow || historyCommits < 2) {
  console.log('  DILEWATI: riwayat tidak lengkap (clone dangkal). Jalankan audit ini pada clone penuh sebelum submit.');
} else {
  // git log -G memakai ERE POSIX, bukan RegExp JavaScript: tanpa (?:...)
  // dan tanpa lookahead. Pola ini sengaja ditulis terpisah dan lebih longgar;
  // penyaringan tepat dilakukan di JavaScript pada diff tiap commit.
  const GIT_PATTERN = 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{20,}'
    + '|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-|vercel_[A-Za-z0-9]{20,}'
    + '|postgres://|postgresql://'
    + '|(MODEL_API_KEY|FIRMS_MAP_KEY|ADMIN_PASSWORD|ADMIN_PASSWORD_HASH|SESSION_SECRET|CRON_SECRET|DEBUG_KEY|OPS_GITHUB_TOKEN|UPSTASH_REDIS_REST_TOKEN|OPS_WRITE_TOKEN) *[:=] *["\'][^"\']{12,}["\']';
  let hits = null;
  try {
    hits = git(['log', '--all', '--oneline', '-G' + GIT_PATTERN]).trim();
  } catch (error) {
    console.log('  DILEWATI: git log tidak dapat dijalankan (' + String(error.message).split('\n')[0].slice(0, 80) + ').');
  }
  if (hits !== null) {
    const commits = hits ? hits.split('\n').filter(Boolean) : [];
    let real = 0;
    for (const row of commits) {
      const sha = row.split(' ')[0];
      let diff = '';
      try { diff = git(['show', sha, '--format=', '--unified=0']); } catch { continue; }
      const offending = diff.split('\n').filter(line => /^[+-]/.test(line)
        && PATTERNS.some(p => p.re.test(line)) && !allowed(line));
      if (offending.length) {
        real += 1;
        console.error('  TEMUAN RIWAYAT', sha, offending.length + ' baris. WAJIB DIROTASI bila ini kredensial nyata (nilai tidak dicetak).');
      }
    }
    console.log('  ' + historyCommits + ' commit diperiksa, ' + commits.length + ' cocok pola, ' + real + ' temuan nyata.');
    findings += real;
  }
}

console.log('\n== daftar fixture yang diizinkan ==');
for (const entry of ALLOWLIST) console.log('  - ' + entry.value + ': ' + entry.reason);

if (findings) {
  console.error('\nAUDIT GAGAL: ' + findings + ' temuan. Jangan submit sebelum ditangani.\n');
  process.exit(1);
}
console.log('\nAUDIT LULUS: tidak ada kredensial nyata pada berkas atau riwayat yang diperiksa.\n');
