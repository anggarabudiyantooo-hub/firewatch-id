# SIAGA ID — Terminal Bencana

Pemantauan bencana Indonesia dari sumber resmi dan terbuka: letusan gunung api dan
sebaran abu, gempa dan tsunami, pengungsi, serta titik api dan asap karhutla.

**Produksi:** <https://firewatch-id.vercel.app>

> Aplikasi ini alat bantu publik dan edukasi, **bukan pengganti sumber resmi**.
> Untuk keputusan darurat, rujuk BMKG, BNPB/BPBD, PVMBG, dan KLHK.

---

## Daftar isi

| Dokumen | Isi |
|---|---|
| `README.md` (berkas ini) | Cara menjalankan, ringkasan fitur, variabel lingkungan |
| [`docs/PRD.md`](docs/PRD.md) | Product Requirements: masalah, pengguna, lingkup, kriteria keberhasilan |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arsitektur sistem, alur data, penjadwal, keputusan teknis |
| [`docs/ERD.md`](docs/ERD.md) | Model data, entitas, relasi, skema respons API |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Sistem desain: palet, tipografi, tata letak, komponen, aksesibilitas |
| [`docs/HARDCODED.md`](docs/HARDCODED.md) | **Audit nilai tetap:** apa yang dikeraskan di kode, mengapa, dan mana yang harus dipindah |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Peta jalan menuju siap rilis produksi |

---

## Jalankan lokal

```bash
npm install
npm start            # http://localhost:3000
npm run check        # pemeriksaan bundel sebelum commit
```

Tanpa satu pun variabel lingkungan, aplikasi tetap berjalan penuh: seluruh sumber
data yang dipakai bersifat terbuka dan tidak menuntut kunci API.

## Deploy ke Vercel

1. Buka <https://vercel.com/new>, impor repositori ini.
2. Framework Preset **Other**; Build dan Output Command dibiarkan kosong.
3. Deploy.

`vercel.json` mengarahkan seluruh permintaan ke `api/index.js`, yang memuat aplikasi
Express dari `server.js`.

### Penjadwal wajib

Vercel Hobby membatasi cron bawaan menjadi sekali sehari, sedangkan data
kebencanaan perlu disegarkan tiap beberapa menit. Karena itu penyegaran dijalankan
penjadwal luar (GitHub Actions) yang memanggil:

```
GET /api/cron
GET /api/cron?force=1        # abaikan interval, segarkan semua
```

Lindungi dengan `CRON_SECRET` bila endpoint ini dipublikasikan. Rinciannya di
`PANDUAN-DEPLOY-VERCEL.md`.

---

## Variabel lingkungan

Seluruhnya **opsional**.

| Variabel | Default | Fungsi |
|---|---|---|
| `PORT` | `3000` | Porta server lokal |
| `FIRMS_MAP_KEY` | *(kosong)* | Kunci NASA FIRMS. Bila ada, endpoint area dipakai lebih dulu; bila balasannya kosong, otomatis jatuh ke arsip terbuka |
| `FIRMS_SOURCE` | `VIIRS_SNPP_NRT` | Satelit untuk jalur MAP_KEY. Pilihan: `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `MODIS_NRT` |
| `FIRMS_DAYS` | `1` | Rentang hari jalur MAP_KEY (1–10). Hasilnya tetap disaring ke jendela 24 jam |
| `CDSE_CLIENT_ID` | *(kosong)* | Client ID OAuth Copernicus. Bila kosong, lapisan Sentinel-2 menampilkan keterangan "belum dikonfigurasi" dan seluruh fitur lain tetap berjalan |
| `CDSE_CLIENT_SECRET` | *(kosong)* | Client secret OAuth Copernicus |
| `CRON_SECRET` | *(kosong)* | Bila diisi, `/api/cron` menuntut `Authorization: Bearer <secret>` atau `?key=<secret>` |
| `DEBUG_KEY` | *(kosong)* | Membuka endpoint diagnostik |

Pendaftaran kunci FIRMS (gratis): <https://firms.modaps.eosdis.nasa.gov/api/map_key/>

### Mengaktifkan citra Sentinel-2

1. Daftar gratis di <https://dataspace.copernicus.eu/>.
2. Buka **Dashboard → User Settings → OAuth clients → Create**.
3. Salin **Client ID** dan **Client Secret** (secret hanya tampil sekali).
4. Pasang keduanya sebagai `CDSE_CLIENT_ID` dan `CDSE_CLIENT_SECRET` di
   **Vercel → Settings → Environment Variables**, lalu terapkan ulang.

Ada kuota bulanan pada akun gratis. Petak di-cache enam jam di server dan
hanya diminta mulai zoom 8, sehingga pemakaian kuota tetap rendah.

---

## Sumber data

| Sumber | Dipakai untuk | Kunci API |
|---|---|---|
| **PVMBG / MAGMA ESDM** | Status gunung api, laporan letusan pos pengamatan | tidak |
| **BMKG** | Gempa bumi, potensi tsunami | tidak |
| **BNPB GIS** | Titik pengungsian, jumlah jiwa | tidak |
| **NASA FIRMS** | Titik api VIIRS 3 satelit | opsional |
| **NOAA GFS** | Medan angin untuk model sebaran asap | tidak |
| **NOAA PTWC/NTWC** | Buletin tsunami kawasan | tidak |
| **Open-Meteo / CAMS** | Kualitas udara, SO₂ gunung api | tidak |
| **Global Forest Watch** | Batas konsesi sawit, HTI, tambang, RSPO | tidak |
| **GeoNames** | 226 permukiman ≥50.000 jiwa | tidak |
| **JMA Himawari** | Citra satelit (IR, warna alami, abu RGB, debu, uap air) | tidak |
| **Copernicus Sentinel-2 L2A** | Citra 10 m untuk memeriksa rupa gunung dari dekat | ya, gratis |
| **Google Berita RSS** | 13 topik berita, termasuk 5 edisi negara tetangga | tidak |
| **Smithsonian GVP** | Katalog dan ringkasan aktivitas gunung api | tidak |

---

## Fitur utama

**Peta interaktif** dengan sembilan lapisan: titik api, kualitas udara, aliran angin,
sebaran asap, wilayah terdampak, batas konsesi, abu vulkanik, gempa, dan pengungsi.
Tiga peta dasar, delapan produk citra satelit, dan linimasa prakiraan asap +6/+12/+18 jam.

**Dua sumber citra dengan sifat berbeda.** Himawari-9 menyegar tiap 10 menit pada
resolusi ~2 km — untuk mengikuti pergerakan awan dan abu. Sentinel-2 beresolusi 10 m
sehingga bekas aliran lava dan endapan abu di lereng terlihat, tetapi satelitnya hanya
melintas tiap 5 hari dan Indonesia sering tertutup awan. Sentinel-2 **bukan citra
langsung**, dan tanggal perekaman tiap petak selalu ditampilkan agar tidak
disalahartikan sebagai keadaan sekarang.

**Sepuluh panel analisis:** kejadian aktif lintas jenis bencana, analisis wilayah,
kueri data berbasis indeks lokal, berita penanganan, atribusi lahan, gempa dan
pengungsi, status pembaruan sumber, SO₂ gunung api, penjelasan data, dan daftar
sumber beserta batasannya.

### Prinsip yang dipegang

Perangkat keselamatan publik harus jujur tentang batas pengetahuannya sendiri:

- **Nol tidak sama dengan tidak tahu.** Bila sebuah sumber belum pernah berhasil
  dimuat, antarmuka menampilkan `—`, bukan `0`.
- **Status bukan kejadian.** Gunung berstatus Siaga tidak digambar berpluma abu;
  sebaran abu hanya muncul bila pos pengamatan melaporkan letusan dalam 24 jam.
- **Model bukan pengukuran.** Sebaran asap adalah model kerucut geometrik, bukan
  HYSPLIT. Indeks paparan bukan ISPU. Kerucut abu bukan advisory VAAC.
- **Sampel dinyatakan sebagai sampel.** Atribusi konsesi memeriksa 220 titik ber-FRP
  tertinggi; ukuran sampel, populasi, dan metode pengambilannya ditampilkan
  berdampingan karena memilih FRP tertinggi adalah bias sistematis.
- **Umur data ditampilkan.** Berkas NASA bernama `_24h` nyatanya memuat titik hingga
  50 jam, jadi penyaringan dilakukan sendiri dan umur titik tertua ditulis di layar.
- **Kegagalan harus terlihat.** Setiap permintaan berbatas waktu; permintaan yang
  menggantung memunculkan pesan dalam 12 detik, bukan kerangka kosong selamanya.

---

## Struktur proyek

```
server.js              aplikasi Express, seluruh endpoint, penjadwal
api/index.js           pembungkus serverless Vercel
lib/
  firms-open.js        arsip terbuka NASA FIRMS + penyaringan jendela 24 jam
  eruption.js          laporan letusan pos pengamatan MAGMA
  pvmbg.js             status resmi PVMBG + cadangan snapshot
  pvmbg-snapshot.js    salinan status 69 gunung (cadangan statis)
  volcano.js           model sebaran abu vulkanik per lapisan ketinggian
  hazard.js            gempa BMKG, tsunami NOAA, pengungsi BNPB
  concession.js        titik-dalam-poligon terhadap konsesi GFW
  wind-gfs.js          medan angin NOAA GFS
  grib2.js             pembacaan berkas GRIB2
  relevance.js         gerbang relevansi + skor + kategori berita
  casualty.js          ekstraksi angka korban dari judul berita
  rag.js               indeks pencarian lokal untuk /api/ask
  scheduler.js         penjadwal terpusat dengan anggaran waktu
data/regions.json      226 permukiman GeoNames
public/
  index.html           satu halaman
  app.js               seluruh logika antarmuka
  app.css              sistem desain
  wind-particles.js    animasi partikel angin di kanvas
docs/                  PRD, arsitektur, ERD, desain, audit nilai tetap, peta jalan
```

---

## Status kesiapan

Tiga putaran audit black-box menyeluruh telah dilakukan: **59 → 78 → 89/100**.
Putaran-3 menyatakan aplikasi **layak rilis** — tidak ada temuan Critical maupun
High yang tersisa. Sisa temuan Low pada putaran itu juga sudah ditangani.

Payload `/api/overview` turun dari 3,64 MB menjadi **328 KB** (52,7 KB
over-the-wire dengan Brotli), dan TTFB dari 3,05 detik menjadi 67 ms.

Rincian lengkap beserta urutan pengerjaan ada di [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Lisensi dan atribusi

Data milik penerbitnya masing-masing dan tunduk pada ketentuan mereka. GeoNames
berlisensi CC BY 4.0. Peta dasar © Esri, Maxar, Earthstar Geographics, HERE, Garmin,
dan kontributor OpenStreetMap.
