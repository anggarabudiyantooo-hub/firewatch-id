'use strict';
/**
 * Pemecahan masalah berbasis BUKTI (P2: AI troubleshooting).
 *
 * APA INI, DAN APA YANG BUKAN
 * ---------------------------
 * Ini BUKAN keluaran model bahasa. Tidak ada teks yang dikarang. Modul ini
 * menurunkan dugaan dari pengukuran yang sudah tersimpan (status, waktu
 * respons, jumlah gagal berturut, kesegaran, pesan galat tersanitasi, alert
 * yang menyala) memakai aturan yang dapat diperiksa satu per satu, dan SETIAP
 * dugaan wajib menyertakan bukti angkanya.
 *
 * Bila bukti tidak ada, modul ini TIDAK menyimpulkan apa pun: ia menulis
 * "tidak ada indikasi masalah" beserta pengukuran yang dipakai, atau
 * "belum terukur" bila memang belum pernah diukur. Menyimpulkan kerusakan
 * tanpa bukti adalah kesalahan yang paling mahal di ruang kendali: operator
 * mengejar hantu, sementara masalah sungguhan tidak terjaga.
 *
 * Tingkat keyakinan juga bukan selera: ia hanya naik bila ADA LEBIH DARI SATU
 * kelompok sinyal yang saling menguatkan (lihat `hitungKeyakinan`).
 */

const KATEGORI_ALERT = {
  source_down: 'data_source_unavailable',
  data_critical: 'data_stale',
  api_slow: 'api_performance',
  hotspot_cluster: 'environmental_event'
};

/** Ubah pesan galat tersanitasi menjadi jenis kegagalan yang dapat ditindak. */
function jenisKegagalan(pesan) {
  const p = String(pesan || '');
  if (!p) return null;
  if (/\b(429)\b/.test(p) || /kuota|rate.?limit/i.test(p)) return { kode: 'kuota', label: 'permintaan ditolak karena kuota/rate limit' };
  if (/\b5\d\d\b/.test(p)) return { kode: 'hulu-5xx', label: 'hulu mengembalikan galat 5xx (' + (p.match(/\b5\d\d\b/) || [''])[0] + ')' };
  if (/\b401\b|\b403\b/.test(p) || /kredensial|token|api.?key/i.test(p)) return { kode: 'kredensial', label: 'kredensial ditolak atau belum dipasang' };
  if (/timeout|etimedout|abort|habis waktu|time.?out/i.test(p)) return { kode: 'timeout', label: 'permintaan habis waktu' };
  if (/tidak terbaca|kosong|parse|json|skema/i.test(p)) return { kode: 'tak-terbaca', label: 'balasan tidak dapat dibaca (format/skema berubah atau kosong)' };
  return { kode: 'lain', label: 'galat lain: ' + p.slice(0, 80) };
}

/** Kelompok sinyal: dua sinyal dari KELOMPOK BERBEDA yang sejalan menaikkan keyakinan. */
function kelompok(svc) {
  const k = [];
  const jk = jenisKegagalan(svc.errorNote);
  if (jk) k.push('galat:' + jk.kode);
  if ((svc.consecutiveFails || 0) >= 3) k.push('gagal-berulang');
  if (svc.backoff) k.push('dijeda');
  if (!svc.hasData) k.push('tanpa-data');
  else if (svc.status === 'DOWN') k.push('data-lama-dipakai');
  if (svc.freshness && (svc.freshness.status === 'STALE' || svc.freshness.status === 'CRITICAL')) k.push('basi');
  if (svc.responseTime != null && svc.responseTime > 4000) k.push('lambat');
  return k;
}

/**
 * Keyakinan = jumlah KELOMPOK sinyal berbeda, bukan jumlah kalimat.
 *   0–1 kelompok → 'rendah' (satu gejala bisa kebetulan)
 *   2–3          → 'sedang'
 *   ≥4           → 'tinggi'
 */
function hitungKeyakinan(kelompokSinyal) {
  const n = new Set(kelompokSinyal).size;
  // Yang diukur di sini adalah KEJELASAN GEJALA, bukan kepastian penyebab.
  // Perbedaan itu ditulis di `arti` supaya pembaca tidak menyangka "tinggi"
  // berarti "sebabnya sudah pasti".
  const arti = 'Menyatakan kejelasan gejala (konsisten dan berulang), BUKAN kepastian penyebab. ' +
    'Penyebab tetap harus dibuktikan dengan langkah pemeriksaan di bawah.';
  if (n >= 4) return { tingkat: 'tinggi', alasan: n + ' kelompok sinyal saling menguatkan', arti };
  if (n >= 2) return { tingkat: 'sedang', alasan: n + ' kelompok sinyal sejalan', arti };
  if (n === 1) return { tingkat: 'rendah', alasan: 'baru satu gejala; bisa kebetulan, perlu diulang', arti };
  return { tingkat: 'rendah', alasan: 'tidak ada sinyal masalah', arti };
}

function angka(v, satuan) {
  if (v === null || v === undefined) return 'belum terukur';
  return String(v) + (satuan || '');
}

/** Diagnosa untuk satu layanan (baris /api/data-sources). */
function diagnosaLayanan(svc, konteks) {
  const k = konteks || {};
  const jk = jenisKegagalan(svc.errorNote);
  const dugaan = [];
  const bukti = [];
  const kelompokSinyal = kelompok(svc);

  // --- bukti yang selalu ada: pengukuran apa adanya ---
  bukti.push('status=' + svc.status + ' · kegagalan berturut=' + (svc.consecutiveFails || 0) +
    ' · total galat=' + (svc.errorCount || 0));
  bukti.push('waktu respons terakhir=' + angka(svc.responseTime, ' ms') +
    ' · pemeriksaan terakhir=' + (svc.lastCheckedAt || 'belum pernah') +
    ' · sukses terakhir=' + (svc.lastSuccessfulAt || 'belum pernah'));
  bukti.push('kesegaran=' + (svc.freshness ? svc.freshness.status + ' (' + (svc.freshness.reason || '—') + ')' : 'tidak diketahui'));
  if (svc.endpoint) bukti.push('hulu=' + svc.endpoint);
  if (svc.errorNote) bukti.push('pesan galat tersanitasi: ' + svc.errorNote);

  if (svc.status === 'UNKNOWN') {
    dugaan.push({
      judul: 'Belum ada pengukuran untuk layanan ini',
      sebab: 'Status UNKNOWN berarti instance ini belum pernah menyelesaikan satu pun pengambilan data untuk layanan ini.',
      langkah: [
        'Jalankan evaluasi/pengukuran sekali (POST /api/operations/evaluate, butuh peran ADMIN di pemasangan berperan).',
        'Bila instance baru hidup: pengukuran pertama memang berjalan saat rute ops diminta — tunggu selesai, jangan ambil kesimpulan dari UNKNOWN.'
      ]
    });
  } else if (!svc.hasData && (svc.consecutiveFails || 0) >= 3) {
    dugaan.push({
      judul: 'Sumber tidak dapat dijangkau berulang' + (jk ? ' — ' + jk.label : ''),
      sebab: 'Pengambilan gagal ' + svc.consecutiveFails + '× berturut dan belum ada data yang bisa dipakai.' +
        (svc.backoff ? ' Penjadwal sudah menjeda tugas ini 30 menit agar hulu tidak dihujani permintaan.' : ''),
      langkah: [
        'Panggil sendiri endpoint hulu yang tercatat di atas; catat kode HTTP dan waktu responsnya.',
        jk && jk.kode === 'kredensial' ? 'Periksa variabel lingkungan yang dipakai sumber ini di Vercel (tanpa mencetak nilainya), lalu putar kunci bila perlu.'
          : 'Bandingkan hasil panggilan itu dengan pesan galat tersanitasi di atas.',
        'Jangan menurunkan interval penjadwal untuk memaksa pulih; jeda 30 menit justru melindungi kuota.',
        'Bila kritis dan sudah > 2 jam: eskalasi ke tingkat 1 dan catat di timeline insiden.'
      ]
    });
  } else if (!svc.hasData && (svc.consecutiveFails || 0) >= 1) {
    // Kegagalan BARU (belum 3×): tetap berguna untuk ditindak, tetapi jangan
    // dibuat terdengar seperti gangguan menetap. Yang membuatnya berguna di
    // sini adalah jenis kegagalannya, bukan jumlahnya.
    dugaan.push({
      judul: 'Sumber tidak tersedia — kegagalan baru ' + svc.consecutiveFails + '×, belum menetap' +
        (jk ? ' (' + jk.label + ')' : ''),
      sebab: 'Pengambilan terakhir gagal dan belum ada data yang bisa dipakai, tetapi jumlah kegagalan ' +
        'belum mencapai ambang 3× yang dipakai untuk menyebut gangguan berulang.',
      langkah: [
        'Periksa keadaan hulu sekarang juga (endpoint tercatat di bukti); bila jawabannya pulih, ini hanya gangguan sesaat.',
        jk && jk.kode === 'kredensial'
          ? 'Jenis kegagalan menunjukkan kredensial: periksa variabel lingkungan yang dipakai sumber ini tanpa mencetak nilainya.'
          : 'Bandingkan kode/waktu respons panggilan manual itu dengan pesan galat tersanitasi di bukti.',
        'Bila gagal mencapai 3×, penjadwal akan menjeda tugas ini 30 menit; alert sumber akan menyala — tangani lewat runbook terkait.'
      ]
    });
  } else if (svc.hasData && svc.freshness && svc.freshness.status === 'CRITICAL') {
    dugaan.push({
      judul: 'Data yang disajikan kedaluwarsa (nilai lama masih dipakai)',
      sebab: 'Ada data terakhir, tetapi umurnya sudah melewati ambang CRITICAL — pengambilan terbaru gagal ' +
        (svc.consecutiveFails || 0) + '× sementara nilai lama tetap ditampilkan.',
      langkah: [
        'Periksa apakah panel/dashboard menandai sumber ini STALE (bukan FRESH) — bila tidak, itu cacat tampilan yang harus diperbaiki lebih dulu.',
        'Periksa apakah sumber punya cadangan resmi (snapshot PVMBG, arsip terbuka FIRMS) dan pastikan cadangan itu yang dipakai.',
        'Catat di insiden kapan data terakhir yang sah diambil, supaya pembaca tahu batas kesegarannya.'
      ]
    });
  } else if (svc.responseTime != null && svc.responseTime > 4000) {
    dugaan.push({
      judul: 'Hulu lambat menjawab (di atas ambang ' + (k.slowMs || 4000) + ' ms)',
      sebab: 'Panggilan terakhir memakan ' + svc.responseTime + ' ms. Selama masih berhasil, ini belum kegagalan — ' +
        'tetapi ia memakan anggaran waktu penjadwal dan bisa menyebabkan tugas lain tidak selesai tepat waktu.',
      langkah: [
        'Ukur ulang beberapa kali: bila konsisten tinggi, ini sifat hulu, bukan gangguan sesaat.',
        'Periksa apakah kuota sumber mendekati batas (429) — lambat sering merupakan gejala awal penolakan.',
        'Pertimbangkan menaikkan interval tugas ini daripada memperpendek anggaran tugas lain.'
      ]
    });
  } else if (svc.status === 'HEALTHY') {
    dugaan.push({
      judul: 'Tidak ada indikasi masalah pada layanan ini',
      sebab: 'Pengukuran terakhir berhasil, data segar (FRESH), dan tidak ada kegagalan berturut. ' +
        'Ini BUKAN jaminan bahwa hulu sehat sepanjang waktu — hanya bahwa pengukuran yang ada tidak menunjukkan gejala.',
      langkah: [
        'Tidak perlu tindakan. Bila ada keluhan dari manusia, bandingkan dengan angka di baris bukti di atas.',
        'Bila keluhan berlanjut sementara pengukuran bersih: periksa apakah yang dikeluhkan berasal dari sumber lain atau dari tampilan.'
      ]
    });
  } else {
    dugaan.push({
      judul: 'Ada gejala, tetapi belum cukup untuk menyimpulkan sebab',
      sebab: 'Status ' + svc.status + ' dengan ' + (svc.consecutiveFails || 0) + ' kegagalan berturut. ' +
        'Bukti yang ada belum menunjuk satu sebab tertentu, jadi modul ini tidak menebak.',
      langkah: [
        'Ulangi pengukuran sekali lagi untuk melihat arahnya (memburuk atau membaik).',
        'Periksa pesan galat tersanitasi di baris bukti; bila kosong, tunggu satu putaran penjadwal lagi.'
      ]
    });
  }

  return {
    sasaran: { jenis: 'layanan', id: svc.id, nama: svc.name, kritis: !!svc.critical },
    kesimpulan: dugaan[0].judul,
    keyakinan: hitungKeyakinan(svc.status === 'HEALTHY' ? [] : kelompokSinyal),
    bukti,
    dugaan,
    jenisKegagalan: jk,
    runbook: svc.status === 'HEALTHY' ? [] : (k.runbook || [])
  };
}

/**
 * Diagnosa tingkat armada: apakah yang rusak hulu, atau sisi kita?
 * Hanya menyimpulkan korelasi bila jumlahnya memang mencolok, dan menyebut
 * ambangnya supaya pembaca dapat membantah dengan angka.
 */
function diagnosaArmada(services) {
  const turun = services.filter(s => s.status === 'DOWN');
  const belum = services.filter(s => s.status === 'UNKNOWN');
  if (turun.length < 3) return null;
  const berbagiJenis = {};
  turun.forEach(s => {
    const jk = jenisKegagalan(s.errorNote);
    if (jk) berbagiJenis[jk.kode] = (berbagiJenis[jk.kode] || 0) + 1;
  });
  const kodeTerbanyak = Object.keys(berbagiJenis).sort((a, b) => berbagiJenis[b] - berbagiJenis[a])[0] || null;
  return {
    judul: 'Kemungkinan gangguan di sisi kita, bukan di satu hulu',
    sebab: turun.length + ' dari ' + services.length + ' layanan turun bersamaan' +
      (kodeTerbanyak && berbagiJenis[kodeTerbanyak] >= 2
        ? ', dan ' + berbagiJenis[kodeTerbanyak] + ' di antaranya gagal dengan jenis yang sama (' + kodeTerbanyak + ')'
        : '') +
      '. Hulu yang berbeda-beda biasanya tidak rusak serentak; pola seperti ini lebih sering berasal dari' +
      ' jaringan keluar, resolusi DNS, atau batas kuota tingkat akun.',
    bukti: turun.map(s => s.id + ': ' + (s.errorNote || s.status) + ' (gagal ' + (s.consecutiveFails || 0) + '×)'),
    langkah: [
      'Periksa log fungsi di Vercel (satu tugas bisa membawa banyak permintaan keluar).',
      'Uji satu hulu dari luar aplikasi (curl) untuk memisahkan gangguan jaringan kita dari gangguan hulu.',
      'Bila memakai kuota bersama (mis. satu kunci FIRMS), periksa sisa kuotanya sebelum menyalahkan hulu.'
    ],
    belumTerukur: belum.length
  };
}

/**
 * Kategori mana yang paling tepat untuk sasaran ini — dipakai memilih runbook.
 * Urutannya sengaja: alert yang menyala lebih dipercaya daripada bacaan status,
 * karena alert dibuat oleh aturan yang sama dengan yang memberi tahu operator.
 */
function kategoriUntuk(svc, alertsAktif) {
  // Tahan terhadap pemanggil yang mengirim bukan larik: fungsi ini dipakai
  // dari rute, uji, dan (nanti) skrip perawatan.
  const daftar = Array.isArray(alertsAktif) ? alertsAktif : [];
  const alert = daftar.find(a => a.serviceId === (svc && svc.id));
  if (alert && KATEGORI_ALERT[alert.ruleId]) return KATEGORI_ALERT[alert.ruleId];
  if (!svc) return null;
  if (svc.status === 'DOWN' || (!svc.hasData && (svc.consecutiveFails || 0) >= 1)) return 'data_source_unavailable';
  if (svc.freshness && (svc.freshness.status === 'CRITICAL' || svc.freshness.status === 'STALE')) return 'data_stale';
  if (svc.responseTime != null && svc.responseTime > 4000) return 'api_performance';
  return null; // sehat: tidak ada runbook yang perlu dikerjakan
}

function ringkas(services, alerts, opsi) {
  const k = opsi || {};
  const armada = diagnosaArmada(services);
  const rusak = services.filter(s => s.status === 'DOWN' || s.status === 'WARNING' ||
    (s.freshness && s.freshness.status === 'CRITICAL'));
  const aktif = (alerts || []).filter(a => a.status === 'ACTIVE');
  return {
    dicekPada: new Date().toISOString(),
    ringkas: {
      total: services.length,
      turun: services.filter(s => s.status === 'DOWN').length,
      peringatan: services.filter(s => s.status === 'WARNING').length,
      belumTerukur: services.filter(s => s.status === 'UNKNOWN').length,
      alertAktif: aktif.length
    },
    prioritas: rusak.slice(0, 5).map(s => s.id),
    armada,
    catatan: 'Dihitung dari pengukuran yang tersimpan memakai aturan tetap. Setiap dugaan menyertakan bukti angkanya; ' +
      'bila bukti tidak ada, tidak ada kesimpulan yang dibuat.'
  };
}

module.exports = {
  jenisKegagalan, kelompok, hitungKeyakinan, diagnosaLayanan, diagnosaArmada, ringkas,
  kategoriUntuk, KATEGORI_ALERT
};
