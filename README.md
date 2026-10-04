# SIAGA ID — Pemantauan Bencana Real-Time + Operations Center

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
| **Copernicus Sentinel-2 L2A** | Citra 10 m: rupa gunung, kelembapan tanaman, genangan air | ya, gratis |
| **Copernicus Sentinel-1 GRD** | Radar menembus awan untuk memetakan genangan banjir | ya, gratis |
| **Google Berita RSS** | 13 topik berita, termasuk 5 edisi negara tetangga | tidak |
| **Smithsonian GVP** | Katalog dan ringkasan aktivitas gunung api | tidak |
| **NOAA CPC** | Indeks ONI — status El Niño / La Niña | tidak |
| **Open-Meteo Archive** | Curah hujan harian per provinsi (ERA5) | tidak |

---

## Fitur utama

**Peta interaktif** dengan sembilan lapisan: titik api, kualitas udara, aliran angin,
sebaran asap, wilayah terdampak, batas konsesi, abu vulkanik, gempa, dan pengungsi.
Tiga peta dasar, delapan produk citra satelit, dan linimasa prakiraan asap +6/+12/+18 jam.

**Enam produk citra untuk keperluan berbeda.** Selain warna alami dan
inframerah, tersedia kelembapan tanaman (NDMI) untuk melihat tekanan
kekeringan sebelum daun menguning, genangan air (MNDWI) yang tidak salah
menandai atap logam sebagai air, dan **radar Sentinel-1** yang menembus awan
— satu-satunya cara memotret banjir saat kejadian, karena banjir justru
terjadi ketika langit tertutup mendung.

Tab **Kekeringan** pada panel Analisis Wilayah memberi jalan pintas: klik
sebuah provinsi, peta langsung berpindah ke sana dengan lapisan citra yang
sesuai sudah menyala.

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

- **Korelasi bukan sebab.** El Niño meningkatkan peluang kemarau panjang,
  tetapi status kekeringan tiap provinsi dihitung dari curah hujan yang
  benar-benar terukur — bukan diturunkan dari indeks ONI.
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

## Operations Center (`/operations`)

Sejak 4 Okt 2026 aplikasi ini juga punya papan operasi. Bukan papan terpisah
dengan angka contoh: **semuanya membaca keadaan yang sudah diukur penjadwal**
yang sama dengan yang menyuplai dashboard.

| Bagian | Isi | Sumber angka |
|---|---|---|
| System Health | jumlah layanan dipantau / sehat / peringatan / tidak tersedia / belum diketahui, plus status aplikasi (uptime, Node, mode penjadwal, mode penyimpanan) | `Scheduler.status()` yang sama dengan `/api/status` |
| Data Sources | per sumber: status, kesegaran (FRESH/STALE/CRITICAL/UNKNOWN), waktu respons terakhir, waktu sukses terakhir, jumlah galat, penjeda backoff, endpoint hulu | diukur saat pengambilan; yang belum terukur ditulis **"belum terukur"** |
| Alerts | aturan `source_down`, `data_critical`, `api_slow`, `hotspot_cluster` + tombol membuat insiden | evaluasi dijalankan pada `/api/cron` (tiap 10 menit) dan bisa dipicu manual |
| Incidents | siklus OPEN → INVESTIGATING → PENDING → RESOLVED → CLOSED, penugasan, eskalasi, catatan investigasi, timeline, metrik MTTR/SLA dari data nyata | disimpan oleh adaptor penyimpanan (lihat di bawah) |
| Runbooks | 4 SOP yang langkahnya menunjuk berkas/endpoint nyata di repo ini | `lib/runbooks.js`, ditautkan ke kategori insiden |
| Audit Log | 200 tindakan terakhir: siapa mengubah apa, kapan — termasuk evaluasi alert otomatis | satu dokumen simpanan yang sama dengan insiden (tidak ada log kedua yang bisa berbeda) |
| Tautan dalam | `?insiden=INC-…` membuka detail insiden; tombol "Salin tautan" di detail | rute baca yang sama |

### Cara masuk

Dari dashboard: panel **Sumber** (chip status di topbar, atau kunci F6) memuat
tautan **Buka Operations Center**. Halaman ops juga bisa dibuka langsung di
`/operations`, dan tiap insiden punya tautan sendiri:
`/operations?insiden=INC-2026-00001` membuka detail insiden itu.

### Penyimpanan operasional — apa adanya

Proyek ini **tidak punya basis data** (lihat `docs/ERD.md`). Di Vercel setiap
instance punya memori sendiri, jadi insiden butuh penyimpanan bersama. Adaptor
`lib/ops-store.js` memilih otomatis dan **menyatakan modenya di halaman**:

| Mode | Syarat | Sifat |
|---|---|---|
| `upstash` | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | penyimpanan bersama, tahan daur ulang instance |
| `github` | `OPS_GITHUB_TOKEN` + `OPS_GITHUB_REPO` | keadaan disimpan pada satu issue berlabel `ops-state`; riwayat terlihat manusia |
| `file` | tanpa Vercel (pengembangan lokal) | berkas `.data/ops.json` |
| `ephemeral` | tidak ada yang dikonfigurasi di Vercel | memori instance; halaman memasang spanduk **PERHATIAN — penyimpanan SEMENTARA** |

Tanpa salah satu dari dua mode pertama, insiden akan hilang saat instance
didaur ulang — dan itu tertulis di halaman, bukan disembunyikan.

Hal serupa berlaku untuk **pengukuran**: di Vercel setiap instance punya memori
sendiri dan tugas penjadwal hanya berjalan saat `/api/cron` memanggilnya (tiap
10 menit, dari GitHub Actions). Instance yang baru hidup karena itu belum
mengukur apa pun — halaman akan menulis "belum diketahui" beserta sebabnya.
Supaya tidak berhenti di situ, rute ops menjalankan **satu kali pengukuran
beranggaran terbatas** (`OPS_WARMUP_MS`, bawaan 8 detik) pada permintaan
pertama, lalu melaporkan hasil pengukuran yang sungguhan. Setelah instance itu
punya hasil, pengukuran tidak diulang; bila percobaan gagal, diulang paling
cepat 60 detik sekali agar sumber hulu tidak dihujani permintaan.

### Ambang yang dapat diatur

| Variabel | Default | Arti |
|---|---|---|
| `OPS_FRESH_STALE_MULT` | `1.5` | umur data > 1,5× interval jadwal → STALE |
| `OPS_FRESH_CRIT_MULT` | `6` | umur data > 6× interval jadwal → CRITICAL |
| `OPS_SLOW_MS` | `4000` | lama panggilan terakhir di atas ini → alert `api_slow` |
| `OPS_HOTSPOT_CLUSTER` | `50` | jumlah titik dalam satu sel 0,5° agar dianggap klaster |
| `OPS_HOTSPOT_MAX` | `5` | maksimal klaster terbesar yang diberi alert per evaluasi |
| `OPS_ALERT_DEDUP_MS` | `1800000` | jendela anti-duplikasi per (aturan, subjek) |
| `OPS_SLA_CRITICAL_MIN` / `…_HIGH_MIN` / `…_MEDIUM_MIN` / `…_LOW_MIN` | `60` / `240` / `1440` / `4320` | target penyelesaian per severity (menit) |
| `OPS_WARMUP_MS` | `8000` | di Vercel, instance yang belum pernah mengukur apa pun menjalankan satu kali pengukuran beranggaran ini detik saat rute ops dibuka; `0` mematikannya |
| `OPS_WRITE_TOKEN` | *(kosong)* | bila diisi, perubahan data ops menuntut header `x-ops-token` |
| `OPS_GITHUB_TOKEN` / `OPS_GITHUB_REPO` | *(kosong)* | mengaktifkan mode penyimpanan `github` |

### API operasional

`GET /api/operations/health` · `GET /api/data-sources` · `GET /api/alerts` ·
`POST /api/operations/evaluate` · `POST /api/alerts/:id/incident` ·
`GET|POST /api/incidents` · `GET|PATCH /api/incidents/:id` ·
`POST /api/incidents/:id/{assign,notes,escalate,resolve,close}` ·
`GET /api/runbooks` · `GET /api/runbooks/:id` ·
`GET /api/operations/metrics` · `GET /api/operations/store` ·
`GET /api/operations/audit`

Transisi status yang tidak sah ditolak `409`; severity/kategori tak dikenal dan
judul kosong ditolak `400`. Semua perubahan mencatat nama pelaku bila header
`x-ops-actor` dikirim.

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
  scheduler-instance.js satu instance penjadwal untuk seluruh proses
  service-health.js    model kesehatan layanan (dipakai /operations)
  freshness.js         ambang FRESH/STALE/CRITICAL yang terdokumentasi
  alert-engine.js      aturan alert + deduplikasi
  incidents.js         siklus hidup insiden, timeline, metrik SLA/MTTR
  runbooks.js          SOP operasional yang menunjuk berkas nyata di repo
  ops-store.js         adaptor penyimpanan operasional (upstash/github/file/ephemeral)
  ops-github.js        penyimpanan lewat GitHub Issues (mode github)
  ops-routes.js        seluruh rute /api/operations, /api/incidents, /api/runbooks
data/regions.json      226 permukiman GeoNames
public/
  index.html           satu halaman
  app.js               seluruh logika antarmuka
  app.css              sistem desain
  wind-particles.js    animasi partikel angin di kanvas
  operations.html      halaman Operations Center
  ops.js / ops.css     perilaku & gaya papan operasi
docs/                  PRD, arsitektur, ERD, desain, audit nilai tetap, peta jalan
docs/OPS-AUDIT.md      audit teknis + rencana upgrade Operations Center
scripts/test-ops.js    uji modul ops (ikut `npm run check`)
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
