'use strict';

/**
 * Cek Asap di peramban.
 *
 * Foto dikodekan ulang lewat canvas sebelum dikirim: langkah ini membuang
 * EXIF (termasuk tag GPS) dan membatasi ukuran. Putusan dan angka datang
 * dari server; berkas ini hanya menampilkannya.
 */
(function (window, document) {
  if (!window || !document) return;

  var MAX_BYTES = 6 * 1024 * 1024;
  var MAX_SIDE = 1600;
  var photoData = '';
  var busy = false;

  function english() { return !!(window.SiagaI18n && window.SiagaI18n.getLanguage() === 'en'); }
  function t(id, en) { return english() ? en : id; }
  function $(id) { return document.getElementById(id); }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function status(text, kind) {
    var node = $('smokeStatus');
    if (!node) return;
    node.textContent = text || '';
    node.dataset.kind = kind || 'info';
  }

  function localDateTimeValue(date) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
      + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  /** Kodifikasi ulang: buang EXIF, kecilkan sisi terpanjang, keluarkan JPEG. */
  function reencode(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { reject(new Error('TYPE_UNSUPPORTED')); return; }
      if (file.size > MAX_BYTES) { reject(new Error('FILE_TOO_LARGE')); return; }
      var url = window.URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var out = canvas.toDataURL('image/jpeg', 0.85);
          window.URL.revokeObjectURL(url);
          if (!out || out.length < 500) { reject(new Error('ENCODE_FAILED')); return; }
          resolve({ dataUrl: out, width: canvas.width, height: canvas.height });
        } catch (error) {
          window.URL.revokeObjectURL(url);
          reject(new Error('ENCODE_FAILED'));
        }
      };
      img.onerror = function () { window.URL.revokeObjectURL(url); reject(new Error('DECODE_FAILED')); };
      img.src = url;
    });
  }

  function clearPhoto() {
    photoData = '';
    var input = $('smokePhoto');
    if (input) input.value = '';
    var wrap = $('smokePreviewWrap');
    if (wrap) wrap.hidden = true;
    var img = $('smokePreview');
    if (img) img.removeAttribute('src');
    var clear = $('smokePhotoClear');
    if (clear) clear.hidden = true;
  }

  async function onPhoto(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) { clearPhoto(); return; }
    status(t('Mengodekan ulang foto dan membuang EXIF…', 'Re-encoding the photo and stripping EXIF…'), 'info');
    try {
      var out = await reencode(file);
      photoData = out.dataUrl;
      $('smokePreview').src = out.dataUrl;
      $('smokePreviewInfo').textContent = t('Dikirim sebagai JPEG ', 'Sent as JPEG ') + out.width + '×' + out.height
        + ' · ' + t('EXIF dibuang', 'EXIF stripped');
      $('smokePreviewWrap').hidden = false;
      $('smokePhotoClear').hidden = false;
      status(t('Foto siap. Lokasi dan waktu tetap harus diisi.', 'Photo ready. Location and time are still required.'), 'ok');
    } catch (error) {
      clearPhoto();
      var code = String(error && error.message || 'ENCODE_FAILED');
      status(code === 'FILE_TOO_LARGE'
        ? t('Foto terlalu besar. Maksimal 6 MB.', 'Photo too large. At most 6 MB.')
        : code === 'TYPE_UNSUPPORTED'
          ? t('Format tidak didukung. Pakai JPEG, PNG, atau WebP.', 'Unsupported format. Use JPEG, PNG, or WebP.')
          : t('Foto tidak bisa dibaca peramban. Coba foto lain.', 'The browser could not read that photo. Try another one.'), 'error');
    }
  }

  function locate() {
    if (!window.navigator.geolocation) {
      status(t('Peramban ini tidak menyediakan lokasi. Isi lintang dan bujur manual.', 'This browser does not provide location. Enter latitude and longitude manually.'), 'error');
      return;
    }
    status(t('Meminta izin lokasi…', 'Requesting location permission…'), 'info');
    window.navigator.geolocation.getCurrentPosition(function (position) {
      $('smokeLat').value = position.coords.latitude.toFixed(4);
      $('smokeLon').value = position.coords.longitude.toFixed(4);
      status(t('Lokasi peramban diisi. Geser bila titik pengamatan berbeda.', 'Browser location filled in. Adjust it if the observation point differs.'), 'ok');
    }, function () {
      status(t('Izin lokasi ditolak atau gagal. Isi lintang dan bujur manual.', 'Location permission denied or failed. Enter latitude and longitude manually.'), 'error');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  function verdictLabel(verdict) {
    var map = {
      didukung: ['Didukung data publik', 'Supported by public data'],
      belum_didukung: ['Belum didukung data publik', 'Not yet supported by public data'],
      data_tidak_cukup: ['Data tidak cukup', 'Not enough data'],
      ditolak: ['Materi ditolak', 'Material rejected']
    };
    var pair = map[verdict] || map.data_tidak_cukup;
    return t(pair[0], pair[1]);
  }

  function evidenceRows(evidence) {
    var rows = [];
    var fire = evidence.fire || {};
    var air = evidence.air || {};
    var wind = evidence.wind || {};
    var volcano = evidence.volcano || {};
    var report = evidence.report || {};
    rows.push([t('Koordinat laporan', 'Reported coordinate'), report.lat + ', ' + report.lon]);
    rows.push([t('Waktu pengamatan', 'Observation time'), report.observedAt || '-']);
    if (fire.available) {
      rows.push([t('Deteksi panas dalam radius', 'Thermal detections within radius'),
        fire.detectionsWithinRadius + ' ' + t('dalam', 'within') + ' ' + fire.searchRadiusKm + ' km'
        + ' · ' + t('keyakinan tinggi', 'high confidence') + ' ' + fire.highConfidenceWithinRadius
        + (fire.nearestDistanceKm != null ? ' · ' + t('terdekat', 'nearest') + ' ' + fire.nearestDistanceKm + ' km' : '')]);
    } else {
      rows.push([t('Deteksi panas', 'Thermal detections'), t('tidak tersedia', 'unavailable')]);
    }
    if (air.available && air.point) {
      rows.push([t('AQI model di titik itu', 'Modelled AQI at that point'),
        air.point.usAqi + ' (' + air.point.category + ')'
        + (air.point.pm25UgM3 != null ? ' · PM2.5 ' + air.point.pm25UgM3 + ' µg/m³' : '')]);
    } else {
      rows.push([t('Kualitas udara model', 'Modelled air quality'), t('tidak tersedia', 'unavailable')]);
    }
    if (wind.available && wind.point) {
      rows.push([t('Angin permukaan model', 'Modelled surface wind'),
        wind.point.speedMs + ' m/s · ' + t('menuju', 'toward') + ' ' + wind.point.towardDegrees + '°']);
    }
    if (volcano.available) {
      rows.push([t('Gunung api dalam radius', 'Volcanoes within radius'),
        (volcano.nearby || []).length
        ? volcano.nearby.map(function (v) { return v.name + ' (' + v.officialLevel + ', ' + v.distanceKm + ' km)'; }).join('; ')
        : t('tidak ada dalam', 'none within') + ' ' + volcano.searchRadiusKm + ' km']);
    }
    var haze = (evidence.regionalHaze && evidence.regionalHaze.reports) || [];
    if (haze.length) {
      rows.push([t('Laporan kabut regional', 'Regional haze reports'),
        haze.map(function (r) { return r.title + ' · ' + r.source + (r.publishedAt ? ' · ' + r.publishedAt : ''); }).join('; ')]);
    }
    return rows;
  }

  function render(result) {
    var section = $('smokeResultSection');
    var host = $('smokeResult');
    while (host.firstChild) host.removeChild(host.firstChild);
    section.hidden = false;

    var badge = el('div', 'smoke-verdict smoke-verdict-' + String(result.verdict || 'data_tidak_cukup'));
    badge.appendChild(el('span', 'smoke-verdict-label', verdictLabel(result.verdict)));
    badge.appendChild(el('span', 'smoke-verdict-note',
      t('Putusan dihitung kode dari label terlihat dan bukti publik, bukan diminta ke model.',
        'The verdict is computed by code from the visible label and public evidence, not requested from the model.')));
    host.appendChild(badge);

    if (result.provider && result.provider !== 'muse-spark') {
      host.appendChild(el('p', 'smoke-warning',
        t('Model vision tidak dipakai (' + (result.failureCode || result.provider) + '). Foto tidak dinilai; angka di bawah tetap dihitung kode.',
          'The vision model was not used (' + (result.failureCode || result.provider) + '). The photo was not assessed; the figures below are still computed by code.')));
    }

    if (result.visible && result.visible.description) {
      var visible = el('div', 'smoke-visible');
      visible.appendChild(el('p', 'smoke-visible-label', result.visible.label || ''));
      visible.appendChild(el('p', 'smoke-visible-text', result.visible.description));
      var extras = [];
      if (result.visible.skyColour) extras.push(t('Warna langit: ', 'Sky colour: ') + result.visible.skyColour);
      if (result.visible.visibility) extras.push(t('Jarak pandang: ', 'Visibility: ') + result.visible.visibility);
      if (extras.length) visible.appendChild(el('p', 'smoke-visible-extra', extras.join(' · ')));
      host.appendChild(visible);
    }

    if (Array.isArray(result.reasons) && result.reasons.length) {
      var reasons = el('ul', 'smoke-reasons');
      result.reasons.forEach(function (reason) { reasons.appendChild(el('li', null, reason)); });
      host.appendChild(reasons);
    }

    var rows = evidenceRows(result.evidence || {});
    if (rows.length) {
      host.appendChild(el('h3', 'smoke-subhead', t('Bukti publik yang dibaca', 'Public evidence read')));
      var dl = el('dl', 'smoke-evidence');
      rows.forEach(function (row) {
        dl.appendChild(el('dt', null, row[0]));
        dl.appendChild(el('dd', null, String(row[1])));
      });
      host.appendChild(dl);
    }

    var limitations = (result.evidence && result.evidence.limitations) || [];
    if (limitations.length) {
      host.appendChild(el('h3', 'smoke-subhead', t('Keterbatasan', 'Limitations')));
      var list = el('ul', 'smoke-limits');
      limitations.forEach(function (item) { list.appendChild(el('li', null, item)); });
      host.appendChild(list);
    }

    host.appendChild(el('p', 'smoke-disclaimer', result.disclaimer || ''));
    host.appendChild(el('p', 'smoke-retention',
      t('Foto tidak disimpan. Halaman ini tidak menyimpan materi laporan setelah tab ditutup.',
        'The photo was not stored. This page keeps no report material after the tab is closed.')));
    section.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    var lat = $('smokeLat').value;
    var lon = $('smokeLon').value;
    var description = $('smokeText').value.trim();
    if (!photoData && !description) {
      status(t('Sertakan foto atau cerita singkat.', 'Attach a photo or a short description.'), 'error');
      return;
    }
    if (lat === '' || lon === '') {
      status(t('Lintang dan bujur wajib diisi.', 'Latitude and longitude are required.'), 'error');
      return;
    }
    var timeValue = $('smokeTime').value;
    var payload = {
      image: photoData || undefined,
      description: description,
      lat: Number(lat),
      lon: Number(lon),
      observedAt: timeValue ? new Date(timeValue).toISOString() : new Date().toISOString(),
      language: english() ? 'en' : 'id'
    };
    busy = true;
    $('smokeSubmit').disabled = true;
    status(t('Memeriksa terhadap data publik…', 'Checking against public data…'), 'info');
    try {
      var response = await fetch('/api/cek-asap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var body = await response.json().catch(function () { return null; });
      if (!response.ok || !body || !body.ok) {
        var code = body && body.error ? body.error : 'HTTP_' + response.status;
        var messages = {
          LOCATION_INVALID: t('Koordinat tidak sah.', 'Invalid coordinates.'),
          EVIDENCE_EMPTY: t('Sertakan foto atau cerita singkat.', 'Attach a photo or a short description.'),
          IMAGE_TOO_LARGE: t('Foto terlalu besar setelah dikodekan ulang.', 'The photo is still too large after re-encoding.'),
          IMAGE_INVALID: t('Format foto tidak diterima server.', 'The server did not accept that photo format.'),
          TIME_INVALID: t('Waktu pengamatan di luar rentang yang diterima.', 'The observation time is outside the accepted range.')
        };
        status(messages[code] || (t('Pemeriksaan gagal: ', 'Check failed: ') + code), 'error');
        return;
      }
      render(body);
      status(t('Pemeriksaan selesai.', 'Check complete.'), 'ok');
    } catch (error) {
      status(t('Tidak dapat menghubungi server. Coba lagi sebentar.', 'Could not reach the server. Try again shortly.'), 'error');
    } finally {
      busy = false;
      $('smokeSubmit').disabled = false;
    }
  }

  function boot() {
    if (!$('smokeForm')) return;
    $('smokeTime').value = localDateTimeValue(new Date());
    $('smokePhoto').addEventListener('change', onPhoto);
    $('smokePhotoClear').addEventListener('click', function () { clearPhoto(); status('', 'info'); });
    $('smokeLocate').addEventListener('click', locate);
    $('smokeForm').addEventListener('submit', submit);
    window.addEventListener('siaga:languagechange', function () {
      var placeholder = $('smokeText');
      if (placeholder) {
        placeholder.placeholder = english()
          ? placeholder.getAttribute('data-site-placeholder-en')
          : placeholder.getAttribute('data-site-placeholder-id');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
