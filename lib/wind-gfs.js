'use strict';
/**
 * Medan angin global dari NOAA GFS (NCEP), lewat layanan subset NOMADS.
 *
 * Alasan memakai ini alih-alih API cuaca per titik:
 *   - API per-koordinat menagih kuota tiap titik, sehingga grid global
 *     (ribuan titik) selalu kena 429. GFS memberi SELURUH bumi dalam satu
 *     berkas ~160 KB.
 *   - Hasilnya medan angin sebenarnya, bukan interpolasi dari sedikit titik.
 *
 * Grid: 1 derajat, 360 x 181 (lon 0..359 timur, lat 90..-90).
 */

const { parse } = require('./grib2');

const CYCLES = [18, 12, 6, 0];

function pad(n) { return String(n).padStart(2, '0'); }

/** Siklus GFS terbaru yang kemungkinan besar sudah terbit (jeda ~4 jam). */
function candidateRuns(now) {
  const out = [];
  const t = new Date(now.getTime() - 4 * 3600 * 1000);
  for (let back = 0; back < 3; back++) {
    const d = new Date(t.getTime() - back * 6 * 3600 * 1000);
    const ymd = d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
    const cyc = CYCLES.find(c => c <= d.getUTCHours());
    out.push({ ymd, cyc: pad(cyc === undefined ? 0 : cyc) });
  }
  // buang duplikat
  return out.filter((v, i, a) => a.findIndex(x => x.ymd === v.ymd && x.cyc === v.cyc) === i);
}

function urlFor(run, fhour) {
  const f = 'f' + String(fhour).padStart(3, '0');
  return 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl'
    + `?file=gfs.t${run.cyc}z.pgrb2.1p00.${f}`
    + '&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on'
    + `&dir=%2Fgfs.${run.ymd}%2F${run.cyc}%2Fatmos`;
}

/**
 * Ambil & parse medan angin global.
 * @param {function} fetchFn  fetch berbatas waktu
 * @param {number} fhour      jam prakiraan (0 = analisis terkini)
 * @returns {{ni,nj,la1,lo1,di,dj,u:Float32Array,v:Float32Array,run:string}}
 */
async function fetchWindField(fetchFn, fhour = 0) {
  let lastErr = null;
  for (const run of candidateRuns(new Date())) {
    try {
      const r = await fetchFn(urlFor(run, fhour), {}, 25000);
      if (!r.ok) throw new Error('nomads_' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      // NOMADS membalas HTML saat siklus belum tersedia.
      if (buf.length < 5000 || buf.toString('ascii', 0, 4) !== 'GRIB') {
        throw new Error('nomads_belum_terbit');
      }
      const msgs = parse(buf);
      const U = msgs.find(m => m.category === 2 && m.number === 2);
      const V = msgs.find(m => m.category === 2 && m.number === 3);
      if (!U || !V) throw new Error('komponen_angin_tidak_lengkap');

      // Sanitas: nilai angin 10 m yang wajar tidak melebihi ~120 m/s.
      let bad = 0;
      for (let i = 0; i < U.data.length; i += 997) {
        if (!Number.isFinite(U.data[i]) || Math.abs(U.data[i]) > 120) bad++;
      }
      if (bad > 3) throw new Error('nilai_tidak_wajar');

      return {
        ni: U.grid.ni, nj: U.grid.nj,
        la1: U.grid.la1, lo1: U.grid.lo1,
        di: U.grid.di, dj: U.grid.dj,
        u: U.data, v: V.data,
        run: `${run.ymd} ${run.cyc}Z`, fhour
      };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('gfs_tidak_tersedia');
}

/** Nilai pada indeks grid (lat menurun dari la1, lon menaik dari lo1). */
function sampleAt(f, lat, lon) {
  const j = Math.round((f.la1 - lat) / f.dj);
  const i = Math.round((((lon % 360) + 360) % 360 - f.lo1) / f.di);
  if (j < 0 || j >= f.nj || i < 0 || i >= f.ni) return null;
  const k = j * f.ni + i;
  const u = f.u[k], v = f.v[k];
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  return {
    speed: Math.hypot(u, v),
    // arah datangnya angin (konvensi meteorologi)
    from: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360
  };
}

/**
 * Susun titik-titik grid dalam sebuah kotak (atau seluruh dunia).
 * @param {number} step jarak antar titik dalam derajat
 */
function gridPoints(f, step, box) {
  const b = box || { west: -180, east: 180, south: -80, north: 80 };
  const pts = [];
  const s = Math.max(step, f.di);
  for (let lat = Math.ceil(b.south / s) * s; lat <= b.north; lat += s) {
    for (let lon = Math.ceil(b.west / s) * s; lon <= b.east; lon += s) {
      const w = sampleAt(f, lat, lon);
      if (!w) continue;
      pts.push({
        lat: +lat.toFixed(2), lon: +lon.toFixed(2),
        speed: +w.speed.toFixed(1),
        from: Math.round(w.from),
        to: Math.round((w.from + 180) % 360)
      });
    }
  }
  return pts;
}

module.exports = { fetchWindField, sampleAt, gridPoints };
