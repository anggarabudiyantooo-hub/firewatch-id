'use strict';
/**
 * Parser GRIB2 minimal untuk produk angin GFS dari NOAA NOMADS.
 *
 * Cakupan sengaja dibatasi pada apa yang benar-benar dikirim NOMADS untuk
 * UGRD/VGRD 10 m pada grid lat-lon reguler:
 *   - Section 3 template 0   : latitude/longitude grid
 *   - Section 5 template 3   : complex packing + spatial differencing
 *   - Section 5 template 0/2 : simple & complex packing (fallback)
 *
 * Ditulis sendiri karena paket npm yang ada (grib2-simple) gagal pada
 * template 3, padahal justru template itu yang dipakai GFS.
 *
 * Rujukan: WMO FM-92 GRIB2, NCEP Documentation of GRIB2.
 */

/** Pembaca bit big-endian (MSB first), sesuai konvensi GRIB. */
class BitReader {
  constructor(buf, start) { this.b = buf; this.pos = start; this.bit = 0; }
  read(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.pos];
      const b = (byte >> (7 - this.bit)) & 1;
      v = v * 2 + b;
      if (++this.bit === 8) { this.bit = 0; this.pos++; }
    }
    return v;
  }
  align() { if (this.bit) { this.bit = 0; this.pos++; } }
}

/** Membaca setiap pesan GRIB2 di dalam buffer. */
function splitMessages(buf) {
  const out = [];
  let off = 0;
  while (off + 16 <= buf.length) {
    if (buf.toString('ascii', off, off + 4) !== 'GRIB') { off++; continue; }
    const len = Number(buf.readBigUInt64BE(off + 8));
    if (!len || off + len > buf.length) break;
    out.push({ start: off, len, discipline: buf[off + 6] });
    off += len;
  }
  return out;
}

function sections(buf, msg) {
  const s = {};
  let p = msg.start + 16;
  const end = msg.start + msg.len - 4;
  while (p < end) {
    const len = buf.readUInt32BE(p);
    if (!len) break;
    s[buf[p + 4]] = { off: p, len };
    p += len;
  }
  return s;
}

/** Section 3: definisi grid lat-lon reguler (template 0). */
function readGrid(buf, sec) {
  const p = sec.off;
  const tmpl = buf.readUInt16BE(p + 12);
  if (tmpl !== 0) throw new Error('grid_template_' + tmpl);
  const ni = buf.readUInt32BE(p + 30);
  const nj = buf.readUInt32BE(p + 34);
  const la1 = buf.readInt32BE(p + 46) / 1e6;
  const lo1 = buf.readInt32BE(p + 50) / 1e6;
  const la2 = buf.readInt32BE(p + 55) / 1e6;
  const lo2 = buf.readInt32BE(p + 59) / 1e6;
  const di = buf.readUInt32BE(p + 63) / 1e6;
  const dj = buf.readUInt32BE(p + 67) / 1e6;
  const scanMode = buf[p + 71];
  return { ni, nj, la1, lo1, la2, lo2, di, dj, scanMode };
}

/** Section 4: parameter apa yang dibawa pesan ini. */
function readProduct(buf, sec) {
  const p = sec.off;
  return {
    template: buf.readUInt16BE(p + 7),
    category: buf[p + 9],
    number: buf[p + 10]
  };
}

/**
 * Section 5 + 7: membongkar nilai terkemas menjadi Float32Array.
 * Menangani template 0 (simple), 2 (complex) dan 3 (complex + spatial diff).
 */
function unpack(buf, s5, s7, bitmapSec) {
  const p = s5.off;
  const npts = buf.readUInt32BE(p + 5);
  const tmpl = buf.readUInt16BE(p + 9);
  const R = buf.readFloatBE(p + 11);
  const E = buf.readInt16BE(p + 15);
  const D = buf.readInt16BE(p + 17);
  const nbits = buf[p + 19];

  const scale = Math.pow(2, E) / Math.pow(10, D);
  const ref = R / Math.pow(10, D);
  const data = new Float32Array(npts);

  // --- template 0: simple packing ---
  if (tmpl === 0) {
    const br = new BitReader(buf, s7.off + 5);
    for (let i = 0; i < npts; i++) data[i] = ref + br.read(nbits) * scale;
    return { data, npts };
  }

  if (tmpl !== 2 && tmpl !== 3) throw new Error('drs_template_' + tmpl);

  // --- template 2/3: complex packing ---
  const nGroups = buf.readUInt32BE(p + 31);
  const refGroupWidths = buf[p + 35];
  const widthBits = buf[p + 36];
  const refGroupLengths = buf.readUInt32BE(p + 37);
  const lenIncr = buf[p + 41];
  const lastGroupLen = buf.readUInt32BE(p + 42);
  const scaledLenBits = buf[p + 46];

  // spatial differencing hanya ada pada template 3
  const spatialOrder = tmpl === 3 ? buf[p + 47] : 0;
  const extraOctets = tmpl === 3 ? buf[p + 48] : 0;

  const br = new BitReader(buf, s7.off + 5);

  // Nilai awal & minimum selisih untuk spatial differencing.
  let ival1 = 0, ival2 = 0, minDiff = 0;
  if (spatialOrder > 0) {
    const bits = extraOctets * 8;
    const signed = v => {
      const half = Math.pow(2, bits - 1);
      return v >= half ? -(v - half) : v;
    };
    ival1 = br.read(bits);
    if (spatialOrder === 2) ival2 = br.read(bits);
    minDiff = signed(br.read(bits));
    br.align();
  }

  const gref = new Int32Array(nGroups);
  for (let i = 0; i < nGroups; i++) gref[i] = br.read(nbits);
  br.align();

  const gwid = new Int32Array(nGroups);
  for (let i = 0; i < nGroups; i++) gwid[i] = refGroupWidths + br.read(widthBits);
  br.align();

  const glen = new Int32Array(nGroups);
  for (let i = 0; i < nGroups; i++) glen[i] = refGroupLengths + br.read(scaledLenBits) * lenIncr;
  glen[nGroups - 1] = lastGroupLen;
  br.align();

  // Bongkar nilai mentah tiap grup.
  const raw = new Int32Array(npts);
  let k = 0;
  for (let g = 0; g < nGroups && k < npts; g++) {
    const w = gwid[g], n = Math.min(glen[g], npts - k);
    if (w === 0) { for (let i = 0; i < n; i++) raw[k++] = gref[g]; }
    else { for (let i = 0; i < n; i++) raw[k++] = gref[g] + br.read(w); }
  }

  // Balikkan spatial differencing (nilai tersimpan sebagai selisih berurutan).
  if (spatialOrder === 1) {
    raw[0] = ival1;
    for (let i = 1; i < npts; i++) raw[i] += minDiff + raw[i - 1];
  } else if (spatialOrder === 2) {
    raw[0] = ival1; raw[1] = ival2;
    for (let i = 2; i < npts; i++) raw[i] += minDiff + 2 * raw[i - 1] - raw[i - 2];
  }

  for (let i = 0; i < npts; i++) data[i] = ref + raw[i] * scale;

  // Section 6 bitmap: titik yang tidak punya nilai ditandai NaN.
  if (bitmapSec && buf[bitmapSec.off + 5] === 0) {
    const bm = new BitReader(buf, bitmapSec.off + 6);
    const out = new Float32Array(npts);
    let j = 0;
    for (let i = 0; i < npts; i++) out[i] = bm.read(1) ? data[j++] : NaN;
    return { data: out, npts };
  }
  return { data, npts };
}

/** Parse seluruh pesan dalam buffer GRIB2 menjadi objek field. */
function parse(buf) {
  return splitMessages(buf).map(msg => {
    const s = sections(buf, msg);
    if (!s[3] || !s[4] || !s[5] || !s[7]) return null;
    const grid = readGrid(buf, s[3]);
    const prod = readProduct(buf, s[4]);
    const { data } = unpack(buf, s[5], s[7], s[6]);
    return { discipline: msg.discipline, ...prod, grid, data };
  }).filter(Boolean);
}

module.exports = { parse };
