(function (window, document) {
  'use strict';
  if (!window || !document) return;
  var data = null;
  var running = false;

  function lang() { return window.SiagaI18n ? window.SiagaI18n.getLanguage() : 'id'; }
  function text(id, en) { return lang() === 'en' ? en : id; }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }
  function safeUrl(value) {
    try {
      var url = new URL(String(value || ''), window.location.origin);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch (_error) { return null; }
  }
  function number(value) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return null;
    return new Intl.NumberFormat(lang() === 'en' ? 'en-US' : 'id-ID').format(Number(value));
  }
  function parseTime(value) {
    if (value == null || typeof value === 'boolean') return null;
    var date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
    var match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(String(value).trim());
    if (!match) return null;
    var parts = match.slice(1).map(Number);
    date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
    if (parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[3] > 23 || parts[4] > 59 || parts[5] > 59
      || date.getUTCFullYear() !== parts[0] || date.getUTCMonth() + 1 !== parts[1]
      || date.getUTCDate() !== parts[2] || date.getUTCHours() !== parts[3]
      || date.getUTCMinutes() !== parts[4] || date.getUTCSeconds() !== parts[5]) return null;
    return date;
  }
  function formatTime(value) {
    var date = parseTime(value);
    if (!date) return text('waktu sumber tidak tersedia', 'source time unavailable');
    var formatted = new Intl.DateTimeFormat(lang() === 'en' ? 'en-US' : 'id-ID', {
      timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short'
    }).format(date);
    return formatted + ' WIB';
  }
  function makeLink(url, label) {
    var safe = safeUrl(url);
    return safe ? '<a class="site-inline-link" href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + ' ↗</a>' : '';
  }
  async function fetchJson(path) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 60000);
    try {
      var response = await fetch(path, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return { ok: true, value: await response.json(), error: null };
    } catch (error) {
      return { ok: false, value: null, error: error && error.name === 'AbortError' ? 'timeout' : String(error && error.message || 'unavailable') };
    } finally { clearTimeout(timer); }
  }

  function setStat(cardIndex, value, detail) {
    var card = document.querySelectorAll('.home-stat')[cardIndex];
    if (!card) return;
    card.querySelector('strong').textContent = value == null ? text('Belum tersedia', 'Unavailable') : value;
    card.querySelector('small').textContent = detail;
  }

  function renderStats() {
    if (!data) return;
    var overview = data.overview;
    var hazard = data.hazard;
    var eruption = data.eruptions;
    var hotspots = overview && overview.stats && overview.stats.hotspots;
    var hotspotCoverage = overview && overview.meta && overview.meta.windowHours;
    setStat(0, number(hotspots), hotspots == null
      ? text('Sumber FIRMS belum memberi data.', 'FIRMS data is unavailable.')
      : text('NASA FIRMS · jendela ', 'NASA FIRMS · ') + (number(hotspotCoverage) || '?') + text(' jam terakhir; bukan batas kebakaran.', ' h window; not a fire perimeter.'));

    var quakes = hazard && hazard.quakes && hazard.quakes.quakes;
    var quakeWindow = hazard && hazard.quakes && hazard.quakes.windowHours;
    setStat(1, Array.isArray(quakes) ? number(quakes.length) : null, Array.isArray(quakes)
      ? text('BMKG · cakupan ', 'BMKG · source window ') + (number(quakeWindow) || '?') + text(' jam.', ' h.')
      : text('Feed BMKG belum tersedia; bukan berarti nol.', 'BMKG feed unavailable; this does not mean zero.'));

    var eruptionReports = eruption && eruption.reports;
    var eruptionWindow = eruption && eruption.windowHours;
    setStat(2, Array.isArray(eruptionReports) ? number(eruptionReports.length) : null, Array.isArray(eruptionReports)
      ? text('Pos pengamatan PVMBG · ', 'PVMBG observatories · ') + (number(eruptionWindow) || '?') + text(' jam terakhir.', ' h window.')
      : text('Laporan pos pengamatan belum tersedia.', 'Observatory reports are unavailable.'));

    var stamps = [
      overview && overview.meta && overview.meta.updatedAt,
      hazard && hazard.updatedAt,
      eruption && eruption.updatedAt,
      data.news && data.news.fetchedAt
    ].filter(function (value) { return value && Number.isFinite(Date.parse(value)); }).sort(function (a, b) { return Date.parse(b) - Date.parse(a); });
    var status = document.getElementById('homeUpdated');
    if (status) status.textContent = stamps.length
      ? text('Data sumber terakhir diperbarui/diambil: ', 'Latest source update/capture: ') + formatTime(stamps[0]) + text('. Waktu setiap sumber dapat berbeda.', '. Source timestamps may differ.')
      : text('Waktu pembaruan belum dapat dipastikan dari feed yang tersedia.', 'Update time could not be verified from the available feeds.');
  }

  function renderEvents() {
    var container = document.getElementById('homeEvents');
    var status = document.getElementById('homeEventsStatus');
    if (!container || !status || !data) return;
    var entries = [];
    var hazard = data.hazard;
    var quake = hazard && hazard.quakes && Array.isArray(hazard.quakes.quakes) && hazard.quakes.quakes[0];
    if (quake) {
      var quakeMagnitude = quake.magnitude == null || String(quake.magnitude).trim() === '' ? NaN : Number(quake.magnitude);
      entries.push({
        type: text('Gempa · BMKG', 'Earthquake · BMKG'),
        title: (Number.isFinite(quakeMagnitude) ? 'M' + quakeMagnitude.toFixed(1) + ' · ' : '') + (quake.area || text('Laporan gempa terbaru', 'Latest earthquake report')),
        detail: [quake.time && formatTime(quake.time), quake.depthKm != null && text('Kedalaman ', 'Depth ') + number(quake.depthKm) + ' km'].filter(Boolean).join(' · '),
        sourceTime: quake.time,
        url: hazard.quakes.sourceUrl || 'https://www.bmkg.go.id/gempabumi'
      });
    }
    var tsunamiBulletin = hazard && hazard.tsunami && Array.isArray(hazard.tsunami.bulletins) && hazard.tsunami.bulletins[0];
    if (tsunamiBulletin) {
      entries.push({
        type: text('Buletin tsunami · NOAA PTWC', 'Tsunami bulletin · NOAA PTWC'),
        title: tsunamiBulletin.title || text('Buletin tsunami kawasan', 'Regional tsunami bulletin'),
        detail: [tsunamiBulletin.time && formatTime(tsunamiBulletin.time), tsunamiBulletin.summary || null].filter(Boolean).join(' · '),
        sourceTime: tsunamiBulletin.time,
        url: tsunamiBulletin.url || hazard.tsunami.sourceUrl || 'https://www.tsunami.gov/'
      });
    }
    var eruption = data.eruptions;
    var eruptionReport = eruption && Array.isArray(eruption.reports) && eruption.reports[0];
    if (eruptionReport) {
      entries.push({
        type: text('Laporan letusan · PVMBG', 'Eruption report · PVMBG'),
        title: eruptionReport.name || text('Laporan pos pengamatan', 'Observatory report'),
        detail: [eruptionReport.at && formatTime(eruptionReport.at), eruptionReport.heightM != null && text('Kolom teramati ', 'Observed column ') + number(eruptionReport.heightM) + ' m'].filter(Boolean).join(' · '),
        sourceTime: eruptionReport.at,
        url: eruption.sourceUrl || 'https://magma.esdm.go.id/'
      });
    }
    var articles = data.news && Array.isArray(data.news.articles) ? data.news.articles : [];
    articles.slice(0, 3).forEach(function (article) {
      var url = safeUrl(article.url);
      if (!url || !article.title) return;
      entries.push({
        type: (article.domain || article.source || text('Publikasi media', 'Media publication')) + ' · ' + text('judul asli', 'original headline'),
        title: article.title,
        detail: [article.pubDate || article.seendate ? formatTime(article.pubDate || article.seendate) : null, article.topicLabel || article.topic || null].filter(Boolean).join(' · '),
        sourceTime: article.pubDate || article.seendate || null,
        url: url,
        original: true
      });
    });

    entries.sort(function (a, b) {
      var aTime = parseTime(a.sourceTime);
      var bTime = parseTime(b.sourceTime);
      return (bTime ? bTime.getTime() : 0) - (aTime ? aTime.getTime() : 0);
    });

    if (!entries.length) {
      status.textContent = text('Belum ada catatan bertanggal yang dapat ditampilkan dari feed yang berhasil dimuat. Ini bukan bukti bahwa tidak ada peristiwa.', 'No timestamped records are available from the feeds that loaded. This is not evidence that no events occurred.');
      container.innerHTML = '<div class="site-empty">' + escapeHtml(text('Periksa dashboard atau coba muat ulang.', 'Check the dashboard or try refreshing.')) + '</div>';
      return;
    }
    status.textContent = text('Setiap item mempertahankan waktu dan tautan sumber; judul media ditampilkan dalam bahasa aslinya.', 'Each item retains its source time and link; media headlines remain in their original language.');
    container.innerHTML = entries.slice(0, 5).map(function (entry) {
      var titleMarkup = '<span' + (entry.original ? ' data-i18n-skip' : '') + '>' + escapeHtml(entry.title) + '</span>';
      return '<article class="site-card home-event-card">'
        + '<p class="home-event-type">' + escapeHtml(entry.type) + '</p>'
        + '<h3>' + titleMarkup + '</h3>'
        + (entry.detail ? '<p class="home-event-detail">' + escapeHtml(entry.detail) + '</p>' : '')
        + makeLink(entry.url, text('Buka sumber', 'Open source'))
        + '</article>';
    }).join('');
  }

  async function refresh() {
    if (running) return;
    running = true;
    var status = document.getElementById('homeEventsStatus');
    if (status) status.textContent = text('Memeriksa sumber…', 'Checking sources…');
    var names = ['overview', 'hazard', 'eruptions', 'news'];
    var paths = ['/api/overview', '/api/hazard', '/api/eruptions', '/api/news'];
    var results = await Promise.all(paths.map(fetchJson));
    data = {};
    names.forEach(function (name, index) { data[name] = results[index].value; });
    renderStats();
    renderEvents();
    running = false;
  }

  var refreshButton = document.getElementById('homeRefresh');
  if (refreshButton) refreshButton.addEventListener('click', refresh);
  window.addEventListener('siaga:languagechange', function () {
    renderStats();
    renderEvents();
  });
  refresh();
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
