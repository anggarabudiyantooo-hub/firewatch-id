'use strict';
/**
 * Analitik operasional (P2) — dihitung dari riwayat yang benar-benar tersimpan.
 *
 * ATURAN YANG DIPEGANG
 * --------------------
 * 1. Semua angka berasal dari insiden/alert/audit yang ada di penyimpanan
 *    operasional. Tidak ada contoh, tidak ada proyeksi, tidak ada pengisi celah.
 * 2. "Nol" dan "belum ada riwayat" adalah dua hal yang BERBEDA:
 *      - ada riwayat, hari itu tidak ada insiden → nol yang sah;
 *      - belum ada riwayat sama sekali       → series kosong + `kosong: true`,
 *        dan antarmuka menulis "belum ada riwayat" (bukan grafik nol yang
 *        tampak seperti "semuanya aman").
 * 3. Setiap angka menyebut jendelanya (berapa hari, dari–sampai) dan penyebutnya
 *    (berapa insiden yang dihitung), supaya bisa diperiksa ulang.
 * 4. MTTR/SLA per severity tetap null bila severity itu belum pernah selesai —
 *    tidak diisi 0 yang bisa disalahartikan sebagai "selesai seketika".
 */

const KATEGORI_URUT = ['data_source_unavailable', 'data_stale', 'api_performance', 'environmental_event', 'infrastructure', 'lain_lain'];
const SEVERITY_URUT = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const ATURAN_URUT = ['source_down', 'data_critical', 'api_slow', 'hotspot_cluster'];
const LABEL_ATURAN = {
  source_down: 'Sumber tidak tersedia',
  data_critical: 'Data kedaluwarsa',
  api_slow: 'Respons lambat',
  hotspot_cluster: 'Klaster titik api'
};

function tanggalWIB(iso) {
  // Jendela harian memakai WIB (UTC+7) supaya "hari" berarti hari kerja
  // operator di Indonesia, bukan hari UTC.
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
}

/** Daftar tanggal WIB, paling lama → paling baru. */
function daftarHari(hari, sekarangMs) {
  const out = [];
  const akhir = tanggalWIB(new Date(sekarangMs).toISOString());
  const dasar = Date.parse(akhir + 'T00:00:00Z');
  for (let i = hari - 1; i >= 0; i--) {
    out.push(new Date(dasar - i * 86400e3).toISOString().slice(0, 10));
  }
  return out;
}

function menit(a, b) {
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (isNaN(t1) || isNaN(t2)) return null;
  return Math.max(0, (t2 - t1) / 60000);
}

/**
 * Seri harian. `jumlah` dihitung dari waktu kejadian yang tercatat; ini
 * penghitungan, bukan perkiraan.
 */
function seri(hari, insiden, alerts, sekarangMs) {
  const peta = {};
  hari.forEach(d => { peta[d] = { tanggal: d, insiden: 0, alert: 0, insidenDibuat: 0, alertBaru: 0 }; });
  let luarJendela = { insiden: 0, alert: 0 };

  (insiden || []).forEach(i => {
    const d = tanggalWIB(i.detectedAt);
    if (!d) return;
    if (peta[d]) { peta[d].insiden++; peta[d].insidenDibuat++; } else luarJendela.insiden++;
  });
  (alerts || []).forEach(a => {
    const d = tanggalWIB(a.detectedAt);
    if (!d) return;
    if (peta[d]) { peta[d].alert++; peta[d].alertBaru++; } else luarJendela.alert++;
  });

  return { titik: hari.map(d => peta[d]), luarJendela };
}

/** Rekap per severity, termasuk MTTR & SLA dari insiden yang benar-benar selesai. */
function perSeverity(insiden, target) {
  const T = Object.assign({ CRITICAL: 60, HIGH: 240, MEDIUM: 1440, LOW: 4320 }, target || {});
  return SEVERITY_URUT.map(sv => {
    const kelompok = (insiden || []).filter(i => i.severity === sv);
    const selesai = kelompok.filter(i => i.resolvedAt && i.detectedAt);
    const durasi = selesai.map(i => menit(i.detectedAt, i.resolvedAt)).filter(x => x !== null);
    const dalamTarget = selesai.filter(i => menit(i.detectedAt, i.resolvedAt) !== null && menit(i.detectedAt, i.resolvedAt) <= T[sv]);
    return {
      severity: sv,
      total: kelompok.length,
      terbuka: kelompok.filter(i => i.status !== 'CLOSED' && i.status !== 'RESOLVED').length,
      selesai: selesai.length,
      // null = belum ada riwayat untuk severity ini (BUKAN nol).
      mttrMenit: durasi.length ? Math.round((durasi.reduce((a, b) => a + b, 0) / durasi.length) * 10) / 10 : null,
      slaPersen: selesai.length ? Math.round((dalamTarget.length / selesai.length) * 1000) / 10 : null,
      targetMenit: T[sv],
      catatan: durasi.length ? null : 'belum ada riwayat'
    };
  });
}

/** Sumber mana yang paling banyak menghasilkan alert dan insiden. */
function sumberTersibuk(insiden, alerts) {
  const peta = {};
  function pastikan(id) {
    if (!peta[id]) peta[id] = { serviceId: id, alert: 0, alertAktif: 0, insiden: 0, insidenTerbuka: 0 };
    return peta[id];
  }
  (alerts || []).forEach(a => {
    if (!a.serviceId) return; // alert tanpa layanan tidak dipaksakan masuk hitungan
    const p = pastikan(a.serviceId);
    p.alert++;
    if (a.status === 'ACTIVE') p.alertAktif++;
  });
  (insiden || []).forEach(i => {
    if (!i.serviceId) return;
    const p = pastikan(i.serviceId);
    p.insiden++;
    if (i.status !== 'CLOSED' && i.status !== 'RESOLVED') p.insidenTerbuka++;
  });
  return Object.values(peta).sort((a, b) => (b.insiden - a.insiden) || (b.alert - a.alert) || (a.serviceId < b.serviceId ? -1 : 1));
}

function perAturan(alerts) {
  return ATURAN_URUT.map(r => {
    const k = (alerts || []).filter(a => a.ruleId === r);
    return {
      ruleId: r,
      label: LABEL_ATURAN[r] || r,
      total: k.length,
      aktif: k.filter(a => a.status === 'ACTIVE').length
    };
  });
}

/**
 * Susun laporan analitik.
 * `hari` = lebar jendela tren (bawaan 14, dibatasi 1..90).
 */
function laporan(insiden, alerts, opsi) {
  const o = opsi || {};
  const sekarangMs = o.sekarangMs || Date.now();
  const hari = Math.max(1, Math.min(Number(o.hari) || 14, 90));
  const daftar = daftarHari(hari, sekarangMs);

  const I = insiden || [];
  const A = alerts || [];
  const adaRiwayat = I.length > 0 || A.length > 0;
  const s = seri(daftar, I, A, sekarangMs);

  return {
    dicekPada: new Date(sekarangMs).toISOString(),
    jendela: {
      hari: hari,
      dari: daftar[0],
      sampai: daftar[daftar.length - 1],
      zona: 'WIB (UTC+7)'
    },
    kosong: !adaRiwayat,
    catatan: adaRiwayat
      ? 'Dihitung dari ' + I.length + ' insiden dan ' + A.length + ' alert yang tersimpan. Angka nol berarti memang tidak ada kejadian pada hari itu.'
      : 'belum ada riwayat — belum ada insiden maupun alert yang tersimpan, sehingga tidak ada yang bisa dihitung.',
    jumlah: {
      insiden: I.length,
      insidenTerbuka: I.filter(i => i.status !== 'CLOSED' && i.status !== 'RESOLVED').length,
      insidenTertutup: I.filter(i => i.status === 'CLOSED').length,
      alert: A.length,
      alertAktif: A.filter(a => a.status === 'ACTIVE').length,
      aksiTercatat: (o.audit || []).length
    },
    seri: s.titik,
    luarJendela: s.luarJendela,
    perSeverity: perSeverity(I, o.target),
    perKategori: KATEGORI_URUT.map(k => ({
      category: k,
      total: I.filter(i => i.category === k).length
    })),
    perAturan: perAturan(A),
    sumberTersibuk: sumberTersibuk(I, A)
  };
}

module.exports = {
  laporan, seri, perSeverity, sumberTersibuk, perAturan,
  daftarHari, tanggalWIB, KATEGORI_URUT, SEVERITY_URUT, ATURAN_URUT, LABEL_ATURAN
};
