'use strict';

const LAYER_ID = 'OMPS_NOAA21_NadirMapper_AerosolIndex_380';
const CAPABILITIES_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml';
const TILE_BASE_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const TILE_MATRIX_SET = 'GoogleMapsCompatible_Level6';
const MAX_NATIVE_ZOOM = 6;
const MAX_DATE_AGE_DAYS = 7;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseLatestDate(xml) {
  if (typeof xml !== 'string') throw new TypeError('gibs_capabilities_not_text');

  const identifier = '<ows:Identifier>' + LAYER_ID + '</ows:Identifier>';
  const identifierAt = xml.indexOf(identifier);
  if (identifierAt < 0) throw new Error('gibs_aerosol_layer_missing');

  const layerStart = xml.lastIndexOf('<Layer>', identifierAt);
  const layerEnd = xml.indexOf('</Layer>', identifierAt);
  if (layerStart < 0 || layerEnd < identifierAt) throw new Error('gibs_aerosol_layer_invalid');

  const layer = xml.slice(layerStart, layerEnd);
  const timeAt = layer.indexOf('<ows:Identifier>Time</ows:Identifier>');
  if (timeAt < 0) throw new Error('gibs_aerosol_time_dimension_missing');

  const dimensionStart = layer.lastIndexOf('<Dimension', timeAt);
  const dimensionEnd = layer.indexOf('</Dimension>', timeAt);
  if (dimensionStart < 0 || dimensionEnd < timeAt) throw new Error('gibs_aerosol_time_dimension_invalid');

  const dimension = layer.slice(dimensionStart, dimensionEnd);
  const match = dimension.match(/<Default>\s*([^<]+?)\s*<\/Default>/);
  const date = match && match[1].trim();
  if (!isValidDate(date)) throw new Error('gibs_aerosol_default_date_invalid');
  return date;
}

function dateAgeDays(value, now = Date.now()) {
  if (!isValidDate(value) || !Number.isFinite(now)) return null;
  const day = Date.parse(value + 'T00:00:00.000Z');
  const today = new Date(now);
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((utcToday - day) / 86400000);
}

function isRecentDate(value, now = Date.now()) {
  const age = dateAgeDays(value, now);
  return age !== null && age >= 0 && age <= MAX_DATE_AGE_DAYS;
}

function isValidTile(z, x, y) {
  if (!Number.isInteger(z) || z < 0 || z > MAX_NATIVE_ZOOM) return false;
  const n = 2 ** z;
  return Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && y >= 0 && x < n && y < n;
}

function tileUrl(date, z, x, y) {
  if (!isValidDate(date) || !isValidTile(z, x, y)) throw new RangeError('gibs_aerosol_tile_invalid');
  return TILE_BASE_URL + '/' + LAYER_ID + '/default/' + date + '/'
    + TILE_MATRIX_SET + '/' + z + '/' + y + '/' + x + '.png';
}

function isPng(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= PNG_SIGNATURE.length
    && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

module.exports = {
  LAYER_ID,
  CAPABILITIES_URL,
  MAX_NATIVE_ZOOM,
  MAX_DATE_AGE_DAYS,
  isValidDate,
  parseLatestDate,
  dateAgeDays,
  isRecentDate,
  isValidTile,
  tileUrl,
  isPng
};
