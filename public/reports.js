(function (window, document) {
  'use strict';
  if (!window || !document || !window.SiagaReportModel) return;

  var model = window.SiagaReportModel;
  var archiveEntries = [];
  var weeklyEntries = [];
  var snapshotsByDate = new Map();
  var weeklyById = new Map();
  var mode = 'daily';
  var selectedDate = '';
  var loading = false;

  function lang() { return window.SiagaI18n ? window.SiagaI18n.getLanguage() : 'id'; }
  function en() { return lang() === 'en'; }
  function copy(id, english) { return en() ? english : id; }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }
  function safeUrl(value) { return model.safeUrl(value); }
  function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function validWeeklyIssue(issue, entry) {
    if (!isRecord(issue) || issue.schemaVersion !== 1 || issue.type !== 'weekly'
      || issue.weekId !== entry.weekId || issue.throughDate !== entry.throughDate
      || !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.throughDate || ''))
      || model.isoWeekId(entry.throughDate + 'T12:00:00+07:00') !== entry.weekId
      || (entry.capturedAt && issue.capturedAt !== entry.capturedAt)
      || !model.parseInstant(issue.capturedAt)
      || !Number.isInteger(issue.dailySnapshotCount) || issue.dailySnapshotCount < 1
      || !Number.isInteger(issue.expectedDailySnapshots) || issue.expectedDailySnapshots !== model.WEEK_DAYS
      || issue.dailySnapshotCount > issue.expectedDailySnapshots
      || typeof issue.complete !== 'boolean' || typeof issue.temporalComplete !== 'boolean'
      || typeof issue.sourceCoverageComplete !== 'boolean' || typeof issue.dailyIssuesComplete !== 'boolean'
      || !isRecord(issue.period) || !model.parseInstant(issue.period.start) || !model.parseInstant(issue.period.end)
      || typeof issue.period.durationHours !== 'number' || !Number.isFinite(issue.period.durationHours)
      || !Array.isArray(issue.snapshots) || issue.snapshots.length !== issue.dailySnapshotCount
      || !Array.isArray(issue.events) || !issue.events.every(isRecord)
      || !Array.isArray(issue.contexts) || !issue.contexts.every(isRecord)
      || !Array.isArray(issue.references) || !issue.references.every(isRecord)
      || !Array.isArray(issue.hotspotSeries) || !issue.hotspotSeries.every(isRecord)
      || !Array.isArray(issue.coverageGaps) || !Array.isArray(issue.coverageOverlaps)
      || !Array.isArray(issue.invalidSnapshotWindows) || !isRecord(issue.sourceCoverage)) return false;
    var sourceKeys = ['fires', 'earthquakes', 'tsunami', 'eruptions', 'news'];
    if (!sourceKeys.every(function (key) { return isRecord(issue.sourceCoverage[key]); })) return false;
    if (!issue.snapshots.some(function (snapshot) { return snapshot && snapshot.reportDate === issue.throughDate; })) return false;
    return issue.snapshots.every(function (snapshot) {
      return isRecord(snapshot) && /^\d{4}-\d{2}-\d{2}$/.test(String(snapshot.reportDate || ''))
        && model.isoWeekId(snapshot.reportDate + 'T12:00:00+07:00') === entry.weekId
        && snapshot.reportDate <= issue.throughDate
        && isRecord(snapshot.period) && model.parseInstant(snapshot.period.start) && model.parseInstant(snapshot.period.end)
        && isRecord(snapshot.coverage) && typeof snapshot.quality === 'string';
    });
  }
  function fmtNumber(value, digits) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return copy('tidak tersedia', 'not available');
    return new Intl.NumberFormat(en() ? 'en-US' : 'id-ID', { maximumFractionDigits: digits == null ? 1 : digits }).format(Number(value));
  }
  function formatDate(value, withTime) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return copy('waktu tidak tersedia', 'time unavailable');
    var options = withTime
      ? { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }
      : { timeZone: 'Asia/Jakarta', dateStyle: 'long' };
    return new Intl.DateTimeFormat(en() ? 'en-US' : 'id-ID', options).format(date) + (withTime ? ' WIB' : '');
  }
  function formatRange(period) {
    if (!period || !period.start || !period.end) return copy('rentang data tidak tersedia', 'reporting period unavailable');
    return formatDate(period.start, true) + ' - ' + formatDate(period.end, true);
  }
  function referenceMap(references) {
    var byId = new Map();
    (references || []).forEach(function (ref, index) {
      if (!ref || !ref.id || !safeUrl(ref.url)) return;
      byId.set(ref.id, { ref: ref, number: index + 1 });
    });
    return byId;
  }
  function citation(referenceId, refs) {
    var found = refs.get(referenceId);
    if (!found) return '';
    var refId = 'ref-' + found.number;
    return ' <sup class="report-citation"><a href="#' + refId + '" aria-label="' + escapeHtml(copy('Referensi ', 'Reference ') + found.number) + '">[' + found.number + ']</a></sup>';
  }
  function sourceLink(url, title) {
    var safe = safeUrl(url);
    return safe ? '<a href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(title || safe) + ' ↗</a>' : escapeHtml(title || copy('tautan tidak tersedia', 'link unavailable'));
  }
  function eventType(type) {
    var labels = {
      earthquake: copy('Gempa bumi', 'Earthquake'),
      tsunami: copy('Buletin tsunami', 'Tsunami bulletin'),
      eruption: copy('Laporan letusan', 'Eruption report'),
      news: copy('Publikasi media', 'Media publication'),
      haze: copy('Laporan kabut asap', 'Haze report')
    };
    return labels[type] || (type || copy('Catatan sumber', 'Source record'));
  }
  function eventFacts(event) {
    var facts = event.facts || {};
    var parts = [];
    if (event.type === 'earthquake') {
      if (facts.magnitude != null) parts.push('M' + fmtNumber(facts.magnitude, 1));
      if (facts.depthKm != null) parts.push(copy('kedalaman ', 'depth ') + fmtNumber(facts.depthKm, 1) + ' km');
      if (facts.tsunami === true) parts.push(copy('buletin menyebut potensi tsunami', 'bulletin reports tsunami potential'));
      if (facts.tsunami === false) parts.push(copy('buletin menyebut tidak berpotensi tsunami', 'bulletin reports no tsunami potential'));
      if (facts.felt) parts.push(copy('dirasakan: ', 'felt reports: ') + String(facts.felt));
    } else if (event.type === 'eruption') {
      if (facts.heightM != null) parts.push(copy('tinggi kolom teramati ', 'observed column height ') + fmtNumber(facts.heightM, 0) + ' m');
      if (facts.bearingLabel) parts.push(copy('arah condong ', 'column leaned ') + String(facts.bearingLabel));
      if (facts.durationS != null) parts.push(copy('durasi ', 'duration ') + fmtNumber(facts.durationS, 1) + ' s');
    } else if (event.type === 'tsunami' && typeof facts.danger === 'boolean') {
      parts.push(facts.danger ? copy('peringatan aktif menurut buletin sumber', 'source bulletin indicates an active warning') : copy('buletin tidak menunjukkan peringatan aktif', 'source bulletin indicates no active warning'));
    } else if (event.type === 'news') {
      parts.push(copy('Judul media; bukan verifikasi independen oleh agregator.', 'Media headline; not independently verified by the aggregator.'));
    }
    return parts;
  }
  function renderEvent(event, refs) {
    var title = '<span class="report-source-title" data-i18n-skip>' + escapeHtml(event.title || eventType(event.type)) + '</span>';
    var facts = eventFacts(event);
    var description = event.description
      ? '<span class="report-source-quote" data-i18n-skip>' + escapeHtml(event.description) + '</span>' : '';
    var factMarkup = facts.length ? '<span class="report-event-meta">' + escapeHtml(facts.join(' · ')) + '</span>' : '';
    var location = event.location ? '<span class="report-event-meta">' + escapeHtml(event.location) + '</span>' : '';
    return '<li><strong>' + title + '</strong>' + citation(event.referenceId, refs)
      + '<span class="report-event-meta">' + escapeHtml(eventType(event.type)) + ' · ' + escapeHtml(formatDate(event.observedAt, true)) + '</span>'
      + location + factMarkup + description + '</li>';
  }
  function sourceRowsDaily(snapshot, refs) {
    var sources = snapshot.sourceStatus || {};
    var labels = {
      fires: copy('Titik api satelit', 'Satellite fire detections'),
      earthquakes: copy('Gempa BMKG', 'BMKG earthquakes'),
      tsunami: copy('Buletin tsunami', 'Tsunami bulletins'),
      eruptions: copy('Laporan letusan PVMBG', 'PVMBG eruption reports'),
      news: copy('Feed berita', 'News feed')
    };
    var errorKeys = { fires: 'overview', earthquakes: 'hazard', tsunami: 'hazard', eruptions: 'eruptions', news: 'news' };
    return Object.keys(labels).map(function (key) {
      var source = sources[key] || {};
      var errors = snapshot.notes && snapshot.notes.apiErrors || {};
      var error = errors[errorKeys[key]];
      var state = source.available ? copy('tersedia', 'available') : copy('tidak tersedia', 'unavailable');
      if (source.partial) state += copy(' (cakupan/rekaman parsial)', ' (partial coverage/records)');
      if (source.stale) state += copy(' (cache usang)', ' (stale cache)');
      var details = [];
      if (source.scope) details.push(source.scope);
      if (source.mode && source.mode !== source.scope) details.push(copy('mode ', 'mode ') + source.mode);
      if (source.windowHours != null) details.push(copy('jendela sumber ', 'source window ') + fmtNumber(source.windowHours, 0) + ' h');
      if (source.coverageStart || source.coverageEnd) details.push(copy('rentang akuisisi ', 'acquisition range ') + (source.coverageStart ? formatDate(source.coverageStart, true) : copy('awal tidak tersedia', 'start unavailable')) + ' - ' + (source.coverageEnd ? formatDate(source.coverageEnd, true) : copy('akhir tidak tersedia', 'end unavailable')));
      if (source.payloadAssembledAt) details.push(copy('payload API dirangkai ', 'API payload assembled ') + formatDate(source.payloadAssembledAt, true));
      if (source.dataAgeHours != null) details.push(copy('umur data saat payload disusun ', 'data age when payload was assembled ') + fmtNumber(source.dataAgeHours, 1) + ' h');
      if (source.latestAnyAgeHours != null) details.push(copy('umur gempa BMKG terbaru ', 'age of latest BMKG earthquake ') + fmtNumber(source.latestAnyAgeHours, 1) + ' h');
      if (source.fetchedRecords != null) details.push(fmtNumber(source.fetchedRecords, 0) + ' ' + copy('rekaman kandidat dari feed', 'candidate records from feed'));
      if (source.filteredOut != null) details.push(fmtNumber(source.filteredOut, 0) + ' ' + copy('rekaman dikeluarkan dari jendela', 'records excluded by the window filter'));
      if (source.recordCount != null) details.push(fmtNumber(source.recordCount, 0) + ' ' + copy('rekaman dikembalikan feed', 'records returned by feed'));
      if (source.periodRecords != null) details.push(fmtNumber(source.periodRecords, 0) + ' ' + copy('rekaman bertanggal dalam periode', 'timestamped records in report period'));
      if (source.rejectedRecords) details.push(fmtNumber(source.rejectedRecords, 0) + ' ' + copy('kandidat dikeluarkan karena judul atau URL sumber tidak valid', 'candidates rejected for a missing title or invalid source URL'));
      if (source.includedRecords != null) details.push(fmtNumber(source.includedRecords, 0) + ' ' + copy('rekaman dimasukkan setelah validasi waktu dan tautan', 'records retained after timestamp and link checks'));
      if (source.reportedTotal != null) details.push(fmtNumber(source.reportedTotal, 0) + ' ' + copy('deteksi total yang dilaporkan', 'reported total detections'));
      if (source.returnedRecords != null) details.push(fmtNumber(source.returnedRecords, 0) + ' ' + copy('titik yang disertakan dalam payload', 'points included in payload'));
      if (source.recordCoverageStart || source.recordCoverageEnd) details.push(copy('waktu rekaman terpilih ', 'included record times ') + (source.recordCoverageStart ? formatDate(source.recordCoverageStart, true) : copy('awal tidak tersedia', 'start unavailable')) + ' - ' + (source.recordCoverageEnd ? formatDate(source.recordCoverageEnd, true) : copy('akhir tidak tersedia', 'end unavailable')));
      if (source.requestedDays != null) details.push(copy('parameter hari yang diminta ', 'requested days parameter ') + fmtNumber(source.requestedDays, 0));
      if (source.bbox && typeof source.bbox === 'object') details.push(copy('cakupan BBOX sumber ', 'source BBOX ') + JSON.stringify(source.bbox));
      if (source.limitedToRecentFeed) details.push(copy('hanya feed agregator terbaru; bukan cakupan seluruh penerbit', 'recent aggregator feed only; not publisher-wide coverage'));
      if (source.truncated) details.push(key === 'fires'
        ? copy('daftar titik dipotong; total tetap dari metadata', 'point list capped; total retained from metadata')
        : (key === 'news'
          ? copy('dibatasi pada ', 'capped at ') + fmtNumber(source.includedRecords, 0) + copy(' judul terbaru dalam periode; sisanya tidak ditampilkan', ' most recent in-period headlines; the remainder is omitted')
          : copy('daftar rekaman sumber dipotong', 'source record list was capped')));
      if (source.retrievedAt) details.push(copy('diambil ', 'retrieved ') + formatDate(source.retrievedAt, true));
      if (source.lastSuccessfulAt) details.push(copy('penyegaran terakhir berhasil ', 'last successful refresh ') + formatDate(source.lastSuccessfulAt, true));
      if (source.lastOkAgeHours != null) details.push(copy('umur cache saat tangkapan ', 'cache age at capture ') + fmtNumber(source.lastOkAgeHours, 1) + ' h');
      if (source.subfeedCoverage) {
        details.push(fmtNumber(source.subfeedCoverage.availableFeeds, 0) + '/' + fmtNumber(source.subfeedCoverage.expectedFeeds, 0) + copy(' feed hulu berhasil', ' upstream feeds succeeded'));
        if (source.subfeedCoverage.failures.length) details.push(copy('feed hulu gagal: ', 'failed upstream feeds: ') + source.subfeedCoverage.failures.map(function (failure) { return failure.feed + ' (' + failure.error + ')'; }).join(', '));
      }
      if (source.lastError) details.push(copy('galat penyegaran terakhir: ', 'last refresh error: ') + source.lastError);
      if (error) details.push(copy('galat pengambilan: ', 'retrieval error: ') + error);
      if (!details.length) details.push(copy('cakupan feed tidak dirinci oleh sumber', 'feed coverage not specified by source'));
      return '<tr><td>' + escapeHtml(labels[key]) + citation(source.referenceId, refs) + '</td><td>' + escapeHtml(state) + '</td><td>' + escapeHtml(details.join(' · ')) + '</td></tr>';
    }).join('');
  }
  function sourceRowsWeekly(issue, refs) {
    var labels = {
      fires: copy('Titik api satelit', 'Satellite fire detections'),
      earthquakes: copy('Gempa BMKG', 'BMKG earthquakes'),
      tsunami: copy('Buletin tsunami', 'Tsunami bulletins'),
      eruptions: copy('Laporan letusan PVMBG', 'PVMBG eruption reports'),
      news: copy('Feed berita', 'News feed')
    };
    return Object.keys(labels).map(function (key) {
      var row = issue.sourceCoverage[key];
      if (!row) {
        return '<tr><td>' + escapeHtml(labels[key]) + '</td><td>' + escapeHtml(copy('tidak dilaporkan', 'not reported')) + '</td><td>' + escapeHtml(copy('metadata sumber tidak tersedia', 'source metadata unavailable')) + '</td></tr>';
      }
      var count = row.reportedSnapshots < row.expectedSnapshots
        ? copy('metadata dilaporkan ', 'metadata reported ') + fmtNumber(row.reportedSnapshots, 0) + '/' + fmtNumber(row.expectedSnapshots, 0) + '; '
        : '';
      count += fmtNumber(row.availableSnapshots, 0) + ' / ' + fmtNumber(row.expectedSnapshots, 0);
      if (row.partialSnapshots) count += ' · ' + fmtNumber(row.fullyCoveredSnapshots, 0) + ' ' + copy('cakupan penuh', 'fully covered');
      var interpretation = row.complete
        ? copy('feed tersedia penuh pada setiap snapshot', 'feed fully available in every snapshot')
        : row.reportedSnapshots < row.expectedSnapshots
          ? copy('sebagian status tidak dilaporkan; kekosongan tidak dianggap nol', 'some statuses unreported; missing coverage is not zero')
          : row.availableSnapshots === 0
            ? copy('feed tidak tersedia pada semua snapshot', 'feed unavailable in every snapshot')
            : row.partialSnapshots > 0
              ? copy('feed tersedia, tetapi ada snapshot dengan data sumber parsial, rekaman ditolak, atau cache usang', 'feed is available, but some snapshots have partial source coverage, rejected records, or stale cache')
              : copy('feed hanya tersedia pada sebagian snapshot', 'feed available in only some snapshots');
      if (row.subfeedCoverageBySnapshot && row.subfeedCoverageBySnapshot.length) {
        var subfeedDetails = row.subfeedCoverageBySnapshot.map(function (snapshot) {
          var summary = String(snapshot.reportDate || copy('tanggal tidak tersedia', 'date unavailable')) + ': '
            + fmtNumber(snapshot.availableFeeds, 0) + '/' + fmtNumber(snapshot.expectedFeeds, 0);
          if (snapshot.failures && snapshot.failures.length) summary += ' (' + snapshot.failures.map(function (failure) { return failure.feed + ': ' + failure.error; }).join(', ') + ')';
          return summary;
        }).join('; ');
        interpretation += copy(' · cakupan subfeed per hari: ', ' · upstream feed coverage by day: ') + subfeedDetails;
      }
      return '<tr><td>' + escapeHtml(labels[key]) + citation(row.referenceId, refs) + '</td><td>'
        + escapeHtml(count) + '</td><td>' + escapeHtml(interpretation) + '</td></tr>';
    }).join('');
  }
  function renderHotspotTable(series, refs) {
    if (!series || !series.length) return '<p class="report-note">' + escapeHtml(copy('Tidak ada ringkasan hotspot yang terarsip pada edisi ini; ketiadaan data bukan berarti nol deteksi.', 'No hotspot summary is archived for this issue; missing data does not mean zero detections.')) + '</p>';
    var rows = series.map(function (item) {
      var ref = item.referenceId ? citation(item.referenceId, refs) : '';
      return '<tr><td>' + escapeHtml(formatDate(item.reportDate + 'T12:00:00+07:00', false)) + '</td><td>'
        + escapeHtml(item.reportedTotal == null ? copy('tidak tersedia', 'unavailable') : fmtNumber(item.reportedTotal, 0))
        + '</td><td>' + escapeHtml(fmtNumber(item.highConfidence, 0))
        + '</td><td>' + escapeHtml(item.totalFrpMw == null ? copy('tidak tersedia', 'not available') : fmtNumber(item.totalFrpMw, 0) + ' MW')
        + (item.truncated ? ' · ' + escapeHtml(copy('rekaman dikurangi', 'records capped')) : '') + ref + '</td></tr>';
    }).join('');
    return '<div class="report-table-wrap"><table class="report-table"><thead><tr><th>' + escapeHtml(copy('Tanggal tangkapan', 'Capture date')) + '</th><th>' + escapeHtml(copy('Deteksi dilaporkan', 'Reported detections')) + '</th><th>' + escapeHtml(copy('Keyakinan tinggi', 'High confidence')) + '</th><th>FRP</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function chartNumber(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }
  function shortReportDate(value) {
    var text = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return copy('tanggal tidak tersedia', 'date unavailable');
    var date = new Date(text + 'T12:00:00+07:00');
    if (!Number.isFinite(date.getTime())) return copy('tanggal tidak tersedia', 'date unavailable');
    return new Intl.DateTimeFormat(en() ? 'en-US' : 'id-ID', {
      timeZone: 'Asia/Jakarta', month: 'short', day: 'numeric'
    }).format(date);
  }
  function renderDailyHotspotFigure(observation, refs) {
    var total = observation ? chartNumber(observation.reportedTotal) : null;
    if (total === null) return '<p class="report-note">' + escapeHtml(copy(
      'Grafik deteksi tidak dibuat karena ringkasan jumlah hotspot tidak tersedia; data hilang bukan nol.',
      'Detection chart omitted because the hotspot-count summary is unavailable; missing data is not zero.'
    )) + '</p>';
    var high = observation ? chartNumber(observation.highConfidence) : null;
    if (high !== null && high > total) high = null;
    var frp = observation ? chartNumber(observation.totalFrpMw) : null;
    var rows = [
      { label: copy('Semua deteksi', 'All detections'), value: total, color: '#176b7d' },
      { label: copy('Keyakinan tinggi', 'High confidence'), value: high, color: '#bd7414' }
    ];
    var maximum = Math.max(1, total, high === null ? 0 : high);
    var width = 860;
    var left = 224;
    var barWidth = 520;
    var top = 42;
    var chartHeight = 78;
    var height = 156;
    var ticks = [0, Math.round(maximum / 2), maximum].filter(function (value, index, array) {
      return array.indexOf(value) === index;
    });
    var title = copy('Deteksi titik api dan keyakinan sumber', 'Hotspot detections and source confidence');
    var description = copy(
      'Perbandingan jumlah deteksi FIRMS dengan subset deteksi berkeyakinan tinggi. Ini bukan hitungan orang terdampak atau perimeter kebakaran.',
      'Comparison of FIRMS detections with the high-confidence subset. These are not counts of people affected or fire perimeters.'
    );
    var svg = '<svg class="report-chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="daily-hotspot-title daily-hotspot-desc">'
      + '<title id="daily-hotspot-title">' + escapeHtml(title) + '</title>'
      + '<desc id="daily-hotspot-desc">' + escapeHtml(description) + '</desc>';
    ticks.forEach(function (tick) {
      var x = left + (tick / maximum) * barWidth;
      svg += '<line x1="' + x + '" y1="' + (top - 13) + '" x2="' + x + '" y2="' + (top + chartHeight) + '" stroke="#d9dde0" stroke-width="1" />'
        + '<text x="' + x + '" y="' + (top + chartHeight + 18) + '" text-anchor="middle" fill="#5d6670" font-size="12">' + escapeHtml(fmtNumber(tick, 0)) + '</text>';
    });
    rows.forEach(function (row, index) {
      var y = top + 15 + index * 38;
      svg += '<text x="12" y="' + (y + 5) + '" fill="#292e33" font-size="14">' + escapeHtml(row.label) + '</text>';
      if (row.value === null) {
        svg += '<text x="' + (left + 9) + '" y="' + (y + 5) + '" fill="#68717b" font-size="13">' + escapeHtml(copy('tidak tersedia', 'not available')) + '</text>';
      } else {
        var scaled = (row.value / maximum) * barWidth;
        svg += '<rect x="' + left + '" y="' + (y - 11) + '" width="' + scaled.toFixed(2) + '" height="18" rx="3" fill="' + row.color + '" />'
          + '<text x="' + (left + scaled + 8) + '" y="' + (y + 5) + '" fill="#292e33" font-size="13" font-weight="700">' + escapeHtml(fmtNumber(row.value, 0)) + '</text>';
      }
    });
    svg += '</svg>';
    var sourceWindow = observation.coverageStart || observation.coverageEnd
      ? copy('Jendela sumber: ', 'Source window: ')
        + (observation.coverageStart ? formatDate(observation.coverageStart, true) : copy('awal tidak tersedia', 'start unavailable'))
        + ' - ' + (observation.coverageEnd ? formatDate(observation.coverageEnd, true) : copy('akhir tidak tersedia', 'end unavailable'))
      : copy('Rentang akuisisi sumber tidak tersedia.', 'Source acquisition range unavailable.');
    var frpText = frp === null ? '' : copy(' · FRP total ', ' · Total FRP ') + fmtNumber(frp, 0) + ' MW';
    var confidenceNote = copy(
      'Deteksi berkeyakinan tinggi adalah subset dari total, bukan kategori tambahan. FRP adalah daya radiasi api dari sumber.',
      'High-confidence detections are a subset of the total, not an additional category. FRP is source-reported fire radiative power.'
    );
    return '<figure class="report-figure"><div class="report-chart-wrap">' + svg + '</div><figcaption class="report-figure-caption"><strong>'
      + escapeHtml(title) + '</strong><span>' + escapeHtml(sourceWindow + frpText) + citation(observation.referenceId, refs)
      + '</span><span class="report-figure-note">' + escapeHtml(confidenceNote) + '</span></figcaption></figure>';
  }
  function renderProvinceRankingFigure(observation, refs) {
    var ranking = observation && Array.isArray(observation.provinceRanking) ? observation.provinceRanking.filter(function (item) {
      return item && String(item.province || '').trim() && chartNumber(item.hotspots) !== null;
    }).slice().sort(function (a, b) { return chartNumber(b.hotspots) - chartNumber(a.hotspots); }) : [];
    var rows = ranking.slice(0, 10);
    if (!rows.length) return '<p class="report-note">' + escapeHtml(copy(
      'Ranking provinsi tidak tersimpan pada snapshot ini; grafik tidak dibuat dan ketiadaan data bukan nol.',
      'No province ranking is stored in this snapshot; no chart is drawn and missing data is not zero.'
    )) + '</p>';
    var maximum = Math.max(1, ...rows.map(function (item) { return chartNumber(item.hotspots); }));
    var width = 900;
    var left = 250;
    var barWidth = 540;
    var top = 38;
    var rowHeight = 28;
    var chartHeight = rows.length * rowHeight;
    var height = top + chartHeight + 30;
    var ticks = [0, Math.round(maximum / 2), maximum].filter(function (value, index, array) {
      return array.indexOf(value) === index;
    });
    var title = copy('Perkiraan deteksi hotspot menurut kotak provinsi', 'Estimated hotspot detections by province box');
    var svg = '<svg class="report-chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="province-hotspot-title province-hotspot-desc">'
      + '<title id="province-hotspot-title">' + escapeHtml(title) + '</title>'
      + '<desc id="province-hotspot-desc">' + escapeHtml(copy(
        'Sepuluh nilai tertinggi dalam ranking yang disimpan. Penetapan wilayah menggunakan kotak koordinat kasar SIAGA-ID.',
        'The ten highest values in the archived ranking. Geographic assignment uses coarse SIAGA-ID coordinate boxes.'
      )) + '</desc>';
    ticks.forEach(function (tick) {
      var x = left + (tick / maximum) * barWidth;
      svg += '<line x1="' + x + '" y1="' + (top - 8) + '" x2="' + x + '" y2="' + (top + chartHeight - 4) + '" stroke="#d9dde0" stroke-width="1" />'
        + '<text x="' + x + '" y="' + (top + chartHeight + 18) + '" text-anchor="middle" fill="#5d6670" font-size="12">' + escapeHtml(fmtNumber(tick, 0)) + '</text>';
    });
    rows.forEach(function (item, index) {
      var value = chartNumber(item.hotspots);
      var y = top + index * rowHeight + 15;
      var scaled = (value / maximum) * barWidth;
      svg += '<text x="12" y="' + (y + 4) + '" fill="#292e33" font-size="13">' + escapeHtml(item.province) + '</text>'
        + '<rect x="' + left + '" y="' + (y - 10) + '" width="' + scaled.toFixed(2) + '" height="17" rx="3" fill="#176b7d" />'
        + '<text x="' + (left + scaled + 8) + '" y="' + (y + 4) + '" fill="#292e33" font-size="12" font-weight="700">' + escapeHtml(fmtNumber(value, 0)) + '</text>';
    });
    svg += '</svg>';
    var meta = observation.provinceRankingMeta || {};
    var note = copy(
      'Klasifikasi provinsi memakai kotak lintang-bujur kasar SIAGA-ID, bukan poligon batas administrasi atau statistik resmi. Grafik hanya menampilkan hingga sepuluh baris teratas dari ranking sumber.',
      'Province assignment uses coarse SIAGA-ID latitude-longitude boxes, not administrative boundary polygons or official statistics. The figure shows up to the ten highest rows in the source ranking.'
    );
    if (meta.assignedDetectionCount != null || meta.unassignedDetectionCount != null) {
      note += ' ' + copy('Dikelompokkan ', 'Assigned ') + fmtNumber(meta.assignedDetectionCount, 0)
        + copy(' deteksi; di luar kotak ', ' detections; outside province boxes ')
        + fmtNumber(meta.unassignedDetectionCount, 0) + '.';
    }
    if (meta.truncated === true) {
      note += ' ' + copy('Ranking sumber dipotong pada ', 'Source ranking capped at ') + fmtNumber(meta.maxReturned, 0) + copy(' baris.', ' rows.');
    }
    return '<figure class="report-figure"><div class="report-chart-wrap">' + svg + '</div><figcaption class="report-figure-caption"><strong>'
      + escapeHtml(title) + '</strong><span>' + escapeHtml(note) + citation(observation.referenceId, refs)
      + '</span></figcaption></figure>';
  }
  function renderWeeklyHotspotFigure(series, refs) {
    var items = Array.isArray(series) ? series.filter(function (item) { return item && typeof item === 'object'; }).slice(-7) : [];
    if (!items.length) return '<p class="report-note">' + escapeHtml(copy(
      'Tidak ada ringkasan hotspot tersimpan untuk grafik mingguan; data yang hilang tidak dianggap nol.',
      'No archived hotspot summaries are available for a weekly chart; missing data is not treated as zero.'
    )) + '</p>';
    var maximum = 1;
    items.forEach(function (item) {
      var total = chartNumber(item.reportedTotal);
      var high = chartNumber(item.highConfidence);
      if (total !== null) maximum = Math.max(maximum, total);
      if (high !== null) maximum = Math.max(maximum, high);
    });
    var width = 860;
    var height = 310;
    var left = 66;
    var right = 24;
    var top = 58;
    var bottom = 56;
    var plotWidth = width - left - right;
    var plotHeight = height - top - bottom;
    var baseY = top + plotHeight;
    var slotWidth = plotWidth / items.length;
    var barWidth = Math.min(30, Math.max(10, slotWidth * 0.28));
    var title = copy('Deteksi hotspot per snapshot tersimpan', 'Hotspot detections by archived snapshot');
    var description = copy(
      'Setiap kelompok batang mewakili satu snapshot. Total deteksi dan subset keyakinan tinggi tidak dijumlahkan menjadi total mingguan; nilai yang tidak tersedia dibiarkan kosong.',
      'Each bar group represents one snapshot. Total detections and the high-confidence subset are not added into a weekly total; unavailable values are left blank.'
    );
    var svg = '<svg class="report-chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="weekly-hotspot-title weekly-hotspot-desc">'
      + '<title id="weekly-hotspot-title">' + escapeHtml(title) + '</title>'
      + '<desc id="weekly-hotspot-desc">' + escapeHtml(description) + '</desc>';
    var legendY = 21;
    svg += '<rect x="' + left + '" y="' + (legendY - 10) + '" width="12" height="12" rx="2" fill="#176b7d" />'
      + '<text x="' + (left + 18) + '" y="' + legendY + '" fill="#3d444a" font-size="12">' + escapeHtml(copy('Semua deteksi', 'All detections')) + '</text>'
      + '<rect x="' + (left + 178) + '" y="' + (legendY - 10) + '" width="12" height="12" rx="2" fill="#bd7414" />'
      + '<text x="' + (left + 196) + '" y="' + legendY + '" fill="#3d444a" font-size="12">' + escapeHtml(copy('Keyakinan tinggi (subset)', 'High confidence (subset)')) + '</text>';
    [0, Math.round(maximum / 2), maximum].filter(function (value, index, array) {
      return array.indexOf(value) === index;
    }).forEach(function (tick) {
      var y = baseY - (tick / maximum) * plotHeight;
      svg += '<line x1="' + left + '" y1="' + y + '" x2="' + (left + plotWidth) + '" y2="' + y + '" stroke="#d9dde0" stroke-width="1" />'
        + '<text x="' + (left - 10) + '" y="' + (y + 4) + '" text-anchor="end" fill="#5d6670" font-size="11">' + escapeHtml(fmtNumber(tick, 0)) + '</text>';
    });
    items.forEach(function (item, index) {
      var center = left + slotWidth * (index + 0.5);
      var total = chartNumber(item.reportedTotal);
      var high = chartNumber(item.highConfidence);
      if (high !== null && total !== null && high > total) high = null;
      var totalX = center - barWidth - 2;
      var highX = center + 2;
      if (total === null) {
        svg += '<text x="' + (totalX + barWidth / 2) + '" y="' + (baseY - 6) + '" text-anchor="middle" fill="#68717b" font-size="10">N/A</text>';
      } else {
        var totalHeight = (total / maximum) * plotHeight;
        svg += '<rect x="' + totalX + '" y="' + (baseY - totalHeight) + '" width="' + barWidth + '" height="' + Math.max(totalHeight, total === 0 ? 1 : 0) + '" rx="2" fill="#176b7d"><title>'
          + escapeHtml(shortReportDate(item.reportDate) + ': ' + fmtNumber(total, 0)) + '</title></rect>';
      }
      if (high === null) {
        svg += '<text x="' + (highX + barWidth / 2) + '" y="' + (baseY - 6) + '" text-anchor="middle" fill="#68717b" font-size="10">N/A</text>';
      } else {
        var highHeight = (high / maximum) * plotHeight;
        svg += '<rect x="' + highX + '" y="' + (baseY - highHeight) + '" width="' + barWidth + '" height="' + Math.max(highHeight, high === 0 ? 1 : 0) + '" rx="2" fill="#bd7414"><title>'
          + escapeHtml(shortReportDate(item.reportDate) + ': ' + fmtNumber(high, 0)) + '</title></rect>';
      }
      svg += '<text x="' + center + '" y="' + (baseY + 23) + '" text-anchor="middle" fill="#3d444a" font-size="11">' + escapeHtml(shortReportDate(item.reportDate)) + '</text>';
    });
    svg += '</svg>';
    var reference = items.find(function (item) { return item.referenceId; });
    var note = copy(
      'Setiap nilai berasal dari jendela sumber per snapshot; jendela bergulir dapat bertumpang-tindih, jadi grafik bukan total mingguan. Deteksi keyakinan tinggi adalah subset. N/A berarti nilai tidak tersedia, bukan nol.',
      'Each value comes from a source window in its snapshot; rolling windows may overlap, so this is not a weekly total. High-confidence detections are a subset. N/A means unavailable, not zero.'
    );
    return '<figure class="report-figure"><div class="report-chart-wrap">' + svg + '</div><figcaption class="report-figure-caption"><strong>'
      + escapeHtml(title) + '</strong><span>' + escapeHtml(note) + (reference ? citation(reference.referenceId, refs) : '')
      + '</span></figcaption></figure>';
  }
  function renderReferences(references) {
    if (!references || !references.length) return '<p class="report-note">' + escapeHtml(copy('Belum ada referensi yang dapat ditampilkan.', 'No verifiable references are available.')) + '</p>';
    return '<ol class="report-refs">' + references.map(function (ref, index) {
      var url = safeUrl(ref.url);
      var title = ref.title || ref.publisher || url || copy('Referensi', 'Reference');
      var meta = [ref.publisher, ref.sourceType, ref.publishedAt && copy('terbit ', 'published ') + formatDate(ref.publishedAt, true), ref.accessedAt && copy('diakses ', 'accessed ') + formatDate(ref.accessedAt, true)].filter(Boolean).join(' · ');
      return '<li id="ref-' + (index + 1) + '"><span data-i18n-skip class="report-source-title">' + escapeHtml(title) + '</span> - ' + (url ? sourceLink(url, url) : '')
        + '<span class="report-ref-meta">' + escapeHtml(meta) + '</span></li>';
    }).join('') + '</ol>';
  }
  function renderContexts(contexts, refs) {
    if (!contexts || !contexts.length) return '';
    return '<section class="report-section"><h2>' + escapeHtml(copy('Laporan konteks yang dibawa', 'Carried-forward context reports')) + '</h2>'
      + '<p>' + escapeHtml(copy('Sumber berikut memberi konteks, tetapi tanggal penerbitannya berada di luar periode laporan; sumber ini bukan peristiwa baru dalam periode.', 'These sources provide context, but their publication dates fall outside this report period; they are not new events in the period.')) + '</p><ul>'
      + contexts.map(function (context) {
        var summary = en() ? context.summaryEn : context.summaryId;
        return '<li><strong>' + escapeHtml(context.publisher + ': ' + context.title) + '</strong>'
          + citation(context.referenceId, refs)
          + '<span class="report-event-meta">' + escapeHtml(context.publishedAt ? formatDate(context.publishedAt, true) : copy('tanggal tidak tersedia', 'date unavailable')) + (context.carryForward ? ' · ' + escapeHtml(copy('konteks arsip', 'archived context')) : '') + '</span>'
          + (summary ? '<span class="report-source-quote" data-i18n-skip>' + escapeHtml(summary) + '</span>' : '') + '</li>';
      }).join('') + '</ul></section>';
  }
  function renderDaily(snapshot) {
    var references = snapshot.references || [];
    var refs = referenceMap(references);
    var events = Array.isArray(snapshot.events) ? snapshot.events : [];
    var sourceCount = snapshot.coverage || {};
    var qualityPartial = snapshot.quality !== 'complete';
    var abstract = copy(
      'Snapshot harian ini merangkum ',
      'This daily snapshot summarizes '
    ) + fmtNumber(events.length, 0) + copy(' rekaman bertaut sumber dalam jendela 24 jam. ', ' source-linked records in a 24-hour window. ')
      + fmtNumber(sourceCount.availableSources, 0) + '/' + fmtNumber(sourceCount.expectedSources, 0)
      + copy(' feed tersedia saat pengambilan. Rekaman yang tidak memiliki waktu atau rujukan valid tidak dimasukkan.', ' feeds were available at capture time. Records without a valid timestamp or reference are excluded.');
    var eventHtml = events.length
      ? '<ol class="report-event-list">' + events.map(function (event) { return renderEvent(event, refs); }).join('') + '</ol>'
      : '<p class="report-note">' + escapeHtml(copy('Tidak ada rekaman bertanggal dan berujukan yang tersedia dalam snapshot periode ini. Ini bukan bukti bahwa tidak ada kejadian.', 'No timestamped, referenced records were available in this period snapshot. This is not evidence that no events occurred.')) + '</p>';
    var hotspot = snapshot.observations && snapshot.observations.hotspots;
    var hotspotSummary = hotspot
      ? '<p>' + escapeHtml(copy('NASA FIRMS melaporkan ', 'NASA FIRMS reported ')) + '<strong>' + escapeHtml(fmtNumber(hotspot.reportedTotal, 0)) + '</strong> '
        + escapeHtml(copy('deteksi pada jendela sumber yang tercatat ', 'detections in the recorded source window '))
        + escapeHtml((hotspot.coverageStart ? formatDate(hotspot.coverageStart, true) : '-') + ' - ' + (hotspot.coverageEnd ? formatDate(hotspot.coverageEnd, true) : '-'))
        + citation(hotspot.referenceId, refs) + '.</p><p class="report-note">' + escapeHtml(hotspot.interpretation || copy('Deteksi hotspot bukan batas kebakaran atau jumlah orang terdampak.', 'Hotspot detections are not fire perimeters or counts of people affected.'))
        + (hotspot.truncated ? ' ' + escapeHtml(copy('Daftar titik yang disertakan dipotong; angka total mengikuti metadata sumber.', 'The included point list was capped; the total follows source metadata.')) : '') + '</p>'
      : '<p class="report-note">' + escapeHtml(copy('Ringkasan hotspot tidak tersedia pada snapshot; tidak ditafsirkan sebagai nol.', 'Hotspot summary is unavailable in this snapshot; it is not interpreted as zero.')) + '</p>';
    return '<header class="report-header"><p class="report-kicker">' + escapeHtml(copy('Laporan harian · SIAGA-ID', 'Daily report · SIAGA-ID')) + '</p>'
      + '<h1 class="report-title">' + escapeHtml(copy('Catatan Situasi Bencana Indonesia', 'Indonesia Disaster Situation Report')) + '</h1>'
      + '<div class="report-byline"><span>' + escapeHtml(copy('Periode: ', 'Period: ') + formatRange(snapshot.period)) + '</span><span>' + escapeHtml(copy('Diambil: ', 'Captured: ') + formatDate(snapshot.capturedAt, true)) + '</span><span class="report-status-pill' + (qualityPartial ? ' partial' : '') + '">' + escapeHtml(snapshot.quality || 'partial') + '</span></div></header>'
      + '<section class="report-abstract"><h2>' + escapeHtml(copy('Abstrak', 'Abstract')) + '</h2><p>' + escapeHtml(abstract) + '</p></section>'
      + '<section class="report-section"><h2>1. ' + escapeHtml(copy('Metode dan cakupan data', 'Methods and data coverage')) + '</h2>'
      + '<p>' + escapeHtml(copy('Edisi ini menggunakan snapshot bergulir 24 jam yang berakhir pada waktu pengambilan. Kejadian dimasukkan hanya jika waktu sumber berada di dalam jendela dan tersedia rujukan HTTP(S). Feed gagal atau hilang ditandai tidak tersedia, bukan nol.', 'This issue uses a rolling 24-hour snapshot ending at capture time. Events are included only when the source timestamp falls inside the window and an HTTP(S) reference is available. Failed or missing feeds are marked unavailable, not zero.')) + '</p>'
      + '<div class="report-table-wrap"><table class="report-table"><thead><tr><th>' + escapeHtml(copy('Feed', 'Feed')) + '</th><th>' + escapeHtml(copy('Status', 'Status')) + '</th><th>' + escapeHtml(copy('Cakupan yang dilaporkan', 'Reported coverage')) + '</th></tr></thead><tbody>' + sourceRowsDaily(snapshot, refs) + '</tbody></table></div></section>'
      + '<section class="report-section"><h2>2. ' + escapeHtml(copy('Pengamatan titik api', 'Fire hotspot observations')) + '</h2>' + hotspotSummary
      + (hotspot ? renderDailyHotspotFigure(hotspot, refs) + renderProvinceRankingFigure(hotspot, refs) : '') + '</section>'
      + '<section class="report-section"><h2>3. ' + escapeHtml(copy('Kronologi rekaman bertanggal', 'Timeline of timestamped records')) + '</h2>' + eventHtml + '</section>'
      + renderContexts(snapshot.contexts, refs)
      + '<section class="report-section"><h2>4. ' + escapeHtml(copy('Keterbatasan dan interpretasi', 'Limitations and interpretation')) + '</h2><ul>'
      + '<li>' + escapeHtml(copy('Titik api adalah deteksi satelit, bukan perimeter kebakaran atau bukti penyebab.', 'Hotspots are satellite detections, not fire perimeters or evidence of cause.')) + '</li>'
      + '<li>' + escapeHtml(copy('Plume asap bersifat indikatif; bukan batas pengamatan atau konsentrasi terukur. PM2.5 CAMS total tidak disamakan dengan konsentrasi asap spesifik.', 'Smoke plumes are indicative, not observed boundaries or measured concentrations. Total CAMS PM2.5 is not treated as a smoke-specific concentration.')) + '</li>'
      + '<li>' + escapeHtml(copy('Judul media mempertahankan bahasa sumber dan ditampilkan sebagai publikasi sekunder, bukan konfirmasi resmi.', 'Media headlines retain their source language and are presented as secondary publications, not official confirmation.')) + '</li>'
      + '<li>' + escapeHtml(copy('Snapshot yang hilang, feed gagal, atau jendela sumber yang lebih pendek membatasi cakupan; angka tidak diekstrapolasi ke waktu yang tidak tercatat.', 'Missing snapshots, failed feeds, or shorter source windows limit coverage; values are not extrapolated to unrecorded periods.')) + '</li>'
      + '</ul></section>'
      + '<section class="report-section"><h2>5. ' + escapeHtml(copy('Referensi', 'References')) + '</h2>' + renderReferences(references) + '</section>';
  }
  function renderBoundaryNotes(issue) {
    var items = [];
    (issue.coverageGaps || []).forEach(function (boundary) {
      items.push(copy('Celah ', 'Gap ') + fmtNumber(boundary.offsetMinutes, 1) + ' min ' + copy('antara snapshot ', 'between snapshots ') + String(boundary.previousDate || '') + ' / ' + String(boundary.nextDate || '') + '.');
    });
    (issue.coverageOverlaps || []).forEach(function (boundary) {
      items.push(copy('Jendela bertumpang tindih ', 'Overlapping windows ') + fmtNumber(Math.abs(boundary.offsetMinutes), 1) + ' min ' + copy('antara snapshot ', 'between snapshots ') + String(boundary.previousDate || '') + ' / ' + String(boundary.nextDate || '') + '; ' + copy('rekaman kejadian dideduplikasi berdasarkan ID sumber dan ringkasan hotspot tidak dijumlahkan.', 'event records are deduplicated by source ID and hotspot summaries are not added.'));
    });
    (issue.invalidSnapshotWindows || []).forEach(function (snapshot) {
      items.push(copy('Durasi snapshot ', 'Snapshot duration for ') + String(snapshot.reportDate || copy('tanpa tanggal', 'undated')) + ': ' + fmtNumber(snapshot.durationHours, 2) + ' h (' + copy('seharusnya 24 h', 'expected 24 h') + ').');
    });
    if (!items.length && issue.temporalComplete) items.push(copy('Tidak ditemukan celah waktu antar-snapshot.', 'No temporal gaps were found between snapshots.'));
    if (!items.length && issue.dailySnapshotCount < 2) items.push(copy('Snapshot belum cukup untuk menilai batas antar-hari.', 'There are not enough snapshots to assess day-to-day boundaries.'));
    if (!items.length && !issue.temporalComplete) items.push(copy('Arsip belum mencakup tujuh snapshot harian yang berurutan.', 'The archive does not yet contain seven consecutive daily snapshots.'));
    if (issue.newsTruncated) items.push(copy('Daftar berita mingguan dibatasi: ', 'Weekly news list capped: ') + fmtNumber(issue.newsRecordCountIncluded, 0) + '/' + fmtNumber(issue.newsRecordCountBeforeCap, 0) + copy(' judul terbaru dimasukkan; sisanya tidak ditampilkan.', ' most recent headlines included; the rest are omitted.'));
    return '<p class="report-note">' + escapeHtml(items.join(' ')) + '</p>';
  }

  function renderWeekly(issue) {
    var references = issue.references || [];
    var refs = referenceMap(references);
    var events = issue.events || [];
    var partial = !issue.complete;
    var eventHtml = events.length
      ? '<ol class="report-event-list">' + events.map(function (event) { return renderEvent(event, refs); }).join('') + '</ol>'
      : '<p class="report-note">' + escapeHtml(copy('Tidak ada rekaman bertanggal dengan rujukan yang terkumpul dari snapshot yang tersedia. Feed yang gagal tidak dihitung sebagai nol.', 'No timestamped, referenced records were collected from the available snapshots. Failed feeds are not counted as zero.')) + '</p>';
    var startLabel = issue.period && issue.period.start ? formatDate(issue.period.start, true) : '-';
    var endLabel = issue.period && issue.period.end ? formatDate(issue.period.end, true) : '-';
    var abstract = copy('Edisi mingguan ini menggabungkan ', 'This weekly issue combines ')
      + fmtNumber(issue.dailySnapshotCount, 0) + '/' + fmtNumber(issue.expectedDailySnapshots, 0)
      + copy(' snapshot harian yang tersedia, mencakup ', ' available daily snapshots, spanning ')
      + startLabel + ' - ' + endLabel + '. '
      + (issue.temporalComplete
        ? copy('Tujuh snapshot membentuk cakupan waktu tanpa celah yang terdeteksi.', 'Seven snapshots provide temporal coverage with no detected gaps.')
        : copy('Cakupan temporal parsial; periode atau tanggal yang hilang tidak diasumsikan tenang.', 'Temporal coverage is partial; missing periods or dates are not assumed to be quiet.'))
      + (issue.sourceCoverageComplete
        ? copy(' Semua feed tersedia pada tiap snapshot.', ' All feeds were available in every snapshot.')
        : copy(' Satu atau lebih feed tidak tersedia atau statusnya tidak dilaporkan.', ' One or more feeds were unavailable or their status was not reported.'))
      + (issue.dailyIssuesComplete
        ? ''
        : copy(' Satu atau lebih snapshot berstatus parsial; batas daftar atau data usang dicatat per edisi.', ' One or more daily snapshots are partial; record caps or stale data are documented per issue.'));
    var sourceCoverageRows = sourceRowsWeekly(issue, refs);
    var statusRows = issue.snapshots.map(function (snapshot) {
      var coverage = snapshot.coverage || {};
      return '<tr><td>' + escapeHtml(snapshot.reportDate || copy('tidak dilaporkan', 'not reported')) + '</td><td>' + escapeHtml(formatRange(snapshot.period)) + '</td><td>'
        + escapeHtml(fmtNumber(coverage.availableSources, 0) + '/' + fmtNumber(coverage.expectedSources, 0)) + '</td><td>'
        + escapeHtml(snapshot.quality || 'partial') + '</td></tr>';
    }).join('');
    return '<header class="report-header"><p class="report-kicker">' + escapeHtml(copy('Laporan mingguan · SIAGA-ID · Pekan ', 'Weekly report · SIAGA-ID · Week ') + String(issue.weekId || '')) + '</p>'
      + '<h1 class="report-title">' + escapeHtml(copy('Tinjauan Mingguan Peristiwa dan Sumber', 'Weekly Review of Events and Sources')) + '</h1>'
      + '<div class="report-byline"><span>' + escapeHtml(copy('Periode: ', 'Period: ') + startLabel + ' - ' + endLabel) + '</span><span>' + escapeHtml(fmtNumber(issue.dailySnapshotCount, 0) + '/' + fmtNumber(issue.expectedDailySnapshots, 0) + ' ' + copy('snapshot harian', 'daily snapshots')) + '</span><span class="report-status-pill' + (partial ? ' partial' : '') + '">' + escapeHtml(partial ? copy('parsial', 'partial') : copy('lengkap', 'complete')) + '</span></div></header>'
      + '<section class="report-abstract"><h2>' + escapeHtml(copy('Abstrak', 'Abstract')) + '</h2><p>' + escapeHtml(abstract) + '</p></section>'
      + '<section class="report-section"><h2>1. ' + escapeHtml(copy('Metode dan kelengkapan arsip', 'Methods and archive completeness')) + '</h2>'
      + '<p>' + escapeHtml(copy('Edisi persisten ini disusun dari snapshot harian tersimpan pada pekan ISO yang sama; label pekan mengikuti tanggal edisi. Kejadian dideduplikasi berdasarkan ID sumber. Jendela hotspot disajikan per snapshot dan tidak dijumlahkan. Rentang aktual dicantumkan agar batas pekan, celah, atau tumpang tindih terlihat.', 'This persistent issue is built from archived daily snapshots in the same ISO week; the week label follows each issue date. Events are deduplicated by source identifier. Hotspot windows are shown per snapshot and are not summed. Actual ranges are listed so week boundaries, gaps, or overlaps remain visible.')) + '</p>'
      + '<div class="report-table-wrap"><table class="report-table"><thead><tr><th>' + escapeHtml(copy('Tanggal edisi', 'Issue date')) + '</th><th>' + escapeHtml(copy('Rentang snapshot', 'Snapshot range')) + '</th><th>' + escapeHtml(copy('Feed tersedia', 'Feeds available')) + '</th><th>' + escapeHtml(copy('Kualitas', 'Quality')) + '</th></tr></thead><tbody>' + statusRows + '</tbody></table></div>'
      + renderBoundaryNotes(issue)
      + '<h3>' + escapeHtml(copy('Ketersediaan per sumber', 'Availability by source')) + '</h3><div class="report-table-wrap"><table class="report-table"><thead><tr><th>' + escapeHtml(copy('Sumber', 'Source')) + '</th><th>' + escapeHtml(copy('Snapshot tersedia', 'Available snapshots')) + '</th><th>' + escapeHtml(copy('Interpretasi cakupan', 'Coverage interpretation')) + '</th></tr></thead><tbody>' + sourceCoverageRows + '</tbody></table></div></section>'
      + '<section class="report-section"><h2>2. ' + escapeHtml(copy('Deret ringkasan titik api', 'Fire hotspot summary series')) + '</h2>'
      + renderWeeklyHotspotFigure(issue.hotspotSeries, refs)
      + renderHotspotTable(issue.hotspotSeries, refs)
      + '<p class="report-note">' + escapeHtml(copy('Nilai adalah ringkasan per snapshot; jangan dijumlahkan sebagai total mingguan. Daftar titik dapat dipotong oleh batas payload sumber.', 'Values are per-snapshot summaries; do not add them as a weekly total. Point lists may be capped by source payload limits.')) + '</p></section>'
      + '<section class="report-section"><h2>3. ' + escapeHtml(copy('Kronologi rekaman sumber', 'Timeline of source records')) + '</h2>' + eventHtml + '</section>'
      + renderContexts(issue.contexts, refs)
      + '<section class="report-section"><h2>4. ' + escapeHtml(copy('Keterbatasan dan interpretasi', 'Limitations and interpretation')) + '</h2><ul>'
      + '<li>' + escapeHtml(copy('Laporan hanya mencakup tanggal yang memiliki snapshot tersimpan; periode sebelum arsip pertama tidak diisi mundur.', 'The report covers only dates with stored snapshots; periods before the first archive are not backfilled.')) + '</li>'
      + '<li>' + escapeHtml(copy('Nilai feed yang tidak tersedia bukan nol. Ketidaklengkapan dapat mengubah jumlah rekaman yang tampil.', 'Unavailable feed values are not zero. Missing coverage can affect the records shown.')) + '</li>'
      + '<li>' + escapeHtml(copy('Plume tetap indikatif; hotspot, produk PM2.5 CAMS, dan laporan media tidak disamakan dengan pengukuran dampak lokal.', 'Plumes remain indicative; hotspots, CAMS PM2.5 products, and media reports are not treated as local impact measurements.')) + '</li>'
      + '</ul></section>'
      + '<section class="report-section"><h2>5. ' + escapeHtml(copy('Referensi', 'References')) + '</h2>' + renderReferences(references) + '</section>';
  }

  function emptyReport(message) {
    var content = document.getElementById('reportContent');
    if (content) content.innerHTML = '<div class="site-empty">' + escapeHtml(message) + '</div>';
    var print = document.getElementById('reportPrint');
    if (print) print.disabled = true;
  }
  function updateTabs() {
    document.querySelectorAll('.report-period-tab').forEach(function (button) {
      var active = button.getAttribute('data-period') === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }
  function optionsForMode() {
    var select = document.getElementById('reportSelect');
    var label = document.querySelector('.report-select-label');
    if (!select) return;
    var available = mode === 'weekly' ? weeklyEntries.slice() : archiveEntries.slice();
    var keyFor = function (entry) { return mode === 'weekly' ? entry.weekId : entry.date; };
    if (label) label.textContent = mode === 'weekly' ? copy('Pekan ISO tersimpan', 'Archived ISO week') : copy('Edisi harian', 'Daily issue');
    select.innerHTML = available.map(function (entry) {
      var key = String(keyFor(entry) || '');
      var quality = entry.quality === 'complete' ? '' : ' · ' + copy('parsial', 'partial');
      var labelText = mode === 'weekly'
        ? copy('Pekan ', 'Week ') + key + copy(' · hingga ', ' · through ') + String(entry.throughDate || '') + quality
        : key + quality;
      return '<option value="' + escapeHtml(key) + '">' + escapeHtml(labelText) + '</option>';
    }).join('');
    if (!available.length) {
      var emptyLabel = mode === 'weekly'
        ? copy('Arsip mingguan belum tersedia', 'No weekly archive yet')
        : copy('Arsip harian belum tersedia', 'No daily archive yet');
      select.innerHTML = '<option value="">' + escapeHtml(emptyLabel) + '</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    var wanted = selectedDate && available.some(function (entry) { return keyFor(entry) === selectedDate; })
      ? selectedDate : keyFor(available[available.length - 1]);
    selectedDate = wanted;
    select.value = wanted;
  }
  async function getSnapshot(entry) {
    if (!entry || !/^\d{4}-\d{2}-\d{2}\.json$/.test(String(entry.file || ''))) return null;
    if (snapshotsByDate.has(entry.date)) return snapshotsByDate.get(entry.date);
    try {
      var version = entry.capturedAt ? '?v=' + encodeURIComponent(entry.capturedAt) : '';
      var response = await fetch('/reports/archive/' + encodeURIComponent(entry.file) + version, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var snapshot = await response.json();
      if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.reportDate !== entry.date
        || (entry.capturedAt && snapshot.capturedAt !== entry.capturedAt)) throw new Error('archive schema mismatch');
      snapshotsByDate.set(entry.date, snapshot);
      return snapshot;
    } catch (_error) { return null; }
  }
  async function getWeeklyIssue(entry) {
    if (!entry || !/^\d{4}-W\d{2}$/.test(String(entry.weekId || ''))
      || entry.file !== 'weekly/' + entry.weekId + '.json') return null;
    if (weeklyById.has(entry.weekId)) return weeklyById.get(entry.weekId);
    try {
      var version = entry.capturedAt ? '?v=' + encodeURIComponent(entry.capturedAt) : '';
      var response = await fetch('/reports/archive/weekly/' + encodeURIComponent(entry.weekId + '.json') + version, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var issue = await response.json();
      if (!validWeeklyIssue(issue, entry)) throw new Error('weekly archive schema mismatch');
      weeklyById.set(entry.weekId, issue);
      return issue;
    } catch (_error) { return null; }
  }
  async function renderSelected() {
    if (loading) return;
    loading = true;
    updateTabs();
    optionsForMode();
    var select = document.getElementById('reportSelect');
    selectedDate = select && select.value || selectedDate;
    var selectedEntries = mode === 'weekly' ? weeklyEntries : archiveEntries;
    var selectedEntryKey = function (item) { return mode === 'weekly' ? item.weekId : item.date; };
    if (!selectedEntries.length || !selectedDate) {
      emptyReport(mode === 'weekly'
        ? copy('Arsip mingguan belum tersedia. Laporan mingguan akan muncul setelah snapshot harian tersimpan dan edisi ISO minggu ini dibuat.', 'No weekly archive is available yet. A weekly issue will appear after daily snapshots have been stored and an ISO-week issue is created.')
        : copy('Arsip laporan belum memiliki snapshot harian. Setelah penyimpanan harian aktif, edisi pertama akan tampil di sini; arsip historis tidak dibuat mundur.', 'The report archive has no daily snapshots yet. Once daily capture is active, the first issue will appear here; no historical backfill is fabricated.'));
      var statusEmpty = document.getElementById('archiveStatus');
      if (statusEmpty) statusEmpty.textContent = copy('Edisi yang belum tersedia tidak dibuat mundur; feed yang hilang bukan nol.', 'Unavailable issues are not backfilled; missing feeds are not zero.');
      loading = false;
      return;
    }
    var entry = selectedEntries.find(function (item) { return selectedEntryKey(item) === selectedDate; });
    var content = document.getElementById('reportContent');
    if (content) content.innerHTML = '<div class="site-empty">' + escapeHtml(copy('Membuka snapshot terverifikasi…', 'Loading archived evidence…')) + '</div>';
    var status = document.getElementById('archiveStatus');
    if (status) status.textContent = copy('Membaca arsip sumber…', 'Reading archived sources…');

    var html = '';
    var reportQuality = 'partial';
    if (mode === 'daily') {
      var snapshot = await getSnapshot(entry);
      if (!snapshot) {
        emptyReport(copy('Berkas snapshot ini tidak dapat dibaca atau skemanya tidak cocok.', 'This snapshot file could not be read or its schema is unsupported.'));
        if (status) status.textContent = copy('Gagal memuat edisi terpilih.', 'Could not load the selected issue.');
        loading = false;
        return;
      }
      html = renderDaily(snapshot);
      reportQuality = snapshot.quality;
      if (status) status.textContent = copy('Snapshot ', 'Snapshot ') + snapshot.reportDate + ' · ' + copy('diambil ', 'captured ') + formatDate(snapshot.capturedAt, true)
        + ' · ' + fmtNumber(snapshot.coverage && snapshot.coverage.availableSources, 0) + '/' + fmtNumber(snapshot.coverage && snapshot.coverage.expectedSources, 0) + copy(' feed tersedia.', ' feeds available.');
    } else {
      var issue = await getWeeklyIssue(entry);
      if (!issue) {
        emptyReport(copy('Berkas arsip mingguan tidak dapat dibaca atau skemanya tidak cocok.', 'The archived weekly issue could not be read or its schema is unsupported.'));
        if (status) status.textContent = copy('Gagal memuat arsip mingguan.', 'Could not load the weekly archive.');
        loading = false;
        return;
      }
      html = renderWeekly(issue);
      reportQuality = issue.quality || (issue.complete ? 'complete' : 'partial');
      if (status) status.textContent = fmtNumber(issue.dailySnapshotCount, 0) + '/' + fmtNumber(issue.expectedDailySnapshots, 0) + ' '
        + copy('snapshot harian tersimpan untuk ', 'daily snapshots archived for ') + issue.weekId
        + copy(' hingga ', ' through ') + issue.throughDate + (issue.complete ? '' : ' · ' + copy('cakupan parsial', 'partial coverage'));
    }
    if (content) content.innerHTML = html;
    var printButton = document.getElementById('reportPrint');
    if (printButton) printButton.disabled = !html;
    if (content) content.setAttribute('data-report-quality', reportQuality);
    loading = false;
  }
  async function loadArchive() {
    var status = document.getElementById('archiveStatus');
    try {
      var response = await fetch('/reports/archive/index.json', { headers: { Accept: 'application/json' }, cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var index = await response.json();
      if (!index || index.schemaVersion !== 1 || !Array.isArray(index.reports)) throw new Error('unsupported archive index');
      archiveEntries = index.reports.filter(function (entry) {
        return entry && /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || ''))
          && /^\d{4}-\d{2}-\d{2}\.json$/.test(String(entry.file || ''));
      }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      weeklyEntries = (Array.isArray(index.weeklyReports) ? index.weeklyReports : []).filter(function (entry) {
        return entry && /^\d{4}-W\d{2}$/.test(String(entry.weekId || ''))
          && entry.file === 'weekly/' + entry.weekId + '.json'
          && /^\d{4}-\d{2}-\d{2}$/.test(String(entry.throughDate || ''));
      }).sort(function (a, b) { return String(a.weekId).localeCompare(String(b.weekId)); });
      if (status) status.textContent = archiveEntries.length || weeklyEntries.length
        ? copy('Arsip: ', 'Archive: ') + fmtNumber(archiveEntries.length, 0) + copy(' edisi harian dan ', ' daily issues and ') + fmtNumber(weeklyEntries.length, 0) + copy(' edisi mingguan tersimpan.', ' weekly issues stored.')
        : copy('Belum ada snapshot terarsip. Snapshot pertama akan tersedia setelah pipeline harian berhasil dijalankan.', 'No archived snapshots yet. The first issue will appear after the daily capture pipeline succeeds.');
      renderSelected();
    } catch (_error) {
      archiveEntries = [];
      weeklyEntries = [];
      if (status) status.textContent = copy('Indeks arsip tidak dapat dimuat. Coba muat ulang halaman nanti.', 'The archive index could not be loaded. Try reloading the page later.');
      emptyReport(copy('Arsip belum dapat diakses. Tidak ada laporan historis yang dibuat-buat.', 'The archive is unavailable. No historical report has been fabricated.'));
    }
  }

  document.querySelectorAll('.report-period-tab').forEach(function (button) {
    button.addEventListener('click', function () {
      mode = button.getAttribute('data-period') === 'weekly' ? 'weekly' : 'daily';
      renderSelected();
    });
    button.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      mode = mode === 'daily' ? 'weekly' : 'daily';
      document.getElementById(mode === 'daily' ? 'periodDaily' : 'periodWeekly').focus();
      renderSelected();
    });
  });
  var select = document.getElementById('reportSelect');
  if (select) select.addEventListener('change', function () { selectedDate = select.value; renderSelected(); });
  var printButton = document.getElementById('reportPrint');
  if (printButton) printButton.addEventListener('click', function () { if (!printButton.disabled) window.print(); });
  window.addEventListener('siaga:languagechange', function () { optionsForMode(); renderSelected(); });
  loadArchive();
})(typeof window !== 'undefined' ? window : null, typeof document !== 'undefined' ? document : null);
