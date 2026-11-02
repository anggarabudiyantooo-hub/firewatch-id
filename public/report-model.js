/* Shared, deterministic report normalization for browser and archive runner. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SiagaReportModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var WEEK_DAYS = 7;
  var TZ = 'Asia/Jakarta';
  var MAX_NEWS_RECORDS = 40;
  var MAX_WEEKLY_NEWS_RECORDS = 120;
  var SOURCE_KEYS = ['fires', 'earthquakes', 'tsunami', 'eruptions', 'news'];
  var FALLBACKS = {
    firms: { publisher: 'NASA FIRMS', title: 'NASA Fire Information for Resource Management System', url: 'https://firms.modaps.eosdis.nasa.gov/' },
    bmkg: { publisher: 'BMKG', title: 'BMKG earthquake information', url: 'https://www.bmkg.go.id/gempabumi' },
    ptwc: { publisher: 'NOAA / Pacific Tsunami Warning Center', title: 'Tsunami bulletins', url: 'https://www.tsunami.gov/' },
    magma: { publisher: 'PVMBG / MAGMA Indonesia', title: 'Volcanic eruption reports from observation posts', url: 'https://magma.esdm.go.id/' },
    asmc: { publisher: 'ASMC', title: 'ASEAN Specialised Meteorological Centre regional haze situation', url: 'https://wis2.asmc.asean.org/regional-haze-situation/' }
  };

  function asDate(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
    if (typeof value === 'number') return Number.isFinite(value) ? new Date(value) : null;
    if (value == null || typeof value === 'boolean') return null;
    var text = String(value).trim();
    if (!text) return null;
    var gdelt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(text);
    if (gdelt) {
      var parts = gdelt.slice(1).map(Number);
      var parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
      if (parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[3] > 23 || parts[4] > 59 || parts[5] > 59
        || parsed.getUTCFullYear() !== parts[0] || parsed.getUTCMonth() + 1 !== parts[1]
        || parsed.getUTCDate() !== parts[2] || parsed.getUTCHours() !== parts[3]
        || parsed.getUTCMinutes() !== parts[4] || parsed.getUTCSeconds() !== parts[5]) return null;
      return parsed;
    }
    var ms = Date.parse(text);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }

  function iso(value) {
    var d = asDate(value);
    return d ? d.toISOString() : null;
  }

  function localDate(value) {
    var d = asDate(value);
    if (!d) return null;
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    var map = {};
    parts.forEach(function (part) { if (part.type !== 'literal') map[part.type] = part.value; });
    return map.year + '-' + map.month + '-' + map.day;
  }

  function isoWeekId(value) {
    var dateText = localDate(value);
    if (!dateText) return null;
    var parts = dateText.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    var weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - weekday);
    var isoYear = date.getUTCFullYear();
    var yearStart = new Date(Date.UTC(isoYear, 0, 1));
    var week = Math.ceil((((date.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
    return isoYear + '-W' + String(week).padStart(2, '0');
  }

  function isInside(value, start, end) {
    var d = asDate(value);
    var from = asDate(start);
    var to = asDate(end);
    return !!d && !!from && !!to && d.getTime() >= from.getTime() && d.getTime() < to.getTime();
  }

  function safeUrl(value) {
    try {
      var u = new URL(String(value || ''));
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      return u.href;
    } catch (_error) {
      return null;
    }
  }

  function compact(value, max) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 1200);
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || (typeof value !== 'number' && typeof value !== 'string')) return null;
    if (typeof value === 'string' && !value.trim()) return null;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function makeId(type, parts) {
    return type + ':' + parts.map(function (part) {
      return encodeURIComponent(String(part == null ? '' : part).trim().toLowerCase());
    }).join('|').slice(0, 260);
  }

  function normalizeFeedCoverage(value) {
    if (!value || typeof value !== 'object') return null;
    var expected = numberOrNull(value.expectedFeeds);
    var available = numberOrNull(value.availableFeeds);
    if (expected === null || available === null || expected < 1 || available < 0 || available > expected) return null;
    var failures = Array.isArray(value.failures) ? value.failures.map(function (item) {
      return {
        feed: compact(item && item.feed || 'upstream feed', 120),
        error: compact(item && item.error || 'feed unavailable', 120)
      };
    }) : [];
    return { expectedFeeds: expected, availableFeeds: available, complete: available === expected, failures: failures };
  }

  function buildDailySnapshot(input, capturedAt, errors) {
    input = input || {};
    var captured = asDate(capturedAt) || new Date();
    var periodEnd = captured;
    var periodStart = new Date(captured.getTime() - DAY_MS);
    var referencesByUrl = new Map();
    var events = [];

    function reference(source) {
      source = source || {};
      var url = safeUrl(source.url);
      if (!url) return null;
      var key = url.replace(/#.*$/, '');
      if (!referencesByUrl.has(key)) {
        referencesByUrl.set(key, {
          id: 'ref-' + (referencesByUrl.size + 1),
          publisher: compact(source.publisher || 'Source not specified', 120),
          title: compact(source.title || source.publisher || 'Source record', 300),
          url: url,
          sourceType: compact(source.sourceType || 'primary data source', 100),
          publishedAt: iso(source.publishedAt),
          accessedAt: captured.toISOString()
        });
      }
      return referencesByUrl.get(key);
    }

    function addEvent(record) {
      if (!record || !isInside(record.observedAt, periodStart, periodEnd)) return;
      var ref = reference(record.reference);
      if (!ref) return;
      events.push({
        id: compact(record.id, 320),
        type: compact(record.type || 'report', 60),
        observedAt: iso(record.observedAt),
        title: compact(record.title, 400),
        description: compact(record.description, 1400),
        location: compact(record.location, 240) || null,
        latitude: numberOrNull(record.latitude),
        longitude: numberOrNull(record.longitude),
        referenceId: ref.id,
        referenceUrl: ref.url,
        facts: record.facts && typeof record.facts === 'object' ? record.facts : {},
        wordingIsSourceOriginal: !!record.wordingIsSourceOriginal,
        recordKind: compact(record.recordKind || 'observed record', 80)
      });
    }

    var overview = input.overview && typeof input.overview === 'object' ? input.overview : null;
    var hazard = input.hazard && typeof input.hazard === 'object' ? input.hazard : null;
    var eruptions = input.eruptions && typeof input.eruptions === 'object' ? input.eruptions : null;
    var news = input.news && typeof input.news === 'object' ? input.news : null;
    var overviewMeta = overview && overview.meta || {};
    var fireTaskState = overviewMeta.sourceState || overview && overview.sourceState || null;
    var quakeData = hazard && hazard.quakes || null;
    var tsunamiData = hazard && hazard.tsunami || null;
    var hotspotStats = overview && overview.stats || null;
    var hotspotMeta = overview && overview.hotspotsMeta || {};
    var eruptionTaskState = eruptions && eruptions.sourceState || null;
    var newsTaskState = news && news.sourceState || null;
    var eruptionReports = eruptions && Array.isArray(eruptions.reports) ? eruptions.reports : [];
    var newsArticles = news && news.ok !== false && Array.isArray(news.articles) ? news.articles : [];
    var quakeFeedCoverage = normalizeFeedCoverage(quakeData && quakeData.feedCoverage);
    var tsunamiFeedCoverage = normalizeFeedCoverage(tsunamiData && tsunamiData.feedCoverage);
    var hazardSourceState = hazard && hazard.sourceState || {};
    var quakeTaskState = hazardSourceState.quakes || null;
    var tsunamiTaskState = hazardSourceState.tsunami || null;

    function taskDataIsStale(state) {
      if (!state || state.hasData === false) return false;
      if (state.healthy === false) return true;
      var ageMs = numberOrNull(state.lastOkAgeMs);
      var everyMs = numberOrNull(state.everyMs);
      return ageMs !== null && everyMs !== null && everyMs > 0 && ageMs > everyMs;
    }

    function taskAgeHours(state) {
      var ageMs = state ? numberOrNull(state.lastOkAgeMs) : null;
      return ageMs === null ? null : ageMs / 3600000;
    }

    var fireAvailable = !!(overview && hotspotStats && numberOrNull(hotspotStats.hotspots) !== null
      && (!fireTaskState || fireTaskState.hasData !== false));
    var earthquakeAvailable = !!(quakeData && Array.isArray(quakeData.quakes)
      && (!quakeFeedCoverage || quakeFeedCoverage.availableFeeds > 0)
      && (!quakeTaskState || quakeTaskState.hasData !== false));
    var tsunamiAvailable = !!(tsunamiData && Array.isArray(tsunamiData.bulletins)
      && (!tsunamiFeedCoverage || tsunamiFeedCoverage.availableFeeds > 0)
      && (!tsunamiTaskState || tsunamiTaskState.hasData !== false));
    var eruptionAvailable = !!(eruptions && Array.isArray(eruptions.reports)
      && (!eruptionTaskState || eruptionTaskState.hasData !== false));
    var newsAvailable = !!(news && news.ok !== false && Array.isArray(news.articles)
      && (!newsTaskState || newsTaskState.hasData !== false));

    var sourceStatus = {
      fires: {
        available: fireAvailable,
        stale: taskDataIsStale(fireTaskState),
        lastSuccessfulAt: iso(fireTaskState && fireTaskState.lastSuccessfulAt),
        lastCheckedAt: iso(fireTaskState && fireTaskState.lastCheckedAt),
        lastOkAgeHours: taskAgeHours(fireTaskState),
        lastError: compact(fireTaskState && fireTaskState.errorNote || '', 180) || null,
        publisher: 'NASA FIRMS',
        sourceUrl: FALLBACKS.firms.url,
        scope: compact(overviewMeta.source || overviewMeta.mode || 'NASA satellite fire detections', 300),
        mode: compact(overviewMeta.mode || '', 100),
        requestedDays: numberOrNull(overviewMeta.days),
        bbox: overviewMeta.bbox || null,
        payloadAssembledAt: iso(overviewMeta.updatedAt),
        dataAgeHours: numberOrNull(overviewMeta.dataAgeHours),
        windowHours: numberOrNull(overviewMeta.windowHours),
        coverageStart: iso(overviewMeta.oldestAcq),
        coverageEnd: iso(overviewMeta.newestAcq),
        reportedTotal: fireAvailable ? numberOrNull(hotspotStats.hotspots) : null,
        returnedRecords: fireAvailable && Array.isArray(overview.hotspots) ? overview.hotspots.length : null,
        truncated: !!hotspotMeta.truncated
      },
      earthquakes: {
        available: earthquakeAvailable,
        partial: !!(quakeFeedCoverage && quakeFeedCoverage.availableFeeds < quakeFeedCoverage.expectedFeeds),
        stale: taskDataIsStale(quakeTaskState),
        subfeedCoverage: quakeFeedCoverage,
        lastSuccessfulAt: iso(quakeTaskState && quakeTaskState.lastSuccessfulAt),
        lastCheckedAt: iso(quakeTaskState && quakeTaskState.lastCheckedAt),
        lastOkAgeHours: taskAgeHours(quakeTaskState),
        lastError: compact(quakeTaskState && quakeTaskState.errorNote || '', 180) || null,
        publisher: 'BMKG',
        sourceUrl: safeUrl(quakeData && quakeData.sourceUrl) || FALLBACKS.bmkg.url,
        scope: compact(quakeData && quakeData.source || 'BMKG recent earthquake feed', 300),
        payloadAssembledAt: iso(hazard && hazard.updatedAt),
        retrievedAt: iso(quakeData && (quakeData.fetchedAt || quakeData.updatedAt)),
        windowHours: numberOrNull(quakeData && quakeData.windowHours),
        latestAnyAgeHours: earthquakeAvailable ? numberOrNull(quakeData && quakeData.latestAnyAgeHours) : null,
        fetchedRecords: earthquakeAvailable ? numberOrNull(quakeData && quakeData.fetched) : null,
        filteredOut: earthquakeAvailable ? numberOrNull(quakeData && quakeData.filteredOut) : null,
        recordCount: earthquakeAvailable ? quakeData.quakes.length : null
      },
      tsunami: {
        available: tsunamiAvailable,
        partial: !!(tsunamiFeedCoverage && tsunamiFeedCoverage.availableFeeds < tsunamiFeedCoverage.expectedFeeds),
        stale: taskDataIsStale(tsunamiTaskState),
        subfeedCoverage: tsunamiFeedCoverage,
        lastSuccessfulAt: iso(tsunamiTaskState && tsunamiTaskState.lastSuccessfulAt),
        lastCheckedAt: iso(tsunamiTaskState && tsunamiTaskState.lastCheckedAt),
        lastOkAgeHours: taskAgeHours(tsunamiTaskState),
        lastError: compact(tsunamiTaskState && tsunamiTaskState.errorNote || '', 180) || null,
        publisher: 'NOAA / Pacific Tsunami Warning Center',
        sourceUrl: safeUrl(tsunamiData && tsunamiData.sourceUrl) || FALLBACKS.ptwc.url,
        scope: compact(tsunamiData && (tsunamiData.scope || tsunamiData.source) || 'Regional tsunami bulletin feed', 300),
        payloadAssembledAt: iso(hazard && hazard.updatedAt),
        retrievedAt: iso(tsunamiData && (tsunamiData.fetchedAt || tsunamiData.updatedAt)),
        recordCount: tsunamiAvailable ? tsunamiData.bulletins.length : null
      },
      eruptions: {
        available: eruptionAvailable,
        stale: !!(eruptions && eruptions.stale) || taskDataIsStale(eruptionTaskState),
        lastSuccessfulAt: iso(eruptionTaskState && eruptionTaskState.lastSuccessfulAt),
        lastCheckedAt: iso(eruptionTaskState && eruptionTaskState.lastCheckedAt),
        lastOkAgeHours: taskAgeHours(eruptionTaskState),
        lastError: compact(eruptionTaskState && eruptionTaskState.errorNote || '', 180) || null,
        publisher: 'PVMBG / MAGMA Indonesia',
        sourceUrl: safeUrl(eruptions && eruptions.sourceUrl) || FALLBACKS.magma.url,
        scope: compact(eruptions && eruptions.source || 'PVMBG observation-post reports', 300),
        retrievedAt: iso(eruptions && eruptions.updatedAt),
        windowHours: numberOrNull(eruptions && eruptions.windowHours),
        recordCount: eruptionAvailable ? eruptionReports.length : null
      },
      news: {
        available: newsAvailable,
        stale: !!(news && news.stale) || taskDataIsStale(newsTaskState),
        lastSuccessfulAt: iso(newsTaskState && newsTaskState.lastSuccessfulAt),
        lastCheckedAt: iso(newsTaskState && newsTaskState.lastCheckedAt),
        lastOkAgeHours: taskAgeHours(newsTaskState),
        lastError: compact(newsTaskState && newsTaskState.errorNote || '', 180) || null,
        publisher: compact(news && news.source || 'News feed', 160),
        sourceUrl: safeUrl(news && news.sourceUrl) || (news && /gdelt/i.test(String(news.source || ''))
          ? 'https://www.gdeltproject.org/'
          : (news && /google/i.test(String(news.source || '')) ? 'https://news.google.com/' : null)),
        scope: compact(news && news.source || 'Recent-news feed', 300),
        retrievedAt: iso(news && (news.fetchedAt || news.updatedAt)),
        recordCount: newsAvailable ? newsArticles.length : null,
        rejectedRecords: 0,
        partial: false,
        truncated: false,
        limitedToRecentFeed: true
      }
    };

    [
      { key: 'fires', title: FALLBACKS.firms.title, source: overview, fallback: FALLBACKS.firms, sourceType: 'satellite fire-detection data' },
      { key: 'earthquakes', title: FALLBACKS.bmkg.title, source: quakeData, fallback: FALLBACKS.bmkg, sourceType: 'official earthquake feed' },
      { key: 'tsunami', title: FALLBACKS.ptwc.title, source: tsunamiData, fallback: FALLBACKS.ptwc, sourceType: 'regional official bulletin feed' },
      { key: 'eruptions', title: FALLBACKS.magma.title, source: eruptions, fallback: FALLBACKS.magma, sourceType: 'official observation-post feed' },
      { key: 'news', title: 'Recent-news aggregation feed', source: news, fallback: null, sourceType: 'secondary news aggregation feed' }
    ].forEach(function (entry) {
      if (!sourceStatus[entry.key].available) return;
      var url = safeUrl(entry.source && (entry.source.sourceUrl || entry.source.url)) || (entry.fallback && entry.fallback.url) || sourceStatus[entry.key].sourceUrl;
      var ref = reference({
        publisher: sourceStatus[entry.key].publisher,
        title: entry.title,
        url: url,
        sourceType: entry.sourceType
      });
      if (ref) {
        sourceStatus[entry.key].referenceId = ref.id;
        sourceStatus[entry.key].referenceUrl = ref.url;
      }
    });

    var firmReference = sourceStatus.fires.referenceUrl ? reference({
      publisher: FALLBACKS.firms.publisher, title: FALLBACKS.firms.title, url: sourceStatus.fires.referenceUrl,
      sourceType: 'satellite fire-detection data'
    }) : null;
    var hotspotObservation = sourceStatus.fires.available && firmReference ? {
      referenceId: firmReference.id,
      referenceUrl: firmReference.url,
      retrievedAt: iso(overviewMeta.updatedAt),
      windowHours: sourceStatus.fires.windowHours,
      coverageStart: sourceStatus.fires.coverageStart,
      coverageEnd: sourceStatus.fires.coverageEnd,
      reportedTotal: numberOrNull(hotspotStats.hotspots),
      highConfidence: numberOrNull(hotspotStats.highConfidence),
      totalFrpMw: numberOrNull(hotspotStats.totalFrp),
      provinceRanking: Array.isArray(overview.provinceRanking) ? overview.provinceRanking.map(function (item) {
        item = item || {};
        return { province: compact(item.province, 100), hotspots: numberOrNull(item.hotspots), frpMw: numberOrNull(item.frp) };
      }) : [],
      provinceRankingMeta: overview.provinceRankingMeta && typeof overview.provinceRankingMeta === 'object' ? {
        assignmentMethod: compact(overview.provinceRankingMeta.assignmentMethod || '', 120) || null,
        assignedDetectionCount: numberOrNull(overview.provinceRankingMeta.assignedDetectionCount),
        unassignedDetectionCount: numberOrNull(overview.provinceRankingMeta.unassignedDetectionCount),
        availableProvinceCount: numberOrNull(overview.provinceRankingMeta.availableProvinceCount),
        returnedProvinceCount: numberOrNull(overview.provinceRankingMeta.returnedProvinceCount),
        maxReturned: numberOrNull(overview.provinceRankingMeta.maxReturned),
        truncated: typeof overview.provinceRankingMeta.truncated === 'boolean' ? overview.provinceRankingMeta.truncated : null
      } : null,
      returnedRecords: sourceStatus.fires.returnedRecords,
      truncated: sourceStatus.fires.truncated,
      interpretation: compact(hotspotStats.impactCountInterpretation || 'Satellite hotspot detections are not fire perimeters or counts of people affected.', 500)
    } : null;

    var quakes = quakeData && Array.isArray(quakeData.quakes) ? quakeData.quakes : [];
    quakes.forEach(function (quake) {
      var time = quake && (quake.time || quake.dateTime);
      var refUrl = safeUrl(quakeData && quakeData.sourceUrl) || FALLBACKS.bmkg.url;
      var magnitude = numberOrNull(quake && quake.magnitude);
      var title = magnitude !== null ? 'M' + magnitude.toFixed(1) + ' - ' + (quake.area || 'BMKG earthquake report') : (quake.area || 'BMKG earthquake report');
      var sourceWording = quake && (quake.potensi || quake.felt) || '';
      addEvent({
        id: makeId('earthquake', [time, quake && quake.lat, quake && quake.lon, magnitude]),
        type: 'earthquake', observedAt: time, title: title, description: sourceWording,
        location: quake && quake.area, latitude: quake && quake.lat, longitude: quake && quake.lon,
        facts: { magnitude: numberOrNull(quake && quake.magnitude), depthKm: numberOrNull(quake && quake.depthKm), tsunami: typeof (quake && quake.tsunami) === 'boolean' ? quake.tsunami : null, felt: quake && quake.felt || null },
        reference: { publisher: 'BMKG', title: 'BMKG earthquake information', url: refUrl, sourceType: 'official earthquake data' },
        wordingIsSourceOriginal: true, recordKind: 'official earthquake record'
      });
    });

    var bulletins = tsunamiData && Array.isArray(tsunamiData.bulletins) ? tsunamiData.bulletins : [];
    bulletins.forEach(function (bulletin) {
      var url = safeUrl(bulletin && bulletin.url) || safeUrl(tsunamiData && tsunamiData.sourceUrl) || FALLBACKS.ptwc.url;
      addEvent({
        id: makeId('tsunami-bulletin', [url, bulletin && bulletin.time, bulletin && bulletin.title]),
        type: 'tsunami', observedAt: bulletin && bulletin.time,
        title: bulletin && bulletin.title || 'NOAA tsunami bulletin',
        description: bulletin && bulletin.summary || '',
        location: null, latitude: bulletin && bulletin.lat, longitude: bulletin && bulletin.lon,
        facts: { danger: typeof (bulletin && bulletin.danger) === 'boolean' ? bulletin.danger : null },
        reference: { publisher: 'NOAA / Pacific Tsunami Warning Center', title: bulletin && bulletin.title || 'Tsunami bulletin', url: url, sourceType: 'official bulletin', publishedAt: bulletin && bulletin.time },
        wordingIsSourceOriginal: true, recordKind: 'official bulletin'
      });
    });

    eruptionReports.forEach(function (report) {
      var url = safeUrl(report && report.url) || safeUrl(eruptions && eruptions.sourceUrl) || FALLBACKS.magma.url;
      var description = report && (report.text || report.lastText) || '';
      addEvent({
        id: makeId('eruption', [report && report.key, report && report.at, report && report.name]),
        type: 'eruption', observedAt: report && report.at,
        title: (report && report.name ? report.name + ' - ' : '') + 'PVMBG observation-post eruption report',
        description: description,
        location: report && report.name,
        facts: { heightM: numberOrNull(report && (report.heightM == null ? report.maxHeightM : report.heightM)), bearingLabel: report && report.bearingLabel || null, durationS: numberOrNull(report && report.durationS) },
        reference: { publisher: 'PVMBG / MAGMA Indonesia', title: 'PVMBG observation-post eruption reports', url: url, sourceType: 'official observation-post report', publishedAt: report && report.at },
        wordingIsSourceOriginal: true, recordKind: 'official eruption report'
      });
    });

    var newsCandidatesInPeriod = newsArticles.filter(function (article) {
      return isInside(article && (article.pubDate || article.seendate || article.publishedAt), periodStart, periodEnd);
    }).sort(function (a, b) {
      return Date.parse(iso(b && (b.pubDate || b.seendate || b.publishedAt)) || 0) - Date.parse(iso(a && (a.pubDate || a.seendate || a.publishedAt)) || 0);
    });
    var newsRejectedRecords = newsCandidatesInPeriod.filter(function (article) {
      return !safeUrl(article && article.url) || !compact(article && article.title, 400);
    }).length;
    var newsInPeriod = newsCandidatesInPeriod.filter(function (article) {
      return !!safeUrl(article && article.url) && !!compact(article && article.title, 400);
    });
    var newsWasTrimmed = newsInPeriod.length > MAX_NEWS_RECORDS;
    newsInPeriod.slice(0, MAX_NEWS_RECORDS).forEach(function (article) {
      var url = safeUrl(article && article.url);
      if (!url) return;
      var published = article.pubDate || article.seendate || article.publishedAt;
      var publisher = compact(article.domain || article.source || 'News publisher', 160);
      addEvent({
        id: makeId('news', [url]),
        type: 'news', observedAt: published,
        title: article.title || 'News report', description: article.description || '',
        location: article.location || null,
        facts: { domain: publisher, topic: compact(article.topicLabel || article.topic || '', 120), country: compact(article.country || '', 80) },
        reference: { publisher: publisher, title: article.title || publisher, url: url, sourceType: 'secondary media report', publishedAt: published },
        wordingIsSourceOriginal: true, recordKind: 'media headline; not independently verified by this feed'
      });
    });
    sourceStatus.news.periodRecords = newsCandidatesInPeriod.length;
    sourceStatus.news.rejectedRecords = newsRejectedRecords;
    sourceStatus.news.partial = newsRejectedRecords > 0;
    sourceStatus.news.truncated = newsWasTrimmed;

    var hazeMeta = overview && overview.regionalHaze && overview.regionalHaze.meta || null;
    var contexts = [];
    if (hazeMeta) {
      var hazeItems = [
        { key: 'asmc', item: hazeMeta.asmc, dateKey: 'reportAt', urlKey: 'productUrl', publisher: 'ASMC', title: 'Regional haze situation report', textKey: 'summary', textIdKey: 'summaryId' },
        { key: 'nea', item: hazeMeta.nea, dateKey: 'observationAt', urlKey: 'sourceUrl', publisher: 'Singapore National Environment Agency', title: 'Haze situation update', textKey: 'statement', textIdKey: 'statementId' },
        { key: 'bmkg', item: hazeMeta.bmkg, dateKey: 'publishedAt', urlKey: 'officialSourceUrl', publisher: 'BMKG', title: 'Jakarta smoke observation report', textKey: 'officialSummaryEn', textIdKey: 'officialSummaryId' },
        { key: 'kemenkes', item: hazeMeta.kemenkes, dateKey: 'publishedAt', urlKey: 'officialSourceUrl', publisher: 'Ministry of Health of Indonesia', title: 'Health-impact report', textKey: 'noteEn', textIdKey: 'note' }
      ];
      hazeItems.forEach(function (entry) {
        if (!entry.item) return;
        var url = safeUrl(entry.item[entry.urlKey]) || safeUrl(entry.item.sourceUrl);
        var publishedAt = iso(entry.item[entry.dateKey] || entry.item.publishedAt || entry.item.reportAt);
        var ref = reference({ publisher: entry.publisher, title: entry.title, url: url, sourceType: 'dated contextual source report', publishedAt: publishedAt });
        if (!ref) return;
        contexts.push({
          id: entry.key,
          publisher: entry.publisher,
          title: entry.title,
          publishedAt: publishedAt,
          summaryId: compact(entry.item[entry.textIdKey] || entry.item.noteId || '', 1200),
          summaryEn: compact(entry.item[entry.textKey] || entry.item.noteEn || '', 1200),
          referenceId: ref.id,
          referenceUrl: ref.url,
          inReportPeriod: isInside(publishedAt, periodStart, periodEnd),
          carryForward: !isInside(publishedAt, periodStart, periodEnd)
        });
      });
    }

    var recordSources = [
      { key: 'earthquakes', type: 'earthquake', candidates: quakes.filter(function (item) { return isInside(item && (item.time || item.dateTime), periodStart, periodEnd); }) },
      { key: 'tsunami', type: 'tsunami', candidates: bulletins.filter(function (item) { return isInside(item && item.time, periodStart, periodEnd); }) },
      { key: 'eruptions', type: 'eruption', candidates: eruptionReports.filter(function (item) { return isInside(item && item.at, periodStart, periodEnd); }) },
      { key: 'news', type: 'news', candidates: newsCandidatesInPeriod }
    ];
    recordSources.forEach(function (source) {
      var status = sourceStatus[source.key];
      var included = events.filter(function (event) { return event.type === source.type; });
      var times = included.map(function (event) { return Date.parse(event.observedAt); }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
      status.periodRecords = status.available ? source.candidates.length : null;
      status.includedRecords = status.available ? included.length : null;
      status.recordCoverageStart = status.available && times.length ? new Date(times[0]).toISOString() : null;
      status.recordCoverageEnd = status.available && times.length ? new Date(times[times.length - 1]).toISOString() : null;
    });

    events.sort(function (a, b) { return Date.parse(a.observedAt) - Date.parse(b.observedAt); });
    var refs = Array.from(referencesByUrl.values());
    var availableSources = Object.keys(sourceStatus).filter(function (key) { return sourceStatus[key].available; }).length;
    var expectedSources = Object.keys(sourceStatus).length;
    var sourceCoveragePartial = Object.keys(sourceStatus).some(function (key) {
      return sourceStatus[key].partial || sourceStatus[key].stale;
    });
    var quality = availableSources === 0
      ? 'unavailable'
      : (availableSources === expectedSources && !newsWasTrimmed && !sourceCoveragePartial ? 'complete' : 'partial');
    return {
      schemaVersion: 1,
      reportDate: localDate(captured),
      timeZone: TZ,
      capturedAt: captured.toISOString(),
      period: { start: periodStart.toISOString(), end: periodEnd.toISOString(), durationHours: 24 },
      quality: quality,
      coverage: { availableSources: availableSources, expectedSources: expectedSources },
      sourceStatus: sourceStatus,
      observations: { hotspots: hotspotObservation },
      events: events,
      contexts: contexts,
      references: refs,
      notes: {
        newsTruncated: newsWasTrimmed,
        newsRejectedRecords: newsRejectedRecords,
        apiErrors: errors && typeof errors === 'object' ? errors : {},
        method: 'This is a 24-hour capture window ending at capturedAt. Records without a valid timestamp or verifiable HTTP(S) source are excluded. At most 40 recent in-period news headlines are retained and truncation is flagged. Missing or failed feeds are unavailable, not zero.'
      }
    };
  }

  function buildWeeklyIssue(snapshots, limit) {
    var max = Math.max(1, Math.min(WEEK_DAYS, Number(limit) || WEEK_DAYS));
    var sorted = (Array.isArray(snapshots) ? snapshots : []).filter(function (item) {
      return item && item.schemaVersion === 1 && item.period && asDate(item.period.start) && asDate(item.period.end);
    }).slice().sort(function (a, b) { return Date.parse(a.period.end) - Date.parse(b.period.end); });
    sorted = sorted.slice(-max);
    var eventMap = new Map();
    var referenceByUrl = new Map();
    var contextMap = new Map();
    sorted.forEach(function (snapshot) {
      (snapshot.references || []).forEach(function (ref) {
        var url = safeUrl(ref && ref.url);
        if (!url) return;
        if (!referenceByUrl.has(url)) referenceByUrl.set(url, Object.assign({}, ref, { url: url }));
      });
    });
    var referenceEntries = Array.from(referenceByUrl.entries()).sort(function (a, b) { return a[0].localeCompare(b[0]); });
    var referenceIdByUrl = new Map();
    var refs = referenceEntries.map(function (entry, index) {
      var id = 'ref-' + (index + 1);
      referenceIdByUrl.set(entry[0], id);
      return Object.assign({}, entry[1], { id: id, url: entry[0] });
    });
    sorted.forEach(function (snapshot) {
      var localUrlById = new Map();
      (snapshot.references || []).forEach(function (ref) {
        var url = safeUrl(ref && ref.url);
        if (url && ref && ref.id) localUrlById.set(ref.id, url);
      });
      (snapshot.events || []).forEach(function (event) {
        if (!event || !event.id) return;
        var url = safeUrl(event.referenceUrl) || localUrlById.get(event.referenceId);
        var referenceId = url && referenceIdByUrl.get(url);
        if (!referenceId) return;
        if (!eventMap.has(event.id)) eventMap.set(event.id, Object.assign({}, event, { referenceId: referenceId, referenceUrl: url }));
      });
      (snapshot.contexts || []).forEach(function (context) {
        var url = safeUrl(context.referenceUrl) || localUrlById.get(context.referenceId);
        var referenceId = url && referenceIdByUrl.get(url);
        if (!referenceId) return;
        var key = [context.id, context.publishedAt, url].join('|');
        if (!contextMap.has(key)) contextMap.set(key, Object.assign({}, context, { referenceId: referenceId, referenceUrl: url }));
      });
    });

    var sourceCoverage = {};
    SOURCE_KEYS.forEach(function (key) {
      var matching = sorted.map(function (snapshot) { return snapshot.sourceStatus && snapshot.sourceStatus[key]; });
      var reported = matching.filter(Boolean).length;
      var available = matching.filter(function (item) { return item && item.available; }).length;
      var fullyCovered = matching.filter(function (item) { return item && item.available && !item.partial && !item.stale; }).length;
      var partialSnapshots = matching.filter(function (item) { return item && (item.partial || item.stale); }).length;
      var staleSnapshots = matching.filter(function (item) { return item && item.stale; }).length;
      var expected = sorted.length;
      var sourceReference = matching.find(function (item) { return item && safeUrl(item.referenceUrl); });
      var referenceUrl = sourceReference ? safeUrl(sourceReference.referenceUrl) : null;
      var subfeedCoverageBySnapshot = matching.map(function (item, index) {
        var coverage = item && item.subfeedCoverage;
        if (!coverage) return null;
        return {
          reportDate: sorted[index].reportDate || null,
          availableFeeds: coverage.availableFeeds,
          expectedFeeds: coverage.expectedFeeds,
          failures: Array.isArray(coverage.failures) ? coverage.failures.map(function (failure) {
            return { feed: compact(failure.feed, 120), error: compact(failure.error, 120) };
          }) : []
        };
      }).filter(Boolean);
      sourceCoverage[key] = {
        availableSnapshots: available,
        fullyCoveredSnapshots: fullyCovered,
        partialSnapshots: partialSnapshots,
        staleSnapshots: staleSnapshots,
        subfeedCoverageBySnapshot: subfeedCoverageBySnapshot,
        reportedSnapshots: reported,
        expectedSnapshots: expected,
        complete: expected > 0 && fullyCovered === expected && reported === expected,
        referenceId: referenceUrl ? referenceIdByUrl.get(referenceUrl) || null : null,
        referenceUrl: referenceUrl
      };
    });

    var hotspotSeries = sorted.map(function (snapshot) {
      var observation = snapshot.observations && snapshot.observations.hotspots;
      return {
        reportDate: snapshot.reportDate,
        capturedAt: snapshot.capturedAt,
        period: snapshot.period,
        reportedTotal: observation ? observation.reportedTotal : null,
        highConfidence: observation ? observation.highConfidence : null,
        totalFrpMw: observation ? observation.totalFrpMw : null,
        windowHours: observation ? observation.windowHours : null,
        truncated: observation ? observation.truncated : null,
        provinceRanking: observation && Array.isArray(observation.provinceRanking) ? observation.provinceRanking : [],
        provinceRankingMeta: observation && observation.provinceRankingMeta || null,
        referenceId: observation ? referenceIdByUrl.get(safeUrl(observation.referenceUrl)) || null : null,
        referenceUrl: observation ? safeUrl(observation.referenceUrl) : null
      };
    });
    var allEvents = Array.from(eventMap.values()).sort(function (a, b) { return Date.parse(a.observedAt) - Date.parse(b.observedAt); });
    var newsEvents = allEvents.filter(function (event) { return event.type === 'news'; });
    var weeklyNewsTruncated = newsEvents.length > MAX_WEEKLY_NEWS_RECORDS;
    var selectedNewsEvents = weeklyNewsTruncated ? newsEvents.slice(-MAX_WEEKLY_NEWS_RECORDS) : newsEvents;
    var eventList = allEvents.filter(function (event) { return event.type !== 'news'; })
      .concat(selectedNewsEvents).sort(function (a, b) { return Date.parse(a.observedAt) - Date.parse(b.observedAt); });
    var start = sorted.length ? sorted[0].period.start : null;
    var end = sorted.length ? sorted[sorted.length - 1].period.end : null;
    var invalidSnapshotWindows = [];
    sorted.forEach(function (snapshot) {
      var durationMs = Date.parse(snapshot.period.end) - Date.parse(snapshot.period.start);
      if (Math.abs(durationMs - DAY_MS) > 1000) {
        invalidSnapshotWindows.push({ reportDate: snapshot.reportDate || null, durationHours: durationMs / 3600000 });
      }
    });
    var boundaries = [];
    var gaps = [];
    var overlaps = [];
    for (var i = 1; i < sorted.length; i++) {
      var previousEnd = Date.parse(sorted[i - 1].period.end);
      var nextStart = Date.parse(sorted[i].period.start);
      var offsetMinutes = (nextStart - previousEnd) / 60000;
      var boundary = {
        previousDate: sorted[i - 1].reportDate || null,
        nextDate: sorted[i].reportDate || null,
        offsetMinutes: Math.round(offsetMinutes * 100) / 100,
        kind: offsetMinutes > 0 ? 'gap' : (offsetMinutes < 0 ? 'overlap' : 'contiguous')
      };
      boundaries.push(boundary);
      if (offsetMinutes > 0) gaps.push(boundary);
      if (offsetMinutes < 0) overlaps.push(boundary);
    }
    var continuous = sorted.length > 0 && gaps.length === 0;
    var temporalComplete = sorted.length === max && continuous && overlaps.length === 0 && invalidSnapshotWindows.length === 0;
    var sourceCoverageComplete = sorted.length > 0 && SOURCE_KEYS.every(function (key) { return sourceCoverage[key].complete; });
    var completeDailySnapshots = sorted.filter(function (snapshot) { return snapshot.quality === 'complete'; }).length;
    var dailyIssuesComplete = sorted.length > 0 && completeDailySnapshots === sorted.length;
    var complete = temporalComplete && sourceCoverageComplete && dailyIssuesComplete && !weeklyNewsTruncated;
    var contextList = Array.from(contextMap.values());
    var usedReferenceUrls = new Set();
    eventList.forEach(function (event) { var url = safeUrl(event.referenceUrl); if (url) usedReferenceUrls.add(url); });
    contextList.forEach(function (context) { var url = safeUrl(context.referenceUrl); if (url) usedReferenceUrls.add(url); });
    hotspotSeries.forEach(function (item) { var url = safeUrl(item.referenceUrl); if (url) usedReferenceUrls.add(url); });
    SOURCE_KEYS.forEach(function (key) { var url = safeUrl(sourceCoverage[key].referenceUrl); if (url) usedReferenceUrls.add(url); });
    var finalReferenceIdByUrl = new Map();
    var finalReferences = referenceEntries.filter(function (entry) { return usedReferenceUrls.has(entry[0]); }).map(function (entry, index) {
      var id = 'ref-' + (index + 1);
      finalReferenceIdByUrl.set(entry[0], id);
      return Object.assign({}, entry[1], { id: id, url: entry[0] });
    });
    eventList.forEach(function (event) { event.referenceId = finalReferenceIdByUrl.get(safeUrl(event.referenceUrl)) || null; });
    contextList.forEach(function (context) { context.referenceId = finalReferenceIdByUrl.get(safeUrl(context.referenceUrl)) || null; });
    hotspotSeries.forEach(function (item) { item.referenceId = finalReferenceIdByUrl.get(safeUrl(item.referenceUrl)) || null; });
    SOURCE_KEYS.forEach(function (key) { sourceCoverage[key].referenceId = finalReferenceIdByUrl.get(safeUrl(sourceCoverage[key].referenceUrl)) || null; });
    return {
      schemaVersion: 1,
      type: 'weekly',
      timeZone: TZ,
      period: { start: start, end: end, durationHours: start && end ? (Date.parse(end) - Date.parse(start)) / 3600000 : 0 },
      dailySnapshotCount: sorted.length,
      expectedDailySnapshots: max,
      complete: complete,
      temporalComplete: temporalComplete,
      sourceCoverageComplete: sourceCoverageComplete,
      dailyIssuesComplete: dailyIssuesComplete,
      completeDailySnapshots: completeDailySnapshots,
      newsRecordCountBeforeCap: newsEvents.length,
      newsRecordCountIncluded: selectedNewsEvents.length,
      newsTruncated: weeklyNewsTruncated,
      continuousCoverage: continuous,
      coverageBoundaries: boundaries,
      invalidSnapshotWindows: invalidSnapshotWindows,
      coverageGaps: gaps,
      coverageOverlaps: overlaps,
      snapshots: sorted,
      sourceCoverage: sourceCoverage,
      events: eventList,
      contexts: contextList,
      references: finalReferences,
      hotspotSeries: hotspotSeries,
      notes: {
        method: 'Weekly evidence is derived from the available daily snapshots. Event records are deduplicated by stable source identifiers. Hotspot observations remain a per-snapshot series and are not summed; gaps, overlaps, capped news records, or unavailable sources are disclosed.'
      }
    };
  }

  return {
    DAY_MS: DAY_MS,
    WEEK_DAYS: WEEK_DAYS,
    TIME_ZONE: TZ,
    parseInstant: asDate,
    localDate: localDate,
    isoWeekId: isoWeekId,
    isInside: isInside,
    safeUrl: safeUrl,
    buildDailySnapshot: buildDailySnapshot,
    buildWeeklyIssue: buildWeeklyIssue
  };
});
