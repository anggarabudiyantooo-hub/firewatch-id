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

  // Inti bersama ada di ops-core.js supaya lembar insiden (/insiden/…) memakai
  // perilaku yang persis sama: el, toast, ambil, kirim, petugasSaya, waktu, durasi.
  var el = OpsCore.el, toast = OpsCore.toast, ambil = OpsCore.ambil,
      ambilAman = OpsCore.ambilAman, ambilDenganHeader = OpsCore.ambilDenganHeader,
      kirim = OpsCore.kirim, petugasSaya = OpsCore.petugasSaya,
      waktu = OpsCore.waktu, durasi = OpsCore.durasi;

  // Jam halaman ini: berjalan tiap detik dan ikut koreksi header server.
  function jam() {
    var d = new Date(Date.now() + (window.__skewMs || 0));
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    $('jam').textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + ' WIB';
  }

  var KATEGORI = OpsCore.KATEGORI;

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
      (a.storage.persistent ? '' : ' (tidak tetap)') +
      (a.statusReason ? ' — ' + a.statusReason : '') +
      (a.warmup ? ' Diukur saat halaman ini diminta (' + Math.round(a.warmup.ms / 1000) + ' dtk).' : '') + '.';
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

  function renderAudit(d) {
    var tb = $('tbAudit');
    tb.textContent = '';
    $('auditRingkas').textContent = d.total ? d.total + ' tindakan tercatat (ditampilkan ' + d.entries.length + ' terbaru, batas ' + d.max + ')' : 'belum ada tindakan tercatat';
    if (!d.entries.length) {
      var tr0 = el('tr');
      var td0 = el('td', 'empty', 'Belum ada tindakan operasional yang tercatat. Log muncul sendiri setelah alert dievaluasi atau insiden diubah.');
      td0.colSpan = 5;
      tr0.appendChild(td0);
      tb.appendChild(tr0);
      return;
    }
    d.entries.forEach(function (e) {
      var tr = el('tr');
      var td1 = el('td', null, waktu(e.at));
      var td2 = el('td');
      td2.appendChild(el('span', 'tag', e.actor));
      var td3 = el('td', null, e.action);
      var td4 = el('td', null, e.target || '—');
      var td5 = el('td', 'muted', e.detail || '—');
      [td1, td2, td3, td4, td5].forEach(function (td) { tr.appendChild(td); });
      tb.appendChild(tr);
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
  // Seluruh isi detail (timeline, tindakan, langkah runbook) dirender oleh
  // ops-detail.js supaya halaman ini dan /insiden/… tidak pernah berbeda.
  var insidenTerbuka = null;

  function bukaInsiden(id, dorongRiwayat) {
    // Tautan dalam: /operations?insiden=INC-… membuka detail yang sama, supaya
    // tautan bisa dikirim ke rekan (bukan hanya keadaan di layar satu orang).
    if (dorongRiwayat !== false) {
      try { history.replaceState(null, '', '/operations?insiden=' + encodeURIComponent(id) + '#detailInsiden'); } catch (e) { /* tautan dalam bersifat tambahan */ }
    }
    $('detailInsiden').hidden = false;
    return OpsDetail.buka(id, {
      box: $('detailIsi'),
      gulirKe: $('detailInsiden'),
      onBerubah: muatSemua,
      tautan: function (iid) { return '/operations?insiden=' + iid; }
    }).then(function (inc) { insidenTerbuka = inc; return inc; });
  }

  // ------------------------------------------------------------------- muat
  function muatSemua() {
    // Tiap panel berdiri sendiri. Sebelumnya satu Promise.all: bila satu
    // endpoint gagal (di Vercel wajar — tiap permintaan bisa mendarat di
    // instance berbeda), SELURUH papan tampak kosong padahal data lain ada.
    // Sekarang yang gagal hanya panelnya sendiri, dan disebutkan apa adanya.
    var janji = [
      ambilDenganHeader('/api/operations/health'),
      ambilAman('/api/data-sources'),
      ambilAman('/api/alerts'),
      ambilAman('/api/incidents'),
      ambilAman('/api/operations/metrics'),
      ambilAman('/api/runbooks'),
      ambilAman('/api/operations/audit?limit=25')
    ];
    var nama = ['Kesehatan layanan', 'Sumber data', 'Alert', 'Insiden', 'Metrik', 'Runbook', 'Log audit'];

    // Kesehatan dipakai juga untuk koreksi jam (header Date) — satu permintaan
    // lebih sedikit, dan jam tetap ikut jam server.
    var janjiKesehatan = janji[0].then(
      function (h) {
        if (h.date) {
          var t = Date.parse(h.date);
          if (!isNaN(t)) window.__skewMs = t - Date.now();
        }
        return { ok: true, data: h.data };
      },
      function (e) { return { ok: false, error: e, url: '/api/operations/health' }; }
    );

    return Promise.all([janjiKesehatan].concat(janji.slice(1))).then(function (r) {
      var gagal = [];
      function coba(i, fn) {
        if (r[i] && r[i].ok) { try { fn(r[i].data); } catch (e) { gagal.push(nama[i] + ' (tampilan: ' + e.message + ')'); } }
        else gagal.push(nama[i]);
      }

      if (r[4] && r[4].ok) renderBanner(r[4].data.storage);
      coba(0, renderKesehatan);
      coba(1, renderSumber);
      coba(2, function (d) { renderAlert(d.alerts || []); });
      coba(3, function (d) { renderInsiden(d.incidents || []); });
      coba(4, function (d) { renderMetrik(d.metrics, d.storage); });
      coba(5, function (d) { renderRunbook(d.runbooks || []); });
      coba(6, renderAudit);

      var banner = $('bannerPenyimpanan');
      if (gagal.length) {
        // Jujur: sebutkan bagian mana yang tidak termuat, dan jangan biarkan
        // panel lain tampak seperti angka lengkap bila ada yang bolong.
        banner.className = 'banner';
        banner.textContent = 'PERHATIAN — ' + gagal.length + ' dari ' + nama.length +
          ' bagian tidak dapat dimuat saat ini (' + gagal.join(', ') + '). Bagian lain menampilkan ' +
          'angka sungguhan dari pengukuran terakhir; muat ulang untuk mencoba lagi.';
        banner.hidden = false;
      }
      $('catatanKaki').textContent =
        'Ambang kesegaran & SLA dapat diatur lewat environment variable (OPS_FRESH_STALE_MULT, OPS_FRESH_CRIT_MULT, ' +
        'OPS_SLOW_MS, OPS_HOTSPOT_CLUSTER, OPS_ALERT_DEDUP_MS, OPS_SLA_*_MIN). Nilai yang berlaku ditampilkan di setiap bagian.';
      return gagal;
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

  // Jam ikut server tanpa permintaan tambahan: header Date diambil dari balasan
  // /api/operations/health yang memang sudah dipanggil muatSemua().

  jam();
  setInterval(jam, 1000);

  // Bila URL membawa ?insiden=…, buka detail itu setelah daftar selesai dimuat,
  // supaya urutan tampilannya masuk akal ketika insiden itu ada di daftar.
  var diminta = null;
  try { diminta = new URLSearchParams(location.search).get('insiden'); } catch (e) { diminta = null; }

  muatSemua().then(function () { if (diminta) bukaInsiden(diminta, false); });
  setInterval(muatSemua, 60000);
})();
