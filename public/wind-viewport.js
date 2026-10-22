(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WindViewport = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var ALLOWED_STEPS = [1, 1.5, 2, 3];
  var ALLOWED_LEVELS = ['10m', '850', '700', '600', '500', '300'];
  var WORLD_WIDTH = 360;
  var MAX_REGIONAL_SPAN = 300;

  function readNumber(bounds, key) {
    if (!bounds || bounds[key] === undefined || bounds[key] === null || bounds[key] === '') return NaN;
    return Number(bounds[key]);
  }

  function normalizeBounds(bounds, step) {
    var west = readNumber(bounds, 'west');
    var south = readNumber(bounds, 'south');
    var east = readNumber(bounds, 'east');
    var north = readNumber(bounds, 'north');
    var gridStep = Number(step);

    if (![west, south, east, north].every(Number.isFinite)
      || !ALLOWED_STEPS.includes(gridStep)
      || west >= east || south >= north || south < -90 || north > 90) return null;

    var span = east - west;
    if (!Number.isFinite(span) || span <= 0) return null;
    var bucket = gridStep * 2;
    // Sisakan ruang bagi margin grid dan kerapatan adaptif sebelum satu dunia penuh.
    if (span >= MAX_REGIONAL_SPAN || span + 2 * bucket + 2 * gridStep >= WORLD_WIDTH) {
      return {
        west: -180, south: +south.toFixed(2), east: 180, north: +north.toFixed(2),
        wrapCenter: 0, step: Math.max(gridStep, 3), global: true
      };
    }

    var center = west + span / 2;
    var shift = WORLD_WIDTH * Math.floor((center + 180) / WORLD_WIDTH);
    var snappedWest = Math.floor((west - shift) / bucket) * bucket;
    var snappedSouth = Math.max(-90, Math.floor(south / bucket) * bucket);
    var snappedEast = Math.ceil((east - shift) / bucket) * bucket;
    var snappedNorth = Math.min(90, Math.ceil(north / bucket) * bucket);
    var normalized = {
      west: +snappedWest.toFixed(2),
      south: +snappedSouth.toFixed(2),
      east: +snappedEast.toFixed(2),
      north: +snappedNorth.toFixed(2),
      wrapCenter: +((snappedWest + snappedEast) / 2).toFixed(2),
      step: gridStep,
      global: false
    };

    if (normalized.west >= normalized.east
      || normalized.east - normalized.west > WORLD_WIDTH
      || Math.abs(normalized.west) > WORLD_WIDTH
      || Math.abs(normalized.east) > WORLD_WIDTH) return null;
    return normalized;
  }

  function buildQuery(bounds, step, level) {
    var normalized = normalizeBounds(bounds, step);
    var windLevel = String(level || '10m');
    if (!normalized || !ALLOWED_LEVELS.includes(windLevel)) return null;
    return 'step=' + encodeURIComponent(normalized.step)
      + '&level=' + encodeURIComponent(windLevel)
      + '&west=' + normalized.west.toFixed(2)
      + '&south=' + normalized.south.toFixed(2)
      + '&east=' + normalized.east.toFixed(2)
      + '&north=' + normalized.north.toFixed(2);
  }

  return { normalizeBounds: normalizeBounds, buildQuery: buildQuery };
});
