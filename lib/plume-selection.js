'use strict';

const MAX_PLUME_CLUSTERS = 36;
const MAX_CLUSTERS_PER_REGION = 3;

function finiteCoordinate(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function inRangeCoordinate(value, min, max) {
  return finiteCoordinate(value) && Number(value) >= min && Number(value) <= max;
}

function fallbackRegion(cluster) {
  const lat = Number(cluster.lat);
  const lon = Number(cluster.lon);
  const latCell = Math.floor((lat + 90) / 2);
  const lonCell = Math.floor((lon + 180) / 2);
  return `grid:${latCell}:${lonCell}`;
}

/**
 * Selects a representative set of fire clusters by round-robin across
 * administrative or coarse geographic regions. The input should already be
 * sorted by FRP, but each region is ranked again so callers cannot change the
 * result accidentally through insertion order.
 */
function selectRegionalClusters(clusters, regionOf, options = {}) {
  const maxClusters = Number.isInteger(options.maxClusters) && options.maxClusters > 0
    ? options.maxClusters : MAX_PLUME_CLUSTERS;
  const perRegion = Number.isInteger(options.perRegion) && options.perRegion > 0
    ? options.perRegion : MAX_CLUSTERS_PER_REGION;
  const rows = Array.isArray(clusters) ? clusters.filter(cluster => cluster
    && inRangeCoordinate(cluster.lat, -90, 90)
    && inRangeCoordinate(cluster.lon, -180, 180)) : [];
  const groups = new Map();

  for (const cluster of rows) {
    let label = null;
    if (typeof regionOf === 'function') {
      try { label = regionOf(cluster); } catch (_) { label = null; }
    }
    label = typeof label === 'string' && label.trim() ? label.trim() : fallbackRegion(cluster);
    let group = groups.get(label);
    if (!group) {
      group = { region: label, clusters: [], totalFrp: 0 };
      groups.set(label, group);
    }
    group.clusters.push(cluster);
    const frp = Number(cluster.frp);
    if (Number.isFinite(frp) && frp > 0) group.totalFrp += frp;
  }

  const orderedGroups = [...groups.values()]
    .map(group => {
      group.clusters.sort((a, b) => {
        const frpA = Number.isFinite(Number(a.frp)) ? Number(a.frp) : 0;
        const frpB = Number.isFinite(Number(b.frp)) ? Number(b.frp) : 0;
        return frpB - frpA || Number(b.count || 0) - Number(a.count || 0)
          || Number(a.lat) - Number(b.lat) || Number(a.lon) - Number(b.lon);
      });
      group.selected = [];
      return group;
    })
    .sort((a, b) => b.totalFrp - a.totalFrp || a.region.localeCompare(b.region));

  const selected = [];
  for (let depth = 0; depth < perRegion && selected.length < maxClusters; depth++) {
    for (const group of orderedGroups) {
      if (selected.length >= maxClusters) break;
      const cluster = group.clusters[depth];
      if (!cluster) continue;
      selected.push(cluster);
      group.selected.push(cluster);
    }
  }

  selected.sort((a, b) => {
    const frpA = Number.isFinite(Number(a.frp)) ? Number(a.frp) : 0;
    const frpB = Number.isFinite(Number(b.frp)) ? Number(b.frp) : 0;
    return frpB - frpA || Number(b.count || 0) - Number(a.count || 0)
      || Number(a.lat) - Number(b.lat) || Number(a.lon) - Number(b.lon);
  });

  const selectedRegionCount = orderedGroups.filter(group => group.selected.length).length;
  return {
    clusters: selected,
    totalClusterCount: rows.length,
    totalRegionCount: orderedGroups.length,
    selectedRegionCount,
    maxClusters,
    perRegion,
    truncated: selected.length < rows.length,
    regions: orderedGroups.map(group => ({
      region: group.region,
      totalClusters: group.clusters.length,
      selectedClusters: group.selected.length,
      totalFrp: +group.totalFrp.toFixed(1)
    }))
  };
}

module.exports = {
  MAX_PLUME_CLUSTERS,
  MAX_CLUSTERS_PER_REGION,
  selectRegionalClusters
};
