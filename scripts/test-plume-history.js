'use strict';

const { historyWindows, buildFramePlumes } = require('../lib/plume-history');
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

console.log('\n== riwayat plume indikatif ==');
const anchor = new Date('2026-10-22T13:00:00.000Z');
const detections = [
  { lat: -7.00, lon: 110.50, frp: 4, acq: '2026-10-21T13:00:00.000Z' },
  { lat: -7.05, lon: 110.55, frp: 8, acq: '2026-10-21T13:30:00.000Z' },
  { lat: -8.00, lon: 112.00, frp: 3, acq: '2026-10-21T19:00:00.000Z' },
  { lat: -2.00, lon: 120.00, frp: 6, acq: '2026-10-22T01:00:00.000Z' },
  { lat: -3.00, lon: 115.00, frp: 9, acq: '2026-10-22T07:00:00.000Z' },
  { lat: -4.00, lon: 116.00, frp: 100, acq: '2026-10-22T13:00:00.000Z' },
  { lat: -4.00, lon: 116.00, frp: 100, acq: 'waktu-rusak' }
];
const frames = historyWindows(detections, anchor);
check('empat frame historis berurutan', frames.map(frame => frame.hour).join(','), '-24,-18,-12,-6');
check('batas antarinterval berimpit', frames.slice(0, -1).every((frame, index) =>
  frame.intervalEnd === frames[index + 1].intervalStart), true);
check('setiap interval tepat enam jam', frames.every(frame =>
  Date.parse(frame.intervalEnd) - Date.parse(frame.intervalStart) === 6 * 60 * 60 * 1000), true);
check('waktu GFS diuji di tengah interval pertama', frames[0].windTargetTime, '2026-10-21T16:00:00.000Z');
check('awal interval masuk dan akhir interval pindah ke frame berikut',
  frames.map(frame => frame.detections.length).join(','), '2,1,1,1');
check('frame tidak mengambil deteksi tepat pada waktu acuan',
  frames.flatMap(frame => frame.detections).some(point => point.acq === anchor.toISOString()), false);
check('timestamp rusak diabaikan',
  frames.flatMap(frame => frame.detections).some(point => point.acq === 'waktu-rusak'), false);

const field = {
  ni: 360, nj: 181, la1: 90, lo1: 0, di: 1, dj: 1,
  u: new Float32Array(360 * 181).fill(0),
  v: new Float32Array(360 * 181).fill(-4)
};
const polygonCalls = [];
function polygon(lat, lon, bearing, length, halfAngle) {
  polygonCalls.push({ lat, lon, bearing, length, halfAngle });
  return [[lat, lon], [lat + 0.1, lon + 0.1], [lat, lon]];
}
const built = buildFramePlumes(frames[0], field, polygon);
check('dua deteksi dekat digabung dalam satu klaster', built.clusterCount, 1);
check('klaster mempertahankan jumlah deteksi interval', built.plumes[0] && built.plumes[0].count, 2);
check('FRP klaster adalah agregat dari dua deteksi', built.plumes[0] && built.plumes[0].frp, 12);
check('plume historis memakai arah dari angin GFS, bukan fallback',
  built.plumes[0] && built.plumes[0].wind.estimated, false);
check('arah geometri mengikuti komponen angin', built.plumes[0] && built.plumes[0].bearingTo, 180);
check('poligon luar dan inti dihitung dari data frame', polygonCalls.length, 2);
const manyDetections = Array.from({ length: 15 }, (_, index) => ({
  lat: -10 + index, lon: 100, frp: index + 1, acq: '2026-10-21T13:15:00.000Z'
}));
const capped = buildFramePlumes({ detections: manyDetections }, field, polygon);
check('jumlah plume historis dibatasi ke 14 klaster', capped.plumes.length, 14);
check('total klaster yang terpotong tetap dilaporkan', capped.totalClusterCount, 15);
check('metadata pemotongan menyatakan daftar tidak utuh', capped.truncated, true);

const missingWind = buildFramePlumes(frames[0], {
  ni: 360, nj: 181, la1: 90, lo1: 0, di: 1, dj: 1,
  u: new Float32Array(0), v: new Float32Array(0)
}, polygon);
check('tanpa nilai angin valid, tidak dibuat plume pengganti', missingWind.plumes.length, 0);

let invalidAnchorRejected = false;
try { historyWindows(detections, 'bukan-waktu'); }
catch (_) { invalidAnchorRejected = true; }
check('waktu acuan rusak ditolak', invalidAnchorRejected, true);
let nullAnchorRejected = false;
try { historyWindows(detections, null); }
catch (_) { nullAnchorRejected = true; }
check('waktu acuan null ditolak', nullAnchorRejected, true);

console.log('\n' + '='.repeat(40));
console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
console.log('='.repeat(40));
process.exit(failed ? 1 : 0);
