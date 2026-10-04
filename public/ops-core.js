/* Operations Center — inti bersama.
 *
 * Dipakai dua halaman (papan operasi /operations dan lembar insiden /insiden/…)
 * supaya logika tindakan dan cara menampilkan waktu hanya ada di SATU tempat.
 * Gaya ES5, tanpa ketergantungan, dimuat sebelum berkas halaman.
 *
 * Yang di sini hanya yang benar-benar dipakai bersama. Hal khas satu halaman
 * (jam berjalan, papan KPI, tabel sumber) tetap di berkas halamannya.
 */
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, teks) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (teks !== undefined && teks !== null) e.textContent = teks;
    return e;
  }

  function toast(msg) {
    var t = $('toast');
    if (!t) return; // halaman tanpa wadah toast tetap boleh memanggil ini
    t.textContent = msg;
    t.classList.add('on');
    setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  function ambil(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.error ? j.error : ('HTTP ' + r.status));
        return j;
      });
    });
  }

  /**
   * Ambil yang tidak pernah melempar: hasilnya selalu {ok, data} atau
   * {ok:false, error}. Dipakai papan operasi supaya satu endpoint yang gagal
   * tidak mengosongkan seluruh halaman — di Vercel tiap permintaan bisa mendarat
   * di instance berbeda, jadi "satu panel gagal" adalah keadaan yang wajar.
   */
  function ambilAman(url, opts) {
    return ambil(url, opts).then(
      function (data) { return { ok: true, data: data }; },
      function (e) { return { ok: false, error: e, url: url }; }
    );
  }

  /** Sama seperti ambil(), tetapi header balasan ikut dibawa (untuk jam server). */
  function ambilDenganHeader(url, opts) {
    return fetch(url, opts).then(function (r) {
      var tanggal = r.headers.get('date');
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.error ? j.error : ('HTTP ' + r.status));
        return { data: j, date: tanggal };
      });
    });
  }

  /** Nama pelaku dari perangkat ini (dipakai untuk header x-ops-actor). */
  function petugasSaya() {
    try { return localStorage.getItem('ops_actor') || ''; } catch (e) { return ''; }
  }

  function simpanPetugas(nama) {
    try { localStorage.setItem('ops_actor', String(nama || '').slice(0, 60)); } catch (e) { /* diabaikan */ }
  }

  /** Token akses (RBAC) bila pemasangan ini memakainya. Disimpan lokal saja. */
  function tokenSaya() {
    try { return localStorage.getItem('ops_token') || ''; } catch (e) { return ''; }
  }

  function simpanToken(tok) {
    try {
      if (tok) localStorage.setItem('ops_token', String(tok).trim());
      else localStorage.removeItem('ops_token');
    } catch (e) { /* diabaikan */ }
  }

  /** Header standar untuk API ops: nama pelaku + token akses (bila ada). */
  function headerOps(tambahan) {
    var actor = petugasSaya();
    var tok = tokenSaya();
    return Object.assign({ 'Content-Type': 'application/json' },
      actor ? { 'x-ops-actor': actor } : {},
      tok ? { 'x-ops-token': tok } : {},
      tambahan || {});
  }

  function kirim(url, metode, body) {
    return ambil(url, {
      method: metode,
      headers: headerOps(),
      body: body ? JSON.stringify(body) : undefined
    });
  }

  /** Keadaan akses menurut server (mode, peran yang terkonfigurasi, peran kita). */
  function ambilAkses() {
    return ambilAman('/api/operations/access', { headers: headerOps() });
  }

  /** Waktu ringkas menurut jam perangkat, untuk tanggal yang mudah dibaca. */
  function waktu(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return p(d.getDate()) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()] +
      ' ' + p(d.getHours()) + '.' + p(d.getMinutes());
  }

  function durasi(menit) {
    if (menit === null || menit === undefined) return 'belum ada riwayat';
    if (menit < 60) return Math.round(menit) + ' mnt';
    var h = menit / 60;
    return (h < 48 ? h.toFixed(1) + ' jam' : (h / 24).toFixed(1) + ' hari');
  }

  /** Koreksi jam: pakai header Date server bila jam perangkat meleset. */
  function koreksiJam() {
    return fetch('/api/operations/health', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        var d = r.headers.get('date');
        if (d) {
          var t = Date.parse(d);
          if (!isNaN(t)) global.__skewMs = t - Date.now();
        }
      })
      .catch(function () { /* tanpa koreksi: jam perangkat dipakai apa adanya */ });
  }

  global.OpsCore = {
    $: $, el: el, toast: toast, ambil: ambil, ambilAman: ambilAman, ambilDenganHeader: ambilDenganHeader,
    kirim: kirim, headerOps: headerOps, tokenSaya: tokenSaya, simpanToken: simpanToken, ambilAkses: ambilAkses,
    petugasSaya: petugasSaya, simpanPetugas: simpanPetugas,
    waktu: waktu, durasi: durasi, koreksiJam: koreksiJam,
    KATEGORI: ['data_source_unavailable', 'data_stale', 'api_performance', 'environmental_event', 'infrastructure', 'lain_lain']
  };
})(window);
