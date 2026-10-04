/* Lembar insiden — perilaku halaman.
 *
 * Tugasnya sedikit saja: mengambil id insiden dari alamat, memanggil renderer
 * bersama (ops-detail.js), dan menyatakan dengan jujur bila id itu tidak ada.
 * Tidak ada logika tindakan di sini — semuanya milik satu salinan bersama.
 */
(function () {
  'use strict';

  var C = window.OpsCore;

  function idDariAlamat() {
    var bagian = location.pathname.split('/').filter(Boolean);
    // /insiden/INC-2026-00001  (bentuk baku)
    var i = bagian.indexOf('insiden');
    if (i !== -1 && bagian[i + 1]) return decodeURIComponent(bagian[i + 1]);
    // Bentuk cadangan ?id=… agar tautan lama tetap bekerja.
    try { return new URLSearchParams(location.search).get('id'); } catch (e) { return null; }
  }

  function jam() {
    var d = new Date(Date.now() + (window.__skewMs || 0));
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    var jamEl = C.$('jam');
    if (jamEl) jamEl.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + ' WIB';
  }

  var id = idDariAlamat();
  C.koreksiJam().then(jam, jam);
  setInterval(jam, 1000);

  if (!id) {
    C.$('isiInsiden').textContent = 'Alamat ini tidak memuat id insiden. Gunakan bentuk /insiden/INC-2026-00001.';
    return;
  }

  document.title = 'INSIDEN ' + id + ' — SIAGA.ID · Operations Center';

  // Mode penyimpanan dinyatakan di sini juga: pembaca lembar tautan sering kali
  // tidak pernah melihat papan operasi, dan berhak tahu apakah ini tahan lama.
  C.ambil('/api/operations/store').then(function (s) {
    if (!s || s.persistent) return;
    var b = C.$('banner');
    b.className = 'banner';
    b.textContent = 'PERHATIAN — penyimpanan SEMENTARA (' + s.mode + '). ' + s.note;
    b.hidden = false;
  }).catch(function () { /* mode penyimpanan hanya keterangan tambahan */ });

  var aksesEl = document.createElement('p');
  aksesEl.className = 'notice-inline';
  aksesEl.id = 'aksesBaris';
  C.$('kartuInsiden').parentNode.insertBefore(aksesEl, C.$('kartuInsiden'));
  C.ambilAkses().then(function (a) {
    if (!a.ok) return;
    var x = a.data;
    if (x.mode === 'terbuka') {
      aksesEl.textContent = 'Akses: TERBUKA — belum ada token yang dikonfigurasi; tindakan di halaman ini tercatat, tetapi tidak dibatasi peran.';
    } else if (!x.peranAnda) {
      aksesEl.textContent = 'Akses: token aktif, peran Anda belum diisi — halaman ini hanya dapat dibaca. Isi token akses di papan operasi untuk menangani insiden.';
    } else {
      aksesEl.textContent = 'Akses: token aktif, peran Anda ' + x.peranAnda + '.';
    }
  });

  C.$('kartuInsiden').setAttribute('aria-busy', 'true');
  window.OpsDetail.buka(id, {
    box: C.$('isiInsiden'),
    tautan: function (iid) { return '/insiden/' + iid; }
  }).then(function (inc) {
    C.$('kartuInsiden').setAttribute('aria-busy', 'false');
    C.$('h-insiden').textContent = 'Insiden ' + inc.incidentId;
  }).catch(function (e) {
    C.$('kartuInsiden').setAttribute('aria-busy', 'false');
    // "Tidak ditemukan" bukan kegagalan halaman: sampaikan apa adanya beserta
    // langkah berikutnya, jangan biarkan wadah kosong tanpa keterangan.
    C.$('isiInsiden').textContent = e.message ||
      ('Insiden ' + id + ' tidak ditemukan pada penyimpanan operasional saat ini.');
  });
})();
