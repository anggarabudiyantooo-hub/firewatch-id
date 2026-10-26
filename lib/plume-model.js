'use strict';

const EARTH_RADIUS_KM = 6371;
const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

function toRad(value) { return value * TO_RAD; }
function toDeg(value) { return value * TO_DEG; }

function validCoordinate(value, min, max) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== ''
    && Number.isFinite(number) && number >= min && number <= max;
}

function haversine(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

function destination(lat, lon, bearingDeg, distanceKm) {
  const bearing = toRad(bearingDeg);
  const distance = distanceKm / EARTH_RADIUS_KM;
  const latitude = toRad(lat);
  const longitude = toRad(lon);
  const nextLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(distance)
      + Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing)
  );
  const nextLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude),
    Math.cos(distance) - Math.sin(latitude) * Math.sin(nextLatitude)
  );
  return [toDeg(nextLatitude), ((toDeg(nextLongitude) + 540) % 360) - 180];
}

function plumePolygon(lat, lon, bearingTo, lengthKm, halfAngleDeg) {
  const points = [[lat, lon]];
  const steps = 9;
  for (let index = 0; index <= steps; index++) {
    const angle = bearingTo - halfAngleDeg + (2 * halfAngleDeg * index) / steps;
    points.push(destination(lat, lon, angle, lengthKm));
  }
  points.push([lat, lon]);
  return points;
}

function validCluster(cluster) {
  if (!cluster || !validCoordinate(cluster.lat, -90, 90)
      || !validCoordinate(cluster.lon, -180, 180)) return false;
  const frp = Number(cluster.frp);
  const count = Number(cluster.count);
  return Number.isFinite(frp) && frp >= 0 && Number.isFinite(count) && count > 0;
}

function validWind(wind) {
  if (!wind || wind.estimated === true) return false;
  const speed = Number(wind.speed);
  const from = Number(wind.from);
  return Number.isFinite(speed) && speed >= 0 && speed <= 120 && Number.isFinite(from);
}

function buildIndicativePlume(cluster, wind, regionOf, options = {}) {
  if (!validCluster(cluster) || !validWind(wind)) return null;

  const lat = Number(cluster.lat);
  const lon = Number(cluster.lon);
  const frp = Number(cluster.frp);
  const count = Number(cluster.count);
  const speed = Number(wind.speed);
  const windFrom = ((Math.round(Number(wind.from)) % 360) + 360) % 360;
  const bearingTo = (windFrom + 180) % 360;
  const lengthKm = Math.min(320, 18 + Math.sqrt(frp) * 6 + speed * 12);
  const halfAngle = Math.max(12, 34 - speed * 2);
  const intensity = Math.min(1, (frp / 900) * 0.6 + (count / 40) * 0.4);
  let sourceRegion = null;
  if (typeof regionOf === 'function') {
    try { sourceRegion = regionOf(lat, lon) || null; }
    catch (_) { sourceRegion = null; }
  }

  const plume = {
    lat,
    lon,
    frp,
    count,
    sourceRegion,
    wind: {
      speed: +speed.toFixed(2),
      from: windFrom,
      rh: null,
      temp: null,
      estimated: false
    },
    bearingTo,
    lengthKm: Math.round(lengthKm),
    halfAngle: Math.round(halfAngle),
    intensity: +intensity.toFixed(2),
    polygon: plumePolygon(lat, lon, bearingTo, lengthKm, halfAngle)
  };
  if (options.includeCore !== false) {
    plume.corePolygon = plumePolygon(lat, lon, bearingTo, lengthKm * 0.45, halfAngle * 0.7);
  }
  return plume;
}

/** Build an impact-model plume for every input cluster with a valid wind sample.
 * Visual map selection is a separate concern and may be capped for performance.
 */
function buildImpactPlumes(clusters, sampleWind, regionOf) {
  const input = Array.isArray(clusters) ? clusters : [];
  const plumes = [];
  let invalidClusters = 0;
  let windUnavailableClusters = 0;

  for (const cluster of input) {
    if (!validCluster(cluster)) {
      invalidClusters++;
      continue;
    }
    let wind = null;
    if (typeof sampleWind === 'function') {
      try { wind = sampleWind(Number(cluster.lat), Number(cluster.lon), cluster); }
      catch (_) { wind = null; }
    }
    if (!validWind(wind)) {
      windUnavailableClusters++;
      continue;
    }
    const plume = buildIndicativePlume(cluster, wind, regionOf, { includeCore: false });
    if (plume) plumes.push(plume);
    else invalidClusters++;
  }

  return {
    plumes,
    inputClusters: input.length,
    modeledClusters: plumes.length,
    windUnavailableClusters,
    invalidClusters
  };
}

function bearingBetween(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
    - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function angleDifference(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function compassId(degrees) {
  const directions = [
    'utara', 'utara-timur laut', 'timur laut', 'timur-timur laut',
    'timur', 'timur-tenggara', 'tenggara', 'selatan-tenggara',
    'selatan', 'selatan-barat daya', 'barat daya', 'barat-barat daya',
    'barat', 'barat-barat laut', 'barat laut', 'utara-barat laut'
  ];
  const normalized = ((degrees % 360) + 360) % 360;
  return directions[Math.round(normalized / 22.5) % 16];
}

function pointOnSegment(lat, lon, lat1, lon1, lat2, lon2) {
  const deltaLon = lon2 - lon1;
  const deltaLat = lat2 - lat1;
  const lengthSquared = deltaLon ** 2 + deltaLat ** 2;
  if (lengthSquared <= 1e-18) {
    return Math.abs(lon - lon1) <= 1e-9 && Math.abs(lat - lat1) <= 1e-9;
  }
  const cross = (lon - lon1) * deltaLat - (lat - lat1) * deltaLon;
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (lon - lon1) * deltaLon + (lat - lat1) * deltaLat;
  if (dot < -1e-9) return false;
  return dot <= lengthSquared + 1e-9;
}

function pointInPolygon(lat, lon, ring) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (!Array.isArray(current) || !Array.isArray(previous)
        || current.length < 2 || previous.length < 2
        || !Number.isFinite(Number(current[0])) || !Number.isFinite(Number(current[1]))
        || !Number.isFinite(Number(previous[0])) || !Number.isFinite(Number(previous[1]))) return false;
    const lat1 = Number(current[0]), lon1 = Number(current[1]);
    const lat2 = Number(previous[0]), lon2 = Number(previous[1]);
    if (pointOnSegment(lat, lon, lat1, lon1, lat2, lon2)) return true;
    const crosses = (lat1 > lat) !== (lat2 > lat)
      && lon < ((lon2 - lon1) * (lat - lat1)) / ((lat2 - lat1) || 1e-12) + lon1;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Match settlement centers against the exact model polygon used by the raster.
 * This is a relative geometry index, not measured exposure or observed smoke.
 */
function impactedRegions(plumes, regions) {
  const out = [];
  const plumeRows = Array.isArray(plumes) ? plumes : [];
  const regionRows = Array.isArray(regions) ? regions : [];

  for (const region of regionRows) {
    if (!region || !Number.isFinite(Number(region.lat)) || !Number.isFinite(Number(region.lon))) continue;
    let score = 0;
    const causes = [];

    for (const plume of plumeRows) {
      if (!plume || !Array.isArray(plume.polygon)
          || !Number.isFinite(Number(plume.lat)) || !Number.isFinite(Number(plume.lon))) continue;
      const regionLat = Number(region.lat), regionLon = Number(region.lon);
      if (!pointInPolygon(regionLat, regionLon, plume.polygon)) continue;

      const distance = haversine(regionLat, regionLon, Number(plume.lat), Number(plume.lon));
      if (!Number.isFinite(distance)) continue;
      const bearing = bearingBetween(Number(plume.lat), Number(plume.lon), regionLat, regionLon);
      const bearingTo = Number(plume.bearingTo);
      const angleOffset = angleDifference(bearing, bearingTo);
      const lengthKm = Number(plume.lengthKm);
      const halfAngle = Number(plume.halfAngle);
      const intensity = Number(plume.intensity);
      if (!Number.isFinite(bearingTo) || !Number.isFinite(angleOffset)
          || !(lengthKm > 0) || !(halfAngle > 0) || !Number.isFinite(intensity)) continue;

      const distanceFactor = Math.max(0, 1 - distance / (lengthKm * 1.15));
      const angleFactor = distance <= 1 ? 1
        : Math.max(0, 1 - angleOffset / (halfAngle * 1.25));
      const contribution = 100 * Math.max(0, intensity) * distanceFactor * angleFactor;
      if (contribution <= 0.5) continue;

      const windSpeed = plume.wind && Number(plume.wind.speed);
      const etaHours = Number.isFinite(windSpeed) && windSpeed > 0.3
        ? distance / (windSpeed * 3.6) : null;
      causes.push({
        km: Math.round(distance),
        frp: Number(plume.frp) || 0,
        etaH: etaHours,
        from: compassId(Number(plume.bearingTo)),
        windSpeed: Number.isFinite(windSpeed) ? windSpeed : 0
      });
      score += contribution;
    }

    if (score <= 0.5) continue;
    score = Math.min(100, score);
    const nearest = causes.reduce((best, cause) => cause.km < best.km ? cause : best);
    const level = score >= 66 ? 'Berat' : score >= 33 ? 'Sedang' : 'Ringan';
    const etas = causes.map(cause => cause.etaH).filter(value => value !== null);
    const etaHours = etas.length ? Math.min(...etas) : null;
    out.push({
      name: region.name,
      prov: region.prov,
      lat: Number(region.lat),
      lon: Number(region.lon),
      population: region.pop,
      score: +score.toFixed(1),
      level,
      nearestKm: nearest.km,
      plumes: causes.length,
      windSpeed: +nearest.windSpeed.toFixed(1),
      fromDir: nearest.from,
      etaHours: etaHours === null ? null : +etaHours.toFixed(1),
      etaText: etaHours === null ? 'angin lemah; estimasi waktu model tidak tersedia'
        : etaHours < 1 ? 'estimasi geometris <1 jam'
          : etaHours < 24 ? 'estimasi geometris ~' + Math.round(etaHours) + ' jam'
            : 'estimasi geometris lebih dari sehari',
      etaShort: etaHours === null ? 'estimasi tidak tersedia'
        : etaHours < 1 ? 'estimasi <1 jam'
          : etaHours < 24 ? 'estimasi ~' + Math.round(etaHours) + ' jam'
            : 'estimasi >1 hari',
      proximity: nearest.km <= 50 ? 'sangat dekat' : nearest.km <= 150 ? 'dekat' : 'jauh',
      advice: level === 'Berat'
        ? 'Kategori model tinggi. Periksa pengukuran kualitas udara dan imbauan kesehatan resmi setempat sebelum mengambil keputusan.'
        : level === 'Sedang'
          ? 'Kategori model sedang. Ikuti pemantauan kualitas udara lokal; plume tidak memastikan kondisi permukaan.'
          : 'Kategori model rendah. Tetap rujuk data kualitas udara lokal; model ini bukan penilaian kesehatan.'
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

module.exports = {
  plumePolygon,
  buildIndicativePlume,
  buildImpactPlumes,
  impactedRegions,
  pointInPolygon
};
