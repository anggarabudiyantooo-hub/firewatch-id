/* Operations Center — detail insiden (bagian yang dipakai bersama).
 *
 * Dipakai oleh papan operasi (/operations, di dalam kartu Incident Detail) dan
 * oleh lembar insiden (/insiden/INC-…). Satu salinan logika tindakan berarti
 * tidak ada dua tempat yang bisa berbeda perilakunya.
 *
 * Prinsip yang dipegang:
 *   - Semua tindakan menulis lewat API yang sama dengan papan; tidak ada
 *     keadaan yang hanya hidup di peramban.
 *   - "Sudah dikerjakan" pada langkah runbook TIDAK disimpan sebagai centang
 *     terpisah: ia dibaca dari timeline insiden itu sendiri (catatan yang
 *     menyebut "Langkah RB-00x #n"). Karena itu centangnya tidak bisa berbeda
 *     dari riwayat — dan bila ada yang salah, riwayatnya yang salah, bukan
 *     centangnya.
 */
(function (global) {
  'use strict';

  var C = global.OpsCore;
  var el = C.el, $ = C.$;

  /** Pola catatan yang menandai satu langkah runbook sudah dikerjakan. */
  function kunciLangkah(rbId, nomor) {
    return 'Langkah ' + rbId + ' #' + nomor;
  }

  /** Baca dari timeline: langkah mana saja yang sudah ditandai dan oleh siapa. */
  function langkahSelesai(timeline, rbId) {
    var peta = {};
    (timeline || []).forEach(function (t) {
      var m = /Langkah\s+(RB-\d+)\s+#(\d+)/.exec(t.message || '');
      if (m && m[1] === rbId) {
        if (!peta[m[2]] || peta[m[2]].at < t.at) peta[m[2]] = { at: t.at, by: t.by || null };
      }
    });
    return peta;
  }

  /**
   * Buka detail satu insiden.
   *
   * opsi.box      elemen wadah (wajib)
   * opsi.onBerubah dipanggil setelah tindakan tersimpan (mis. untuk menyegarkan daftar)
   * opsi.tautan   fungsi(id) → URL yang disalin tombol "Salin tautan"
   * opsi.gulirKe  elemen yang digulirkan ke tampilan setelah render (opsional)
   */
  function buka(id, opsi) {
    var box = opsi.box;
    return C.ambil('/api/incidents/' + encodeURIComponent(id)).then(function (inc) {
      box.textContent = '';

      var head = el('div');
      head.appendChild(el('h2', null, inc.incidentId + ' — ' + inc.title));
      var tags = el('p');
      tags.appendChild(el('span', 'tag t-' + inc.severity, inc.severity));
      tags.appendChild(document.createTextNode(' '));
      tags.appendChild(el('span', 'tag t-' + inc.status, inc.status));
      tags.appendChild(document.createTextNode(' '));
      tags.appendChild(el('span', 'tag', 'eskalasi ' + (inc.escalationLevel || 0)));
      if (inc.source === 'alert-engine') tags.appendChild(el('span', 'tag', ' dari alert'));
      if (inc.status === 'CLOSED') tags.appendChild(el('span', 'tag', ' riwayat tertutup'));
      head.appendChild(tags);

      head.appendChild(el('p', 'who',
        'Kategori ' + inc.category + ' · sumber ' + inc.source + ' · petugas ' + (inc.assignedTo || 'belum ditugaskan') +
        ' · terdeteksi ' + C.waktu(inc.detectedAt) + ' · diperbarui ' + C.waktu(inc.updatedAt)));
      if (inc.description) head.appendChild(el('p', null, inc.description));
      if (inc.resolution) head.appendChild(el('p', null, 'Penyelesaian: ' + inc.resolution));
      if (inc.serviceId) head.appendChild(el('p', 'muted', 'Layanan terkait: ' + inc.serviceId));
      if (inc.alertId) head.appendChild(el('p', 'muted', 'Berasal dari alert: ' + inc.alertId));

      var aksiAtas = el('p');
      var bTautan = el('button', 'btn', 'Salin tautan');
      bTautan.type = 'button';
      bTautan.addEventListener('click', function () {
        var url = location.origin + (opsi.tautan ? opsi.tautan(inc.incidentId) : '/operations?insiden=' + inc.incidentId);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { C.toast('Tautan disalin: ' + url); }, function () { C.toast(url); });
        } else {
          C.toast(url); // tanpa izin papan klip, tautannya tetap ditampilkan
        }
      });
      aksiAtas.appendChild(bTautan);
      head.appendChild(aksiAtas);
      box.appendChild(head);

      var grid = el('div', 'grid two');

      // ---------------- kolom kiri: SOP terkait + timeline ----------------
      var kiri = el('div');
      kiri.appendChild(el('h2', null, 'Runbook terkait'));
      var boxRunbook = el('div');
      kiri.appendChild(boxRunbook);
      kiri.appendChild(el('h2', null, 'Timeline'));
      var ul = el('ul', 'tl');
      if (!inc.timeline || !inc.timeline.length) {
        ul.appendChild(el('li', 'empty', 'Belum ada riwayat tindakan pada insiden ini.'));
      } else {
        inc.timeline.forEach(function (t) {
          var li = el('li', 't-' + t.type);
          li.appendChild(el('time', null, C.waktu(t.at)));
          li.appendChild(el('span', null, t.message + (t.by ? ' (' + t.by + ')' : '')));
          ul.appendChild(li);
        });
      }
      kiri.appendChild(ul);
      grid.appendChild(kiri);

      // ---------------- kolom kanan: tindakan ----------------
      var kanan = el('div');
      kanan.appendChild(el('h2', null, 'Actions'));

      var fPetugas = el('div', 'field');
      fPetugas.appendChild(el('label', 'sr-only', 'Nama Anda'));
      var iPetugas = el('input');
      iPetugas.placeholder = 'nama Anda (ikut tercatat di timeline)';
      iPetugas.value = C.petugasSaya();
      iPetugas.maxLength = 60;
      iPetugas.addEventListener('change', function () {
        C.simpanPetugas(iPetugas.value);
        C.toast('Nama aktivitas disimpan di perangkat ini.');
      });
      fPetugas.appendChild(iPetugas);
      kanan.appendChild(fPetugas);

      function sesudah() {
        if (opsi.onBerubah) opsi.onBerubah();
        return buka(id, opsi);
      }

      function tombol(label, path, body, cls) {
        var b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
        b.type = 'button';
        b.style.marginRight = '6px';
        b.addEventListener('click', function () {
          b.disabled = true;
          C.kirim('/api/incidents/' + inc.incidentId + path, 'POST', body)
            .then(function () { C.toast('Tindakan tersimpan: ' + label.toLowerCase() + '.'); return sesudah(); })
            .catch(function (e) { b.disabled = false; C.toast(e.message); });
        });
        return b;
      }

      var bar = el('div', 'row-actions');
      var idTugas = el('input');
      idTugas.placeholder = 'tugaskan ke…';
      idTugas.maxLength = 60;
      var bTugas = el('button', 'btn', 'Tugaskan');
      bTugas.type = 'button';
      bTugas.addEventListener('click', function () {
        if (!idTugas.value.trim()) return C.toast('Isi nama penanggung jawab lebih dulu.');
        bTugas.disabled = true;
        C.kirim('/api/incidents/' + inc.incidentId + '/assign', 'POST', { assignedTo: idTugas.value })
          .then(function () { C.toast('Ditugaskan.'); return sesudah(); })
          .catch(function (e) { bTugas.disabled = false; C.toast(e.message); });
      });
      bar.appendChild(idTugas);
      bar.appendChild(bTugas);
      kanan.appendChild(bar);

      kanan.appendChild(el('div', null, ' '));
      if (inc.status === 'OPEN') kanan.appendChild(tombol('Mulai investigasi', '', { status: 'INVESTIGATING' }, 'btn-primary'));
      if (inc.status === 'INVESTIGATING' || inc.status === 'PENDING') {
        kanan.appendChild(tombol('Tandai selesai…', '/resolve',
          { resolution: prompt('Ringkas penyelesaiannya:') || 'Selesai tanpa catatan.' }, 'btn-primary'));
      }
      if (inc.status === 'RESOLVED') kanan.appendChild(tombol('Tutup insiden', '/close', {}, 'btn-primary'));
      if (inc.status === 'RESOLVED') kanan.appendChild(tombol('Buka lagi', '', { status: 'INVESTIGATING' }));
      if (inc.status !== 'CLOSED') kanan.appendChild(tombol('Eskalasi', '/escalate', { to: prompt('Eskalasi ke siapa?') || 'Tim Operasi' }));
      if (inc.status === 'INVESTIGATING') kanan.appendChild(tombol('Tunda (PENDING)', '', { status: 'PENDING' }));
      if (inc.status === 'PENDING') kanan.appendChild(tombol('Lanjutkan investigasi', '', { status: 'INVESTIGATING' }));

      var fCatatan = el('div', 'field');
      fCatatan.appendChild(el('label', null, 'Catatan investigasi'));
      var tCatatan = el('textarea');
      tCatatan.placeholder = 'mis. diperiksa: hulu mengembalikan 5xx sejak 10:30; kontak operator dihubungi.';
      fCatatan.appendChild(tCatatan);
      var bCatatan = el('button', 'btn', 'Tambah catatan');
      bCatatan.type = 'button';
      bCatatan.addEventListener('click', function () {
        if (!tCatatan.value.trim()) return C.toast('Catatan masih kosong.');
        bCatatan.disabled = true;
        C.kirim('/api/incidents/' + inc.incidentId + '/notes', 'POST', { note: tCatatan.value })
          .then(function () { C.toast('Catatan tercatat di timeline.'); return sesudah(); })
          .catch(function (e) { bCatatan.disabled = false; C.toast(e.message); });
      });
      fCatatan.appendChild(bCatatan);
      kanan.appendChild(fCatatan);

      grid.appendChild(kanan);
      box.appendChild(grid);

      // ---------------- SOP terkait: langkah + tanda sudah dikerjakan -------
      var daftar = (inc.runbooks && inc.runbooks.length) ? inc.runbooks : [];
      if (!daftar.length) {
        boxRunbook.appendChild(el('p', 'muted', 'Tidak ada runbook yang dipetakan ke kategori ' + inc.category + '.'));
      }
      daftar.forEach(function (r) {
        var d = el('details');
        d.open = true;
        var s = el('summary', null, r.id + ' — ' + r.title);
        d.appendChild(s);
        var body = el('div', 'body');
        // WAJIB ditempelkan ke <details>: tanpa baris ini, isi langkah diisi ke
        // simpul yang tidak pernah masuk dokumen — langkahnya tak terlihat
        // padahal permintaannya sukses. Ditemukan oleh work/uji_lembar.py.
        d.appendChild(body);
        boxRunbook.appendChild(d);

        C.ambil('/api/runbooks/' + r.id).then(function (full) {
          body.appendChild(el('p', null, full.summary));
          var selesai = langkahSelesai(inc.timeline, r.id);
          var ol = el('ol', 'steps');
          (full.steps || []).forEach(function (st, i) {
            var n = String(st.n !== undefined ? st.n : (st.order !== undefined ? st.order : (i + 1)));
            var li = el('li');
            var judulLangkah = el('span', 'step-do', st.do);
            li.appendChild(judulLangkah);
            if (st.check) li.appendChild(el('div', 'muted', 'Cek: ' + st.check));
            if (st.reference) li.appendChild(el('div', 'muted', 'Rujukan: ' + st.reference));

            if (selesai[n]) {
              li.classList.add('step-done');
              li.appendChild(el('div', 'step-done-note',
                'Dikerjakan ' + C.waktu(selesai[n].at) + (selesai[n].by ? ' oleh ' + selesai[n].by : ' (tanpa nama)')));
            } else if (inc.status === 'CLOSED') {
              // Insiden tertutup: langkah tidak dapat ditandai lagi. Keadaan
              // apa adanya lebih berguna daripada tombol yang akan ditolak API.
              li.appendChild(el('div', 'muted', 'Tidak ditandai dikerjakan.'));
            } else {
              var b = el('button', 'btn', 'Tandai dikerjakan');
              b.type = 'button';
              b.addEventListener('click', function () {
                b.disabled = true;
                // Catatan biasa: masuk timeline, tercatat pelakunya, ikut log audit.
                C.kirim('/api/incidents/' + inc.incidentId + '/notes', 'POST',
                  { note: kunciLangkah(r.id, n) + ' dikerjakan: ' + st.do })
                  .then(function () { C.toast('Langkah ' + r.id + ' #' + n + ' tercatat.'); return sesudah(); })
                  .catch(function (e) { b.disabled = false; C.toast(e.message); });
              });
              li.appendChild(b);
            }
            ol.appendChild(li);
          });
          body.appendChild(ol);
          if (full.escalation) body.appendChild(el('p', 'muted', 'Eskalasi: ' + full.escalation));
        }).catch(function (e) {
          body.appendChild(el('p', 'muted', 'Langkah tidak dapat dimuat: ' + e.message));
        });
      });

      if (opsi.gulirKe && opsi.gulirKe.scrollIntoView) opsi.gulirKe.scrollIntoView({ block: 'nearest' });
      return inc;
    }).catch(function (e) {
      C.toast(e.message);
      throw e;
    });
  }

  global.OpsDetail = { buka: buka, kunciLangkah: kunciLangkah, langkahSelesai: langkahSelesai };
})(window);
