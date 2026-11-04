'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
const moduleUnderTest = { exports: {} };
const logLines = [];

vm.runInNewContext(source, {
  module: moduleUnderTest,
  exports: moduleUnderTest.exports,
  require() { throw new Error('private stack /private/path; SECRET_VALUE'); },
  console: { error: (...args) => logLines.push(args.join(' ')) }
}, { filename: 'api/index.js' });

const headers = {};
const response = {
  statusCode: 0,
  body: '',
  setHeader(name, value) { headers[name.toLowerCase()] = value; },
  end(body) { this.body = body; }
};

moduleUnderTest.exports({ url: '/?debug=test-debug-secret' }, response);
const body = JSON.parse(response.body);

assert.equal(response.statusCode, 500);
assert.deepEqual(body, { error: 'Terjadi kesalahan pada server.' });
assert.equal(headers['cache-control'], 'no-store');
assert.equal(headers['x-robots-tag'], 'noindex, nofollow, noarchive');
assert.equal(headers['x-content-type-options'], 'nosniff');
assert.equal(headers['content-type'], 'application/json; charset=utf-8');
assert.doesNotMatch(response.body, /SECRET_VALUE|private stack|\/private\/path|test-debug-secret/);
assert.deepEqual(logLines, ['[boot] gagal memuat server.js']);
assert.doesNotMatch(source, /searchParams\.get\(['"]debug['"]\)|DEBUG_KEY/);

console.log('PASS serverless boot failure is generic, no-store, noindex, and ignores debug query secrets.');
