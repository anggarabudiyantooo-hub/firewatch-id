'use strict';

const { buildSnapshot, REPORT } = require('../lib/regional-haze');
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    passed++;
    console.log('  LULUS ' + name);
  } else {
    failed++;
    console.log('  GAGAL ' + name + ': dapat ' + JSON.stringify(actual) + ', harap ' + JSON.stringify(expected));
  }
}

console.log('\n== laporan haze regional dan batas interpretasi ==');
const report = buildSnapshot();
check('snapshot ASMC bertanggal 22 Oktober 2026', report.meta.asmc.reportDate, '2026-10-22');
check('laporan Kemenkes menyebut tujuh provinsi', report.meta.kemenkes.provinceCount, 7);
check('daftar provinsi sesuai laporan kesehatan', report.meta.kemenkes.provinces.length, 7);
check('angka kesehatan memiliki tanggal cakupan yang eksplisit', report.meta.kemenkes.dataThrough, '2026-10-21');
check('kasus ISPA aktif tidak salah diberi label sebagai kasus harian', report.meta.kemenkes.currentlyIllIspaCases, 4522);
check('angka ISPA dilabeli sebagai laporan kesehatan, bukan populasi terpapar',
  /bukan jumlah penduduk terpapar/i.test(report.meta.kemenkes.note), true);
check('laporan NEA mempertahankan catatan pencampuran permukaan terbatas',
  /limited mixing to surface levels/i.test(report.meta.nea.statement), true);
check('catatan PM2.5 NEA menyebut bukan konsentrasi asap spesifik',
  /not smoke-specific/i.test(report.meta.nea.airQualityNote)
    && /bukan konsentrasi asap spesifik/i.test(report.meta.nea.airQualityNoteId), true);
check('observasi asap Jakarta menyimpan tanggal sumber resmi dan tanggal kutipan secara terpisah',
  report.meta.bmkg.officialObservationDate === '2026-10-16'
    && report.meta.bmkg.mediaSummaryDate === '2026-10-20'
    && report.meta.bmkg.mediaBodyDate === '2026-10-16'
    && report.meta.bmkg.officialReportDate === '2026-10-17', true);
check('durasi dan ketinggian observasi BMKG bersumber pada kutipan yang teratribusi',
  report.meta.bmkg.durationHours.minimum === 5 && report.meta.bmkg.durationHours.maximum === 6
    && report.meta.bmkg.altitudeMinimumKm === 4
    && /Kompas.com.*Kepala BMKG/i.test(report.meta.bmkg.quotedStatementId), true);
check('konflik tanggal Kompas dan BMKG dipertahankan sebagai catatan, bukan dipastikan',
  /20 Okt/.test(report.meta.bmkg.dateAttributionNoteId)
    && /16 Okt/.test(report.meta.bmkg.dateAttributionNoteId)
    && report.meta.bmkg.eventDateStatus === 'source-conflict', true);
check('BMKG menjaga observasi atmosfer terpisah dari kualitas udara permukaan',
  /tidak berdampak pada kualitas udara permukaan/i.test(report.meta.bmkg.surfaceNoteId)
    && /bukan (?:data|pembacaan) PM2\.5/i.test(report.meta.bmkg.surfaceNoteId), true);
check('Jakarta ditampilkan sebagai marker observasi historis, bukan footprint plume',
  report.markers.some(marker => marker.id === 'jakarta-bmkg-observation' && marker.source === 'bmkg')
    && !report.reportedAreas.some(area => area.id === 'jakarta-bmkg-observation'), true);
check('sumber resmi BMKG dan kutipan media dapat diverifikasi terpisah',
  /^https:\/\//.test(report.meta.bmkg.officialSourceUrl)
    && /^https:\/\//.test(report.meta.bmkg.quotedSourceUrl), true);
check('cakupan spasial disebut perkiraan, bukan kontur resmi',
  /not official boundaries/i.test(report.meta.spatialNote), true);
check('ringkasan ASMC tersedia dalam bahasa Indonesia untuk antarmuka',
  /Semenanjung Malaysia.*Sarawak selatan/i.test(report.meta.asmc.summaryId), true);
check('peringatan bentuk peta tersedia dalam bahasa Indonesia',
  /bukan batas resmi.*pengukuran konsentrasi/i.test(report.meta.spatialNoteId), true);
check('overlay regional meliputi Sumatra, Kalimantan, Malaysia, Sarawak, Sulawesi, Maluku dan Papua',
  ['sumatra-riau', 'sumatra-south', 'borneo-west', 'borneo-central', 'peninsular-malaysia', 'southern-sarawak', 'sulawesi', 'maluku', 'papua']
    .every(id => report.reportedAreas.some(area => area.id === id)), true);
check('Singapore adalah marker laporan tersendiri, bukan blob konsentrasi permukaan',
  report.markers.some(marker => marker.id === 'singapore')
    && !report.reportedAreas.some(area => area.id === 'singapore'), true);
check('setiap bentuk awan regional tertutup dan memiliki koordinat valid',
  report.reportedAreas.every(area => Array.isArray(area.polygon) && area.polygon.length > 8
    && area.polygon[0][0] === area.polygon[area.polygon.length - 1][0]
    && area.polygon[0][1] === area.polygon[area.polygon.length - 1][1]
    && area.polygon.every(point => point.length === 2 && point.every(Number.isFinite))), true);
check('laporan mempertahankan tautan sumber yang dapat dibuka',
  [REPORT.asmc.sourceUrl, REPORT.kemenkes.sourceUrl, REPORT.kemenkes.officialSourceUrl, REPORT.nea.sourceUrl,
    REPORT.bmkg.officialSourceUrl, REPORT.bmkg.quotedSourceUrl]
    .every(url => /^https:\/\//.test(url)), true);

console.log('\n' + '='.repeat(40));
console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
console.log('='.repeat(40));
process.exit(failed ? 1 : 0);
