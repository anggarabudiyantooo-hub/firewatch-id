'use strict';
/**
 * Konfigurasi terpusat SIAGA ID, Fase 2.1
 * 
 * Tujuan: pindahkan nilai tetap yang tersebar di server.js & lib/*.js
 * ke satu tempat, agar operator bisa setel tanpa ubah kode.
 * 
 * Semua nilai bisa di-override via env var, dengan default yang wajar.
 * Nilai yang dikeraskan (BBOX, AQI_BANDS, dll) tetap di sini sebagai
 * konstanta domain, bukan env, karena memang tidak berubah.
 * 
 * Prioritas dari docs/HARDCODED.md:
 * - Tinggi: URL dasar hulu, interval penjadwal
 * - Sedang: TTL cache, SHELTER_MAX_AGE_DAYS, label sudut peta dari BBOX
 * - Rendah: limit atribusi, timeout klien
 */

// ---------- env helper ----------
function envInt(name, def) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}
function envStr(name, def) {
  const v = (process.env[name] || '').trim();
  return v || def;
}

// ---------- geografis & domain (wajar dikeraskan) ----------
const BBOX = {
  west: 94.5,
  south: -11.5,
  east: 141.5,
  north: 6.5
};

// Label sudut peta diturunkan dari BBOX, Fase 2.1: hapus tidak sinkron
function bboxCorners(bbox) {
  return {
    nw: `${bbox.north}°N ${bbox.west}°E`,
    ne: `${bbox.north}°N ${bbox.east}°E`,
    sw: `${Math.abs(bbox.south)}°S ${bbox.west}°E`,
    se: `${Math.abs(bbox.south)}°S ${bbox.east}°E`
  };
}

// ---------- interval penjadwal (ms), Fase 2.1: dari env ----------
// Default mengikuti irama penerbitan sumbernya
const SCHEDULER_INTERVALS = {
  quake: envInt('SCHEDULER_QUAKE_MS', 2 * 60 * 1000),        // 2 menit, BMKG gempa cepat
  tsunami: envInt('SCHEDULER_TSUNAMI_MS', 10 * 60 * 1000),   // 10 menit, PTWC
  news: envInt('SCHEDULER_NEWS_MS', 10 * 60 * 1000),         // 10 menit, Google Berita
  hotspots: envInt('SCHEDULER_HOTSPOTS_MS', 10 * 60 * 1000), // 10 menit, FIRMS
  shelter: envInt('SCHEDULER_SHELTER_MS', 30 * 60 * 1000),   // 30 menit, BNPB GIS
  volcano: envInt('SCHEDULER_VOLCANO_MS', 30 * 60 * 1000),   // 30 menit, turunan PVMBG+letusan
  pvmbg: envInt('SCHEDULER_PVMBG_MS', 3 * 60 * 60 * 1000),    // 3 jam, MAGMA status
  eruption: envInt('SCHEDULER_ERUPTION_MS', 10 * 60 * 1000), // 10 menit, pos pengamatan
  drought: envInt('SCHEDULER_DROUGHT_MS', 6 * 60 * 60 * 1000) // 6 jam, ONI + curah hujan
};

// ---------- TTL cache & Cache-Control (ms & detik), Fase 2.1 ----------
const CACHE_TTL = {
  // Cache in-memory (ms)
  airQuality: envInt('CACHE_AQ_MS', 30 * 60 * 1000),
  airQualityStale: envInt('CACHE_AQ_STALE_MS', 60 * 60 * 1000),
  airPoint: envInt('CACHE_AP_MS', 30 * 60 * 1000),
  windAloft: envInt('CACHE_WIND_ALOFT_MS', 30 * 60 * 1000),
  gfs: envInt('CACHE_GFS_MS', 3 * 60 * 60 * 1000),
  gfsStale: envInt('CACHE_GFS_STALE_MS', 6 * 60 * 60 * 1000),
  concessions: envInt('CACHE_CONC_MS', 60 * 60 * 1000),
  whoseLand: envInt('CACHE_WL_MS', 60 * 60 * 1000),
  place: envInt('CACHE_PLACE_MS', 24 * 60 * 60 * 1000),
  attribution: envInt('CACHE_ATTR_MS', 30 * 60 * 1000),
  volcanoSo2: envInt('CACHE_SO2_MS', 30 * 60 * 1000),
  sentinelMeta: envInt('CACHE_S2_META_MS', 30 * 60 * 1000),
  sentinelTile: envInt('CACHE_S2_TILE_MS', 6 * 60 * 60 * 1000),
  sentinelTileRadar: envInt('CACHE_S2_RADAR_MS', 2 * 60 * 60 * 1000),
  himawariMeta: envInt('CACHE_HIMA_META_MS', 25 * 1000),

  // Cache-Control header (detik), untuk CDN & browser
  overview: envInt('CC_OVERVIEW_S', 120),
  attribution: envInt('CC_ATTR_S', 600),
  hazard: envInt('CC_HAZARD_S', 60),
  eruptions: envInt('CC_ERUPTIONS_S', 600),      // Fase 1.3: disatukan 300 vs 900 → 600
  volcanoAsh: envInt('CC_VOLCANO_ASH_S', 600),   // Fase 1.3: disatukan
  volcanoSo2: envInt('CC_VOLCANO_SO2_S', 900),
  airQuality: envInt('CC_AQ_S', 900),
  airQualitySwr: envInt('CC_AQ_SWR_S', 1800),
  windField: envInt('CC_WIND_S', 1800),
  windFieldSwr: envInt('CC_WIND_SWR_S', 3600),
  concessions: envInt('CC_CONC_S', 1800),
  news: envInt('CC_NEWS_S', 60),
  status: 0, // no-store
  place: envInt('CC_PLACE_S', 86400),
  sentinelMeta: envInt('CC_S2_META_S', 1800),
  sentinelTile: envInt('CC_S2_TILE_S', 21600),
  himawariMeta: envInt('CC_HIMA_META_S', 30),
  himawariMetaSwr: envInt('CC_HIMA_META_SWR_S', 60),
  robots: envInt('CC_ROBOTS_S', 86400),
  sitemap: envInt('CC_SITEMAP_S', 86400)
};

// ---------- ambang & batas ----------
const THRESHOLDS = {
  shelterMaxAgeDays: envInt('SHELTER_MAX_AGE_DAYS', 10), // BNPB: pengungsi dianggap selesai setelah 10 hari tanpa update
  concessionLimit: envInt('CONCESSION_LIMIT', 220),      // sampel 220 titik ber-FRP tertinggi (batas waktu 60 detik)
  hotspotCap: envInt('HOTSPOT_CAP', 2000),               // potong payload titik api
  clustersMax: envInt('CLUSTERS_MAX', 40),
  hazardPointsMax: envInt('HAZARD_POINTS_MAX', 500),
  droughtLookbackDays: envInt('SENTINEL_LOOKBACK_DAYS', 60),
  sentinelMaxCloudDefault: envInt('SENTINEL_MAX_CLOUD_DEFAULT', 30)
};

// ---------- timeout & retry ----------
const TIMEOUTS = {
  fetchDefaultMs: envInt('FETCH_TIMEOUT_MS', 12000),
  fetchAirQualityMs: envInt('FETCH_AQ_TIMEOUT_MS', 25000),
  fetchAirPointMs: envInt('FETCH_AP_TIMEOUT_MS', 12000),
  fetchWindMs: envInt('FETCH_WIND_TIMEOUT_MS', 30000),
  fetchFirmsMs: envInt('FETCH_FIRMS_TIMEOUT_MS', 20000),
  fetchGfsMs: envInt('FETCH_GFS_TIMEOUT_MS', 25000),
  clientFetchMs: envInt('CLIENT_FETCH_TIMEOUT_MS', 12000), // frontend fetchT
  clientDebounceMs: envInt('CLIENT_DEBOUNCE_MS', 800),      // Fase 1.3: 450 → 800
  cronBudgetMs: envInt('CRON_BUDGET_MS', 45000)             // Vercel limit 60 detik - margin 15 detik
};

const RETRY = {
  attempts: envInt('RETRY_ATTEMPTS', 3),
  baseMs: envInt('RETRY_BASE_MS', 500),
  jitterMs: envInt('RETRY_JITTER_MS', 250)
};

// ---------- URL dasar hulu, Fase 2.1: tinggi ----------
// Semua URL hulu terpusat di sini, agar perubahan domain tidak perlu ubah kode di banyak tempat
const UPSTREAM_URLS = {
  firms: {
    base: envStr('FIRMS_BASE_URL', 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'),
    open: envStr('FIRMS_OPEN_BASE_URL', 'https://firms.modaps.eosdis.nasa.gov/api/area/csv') // arsip terbuka pakai modul firms-open.js
  },
  magma: {
    // PVMBG / MAGMA ESDM, status gunung api & laporan letusan
    status: envStr('MAGMA_STATUS_URL', 'https://magma.esdm.go.id/api/v1/gunung-api/status'),
    eruption: envStr('MAGMA_ERUPTION_URL', 'https://magma.esdm.go.id/v1/gunung-api/informasi-letusan'),
    // fallback snapshot sudah ada di lib/pvmbg-snapshot.js
  },
  bmkg: {
    quake: envStr('BMKG_QUAKE_URL', 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json'),
    quakeDirasakan: envStr('BMKG_QUAKE_FELT_URL', 'https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json')
  },
  bnpb: {
    // BNPB GIS, katalog dipindai otomatis, base URL saja
    catalog: envStr('BNPB_CATALOG_URL', 'https://gis.bnpb.go.id/server/rest/services'),
    // SHELTER_KNOWN tetap di lib/hazard.js karena pemetaan nama folder ke label
  },
  noaa: {
    gfs: {
      awsBase: envStr('GFS_AWS_BASE_URL', 'https://noaa-gfs-bdp-pds.s3.amazonaws.com'),
      nomads: envStr('GFS_NOMADS_URL', 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl')
    },
    ptwc: envStr('NOAA_PTWC_URL', 'https://www.tsunami.gov/events/xml/PHEB/'),
    cpc: envStr('NOAA_CPC_ONI_URL', 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt')
  },
  openMeteo: {
    airQuality: envStr('OPEN_METEO_AQ_URL', 'https://air-quality-api.open-meteo.com/v1/air-quality'),
    forecast: envStr('OPEN_METEO_FORECAST_URL', 'https://api.open-meteo.com/v1/forecast'),
    archive: envStr('OPEN_METEO_ARCHIVE_URL', 'https://archive-api.open-meteo.com/v1/archive')
  },
  himawari: {
    targetTimes: envStr('HIMAWARI_TIMES_URL', 'https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json'),
    tileBase: envStr('HIMAWARI_TILE_BASE', 'https://www.jma.go.jp/bosai/himawari/data/satimg/fd')
  },
  nominatim: envStr('NOMINATIM_URL', 'https://nominatim.openstreetmap.org/reverse'),
  gfw: {
    // Global Forest Watch vector tiles
    base: envStr('GFW_BASE_URL', 'https://tiles.globalforestwatch.org')
  },
  copernicus: {
    token: envStr('CDSE_TOKEN_URL', 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'),
    catalog: envStr('CDSE_CATALOG_URL', 'https://catalogue.dataspace.copernicus.eu/stac/search'),
    process: envStr('CDSE_PROCESS_URL', 'https://sh.dataspace.copernicus.eu/api/v1/process')
  }
};

// ---------- rate limiting ----------
const RATE_LIMIT = {
  normal: envInt('RL_NORMAL', 240),      // 240 req/menit endpoint ringan
  expensive: envInt('RL_EXPENSIVE', 90)  // 90 req/menit endpoint >1MB
};

// ---------- wind & AQ steps (harus cocok dengan frontend) ----------
const WIND_STEPS = [1, 1.5, 2, 3];
const AQ_STEPS = [0.25, 0.5, 1, 1.5];
const WIND_ALOFT_LEVELS = {
  '10m': { label: 'Permukaan 10 m', heightM: 10, hPa: null },
  '850': { label: '850 hPa (~1,5 km)', heightM: 1500, hPa: 850 },
  '700': { label: '700 hPa (~3 km)', heightM: 3000, hPa: 700 },
  '600': { label: '600 hPa (~4,2 km)', heightM: 4200, hPa: 600 },
  '500': { label: '500 hPa (~5,6 km)', heightM: 5600, hPa: 500 },
  '300': { label: '300 hPa (~9,2 km)', heightM: 9200, hPa: 300 }
};

module.exports = {
  BBOX,
  bboxCorners,
  SCHEDULER_INTERVALS,
  CACHE_TTL,
  THRESHOLDS,
  TIMEOUTS,
  RETRY,
  UPSTREAM_URLS,
  RATE_LIMIT,
  WIND_STEPS,
  AQ_STEPS,
  WIND_ALOFT_LEVELS
};
