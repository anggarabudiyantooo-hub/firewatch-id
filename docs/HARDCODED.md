# Audit Nilai Tetap — SIAGA ID

Versi 2.0 · 8 September 2026

Dokumen ini mendaftar seluruh nilai yang dikeraskan di dalam kode: apa nilainya,
mengapa dikeraskan, dan apakah seharusnya dipindah ke konfigurasi. Tujuannya agar
tidak ada asumsi tersembunyi yang baru ketahuan saat sesuatu berubah di hulu.

**Klasifikasi**

| Tanda | Arti |
|:---:|---|
| ✅ | Wajar dikeraskan — konstanta domain atau geografis yang memang tidak berubah |
| ⚠️ | Dikeraskan tetapi **rapuh** — akan diam-diam salah bila hulu berubah |
| ❌ | Seharusnya dikonfigurasi — perlu dipindah ke variabel lingkungan atau berkas |
| 🔄 | Data statis yang perlu penyegaran berkala |

---

## 1. Sudah dapat dikonfigurasi

Enam variabel lingkungan, seluruhnya opsional. Aplikasi berjalan penuh tanpa satu pun
di antaranya.

| Variabel | Default | Berkas |
|---|---|---|
| `PORT` | `3000` | `server.js:24` |
| `FIRMS_MAP_KEY` | *(kosong)* | `server.js:25` |
| `FIRMS_SOURCE` | `VIIRS_SNPP_NRT` | `server.js:27` |
| `FIRMS_DAYS` | `1` | `server.js:28` |
| `CRON_SECRET` | *(kosong)* | `server.js` (`/api/cron`) |
| `CDSE_CLIENT_ID` | *(kosong)* | `lib/sentinel.js` |
| `CDSE_CLIENT_SECRET` | *(kosong)* | `lib/sentinel.js` |
| `DEBUG_KEY` | *(kosong)* | `server.js` |

---

## 2. Konstanta geografis dan domain — ✅ wajar

| Nilai | Lokasi | Keterangan |
|---|---|---|
| `BBOX = {94.5, -11.5, 141.5, 6.5}` | `server.js:29` | Kotak batas Indonesia. Bila cakupan diperluas ke ASEAN, ini harus jadi konfigurasi |
| `R = 6371` | `server.js:121` | Jari-jari bumi, km |
| `PLUME_STEPS = [0, 6, 12, 18]` | `server.js:338` | Jam prakiraan asap |
| `AQI_BANDS` | `server.js:1052` | Ambang US AQI resmi EPA |
| `ALLOWED_SOURCES` | `server.js:26` | Empat produk FIRMS yang didukung |
| `HIMAWARI_PRODUCTS` | `server.js:1549` | Allowlist produk citra — sekaligus pertahanan SSRF |
| `ASSET_FILES` | `server.js:1616` | Tiga berkas yang di-hash untuk cache busting |

## 3. Ambang keputusan — ⚠️ rapuh, perlu diawasi

Nilai berikut menentukan **apa yang ditampilkan sebagai fakta**. Mengubahnya mengubah
kesimpulan yang dibaca pengguna, jadi tiap perubahan perlu pertimbangan sadar.

| Nilai | Lokasi | Alasan dipilih | Risiko |
|---|---|---|---|
| `WINDOW_HOURS = 24` | `lib/firms-open.js:103` | Seluruh antarmuka menjanjikan "24 jam" | Berkas NASA bernama `_24h` nyatanya memuat hingga 50 jam. Penyaringan **wajib** dilakukan sendiri; jangan pernah memercayai nama berkas |
| `WINDOW_HOURS = 24` | `lib/eruption.js:28` | Jendela laporan letusan | Bila MAGMA mengubah tata letak halaman, parser diam-diam kosong |
| `SHELTER_MAX_AGE_DAYS = 10` | `lib/hazard.js:198` | BNPB tidak menghapus layanan saat warga pulang | Angka lawas akan menempel selamanya tanpa ambang ini. Nilai 10 hari adalah perkiraan, belum divalidasi dengan BNPB |
| `limit = 220` | `lib/concession.js:120` | Batas waktu fungsi 60 detik | Sampel ber-FRP tertinggi adalah **bias sistematis** — wajib dinyatakan di antarmuka |
| `clusters.slice(0, 40)` | `server.js` | Ukuran payload | Dilaporkan lewat `clustersMeta` |
| `HTH_BANDS` (11/21/31/61 hari) | `lib/drought.js` | Ambang hari tanpa hujan mengikuti istilah buletin kekeringan BMKG | Angka ambangnya perkiraan yang diselaraskan dengan istilah BMKG, belum divalidasi bersama BMKG |
| Ambang hujan < 1 mm | `lib/drought.js` | Hujan di bawah itu menguap sebelum meresap | Batas lazim, tetapi tetap sebuah pilihan |
| Satu titik per provinsi | `server.js` `PROVINCE_SITES` | Menjaga arsip curah hujan cukup satu permintaan | Provinsi luas beriklim beragam hanya terwakili satu titik |
| `LOOKBACK_DAYS = 60` | `lib/sentinel.js` | Jendela pencarian citra Sentinel-2. Terlalu pendek membuat sebagian besar wilayah kosong karena awan; terlalu panjang menyajikan citra usang | Iklim tropis membuat citra bebas awan jarang; nilai ini kompromi yang belum divalidasi lintas musim |
| `zoom 8–16` Sentinel | `server.js` | Di bawah 8 satu petak mencakup ribuan km dan memboroskan kuota tanpa menambah informasi; di atas 16 hanya memperbesar piksel karena resolusi asli 10 m | |
| `HOTSPOT_CAP = 2000` | `server.js` | Diukur pada beban puncak 7.172 titik: memotong di FRP 5,8 MW sementara filter terendah antarmuka 5 MW | Menaikkan filter minimum di antarmuka ke bawah 5 MW akan membuat sebagian pilihan tidak terlayani penuh; `hotspotsMeta.minFrpIncluded` memberi tahu antarmuka kapan hal itu terjadi |
| `points.slice(0, 500)` | `lib/hazard.js` | Ukuran payload | Belum ada metadata pemotongan — **celah kecil** |
| Jaccard `0.80` | `server.js` (dedup berita) | Menangkap kawat AP yang diterbitkan ulang | Terlalu rendah menggabungkan peristiwa berbeda; terlalu tinggi meloloskan duplikat |
| `QUOTA = 12`, `LIMIT = 200` | `server.js` | Jatah artikel per topik | |
| Ambang keparahan gempa | `lib/hazard.js` | Mengikuti kaidah umum BMKG | Bukan rumus resmi BMKG |
| Ambang paparan 66 / 33 | `server.js` | Berat / Sedang / Ringan | **Bukan ISPU** — sudah dinyatakan di antarmuka |
| `budgetMs: 45000` | `server.js` (`/api/cron`) | Batas Vercel 60 detik dikurangi margin | Terikat platform; harus diubah bila pindah |
| `RL_NORMAL = 240`, `RL_EXPENSIVE = 90` | `server.js` | Diukur: satu sesi aktif hanya 4 permintaan kelas mahal per menit | Terlalu ketat memblokir pengguna sah di balik CGNAT; terlalu longgar membiarkan kuota hulu terkuras |
| `WIND_STEPS`, `AQ_STEPS` | `server.js` | Menutup amplifikasi kunci cache | **Wajib cocok** dengan `windStepFor()` dan `airStepFor()` di `public/app.js`; menambah tingkat zoom di klien tanpa memperbarui daftar ini membuat lapisan gagal 400 |
| bbox default wind-field `84,5–151,5 / −21,5–16,5` | `server.js` | Indonesia + margin 10° | Margin terlalu kecil memotong partikel di tepi saat pengguna menggeser keluar |

## 4. Daftar dan kosakata — ⚠️ perlu pemeliharaan

| Nilai | Lokasi | Keterangan |
|---|---|---|
| `PROVINCE_BOXES` (38 provinsi) | `server.js:47` | Kotak batas persegi, **bukan poligon sebenarnya**. Titik di perbatasan bisa salah provinsi |
| `NEWS_TOPICS` (13 topik) | `server.js:603` | Delapan dalam negeri, lima negara tetangga |
| `NEIGHBOUR_EDITIONS` | `server.js:581` | Edisi Google Berita per negara |
| `NEIGHBOUR_QUERY` | `server.js:593` | Kueri bahasa Inggris |
| `NEIGHBOUR_QUERY_JA` | `server.js:600` | Kueri bahasa Jepang — edisi `JP:en` mengembalikan media Amerika, jadi wajib `hl=ja&gl=JP&ceid=JP:ja` |
| `GATE`, `GATE_CJK`, `HIGH`, `MED`, `STALE` | `lib/relevance.js` | Kosakata relevansi bencana. Menambah istilah baru menambah cakupan; menghapus istilah membuang berita relevan |
| `SHELTER_KNOWN` | `lib/hazard.js:205` | Pemetaan nama folder BNPB ke label enak dibaca. Kejadian di luar daftar tetap ditemukan otomatis, hanya namanya diturunkan dari nama folder |

**Catatan `PROVINCE_BOXES`.** Kotak persegi dipilih karena poligon batas administratif
resmi berukuran puluhan megabita dan tidak muat dalam fungsi serverless. Konsekuensinya
titik dekat perbatasan bisa salah atribusi provinsi. Ini pertukaran sadar, bukan
kelalaian.

## 5. Data statis — 🔄 perlu penyegaran berkala

| Berkas | Isi | Kapan perlu disegarkan |
|---|---|---|
| `data/regions.json` | 226 permukiman ≥50.000 jiwa dari GeoNames | Saat data sensus GeoNames diperbarui, ~tahunan |
| `lib/pvmbg-snapshot.js` | Status 69 gunung, dibuat 2026-09-07 | **Hanya cadangan** saat MAGMA tidak dapat dihubungi. Perlu diperbarui berkala agar tidak menyesatkan saat dipakai |

Snapshot PVMBG disimpan sebagai `.js` alih-alih `.json` karena berkas data biasa dapat
tertinggal saat penerapan Vercel.

## 6. Yang seharusnya dikonfigurasi — ❌

| Nilai | Lokasi | Mengapa perlu dipindah |
|---|---|---|
| Interval penjadwal (8 tugas) | `server.js:1295–1343` | Operator mungkin ingin menaikkan frekuensi saat keadaan darurat, atau menurunkannya saat kuota menipis. Kini menuntut penerapan ulang |
| URL dasar sumber hulu | tersebar di `lib/*.js` | `BNPB`, `BMKG`, endpoint MAGMA, pola URL FIRMS. Bila salah satu berpindah domain, perlu ubah kode |
| TTL `Cache-Control` | tersebar di `server.js` | Bervariasi 60–1800 detik tanpa satu tempat pengaturan; menyebabkan endpoint sekerabat sempat tidak sinkron |
| `SHELTER_MAX_AGE_DAYS` | `lib/hazard.js:198` | Ambang kebijakan, bukan konstanta teknis. Layak dikonfigurasi |
| `limit = 220` atribusi | `lib/concession.js:120` | Terikat batas waktu platform; harus naik bila pindah ke platform berbasis proses |
| Timeout `fetchT` (12 dtk) | `public/app.js` | Nilai tetap di klien; tidak dapat disetel per lingkungan |

## 7. Nilai tetap di frontend

| Nilai | Lokasi | Keterangan |
|---|---|---|
| Timeout 12 detik | `public/app.js` `fetchT()` | Dipilih agar pesan gagal muncul di bawah ambang 15 detik |
| Pelepasan tombol 12 detik | `public/app.js` `loadOverview()` | Pengaman independen dari rantai promise |
| `max-height: 340px` | `public/app.css` `.pscroll` | Tinggi wadah panel bergulir |
| Interval muat ulang klien | `public/app.js` | Berita 3 menit, gempa 2 menit, Himawari 1 menit |
| Ambang zoom konsesi | `public/app.js` | GFW vector tile maksimum z=9 |
| Label sudut peta | `public/index.html` | `5.5°N 95°E` dan seterusnya — mengikuti `BBOX` tetapi ditulis manual; **akan tidak sinkron bila BBOX berubah** |

## 8. Yang **tidak** dikeraskan — dan itu disengaja

Bagian ini sama pentingnya: hal-hal berikut sempat dikeraskan dan sudah dipindah
menjadi penemuan otomatis.

| Dulu | Sekarang |
|---|---|
| Daftar layanan pengungsian BNPB ditulis tangan | Seluruh katalog ArcGIS BNPB dipindai otomatis tiap siklus; kejadian baru muncul tanpa ubah kode |
| Nomor lapisan BNPB diasumsikan `0` | Dideteksi dari skema layanan — NTT memakai `39` |
| Kolom jumlah dan tanggal diasumsikan `jumlah` dan `sumber_tgl` | Dideteksi dari daftar medan; tiap layanan berbeda |
| Klaim "24 jam" ditulis tetap di antarmuka | Dibaca dari `meta.windowHours` |
| Pluma abu digerbangi `official.level >= 3` | Digerbangi laporan letusan nyata ≤24 jam |

## 9. Prioritas pemindahan

| Prioritas | Butir | Alasan |
|---|---|---|
| **Tinggi** | URL dasar sumber hulu | Satu perubahan domain melumpuhkan satu sumber tanpa peringatan |
| **Tinggi** | Interval penjadwal | Perlu dapat disetel saat darurat atau saat kuota menipis |
| **Sedang** | TTL cache terpusat | Mencegah endpoint sekerabat tidak sinkron |
| **Sedang** | `SHELTER_MAX_AGE_DAYS` | Ambang kebijakan yang layak ditinjau bersama BNPB |
| **Sedang** | Label sudut peta dari `BBOX` | Menghapus kemungkinan tidak sinkron |
| **Rendah** | `limit` atribusi | Baru relevan bila pindah platform |
| **Rendah** | Timeout klien | Nilai sekarang sudah memadai |
