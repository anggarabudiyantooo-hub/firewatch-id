'use strict';

const assert = require('node:assert/strict');
const publicStatus = require('../lib/public-status');

const projected = publicStatus({
  updatedAt: '2026-11-04T02:00:00.000Z',
  mode: 'dipicu penjadwal luar',
  healthy: 1,
  total: 2,
  quota: { '429': 42, '5xx': 7, last429At: 'private-time' },
  recentLogs: [{ message: 'Bearer SECRET_VALUE' }],
  summary: { totalRuns: 1000, totalFails: 99 },
  criticalAlerts: [{ message: 'internal alert text' }],
  tasks: [
    {
      id: 'hotspots', label: 'Titik api (NASA FIRMS)', everyMs: 60000, everyLabel: 'tiap 1 menit',
      hasData: true, ageMs: 200000, ageLabel: '3 menit lalu', healthy: false, critical: true,
      runs: 10, fails: 3, consecutiveFails: 3, responseTimeMs: 9000,
      lastCheckedAt: 'private-check-time', endpoint: 'private.internal.example',
      errorNote: 'upstream said SECRET_VALUE', lastErrorAt: 'private-error-time',
      alert: 'internal alert text', backoff: true
    },
    {
      id: 'news', label: 'Berita (Google Berita)', everyMs: 600000, everyLabel: 'tiap 10 menit',
      hasData: false, ageMs: null, ageLabel: 'belum pernah', healthy: false, critical: false,
      runs: 0, fails: 0, consecutiveFails: 0, endpoint: 'private.internal.example'
    }
  ]
});

assert.equal(projected.updatedAt, '2026-11-04T02:00:00.000Z');
assert.equal(projected.mode, 'dipicu penjadwal luar');
assert.equal(projected.healthy, 0);
assert.equal(projected.total, 2);
assert.deepEqual(Object.keys(projected).sort(), ['healthy', 'mode', 'tasks', 'total', 'updatedAt']);
assert.deepEqual(Object.keys(projected.tasks[0]).sort(), [
  'ageLabel', 'ageMs', 'critical', 'everyLabel', 'everyMs', 'hasData', 'healthy',
  'id', 'label', 'late', 'needsAttention', 'persistentFailure', 'requested'
]);
assert.equal(projected.tasks[0].late, true);
assert.equal(projected.tasks[0].needsAttention, true);
assert.equal(projected.tasks[0].requested, true);
assert.equal(projected.tasks[1].requested, false);
assert.equal(projected.tasks[1].ageMs, null);
assert.doesNotMatch(JSON.stringify(projected), /SECRET_VALUE|private\.internal|private-time|internal alert text|totalRuns|quota|endpoint|errorNote/);

console.log('PASS public /api/status projection keeps freshness only and removes endpoints, counters, logs, quota, and error text.');
