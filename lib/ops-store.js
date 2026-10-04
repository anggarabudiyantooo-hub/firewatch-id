'use strict';
/**
 * Penyimpanan operasional (insiden, alert, counter) — adaptor berlapis.
 *
 * KENYATAAN YANG HARUS DIHORMATI
 * -----------------------------
 * Aplikasi ini tidak punya basis data (lihat docs/ERD.md). Di Vercel, tiap
 * instance punya memori sendiri dan hilang saat didaur ulang; sistem berkas
 * hanya bisa ditulis di /tmp milik instance itu. Jadi "menyimpan insiden"
 * tanpa layanan bersama MUSTAHIL. Modul ini tidak berpura-pura:
 *
 *   upstash   — Redis REST (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
 *               → penyimpanan bersama, tahan daur ulang. Produksi.
 *   github    — Issues di repo (OPS_GITHUB_TOKEN + OPS_GITHUB_REPO)
 *               → tiket sebagai penyimpanan; riwayat terlihat manusia.
 *   file      — berkas JSON lokal (.data/ops.json) → pengembangan.
 *   ephemeral — memori instance saja. Dipakai HANYA bila tidak ada yang
 *               terkonfigurasi; /api/operations/store menandainya terang-
 *               terangan dan antarmuka memasang spanduk peringatan.
 *
 * Mode terdeteksi otomatis dari environment, urutan: upstash → github → file
 * (non-produksi) → ephemeral.
 */

const fs = require('fs');
const path = require('path');

const FILE_DIR = path.join(__dirname, '..', '.data');
// OPS_STORE_FILE menunjuk berkas lain (dipakai pengujian/pengembangan supaya
// hasil uji tidak pernah tercampur dengan keadaan yang sudah menumpuk di
// .data/ops.json — kelas bug yang sudah dua kali menggigit di proyek ini).
const FILE_PATH = process.env.OPS_STORE_FILE
  ? path.resolve(process.env.OPS_STORE_FILE)
  : path.join(FILE_DIR, 'ops.json');
const KUNCI = 'siaga:ops';

const EMPTY = () => ({ incidents: [], alerts: [], audit: [], counters: { incident: 0, alert: 0 }, updatedAt: null });

/**
 * Batas log audit. Log operasional harus punya ujung: berkas/layanan ini kecil
 * dan tidak boleh tumbuh tanpa batas karena satu baris ditulis setiap tindakan.
 * 200 entri terakhir sudah lebih dari cukup untuk menjawab "siapa mengubah apa".
 */
const AUDIT_MAX = 200;

/**
 * Catat satu tindakan operasional ke dokumen (murni — tidak menyentuh I/O,
 * sehingga perilakunya bisa diuji tanpa jaringan).
 *
 * Yang dicatat hanya yang benar-benar terjadi: waktu, pelaku (nama yang dikirim
 * operator, atau "sistem" untuk jalur otomatis), tindakan, sasaran, dan detail
 * singkat. Tidak ada nama yang dikarang: bila tidak ada pelaku, ditulis "tanpa
 * nama" apa adanya.
 */
function catatAudit(data, entry) {
  if (!data.audit) data.audit = [];
  data.audit.unshift({
    at: entry.at || new Date().toISOString(),
    actor: entry.actor ? String(entry.actor) : 'tanpa nama',
    action: String(entry.action || 'tindakan'),
    target: entry.target ? String(entry.target) : null,
    detail: entry.detail ? String(entry.detail) : null
  });
  if (data.audit.length > AUDIT_MAX) data.audit.length = AUDIT_MAX;
  return data.audit[0];
}

function terdeteksi() {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return 'upstash';
  if (process.env.OPS_GITHUB_TOKEN && process.env.OPS_GITHUB_REPO) return 'github';
  if (!process.env.VERCEL) return 'file';
  return 'ephemeral';
}

// ---------- upstash ----------
async function upstashGet() {
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '') + '/get/' + encodeURIComponent(KUNCI);
  const r = await fetch(url, {
    headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN },
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error('upstash_get_' + r.status);
  const j = await r.json();
  if (!j || j.result == null) return null;
  return JSON.parse(j.result);
}

async function upstashSet(data) {
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '') + '/set/' + encodeURIComponent(KUNCI);
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([JSON.stringify(data)]),
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error('upstash_set_' + r.status);
}

// ---------- berkas lokal ----------
function fileGet() {
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function fileSet(data) {
  fs.mkdirSync(FILE_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

// ---------- memori (ephemeral) ----------
let memori = null;

/**
 * Penyimpanan dalam memori dengan penanda mode.
 * Dibuat sebagai objek supaya pemanggil bisa membaca `mode` dan
 * memberitahukannya ke pengguna, bukan menebak.
 */
const store = {
  mode: null,
  _github: null, // diisi oleh lapisan GitHub (lib/ops-github.js) bila dipakai

  init() {
    this.mode = terdeteksi();
    if (this.mode === 'github') {
      // Menghindari ketergantungan melingkar: modul GitHub memakai store ini.
      try {
        this._github = require('./ops-github');
      } catch (e) {
        this.mode = process.env.VERCEL ? 'ephemeral' : 'file';
      }
    }
    return this.mode;
  },

  async read() {
    if (this.mode === 'upstash') {
      try {
        const d = await upstashGet();
        return d || EMPTY();
      } catch (e) {
        // Kegagalan penyimpanan TIDAK boleh menjatuhkan dashboard: mode
        // dilaporkan apa adanya supaya antarmuka bisa memberi tahu.
        this.lastError = e.message;
        return EMPTY();
      }
    }
    // EMPTY adalah FUNGSI cadangan, bukan nilai: adaptor GitHub memanggilnya
    // hanya ketika issue keadaan belum ada. Mengirim EMPTY() di sini membuat
    // pembacaan pertama gagal dengan "fallback is not a function" — ditemukan
    // saat memasang mode ini untuk pertama kali (4 Okt), bukan oleh uji.
    if (this.mode === 'github') return this._github.read(EMPTY);
    if (this.mode === 'file') return fileGet() || EMPTY();
    if (this.mode === 'ephemeral') return memori || (memori = EMPTY());
    return EMPTY();
  },

  async write(data) {
    data.updatedAt = new Date().toISOString();
    if (this.mode === 'upstash') {
      await upstashSet(data);
      return data;
    }
    if (this.mode === 'github') return this._github.write(data, EMPTY);
    if (this.mode === 'file') {
      fileSet(data);
      return data;
    }
    memori = data; // ephemeral: bertahan selama instance hidup
    return data;
  },

  /** Ringkasan untuk /api/operations/store — apa adanya, tanpa membesar-besarkan. */
  info() {
    const pesan = {
      upstash: 'Penyimpanan bersama (Redis REST) — insiden bertahan lintas instance.',
      github: 'Penyimpanan lewat GitHub Issues — riwayat terekam sebagai tiket.',
      file: 'Penyimpanan berkas lokal (mode pengembangan).',
      ephemeral: 'Penyimpanan SEMENTARA di memori instance — data insiden akan hilang saat instance didaur ulang. Pasang UPSTASH_REDIS_REST_URL/TOKEN atau OPS_GITHUB_TOKEN/OPS_GITHUB_REPO untuk penyimpanan tetap.'
    };
    return {
      mode: this.mode,
      persistent: this.mode === 'upstash' || this.mode === 'github' || this.mode === 'file',
      note: pesan[this.mode] || 'Mode penyimpanan tidak dikenal.',
      lastError: this.lastError || null
    };
  },

  /** Baca log audit terbaru (untuk /api/operations/audit). */
  async audit(limit) {
    const d = await this.read();
    const n = Math.max(1, Math.min(Number(limit) || 50, AUDIT_MAX));
    return { entries: (d.audit || []).slice(0, n), total: (d.audit || []).length, max: AUDIT_MAX };
  },

  catatAudit,
  AUDIT_MAX,

  async mutate(fn) {
    const d = await this.read();
    const out = fn(d);
    await this.write(d);
    return out;
  }
};

store.init();
module.exports = store;
