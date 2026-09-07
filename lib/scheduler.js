'use strict';
/**
 * Orkestrator penyegaran data.
 *
 * Semua sumber eksternal didaftarkan di satu tempat dengan intervalnya
 * masing-masing, sehingga jadwal pembaruan menjadi eksplisit dan dapat
 * diperiksa — bukan tersebar sebagai angka TTL di berbagai pemanggilan.
 *
 * Dua mode berjalan berdampingan:
 *
 *   1. Server berkelanjutan (`node server.js`) — timer internal berjalan
 *      dan setiap tugas disegarkan tepat pada intervalnya.
 *   2. Serverless (Vercel) — proses mati di antara permintaan sehingga
 *      timer tidak dapat diandalkan. Endpoint /api/cron memicu satu putaran
 *      penyegaran; penjadwal luar (GitHub Actions) memanggilnya berkala.
 *
 * Tugas yang gagal tidak pernah menjatuhkan tugas lain, dan hasil sukses
 * terakhir tetap dipakai sampai ada yang lebih baru.
 */

class Scheduler {
  /**
   * @param {object} opts
   * @param {function} opts.onLog  penerima catatan (default: console.error)
   */
  constructor(opts = {}) {
    this.tasks = new Map();
    this.timers = [];
    this.running = false;
    this.onLog = opts.onLog || ((msg) => console.error(msg));
  }

  /**
   * Daftarkan satu sumber data.
   * @param {string}   id        nama unik, dipakai di laporan status
   * @param {object}   cfg
   * @param {number}   cfg.everyMs   jarak antar penyegaran
   * @param {function} cfg.run       async () => data
   * @param {string}   cfg.label     nama yang ditampilkan ke pengguna
   * @param {boolean}  cfg.critical  bila true, kegagalan ditandai menonjol
   */
  register(id, cfg) {
    this.tasks.set(id, {
      id,
      label: cfg.label || id,
      everyMs: cfg.everyMs,
      run: cfg.run,
      critical: !!cfg.critical,
      value: null,
      lastOk: null,
      lastTry: null,
      lastError: null,
      runs: 0,
      fails: 0,
      inFlight: null
    });
    return this;
  }

  /** Apakah tugas ini sudah waktunya disegarkan? */
  isDue(t, now = Date.now()) {
    if (!t.lastOk) return true;
    return now - t.lastOk >= t.everyMs;
  }

  /**
   * Jalankan satu tugas. Panggilan paralel untuk tugas yang sama akan
   * berbagi promise yang sama supaya sumber tidak dihujani permintaan.
   */
  async refresh(id, { force = false } = {}) {
    const t = this.tasks.get(id);
    if (!t) throw new Error('tugas_tidak_dikenal_' + id);
    if (t.inFlight) return t.inFlight;
    if (!force && !this.isDue(t)) return t.value;

    t.lastTry = Date.now();
    t.inFlight = (async () => {
      try {
        const v = await t.run();
        t.value = v;
        t.lastOk = Date.now();
        t.lastError = null;
        t.runs++;
        return v;
      } catch (e) {
        t.fails++;
        t.lastError = e && e.message ? e.message : String(e);
        this.onLog(`[jadwal:${id}] ${t.lastError}`);
        // Nilai lama sengaja dipertahankan: data usang lebih berguna
        // daripada panel kosong pada dasbor kebencanaan.
        return t.value;
      } finally {
        t.inFlight = null;
      }
    })();
    return t.inFlight;
  }

  /** Ambil nilai terakhir; segarkan lebih dulu bila sudah kedaluwarsa. */
  async get(id) {
    const t = this.tasks.get(id);
    if (!t) throw new Error('tugas_tidak_dikenal_' + id);
    if (this.isDue(t)) await this.refresh(id);
    return t.value;
  }

  /** Nilai terakhir tanpa memicu jaringan (boleh null). */
  peek(id) {
    const t = this.tasks.get(id);
    return t ? t.value : null;
  }

  /**
   * Satu putaran penyegaran untuk semua tugas yang sudah jatuh tempo.
   * Dipakai oleh endpoint /api/cron.
   */
  async tick({ force = false } = {}) {
    const due = [...this.tasks.values()].filter(t => force || this.isDue(t));
    const started = Date.now();
    await Promise.all(due.map(t => this.refresh(t.id, { force }).catch(() => null)));
    return {
      refreshed: due.map(t => t.id),
      skipped: [...this.tasks.keys()].filter(k => !due.find(t => t.id === k)),
      ms: Date.now() - started
    };
  }

  /** Mulai timer internal (hanya untuk server berkelanjutan). */
  start() {
    if (this.running) return this;
    this.running = true;
    for (const t of this.tasks.values()) {
      // Penyegaran pertama dijadwalkan acak dalam 5 detik pertama agar
      // semua sumber tidak dihubungi serentak saat proses baru hidup.
      const jitter = Math.floor(Math.random() * 5000);
      this.timers.push(setTimeout(() => {
        this.refresh(t.id, { force: true }).catch(() => null);
        const iv = setInterval(() => this.refresh(t.id).catch(() => null), t.everyMs);
        if (iv.unref) iv.unref();
        this.timers.push(iv);
      }, jitter));
    }
    return this;
  }

  stop() {
    this.running = false;
    for (const h of this.timers) { clearTimeout(h); clearInterval(h); }
    this.timers = [];
  }

  /** Laporan status untuk /api/status — aman dipublikasikan. */
  status() {
    const now = Date.now();
    const tasks = [...this.tasks.values()].map(t => ({
      id: t.id,
      label: t.label,
      everyMs: t.everyMs,
      everyLabel: humanEvery(t.everyMs),
      hasData: t.value !== null && t.value !== undefined,
      ageMs: t.lastOk ? now - t.lastOk : null,
      ageLabel: t.lastOk ? humanAge(now - t.lastOk) : 'belum pernah',
      nextInMs: t.lastOk ? Math.max(0, t.everyMs - (now - t.lastOk)) : 0,
      runs: t.runs,
      fails: t.fails,
      // Pesan galat internal tidak diteruskan ke klien; cukup penandanya.
      healthy: !!t.value && !t.lastError,
      critical: t.critical
    }));
    return {
      updatedAt: new Date().toISOString(),
      mode: this.running ? 'timer internal' : 'dipicu penjadwal luar',
      tasks,
      healthy: tasks.filter(t => t.healthy).length,
      total: tasks.length
    };
  }
}

function humanEvery(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return 'tiap ' + m + ' menit';
  const h = Math.round(m / 60);
  return 'tiap ' + h + ' jam';
}

function humanAge(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + ' detik lalu';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' menit lalu';
  const h = Math.round(m / 60);
  return h + ' jam lalu';
}

module.exports = { Scheduler };
