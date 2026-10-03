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
    // Fase 2.2: monitoring terstruktur
    this.logs = []; // riwayat log terstruktur untuk /api/status
    this.quota = { '429': 0, '5xx': 0, total: 0, last429At: null }; // pantau konsumsi kuota
  }

  /** Simpan log terstruktur — Fase 2.2 */
  logStructured(entry) {
    const log = {
      at: new Date().toISOString(),
      ...entry
    };
    this.logs.push(log);
    // simpan 200 terakhir saja
    if (this.logs.length > 200) this.logs.shift();
    // log ke console sebagai JSON untuk Vercel log drain
    try {
      console.log(JSON.stringify(log));
    } catch {}
    if (entry.level === 'error' || entry.level === 'warn') {
      this.onLog(`[${entry.task || 'scheduler'}] ${entry.message}`);
    }
  }

  /** Catat 429 / 5xx untuk pantau kuota — Fase 2.2 */
  trackQuota(status) {
    this.quota.total++;
    if (status === 429) {
      this.quota['429']++;
      this.quota.last429At = new Date().toISOString();
    } else if (status >= 500 && status <= 599) {
      this.quota['5xx']++;
    }
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
      consecutiveFails: 0, // Fase 2.2: hitung gagal berturut
      errorHistory: [], // Fase 2.2: 10 error terakhir
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
        t.consecutiveFails = 0; // reset saat sukses — Fase 2.2
        this.logStructured({
          level: 'info',
          task: id,
          label: t.label,
          message: `sukses ${t.runs}x`,
          ageMs: 0,
          critical: t.critical
        });
        return v;
      } catch (e) {
        t.fails++;
        t.consecutiveFails++;
        t.lastError = e && e.message ? e.message : String(e);
        t.errorHistory.push({ at: new Date().toISOString(), error: t.lastError });
        if (t.errorHistory.length > 10) t.errorHistory.shift();

        // Track quota jika error mengandung 429 atau 5xx
        if (/429/.test(t.lastError)) this.trackQuota(429);
        else if (/5\d\d/.test(t.lastError)) this.trackQuota(500);

        const level = t.critical && t.consecutiveFails >= 3 ? 'critical' : t.critical ? 'warn' : 'error';
        this.logStructured({
          level,
          task: id,
          label: t.label,
          message: t.lastError,
          fails: t.fails,
          consecutiveFails: t.consecutiveFails,
          critical: t.critical,
          alert: t.critical && t.consecutiveFails >= 3 ? `Tugas kritis ${id} gagal ${t.consecutiveFails}x berturut!` : undefined
        });

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
  /**
   * Satu putaran penyegaran.
   *
   * `budgetMs` membatasi total waktu tunggu. Di lingkungan serverless,
   * pemanggilan yang melewati batas fungsi dibunuh dan membalas galat,
   * sehingga pemanggil (GitHub Actions) menganggap penyegaran gagal padahal
   * sebagian besar sumber sudah berhasil. Penyegaran yang belum selesai
   * tetap berjalan di latar dan hasilnya masuk cache untuk putaran berikutnya.
   */
  async tick({ force = false, budgetMs = 0 } = {}) {
    const due = [...this.tasks.values()].filter(t => force || this.isDue(t));
    const started = Date.now();

    const jobs = due.map(t => this.refresh(t.id, { force })
      .then(() => t.id).catch(() => null));

    let timedOut = false;
    if (budgetMs > 0) {
      let timer;
      const guard = new Promise(res => {
        timer = setTimeout(() => { timedOut = true; res('__timeout__'); }, budgetMs);
      });
      await Promise.race([Promise.all(jobs), guard]);
      clearTimeout(timer);
    } else {
      await Promise.all(jobs);
    }

    // Tugas yang sudah punya nilai dianggap selesai pada putaran ini.
    // peek() mengembalikan null untuk tugas yang belum pernah berhasil,
    // jadi keberhasilan diukur dari stempel waktu keberhasilan terakhir.
    const done = due
      .filter(t => !timedOut || (t.lastOk && t.lastOk >= started))
      .map(t => t.id);
    return {
      refreshed: done,
      pending: due.map(t => t.id).filter(id => !done.includes(id)),
      timedOut,
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

  /** Laporan status untuk /api/status — aman dipublikasikan. — Fase 2.2 monitoring & alerting */
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
      consecutiveFails: t.consecutiveFails || 0,
      // Pesan galat tidak diteruskan mentah-mentah: URL dipangkas ke host dan
      // query (key/token) dibuang, agar panel bisa menjelaskan PENYEBAB sumber
      // mati tanpa membocorkan alamat internal lengkap.
      healthy: !!t.value && !t.lastError,
      errorNote: t.lastError ? publicCause(t.lastError) : null,
      critical: t.critical,
      alert: t.critical && (t.consecutiveFails || 0) >= 3
        ? `Kritis: ${t.id} gagal ${t.consecutiveFails}x berturut!`
        : (t.consecutiveFails || 0) >= 5 ? `Peringatan: ${t.id} gagal ${t.consecutiveFails}x` : null,
      lastErrorAt: t.errorHistory && t.errorHistory.length ? t.errorHistory[t.errorHistory.length - 1].at : null
    }));

    // Alert global untuk tugas kritis gagal berturut
    const criticalAlerts = tasks.filter(t => t.alert && t.critical).map(t => ({
      id: t.id,
      message: t.alert,
      consecutiveFails: t.consecutiveFails
    }));

    // Log untuk panel status disanitasi seperti errorNote: pesan yang sama
    // di konsol server tetap utuh untuk operator, tapi ke klien hanya
    // versi aman (tanpa URL/query penuh).
    const recentLogs = this.logs.slice(-20).reverse()
      .map(lg => (lg && lg.message ? Object.assign({}, lg, { message: publicCause(lg.message) }) : lg));

    return {
      updatedAt: new Date().toISOString(),
      mode: this.running ? 'timer internal' : 'dipicu penjadwal luar',
      tasks,
      healthy: tasks.filter(t => t.healthy).length,
      total: tasks.length,
      criticalAlerts,
      quota: this.quota, // Fase 2.2: pantau kuota 429/5xx
      recentLogs, // Fase 2.2: log terstruktur
      summary: {
        totalRuns: tasks.reduce((s, t) => s + t.runs, 0),
        totalFails: tasks.reduce((s, t) => s + t.fails, 0),
        failingTasks: tasks.filter(t => (t.consecutiveFails || 0) > 0).map(t => ({ id: t.id, fails: t.consecutiveFails }))
      }
    };
  }
}

function publicCause(msg) {
  return String(msg)
    .replace(/https?:\/\/([^/?#\s]+)[^\s]*/g, '$1')
    .replace(/[?&](?:key|token|api[_-]?key)=[^\s&]+/gi, '')
    .slice(0, 110);
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
