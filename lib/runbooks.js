'use strict';
/**
 * Runbook / SOP operasional.
 *
 * Isi runbook ditulis untuk SIAGA.ID yang sebenarnya: langkahnya memakai
 * endpoint, berkas, dan alur yang benar-benar ada di repo ini (mis.
 * `scripts/uptime_check.py`, `/api/status`, penjeda `backoff`, workflow
 * `refresh.yml`). Runbook yang menyalin SOP generik tidak akan berguna saat
 * insiden sungguhan.
 *
 * Setiap runbook ditautkan ke `category` insiden lewat `categories`, sehingga
 * halaman insiden bisa merekomendasikan SOP yang tepat.
 */

const RUNBOOKS = [
  {
    id: 'RB-001',
    title: 'Sumber data tidak tersedia (API hulu gagal)',
    categories: ['data_source_unavailable'],
    appliesTo: ['source_down'],
    lastReviewed: '2026-10-04',
    summary: 'Dipakai ketika satu sumber hulu gagal berulang sehingga datanya tidak bisa diperbarui.',
    steps: [
      { n: 1, do: 'Baca /api/status dan catat id tugas yang gagal, consecutiveFails, serta errorNote tersanitasi.' },
      { n: 2, do: 'Periksa apakah hulu mengembalikan galat: panggil endpoint yang tercatat pada field `endpoint` tugas itu; catat kode HTTP dan waktu respons.' },
      { n: 3, do: 'Bedakan jenis kegagalan: 5xx berulang berarti masalah di hulu; timeout berarti jaringan/jalur; 401/403 berarti kredensial (mis. FIRMS_MAP_KEY, CDSE token).' },
      { n: 4, do: 'Bila kredensial: periksa variabel lingkungan di Vercel tanpa mencetak nilainya, lalu putar kunci bila perlu.' },
      { n: 5, do: 'Biarkan penjadwal memakai cadangannya: sumber dengan snapshot (PVMBG/koordinat gunung) atau arsip terbuka FIRMS tetap menyajikan data lama — pastikan panel menandainya STALE, bukan FRESH.' },
      { n: 6, do: 'Jangan mengubah interval penjadwal untuk "memaksa" sumber pulih; penjeda 30 menit untuk tugas gagal ≥6× sudah melindungi hulu.' },
      { n: 7, do: 'Bila gagal berlanjut > 2 jam dan tugasnya kritis: eskalasi insiden ke tingkat 1 (koordinator) dan catat di timeline.' },
      { n: 8, do: 'Setelah pulih: pastikan consecutiveFails kembali 0, tandai alert sumber itu RESOLVED, dan tutup insiden dengan ringkasan penyebab.' }
    ],
    escalation: 'Eskalasi bila tugas kritis (ditandai ★ di panel Sumber) gagal > 2 jam, atau bila dua sumber kritis gagal bersamaan.'
  },
  {
    id: 'RB-002',
    title: 'Data kedaluwarsa (STALE/CRITICAL)',
    categories: ['data_stale'],
    appliesTo: ['data_critical'],
    lastReviewed: '2026-10-04',
    summary: 'Data ada, tetapi umurnya melewati beberapa kali interval jadwal.',
    steps: [
      { n: 1, do: 'Lihat tabel kesegaran di /operations: catat status, rasio umur/interval, dan `lastSuccessfulAt`.' },
      { n: 2, do: 'Pastikan penjadwal luar hidup: buka Actions → workflow "Segarkan data FireWatch" (refresh.yml) dan lihat run terakhir.' },
      { n: 3, do: 'Jalankan penyegaran manual (workflow_dispatch) dan amati langkah pemanasan cache — bila endpoint mengembalikan 5xx, masalah ada di aplikasi, bukan di penjadwal.' },
      { n: 4, do: 'Bila penjadwal berjalan tetapi data tetap tua: periksa `/api/status` untuk kegagalan tugas tersebut, lalu ikuti RB-001 dari langkah 2.' },
      { n: 5, do: 'Periksa apakah instance dingin: /api/status dari instance berbeda bisa melaporkan berbeda. Bandingkan dengan stempel data di halaman (feedStamp) sebelum menyimpulkan.' },
      { n: 6, do: 'Tandai di insiden sumber mana yang memengaruhi angka yang sedang dilihat pengguna — jangan menutupi data tua dengan data kosong.' }
    ],
    escalation: 'Eskalasi bila status CRITICAL bertahan > 6 jam pada sumber kritis (gempa, titik api, letusan).'
  },
  {
    id: 'RB-003',
    title: 'Respons API lambat',
    categories: ['api_performance'],
    appliesTo: ['api_slow'],
    lastReviewed: '2026-10-04',
    summary: 'Lama panggilan melewati ambang OPS_SLOW_MS, atau pengguna melaporkan dashboard lambat.',
    steps: [
      { n: 1, do: 'Ukur dari sisi klien: `curl -s -o /dev/null -w "%{time_total}" <endpoint>` tiga kali; catat juga header x-vercel-cache (HIT vs MISS).' },
      { n: 2, do: 'MISS berulang berarti cache tidak bekerja: periksa header Cache-Control (harus memuat s-maxage dan stale-while-revalidate).' },
      { n: 3, do: 'Periksa apakah penjadwal luar menghangatkan cache; bila tidak, jalankan refresh.yml manual.' },
      { n: 4, do: 'Untuk /api/ask: instance dingin dapat memakan 20 detik (batas server per sumber 20 dtk). Bukan kegagalan bila jawaban akhirnya tiba.' },
      { n: 5, do: 'Bila satu sumber hulu lambat dan menahan endpoint lain (mis. overview), catat sumbernya lalu ikuti RB-001.' },
      { n: 6, do: 'Simpan pengukuran (sebelum/sesudah) di timeline insiden — angka nyata, bukan kesan.' }
    ],
    escalation: 'Eskalasi bila latensi p95 > 10 detik bertahan > 1 jam setelah cache diperiksa.'
  },
  {
    id: 'RB-004',
    title: 'Klaster titik api menonjol (kandidat, bukan kebakaran terverifikasi)',
    categories: ['environmental_event'],
    appliesTo: ['hotspot_cluster'],
    lastReviewed: '2026-10-04',
    summary: 'Alert engine menemukan klaster titik api FIRMS di atas ambang.',
    steps: [
      { n: 1, do: 'Buka insiden dan catat pusat klaster serta jumlah titik dari detail alert (aturan hotspot_cluster).' },
      { n: 2, do: 'Periksa umur data titik api: bila data STALE, kurangi bobot temuan dan sebutkan di timeline.' },
      { n: 3, do: 'Periksa atribusi lahan pada titik tersebut (tab Atribusi) untuk konteks — ini kompilasi GFW, bukan penentuan hukum siapa pun.' },
      { n: 4, do: 'Periksa sebaran asap/abu di peta: pluma hanya digambar dari laporan letusan resmi (untuk gunung) atau model angin (untuk titik api), sesuai batasan yang tertulis di halaman.' },
      { n: 5, do: 'Jangan menyimpulkan kebakaran. Tulis temuan sebagai indikasi awal dari citra satelit; rujuk instansi resmi (BNPB/BMKG) untuk keputusan lapangan.' },
      { n: 6, do: 'Bila pola berulang beberapa hari: tutup insiden harian, buat catatan pola di insiden induk, eskalasi tingkat 1.' }
    ],
    escalation: 'Eskalasi bila klaster besar berulang di wilayah yang sama atau disertai penurunan kualitas udara tercatat.'
  }
];

function list() {
  return RUNBOOKS.map(r => ({
    id: r.id, title: r.title, summary: r.summary, categories: r.categories,
    lastReviewed: r.lastReviewed, stepCount: r.steps.length
  }));
}

function get(id) {
  const r = RUNBOOKS.find(x => x.id === id);
  if (!r) {
    const e = new Error('Runbook ' + id + ' tidak ditemukan.');
    e.statusCode = 404;
    throw e;
  }
  return r;
}

/** Runbook yang cocok untuk kategori insiden (dipakai halaman detail insiden). */
function untukKategori(kategori) {
  return RUNBOOKS.filter(r => r.categories.includes(kategori)).map(r => ({ id: r.id, title: r.title }));
}

module.exports = { list, get, untukKategori, RUNBOOKS };
