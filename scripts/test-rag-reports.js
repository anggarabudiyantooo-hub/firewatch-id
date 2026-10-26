'use strict';

const { answer } = require('../lib/rag');
const { buildSnapshot } = require('../lib/regional-haze');
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++;
  else failed++;
  console.log('  ' + (ok ? 'LULUS ' : 'GAGAL ') + name + (ok ? '' : '\n    aktual: ' + actual + '\n    harapan: ' + expected));
}

const context = {
  overview: {
    meta: { source: 'test' },
    stats: {
      hotspots: 120,
      highConfidence: 90,
      totalFrp: 800,
      impactedRegions: 1,
      peopleExposed: 999999
    },
    impacted: [{
      name: 'Kota Contoh', prov: 'Provinsi Contoh', score: 44,
      level: 'Sedang', nearestKm: 13, population: 999999
    }],
    regionalHaze: buildSnapshot()
  }
};

console.log('\n== RAG memisahkan plume indikatif dari laporan regional/kesehatan ==');
const health = answer('Berapa kasus ISPA menurut Kemenkes?', context);
check('jawaban Kemenkes menyebut kasus kumulatif dan batas waktunya',
  health.answer.some(line => line.includes('333.470') && line.includes('2026-10-21')), true);
check('jawaban Kemenkes tidak menyebut kasus sebagai jumlah warga terpapar',
  health.answer.join(' ').includes('bukan jumlah penduduk terpapar'), true);
check('jawaban kesehatan mengambil sumber Kemenkes',
  health.sources.some(source => source.kind === 'health' && source.url), true);

const regional = answer('Apa laporan ASMC tentang Malaysia dan NEA Singapura?', context);
check('jawaban regional memuat ringkasan ASMC',
  regional.answer.some(line => line.includes('ASMC 2026-10-22')), true);
check('jawaban regional memuat catatan pencampuran permukaan NEA',
  regional.answer.some(line => line.includes('pencampuran terbatas ke permukaan')), true);
check('jawaban regional menyebut kualitas udara bukan asap spesifik',
  regional.answer.join(' ').includes('bukan konsentrasi asap spesifik'), true);
check('jawaban regional menyertakan sumber bertaut',
  regional.sources.some(source => source.kind === 'regional' && source.url), true);

const jakarta = answer('Asap Jakarta kemarin terpantau berapa lama dan pada ketinggian berapa menurut BMKG?', context);
check('kueri asap Jakarta dikenali sebagai laporan regional, bukan hitungan plume permukaan',
  jakarta.intent, 'regional');
check('jawaban BMKG membedakan tanggal rujukan kutipan dan siaran resmi',
  jakarta.answer.join(' ').includes('2026-10-20')
    && jakarta.answer.join(' ').includes('2026-10-16')
    && jakarta.answer.join(' ').includes('tanggal kejadian tidak konsisten'), true);
check('jawaban BMKG menyebut durasi dan ketinggian dengan atribusi Kompas',
  jakarta.answer.join(' ').includes('5-6 jam')
    && jakarta.answer.join(' ').includes('lebih dari 4 km')
    && jakarta.answer.join(' ').includes('Kompas.com'), true);
check('jawaban BMKG membedakan observasi atmosfer dari PM2.5 permukaan',
  jakarta.answer.join(' ').includes('bukan pembacaan PM2.5 spesifik'), true);
check('jawaban BMKG menyediakan tautan resmi dan kutipan media',
  jakarta.sources.some(source => source.url && source.url.includes('bmkg.go.id'))
    && jakarta.sources.some(source => source.url && source.url.includes('kompas.com')), true);

const modeled = answer('Berapa kota terdampak asap?', context);
check('jawaban daerah menyebut pusat kota dalam geometri plume indikatif GFS 10 m',
  modeled.answer.some(line => line.includes('1 pusat kota/kabupaten masuk geometri plume indikatif berbasis NOAA GFS 10 m')), true);
check('jawaban daerah tidak mengulang angka populasi sebagai paparan',
  modeled.answer.join(' ').includes('999.999'), false);
check('jawaban daerah membedakan model dari dampak resmi',
  modeled.answer.join(' ').includes('bukan hitungan orang terpapar'), true);
check('jawaban daerah menjelaskan keterbatasan angin GFS 10 m',
  modeled.answer.join(' ').includes('lapisan dekat permukaan')
    && modeled.answer.join(' ').includes('bukan transport asap pada ketinggian lebih dari 4 km'), true);

const unavailableContext = {
  overview: {
    ...context.overview,
    stats: { ...context.overview.stats, modeledCenterCount: 0, impactedRegions: 0 },
    impacted: [],
    impactModel: { status: 'wind-unavailable', inputClusters: 12, modeledClusters: 0 }
  }
};
const unavailable = answer('Berapa kota terdampak asap?', unavailableContext);
check('jawaban tidak mengubah angin yang hilang menjadi nol pusat',
  unavailable.answer.join(' ').includes('belum dihitung')
    && !unavailable.answer.join(' ').includes('0 pusat kota/kabupaten'), true);

const partialContext = {
  overview: {
    ...context.overview,
    stats: { ...context.overview.stats, modeledCenterCount: 1 },
    impactModel: { status: 'partial', inputClusters: 7, modeledClusters: 3 }
  }
};
const partial = answer('Berapa kota terdampak asap?', partialContext);
check('jawaban parsial menyatakan penyebut klaster dan angin valid',
  partial.answer.join(' ').includes('angin valid untuk 3 dari 7 klaster'), true);

const noDetectionContext = {
  overview: {
    ...context.overview,
    stats: { ...context.overview.stats, hotspots: 0, modeledCenterCount: 0, impactedRegions: 0 },
    impacted: [],
    impactModel: { status: 'no-detections', inputClusters: 0, modeledClusters: 0 }
  }
};
const noDetections = answer('Berapa kota terdampak asap?', noDetectionContext);
check('jawaban tanpa deteksi menjelaskan sumber data, bukan hanya angka nol',
  noDetections.answer.join(' ').includes('Tidak ada klaster FIRMS')
    && !noDetections.answer.join(' ').includes('0 pusat kota/kabupaten'), true);

console.log('\n========================================');
console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
console.log('========================================');
if (failed) process.exitCode = 1;
