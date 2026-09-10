'use strict';
/**
 * Citra Sentinel-2 L2A dari Copernicus Data Space Ecosystem.
 *
 * Dipakai untuk melihat rupa gunung api dari dekat: bekas aliran lava,
 * endapan abu di lereng, perubahan bentuk kawah. Resolusinya 10 m per
 * piksel, jauh lebih tajam daripada Himawari (~2 km) yang sudah dipakai
 * untuk pemantauan menit-per-menit.
 *
 * BATAS YANG HARUS DIPAHAMI — dan disampaikan ke pengguna:
 *
 *   Sentinel-2 BUKAN citra langsung. Satelitnya melintasi titik yang sama
 *   setiap 5 hari, dan Indonesia berawan hampir sepanjang tahun sehingga
 *   citra bebas awan sering lebih jarang lagi. Letusan yang terjadi pagi
 *   ini tidak akan terlihat di sini. Untuk itu Himawari-9 (10 menit)
 *   tetap menjadi andalan.
 *
 *   Karena itu tanggal perekaman setiap petak dilaporkan apa adanya lewat
 *   /api/sentinel/meta, bukan disembunyikan. Citra berumur tiga minggu
 *   yang disajikan tanpa keterangan lebih berbahaya daripada tidak ada
 *   citra sama sekali.
 *
 * Autentikasi: OAuth2 client_credentials. Kredensial hanya ada di server;
 * peramban memanggil proksi kita sendiri sehingga token tidak pernah
 * terkirim ke klien.
 */

const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';
// Catalog memakai jalur tersendiri, BUKAN di bawah /api/v1 seperti Process.
// Kekeliruan jalur membuat balasan 404 yang lalu diteruskan sebagai 502,
// sehingga petak citra tampil normal tetapi tanggal perekamannya tidak
// pernah muncul dan panel tertahan di "memuat...".
const CATALOG_URL = 'https://sh.dataspace.copernicus.eu/catalog/v1/search';

/** Ukuran petak yang dikirim ke peta. */
const TILE_PX = 512;

/**
 * Berapa lama ke belakang citra dicari.
 *
 * Terlalu pendek membuat sebagian besar wilayah kosong karena awan;
 * terlalu panjang menyajikan citra usang seolah keadaan sekarang.
 * 60 hari adalah kompromi: cukup untuk mendapat satu jendela cerah di
 * iklim tropis, dan masih cukup dekat untuk memperlihatkan endapan
 * erupsi yang belum tertutup vegetasi.
 */
const LOOKBACK_DAYS = 60;

/* ---------------- produk ---------------- */

/**
 * Evalscript ditulis di sini, bukan dikirim klien.
 *
 * Membiarkan klien mengirim skripnya sendiri berarti membuka eksekusi
 * kode arbitrer pada kuota kita. Daftar tertutup ini sekaligus menjadi
 * allowlist.
 */
/**
 * Produk radar Sentinel-1.
 *
 * Dipisahkan dari PRODUCTS karena koleksi datanya berbeda
 * (sentinel-1-grd, bukan sentinel-2-l2a) dan tidak mengenal tutupan awan.
 *
 * Inilah alasan utamanya ada: BANJIR TERJADI SAAT LANGIT BERAWAN.
 * Studi verifikasi klaim asuransi menemukan deteksi banjir dari citra
 * optik Sentinel-2 hanya berhasil 50-60% karena awan menutupi kejadian,
 * sementara SAR Sentinel-1 mencapai 99%. Radar menembus awan dan hujan,
 * sehingga justru dapat memotret saat banjir sedang berlangsung —
 * tepat ketika citra optik tidak berguna.
 *
 * Cara membacanya: air permukaan memantulkan gelombang radar menjauh
 * dari satelit, sehingga tampak GELAP. Daratan kasar memantulkannya
 * kembali dan tampak terang. Genangan karena itu terlihat sebagai
 * bercak gelap.
 */
const RADAR_PRODUCTS = {
  flood: {
    label: 'Genangan radar (menembus awan)',
    desc: 'Sentinel-1 SAR. Permukaan air tampak biru. Radar menembus awan '
      + 'dan hujan, sehingga tetap terbaca saat banjir sedang berlangsung. '
      + 'Catatan: di medan bergunung, lereng yang membelakangi satelit juga '
      + 'tampak gelap dan dapat keliru terbaca sebagai air.',
    bands: ['VV'],
    script: `//VERSION=3
function setup() {
  return { input: ["VV","dataMask"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  // Hamburan balik rendah = permukaan halus = air.
  //
  // Ambang diperketat setelah pengujian di lereng Semeru: pada 0,02
  // seluruh punggungan bukit ikut terwarnai biru. Penyebabnya bayangan
  // radar (radar shadow) — sisi lereng yang membelakangi satelit tidak
  // menerima pantulan dan tampak segelap air. Ini keterbatasan yang
  // melekat pada SAR di medan bergunung, jadi ambang dipilih cukup
  // rendah agar hanya genangan sungguhan yang lolos.
  let v = s.VV;
  if (v < 0.006) return [0.05, 0.15, 0.50, s.dataMask];   // air tenang
  if (v < 0.015) return [0.25, 0.45, 0.75, s.dataMask];   // air beriak / dangkal
  // Daratan abu-abu agar genangan menonjol tanpa menutupi bentang alam.
  let g = Math.min(1, Math.sqrt(v) * 1.9);
  return [g, g, g, s.dataMask];
}`
  }
};

const PRODUCTS = {
  // Warna alami. Faktor 2,5 adalah peregangan lazim untuk reflektansi
  // Sentinel-2 yang nilainya rendah pada permukaan alami.
  natural: {
    label: 'Warna alami',
    desc: 'Rupa permukaan seperti terlihat mata: hutan hijau, lahar dan abu keabuan.',
    bands: ['B04', 'B03', 'B02'],
    script: `//VERSION=3
function setup() {
  return { input: ["B04","B03","B02","dataMask"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  return [2.5*s.B04, 2.5*s.B03, 2.5*s.B02, s.dataMask];
}`
  },

  // SWIR menembus asap tipis dan menyorot material panas serta lahan
  // terbuka; kombinasi baku untuk memeriksa dampak erupsi dan kebakaran.
  swir: {
    label: 'Inframerah gelombang pendek',
    desc: 'Menembus asap tipis. Endapan lava, lahar, dan lahan terbakar tampak jingga terang.',
    bands: ['B12', 'B08', 'B04'],
    script: `//VERSION=3
function setup() {
  return { input: ["B12","B08","B04","dataMask"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  return [2.5*s.B12, 2.5*s.B08, 2.5*s.B04, s.dataMask];
}`
  },

  // ---- Indeks untuk kekeringan ----

  // NDMI mengukur kandungan air pada tajuk tanaman. Untuk kekeringan,
  // indeks ini lebih tepat daripada NDVI: tanaman kehilangan air jauh
  // sebelum warnanya berubah, sehingga tekanan kekeringan terbaca lebih
  // awal. Penelitian di DAS Opak, Yogyakarta menemukan korelasi NDMI
  // dengan indeks curah hujan (SPI) r = 0,70, lebih kuat daripada NDVI
  // yang r = 0,53.
  moisture: {
    label: 'Kelembapan tanaman (NDMI)',
    desc: 'Biru = tanaman berair cukup, merah = tanaman kekurangan air. '
      + 'Menandai tekanan kekeringan sebelum daun menguning.',
    bands: ['B08', 'B11'],
    script: `//VERSION=3
function setup() {
  return { input: ["B08","B11","dataMask"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  let v = (s.B08 - s.B11) / (s.B08 + s.B11);
  // Merah kering -> kuning -> hijau -> biru basah
  let r, g, b;
  if (v < -0.2)      { r = 0.65; g = 0.10; b = 0.10; }
  else if (v < 0)    { r = 0.90; g = 0.45; b = 0.15; }
  else if (v < 0.2)  { r = 0.95; g = 0.85; b = 0.35; }
  else if (v < 0.4)  { r = 0.45; g = 0.75; b = 0.35; }
  else               { r = 0.10; g = 0.45; b = 0.75; }
  return [r, g, b, s.dataMask];
}`
  },

  // ---- Indeks untuk genangan air ----

  // MNDWI memakai SWIR, bukan inframerah dekat seperti NDWI biasa.
  // Bedanya penting di Indonesia: NDWI kerap salah menandai atap seng
  // dan lahan terbangun sebagai air, sedangkan MNDWI menekan kekeliruan
  // itu — dan permukiman padat justru yang paling sering kebanjiran.
  water: {
    label: 'Genangan air (MNDWI)',
    desc: 'Biru tua = permukaan tergenang. Memakai SWIR agar atap logam '
      + 'dan lahan terbangun tidak salah terbaca sebagai air.',
    bands: ['B03', 'B11'],
    script: `//VERSION=3
function setup() {
  return { input: ["B03","B11","B08","dataMask"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  let mndwi = (s.B03 - s.B11) / (s.B03 + s.B11);
  if (mndwi > 0.3)       return [0.05, 0.25, 0.75, s.dataMask];  // air jelas
  if (mndwi > 0.0)       return [0.35, 0.60, 0.90, s.dataMask];  // air dangkal/keruh
  // Selain air, tampilkan latar warna alami agar konteksnya terbaca.
  return [2.0*s.B11, 1.6*s.B08, 1.4*s.B03, s.dataMask];
}`
  },

  // Vegetasi memantulkan kuat di inframerah dekat. Lereng yang tertutup
  // abu kehilangan warna merahnya — cara cepat melihat luas endapan.
  vegetation: {
    label: 'Warna semu vegetasi',
    desc: 'Vegetasi sehat merah terang. Lereng tertutup abu kehilangan warna merahnya.',
    bands: ['B08', 'B04', 'B03'],
    script: `//VERSION=3
function setup() {
  return { input: ["B08","B04","B03","dataMask"], output: { bands: 4 } };
}
function evaluatePixel(s) {
  return [2.5*s.B08, 2.5*s.B04, 2.5*s.B03, s.dataMask];
}`
  }
};

/* ---------------- token ---------------- */

let tokenCache = { value: null, expMs: 0 };

function credentials() {
  const id = (process.env.CDSE_CLIENT_ID || '').trim();
  const secret = (process.env.CDSE_CLIENT_SECRET || '').trim();
  return id && secret ? { id, secret } : null;
}

function isConfigured() {
  return credentials() !== null;
}

/**
 * Token OAuth2, di-cache sampai mendekati kedaluwarsa.
 *
 * Dokumentasi Copernicus menegaskan permintaan token dibatasi lajunya dan
 * meminta token dipakai ulang selama masa berlakunya. Meminta token baru
 * pada setiap petak akan menghasilkan 429 dalam hitungan detik.
 */
async function getToken(fetchFn) {
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.expMs) return tokenCache.value;

  const c = credentials();
  if (!c) throw new Error('cdse_belum_dikonfigurasi');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: c.id,
    client_secret: c.secret
  }).toString();

  const r = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }, 20000);
  if (!r.ok) throw new Error('cdse_token_' + r.status);

  const j = await r.json();
  if (!j.access_token) throw new Error('cdse_token_kosong');

  // Disisakan 60 detik agar token tidak kedaluwarsa di tengah permintaan.
  const ttl = Math.max(60, Number(j.expires_in) || 600) - 60;
  tokenCache = { value: j.access_token, expMs: now + ttl * 1000 };
  return tokenCache.value;
}

/** Dipanggil saat kredensial ditolak, supaya percobaan berikutnya segar. */
function resetToken() {
  tokenCache = { value: null, expMs: 0 };
}

/* ---------------- geometri petak ---------------- */

/** Batas petak XYZ dalam meter Web Mercator (EPSG:3857). */
function tileBounds3857(z, x, y) {
  const size = 20037508.342789244 * 2;
  const res = size / 2 ** z;
  const minX = -20037508.342789244 + x * res;
  const maxY = 20037508.342789244 - y * res;
  return [minX, maxY - res, minX + res, maxY];
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/* ---------------- pengambilan petak ---------------- */

/**
 * Satu petak citra.
 *
 * `maxCloud` menyaring adegan berdasarkan tutupan awan yang tercatat di
 * metadata. leastCC memilih adegan paling cerah dalam jendela waktu,
 * bukan yang paling baru — untuk memeriksa rupa permukaan, citra cerah
 * tiga minggu lalu lebih berguna daripada citra kemarin yang tertutup awan.
 */
async function fetchTile(fetchFn, { product, z, x, y, maxCloud = 30, days = LOOKBACK_DAYS }) {
  const isRadar = !!RADAR_PRODUCTS[product];
  const prod = isRadar ? RADAR_PRODUCTS[product] : PRODUCTS[product];
  if (!prod) throw new Error('produk_tidak_dikenal');

  const token = await getToken(fetchFn);
  const bbox = tileBounds3857(z, x, y);

  // Radar tidak mengenal tutupan awan, dan yang dicari adalah keadaan
  // TERBARU — genangan berubah dalam hitungan hari. Optik sebaliknya
  // memilih adegan paling cerah dalam jendela, karena citra berawan
  // tidak berguna sekalipun baru.
  const dataEntry = isRadar
    ? {
      type: 'sentinel-1-grd',
      dataFilter: {
        timeRange: {
          from: isoDaysAgo(Math.min(days, 30)) + 'T00:00:00Z',
          to: new Date().toISOString().slice(0, 10) + 'T23:59:59Z'
        },
        acquisitionMode: 'IW',
        polarization: 'DV',
        mosaickingOrder: 'mostRecent'
      },
      processing: { orthorectify: true, backCoeff: 'GAMMA0_TERRAIN' }
    }
    : {
      type: 'sentinel-2-l2a',
      dataFilter: {
        timeRange: {
          from: isoDaysAgo(days) + 'T00:00:00Z',
          to: new Date().toISOString().slice(0, 10) + 'T23:59:59Z'
        },
        maxCloudCoverage: maxCloud,
        mosaickingOrder: 'leastCC'
      }
    };

  const payload = {
    input: {
      bounds: { bbox, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/3857' } },
      data: [dataEntry]
    },
    output: {
      width: TILE_PX,
      height: TILE_PX,
      responses: [{ identifier: 'default', format: { type: 'image/jpeg' } }]
    },
    evalscript: prod.script
  };

  const r = await fetchFn(PROCESS_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'image/jpeg'
    },
    body: JSON.stringify(payload)
  }, 30000);

  if (r.status === 401 || r.status === 403) {
    resetToken();
    throw new Error('cdse_auth_' + r.status);
  }
  // 404 berarti tidak ada adegan yang cocok — bukan kegagalan.
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('cdse_process_' + r.status);

  return Buffer.from(await r.arrayBuffer());
}

/* ---------------- metadata adegan ---------------- */

/**
 * Tanggal perekaman dan tutupan awan adegan terbaru pada satu titik.
 *
 * Inilah yang membuat lapisan ini jujur: pengguna dapat melihat citra
 * yang tampil berasal dari kapan, sehingga tidak menyangka sedang
 * menonton keadaan langsung.
 */
async function sceneInfo(fetchFn, { lat, lon, maxCloud = 30, days = LOOKBACK_DAYS }) {
  const token = await getToken(fetchFn);
  const d = 0.05; // ~5 km, cukup untuk mewakili satu gunung

  const r = await fetchFn(CATALOG_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      bbox: [lon - d, lat - d, lon + d, lat + d],
      datetime: isoDaysAgo(days) + 'T00:00:00Z/' + new Date().toISOString(),
      limit: 20,
      fields: { include: ['id', 'properties.datetime', 'properties.eo:cloud_cover'], exclude: [] }
    })
  }, 25000);

  if (r.status === 401 || r.status === 403) {
    resetToken();
    throw new Error('cdse_auth_' + r.status);
  }
  if (!r.ok) {
    // Isi balasan ikut dicatat: tanpa itu, salah jalur atau salah bentuk
    // permintaan hanya terlihat sebagai angka status tanpa petunjuk.
    let detail = '';
    try { detail = (await r.text()).slice(0, 200); } catch { /* abaikan */ }
    throw new Error('cdse_catalog_' + r.status + (detail ? ' ' + detail : ''));
  }

  const j = await r.json();
  const feats = Array.isArray(j.features) ? j.features : [];

  const scenes = feats.map(f => ({
    id: f.id,
    at: f.properties && f.properties.datetime,
    cloud: f.properties && f.properties['eo:cloud_cover'] != null
      ? Math.round(f.properties['eo:cloud_cover'])
      : null
  })).filter(s => s.at);

  scenes.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  // Yang benar-benar dipakai untuk menggambar adalah adegan paling cerah
  // (mosaickingOrder leastCC), bukan yang paling baru — jadi keduanya
  // dilaporkan supaya tidak menyesatkan.
  const usable = scenes.filter(s => s.cloud === null || s.cloud <= maxCloud);
  const clearest = usable.slice().sort((a, b) => (a.cloud ?? 100) - (b.cloud ?? 100))[0] || null;

  const ageH = (s) => s ? +((Date.now() - Date.parse(s.at)) / 3600000).toFixed(1) : null;

  return {
    latest: scenes[0] || null,
    displayed: clearest,
    displayedAgeHours: ageH(clearest),
    scenes: scenes.slice(0, 10),
    windowDays: days,
    maxCloud
  };
}

function productList() {
  const opt = Object.keys(PRODUCTS).map(k => ({
    id: k, kind: 'optik', satellite: 'Sentinel-2 L2A',
    label: PRODUCTS[k].label, desc: PRODUCTS[k].desc, bands: PRODUCTS[k].bands
  }));
  const rad = Object.keys(RADAR_PRODUCTS).map(k => ({
    id: k, kind: 'radar', satellite: 'Sentinel-1 GRD',
    label: RADAR_PRODUCTS[k].label, desc: RADAR_PRODUCTS[k].desc,
    bands: RADAR_PRODUCTS[k].bands
  }));
  return opt.concat(rad);
}

/** Apakah produk ini memakai radar (tidak terpengaruh awan). */
function isRadarProduct(id) {
  return !!RADAR_PRODUCTS[id];
}

module.exports = {
  PRODUCTS, RADAR_PRODUCTS, isRadarProduct, TILE_PX, LOOKBACK_DAYS,
  isConfigured, getToken, resetToken,
  fetchTile, sceneInfo, productList, tileBounds3857
};
