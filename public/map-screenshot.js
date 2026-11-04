'use strict';

/**
 * Penangkap layar peta tanpa dependensi eksternal.
 *
 * Mengapa bukan html-to-image: peta Leaflet mencampur <img> petak, <canvas>
 * raster asap, dan <svg> vektor di beberapa pane bertumpuk. Menyusun ulang
 * ketiga jenis itu secara manual memberi kontrol urutan z, opacity, dan
 * posisi yang tepat, serta membuat kegagalan CORS bisa dilaporkan jujur
 * alih-alih menghasilkan gambar kosong.
 *
 * Semua petak dipakai dengan crossOrigin=anonymous. Bila ada sumber yang
 * menolak CORS, kanvas menjadi tainted dan toDataURL melempar SecurityError;
 * kegagalan itu dilaporkan, tidak ditutupi.
 */
(function (window, document) {
  if (!window || !document) return;

  var HEADER_H = 46;
  var FOOTER_H = 108;
  var MAX_SCALE = 2;
  var FONT_DATA = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var FONT_PROSE = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

  // Warna legenda per sakelar lapisan. Dipakai agar legenda ikut tercetak
  // di dalam gambar, bukan hanya daftar nama lapisan.
  var LEGEND = {
    lyFire: { color: '#ff6b3d', id: 'Titik api (FIRMS)', en: 'Hotspots (FIRMS)' },
    lySmoke: { color: '#f0a35e', id: 'Plume indikatif', en: 'Indicative plume' },
    lyAir: { color: '#7fb4ff', id: 'AQI model', en: 'Modelled AQI' },
    lyPm25: { color: '#c084fc', id: 'PM2.5 model', en: 'Modelled PM2.5' },
    lyAod: { color: '#38bdf8', id: 'AOD satelit', en: 'Satellite AOD' },
    lyAerosol: { color: '#22d3ee', id: 'Aerosol OMPS', en: 'OMPS aerosol' },
    lyDust: { color: '#d6b370', id: 'Debu model', en: 'Modelled dust' },
    lyAsh: { color: '#a3a3a3', id: 'Abu vulkanik', en: 'Volcanic ash' },
    lyVolcano: { color: '#ef4444', id: 'Gunung api', en: 'Volcanoes' },
    lyQuake: { color: '#facc15', id: 'Gempa', en: 'Earthquakes' },
    lyWind: { color: '#86efac', id: 'Angin GFS', en: 'GFS wind' },
    lyImpact: { color: '#fb7185', id: 'Pusat permukiman model', en: 'Modelled settlement centers' },
    lyRegionalHaze: { color: '#fbbf24', id: 'Laporan kabut regional', en: 'Regional haze reports' },
    lyConc: { color: '#94a3b8', id: 'Konsesi (verifikasi netral)', en: 'Concessions (neutral check)' },
    lyShelter: { color: '#4ade80', id: 'Posko', en: 'Shelters' },
    lyFlights: { color: '#60a5fa', id: 'Penerbangan', en: 'Flights' }
  };

  function mapElement(opts) {
    if (opts && opts.element) return opts.element;
    return document.getElementById(opts && opts.mapId || 'map');
  }

  function legendEntries(meta, english) {
    return (meta.activeLayers || []).slice(0, 18).map(function (layer) {
      var known = LEGEND[layer.id];
      return {
        color: known ? known.color : '#9aa2ad',
        label: known ? (english ? known.en : known.id) : String(layer.label || layer.id)
      };
    });
  }

  function contextOrThrow() {
    if (typeof window.SiagaMapContext !== 'function') throw new Error('MAP_CONTEXT_UNAVAILABLE');
    var ctx = window.SiagaMapContext();
    if (!ctx || !ctx.bounds) throw new Error('MAP_CONTEXT_UNAVAILABLE');
    return ctx;
  }

  function wibStamp(iso) {
    var d = iso ? new Date(iso) : new Date();
    var w = new Date(d.getTime() + 7 * 3600000);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return pad(w.getUTCDate()) + '/' + pad(w.getUTCMonth() + 1) + '/' + w.getUTCFullYear()
      + ' ' + pad(w.getUTCHours()) + ':' + pad(w.getUTCMinutes()) + ' WIB';
  }

  function paneOrder(mapEl) {
    var panes = Array.prototype.slice.call(mapEl.querySelectorAll('.leaflet-pane'));
    return panes
      .map(function (pane) {
        var z = parseInt(window.getComputedStyle(pane).zIndex, 10);
        return { pane: pane, z: isNaN(z) ? 0 : z };
      })
      .filter(function (entry) {
        var cs = window.getComputedStyle(entry.pane);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01;
      })
      .sort(function (a, b) { return a.z - b.z; });
  }

  function effectiveOpacity(node, mapEl) {
    var alpha = 1;
    var cur = node;
    while (cur && cur !== mapEl) {
      var cs = window.getComputedStyle(cur);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      var o = Number(cs.opacity);
      if (!isNaN(o)) alpha *= o;
      cur = cur.parentElement;
    }
    return alpha;
  }

  function svgToImage(svg, rect) {
    return new Promise(function (resolve) {
      try {
        var clone = svg.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', String(Math.max(1, Math.round(rect.w))));
        clone.setAttribute('height', String(Math.max(1, Math.round(rect.h))));
        var text = new XMLSerializer().serializeToString(clone);
        var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { resolve(null); };
        img.src = url;
      } catch (error) {
        resolve(null);
      }
    });
  }

  /** Mengumpulkan operasi gambar sesuai urutan pane. */
  function collectPaintOps(mapEl, mapRect) {
    var ops = [];
    var entries = paneOrder(mapEl);
    for (var i = 0; i < entries.length; i++) {
      var pane = entries[i].pane;
      var nodes = pane.querySelectorAll('img, canvas, svg');
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        var rect = node.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        var alpha = effectiveOpacity(node, mapEl);
        if (alpha <= 0.01) continue;
        var kind = node.tagName.toLowerCase();
        if (kind === 'img' && !(node.complete && node.naturalWidth > 0)) continue;
        ops.push({
          kind: kind,
          node: node,
          alpha: alpha,
          x: rect.left - mapRect.left,
          y: rect.top - mapRect.top,
          w: rect.width,
          h: rect.height
        });
      }
    }
    return ops;
  }

  function wrapText(ctx, text, maxWidth) {
    var words = String(text || '').split(/\s+/);
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function measureContext() {
    return document.createElement('canvas').getContext('2d');
  }

  /**
   * Tata letak chrome dihitung lebih dulu, bukan dipaksa ke tinggi tetap.
   * Pada layar sempit teks dibungkus dan tinggi kaki bertambah, sehingga
   * bbox, legenda, atribusi, dan disclaimer tidak pernah terpotong.
   */
  function chromeLayout(width, meta, english) {
    var m = measureContext();
    var narrow = width < 640;
    var pad = narrow ? 10 : 14;
    var inner = Math.max(80, width - pad * 2);
    var title = english ? 'Map snapshot · not an official warning' : 'Tangkapan peta · bukan peringatan resmi';
    var headerOps = [];
    var headerH;

    if (narrow) {
      headerOps.push({ text: 'SIAGA.ID', font: '700 13px ' + FONT_PROSE, color: '#e8eaed', x: pad, y: 18, align: 'left' });
      headerOps.push({ text: wibStamp(meta.capturedAt), font: '500 9px ' + FONT_DATA, color: '#e8eaed', x: width - pad, y: 18, align: 'right' });
      m.font = '500 9px ' + FONT_DATA;
      var subLines = wrapText(m, title, inner).slice(0, 2);
      var hy = 32;
      for (var i = 0; i < subLines.length; i++) {
        headerOps.push({ text: subLines[i], font: '500 9px ' + FONT_DATA, color: '#9aa2ad', x: pad, y: hy, align: 'left' });
        hy += 11;
      }
      headerH = hy + 2;
    } else {
      headerH = HEADER_H;
      headerOps.push({ text: 'SIAGA.ID', font: '700 15px ' + FONT_PROSE, color: '#e8eaed', x: pad, y: 29, align: 'left' });
      headerOps.push({ text: title, font: '500 11px ' + FONT_DATA, color: '#9aa2ad', x: 96, y: 29, align: 'left' });
      headerOps.push({ text: wibStamp(meta.capturedAt), font: '500 11px ' + FONT_DATA, color: '#e8eaed', x: width - pad, y: 29, align: 'right' });
    }

    var b = meta.bounds || {};
    var dataFont = '500 ' + (narrow ? 9 : 10) + 'px ' + FONT_DATA;
    var smallFont = '400 ' + (narrow ? 8 : 9) + 'px ' + FONT_PROSE;
    var warnFont = '600 ' + (narrow ? 8 : 9) + 'px ' + FONT_PROSE;
    var footerOps = [];
    var cursor = 8;

    function pushRows(rows, font, color, lineH) {
      for (var r = 0; r < rows.length; r++) {
        footerOps.push({ text: rows[r], font: font, color: color, x: pad, y: cursor + lineH - 3, align: 'left' });
        cursor += lineH;
      }
    }

    m.font = dataFont;
    var boxLine = 'BBOX ' + b.west + ',' + b.south + ' → ' + b.east + ',' + b.north;
    var viewLine = (english ? 'ZOOM ' : 'ZOOM ') + meta.zoom + '   ' + (english ? 'BASE ' : 'DASAR ') + String(meta.basemap || '-').toUpperCase();
    pushRows(wrapText(m, boxLine, inner), dataFont, '#c8ced6', narrow ? 12 : 13);
    pushRows(wrapText(m, viewLine, inner), dataFont, '#c8ced6', narrow ? 12 : 13);
    var frameLine = (english ? 'Timeline frame: ' : 'Frame linimasa: ') + (meta.timelineFrame || '-')
      + (meta.satelliteProduct ? '   ' + (english ? 'IMAGERY ' : 'CITRA ') + String(meta.satelliteProduct).toUpperCase() : '');
    pushRows(wrapText(m, frameLine, inner).slice(0, 2), dataFont, '#9aa2ad', narrow ? 12 : 13);

    // Legenda warna sekaligus daftar lapisan aktif, dicetak di dalam gambar.
    var entries = legendEntries(meta, english);
    var legendFont = '500 ' + (narrow ? 8 : 9) + 'px ' + FONT_DATA;
    m.font = legendFont;
    if (!entries.length) {
      pushRows([english ? 'LEGEND: no overlay layer active' : 'LEGENDA: tidak ada lapisan overlay aktif'], legendFont, '#7d8590', 13);
    } else {
      var lx = pad;
      var rowStart = cursor;
      for (var e = 0; e < entries.length; e++) {
        var label = entries[e].label;
        var itemW = 12 + m.measureText(label).width + 12;
        if (lx + itemW > width - pad && lx > pad) { lx = pad; cursor += 13; rowStart = cursor; }
        footerOps.push({ swatch: entries[e].color, x: lx, y: rowStart + 10 - 7 });
        footerOps.push({ text: label, font: legendFont, color: '#c8ced6', x: lx + 12, y: rowStart + 10, align: 'left' });
        lx += itemW;
      }
      cursor += 14;
    }

    m.font = smallFont;
    pushRows(wrapText(m, meta.attribution || '', inner).slice(0, 3), smallFont, '#7d8590', narrow ? 10 : 11);
    m.font = warnFont;
    var disclaimer = english
      ? 'Public data. Indications, not measurements. Not an official warning. Emergency: 112.'
      : 'Data publik. Indikasi, bukan pengukuran. Bukan peringatan resmi. Darurat: 112.';
    pushRows(wrapText(m, disclaimer, inner).slice(0, 3), warnFont, '#f0a35e', narrow ? 10 : 11);

    return { headerH: headerH, footerH: cursor + 6, headerOps: headerOps, footerOps: footerOps, pad: pad };
  }

  function paintOps(ctx, ops, offsetY) {
    ctx.textBaseline = 'alphabetic';
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.swatch) {
        ctx.fillStyle = op.swatch;
        ctx.fillRect(op.x, offsetY + op.y, 8, 8);
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.strokeRect(op.x + 0.5, offsetY + op.y + 0.5, 7, 7);
        continue;
      }
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align || 'left';
      ctx.fillText(op.text, op.x, offsetY + op.y);
    }
    ctx.textAlign = 'left';
  }

  function drawChrome(ctx, width, height, layout) {
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, width, layout.headerH);
    paintOps(ctx, layout.headerOps, 0);

    var top = height - layout.footerH;
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, top, width, layout.footerH);
    ctx.strokeStyle = '#2e323a';
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(width, top + 0.5);
    ctx.stroke();
    paintOps(ctx, layout.footerOps, top);
  }

  /**
   * Menangkap peta menjadi PNG.
   * @returns {Promise<{dataUrl:string,width:number,height:number,meta:object,warnings:string[]}>}
   */
  async function capture(options) {
    var opts = options || {};
    var english = opts.language === 'en';
    var mapEl = mapElement(opts);
    if (!mapEl) throw new Error('MAP_NOT_FOUND');
    var mapRect = mapEl.getBoundingClientRect();
    if (mapRect.width < 40 || mapRect.height < 40) throw new Error('MAP_NOT_VISIBLE');

    var meta = contextOrThrow();
    var warnings = [];
    var scale = Math.min(MAX_SCALE, window.devicePixelRatio || 1);
    var width = Math.round(mapRect.width);
    var layout = chromeLayout(width, meta, english);
    var mapH = Math.round(mapRect.height);
    var height = mapH + layout.headerH + layout.footerH;

    var canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(0, 0, width, height);

    var ops = collectPaintOps(mapEl, mapRect);
    if (!ops.length) throw new Error('MAP_NOT_READY');

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, layout.headerH, width, mapH);
    ctx.clip();
    ctx.translate(0, layout.headerH);

    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      ctx.globalAlpha = op.alpha;
      try {
        if (op.kind === 'svg') {
          var img = await svgToImage(op.node, op);
          if (img) ctx.drawImage(img, op.x, op.y, op.w, op.h);
          else warnings.push('svg_layer_skipped');
        } else {
          ctx.drawImage(op.node, op.x, op.y, op.w, op.h);
        }
      } catch (error) {
        warnings.push(op.kind + '_draw_failed');
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    drawChrome(ctx, width, height, layout);

    var dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/png');
    } catch (error) {
      // Kanvas tainted: sumber petak menolak CORS. Jangan diam-diam
      // mengembalikan gambar kosong.
      throw new Error('CANVAS_TAINTED_CORS');
    }
    if (!dataUrl || dataUrl.length < 2000) throw new Error('CAPTURE_EMPTY');

    return {
      dataUrl: dataUrl,
      width: canvas.width,
      height: canvas.height,
      meta: meta,
      warnings: Array.from(new Set(warnings))
    };
  }

  function download(dataUrl, filename) {
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename || 'siaga-peta.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  window.MapScreenshot = {
    capture: capture,
    download: download,
    wibStamp: wibStamp,
    HEADER_H: HEADER_H,
    FOOTER_H: FOOTER_H,
    LEGEND: LEGEND
  };
})(window, document);
