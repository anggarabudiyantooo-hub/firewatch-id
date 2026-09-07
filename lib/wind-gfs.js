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

const AWS_BASE = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com';

/** Berkas GRIB penuh di mirror AWS Open Data (tanpa batas laju). */
function awsUrl(run, fhour) {
  const f = 'f' + String(fhour).padStart(3, '0');
  return `${AWS_BASE}/gfs.${run.ymd}/${run.cyc}/atmos/gfs.t${run.cyc}z.pgrb2.1p00.${f}`;
}

/**
 * Ambil UGRD & VGRD 10 m dari mirror AWS lewat byte-range.
 * Berkas penuh ~90 MB, tapi indeks .idx memberi offset tiap pesan sehingga
 * cukup mengunduh ~160 KB. Ini menghindari batas laju NOMADS sepenuhnya.
 */
async function fetchFromAws(fetchFn, run, fhour) {
  const base = awsUrl(run, fhour);
  const ri = await fetchFn(base + '.idx', {}, 20000);
  if (!ri.ok) throw new Error('aws_idx_' + ri.status);
  const lines = (await ri.text()).split('\n').filter(Boolean);

  // Tiap baris: "nomor:offset:d=...:VAR:level:jenis:"
  let start = null;
  let end = null;
  for (let i = 0; i < lines.length; i++) {
    const p = lines[i].split(':');
    if (p[3] === 'UGRD' && p[4] === '10 m above ground' && start === null) {
      start = Number(p[1]);
    }
    // Batas akhir = offset pesan sesudah VGRD.
    if (p[3] === 'VGRD' && p[4] === '10 m above ground' && start !== null) {
      const nxt = lines[i + 1];
      end = nxt ? Number(nxt.split(':')[1]) - 1 : '';
      break;
    }
  }
  if (start === null || end === null) throw new Error('aws_idx_tanpa_angin');

  const r = await fetchFn(base, { headers: { Range: `bytes=${start}-${end}` } }, 30000);
  if (r.status !== 206 && r.status !== 200) throw new Error('aws_range_' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000 || buf.toString('ascii', 0, 4) !== 'GRIB') {
    throw new Error('aws_bukan_grib');
  }
  return buf;
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
      // Utamakan mirror AWS Open Data; NOMADS hanya cadangan karena
      // memberlakukan batas laju per-IP yang mudah tersentuh.
      let buf;
      try {
        buf = await fetchFromAws(fetchFn, run, fhour);
      } catch (awsErr) {
        const r = await fetchFn(urlFor(run, fhour), { redirect: 'follow' }, 25000);
        buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 5000 || buf.toString('ascii', 0, 4) !== 'GRIB') {
          const head = buf.toString('ascii', 0, Math.min(buf.length, 600));
          if (/Over Rate Limit/i.test(head)) {
            throw new Error('aws:' + awsErr.message + ' / nomads_rate_limit');
          }
          throw new Error('aws:' + awsErr.message + ' / nomads_' + r.status);
        }
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
