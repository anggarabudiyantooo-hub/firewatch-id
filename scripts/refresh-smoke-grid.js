'use strict';

const path = require('node:path');
const artifactTools = require('../lib/smoke-grid-artifact');

const target = path.resolve(__dirname, '..', 'public', 'data', 'smoke-grid.json');
const REFRESH_STEP_DEG = 0.8;
const REFRESH_PADDING_DEG = REFRESH_STEP_DEG;

function coverageSummary(artifact, variable) {
  const entry = artifact.variables[variable];
  if (!entry) return 'tidak tersedia';
  return entry.coverage.map(frame => frame.percent + '%').join(' / ');
}

async function main() {
  const startedAt = Date.now();
  const artifact = await artifactTools.buildRegionalArtifact({
    stepDeg: REFRESH_STEP_DEG,
    paddingDeg: REFRESH_PADDING_DEG,
    concurrency: 1,
    batchSize: artifactTools.BATCH_SIZE,
    minimumIntervalMs: 60000,
    retries: 3,
    timeoutMs: 30000
  });
  const result = artifactTools.writeArtifactIfChanged(artifact, target);
  console.log(`Grid CAMS regional: ${artifact.grid.nx} × ${artifact.grid.ny} = ${artifact.cellCount} cells`);
  console.log(`Native CAMS resolution: ${artifact.nativeResolutionDeg}° · artifact sample spacing: ${artifact.grid.stepDeg}°`);
  console.log(`Batches: ${artifact.batchCount} · valid times UTC: ${artifact.validTimes.join(', ')}`);
  console.log(`PM2.5 coverage (+0/+6/+12/+18 h): ${coverageSummary(artifact, 'pm2_5')}`);
  console.log(`AOD coverage: ${coverageSummary(artifact, 'aerosol_optical_depth')}`);
  console.log(`Dust coverage: ${coverageSummary(artifact, 'dust')}`);
  console.log(`PM10 wildfire coverage: ${coverageSummary(artifact, 'pm10_wildfires')}`);
  console.log(`Hash: ${result.dataHash}`);
  console.log(result.changed
    ? `Artefak diperbarui: ${result.filePath}`
    : `Data identik; file dipertahankan agar tidak memicu commit/deployment baru.`);
  console.log(`Durasi: ${((Date.now() - startedAt) / 1000).toFixed(1)} detik`);
}

main().catch(error => {
  console.error('[refresh-smoke-grid]', error.message);
  process.exitCode = 1;
});
