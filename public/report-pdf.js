'use strict';

/**
 * Penulis PDF satu halaman tanpa dependensi.
 *
 * Mengapa menulis sendiri: laporan hanya butuh satu halaman berisi gambar
 * peta, ringkasan angka, dan narasi. Menambah pustaka PDF untuk itu berarti
 * menambah ratusan kilobita ke bundel dan satu rantai pasok baru. Format
 * yang dipakai di sini bagian paling kecil dari PDF 1.4: satu halaman,
 * dua font standar, dan gambar JPEG dengan filter DCTDecode.
 *
 * Semua teks yang masuk sudah dihitung atau disaring di tempat lain; modul
 * ini hanya menata, tidak menghasilkan klaim baru.
 */
(function (window, document) {
  if (!window || !document) return;

  var PAGE_W = 595.28;
  var PAGE_H = 841.89;
  var MARGIN = 32;
  var INNER = PAGE_W - MARGIN * 2;

  function pdfText(value) {
    var raw = String(value == null ? '' : value)
      .replace(/\u2192/g, '->')
      .replace(/\u2265/g, '>=')
      .replace(/\u2264/g, '<=')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\u2022/g, '-');
    var out = '';
    for (var i = 0; i < raw.length; i++) {
      var code = raw.charCodeAt(i);
      var ch = raw[i];
      if (ch === '(' || ch === ')' || ch === '\\') { out += '\\' + ch; continue; }
      if (code === 183) { out += '\\267'; continue; }
      if (code === 8230) { out += '\\205'; continue; }
      if (code < 32) { out += ' '; continue; }
      if (code < 127) { out += ch; continue; }
      if (code <= 255) { out += '\\' + code.toString(8).padStart(3, '0'); continue; }
      out += '?';
    }
    return out;
  }

  // Lebar glif Helvetica pendekatan: cukup untuk membungkus baris tanpa
  // menanam metrik font lengkap. Sedikit lebih lebar dari nyata, aman.
  function textWidth(text, size, bold) {
    var wide = 'MW@%&';
    var narrow = 'iljt.,:;!|\'`()[]{}-/\\ ';
    var units = 0;
    var s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (narrow.indexOf(ch) >= 0) units += 0.30;
      else if (wide.indexOf(ch) >= 0) units += 0.88;
      else if (ch >= '0' && ch <= '9') units += 0.556;
      else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) units += 0.68;
      else units += 0.53;
    }
    return units * size * (bold ? 1.04 : 1);
  }

  function wrap(text, size, bold, maxWidth) {
    var words = String(text || '').split(/\s+/);
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (textWidth(next, size, bold) > maxWidth && line) { lines.push(line); line = words[i]; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  function base64ToBytes(b64) {
    var binary = window.atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /** PNG data URL diubah ke JPEG agar bisa dipakai langsung sebagai DCTDecode. */
  function toJpeg(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          var url = canvas.toDataURL('image/jpeg', 0.9);
          resolve({ bytes: base64ToBytes(url.split(',')[1]), width: canvas.width, height: canvas.height });
        } catch (error) { reject(new Error('PDF_IMAGE_FAILED')); }
      };
      img.onerror = function () { reject(new Error('PDF_IMAGE_FAILED')); };
      img.src = dataUrl;
    });
  }

  function summaryLines(frames, english) {
    var lines = [];
    frames.forEach(function (frame, index) {
      var s = frame.structured || {};
      var view = s.view || {};
      var fire = s.fire || {};
      var air = s.air || {};
      var wind = s.wind || {};
      var b = (frame.meta && frame.meta.bounds) || view.bounds || {};
      var tag = frames.length > 1 ? (index === 0 ? (english ? 'Before' : 'Sebelum') : (english ? 'After' : 'Sesudah')) + ' - ' : '';
      lines.push(tag + (english ? 'Captured ' : 'Diambil ') + (view.capturedAtWib || frame.capturedAt || '-'));
      lines.push('BBOX ' + b.west + ',' + b.south + ' -> ' + b.east + ',' + b.north
        + '  ZOOM ' + (view.zoom != null ? view.zoom : (frame.meta && frame.meta.zoom)));
      if (fire.hotspotsInFrame != null) {
        lines.push((english ? 'Thermal detections in frame: ' : 'Deteksi panas dalam bingkai: ') + fire.hotspotsInFrame
          + (fire.highConfidenceInFrame != null ? (english ? ', high confidence: ' : ', keyakinan tinggi: ') + fire.highConfidenceInFrame : '')
          + (fire.totalFrpInFrameMw != null ? ', FRP ' + fire.totalFrpInFrameMw + ' MW' : ''));
      } else {
        lines.push(english ? 'Thermal detection data unavailable for this frame.' : 'Data deteksi panas tidak tersedia untuk bingkai ini.');
      }
      if (air.worstPointsInFrame && air.worstPointsInFrame.length) {
        var a = air.worstPointsInFrame[0];
        lines.push((english ? 'Worst modelled AQI in frame: ' : 'AQI model terburuk dalam bingkai: ') + a.aqi + ' (' + a.category + ')'
          + (a.pm25UgM3 != null ? ', PM2.5 ' + a.pm25UgM3 + ' ug/m3' : ''));
      }
      if (wind.sample) {
        lines.push((english ? 'Modelled surface wind toward ' : 'Angin permukaan model ke arah ') + wind.sample.blowingToward
          + ', ' + wind.sample.speedMs + ' m/s');
      }
      var places = (s.settlementCentersInFrame && s.settlementCentersInFrame.places) || [];
      if (places.length) {
        lines.push((english ? 'Settlement centers in frame (not an impact list): ' : 'Pusat permukiman dalam bingkai (bukan daftar terdampak): ')
          + places.map(function (p) { return p.name; }).join(', '));
      }
      var prov = fire.topProvincesInFrame || [];
      if (prov.length) {
        lines.push((english ? 'Detections by province: ' : 'Deteksi per provinsi: ')
          + prov.map(function (p) { return p.province + ' ' + p.hotspots; }).join(', '));
      }
    });
    return lines;
  }

  function contentStream(plan) {
    var ops = [];
    function text(x, y, size, bold, color, value) {
      ops.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf '
        + color[0] + ' ' + color[1] + ' ' + color[2] + ' rg '
        + x.toFixed(2) + ' ' + y.toFixed(2) + ' Td (' + pdfText(value) + ') Tj ET');
    }
    plan.texts.forEach(function (item) { text(item.x, item.y, item.size, item.bold, item.color, item.value); });
    plan.images.forEach(function (item) {
      ops.push('q ' + item.w.toFixed(2) + ' 0 0 ' + item.h.toFixed(2) + ' '
        + item.x.toFixed(2) + ' ' + item.y.toFixed(2) + ' cm /' + item.name + ' Do Q');
    });
    plan.rules.forEach(function (item) {
      ops.push(item.color[0] + ' ' + item.color[1] + ' ' + item.color[2] + ' RG 0.6 w '
        + item.x.toFixed(2) + ' ' + item.y.toFixed(2) + ' m '
        + (item.x + item.w).toFixed(2) + ' ' + item.y.toFixed(2) + ' l S');
    });
    return ops.join('\n');
  }

  function assemble(objects, rootRef) {
    var chunks = [];
    var length = 0;
    function push(str) { chunks.push(str); length += str.length; }
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    var offsets = [];
    objects.forEach(function (obj, index) {
      offsets.push(length);
      push((index + 1) + ' 0 obj\n');
      if (obj.stream) {
        push(obj.head + '\nstream\n');
        push(obj.stream);
        push('\nendstream\nendobj\n');
      } else {
        push(obj.head + '\nendobj\n');
      }
    });
    var xrefStart = length;
    push('xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n');
    offsets.forEach(function (off) { push(String(off).padStart(10, '0') + ' 00000 n \n'); });
    push('trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + rootRef + ' >>\nstartxref\n' + xrefStart + '\n%%EOF\n');
    var all = chunks.join('');
    var bytes = new Uint8Array(all.length);
    for (var i = 0; i < all.length; i++) bytes[i] = all.charCodeAt(i) & 0xff;
    return bytes;
  }

  /**
   * Menyusun PDF satu halaman. Bila teks melebihi halaman, sisanya
   * dipotong dan pemotongan itu ditulis, bukan disembunyikan.
   */
  async function build(payload) {
    var frames = (payload && payload.frames || []).slice(0, 2);
    if (!frames.length) throw new Error('PDF_NO_FRAMES');
    var english = payload && payload.language === 'en';
    var images = [];
    for (var i = 0; i < frames.length; i++) images.push(await toJpeg(frames[i].dataUrl));

    var texts = [];
    var imageOps = [];
    var rules = [];
    var dark = [0.09, 0.10, 0.12];
    var muted = [0.42, 0.45, 0.49];
    var warn = [0.72, 0.42, 0.13];
    var y = PAGE_H - MARGIN;

    texts.push({ x: MARGIN, y: y - 12, size: 15, bold: true, color: dark, value: 'SIAGA.ID' });
    texts.push({ x: MARGIN + 78, y: y - 12, size: 9.5, bold: false, color: muted,
      value: english ? 'Map snapshot report - not an official warning' : 'Laporan tangkapan peta - bukan peringatan resmi' });
    y -= 22;
    rules.push({ x: MARGIN, y: y, w: INNER, color: [0.8, 0.8, 0.82] });
    y -= 12;

    var maxImgH = frames.length > 1 ? 190 : 300;
    var slotW = frames.length > 1 ? (INNER - 10) / 2 : INNER;
    var tallest = 0;
    images.forEach(function (img, index) {
      var scale = Math.min(slotW / img.width, maxImgH / img.height);
      var w = img.width * scale;
      var h = img.height * scale;
      var x = MARGIN + index * (slotW + 10);
      imageOps.push({ name: 'Im' + index, x: x, y: y - h, w: w, h: h });
      tallest = Math.max(tallest, h);
    });
    y -= tallest + 8;

    if (frames.length > 1) {
      texts.push({ x: MARGIN, y: y, size: 8, bold: true, color: muted, value: english ? 'BEFORE' : 'SEBELUM' });
      texts.push({ x: MARGIN + slotW + 10, y: y, size: 8, bold: true, color: muted, value: english ? 'AFTER' : 'SESUDAH' });
      y -= 12;
    }

    function heading(label) {
      texts.push({ x: MARGIN, y: y - 9, size: 10, bold: true, color: dark, value: label });
      y -= 16;
    }
    function paragraph(value, size, color, maxLines) {
      var lines = wrap(value, size, false, INNER);
      var limit = maxLines || lines.length;
      var shown = lines.slice(0, limit);
      shown.forEach(function (line) {
        texts.push({ x: MARGIN, y: y - size, size: size, bold: false, color: color, value: line });
        y -= size + 2.4;
      });
      if (lines.length > shown.length) {
        texts.push({ x: MARGIN, y: y - size, size: 7.5, bold: false, color: warn,
          value: english ? '(truncated to keep this report on one page)' : '(dipotong agar laporan tetap satu halaman)' });
        y -= size + 2.4;
      }
    }

    heading(english ? 'Figures computed by code' : 'Angka dihitung oleh kode');
    var lines = summaryLines(frames, english);
    var budget = Math.max(4, Math.floor((y - 250) / 11));
    lines.slice(0, budget).forEach(function (line) { paragraph(line, 8.2, dark, 2); });
    if (lines.length > budget) {
      texts.push({ x: MARGIN, y: y - 8, size: 7.5, bold: false, color: warn,
        value: english ? '(more figures in the interactive dashboard)' : '(angka lain tersedia di dashboard interaktif)' });
      y -= 11;
    }

    y -= 4;
    var narrative = frames[frames.length - 1].narrative || '';
    heading(english ? 'AI narrative' : 'Narasi AI');
    var provider = frames[frames.length - 1].narrativeProvider || '';
    texts.push({ x: MARGIN, y: y - 7.5, size: 7.5, bold: false, color: warn,
      value: provider === 'local-fallback'
        ? (english ? 'Assembled by code from data because Muse Spark was unavailable; not an official warning.'
          : 'Disusun kode dari data karena Muse Spark tidak tersedia; bukan peringatan resmi.')
        : (english ? 'AI narrative generated from data and the map image; not an official warning.'
          : 'Narasi AI dibuat dari data dan gambar peta; bukan peringatan resmi.') });
    y -= 12;
    if (narrative) {
      var room = Math.max(3, Math.floor((y - 52) / 10.6));
      narrative.split('\n').forEach(function (line) {
        if (!line.trim() || room <= 0) return;
        var isHeading = line.trim().length < 42 && !/[.!]$/.test(line.trim());
        if (isHeading) {
          texts.push({ x: MARGIN, y: y - 8.6, size: 8.6, bold: true, color: dark, value: line.trim() });
          y -= 11; room -= 1;
        } else {
          var wrapped = wrap(line.trim(), 8.4, false, INNER);
          wrapped.slice(0, room).forEach(function (wline) {
            texts.push({ x: MARGIN, y: y - 8.4, size: 8.4, bold: false, color: dark, value: wline });
            y -= 10.6; room -= 1;
          });
        }
      });
    } else {
      paragraph(english ? 'No AI narrative was requested for this snapshot.' : 'Tidak ada narasi AI yang diminta untuk tangkapan ini.', 8.4, muted, 2);
    }

    // Ruang sisa diisi keterbatasan dan sumber, bukan dibiarkan kosong:
    // laporan satu halaman tetap harus menyebut apa yang tidak diketahui.
    var lastStructured = frames[frames.length - 1].structured || {};
    var limitations = Array.isArray(lastStructured.limitations) ? lastStructured.limitations : [];
    if (limitations.length && y > 150) {
      y -= 6;
      heading(english ? 'Limitations' : 'Keterbatasan');
      limitations.slice(0, 4).forEach(function (item) {
        if (y < 70) return;
        paragraph('- ' + item, 8.2, muted, 2);
      });
    }
    if (y > 110) {
      y -= 6;
      heading(english ? 'Data sources' : 'Sumber data');
      paragraph('NASA FIRMS (thermal detections), NOAA GFS (wind), Open-Meteo / CAMS (air quality model), PVMBG MAGMA (volcano status), Esri (basemap).', 8.2, muted, 3);
      paragraph(english
        ? 'Full methodology and source links: firewatch-id.vercel.app/tentang-data'
        : 'Metodologi lengkap dan tautan sumber: firewatch-id.vercel.app/tentang-data', 8.2, muted, 2);
    }

    var attribution = (frames[frames.length - 1].meta && frames[frames.length - 1].meta.attribution) || '';
    var footerLines = wrap(attribution, 7, false, INNER).slice(0, 2);
    footerLines.forEach(function (line, index) {
      texts.push({ x: MARGIN, y: 40 - index * 9, size: 7, bold: false, color: muted, value: line });
    });
    rules.push({ x: MARGIN, y: 48, w: INNER, color: [0.85, 0.85, 0.87] });
    texts.push({ x: MARGIN, y: 22, size: 7.6, bold: true, color: warn,
      value: english ? 'Public data. Indications, not measurements. Not an official warning. Emergency: 112.'
        : 'Data publik. Indikasi, bukan pengukuran. Bukan peringatan resmi. Darurat: 112.' });

    var content = contentStream({ texts: texts, images: imageOps, rules: rules });
    var xobjectRefs = images.map(function (_img, index) { return '/Im' + index + ' ' + (7 + index) + ' 0 R'; }).join(' ');
    var objects = [
      { head: '<< /Type /Catalog /Pages 2 0 R >>' },
      { head: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
      { head: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] '
        + '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << ' + xobjectRefs + ' >> >> /Contents 4 0 R >>' },
      { head: '<< /Length ' + content.length + ' >>', stream: content },
      { head: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' },
      { head: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>' }
    ];
    images.forEach(function (img) {
      var head = '<< /Type /XObject /Subtype /Image /Width ' + img.width + ' /Height ' + img.height
        + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.bytes.length + ' >>';
      var binary = '';
      for (var b = 0; b < img.bytes.length; b++) binary += String.fromCharCode(img.bytes[b]);
      objects.push({ head: head, stream: binary });
    });

    var bytes = assemble(objects, '1 0 R');
    return new window.Blob([bytes], { type: 'application/pdf' });
  }

  function download(blob, filename) {
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'siaga-laporan-peta.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { window.URL.revokeObjectURL(url); }, 4000);
  }

  window.ReportPdf = { build: build, download: download, PAGE_W: PAGE_W, PAGE_H: PAGE_H };
})(window, document);
