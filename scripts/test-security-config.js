'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const functionConfig = config.functions && config.functions['api/index.js'];
assert.ok(functionConfig, 'serverless entrypoint must have explicit function config');
assert.equal(typeof functionConfig.includeFiles, 'string', 'includeFiles must be a single glob string');
const braceGlob = /^\{([^{}]+)\}\/\*\*$/.exec(functionConfig.includeFiles);
assert.ok(braceGlob, 'includeFiles must use the expected root-level brace glob');
const includedRoots = braceGlob[1].split(',').sort();
assert.deepEqual(includedRoots, ['admin-ui', 'public']);
for (const directory of includedRoots) {
  assert.ok(fs.statSync(path.join(root, directory)).isDirectory(), directory + ' exists');
}

const expectedPrivatePaths = [
  '/operations', '/operations/:path*', '/operations.html',
  '/insiden', '/insiden/:path*', '/insiden.html',
  '/admin-assets/:path*', '/admin-login', '/admin-login.html', '/admin-login.js'
];
const headerRules = new Map((config.headers || []).map(rule => [rule.source, rule.headers || []]));
for (const source of expectedPrivatePaths) {
  const headers = new Map(headerRules.get(source).map(header => [header.key.toLowerCase(), header.value]));
  assert.match(headers.get('x-robots-tag') || '', /noindex/iu, source + ' must be noindex');
  assert.match(headers.get('cache-control') || '', /no-store/iu, source + ' must not be cached');
}

console.log('PASS Vercel config uses a single includeFiles brace glob for public/admin-ui and noindex/no-store headers for private routes.');
