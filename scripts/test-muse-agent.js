'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  META_CHAT_URL,
  META_MODEL,
  MAX_TURNS,
  TOOL_DEFINITIONS,
  answerWithMuse,
  executeTool,
  safeFailureCode
} = require('../lib/muse-agent');
const { buildSnapshot } = require('../lib/regional-haze');
const i18n = require('../public/i18n');

let passed = 0;
function check(name, condition) {
  assert.equal(!!condition, true, name);
  passed++;
  console.log('  LULUS ' + name);
}

const context = {
  overview: {
    meta: {
      source: 'NASA FIRMS',
      mode: 'live',
      updatedAt: '2026-11-02T00:00:00.000Z',
      windowHours: 24,
      oldestAcq: '2026-11-01T00:00:00.000Z',
      newestAcq: '2026-11-02T00:00:00.000Z',
      latestAcqAgeHours: 0.2,
      dataAgeHours: 1,
      sourceState: {
        hasData: true,
        healthy: true,
        lastSuccessfulAt: '2026-11-02T00:00:00.000Z',
        lastCheckedAt: '2026-11-02T00:00:00.000Z',
        lastOkAgeMs: 1000
      }
    },
    stats: {
      hotspots: 120,
      highConfidence: 90,
      totalFrp: 800,
      clusters: 5,
      modeledCenterCount: 2,
      impactCountInterpretation: 'Indicative modeled settlement-center intersections only.'
    },
    impactModel: { status: 'partial', inputClusters: 5, modeledClusters: 3 },
    plumeCoverage: { inputClusters: 5, selectedClusters: 2, truncated: true },
    provinceRanking: [
      { province: 'Riau', hotspots: 42, frp: 300 },
      { province: 'Jambi', hotspots: 28, frp: 200 },
      { province: 'Aceh', hotspots: 12, frp: 80 }
    ],
    provinceRankingMeta: {
      assignmentMethod: 'coarse rectangular province boxes',
      assignedDetectionCount: 82,
      unassignedDetectionCount: 38,
      truncated: false
    },
    impacted: [
      { name: 'Kota A', prov: 'Riau', score: 60, level: 'Sedang', nearestKm: 14 },
      { name: 'Kota B', prov: 'Jambi', score: 35, level: 'Rendah', nearestKm: 40 }
    ],
    volcano: null,
    worstAir: { aqi: 82, pm25: 23.4, label: 'Kota A', province: 'Riau' },
    regionalHaze: buildSnapshot()
  },
  attribution: {
    meta: {
      updatedAt: '2026-11-02T00:00:00.000Z',
      datasets: ['GFW Oil Palm 2025'],
      disclaimer: 'Overlap is not proof of ignition or legal responsibility.'
    },
    analyzed: 80,
    sampleSize: 80,
    population: 120,
    sampled: true,
    samplingMethod: 'top-FRP',
    insideConcession: 20,
    outsideConcession: 60,
    units: [
      { name: 'Unit One', company: 'Example Group', kind: 'oil palm', hotspotCount: 8, totalFrp: 50, areaHa: 1000 }
    ]
  },
  volcano: {
    updatedAt: '2026-11-02T00:00:00.000Z',
    monitoredCount: 2,
    eruptingCount: 1,
    eruptions: { total: 1, stale: false },
    active: [{
      name: 'Volcano A', region: 'Region A',
      official: { level: 3, status: 'Siaga' },
      eruption: { count: 1, maxHeightM: 900, bearingLabel: 'east' },
      plumes: [{}]
    }]
  },
  sourceState: {
    volcano: { hasData: true, healthy: true, lastSuccessfulAt: '2026-11-02T00:00:00.000Z', lastCheckedAt: '2026-11-02T00:00:00.000Z', lastOkAgeMs: 1000, consecutiveFails: 0 },
    pvmbg: { hasData: true, healthy: true, lastSuccessfulAt: '2026-11-02T00:00:00.000Z', lastCheckedAt: '2026-11-02T00:00:00.000Z', lastOkAgeMs: 2000, consecutiveFails: 0 },
    eruption: { hasData: true, healthy: true, lastSuccessfulAt: '2026-11-02T00:00:00.000Z', lastCheckedAt: '2026-11-02T00:00:00.000Z', lastOkAgeMs: 3000, consecutiveFails: 0 },
    quake: { hasData: true, healthy: true, lastSuccessfulAt: '2026-11-02T00:00:00.000Z', lastCheckedAt: '2026-11-02T00:00:00.000Z', lastOkAgeMs: 4000, consecutiveFails: 0 },
    shelter: { hasData: true, healthy: true, lastSuccessfulAt: '2026-11-02T00:00:00.000Z', lastCheckedAt: '2026-11-02T00:00:00.000Z', lastOkAgeMs: 5000, consecutiveFails: 0 }
  },
  hazard: {
    quakes: {
      windowHours: 24,
      counts: { total: 1, kuat: 1, tsunami: 0 },
      latest: { time: '2026-11-02T00:00:00.000Z', area: 'South of Indonesia', magnitude: 5.2, depthKm: 20, tsunami: false },
      latestAny: { time: '2026-11-02T00:00:00.000Z', area: 'South of Indonesia', magnitude: 5.2, depthKm: 20 },
      quakes: [{ time: '2026-11-02T00:00:00.000Z', area: 'South of Indonesia', magnitude: 5.2, depthKm: 20, tsunami: false }],
      feedCoverage: { expectedFeeds: 3, availableFeeds: 2, complete: false }
    },
    shelters: {
      active: true,
      totalPeople: 120,
      events: [{ label: 'Flood event', hazard: 'Flood', total: 120, sites: 3, updatedAt: '2026-11-02T00:00:00.000Z', ageDays: 0, topAreas: [{ area: 'District A', people: 120 }] }],
      recentlyEnded: []
    }
  },
  air: { worst: { aqi: 82, pm25: 23.4, label: 'Kota A', province: 'Riau' } }
};

async function main() {
  console.log('\n== Assistant localization ==');
  const privacyNote = 'Muse Spark memakai tool data baca-saja saat Meta API aktif; mode lokal ditandai sebagai fallback. Pertanyaan dan fakta publik terpilih dikirim ke Meta saat API aktif. ';
  const safetyNote = ' atau nasihat medis · Darurat: 112 bila tersedia atau layanan lokal.';
  check('privacy disclosure translates when the text node has trailing whitespace',
    i18n.translate(privacyNote, 'en') === 'Muse Spark uses read-only data tools when the Meta API is active; local mode is labeled as fallback. The question and selected public facts are sent to Meta when the API is active. ');
  check('safety disclosure translates when the text node has leading whitespace',
    i18n.translate(safetyNote, 'en') === ' or medical advice · Emergency: 112 where available, or local services.');

  console.log('\n== Muse Spark agent interface and safe tools ==');
  const toolNames = TOOL_DEFINITIONS.map(tool => tool.function.name);
  check('the agent exposes bounded, read-only domain tools',
    toolNames.includes('get_fire_situation')
      && toolNames.includes('get_province_hotspots')
      && toolNames.includes('get_modeled_impacted_places')
      && toolNames.includes('get_volcano_status')
      && toolNames.includes('get_earthquake_status')
      && toolNames.includes('get_displacement_status')
      && toolNames.includes('get_air_quality_status')
      && toolNames.includes('get_regional_haze_reports')
      && toolNames.includes('get_land_overlap_summary'));
  check('tool schemas reject arbitrary additional arguments',
    TOOL_DEFINITIONS.every(tool => tool.function.parameters.additionalProperties === false));

  const fire = executeTool('get_fire_situation', {}, context);
  check('fire tool returns counts, freshness, model status, and sources',
    fire.available && fire.counts.detectedHotspots === 120
      && fire.acquisitionWindow.latestAgeHours === 0.2
      && fire.modeledImpact.status === 'partial'
      && fire.sources.some(source => source.title === 'NASA FIRMS'));
  check('missing numeric values stay null instead of becoming zero',
    executeTool('get_fire_situation', {}, { overview: { stats: { hotspots: null } } }).counts.detectedHotspots === null);
  check('province tool preserves the coarse-box limitation',
    executeTool('get_province_hotspots', { top_n: 2 }, context).ranking.length === 2
      && executeTool('get_province_hotspots', {}, context).note.includes('coarse rectangular'));
  check('modeled-place tool can filter by province',
    executeTool('get_modeled_impacted_places', { province: 'Riau' }, context).places.length === 1);
  check('volcano tool separates alert level from eruption reports',
    executeTool('get_volcano_status', {}, context).volcanoes[0].officialStatus.level === 3
      && executeTool('get_volcano_status', {}, context).volcanoes[0].observatoryEruptionReport.reportCount24h === 1);
  check('earthquake tool reports partial feed coverage and source freshness',
    executeTool('get_earthquake_status', {}, context).feedCoverage.complete === false
      && executeTool('get_earthquake_status', {}, context).sourceHealth.lastOkAgeMs === 4000);
  check('displacement tool returns aggregate reports, source freshness, and no coordinates',
    executeTool('get_displacement_status', {}, context).activeEvents[0].peopleReported === 120
      && executeTool('get_displacement_status', {}, context).sourceHealth.lastOkAgeMs === 5000
      && !Object.prototype.hasOwnProperty.call(executeTool('get_displacement_status', {}, context).activeEvents[0], 'points'));
  check('air-quality tool labels CAMS as modeled and non-medical',
    executeTool('get_air_quality_status', {}, context).note.includes('not station measurements'));
  const regional = executeTool('get_regional_haze_reports', {}, context);
  check('regional tool keeps dated reports and links to the actual report sources',
    regional.reports.asmc.reportDate && regional.sources.some(source => /asmc/i.test(source.title))
      && regional.sources.some(source => /bmkg/i.test(source.title)));
  const land = executeTool('get_land_overlap_summary', {}, context);
  check('land-overlap tool carries its sampling denominator and no-causality disclaimer',
    land.units.length === 1 && land.totalHotspots === 120 && land.sampled === true
      && land.disclaimer.includes('not proof'));
  assert.throws(() => executeTool('run_shell', {}, context), /tool_not_allowed/);
  passed++;
  console.log('  LULUS unknown tool names are not executable');

  console.log('\n== Mocked Meta API tool loop ==');
  const requests = [];
  const fakeResponses = [
    {
      choices: [{ message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_fire', type: 'function', function: { name: 'get_fire_situation', arguments: '{}' } },
          { id: 'call_provinces', type: 'function', function: { name: 'get_province_hotspots', arguments: '{"top_n":2}' } }
        ]
      } }]
    },
    {
      choices: [{ message: {
        role: 'assistant',
        content: 'Ringkasan\n120 hotspot tercatat.\nKetidakpastian: ranking memakai kotak provinsi kasar.'
      } }]
    }
  ];
  const fakeFetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      json: async () => fakeResponses.shift()
    };
  };
  const answer = await answerWithMuse('Buat briefing kebakaran saat ini', context, {
    apiKey: 'test-key-never-real',
    language: 'id',
    fetchImpl: fakeFetch,
    timeoutMs: 1000
  });
  check('request uses Meta endpoint and the fixed Muse Spark model',
    requests.length === 2 && requests.every(request => request.url === META_CHAT_URL
      && request.body.model === META_MODEL));
  check('API key is sent only in the server Authorization header',
    requests.every(request => request.options.headers.Authorization === 'Bearer test-key-never-real'));
  check('tool results are replayed only after the assistant tool-call message',
    requests[1].body.messages[2].role === 'assistant'
      && requests[1].body.messages[2].tool_calls.length === 2
      && requests[1].body.messages[3].role === 'tool'
      && requests[1].body.messages[3].tool_call_id === 'call_fire'
      && requests[1].body.messages[4].tool_call_id === 'call_provinces');
  check('system prompt contains safety limits and treats source text as untrusted',
    /Jangan memberi diagnosis/.test(requests[0].body.messages[0].content)
      && /teks dari laporan.*tidak tepercaya/i.test(requests[0].body.messages[0].content));
  check('success is identified as Muse Spark and includes tool/source provenance',
    answer.provider === 'muse-spark'
      && answer.model === 'muse-spark-1.3'
      && answer.agent.toolCalls === 2
      && answer.sources.some(source => source.title === 'NASA FIRMS'));
  check('answer text is split into display lines without fabricating a local index count',
    answer.answer.length === 3 && answer.indexed === answer.sources.length);

  console.log('\n== Failure labeling and provider isolation ==');
  check('HTTP status is reduced to a safe failure code',
    safeFailureCode(new Error('META_API_HTTP_401')) === 'META_API_HTTP_401');
  check('provider response details and arbitrary error text are not exposed',
    safeFailureCode(new Error('Bearer secret, raw response body')) === 'META_API_ERROR');
  const unknownRequestBodies = [];
  const countedUnknownFetch = async (_url, options) => {
    unknownRequestBodies.push(JSON.parse(options.body));
    if (unknownRequestBodies.length === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: {
          role: 'assistant', content: null,
          tool_calls: [{ id: 'call_unknown', type: 'function', function: { name: 'run_shell', arguments: '{"command":"whoami"}' } }]
        } }] })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Tool unavailable.' } }] })
    };
  };
  const unknownAnswer = await answerWithMuse('Run a command', context, {
    apiKey: 'test-key',
    fetchImpl: countedUnknownFetch,
    timeoutMs: 1000
  });
  const unknownToolMessage = unknownRequestBodies[1].messages.find(message => message.role === 'tool');
  check('unknown requested function is returned as an error and never executed',
    unknownAnswer.provider === 'muse-spark'
      && unknownRequestBodies.length === 2
      && JSON.parse(unknownToolMessage.content).error === 'tool_not_allowed');
  check('the agent stops after its bounded turn count', MAX_TURNS === 3);

  console.log('\nPASS: ' + passed + ' Muse agent checks');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
