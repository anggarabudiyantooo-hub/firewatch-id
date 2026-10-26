'use strict';

// Curated snapshot from official situation reports accessed on 22 Oct 2026.
// The haze footprints below are intentionally generalized display shapes,
// not boundaries digitized from the source map and not concentration data.
const REPORT = {
  asmc: {
    name: 'ASMC Regional Haze Situation',
    reportAt: '2026-10-22T09:48:00.000Z',
    reportDate: '2026-10-22',
    sourceUrl: 'https://api.wis2.asmc.asean.org/collections/regional_haze/items/REGIONAL_HAZE_MAP',
    productUrl: 'https://wis2.asmc.asean.org/regional-haze-situation/',
    updateWindowUtc: '08:30-10:30 UTC',
    summary: 'Moderate to dense transboundary smoke haze was reported over parts of Peninsular Malaysia, Kalimantan, Sumatra and southern Sarawak. Haze was also observed over parts of Papua, Maluku and Sulawesi.',
    summaryId: 'Kabut asap lintas batas sedang hingga pekat dilaporkan di sebagian Semenanjung Malaysia, Kalimantan, Sumatra dan Sarawak selatan. Kabut juga diamati di bagian Papua, Maluku dan Sulawesi.',
    freshnessHours: 30
  },
  kemenkes: {
    name: 'Kemenkes health-impact report',
    publishedAt: '2026-10-22T12:06:00.000Z',
    dataThrough: '2026-10-21',
    provinceCount: 7,
    districtCount: 68,
    cumulativeIspaCases: 333470,
    currentlyIllIspaCases: 4522,
    provinces: [
      'Riau', 'Sumatera Selatan', 'Jambi', 'Kalimantan Barat',
      'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur'
    ],
    sourceUrl: 'https://news.republika.co.id/berita/tnb5mf393/kemenkes-catat-333470-kasus-ispa-akibat-asap-karhutla',
    officialSourceUrl: 'https://www.kemkes.go.id/id/kemenkes-kirim-tambahan-masker-rumah-oksigen-diperluas-hadapi-karhutla',
    note: 'Angka kasus ISPA adalah laporan kesehatan kumulatif, bukan jumlah penduduk terpapar dan bukan batas plume.',
    noteEn: 'ARI case counts are cumulative health reports, not counts of exposed people or plume boundaries.'
  },
  nea: {
    name: 'Singapore National Environment Agency',
    reportDate: '2026-10-22',
    sourceUrl: 'https://www.nea.gov.sg/media/news/advisories/index/haze-situation-update-22-october-2026',
    statement: 'Smoke haze from Kalimantan and Sumatra was observed over the surrounding region. Some haze was at higher altitudes above Singapore, with limited mixing to surface levels.',
    statementId: 'Kabut asap dari Kalimantan dan Sumatra teramati di kawasan sekitar Singapura. Sebagian berada di lapisan lebih tinggi, dengan pencampuran terbatas ke permukaan.',
    observationAt: '2026-10-22T10:00:00.000Z',
    pm25OneHour: { min: 23, max: 39, unit: 'µg/m³', period: '18:00 SGT' },
    psi24Hour: { min: 71, max: 96, category: 'Moderate', period: '18:00 SGT' },
    nextDayPsiForecast: { min: 101, max: 150, category: 'Unhealthy', date: '2026-10-23' },
    airQualityNote: 'PM2.5 and PSI readings measure ambient air quality, not smoke-specific concentration.',
    airQualityNoteId: 'Pembacaan PM2.5 dan PSI mengukur kualitas udara ambien, bukan konsentrasi asap spesifik.'
  },
  bmkg: {
    name: 'BMKG Jakarta smoke observation',
    eventDateStatus: 'source-conflict',
    officialObservationDate: '2026-10-16',
    mediaSummaryDate: '2026-10-20',
    mediaBodyDate: '2026-10-16',
    officialReportDate: '2026-10-17',
    publishedAt: '2026-10-21T08:35:00.000Z',
    durationHours: { minimum: 5, maximum: 6 },
    altitudeMinimumKm: 4,
    officialSourceUrl: 'https://www.bmkg.go.id/siaran-pers/bmkg-asap-sempat-terpantau-sesaat-di-jabodetabek-kini-sudah-menjauh',
    quotedSourceUrl: 'https://nasional.kompas.com/read/2026/10/21/15351871/kepala-bmkg-asap-karhutla-terpantau-5-6-jam-di-langit-jakarta-kita-tidak',
    officialSummaryId: 'Siaran resmi BMKG menyatakan citra satelit melihat asap sesaat memasuki Jawa bagian barat, termasuk Jabodetabek, pada 16 Okt dan mulai menjauh pada 17 Okt.',
    officialSummaryEn: 'BMKG\'s official release says satellite imagery briefly showed smoke entering western Java, including Greater Jakarta, on Oct 16, and moving away on Oct 17.',
    quotedStatementId: 'Kompas.com pada 21 Okt melaporkan kutipan Kepala BMKG: asap terlihat 5-6 jam pada ketinggian lebih dari 4 km. Cuplikan ringkasan mengarah ke 20 Okt, tetapi badan halaman Kompas yang dapat dibuka menyebut Jumat 16 Okt; tanggal kejadian tidak konsisten.',
    quotedStatementEn: 'Kompas.com reported a quote from the BMKG chief on Oct 21: smoke was visible for 5-6 hours at an altitude above 4 km. The search snippet points to Oct 20, but the accessible article body says Friday, Oct 16; the event date is inconsistent.',
    dateAttributionNoteId: 'Catatan tanggal: BMKG secara resmi mencatat kejadian satelit 16 Okt. Cuplikan ringkasan berita Kompas mengaitkan kutipan 5-6 jam dengan 20 Okt, sedangkan badan halaman Kompas menyebut 16 Okt. Dashboard mempertahankan kedua tanggal sebagai ketidakpastian sumber, bukan menyatukannya sebagai satu tanggal pasti.',
    dateAttributionNoteEn: 'Date note: BMKG officially records the satellite observation on Oct 16. A Kompas news snippet associates the 5-6 hour quote with Oct 20, while the article body says Oct 16. The dashboard keeps both dates as a source uncertainty rather than treating them as one confirmed date.',
    surfaceNoteId: 'BMKG menyatakan pengamatan satelit 16 Okt tidak berdampak pada kualitas udara permukaan; Kepala BMKG yang dikutip Kompas juga mengatakan asap 5-6 jam itu tidak dirasakan warga. Keduanya bukan pembacaan PM2.5 spesifik; rujuk stasiun lokal untuk kondisi udara.',
    surfaceNoteEn: 'BMKG said the Oct 16 satellite observation did not affect surface air quality. The BMKG chief quoted by Kompas also said the smoke visible for 5-6 hours was not felt by residents. Neither statement is a PM2.5 measurement; consult local stations for current air conditions.',
    spatialNoteId: 'Marker hanya menunjukkan lokasi laporan Jakarta, bukan koordinat pengamatan, cakupan asap, jalur sebaran, ketebalan, atau konsentrasi.',
    spatialNoteEn: 'The marker shows the location of the Jakarta report only, not the observation coordinates, smoke extent, trajectory, thickness, or concentration.'
  },
  spatialNote: 'Cloud footprints are a generalized visual summary of named report areas. Their edges are not official boundaries, observation contours or concentration measurements.',
  spatialNoteId: 'Sapuan awan adalah ringkasan visual umum dari area yang disebut dalam laporan. Tepi bentuk bukan batas resmi, kontur pengamatan, atau pengukuran konsentrasi.'
};

const REPORTED_AREAS = [
  { id: 'sumatra-riau', label: 'Sumatra', lat: 0.4, lon: 101.7, radiusKm: 235, phase: 0.1 },
  { id: 'sumatra-south', label: 'Sumatra', lat: -3.0, lon: 104.2, radiusKm: 210, phase: 0.8 },
  { id: 'borneo-west', label: 'Kalimantan', lat: 0.6, lon: 110.8, radiusKm: 210, phase: 1.4 },
  { id: 'borneo-central', label: 'Kalimantan', lat: -2.0, lon: 113.8, radiusKm: 285, phase: 2.1 },
  { id: 'peninsular-malaysia', label: 'Peninsular Malaysia', lat: 3.8, lon: 102.4, radiusKm: 190, phase: 0.4 },
  { id: 'southern-sarawak', label: 'Southern Sarawak', lat: 1.4, lon: 111.2, radiusKm: 160, phase: 2.6 },
  { id: 'sulawesi', label: 'Sulawesi', lat: -2.0, lon: 121.0, radiusKm: 185, phase: 1.8 },
  { id: 'maluku', label: 'Maluku', lat: -3.5, lon: 129.0, radiusKm: 170, phase: 0.9 },
  { id: 'papua', label: 'Papua', lat: -4.3, lon: 137.4, radiusKm: 210, phase: 2.9 }
];

const REPORT_MARKERS = [
  {
    id: 'malaysia',
    label: 'Semenanjung Malaysia',
    labelEn: 'Peninsular Malaysia',
    lat: 3.139,
    lon: 101.687,
    source: 'asmc',
    note: 'ASMC reported haze over parts of Peninsular Malaysia. This marker locates the reported region and is not a plume boundary or a station measurement.'
  },
  {
    id: 'singapore',
    label: 'Singapura',
    labelEn: 'Singapore',
    lat: 1.3521,
    lon: 103.8198,
    source: 'nea',
    note: 'NEA reported haze in the surrounding region and some haze at higher altitudes above Singapore, with limited mixing to surface levels.'
  },
  {
    id: 'jakarta-bmkg-observation',
    label: 'Jakarta · laporan BMKG 16/20 Okt',
    labelEn: 'Jakarta · BMKG report, Oct 16/20',
    lat: -6.2088,
    lon: 106.8456,
    source: 'bmkg',
    note: 'Marker lokasi laporan Jakarta. BMKG resmi mencatat asap satelit pada 16 Okt; cuplikan ringkasan Kompas mengaitkan kutipan 5-6 jam dengan 20 Okt, tetapi badan artikel menyebut 16 Okt. Tanggal tidak dipastikan.',
    noteId: 'Marker lokasi laporan Jakarta, bukan titik pengukuran. Siaran BMKG resmi mencatat asap satelit pada 16 Okt; cuplikan ringkasan Kompas mengaitkan kutipan 5-6 jam dengan 20 Okt, tetapi badan artikel menyebut 16 Okt. Tanggal kutipan tidak dipastikan.',
    noteEn: 'This marker locates the Jakarta report, not a measurement point. BMKG officially records satellite-observed smoke on Oct 16; a Kompas search snippet associates a 5-6 hour quote with Oct 20, but the article body says Oct 16. The quoted date is not confirmed.'
  }
];

const EARTH_RADIUS_KM = 6371;
const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

function destination(lat, lon, bearingDeg, distanceKm) {
  const bearing = bearingDeg * TO_RAD;
  const distance = distanceKm / EARTH_RADIUS_KM;
  const latitude = lat * TO_RAD;
  const longitude = lon * TO_RAD;
  const nextLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(distance)
    + Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing)
  );
  const nextLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude),
    Math.cos(distance) - Math.sin(latitude) * Math.sin(nextLatitude)
  );
  const outLon = ((nextLongitude * TO_DEG + 540) % 360) - 180;
  return [+((nextLatitude * TO_DEG).toFixed(4)), +(outLon.toFixed(4))];
}

function reportedAreaRing(area, steps = 24) {
  if (!area || !Number.isFinite(area.lat) || !Number.isFinite(area.lon)
      || !Number.isFinite(area.radiusKm) || area.radiusKm <= 0) return [];
  const ring = [];
  const phase = Number.isFinite(area.phase) ? area.phase : 0;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 360;
    const radians = angle * TO_RAD;
    const variation = 0.88 + 0.07 * Math.sin(3 * radians + phase)
      + 0.05 * Math.cos(5 * radians - phase * 0.7);
    ring.push(destination(area.lat, area.lon, angle, area.radiusKm * variation));
  }
  ring.push(ring[0]);
  return ring;
}

function buildSnapshot() {
  return {
    meta: { ...REPORT },
    reportedAreas: REPORTED_AREAS.map(area => ({
      id: area.id,
      label: area.label,
      center: [area.lat, area.lon],
      polygon: reportedAreaRing(area),
      kind: 'reported-region'
    })),
    markers: REPORT_MARKERS.map(marker => ({ ...marker }))
  };
}

module.exports = {
  buildSnapshot,
  reportedAreaRing,
  REPORT,
  REPORTED_AREAS,
  REPORT_MARKERS
};
