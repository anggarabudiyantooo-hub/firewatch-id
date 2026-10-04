'use strict';
/**
 * Manajemen insiden — siklus hidup, timeline, metrik.
 *
 * Siklus yang ditegakkan (transisi di luar peta ini ditolak, bukan diam-diam
 * diterima):
 *
 *   OPEN → INVESTIGATING → PENDING → RESOLVED → CLOSED
 *            ↑        └──────────┘         │
 *            └───────────(dibuka lagi)──────┘   (RESOLVED → INVESTIGATING)
 *
 * Setiap perubahan penting dicatat ke `timeline` insiden: dibuat, ditugaskan,
 * status berubah, catatan investigasi ditambah, dieskalasi, diselesaikan,
 * ditutup. Itulah jejak audit yang diminta — dan ia hidup di penyimpanan
 * yang sama dengan insidennya.
 *
 * Metrik operasional dihitung HANYA dari insiden nyata. Bila belum ada
 * riwayat, hasilnya null dan antarmuka menulis "belum ada riwayat" —
 * bukan angka karangan.
 */

const store = require('./ops-store');

const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const STATUS = ['OPEN', 'INVESTIGATING', 'PENDING', 'RESOLVED', 'CLOSED'];
const TRANSISI = {
  OPEN: ['INVESTIGATING', 'PENDING', 'RESOLVED'],
  INVESTIGATING: ['PENDING', 'RESOLVED'],
  PENDING: ['INVESTIGATING', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: []
};

const KATEGORI = [
  'data_source_unavailable', 'data_stale', 'api_performance',
  'environmental_event', 'infrastructure', 'lain_lain'
];

function salah(pesan, kode) {
  const e = new Error(pesan);
  e.statusCode = kode || 400;
  return e;
}

function sekarang() {
  return new Date().toISOString();
}

/**
 * Nomor insiden berikutnya.
 *
 * `data` ikut diperiksa: ID yang sudah ada TIDAK boleh dipakai lagi. Ini jaring
 * pengaman untuk keadaan yang tidak bisa dicegah di dalam satu proses — dua
 * instance serverless (atau dua penulis berbeda) sama-sama menaikkan counter
 * dari angka yang sama. Tanpa pemeriksaan ini, insiden kedua menimpa yang
 * pertama dan riwayatnya hilang.
 */
function nomorInsiden(counters, data) {
  const dipakai = new Set(((data && data.incidents) || []).map(i => i.incidentId));
  let n = counters.incident || 0;
  let id;
  do {
    n += 1;
    id = 'INC-' + new Date().getFullYear() + '-' + String(n).padStart(5, '0');
  } while (dipakai.has(id));
  counters.incident = n;
  return id;
}

function catat(inc, tipe, pesan, oleh) {
  inc.timeline.push({ at: sekarang(), type: tipe, message: pesan, by: oleh || null });
  inc.updatedAt = sekarang();
}

function normalSeverity(s) {
  const v = String(s || '').toUpperCase();
  if (!SEVERITY.includes(v)) throw salah('Severity tidak dikenal: ' + s + '. Pilihan: ' + SEVERITY.join(', ') + '.');
  return v;
}

function normalKategori(k) {
  const v = String(k || 'lain_lain');
  // Kategori bebas diperbolehkan, tetapi yang dikenal dipakai oleh runbook.
  return v;
}

/**
 * Daftar insiden.
 *
 * Urutan bawaan: waktu TERDETEKSI terbaru dulu. Urutan alternatif
 * `sort=activity` memakai waktu aktivitas terakhir (updatedAt).
 *
 * Mengapa `sort=activity` ada: insiden yang dibuat dari sebuah alert mewarisi
 * `detectedAt` ALERT itu, yang bisa jauh lebih lama daripada saat insidennya
 * dibuat. Dengan urutan deteksi, insiden yang baru saja dibuat operator bisa
 * tidak muncul sama sekali di daftar 12 teratas — operator melihat insidennya
 * "hilang" padahal ia ada. Ditemukan lewat uji UI yang gagal berselang-seling
 * (4 Okt), bukan lewat dugaan.
 *
 * Pembandingnya juga dibuat pasti: bila waktunya sama, ID dipakai sebagai
 * pemecah seri, sehingga urutannya tidak berubah-ubah antar pemanggilan.
 */
function urutkan(items, sort) {
  const kunci = sort === 'activity' ? (i => i.updatedAt || i.detectedAt || '') : (i => i.detectedAt || '');
  return items.slice().sort((a, b) => {
    const ka = kunci(a);
    const kb = kunci(b);
    if (ka !== kb) return ka < kb ? 1 : -1;
    return (b.incidentId || '') < (a.incidentId || '') ? -1 : 1;
  });
}

async function list(filter = {}) {
  const d = await store.read();
  let items = urutkan(d.incidents || [], filter.sort);
  if (filter.status) items = items.filter(i => filter.status.split(',').includes(i.status));
  if (filter.severity) items = items.filter(i => filter.severity.split(',').includes(i.severity));
  if (filter.assignedTo) items = items.filter(i => i.assignedTo === filter.assignedTo);
  if (filter.open === '1' || filter.open === 'true') {
    items = items.filter(i => ['OPEN', 'INVESTIGATING', 'PENDING'].includes(i.status));
  }
  return items;
}

async function get(id) {
  const d = await store.read();
  const inc = (d.incidents || []).find(i => i.incidentId === id);
  if (!inc) throw salah('Insiden ' + id + ' tidak ditemukan.', 404);
  return inc;
}

/**
 * create — dibungkus kunci penyimpanan: baca→ubah→tulis harus utuh.
 */
async function create(body, oleh) {
  return store.kunci(function () { return createDalam(body, oleh); });
}

async function createDalam(body, oleh) {
  const judul = String(body.title || '').trim();
  if (!judul) throw salah('Judul insiden wajib diisi.');
  const severity = normalSeverity(body.severity || 'MEDIUM');
  const kategori = normalKategori(body.category);

  const data = await store.read();
  const inc = {
    incidentId: nomorInsiden(data.counters, data),
    title: judul,
    description: String(body.description || '').trim(),
    category: kategori,
    severity,
    status: 'OPEN',
    source: body.source || 'manual',
    serviceId: body.serviceId || null,
    alertId: body.alertId || null,
    detectedAt: sekarang(),
    updatedAt: sekarang(),
    assignedTo: body.assignedTo || null,
    escalationLevel: 0,
    resolution: null,
    timeline: []
  };
  catat(inc, 'created', 'Insiden dibuat: ' + judul + ' (severity ' + severity + ', kategori ' + kategori + ').', oleh);
  if (inc.assignedTo) catat(inc, 'assigned', 'Ditugaskan kepada ' + inc.assignedTo + '.', oleh);

  data.incidents = data.incidents || [];
  data.incidents.push(inc);
  store.catatAudit(data, {
    actor: oleh, action: 'insiden_dibuat', target: inc.incidentId,
    detail: inc.title + ' · ' + severity + ' · ' + kategori
  });
  await store.write(data);
  return inc;
}

/** Buat insiden dari alert — jalur otomatis alert→insiden. */
/**
 * fromAlert — dibungkus kunci penyimpanan: baca→ubah→tulis harus utuh.
 */
async function fromAlert(alertId, oleh) {
  return store.kunci(function () { return fromAlertDalam(alertId, oleh); });
}

async function fromAlertDalam(alertId, oleh) {
  const data = await store.read();
  const a = (data.alerts || []).find(x => x.id === alertId);
  if (!a) throw salah('Alert ' + alertId + ' tidak ditemukan.', 404);
  if (a.incidentId) {
    const ada = (data.incidents || []).find(i => i.incidentId === a.incidentId);
    if (ada) return { incident: ada, created: false };
  }
  const kategori = a.ruleId === 'source_down' ? 'data_source_unavailable'
    : a.ruleId === 'data_critical' ? 'data_stale'
      : a.ruleId === 'api_slow' ? 'api_performance' : 'environmental_event';

  const inc = {
    incidentId: nomorInsiden(data.counters, data),
    title: a.title,
    description: (a.detail || []).join(' '),
    category: kategori,
    severity: a.severity,
    status: 'OPEN',
    source: 'alert-engine',
    serviceId: a.serviceId || null,
    alertId: a.id,
    detectedAt: a.detectedAt || sekarang(),
    updatedAt: sekarang(),
    assignedTo: null,
    escalationLevel: 0,
    resolution: null,
    timeline: []
  };
  catat(inc, 'created', 'Dibuat otomatis dari alert ' + a.id + ' (' + a.ruleId + ').', oleh);
  data.incidents.push(inc);
  a.incidentId = inc.incidentId;
  store.catatAudit(data, {
    actor: oleh || 'sistem', action: 'insiden_dari_alert', target: inc.incidentId,
    detail: 'alert ' + a.id + ' (' + a.ruleId + ')'
  });
  await store.write(data);
  return { incident: inc, created: true };
}

/**
 * patch — dibungkus kunci penyimpanan: baca→ubah→tulis harus utuh.
 */
async function patch(id, body, oleh) {
  return store.kunci(function () { return patchDalam(id, body, oleh); });
}

async function patchDalam(id, body, oleh) {
  const data = await store.read();
  const inc = (data.incidents || []).find(i => i.incidentId === id);
  if (!inc) throw salah('Insiden ' + id + ' tidak ditemukan.', 404);

  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) throw salah('Judul tidak boleh kosong.');
    catat(inc, 'updated', 'Judul diubah menjadi: ' + t, oleh);
    inc.title = t;
  }
  if (body.description !== undefined) {
    inc.description = String(body.description);
    catat(inc, 'updated', 'Deskripsi diperbarui.', oleh);
  }
  if (body.severity !== undefined) {
    const s = normalSeverity(body.severity);
    const lama = inc.severity;
    inc.severity = s;
    catat(inc, 'severity', 'Severity diubah: ' + lama + ' → ' + s + '.', oleh);
  }
  if (body.assignedTo !== undefined) {
    inc.assignedTo = body.assignedTo ? String(body.assignedTo) : null;
    catat(inc, 'assigned', inc.assignedTo ? 'Ditugaskan kepada ' + inc.assignedTo + '.' : 'Penugasan dilepas.', oleh);
  }
  if (body.category !== undefined) {
    inc.category = normalKategori(body.category);
    catat(inc, 'updated', 'Kategori diubah menjadi ' + inc.category + '.', oleh);
  }
  if (body.status !== undefined) {
    await ubahStatus(data, inc, body.status, oleh, body.resolution);
  }
  if (body.note) {
    catat(inc, 'note', String(body.note), oleh);
  }
  // Log audit mencatat APA yang berubah, bukan seluruh badan permintaan: cukup
  // untuk menjawab "siapa mengubah apa" tanpa menyalin catatan sensitif.
  const diubah = ['title', 'description', 'severity', 'category', 'assignedTo', 'status']
    .filter(k => body[k] !== undefined);
  if (diubah.length || body.note) {
    store.catatAudit(data, {
      actor: oleh, action: 'insiden_diubah', target: inc.incidentId,
      detail: (diubah.length ? diubah.join(', ') : 'catatan') +
        (body.status ? ' → ' + inc.status : '') + (inc.assignedTo ? ' · petugas ' + inc.assignedTo : '')
    });
  }
  await store.write(data);
  return inc;
}

async function ubahStatus(data, inc, baru, oleh, resolution) {
  const v = String(baru).toUpperCase();
  if (!STATUS.includes(v)) throw salah('Status tidak dikenal: ' + baru + '. Pilihan: ' + STATUS.join(', ') + '.');
  if (v === inc.status) return inc;
  const boleh = TRANSISI[inc.status] || [];
  if (!boleh.includes(v)) {
    throw salah('Transisi ' + inc.status + ' → ' + v + ' tidak diizinkan. Dari ' + inc.status +
      ' hanya bisa ke: ' + (boleh.length ? boleh.join(', ') : '(tidak ada — insiden tertutup)') + '.', 409);
  }
  const lama = inc.status;
  inc.status = v;
  if (v === 'RESOLVED') {
    inc.resolution = resolution ? String(resolution) : (inc.resolution || null);
    inc.resolvedAt = sekarang();
    catat(inc, 'resolved', 'Ditandai selesai.' + (inc.resolution ? ' Penyelesaian: ' + inc.resolution : ''), oleh);
  } else if (v === 'CLOSED') {
    inc.closedAt = sekarang();
    catat(inc, 'closed', 'Insiden ditutup.', oleh);
  } else {
    catat(inc, 'status', 'Status: ' + lama + ' → ' + v + '.', oleh);
  }
  return inc;
}

/**
 * escalate — dibungkus kunci penyimpanan: baca→ubah→tulis harus utuh.
 */
async function escalate(id, body, oleh) {
  return store.kunci(function () { return escalateDalam(id, body, oleh); });
}

async function escalateDalam(id, body, oleh) {
  const data = await store.read();
  const inc = (data.incidents || []).find(i => i.incidentId === id);
  if (!inc) throw salah('Insiden ' + id + ' tidak ditemukan.', 404);
  if (inc.status === 'CLOSED') throw salah('Insiden sudah tertutup; eskalasi tidak berlaku.', 409);
  inc.escalationLevel = (inc.escalationLevel || 0) + 1;
  const ke = body && body.to ? String(body.to) : 'Tim Operasi';
  catat(inc, 'escalated', 'Dieskalasi ke ' + ke + ' (tingkat ' + inc.escalationLevel + ').' +
    (body && body.reason ? ' Alasan: ' + body.reason : ''), oleh);
  store.catatAudit(data, {
    actor: oleh, action: 'insiden_dieskalasi', target: inc.incidentId,
    detail: 'ke ' + ke + ' (tingkat ' + inc.escalationLevel + ')'
  });
  await store.write(data);
  return inc;
}

/**
 * Metrik operasional dari data NYATA.
 *
 * MTTR = rata-rata (resolvedAt - detectedAt) untuk insiden yang pernah
 * diselesaikan. Bila belum ada satu pun, nilainya null.
 * SLA: proporsi insiden yang selesai dalam target menit per severity
 * (OPS_SLA_CRITICAL_MIN dll). Bila tak ada data, juga null.
 */
function metrik(insiden, target) {
  const T = Object.assign({ CRITICAL: 60, HIGH: 240, MEDIUM: 1440, LOW: 4320 }, target || {});
  const selesai = insiden.filter(i => i.resolvedAt);
  const durasi = selesai.map(i => (Date.parse(i.resolvedAt) - Date.parse(i.detectedAt)) / 60000);
  const dalamSla = selesai.filter(i => {
    const menit = (Date.parse(i.resolvedAt) - Date.parse(i.detectedAt)) / 60000;
    return menit <= (T[i.severity] || T.MEDIUM);
  });
  const terbuka = insiden.filter(i => ['OPEN', 'INVESTIGATING', 'PENDING'].includes(i.status));
  const perSeverity = {};
  for (const s of SEVERITY) {
    perSeverity[s] = {
      terbuka: terbuka.filter(i => i.severity === s).length,
      total: insiden.filter(i => i.severity === s).length
    };
  }
  return {
    total: insiden.length,
    terbuka: terbuka.length,
    selesai: selesai.length,
    ditutup: insiden.filter(i => i.status === 'CLOSED').length,
    kritisTerbuka: terbuka.filter(i => i.severity === 'CRITICAL').length,
    dieskalasi: insiden.filter(i => (i.escalationLevel || 0) > 0).length,
    mttrMenit: durasi.length ? +(durasi.reduce((a, b) => a + b, 0) / durasi.length).toFixed(1) : null,
    slaTargetMenit: T,
    slaTerpenuhi: selesai.length ? dalamSla.length : null,
    slaTotal: selesai.length || null,
    slaPersen: selesai.length ? Math.round((dalamSla.length / selesai.length) * 100) : null,
    perSeverity,
    catatan: insiden.length ? null : 'belum ada riwayat'
  };
}

/**
 * Target SLA per severity dari lingkungan. Satu sumber untuk seluruh aplikasi
 * supaya metrik dan analitik tidak bisa memakai target yang berbeda.
 */
function targetSLA() {
  return {
    CRITICAL: Number(process.env.OPS_SLA_CRITICAL_MIN || 60),
    HIGH: Number(process.env.OPS_SLA_HIGH_MIN || 240),
    MEDIUM: Number(process.env.OPS_SLA_MEDIUM_MIN || 1440),
    LOW: Number(process.env.OPS_SLA_LOW_MIN || 4320)
  };
}

async function metrikDari(store2) {
  const d = await (store2 || store).read();
  return metrik(d.incidents || [], targetSLA());
}

module.exports = {
  SEVERITY, STATUS, TRANSISI, KATEGORI,
  list, get, create, fromAlert, patch, escalate, metrik, metrikDari, targetSLA, ubahStatus
};
