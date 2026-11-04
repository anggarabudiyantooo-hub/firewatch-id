/* Operations Center, inti sesi admin.
 *
 * Semua permintaan memakai cookie HttpOnly same-origin. Token CSRF hanya
 * disimpan di memori halaman dan dikirim pada mutasi; tidak ada bearer token
 * atau kredensial yang ditaruh di Web Storage.
 */
(function (global) {
  'use strict';

  var csrfToken = '';
  var sessionPromise = null;
  var redirecting = false;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, teks) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (teks !== undefined && teks !== null) e.textContent = teks;
    return e;
  }

  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  function redirectToLogin() {
    if (redirecting) return;
    redirecting = true;
    var target = global.location.pathname + global.location.search + global.location.hash;
    global.location.replace('/admin-login?returnTo=' + encodeURIComponent(target));
  }

  function readJson(response) {
    return response.json().catch(function () { return {}; }).then(function (body) {
      if (!response.ok) {
        if (response.status === 401) redirectToLogin();
        throw new Error(body && body.error ? body.error : ('HTTP ' + response.status));
      }
      return body;
    });
  }

  function ensureSession() {
    if (sessionPromise) return sessionPromise;
    sessionPromise = fetch('/api/admin/auth/session', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }).then(readJson).then(function (session) {
      if (!session.authenticated || !session.csrfToken) throw new Error('Sesi admin tidak tersedia.');
      csrfToken = session.csrfToken;
      return session;
    }).catch(function (error) {
      sessionPromise = null;
      throw error;
    });
    return sessionPromise;
  }

  function headerOps(tambahan) {
    return Object.assign({ Accept: 'application/json' }, tambahan || {});
  }

  function requestOptions(opts) {
    var o = Object.assign({}, opts || {});
    var method = String(o.method || 'GET').toUpperCase();
    o.credentials = 'same-origin';
    o.cache = 'no-store';
    o.headers = headerOps(o.headers);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      o.headers['X-CSRF-Token'] = csrfToken;
    }
    return o;
  }

  function ambil(url, opts) {
    return ensureSession().then(function () {
      return fetch(url, requestOptions(opts)).then(readJson);
    });
  }

  /** Satu panel gagal tidak menghapus keadaan panel lain. */
  function ambilAman(url, opts) {
    return ambil(url, opts).then(
      function (data) { return { ok: true, data: data }; },
      function (error) { return { ok: false, error: error, url: url }; }
    );
  }

  /** Sama seperti ambil(), tetapi header Date balasan ikut dibawa. */
  function ambilDenganHeader(url, opts) {
    return ensureSession().then(function () {
      return fetch(url, requestOptions(opts)).then(function (response) {
        var date = response.headers.get('date');
        return readJson(response).then(function (data) { return { data: data, date: date }; });
      });
    });
  }

  function kirim(url, method, body) {
    var payload = body === undefined ? {} : body;
    return ambil(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  function ambilAkses() {
    return ensureSession().then(
      function (session) { return { ok: true, data: session, url: '/api/admin/auth/session' }; },
      function (error) { return { ok: false, error: error, url: '/api/admin/auth/session' }; }
    );
  }

  function logout() {
    return ensureSession().then(function () {
      return fetch('/api/admin/auth/logout', requestOptions({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }));
    }).then(function (response) {
      if (!response.ok) return readJson(response).then(function () { throw new Error('Logout gagal.'); });
      csrfToken = '';
      sessionPromise = null;
      global.location.replace('/admin-login');
    });
  }

  function pasangLogout() {
    var button = $('btnKeluar');
    if (!button) return;
    button.addEventListener('click', function () {
      button.disabled = true;
      logout().catch(function (error) {
        button.disabled = false;
        toast(error.message || 'Logout gagal.');
      });
    });
  }

  /** Waktu lokal yang mudah dibaca, tetap berdasarkan timestamp server. */
  function waktu(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return p(d.getDate()) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()] +
      ' ' + p(d.getHours()) + '.' + p(d.getMinutes());
  }

  function durasi(menit) {
    if (menit === null || menit === undefined) return 'belum ada riwayat';
    if (menit < 60) return Math.round(menit) + ' mnt';
    var hours = menit / 60;
    return (hours < 48 ? hours.toFixed(1) + ' jam' : (hours / 24).toFixed(1) + ' hari');
  }

  /** Koreksi jam dari endpoint yang memang sudah dipakai papan. */
  function koreksiJam() {
    return ambilDenganHeader('/api/admin/operations/health').then(function (result) {
      if (result.date) {
        var time = Date.parse(result.date);
        if (!isNaN(time)) global.__skewMs = time - Date.now();
      }
    }).catch(function () { /* tanpa koreksi: jam perangkat dipakai apa adanya */ });
  }

  global.OpsCore = {
    $: $, el: el, toast: toast, ambil: ambil, ambilAman: ambilAman,
    ambilDenganHeader: ambilDenganHeader, kirim: kirim, headerOps: headerOps,
    ambilAkses: ambilAkses, ensureSession: ensureSession, logout: logout,
    waktu: waktu, durasi: durasi, koreksiJam: koreksiJam,
    KATEGORI: ['data_source_unavailable', 'data_stale', 'api_performance', 'environmental_event', 'infrastructure', 'lain_lain']
  };

  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', pasangLogout);
  else pasangLogout();
})(window);
