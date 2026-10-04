'use strict';
/**
 * Infrastruktur — bagian SIMULASI (P2).
 *
 * BATAS YANG TIDAK DILAMPAUI
 * --------------------------
 * Modul ini TIDAK mengarang perangkat jaringan fisik. Tidak ada router, switch,
 * firewall, atau nama vendor (Cisco/Fortinet/Juniper/Palo Alto) dan tidak ada
 * protokol routing (BGP/OSPF) di sini — proyek ini tidak punya alat untuk
 * mengukurnya, jadi menampilkannya sebagai "infrastruktur" akan menyesatkan
 * pembaca yang mengira melihat perangkat sungguhan.
 *
 * Yang ada di sini adalah DUA JENIS data yang dibedakan tegas di setiap simpul
 * dan setiap tautan:
 *
 *   real: true    angka hasil pengukuran aplikasi ini sendiri — status layanan,
 *                 waktu respons, jumlah gagal berturut, kesegaran. Sama persis
 *                 dengan /api/data-sources.
 *   real: false   SIMULATED — perkiraan yang DIHITUNG dari angka nyata memakai
 *                 model yang ditulis terbuka di `model` (bukan pengukuran).
 *                 Setiap nilai simulasi selalu disertai `simulated: true`, dan
 *                 antarmuka memasang lencana SIMULATED di sebelahnya.
 *
 * Model simulasi sengaja deterministik (fungsi dari angka nyata, bukan angka
 * acak) supaya nilainya tidak berubah-ubah di setiap pemuatan — angka yang
 * berkedip membuat orang mengira ia sedang melihat pengukuran.
 *
 * Bentuk topologinya pun bukan temuan: rantai klien → edge → fungsi → penjadwal
 * → hulu adalah cara aplikasi ini memang di-deploy (Vercel + penjadwal luar),
 * dan itu dinyatakan sebagai `dasarTopologi`.
 */

const MODEL = {
  id: 'rtt-perkiraan-v1',
  catatan: 'Waktu jaringan perkiraan = 40% dari waktu respons total yang TERUKUR; ' +
    'jatah proses diperkirakan = sisanya. Angka ini SIMULASI, bukan pengukuran jaringan.',
  faktorJaringan: 0.4
};

/** Bulatkan ke satu desimal, atau null bila tidak ada dasar. */
function bulat(v) {
  return v === null || v === undefined || isNaN(v) ? null : Math.round(v * 10) / 10;
}

/**
 * Bangun gambaran infrastruktur.
 * `services` = keluaran service-health.bangun() (angka nyata).
 */
function gambaran(services, konteks) {
  const k = konteks || {};
  const daftar = services || [];
  const turun = daftar.filter(s => s.status === 'DOWN');
  const sehat = daftar.filter(s => s.status === 'HEALTHY');

  const simpul = [
    {
      id: 'klien', nama: 'Peramban klien', jenis: 'klien', real: false,
      keterangan: 'SIMULATED: tidak ada telemetri klien pada aplikasi ini. Yang benar-benar diketahui ' +
        'hanya bahwa ada permintaan masuk — itu terlihat dari log fungsi di Vercel, bukan dari sini.',
      nilai: [{ label: 'Permintaan klien', nilai: null, satuan: '', real: false, catatan: 'tidak tersedia (tidak ada telemetri)' }]
    },
    {
      id: 'edge', nama: 'Edge CDN', jenis: 'edge', real: false,
      keterangan: 'SIMULATED: aplikasi ini memang dilayani lewat CDN, tetapi headernya (x-vercel-cache, age) ' +
        'hanya terbaca per permintaan — bukan disimpan, jadi rasio HIT/MISS tidak dapat dilaporkan di sini.',
      nilai: [{ label: 'Rasio cache HIT', nilai: null, satuan: '%', real: false, catatan: 'tidak tersedia (tidak disimpan)' }]
    },
    {
      id: 'fungsi', nama: 'Fungsi serverless', jenis: 'fungsi', real: true,
      keterangan: 'Angka nyata dari proses yang melayani permintaan ini.',
      nilai: [
        { label: 'Uptime proses', nilai: k.uptimeSeconds != null ? Math.round(k.uptimeSeconds) : null, satuan: 's', real: true },
        { label: 'Node', nilai: k.nodeVersion || null, satuan: '', real: true },
        { label: 'Mode penyimpanan', nilai: k.storageMode || null, satuan: '', real: true },
        { label: 'Lingkungan', nilai: k.serverless ? 'Vercel (serverless)' : 'lokal (proses berkelanjutan)', satuan: '', real: true }
      ]
    },
    {
      id: 'penjadwal', nama: 'Penjadwal', jenis: 'penjadwal', real: true,
      keterangan: 'Penjadwal yang benar-benar menjalankan pengambilan data (internal atau GitHub Actions).',
      nilai: [
        { label: 'Mode', nilai: k.schedulerMode || null, satuan: '', real: true },
        { label: 'Tugas terdaftar', nilai: daftar.length, satuan: '', real: true },
        { label: 'Tugas sehat', nilai: sehat.length + '/' + daftar.length, satuan: '', real: true }
      ]
    },

    // Setiap sumber hulu yang benar-benar dipantau menjadi satu simpul.
    ...daftar.map(s => ({
      id: 'hulu-' + s.id,
      nama: s.name,
      jenis: 'hulu',
      real: true,
      derajat: s.critical ? 'kritis' : 'biasa',
      keterangan: s.endpoint || null,
      nilai: [
        { label: 'Status', nilai: s.status, satuan: '', real: true },
        { label: 'Respons terakhir', nilai: s.responseTime, satuan: 'ms', real: true },
        { label: 'Gagal berturut', nilai: s.consecutiveFails || 0, satuan: '\u00d7', real: true },
        { label: 'Kesegaran', nilai: s.freshness ? s.freshness.status : 'UNKNOWN', satuan: '', real: true }
      ]
    }))
  ];

  // --- tautan: yang nyata adalah KEADAAN ujung-ujungnya; angka tautannya SIMULASI
  const tautan = [];
  function tautanSimulasi(dari, ke, dasarMs, jenis) {
    const jaringan = dasarMs != null ? bulat(dasarMs * MODEL.faktorJaringan) : null;
    const proses = dasarMs != null ? bulat(dasarMs * (1 - MODEL.faktorJaringan)) : null;
    tautan.push({
      dari, ke, jenis,
      simulated: true,
      rttPerkiraanMs: jaringan,
      prosesPerkiraanMs: proses,
      dasarMs: dasarMs != null ? dasarMs : null,
      catatan: dasarMs != null
        ? 'SIMULATED dari ' + dasarMs + ' ms yang terukur (model ' + MODEL.id + ')'
        : 'SIMULATED tidak dapat dihitung: belum ada pengukuran waktu respons'
    });
  }

  tautanSimulasi('klien', 'edge', null, 'permintaan');
  tautanSimulasi('edge', 'fungsi', null, 'invokasi');
  tautanSimulasi('fungsi', 'penjadwal', null, 'kendali');
  daftar.forEach(s => tautanSimulasi('penjadwal', 'hulu-' + s.id, s.responseTime, 'pengambilan'));

  return {
    dicekPada: new Date().toISOString(),
    label: 'SIMULATED',
    model: MODEL,
    dasarTopologi: 'Bentuk rantai klien → edge → fungsi → penjadwal → hulu bukan dugaan: itu memang cara ' +
      'aplikasi ini di-deploy (Vercel + penjadwal luar). Yang SIMULASI hanyalah angka tautannya.',
    catatan: 'Tidak ada perangkat jaringan fisik dan tidak ada protokol routing yang dipantau di sini — ' +
      'aplikasi ini tidak punya alat untuk mengukurnya. Simpul hulu menampilkan ANGKA NYATA hasil pengukuran; ' +
      'juga ditandai real: true per nilai. Angka tautan bertanda simulated: true.',
    ringkas: {
      simpul: simpul.length,
      tautan: tautan.length,
      simpulNyata: simpul.filter(s => s.real).length,
      tautanSimulasi: tautan.length,
      huluTurun: turun.length
    },
    simpul,
    tautan
  };
}

module.exports = { gambaran, MODEL };
