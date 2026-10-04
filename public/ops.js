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
    if (store.lastError) {
      // Penyimpanan gagal ≠ tidak ada insiden. Spanduk menyebut sebabnya dan
      // menyatakan bahwa angka di papan tidak lengkap — bukan menyembunyikannya.
      b.className = 'banner';
      b.textContent = 'Penyimpanan ' + store.mode + ' GAGAL DIBACA: ' + store.lastError +
        (store.lastErrorAt ? ' (pada ' + store.lastErrorAt + ')' : '') +
        '. Selama pembacaan gagal, kartu Insiden/Alert/Audit di papan ini tidak dapat dipercaya sebagai keadaan penuh. ' +
        store.note;
    }
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

  function isiPilihanDiagnosa(sources) {
    var sel = $('selDiagnosa');
    if (!sel) return;
    var sebelum = sel.value;
    sel.textContent = '';
    var tanda = { DOWN: '▼', WARNING: '!', UNKNOWN: '?' };
    sources.forEach(function (s) {
      var o = el('option', null, (tanda[s.status] ? tanda[s.status] + ' ' : '') + s.name + ' (' + s.id + ')');
      o.value = s.id;
      o.className = 'opt-' + s.status;
      sel.appendChild(o);
    });
    // Yang perlu perhatian lebih dulu supaya tidak tersembunyi di daftar panjang.
    var prioritas = sources.filter(function (s) { return s.status === 'DOWN' || s.status === 'WARNING'; })[0];
    sel.value = sebelum || (prioritas ? prioritas.id : (sources[0] ? sources[0].id : ''));
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

  /**
   * Baris status akses. Yang ditulis HARUS sesuai kenyataan server: mode
   * terbuka dikatakan terbuka (jangan sampai orang menyangka sudah terkunci),
   * dan bila terkunci, peran kita disebutkan supaya tombol yang ditolak tidak
   * terasa seperti kesalahan misterius.
   */
  /** Grafik batang sederhana dari SVG (tanpa pustaka, sesuai CSP 'self'). */
  function grafikSeri(titik) {
    var W = 560, H = 120, P = 18, n = titik.length || 1;
    var maks = Math.max(1, Math.max.apply(null, titik.map(function (t) { return Math.max(t.insiden, t.alert); })));
    var lebar = (W - P * 2) / n;
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('class', 'grafik');
    svg.setAttribute('aria-label', 'Insiden dan alert per hari');
    for (var i = 0; i < n; i++) {
      var t = titik[i];
      var tinggiI = Math.round((H - P * 2) * (t.insiden / maks));
      var tinggiA = Math.round((H - P * 2) * (t.alert / maks));
      var rI = document.createElementNS(NS, 'rect');
      rI.setAttribute('x', (P + i * lebar + 1).toFixed(1));
      rI.setAttribute('width', (lebar / 2 - 2).toFixed(1));
      rI.setAttribute('y', (H - P - tinggiI).toFixed(1));
      rI.setAttribute('height', tinggiI);
      rI.setAttribute('class', 'b-insiden');
      var judul = document.createElementNS(NS, 'title');
      judul.textContent = t.tanggal + ': ' + t.insiden + ' insiden, ' + t.alert + ' alert';
      rI.appendChild(judul);
      svg.appendChild(rI);
      var rA = document.createElementNS(NS, 'rect');
      rA.setAttribute('x', (P + i * lebar + lebar / 2).toFixed(1));
      rA.setAttribute('width', (lebar / 2 - 2).toFixed(1));
      rA.setAttribute('y', (H - P - tinggiA).toFixed(1));
      rA.setAttribute('height', tinggiA);
      rA.setAttribute('class', 'b-alert');
      svg.appendChild(rA);
    }
    var garis = document.createElementNS(NS, 'line');
    garis.setAttribute('x1', P); garis.setAttribute('x2', W - P);
    garis.setAttribute('y1', H - P); garis.setAttribute('y2', H - P);
    garis.setAttribute('class', 'garis');
    svg.appendChild(garis);
    return svg;
  }

  function barisTabel(kepala, baris) {
    var wrap = el('div', 'tbl-wrap');
    var t = el('table');
    var thead = el('thead');
    var trh = el('tr');
    kepala.forEach(function (k) { trh.appendChild(el('th', null, k)); });
    thead.appendChild(trh);
    t.appendChild(thead);
    var tb = el('tbody');
    baris.forEach(function (r) {
      var tr = el('tr');
      r.forEach(function (c, i) {
        var td = el('td', i === 0 ? null : 'num', c === null || c === undefined ? '—' : String(c));
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    return wrap;
  }

  /**
   * Analitik. Aturan tampilan: bila BELUM ADA RIWAYAT sama sekali, jangan
   * menggambar grafik nol yang tampak seperti "semuanya aman" — tulis saja
   * bahwa belum ada riwayat. Nol yang sah hanya muncul bila memang ada riwayat.
   */
  function renderAnalitik(a) {
    var box = $('analitik');
    box.textContent = '';
    box.className = '';
    $('analitikJendela').textContent = 'jendela ' + a.jendela.hari + ' hari (' + a.jendela.dari + ' → ' + a.jendela.sampai + ', ' + a.jendela.zona + ')';

    var j = a.jumlah;
    box.appendChild(el('p', 'who',
      'Insiden ' + j.insiden + ' (' + j.insidenTerbuka + ' terbuka · ' + j.insidenTertutup + ' tertutup) · ' +
      'alert ' + j.alert + ' (' + j.alertAktif + ' aktif) · ' + j.aksiTercatat + ' tindakan tercatat di log audit.'));

    if (a.kosong) {
      box.appendChild(el('p', 'empty', a.catatan));
      box.appendChild(el('p', 'muted',
        'Grafik sengaja tidak digambar: deretan nol akan terbaca sebagai "tidak ada masalah", padahal yang benar ' +
        'adalah "belum ada yang tercatat". Ia akan muncul sendiri setelah ada insiden atau alert yang tersimpan.'));
      return;
    }

    box.appendChild(el('h3', null, 'Insiden & alert per hari'));
    box.appendChild(grafikSeri(a.seri));
    var legenda = el('p', 'muted');
    legenda.appendChild(el('span', 'kotak b-insiden'));
    legenda.appendChild(document.createTextNode(' insiden · '));
    legenda.appendChild(el('span', 'kotak b-alert'));
    legenda.appendChild(document.createTextNode(' alert baru · maksimum harian pada grafik: ' +
      Math.max(1, Math.max.apply(null, a.seri.map(function (t) { return Math.max(t.insiden, t.alert); }))) + '.'));
    box.appendChild(legenda);
    if (a.luarJendela.insiden || a.luarJendela.alert) {
      box.appendChild(el('p', 'muted', 'Di luar jendela ini: ' + a.luarJendela.insiden + ' insiden dan ' +
        a.luarJendela.alert + ' alert yang lebih lama (tidak ikut dihitung di grafik).'));
    }

    box.appendChild(el('h3', null, 'Per severity'));
    box.appendChild(barisTabel(['Severity', 'Total', 'Selesai', 'MTTR', 'SLA (target)', 'Catatan'],
      a.perSeverity.map(function (r) {
        return [r.severity, r.total, r.selesai, durasi(r.mttrMenit),
          r.slaPersen === null ? null : r.slaPersen + '% (' + r.targetMenit + ' mnt)', r.catatan || '—'];
      })));

    box.appendChild(el('h3', null, 'Per kategori'));
    box.appendChild(barisTabel(['Kategori', 'Total'], a.perKategori.map(function (r) { return [r.category, r.total]; })));

    box.appendChild(el('h3', null, 'Per aturan alert'));
    box.appendChild(barisTabel(['Aturan', 'Total', 'Aktif'],
      a.perAturan.map(function (r) { return [r.label + ' (' + r.ruleId + ')', r.total, r.aktif]; })));

    box.appendChild(el('h3', null, 'Sumber paling sering muncul'));
    if (!a.sumberTersibuk.length) {
      box.appendChild(el('p', 'muted', 'Belum ada alert/insiden yang menunjuk layanan tertentu.'));
    } else {
      box.appendChild(barisTabel(['Layanan', 'Alert', 'Aktif', 'Insiden', 'Terbuka'],
        a.sumberTersibuk.map(function (r) { return [r.serviceId, r.alert, r.alertAktif, r.insiden, r.insidenTerbuka]; })));
    }
    box.appendChild(el('p', 'muted', a.catatan));
  }

  /**
   * Infrastruktur. Setiap nilai membawa penanda `real`, dan nilai simulasi
   * selalu dicetak bersama lencana SIMULATED supaya tidak pernah terbaca
   * sebagai pengukuran.
   */
  function renderInfra(g) {
    var box = $('infra');
    box.textContent = '';
    box.className = '';
    box.appendChild(el('p', 'who', 'Simpul ' + g.ringkas.simpul + ' (' + g.ringkas.simpulNyata + ' memuat angka NYATA) · ' +
      'tautan ' + g.ringkas.tautanSimulasi + ' (semuanya SIMULATED) · hulu turun: ' + g.ringkas.huluTurun + '.'));
    box.appendChild(el('p', null, g.dasarTopologi));
    box.appendChild(el('p', 'muted', g.catatan));

    box.appendChild(el('h3', null, 'Simpul'));
    var wrap = el('div', 'tbl-wrap');
    var t = el('table');
    var thead = el('thead');
    var trh = el('tr');
    ['Simpul', 'Jenis', 'Data', 'Nilai'].forEach(function (k) { trh.appendChild(el('th', null, k)); });
    thead.appendChild(trh); t.appendChild(thead);
    var tb = el('tbody');
    g.simpul.forEach(function (s) {
      var tr = el('tr');
      var td1 = el('td');
      td1.appendChild(el('div', null, s.nama));
      td1.appendChild(el('div', 'muted', s.id));
      tr.appendChild(td1);
      tr.appendChild(el('td', null, s.jenis));
      var td3 = el('td');
      td3.appendChild(el('span', 'lencana ' + (s.real ? 'lencana-nyata' : 'lencana-sim'), s.real ? 'NYATA' : 'SIMULATED'));
      tr.appendChild(td3);
      var td4 = el('td');
      s.nilai.forEach(function (n) {
        var baris = el('div');
        baris.appendChild(el('span', 'muted', n.label + ': '));
        baris.appendChild(el('span', null, n.nilai === null || n.nilai === undefined ? 'tidak tersedia' : String(n.nilai) + (n.satuan || '')));
        if (!n.real) baris.appendChild(el('span', 'lencana lencana-sim', 'SIMULATED'));
        td4.appendChild(baris);
      });
      if (s.keterangan) td4.appendChild(el('div', 'muted', s.keterangan));
      tr.appendChild(td4);
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); box.appendChild(wrap);

    box.appendChild(el('h3', null, 'Tautan (SIMULATED)'));
    box.appendChild(barisTabel(['Dari → ke', 'Jenis', 'RTT perkiraan', 'Dasar (terukur)', 'Catatan'],
      g.tautan.map(function (l) {
        return [l.dari + ' → ' + l.ke, l.jenis,
          l.rttPerkiraanMs === null ? 'tidak dapat dihitung' : l.rttPerkiraanMs + ' ms',
          l.dasarMs === null ? 'belum terukur' : l.dasarMs + ' ms', l.catatan];
      })));
    box.appendChild(el('p', 'muted', 'Model: ' + g.model.id + ' — ' + g.model.catatan));
  }

  function renderAkses(a) {
    var peran = a.peranAnda;
    var teks = a.mode === 'terbuka'
      ? 'Akses: TERBUKA — belum ada token yang dikonfigurasi, jadi siapa pun yang dapat menjangkau server ini boleh mengubah data operasional.'
      : 'Akses: token aktif. Peran Anda: ' + (peran || 'belum diisi (hanya membaca)') +
        '. Menangani insiden butuh ' + a.minTulis + '; memicu evaluasi butuh ' + a.minEvaluasi + '.' +
        (a.readProtected ? ' Halaman ini pun hanya untuk peran VIEWER ke atas.' : '');
    $('aksesBaris').textContent = teks;
    // Isian token hanya relevan bila server memang memakai token. Dan bila
    // peran kita belum ada, isian itu DIBUKA sendiri: menyembunyikannya hanya
    // membuat orang buntu (tombol ditolak 401 tanpa tahu harus mengisi apa).
    var form = $('formToken');
    if (form) {
      form.hidden = a.mode === 'terbuka';
      if (a.mode !== 'terbuka' && !peran) form.open = true;
    }
  }

  /**
   * Hasil diagnosa. Aturan tampilannya: kesimpulan dulu, lalu KEYAKINAN beserta
   * artinya, lalu bukti angka, baru langkah. Pembaca harus bisa membantah
   * kesimpulannya dari bukti yang ditampilkan di halaman yang sama.
   */
  function renderDiagnosa(d) {
    var box = $('hasilDiagnosa');
    box.textContent = '';
    box.className = '';

    if (d.mode === 'armada') {
      box.appendChild(el('p', null, 'Ringkasan armada: ' + d.ringkas.total + ' layanan dipantau · ' +
        d.ringkas.turun + ' turun · ' + d.ringkas.peringatan + ' peringatan · ' +
        d.ringkas.belumTerukur + ' belum terukur · ' + d.ringkas.alertAktif + ' alert aktif.'));
      if (d.prioritas.length) {
        box.appendChild(el('p', null, 'Perlu dilihat lebih dulu: ' + d.prioritas.join(', ') + '.'));
      } else {
        box.appendChild(el('p', 'muted', 'Tidak ada layanan yang perlu diprioritaskan menurut pengukuran saat ini.'));
      }
      if (d.armada) {
        box.appendChild(el('h3', null, d.armada.judul));
        box.appendChild(el('p', null, d.armada.sebab));
        var ulA = el('ul', 'list');
        d.armada.bukti.forEach(function (b) { ulA.appendChild(el('li', null, b)); });
        box.appendChild(ulA);
        var olA = el('ol', 'steps');
        d.armada.langkah.forEach(function (l) { olA.appendChild(el('li', null, l)); });
        box.appendChild(olA);
      }
      box.appendChild(el('p', 'muted', d.catatan));
      return;
    }

    box.appendChild(el('p', 'who', 'Sasaran: ' + (d.sasaran.nama || d.sasaran.id) + ' (' + d.sasaran.id + ')' +
      (d.sasaran.kritis ? ' ★ tugas kritis' : '')));
    box.appendChild(el('h3', null, d.kesimpulan));
    box.appendChild(el('p', null, 'Kejelasan bukti: ' + d.keyakinan.tingkat + ' — ' + d.keyakinan.alasan + '. ' + d.keyakinan.arti));

    box.appendChild(el('h3', null, 'Bukti yang dipakai'));
    var ulB = el('ul', 'list');
    d.bukti.forEach(function (b) { ulB.appendChild(el('li', null, b)); });
    box.appendChild(ulB);

    if (d.alertTerkait && d.alertTerkait.length) {
      box.appendChild(el('p', 'muted', 'Alert aktif untuk layanan ini: ' + d.alertTerkait.join(', ') + '.'));
    }
    if (d.insidenTerbuka && d.insidenTerbuka.length) {
      box.appendChild(el('p', 'muted', 'Insiden terbuka: ' + d.insidenTerbuka.join(', ') + '.'));
    }

    d.dugaan.forEach(function (g) {
      box.appendChild(el('h3', null, g.judul));
      box.appendChild(el('p', null, g.sebab));
      var ol = el('ol', 'steps');
      g.langkah.forEach(function (l) { ol.appendChild(el('li', null, l)); });
      box.appendChild(ol);
    });

    if (d.runbook && d.runbook.length) {
      box.appendChild(el('p', 'muted', 'SOP terkait: ' + d.runbook.join(' · ') + '. Buka langkah lengkapnya di lembar insiden (tombol "Tandai dikerjakan" mencatat ke timeline).'));
    }
    box.appendChild(el('p', 'muted', d.dasar || 'Dihitung dari pengukuran yang tersimpan memakai aturan tetap.'));
  }

  function mintaDiagnosa(sasaran) {
    var box = $('hasilDiagnosa');
    box.className = 'empty';
    // Di Vercel, permintaan pertama ke instance yang baru hidup menjalankan
    // pengukuran sumber hulu (beranggaran sampai 8 detik). Diam selama itu
    // membuat halaman tampak rusak, jadi sebabnya ditulis.
    box.textContent = 'menghitung… bila instance ini baru hidup, sumber hulu diukur lebih dulu (sampai 8 detik).';
    return ambilAman('/api/operations/diagnose' + (sasaran ? '?' + sasaran : '')).then(function (r) {
      if (!r.ok) {
        box.className = 'empty';
        box.textContent = 'Diagnosa gagal dimuat: ' + r.error.message;
        return;
      }
      renderDiagnosa(r.data);
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
      ambilAman('/api/incidents?sort=activity'),
      ambilAman('/api/operations/metrics'),
      ambilAman('/api/runbooks'),
      ambilAman('/api/operations/audit?limit=25'),
      OpsCore.ambilAkses(),
      ambilAman('/api/operations/analytics?hari=14'),
      ambilAman('/api/operations/infra')
    ];
    var nama = ['Kesehatan layanan', 'Sumber data', 'Alert', 'Insiden', 'Metrik', 'Runbook', 'Log audit', 'Status akses', 'Analitik', 'Infrastruktur'];

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
      // Wadah tiap panel, supaya panel yang GAGAL memuat mengatakannya sendiri.
      // Sebelumnya ia tetap berbunyi "memuat…" selamanya — terbaca seolah masih
      // bekerja, padahal permintaannya sudah gagal (ditemukan di produksi
      // 4 Okt, saat penyimpanan GitHub menolak dengan 401).
      var WADAH = ['kpis', 'tbSumber', 'daftarAlert', 'daftarInsiden', 'metrik',
        'daftarRunbook', 'tbAudit', 'aksesBaris', 'analitik', 'infra'];
      function tandaiGagal(i) {
        var box = $(WADAH[i]);
        if (!box) return;
        var teks = 'Bagian ini tidak dapat dimuat saat ini (' + nama[i] +
          '). Bagian lain di papan tetap menampilkan pengukuran terakhir.';
        if (box.tagName === 'TBODY') {
          box.textContent = '';
          var tr = el('tr');
          var td = el('td', 'empty', teks);
          td.colSpan = 8;
          tr.appendChild(td);
          box.appendChild(tr);
        } else {
          box.textContent = '';
          box.appendChild(el('p', 'empty', teks));
        }
      }
      function coba(i, fn) {
        if (r[i] && r[i].ok) { try { fn(r[i].data); } catch (e) { gagal.push(nama[i] + ' (tampilan: ' + e.message + ')'); tandaiGagal(i); } }
        else { gagal.push(nama[i]); tandaiGagal(i); }
      }

      if (r[4] && r[4].ok) renderBanner(r[4].data.storage);
      coba(0, renderKesehatan);
      coba(1, function (d) { isiPilihanDiagnosa(d.sources || []); renderSumber(d); });
      coba(2, function (d) { renderAlert(d.alerts || []); });
      coba(3, function (d) { renderInsiden(d.incidents || []); });
      coba(4, function (d) { renderMetrik(d.metrics, d.storage); });
      coba(5, function (d) { renderRunbook(d.runbooks || []); });
      coba(6, renderAudit);
      coba(7, renderAkses);
      coba(8, renderAnalitik);
      coba(9, renderInfra);

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

  // --- troubleshooting berbasis bukti ---
  if ($('btnDiagnosa')) {
    $('btnDiagnosa').addEventListener('click', function () { mintaDiagnosa('service=' + encodeURIComponent($('selDiagnosa').value)); });
    $('btnDiagnosaArmada').addEventListener('click', function () { mintaDiagnosa(''); });
    $('selDiagnosa').addEventListener('change', function () {
      if ($('hasilDiagnosa').textContent.indexOf('Pilih satu sumber') === 0) return;
      mintaDiagnosa('service=' + encodeURIComponent($('selDiagnosa').value));
    });
  }

  // --- token akses ---
  var iToken = $('iToken');
  if (iToken) {
    iToken.value = OpsCore.tokenSaya();
    $('btnToken').addEventListener('click', function () {
      OpsCore.simpanToken(iToken.value);
      toast('Token disimpan di perangkat ini.');
      muatSemua();
    });
    $('btnTokenHapus').addEventListener('click', function () {
      OpsCore.simpanToken('');
      iToken.value = '';
      toast('Token dihapus dari perangkat ini.');
      muatSemua();
    });
  }
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
