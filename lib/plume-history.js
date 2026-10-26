'use strict';

const { sampleAt } = require('./wind-gfs');
const { MAX_PLUME_CLUSTERS, selectRegionalClusters } = require('./plume-selection');

const PLUME_HISTORY_STEPS = [-24, -18, -12, -6];
const HISTORY_INTERVAL_HOURS = 6;
const HOUR_MS = 60 * 60 * 1000;
const MAX_HISTORY_CLUSTERS = MAX_PLUME_CLUSTERS;

function clusterHotspots(hotspots, cell = 0.5) {
  const map = new Map();
  for (const h of hotspots || []) {
    const lat = Number(h.lat);
    const lon = Number(h.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const frp = Number(h.frp);
    const key = `${Math.round(lat / cell)}|${Math.round(lon / cell)}`;
    let cluster = map.get(key);
    if (!cluster) {
      cluster = { lat: 0, lon: 0, frp: 0, count: 0 };
      map.set(key, cluster);
    }
    cluster.lat += lat;
    cluster.lon += lon;
    cluster.frp += Number.isFinite(frp) && frp > 0 ? frp : 0;
    cluster.count++;
  }
  return [...map.values()]
    .map(cluster => ({
      lat: +(cluster.lat / cluster.count).toFixed(3),
      lon: +(cluster.lon / cluster.count).toFixed(3),
      frp: +cluster.frp.toFixed(1),
      count: cluster.count
    }))
    .sort((a, b) => b.frp - a.frp);
}

function historyWindows(hotspots, anchorValue) {
  if (anchorValue === null || anchorValue === undefined || anchorValue === '') {
    throw new Error('waktu_acuan_tidak_valid');
  }
  const anchorMs = anchorValue instanceof Date
    ? anchorValue.getTime() : new Date(anchorValue).getTime();
  if (!Number.isFinite(anchorMs)) throw new Error('waktu_acuan_tidak_valid');
  const rows = Array.isArray(hotspots) ? hotspots : [];

  return PLUME_HISTORY_STEPS.map(hour => {
    const startMs = anchorMs + hour * HOUR_MS;
    const endMs = startMs + HISTORY_INTERVAL_HOURS * HOUR_MS;
    const detections = rows.filter(point => {
      if (!point || point.acq === null || point.acq === undefined) return false;
      const acquired = Date.parse(point.acq);
      return Number.isFinite(acquired) && acquired >= startMs && acquired < endMs;
    });
    return {
      hour,
      intervalStart: new Date(startMs).toISOString(),
      intervalEnd: new Date(endMs).toISOString(),
      windTargetTime: new Date(startMs + HISTORY_INTERVAL_HOURS * HOUR_MS / 2).toISOString(),
      detections
    };
  });
}

function buildFramePlumes(frame, field, plumePolygon, regionOf) {
  const allClusters = clusterHotspots(frame.detections);
  const selection = selectRegionalClusters(allClusters, regionOf, {
    maxClusters: MAX_HISTORY_CLUSTERS
  });
  const clusters = selection.clusters;
  const plumes = [];
  for (const cluster of clusters) {
    const wind = sampleAt(field, cluster.lat, cluster.lon);
    if (!wind) continue;
    const bearingTo = (wind.from + 180) % 360;
    const lengthKm = Math.min(320, 18 + Math.sqrt(cluster.frp) * 6 + wind.speed * 12);
    const halfAngle = Math.max(12, 34 - wind.speed * 2);
    const intensity = Math.min(1, (cluster.frp / 900) * 0.6 + (cluster.count / 40) * 0.4);
    plumes.push({
      lat: cluster.lat,
      lon: cluster.lon,
      frp: cluster.frp,
      count: cluster.count,
      wind: {
        speed: +wind.speed.toFixed(2),
        from: Math.round(wind.from),
        rh: null,
        temp: null,
        estimated: false
      },
      bearingTo: Math.round(bearingTo),
      lengthKm: Math.round(lengthKm),
      halfAngle: Math.round(halfAngle),
      intensity: +intensity.toFixed(2),
      polygon: plumePolygon(cluster.lat, cluster.lon, bearingTo, lengthKm, halfAngle),
      corePolygon: plumePolygon(cluster.lat, cluster.lon, bearingTo, lengthKm * 0.45, halfAngle * 0.7)
    });
  }
  return {
    clusterCount: clusters.length,
    totalClusterCount: allClusters.length,
    totalRegionCount: selection.totalRegionCount,
    selectedRegionCount: selection.selectedRegionCount,
    truncated: selection.truncated,
    plumes
  };
}

module.exports = {
  PLUME_HISTORY_STEPS,
  HISTORY_INTERVAL_HOURS,
  historyWindows,
  buildFramePlumes,
  clusterHotspots
};
