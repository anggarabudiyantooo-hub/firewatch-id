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

/**
 * Cari issue keadaan.
 *
 * MEMAKAI DAFTAR ISSUE, BUKAN /search/issues. Endpoint pencarian punya jeda
 * indeks: issue yang baru dibuat bisa belum terlihat selama beberapa detik,
 * dan akibatnya penulisan berikutnya membuat issue keadaan KEDUA — lalu dua
 * instance membaca keadaan yang berbeda. Daftar berlabel langsung dari repo
 * tidak punya jeda itu.
 *
 * Bila ada lebih dari satu (mis. sisa dari percobaan lama), yang dipakai adalah
 * yang PALING LAMA supaya pilihannya tetap sama di setiap pemanggilan — dua
 * instance tidak boleh menulis ke dua issue berbeda.
 */
async function cariIssue() {
  const cari = async () => {
    const j = await gh('/repos/' + repoTujuan() + '/issues?labels=' + encodeURIComponent(LABEL) +
      '&state=all&per_page=10&sort=created&direction=asc');
    return (j || []).filter(x => !x.pull_request);
  };
  let daftar = await cari();
  if (!daftar.length) {
    // Issue yang baru dibuat bisa belum muncul di daftar berlabel selama
    // sepersekian detik (ditemukan saat memasang mode ini: penulisan pertama
    // sukses, pembacaan sesudahnya belum melihatnya). Sekali tunggu singkat
    // jauh lebih murah daripada salah menyimpulkan "issue belum ada".
    await new Promise(r => setTimeout(r, 1200));
    daftar = await cari();
  }
  return daftar.length ? daftar[0].number : null;
}

/** Label belum tentu ada di repo baru; buat sekali bila perlu. */
async function pastikanLabel() {
  try {
    await gh('/repos/' + repoTujuan() + '/labels', {
      method: 'POST',
      body: JSON.stringify({ name: LABEL, color: '0e8a16', description: 'Keadaan operasional SIAGA.ID (dikelola otomatis)' })
    });
  } catch (e) {
    // 422 = sudah ada, dan itu memang tujuan pemanggilan ini.
    if (!/github_422/.test(String(e.message))) throw e;
  }
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
      const buat = () => gh('/repos/' + repoTujuan() + '/issues', {
        method: 'POST',
        body: JSON.stringify({ title: JUDUL, body, labels: [LABEL] })
      });
      try {
        await buat();
      } catch (e) {
        // Label yang belum ada ditolak GitHub (422). Buat labelnya, lalu ulangi
        // SEKALI — jangan menyerah dan jangan mengarang issue tanpa label, sebab
        // label itulah satu-satunya penanda untuk menemukan issue ini kembali.
        if (!/github_422/.test(String(e.message))) throw e;
        await pastikanLabel();
        await buat();
      }
    }
    return data;
  }
};
