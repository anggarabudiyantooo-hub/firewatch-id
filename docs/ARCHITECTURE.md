# Arsitektur — SIAGA ID

Versi 2.0 · 8 September 2026

---

## 1. Gambaran umum

Aplikasi satu halaman tanpa kerangka kerja frontend, dilayani Express, dijalankan
sebagai satu fungsi serverless di Vercel. Tidak ada basis data. Seluruh keadaan
tersimpan di memori proses dan hilang saat instance didaur ulang.

```
                    ┌─────────────────────────────────────────┐
                    │            SUMBER HULU (12)             │
                    │  PVMBG/MAGMA · BMKG · BNPB GIS · NASA    │
                    │  FIRMS · NOAA GFS · NOAA PTWC · CAMS ·   │
                    │  GFW · GeoNames · Himawari · Google      │
                    │  Berita · Smithsonian GVP                │
                    └────────────────┬────────────────────────┘
                                     │ HTTP, semua terbuka
                                     ▼
        ┌────────────────────────────────────────────────────────┐
        │                  server.js (Express)                   │
        │                                                        │
        │  ┌──────────────┐   membaca    ┌────────────────────┐  │
        │  │  Scheduler   │─────────────▶│  Cache memori      │  │
        │  │  8 tugas     │   menulis    │  per tugas         │  │
        │  └──────▲───────┘              └─────────┬──────────┘  │
        │         │ tick()                         │ peek()      │
        │    /api/cron                             ▼             │
        │  (GitHub Actions)              ┌────────────────────┐  │
        │                                │  21 endpoint API   │  │
        │                                └─────────┬──────────┘  │
        └──────────────────────────────────────────┼─────────────┘
                                                   │ JSON
                                                   ▼
                    ┌──────────────────────────────────────────┐
                    │      public/ — satu halaman, ES5         │
                    │  app.js · app.css · wind-particles.js    │
                    │  Leaflet 1.9.4 (vendored)                │
                    └──────────────────────────────────────────┘
```

## 2. Lapisan

### 2.1 Pengambilan data (`lib/`)

Tiap modul bertanggung jawab atas satu sumber dan mengembalikan bentuk yang sudah
dinormalkan. Tidak ada modul yang menyentuh Express.

| Modul | Sumber | Catatan penting |
|---|---|---|
| `firms-open.js` | NASA FIRMS arsip terbuka | Menggabung 3 satelit × 2 wilayah, **menyaring sendiri ke 24 jam** |
| `eruption.js` | MAGMA "Informasi Letusan" | Menuntut header peramban lengkap; ambil berurutan, bukan paralel |
| `pvmbg.js` | MAGMA tingkat aktivitas | Coba ulang + cadangan `lastGood` + snapshot statis |
| `volcano.js` | turunan | Pluma abu **hanya** bila ada laporan letusan ≤24 jam |
| `hazard.js` | BMKG, NOAA PTWC, BNPB GIS | Katalog BNPB dipindai otomatis; ambang kesegaran 10 hari |
| `concession.js` | GFW vector tiles | Titik-dalam-poligon, sampel 220 titik ber-FRP tertinggi |
| `wind-gfs.js` + `grib2.js` | NOAA GFS | Pembacaan GRIB2 sendiri |
| `relevance.js` | turunan | Gerbang relevansi, skor 0–10, kategori berita |
| `sentinel.js` | Copernicus CDSE | OAuth2 client_credentials; evalscript disimpan di server sebagai allowlist |
| `casualty.js` | turunan | Ekstraksi angka korban dari judul; ditandai tidak resmi |
| `rag.js` | turunan | Indeks pencarian lokal untuk `/api/ask` |

### 2.2 Penjadwal (`lib/scheduler.js`)

Satu penjadwal terpusat memegang delapan tugas. Alasannya: tanpa ini, tiap permintaan
pengguna akan memicu pengambilan hulu sendiri-sendiri dan kuota habis dalam hitungan
menit.

| Tugas | Interval | Kritis | Sumber |
|---|---|:---:|---|
| `quake` | 2 menit | ✓ | BMKG |
| `tsunami` | 10 menit | ✓ | NOAA PTWC |
| `news` | 10 menit | | Google Berita → cadangan GDELT |
| `hotspots` | 10 menit | ✓ | NASA FIRMS |
| `eruption` | 10 menit | ✓ | MAGMA pos pengamatan |
| `shelter` | 30 menit | | BNPB GIS |
| `volcano` | 30 menit | ✓ | turunan PVMBG + letusan |
| `pvmbg` | 3 jam | | MAGMA tingkat aktivitas |

Interval mengikuti irama penerbitan sumbernya: menarik GFS tiap menit sia-sia karena
NOAA hanya menerbitkannya enam jam sekali.

**Anggaran waktu.** `tick({ budgetMs: 45000 })` — batas fungsi Vercel 60 detik, dan
menyisakan 15 detik mencegah cron terbunuh di tengah jalan lalu terbaca "gagal".

**`peek()` bukan `get()`.** Endpoint pembaca memakai `peek()` yang mengembalikan
salinan terakhir tanpa memicu pengambilan. Memakai `get()` di dalam `buildOverview()`
pernah menyebabkan 504 karena satu permintaan pengguna menunggu seluruh rantai hulu.

**`null` bukan `0`.** `peek()` mengembalikan `null` bila tugas belum pernah berhasil.
Perbedaan ini dijaga sampai ke antarmuka: `null` ditampilkan `—`, dan balasannya
memakai `no-store` agar keadaan "belum tahu" tidak ikut ter-cache.

### 2.3 Endpoint (21)

| Endpoint | Cache | Keterangan |
|---|---|---|
| `/api/health` | — | Uji hidup |
| `/api/overview` | 120 dtk | Payload terbesar (~1,5 MB) |
| `/api/attribution` | — | Atribusi konsesi |
| `/api/hazard` | 60 dtk | Gempa, tsunami, pengungsi |
| `/api/eruptions` | 300 dtk | Laporan letusan |
| `/api/volcano-ash` | 900 dtk | Model sebaran abu |
| `/api/volcano-so2` | — | SO₂ dari CAMS |
| `/api/news` | 60 dtk | 13 topik |
| `/api/casualties` | — | Angka korban dari berita |
| `/api/status` | no-store | Umur tiap sumber |
| `/api/wind-field` | 1800 dtk | Medan angin |
| `/api/air-quality` | — | Grid AQI |
| `/api/air-point` | — | AQI satu titik |
| `/api/place` | — | Wilayah administratif |
| `/api/whose-land` | — | Status lahan satu titik |
| `/api/concessions` | — | Poligon konsesi per bbox |
| `/api/ask` | — | Kueri indeks lokal (**GET**) |
| `/api/cron` | no-store | Pemicu penyegaran |
| `/api/himawari/meta` | — | Metadata citra |
| `/api/himawari/:p/:z/:x/:y.jpg` | — | Proksi ubin, dengan allowlist |
| `/api/sentinel/meta` | 1800 dtk | Tanggal perekaman & tutupan awan |
| `/api/sentinel/:p/:z/:x/:y.jpg` | 21600 dtk | Proksi ubin Sentinel-2, allowlist produk, zoom 8–16 |
| `/` | no-store | Halaman, menyuntik hash aset |

### 2.4 Frontend

Satu berkas `app.js` bergaya ES5 (`var`, ekspresi fungsi), tanpa langkah build.
Alasannya: berkas dilayani apa adanya dan harus jalan di peramban lama yang lazim
pada perangkat murah — justru perangkat yang dipakai di daerah terdampak.

**Kebijakan nol `innerHTML`.** Seluruh data eksternal dirender lewat `textContent`
dan `createElement`. Ini yang membuat percobaan XSS pada audit gagal total, dan
membuat CVE Leaflet `bindPopup` tidak dapat dieksploitasi karena yang dioper selalu
simpul DOM, bukan string.

**Semua `fetch` berbatas waktu.** Pembungkus `fetchT()` memakai `AbortController`.
Tanpa itu, permintaan menggantung membuat kartu kosong selamanya tanpa pesan apa pun.

## 3. Alur data — contoh titik api

```
GitHub Actions ──GET /api/cron──▶ scheduler.tick()
                                        │
                                        ▼
                          getHotspotsRaw()
                                        │
                   ┌────────────────────┴────────────────────┐
                   │ FIRMS_MAP_KEY ada?                      │
                   ▼                                         ▼
        endpoint area (1 satelit)                  arsip terbuka (3 satelit)
                   │                                         │
         balasan kosong? ──ya──────────────────────────────▶ │
                   │ tidak                                   │
                   ▼                                         ▼
              normalisasi acq → ISO 8601 UTC ◀───────────────┘
                   │
                   ▼
              SARING ke jendela 24 jam
              (berkas NASA "_24h" nyatanya memuat hingga 50 jam)
                   │
                   ▼
              simpan ke cache + meta:
              windowHours, oldestAcq, dataAgeHours, filteredOut
                   │
       ┌───────────┴───────────┬──────────────────┐
       ▼                       ▼                  ▼
  clusterHotspots()      attributeHotspots()   provinceRanking
       │                  (sampel 220)
       ▼
  buildPlumes() ──▶ impactedRegions() ──▶ peopleExposed
```

## 4. Keputusan teknis dan alasannya

| Keputusan | Alasan |
|---|---|
| Tanpa kerangka frontend | Halaman tunggal; kerangka hanya menambah payload di jaringan yang justru sedang buruk saat bencana |
| Tanpa basis data | Seluruh data berumur pendek dan berasal dari hulu; menyimpannya hanya menambah sumber kebenaran kedua |
| Cache di memori | Cukup untuk data ber-TTL menit; konsekuensinya cold start lebih lambat |
| Penjadwal luar, bukan cron Vercel | Vercel Hobby membatasi cron sekali sehari |
| Leaflet di-vendor | `connect-src 'self'` melarang CDN; sekaligus menghapus ketergantungan jaringan pihak ketiga |
| Snapshot PVMBG sebagai `.js` | Berkas `.json` biasa bisa tertinggal saat penerapan Vercel |
| GRIB2 dibaca sendiri | Pustaka yang ada terlalu berat untuk fungsi serverless |
| Pluma abu digerbangi laporan letusan | Status Siaga bukan kejadian; menggambar pluma untuk gunung yang tidak meletus adalah misinformasi |

## 5. Keamanan

```
Content-Security-Policy:
  default-src 'none'; base-uri 'self'; frame-ancestors 'self';
  form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://server.arcgisonline.com
          https://*.tile.openstreetmap.org;
  connect-src 'self'; font-src 'self' data:; object-src 'none'
```

Ditambah `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Cross-Origin-Opener-Policy: same-origin`,
`Referrer-Policy: no-referrer`.

Seluruh API hanya-baca dan hanya menerima GET. Tidak ada autentikasi karena tidak ada
data per-pengguna. Endpoint berkoordinat memvalidasi rentang dan membalas 400.
Proksi Himawari memakai allowlist produk serta validasi zoom dan ubin.

**Belum ada:** rate limiting per-IP. Ini risiko penghabisan kuota hulu yang nyata —
lihat peta jalan.

## 6. Batasan yang diketahui

- **Cache tidak persisten.** Instance dingin menyajikan data belum lengkap sampai
  `/api/cron` berjalan.
- **Payload awal ~1,5 MB.** Turun dari 3,64 MB setelah penyaringan jendela, tetapi
  masih jauh dari target 500 KB.
- **Marker SVG.** Ribuan titik menjadi simpul DOM; renderer kanvas belum dipakai.
- **Tanpa koordinasi antar-tab.** Tiap tab menjalankan penjadwalnya sendiri.
- **`maxDuration` 60 detik** membatasi pekerjaan berat seperti titik-dalam-poligon
  penuh.
