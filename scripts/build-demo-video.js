'use strict';
/**
 * Rakun video demo 3 menit dari segmen rekaman layar plus narasi.
 *
 * Kenapa ada: Playwright merekam webm tanpa suara, dan durasi rekaman mengikuti
 * waktu tunggu model, bukan durasi skrip. Skrip ini menyelaraskan tiap segmen
 * ke anggaran detik yang tetap supaya totalnya tepat 180 detik, tanpa memotong
 * bagian yang menunjukkan bukti.
 *
 * Kecepatan dipertahankan wajar: narasi tidak dipercepat lebih dari 1.16x supaya
 * tetap terdengar alami. Segmen layar boleh lebih cepat karena sebagian besar
 * isinya menunggu jawaban model.
 *
 * Pakai: node scripts/build-demo-video.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'demo-video');
const SEG = path.join(OUT, 'segments');
const NAR = path.join(OUT, 'narration');
const TMP = path.join(OUT, 'build');
fs.mkdirSync(TMP, { recursive: true });

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const py = 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())';
  return execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim();
}
const FF = ffmpegPath();

function duration(file) {
  // ffmpeg menulis metadata ke stderr dan keluar dengan kode 1 tanpa output file.
  let info = '';
  try { execFileSync(FF, ['-i', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { info = String(error.stderr || ''); }
  const m = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error('cannot read duration of ' + file);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Anggaran detik per segmen. Totalnya tepat 180. */
const PLAN = [
  { name: '01-problem', target: 20 },
  { name: '02-report', target: 53 },
  { name: '03-agent', target: 52 },
  { name: '04-smoke-check', target: 31 },
  { name: '05-close', target: 24 }
];

const MAX_NARRATION_TEMPO = 1.16;

function run(args) {
  execFileSync(FF, ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
}

const report = [];
const parts = [];

for (const item of PLAN) {
  const video = path.join(SEG, item.name + '.webm');
  const audio = path.join(NAR, item.name + '.mp3');
  if (!fs.existsSync(video)) throw new Error('missing segment ' + video);
  if (!fs.existsSync(audio)) throw new Error('missing narration ' + audio);

  const vDur = duration(video);
  const aDur = duration(audio);
  const tempo = Math.max(1, aDur / item.target);
  if (tempo > MAX_NARRATION_TEMPO) {
    throw new Error(item.name + ': narration would need ' + tempo.toFixed(2)
      + 'x speedup, above the ' + MAX_NARRATION_TEMPO + 'x limit. Shorten the text instead.');
  }
  const videoSpeed = vDur / item.target;
  const part = path.join(TMP, item.name + '.mp4');

  // setpts mempercepat layar; atempo menyelaraskan narasi; apad+atrim mengunci durasi.
  const vFilter = 'setpts=PTS/' + videoSpeed.toFixed(6) + ',scale=1440:900,fps=30,format=yuv420p';
  const aFilter = 'atempo=' + tempo.toFixed(6) + ',apad,atrim=0:' + item.target + ',asetpts=N/SR/TB';

  run([
    '-i', video, '-i', audio,
    '-filter:v', vFilter, '-filter:a', aFilter,
    '-t', String(item.target),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart',
    part
  ]);

  const got = duration(part);
  parts.push(part);
  report.push({
    segment: item.name,
    recordedSeconds: Number(vDur.toFixed(1)),
    narrationSeconds: Number(aDur.toFixed(1)),
    targetSeconds: item.target,
    outputSeconds: Number(got.toFixed(1)),
    screenSpeedup: Number(videoSpeed.toFixed(2)),
    narrationTempo: Number(tempo.toFixed(3))
  });
  console.log('  ' + item.name + ': screen ' + vDur.toFixed(1) + 's -> ' + item.target
    + 's (' + videoSpeed.toFixed(2) + 'x), narration ' + aDur.toFixed(1) + 's at ' + tempo.toFixed(3) + 'x');
}

const listFile = path.join(TMP, 'concat.txt');
fs.writeFileSync(listFile, parts.map(p => "file '" + p.replace(/'/g, "'\\''") + "'").join('\n') + '\n');

const final = path.join(OUT, 'siaga-id-demo-3min.mp4');
run(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', final]);

const total = duration(final);
const sizeMb = fs.statSync(final).size / 1048576;
console.log('\nFinal: ' + path.relative(ROOT, final));
console.log('Duration: ' + total.toFixed(1) + 's  (' + Math.floor(total / 60) + ':' + String(Math.round(total % 60)).padStart(2, '0') + ')');
console.log('Size: ' + sizeMb.toFixed(1) + ' MB');
if (total > 180.5) throw new Error('over the 3 minute limit: ' + total.toFixed(1) + 's');

fs.writeFileSync(path.join(OUT, 'build-report.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  source: 'Playwright screen recording of https://firewatch-id.vercel.app plus generated English narration',
  totalSeconds: Number(total.toFixed(1)),
  sizeMb: Number(sizeMb.toFixed(1)),
  segments: report
}, null, 2) + '\n');
fs.rmSync(TMP, { recursive: true, force: true });
console.log('Build report: docs/demo-video/build-report.json');
