'use strict';
/**
 * Perhitungan atmosfer untuk pemodelan sebaran abu vulkanik.
 *
 * Dipisahkan dari lib/volcano.js supaya dapat diuji tanpa jaringan.
 * Seluruh fungsi di sini murni: input angka, output angka.
 *
 * Konvensi yang dipegang di seluruh berkas:
 *
 *   - Arah angin mengikuti kaidah meteorologi. `from` adalah arah DATANG,
 *     `to` adalah arah PERGI, dan keduanya berbeda 180 derajat. Abu
 *     bergerak mengikuti `to`, bukan `from`.
 *   - Ketinggian selalu AMSL (di atas permukaan laut), dalam meter.
 *     Laporan PVMBG memakai "di atas puncak" dan harus dijumlahkan
 *     dengan elevasi gunung lebih dulu.
 *   - Komponen angin: u positif ke timur, v positif ke utara.
 */

/* ---------------- konversi arah ---------------- */

/** Arah datang (meteorologi) menjadi arah pergi. */
function toDirection(fromDeg) {
  return ((fromDeg % 360) + 360 + 180) % 360;
}

/** Arah pergi menjadi arah datang. */
function fromDirection(toDeg) {
  return ((toDeg % 360) + 360 + 180) % 360;
}

/**
 * Kecepatan + arah datang menjadi komponen u/v.
 * Angin dari utara (0 derajat) bergerak ke selatan: u=0, v negatif.
 */
function toUV(speed, fromDeg) {
  const rad = (fromDeg * Math.PI) / 180;
  return {
    u: -speed * Math.sin(rad),
    v: -speed * Math.cos(rad)
  };
}

/** Komponen u/v menjadi kecepatan + arah datang. */
function fromUV(u, v) {
  return {
    speed: Math.hypot(u, v),
    from: ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360
  };
}

/** Selisih dua sudut kompas, 0..180. */
function angleDiff(a, b) {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/* ---------------- ketinggian ---------------- */

/**
 * Ketinggian puncak kolom abu di atas permukaan laut.
 *
 * MAGMA melaporkan tinggi kolom "di atas puncak". Memperlakukannya sebagai
 * ketinggian absolut adalah kekeliruan yang berakibat nyata: kolom 1.000 m
 * di atas puncak Semeru (3.657 m) sebenarnya mencapai 4.657 m, sehingga
 * angin yang relevan berada di sekitar 500 hPa, bukan 700 hPa. Pada
 * kondisi geser angin vertikal, dua lapisan itu dapat bertiup ke arah
 * berlawanan.
 *
 * @param {number|null} summitElevM elevasi puncak, meter AMSL
 * @param {number|null} aboveSummitM tinggi kolom di atas puncak, meter
 * @returns {{ashTopM:number|null, basis:string}}
 */
function ashTopAMSL(summitElevM, aboveSummitM) {
  const e = Number(summitElevM);
  const h = Number(aboveSummitM);
  if (!Number.isFinite(h) || h <= 0) {
    return { ashTopM: null, basis: 'tinggi kolom tidak teramati' };
  }
  if (!Number.isFinite(e) || e <= 0) {
    // Tanpa elevasi puncak, tinggi kolom saja adalah batas bawah yang
    // diketahui — dinyatakan apa adanya, bukan dianggap AMSL penuh.
    return { ashTopM: h, basis: 'elevasi puncak tidak diketahui' };
  }
  return { ashTopM: e + h, basis: 'puncak + kolom di atas puncak' };
}

/* ---------------- lapisan tekanan ---------------- */

/**
 * Ketinggian geopotensial rata-rata tiap aras tekanan, meter AMSL.
 *
 * Dipakai hanya sebagai cadangan. Bila Open-Meteo mengembalikan
 * `geopotential_height_[level]`, nilai sebenarnya itulah yang dipakai
 * karena ketinggian aras tekanan berubah menurut suhu dan lintang.
 */
const LEVELS = [
  { hPa: 1000, zM: 110 },
  { hPa: 925, zM: 800 },
  { hPa: 850, zM: 1500 },
  { hPa: 700, zM: 3000 },
  { hPa: 600, zM: 4200 },
  { hPa: 500, zM: 5600 },
  { hPa: 400, zM: 7200 },
  { hPa: 300, zM: 9200 },
  { hPa: 250, zM: 10400 },
  { hPa: 200, zM: 11800 }
];

/** Ketinggian sebuah aras tekanan, memakai nilai nyata bila tersedia. */
function levelHeight(hPa, geo) {
  const real = geo && Number(geo[`geopotential_height_${hPa}hPa`]);
  if (Number.isFinite(real) && real > 0) return real;
  const f = LEVELS.find(l => l.hPa === hPa);
  return f ? f.zM : null;
}

/**
 * Dua aras tekanan yang mengapit sebuah ketinggian.
 * Bila ketinggian berada di luar rentang, aras terdekat dikembalikan
 * sebagai pasangan kembar sehingga interpolasi menghasilkan nilai itu saja.
 */
function bracketLevels(targetM, geo) {
  const withZ = LEVELS
    .map(l => ({ hPa: l.hPa, zM: levelHeight(l.hPa, geo) }))
    .filter(l => Number.isFinite(l.zM))
    .sort((a, b) => a.zM - b.zM);

  if (!withZ.length) return null;
  if (targetM <= withZ[0].zM) return { lower: withZ[0], upper: withZ[0] };
  if (targetM >= withZ[withZ.length - 1].zM) {
    const top = withZ[withZ.length - 1];
    return { lower: top, upper: top };
  }
  for (let i = 0; i < withZ.length - 1; i++) {
    if (targetM >= withZ[i].zM && targetM <= withZ[i + 1].zM) {
      return { lower: withZ[i], upper: withZ[i + 1] };
    }
  }
  return null;
}

/**
 * Angin pada sebuah ketinggian, hasil interpolasi VEKTOR antar dua aras.
 *
 * Interpolasi dilakukan pada komponen u dan v, bukan pada sudut. Merata-
 * ratakan sudut secara langsung memberi hasil keliru saat melewati utara:
 * 350 derajat dan 10 derajat secara fisik hanya berjarak 20 derajat,
 * tetapi rata-rata aritmetiknya menghasilkan 180 derajat — berlawanan arah.
 *
 * @param {number} targetM ketinggian yang dicari, meter AMSL
 * @param {object} cur objek `current` dari Open-Meteo
 * @returns {{speed:number, from:number, to:number, hPa:number, heightM:number,
 *            interpolated:boolean, levels:number[]}|null}
 */
function windAtHeight(targetM, cur) {
  if (!cur || !Number.isFinite(targetM)) return null;
  const br = bracketLevels(targetM, cur);
  if (!br) return null;

  const read = (hPa) => {
    const s = Number(cur[`wind_speed_${hPa}hPa`]);
    const f = Number(cur[`wind_direction_${hPa}hPa`]);
    return Number.isFinite(s) && Number.isFinite(f) ? toUV(s, f) : null;
  };

  const a = read(br.lower.hPa);
  const b = read(br.upper.hPa);

  // Bila salah satu aras kosong, pakai yang tersedia daripada gagal total.
  if (!a && !b) return null;
  if (!a || !b || br.lower.hPa === br.upper.hPa) {
    const one = a || b;
    const lvl = a ? br.lower : br.upper;
    const r = fromUV(one.u, one.v);
    return {
      speed: r.speed,
      from: r.from,
      to: toDirection(r.from),
      hPa: lvl.hPa,
      heightM: lvl.zM,
      interpolated: false,
      levels: [lvl.hPa]
    };
  }

  const span = br.upper.zM - br.lower.zM;
  const t = span > 0 ? (targetM - br.lower.zM) / span : 0;
  const u = a.u + (b.u - a.u) * t;
  const v = a.v + (b.v - a.v) * t;
  const r = fromUV(u, v);

  return {
    speed: r.speed,
    from: r.from,
    to: toDirection(r.from),
    // Aras yang paling dekat dilaporkan sebagai label; keduanya tetap
    // dicatat supaya asal angkanya dapat ditelusuri.
    hPa: t < 0.5 ? br.lower.hPa : br.upper.hPa,
    heightM: Math.round(targetM),
    interpolated: true,
    levels: [br.lower.hPa, br.upper.hPa]
  };
}

/**
 * Aras sampel untuk kolom abu, dari puncak sampai ujung atas.
 *
 * Abu bukan benda dua dimensi. Bagian bawah dan atas kolom dapat terbawa
 * ke arah berbeda, dan perbedaan itulah yang perlu terlihat — bukan
 * disembunyikan dengan memaksakan satu arah untuk seluruh kolom.
 */
function plumeLayers(summitElevM, ashTopM) {
  const base = Number.isFinite(summitElevM) && summitElevM > 0 ? summitElevM : 0;
  const top = Number(ashTopM);
  if (!Number.isFinite(top) || top <= base) return [];

  const span = top - base;
  // Kolom pendek cukup satu aras; makin tinggi, makin banyak yang berarti.
  const n = span < 1500 ? 1 : span < 4000 ? 2 : 3;

  const out = [];
  for (let i = 0; i < n; i++) {
    // Sampel diambil di tengah tiap irisan, bukan di tepinya, supaya
    // mewakili massa abu di irisan itu.
    const frac = (i + 0.5) / n;
    const z = base + span * frac;
    out.push({
      id: n === 1 ? 'full' : i === 0 ? 'low' : i === n - 1 ? 'high' : 'mid',
      heightM: Math.round(z),
      fraction: frac
    });
  }
  return out;
}

module.exports = {
  toDirection, fromDirection, toUV, fromUV, angleDiff,
  ashTopAMSL, levelHeight, bracketLevels, windAtHeight, plumeLayers,
  LEVELS
};
