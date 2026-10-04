'use strict';
/**
 * Lapisan GitHub Issues sebagai penyimpanan operasional.
 *
 * Satu issue bertanda label `ops-state` menyimpan keadaan lengkap
 * (insiden + alert + counter) di dalam blok kode JSON pada badannya.
 * Keuntungan yang membuat mode ini berguna meski bukan basis data:
 * riwayat perubahan terlihat manusia lewat tab History issue, dan tidak
 * perlu layanan baru — hanya sebuah token dengan scope `issues`.
 *
 * Batas nyata yang harus dijaga: badan issue maksimum 65.536 karakter.
 * Bila terlampaui, insiden CLOSED tertua dipangkas dan pemangkasan itu
 * DICATAT di dalam data (`truncatedAt`, `truncatedCount`) — bukan hilang
 * diam-diam.
 */

const API = 'https://api.github.com';
const LABEL = 'ops-state';
const JUDUL = '[ops] Keadaan operasional SIAGA.ID';
const BATAS_BODY = 60000;

function repoTujuan() {
  return String(process.env.OPS_GITHUB_REPO || '').trim(); // "pemilik/nama"
}

async function gh(p, opts) {
  const r = await fetch(API + p, Object.assign({
    headers: {
      Authorization: 'Bearer ' + process.env.OPS_GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'siaga-ops-store'
    },
    signal: AbortSignal.timeout(12000)
  }, opts || {}));
  if (!r.ok) {
    const t = await r.text();
    throw new Error('github_' + r.status + '_' + t.slice(0, 120));
  }
  return r.status === 204 ? null : r.json();
}

async function cariIssue() {
  const q = encodeURIComponent(`repo:${repoTujuan()} label:${LABEL} in:title "ops"`);
  const j = await gh('/search/issues?q=' + q + '&per_page=5');
  const it = (j.items || [])[0];
  return it ? it.number : null;
}

function bacaJSON(body) {
  const m = String(body || '').match(/```json\s*([\s\S]*?)\s*```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
}

function tulisBody(data) {
  return [
    'Keadaan operasional SIAGA.ID. Berkas ini dikelola otomatis oleh `lib/ops-github.js`.',
    '',
    '- Insiden: ' + data.incidents.length + ' (terbuka: ' +
      data.incidents.filter(i => ['OPEN', 'INVESTIGATING', 'PENDING'].includes(i.status)).length + ')',
    '- Alert tersimpan: ' + data.alerts.length,
    '- Diperbarui: ' + (data.updatedAt || '-'),
    data.truncatedCount ? '- Pemangkasan: ' + data.truncatedCount + ' insiden tertutup terlama dipangkas pada ' + data.truncatedAt : '',
    '',
    '```json',
    JSON.stringify(data),
    '```'
  ].filter(Boolean).join('\n');
}

function pangkasBilaPerlu(data) {
  let body = tulisBody(data);
  let dipangkas = 0;
  while (body.length > BATAS_BODY && data.incidents.length > 10) {
    const tertutup = data.incidents.filter(i => i.status === 'CLOSED');
    if (!tertutup.length) break;
    const tertua = tertutup.reduce((a, b) => (a.detectedAt <= b.detectedAt ? a : b));
    data.incidents = data.incidents.filter(i => i !== tertua);
    dipangkas++;
    data.truncatedCount = (data.truncatedCount || 0) + 1;
    data.truncatedAt = new Date().toISOString();
    body = tulisBody(data);
  }
  return { body, dipangkas };
}

module.exports = {
  read(fallback) {
    return cariIssue().then(n => {
      if (!n) return fallback();
      return gh('/repos/' + repoTujuan() + '/issues/' + n).then(iss => bacaJSON(iss.body) || fallback());
    });
  },

  async write(data) {
    const { body } = pangkasBilaPerlu(data);
    const n = await cariIssue();
    if (n) {
      await gh('/repos/' + repoTujuan() + '/issues/' + n, { method: 'PATCH', body: JSON.stringify({ body }) });
    } else {
      await gh('/repos/' + repoTujuan() + '/issues', {
        method: 'POST',
        body: JSON.stringify({ title: JUDUL, body, labels: [LABEL] })
      });
    }
    return data;
  }
};
