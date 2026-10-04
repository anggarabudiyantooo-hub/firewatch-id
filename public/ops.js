/* Operations Center — perilaku halaman.
 *
 * Ditulis gaya ES5 seperti dashboard (tanpa pembangun, tanpa kerangka kerja)
 * dan sengaja sederhana: satu berkas, tanpa ketergantungan jaringan selain
 * API aplikasi sendiri. Semua angka yang tampil berasal dari balasan API;
 * yang tidak ada ditulis "belum ada riwayat"/"belum terukur".
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, teks) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (teks !== undefined && teks !== null) e.textContent = teks;
    return e;
  }

  function toast(msg) {
    var t = $('toast');
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

  function kirim(url, metode, body) {
    var actor = petugasSaya();
    return ambil(url, {
      method: metode,
      headers: Object.assign({ 'Content-Type': 'application/json' },
        actor ? { 'x-ops-actor': actor } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
  }

  function petugasSaya() {
    try { return localStorage.getItem('ops_actor') || ''; } catch (e) { return ''; }
  }

  function jam() {
    var d = new Date(Date.now() + (window.__skewMs || 0));
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    $('jam').textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + ' WIB';
  }

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

  var KATEGORI = ['data_source_unavailable', 'data_stale', 'api_performance', 'environmental_event', 'infrastructure', 'lain_lain'];

  // ---------------------------------------------------------------- render
  function renderBanner(store) {
    var b = $('bannerPenyimpanan');
    if (!store) { b.hidden = true; return; }
    if (store.persistent) {
      b.className = 'banner ok';
      b.textContent = 'Penyimpanan operasional: ' + store.mode + '. ' + store.note;
    } else {
      b.className = 'banner';
      b.textContent = 'PERHATIAN — penyimpanan SEMENTARA (' + store.mode + '). ' + store.note;
    }
    if (store.lastError) b.textContent += ' Galat penyimpanan terakhir: ' + store.lastError;
    b.hidden = false;
  }

  function renderKesehatan(h) {
    var s = h.summary;
    var kpi = [
      ['total', s.total, 'layanan dipantau'],
      ['healthy', s.healthy, 'sehat'],
      ['warning', s.warning, 'peringatan'],
      ['down', s.down, 'tidak tersedia'],
      ['unknown', s.unknown, 'belum diketahui']
    ];
    var box = $('kpis');
    box.textContent = '';
    kpi.forEach(function (k) {
      var c = el('div', 'kpi');
      var b = el('b', 't-' + k[1] + ' ' + (k[0] === 'down' && k[1] ? 't-DOWN' : ''), String(k[1]));
      c.appendChild(b);
      c.appendChild(el('span', null, k[2]));
      box.appendChild(c);
    });
    $('kesehatanWaktu').textContent = 'diperiksa ' + waktu(h.checkedAt);
    var a = h.application;
    $('keteranganAplikasi').textContent =
      'Aplikasi: ' + a.status + ' · hidup ' + Math.round(a.uptimeSeconds / 60) + ' menit · Node ' + a.nodeVersion +
      ' · penjadwal: ' + a.schedulerMode + ' · penyimpanan: ' + a.storage.mode +
      (a.storage.persistent ? '' : ' (tidak tetap)') + '.';
  }

  function renderSumber(d) {
    var tb = $('tbSumber');
    tb.textContent = '';
    $('ambangKesegaran').textContent = 'STALE > ' + d.thresholds.staleMult + '× interval · CRITICAL > ' + d.thresholds.critMult + '× interval';
    d.sources.forEach(function (s) {
      var tr = el('tr');
      var td1 = el('td');
      td1.appendChild(el('div', null, s.name + (s.critical ? ' ★' : '')));
      if (s.endpoint) td1.appendChild(el('div', 'muted', s.endpoint));
      if (s.backoff) td1.appendChild(el('div', 'muted', 'dijeda 30 mnt agar sumber tak dihujani'));
      if (s.errorNote) td1.appendChild(el('div', 'muted', 'Penyebab: ' + s.errorNote));

      var td2 = el('td');
      td2.appendChild(el('span', 'tag t-' + s.status, s.status));

      var td3 = el('td');
      var fr = s.freshness || {};
      td3.appendChild(el('span', 'tag t-' + (fr.status || 'UNKNOWN'), fr.status || 'UNKNOWN'));
      if (fr.ratio) td3.appendChild(el('div', 'muted mono', fr.ratio + '× interval'));
      else if (fr.reason) td3.appendChild(el('div', 'muted', fr.reason));

      var td4 = el('td', 'num');
      td4.textContent = s.responseTime != null ? s.responseTime + ' ms' : 'belum terukur';
      var td5 = el('td', 'num');
      td5.textContent = waktu(s.lastSuccessfulAt);
      if (s.lastCheckedAt) td5.appendChild(el('div', 'muted', 'dicoba ' + waktu(s.lastCheckedAt)));
      var td6 = el('td', 'num');
      td6.textContent = s.errorCount === 0 ? '0' : String(s.errorCount);
      if (s.consecutiveFails) td6.appendChild(el('div', 'muted', s.consecutiveFails + '× berturut'));

      [td1, td2, td3, td4, td5, td6].forEach(function (td) { tr.appendChild(td); });
      tb.appendChild(tr);
    });
    if (!d.sources.length) {
      var tr = el('tr');
      var td = el('td', 'empty', 'Tidak ada sumber terdaftar.');
      td.colSpan = 6;
      tr.appendChild(td);
      tb.appendChild(tr);
    }
  }

  function renderMetrik(m, storage) {
    var box = $('metrik');
    box.textContent = '';
    if (!m.total) {
      box.className = 'empty';
      box.textContent = 'Belum ada riwayat insiden. Metrik (MTTR, SLA) akan muncul setelah ada insiden nyata — sistem tidak menampilkan angka contoh.';
      return;
    }
    box.className = '';
    var baris = [
      ['Insiden terbuka', m.terbuka],
      ['Selesai', m.selesai],
      ['Ditutup', m.ditutup],
      ['Kritis terbuka', m.kritisTerbuka],
      ['Dieskalasi', m.dieskalasi],
      ['MTTR', durasi(m.mttrMenit)],
      ['SLA terpenuhi', m.slaPersen === null ? 'belum ada riwayat' : (m.slaPersen + '% (' + m.slaTerpenuhi + '/' + m.slaTotal + ')')]
    ];
    var ul = el('ul', 'list');
    baris.forEach(function (b) {
      var li = el('li');
      li.appendChild(el('span', 'who', b[0]));
      li.appendChild(el('b', 'mono', String(b[1])));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    var cat = el('p', 'notice-inline',
      'Target SLA per severity: CRITICAL ' + m.slaTargetMenit.CRITICAL + ' mnt · HIGH ' + m.slaTargetMenit.HIGH +
      ' mnt · MEDIUM ' + m.slaTargetMenit.MEDIUM + ' mnt · LOW ' + m.slaTargetMenit.LOW + ' mnt.');
    box.appendChild(cat);
  }

  function renderAlert(list) {
    var ul = $('daftarAlert');
    ul.textContent = '';
    var aktif = list.filter(function (a) { return a.status === 'ACTIVE'; });
    $('alertRingkas').textContent = aktif.length + ' aktif dari ' + list.length + ' tersimpan';
    if (!list.length) {
      ul.appendChild(el('li', 'empty', 'Belum ada alert. Tekan “Nilai ulang alert” untuk mengevaluasi aturan terhadap keadaan sekarang.'));
      return;
    }
    list.slice(0, 12).forEach(function (a) {
      var li = el('li');
      var kiri = el('div');
      var jdl = el('div');
      jdl.appendChild(el('span', 'tag t-' + a.severity, a.severity));
      jdl.appendChild(document.createTextNode(' '));
      jdl.appendChild(el('b', null, a.title));
      kiri.appendChild(jdl);
      var det = el('div', 'who', (a.detail || []).join(' '));
      kiri.appendChild(det);
      var meta = el('div', 'muted', a.id + ' · ' + a.ruleId + ' · terdeteksi ' + waktu(a.detectedAt) +
        (a.resolvedAt ? ' · selesai ' + waktu(a.resolvedAt) : '') +
        (a.incidentId ? ' · insiden ' + a.incidentId : ''));
      kiri.appendChild(meta);
      if (a.runbooks && a.runbooks.length) {
        kiri.appendChild(el('div', 'muted', 'SOP terkait: ' + a.runbooks.map(function (r) { return r.id + ' ' + r.title; }).join(' · ')));
      }
      li.appendChild(kiri);

      var aksi = el('div', 'row-actions');
      if (a.status === 'ACTIVE' && !a.incidentId) {
        var b = el('button', 'btn btn-primary', 'Buat insiden');
        b.type = 'button';
        b.addEventListener('click', function () {
          b.disabled = true;
          kirim('/api/alerts/' + a.id + '/incident', 'POST')
            .then(function (r) {
              toast('Insiden ' + r.incident.incidentId + (r.created ? ' dibuat' : ' sudah ada') + '.');
              muatSemua();
            })
            .catch(function (e) { b.disabled = false; toast(e.message); });
        });
        aksi.appendChild(b);
      } else if (a.incidentId) {
        var b2 = el('button', 'btn', 'Lihat insiden');
        b2.type = 'button';
        b2.addEventListener('click', function () { bukaInsiden(a.incidentId); });
        aksi.appendChild(b2);
      }
      li.appendChild(aksi);
      ul.appendChild(li);
    });
  }

  function renderInsiden(list) {
    var ul = $('daftarInsiden');
    ul.textContent = '';
    if (!list.length) {
      ul.appendChild(el('li', 'empty', 'Belum ada insiden. Insiden dapat dibuat dari alert di atas atau secara manual di bawah.'));
      return;
    }
    list.slice(0, 12).forEach(function (i) {
      var li = el('li');
      var kiri = el('div');
      var jdl = el('div');
      jdl.appendChild(el('span', 'tag t-' + i.severity, i.severity));
      jdl.appendChild(document.createTextNode(' '));
      jdl.appendChild(el('span', 'tag t-' + i.status, i.status));
      jdl.appendChild(document.createTextNode(' '));
      jdl.appendChild(el('b', null, i.incidentId + ' — ' + i.title));
      kiri.appendChild(jdl);
      kiri.appendChild(el('div', 'muted', 'kategori ' + i.category + ' · sumber ' + i.source +
        (i.assignedTo ? ' · petugas ' + i.assignedTo : ' · belum ditugaskan') +
        ' · tingkat ' + (i.escalationLevel || 0) + ' · dibuka ' + waktu(i.detectedAt)));
      li.appendChild(kiri);
      var b = el('button', 'btn', 'Buka');
      b.type = 'button';
      b.addEventListener('click', function () { bukaInsiden(i.incidentId); });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function renderRunbook(list) {
    var box = $('daftarRunbook');
    box.textContent = '';
    box.className = '';
    list.forEach(function (r) {
      var d = el('details');
      var s = el('summary', null, r.id + ' — ' + r.title);
      d.appendChild(s);
      var body = el('div', 'body');
      body.appendChild(el('p', null, r.summary));
      body.appendChild(el('p', 'muted', 'Langkah: ' + r.stepCount + ' · kategori: ' + r.categories.join(', ') +
        ' · ditinjau ' + r.lastReviewed));
      body.appendChild(el('p', 'muted', 'Klik runbook untuk memuat langkah lengkapnya.'));
      var b = el('button', 'btn', 'Muat langkah');
      b.type = 'button';
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ambil('/api/runbooks/' + r.id).then(function (full) {
          var ol = el('ol', 'steps');
          full.steps.forEach(function (st) { ol.appendChild(el('li', null, st.do)); });
          body.textContent = '';
          body.appendChild(el('p', null, full.summary));
          body.appendChild(ol);
          body.appendChild(el('p', 'muted', 'Eskalasi: ' + full.escalation));
        }).catch(function (e) { toast(e.message); });
      });
      body.appendChild(b);
      d.appendChild(body);
      box.appendChild(d);
    });
  }

  // --------------------------------------------------------- detail insiden
  var insidenTerbuka = null;

  function bukaInsiden(id) {
    ambil('/api/incidents/' + id).then(function (inc) {
      insidenTerbuka = inc;
      var box = $('detailIsi');
      box.textContent = '';
      $('detailInsiden').hidden = false;

      var head = el('div');
      head.appendChild(el('h2', null, inc.incidentId + ' — ' + inc.title));
      var tags = el('p');
      tags.appendChild(el('span', 'tag t-' + inc.severity, inc.severity));
      tags.appendChild(document.createTextNode(' '));
      tags.appendChild(el('span', 'tag t-' + inc.status, inc.status));
      tags.appendChild(document.createTextNode(' '));
      tags.appendChild(el('span', 'tag', 'eskalasi ' + (inc.escalationLevel || 0)));
      head.appendChild(tags);
      var ringkas = el('p', 'who',
        'Kategori ' + inc.category + ' · sumber ' + inc.source + ' · petugas ' + (inc.assignedTo || 'belum ditugaskan') +
        ' · terdeteksi ' + waktu(inc.detectedAt) + ' · diperbarui ' + waktu(inc.updatedAt));
      head.appendChild(ringkas);
      if (inc.description) head.appendChild(el('p', null, inc.description));
      if (inc.resolution) head.appendChild(el('p', null, 'Penyelesaian: ' + inc.resolution));
      if (inc.serviceId) head.appendChild(el('p', 'muted', 'Layanan terkait: ' + inc.serviceId));
      if (inc.runbooks && inc.runbooks.length) {
        head.appendChild(el('p', 'muted', 'Runbook terkait: ' + inc.runbooks.map(function (r) { return r.id + ' ' + r.title; }).join(' · ')));
      }
      box.appendChild(head);

      var grid = el('div', 'grid two');

      // timeline
      var cTl = el('div');
      cTl.appendChild(el('h2', null, 'Timeline'));
      var ul = el('ul', 'tl');
      inc.timeline.forEach(function (t) {
        var li = el('li', 't-' + t.type);
        li.appendChild(el('time', null, waktu(t.at)));
        li.appendChild(el('span', null, t.message + (t.by ? ' (' + t.by + ')' : '')));
        ul.appendChild(li);
      });
      cTl.appendChild(ul);
      grid.appendChild(cTl);

      // aksi
      var cA = el('div');
      cA.appendChild(el('h2', null, 'Actions'));

      var petugas = petugasSaya();
      var fPetugas = el('div', 'field');
      fPetugas.appendChild(el('label', 'sr-only', 'Nama Anda'));
      var iPetugas = el('input');
      iPetugas.placeholder = 'nama Anda (ikut tercatat di timeline)';
      iPetugas.value = petugas;
      iPetugas.maxLength = 60;
      iPetugas.addEventListener('change', function () {
        try { localStorage.setItem('ops_actor', iPetugas.value.slice(0, 60)); } catch (e) { /* diabaikan */ }
        toast('Nama aktivitas disimpan di perangkat ini.');
      });
      fPetugas.appendChild(iPetugas);
      cA.appendChild(fPetugas);

      function aksi(label, path, body, cls) {
        var b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
        b.type = 'button';
        b.style.marginRight = '6px';
        b.addEventListener('click', function () {
          b.disabled = true;
          kirim('/api/incidents/' + inc.incidentId + path, 'POST', body)
            .then(function (r) {
              toast('Tindakan tersimpan: ' + label.toLowerCase() + '.');
              bukaInsiden(inc.incidentId);
              muatSemua();
              return r;
            })
            .catch(function (e) { b.disabled = false; toast(e.message); });
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
        if (!idTugas.value.trim()) return toast('Isi nama penanggung jawab lebih dulu.');
        bTugas.disabled = true;
        kirim('/api/incidents/' + inc.incidentId + '/assign', 'POST', { assignedTo: idTugas.value })
          .then(function () { toast('Ditugaskan.'); bukaInsiden(inc.incidentId); })
          .catch(function (e) { bTugas.disabled = false; toast(e.message); });
      });
      bar.appendChild(idTugas);
      bar.appendChild(bTugas);
      cA.appendChild(bar);

      cA.appendChild(el('div', null, ' '));
      if (inc.status === 'OPEN') cA.appendChild(aksi('Mulai investigasi', '', { status: 'INVESTIGATING' }, 'btn-primary'));
      if (inc.status === 'INVESTIGATING' || inc.status === 'PENDING') {
        cA.appendChild(aksi('Tandai selesai…', '/resolve', { resolution: prompt('Ringkas penyelesaiannya:') || 'Selesai tanpa catatan.' }, 'btn-primary'));
      }
      if (inc.status === 'RESOLVED') cA.appendChild(aksi('Tutup insiden', '/close', {}, 'btn-primary'));
      if (inc.status === 'RESOLVED') cA.appendChild(aksi('Buka lagi', '', { status: 'INVESTIGATING' }));
      if (inc.status !== 'CLOSED') cA.appendChild(aksi('Eskalasi', '/escalate', { to: prompt('Eskalasi ke siapa?') || 'Tim Operasi' }));
      if (inc.status === 'INVESTIGATING') cA.appendChild(aksi('Tunda (PENDING)', '', { status: 'PENDING' }));
      if (inc.status === 'PENDING') cA.appendChild(aksi('Lanjutkan investigasi', '', { status: 'INVESTIGATING' }));

      var fCatatan = el('div', 'field');
      fCatatan.appendChild(el('label', null, 'Catatan investigasi'));
      var tCatatan = el('textarea');
      tCatatan.placeholder = 'mis. diperiksa: hulu mengembalikan 5xx sejak 10:30; kontak operator dihubungi.';
      fCatatan.appendChild(tCatatan);
      var bCatatan = el('button', 'btn', 'Tambah catatan');
      bCatatan.type = 'button';
      bCatatan.addEventListener('click', function () {
        if (!tCatatan.value.trim()) return toast('Catatan masih kosong.');
        bCatatan.disabled = true;
        kirim('/api/incidents/' + inc.incidentId + '/notes', 'POST', { note: tCatatan.value })
          .then(function () { toast('Catatan tercatat di timeline.'); bukaInsiden(inc.incidentId); })
          .catch(function (e) { bCatatan.disabled = false; toast(e.message); });
      });
      fCatatan.appendChild(bCatatan);
      cA.appendChild(fCatatan);

      grid.appendChild(cA);
      box.appendChild(grid);
      $('detailInsiden').scrollIntoView({ block: 'nearest' });
    }).catch(function (e) { toast(e.message); });
  }

  // ------------------------------------------------------------------- muat
  function muatSemua() {
    Promise.all([
      ambil('/api/operations/health'),
      ambil('/api/data-sources'),
      ambil('/api/alerts'),
      ambil('/api/incidents'),
      ambil('/api/operations/metrics'),
      ambil('/api/runbooks')
    ]).then(function (r) {
      renderBanner(r[4].storage);
      renderKesehatan(r[0]);
      renderSumber(r[1]);
      renderAlert(r[2].alerts || []);
      renderInsiden(r[3].incidents || []);
      renderMetrik(r[4].metrics, r[4].storage);
      renderRunbook(r[5].runbooks || []);
      $('catatanKaki').textContent =
        'Ambang kesegaran & SLA dapat diatur lewat environment variable (OPS_FRESH_STALE_MULT, OPS_FRESH_CRIT_MULT, ' +
        'OPS_SLOW_MS, OPS_HOTSPOT_CLUSTER, OPS_ALERT_DEDUP_MS, OPS_SLA_*_MIN). Nilai yang berlaku ditampilkan di setiap bagian.';
    }).catch(function (e) {
      $('bannerPenyimpanan').className = 'banner';
      $('bannerPenyimpanan').textContent = 'Gagal memuat data operasional: ' + e.message;
      $('bannerPenyimpanan').hidden = false;
    });
  }

  function nilai() {
    var b = $('btnNilai');
    b.disabled = true;
    kirim('/api/operations/evaluate', 'POST')
      .then(function (r) {
        toast('Evaluasi selesai: ' + r.baru.length + ' alert baru, ' + r.ditutup.length + ' ditutup.');
        muatSemua();
      })
      .catch(function (e) { toast(e.message); })
      .then(function () { b.disabled = false; setTimeout(function () { b.disabled = false; }, 10); });
  }

  // ------------------------------------------------------------- awal mula
  var sel = $('iKategori');
  KATEGORI.forEach(function (k) {
    var o = document.createElement('option');
    o.textContent = k;
    sel.appendChild(o);
  });

  $('btnBuat').addEventListener('click', function () {
    var judul = $('iJudul').value.trim();
    if (!judul) return toast('Judul insiden wajib diisi.');
    var b = $('btnBuat');
    b.disabled = true;
    kirim('/api/incidents', 'POST', {
      title: judul,
      description: $('iDeskripsi').value,
      category: sel.value,
      severity: $('iSeverity').value,
      assignedTo: $('iPetugas').value || null,
      source: 'manual'
    }).then(function (inc) {
      toast('Insiden ' + inc.incidentId + ' dibuat.');
      $('iJudul').value = ''; $('iDeskripsi').value = '';
      b.disabled = false;
      muatSemua();
      bukaInsiden(inc.incidentId);
    }).catch(function (e) { b.disabled = false; toast(e.message); });
  });

  $('btnMuat').addEventListener('click', function () { muatSemua(); toast('Data dimuat ulang.'); });
  $('btnNilai').addEventListener('click', nilai);

  // Jam: pakai jam server dari header Date bila tersedia, agar halaman ini
  // tidak ikut meleset ketika jam perangkat salah.
  fetch('/api/operations/health', { headers: { Accept: 'application/json' } }).then(function (r) {
    var d = r.headers.get('date');
    if (d) {
      var t = Date.parse(d);
      if (!isNaN(t)) window.__skewMs = t - Date.now();
    }
  }).catch(function () { /* tanpa koreksi: jam perangkat dipakai apa adanya */ });

  jam();
  setInterval(jam, 1000);
  muatSemua();
  setInterval(muatSemua, 60000);
})();
