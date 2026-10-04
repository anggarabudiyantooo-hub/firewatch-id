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
| `drought.js` | NOAA CPC + Open-Meteo | ONI dan curah hujan dipisah tegas; kegagalan salah satu tidak menjatuhkan keduanya |
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
| `drought` | 6 jam | | NOAA ONI + Open-Meteo Archive |

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
| `/api/drought` | 1800 dtk | ONI + kekeringan 38 provinsi |
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

---

## 7. Operations Center (ditambahkan 4 Okt 2026)

Papan operasi di `/operations` tidak berdiri sendiri: seluruh angkanya dibaca
dari penjadwal yang sama dengan dashboard, sehingga tidak ada "angka contoh"
yang bisa berbeda dari kenyataan.

### 7.1 Modul

| Modul | Tanggung jawab |
|---|---|
| `lib/scheduler-instance.js` | satu instance `Scheduler` untuk seluruh proses (dulu `server.js` membuat instance sendiri sehingga modul lain membaca penjadwal kosong) |
| `lib/service-health.js` | menerjemahkan keadaan penjadwal menjadi status layanan `HEALTHY/WARNING/DOWN/UNKNOWN` + ringkasan + status aplikasi |
| `lib/freshness.js` | ambang kesegaran `FRESH ≤ 1,5×` / `STALE ≤ 6×` / `CRITICAL > 6×` interval jadwal (dapat diatur lewat env) |
| `lib/alert-engine.js` | empat aturan (`source_down`, `data_critical`, `api_slow`, `hotspot_cluster`), dedup per (aturan, subjek), penutupan alert yang kondisinya hilang |
| `lib/incidents.js` | siklus hidup insiden, timeline ber-aktor, metrik MTTR/SLA dari data nyata |
| `lib/runbooks.js` | RB-001…RB-004; tiap langkah menunjuk berkas atau endpoint nyata di repo |
| `lib/ops-store.js` | adaptor penyimpanan: `upstash` → `github` → `file` → `ephemeral`, dengan catatan mode yang ditampilkan di halaman |
| `lib/ops-github.js` | mode `github`: keadaan disimpan pada satu issue berlabel `ops-state` |
| `lib/ops-routes.js` | 20 rute `/api/operations`, `/api/incidents`, `/api/runbooks` (naik dari 28 menjadi 42 rute total) |

### 7.2 Alur evaluasi

```
/api/cron  ──►  scheduler.tick()          (mengukur sumber hulu)
                   │
                   ├─► service-health.bangun(status)   → 9 layanan
                   ├─► freshness                         → FRESH/STALE/CRITICAL
                   └─► alert-engine.jalankan({services, clusters})
                            └─► ops-store  →  alert, insiden, metrik
```

Rute baca (`/api/operations/health`, `/api/data-sources`, `/api/alerts`, …)
hanya menyusun balasan dari keadaan itu; tidak ada permintaan hulu tambahan.

### 7.3 Keputusan: instance dingin mengukur, bukan menampilkan "belum diketahui"

Di Vercel setiap instance punya memori sendiri dan tugas penjadwal hanya berjalan
saat `/api/cron` dipanggil (GitHub Actions, tiap 10 menit). Instance yang baru
hidup karena itu belum mengukur apa pun. Pilihan yang ditolak: mengarang angka,
atau membiarkan halaman berkata "belum diketahui" sampai cron kebetulan menyentuh
instance itu.

Yang dipakai: satu kali pengukuran beranggaran terbatas (`OPS_WARMUP_MS`, bawaan
8000 ms) pada permintaan pertama rute ops, hasilnya dilaporkan apa adanya
(`application.warmup = {ran, budgetMs, ms, diukur, pending}`), tidak diulang
setelah instance itu punya hasil, dan dijeda 60 detik bila percobaan gagal.
Status aplikasi pun tidak lagi menyebut `DOWN` hanya karena belum ada pengukuran:
keadaan itu dilaporkan sebagai `UNKNOWN` beserta sebabnya.

### 7.4 Batas yang diketahui

- Tanpa Upstash/GitHub, penyimpanan insiden bersifat sementara (per instance) dan
  halaman memasang spanduk yang mengatakannya.
- Pengukuran hanya terbukti untuk instance yang melayani permintaan; dua instance
  yang hidup bersamaan dapat melaporkan angka yang berbeda selama rentang 10
  menit antar-cron. Itu keterbatasan arsitektur serverless tanpa penyimpanan
  bersama, bukan angka yang dipalsukan.
- Rute ops selalu `no-store` agar keadaan lama tidak pernah tersaji sebagai baru.

---

## 8. Peran akses (RBAC) — ditambahkan 4 Okt 2026

```
permintaan ──► x-ops-token?  ──► peran (VIEWER < OPERATOR < ADMIN)
                    │                     │
                    │                     ├─ GET  ops   → BACA   (publik, kecuali OPS_READ_PROTECTED=1)
                    │                     ├─ tulis ops   → OPERATOR
                    │                     └─ evaluate    → ADMIN (mahal: memanggil sumber hulu)
                    ▼
              tanpa token terkonfigurasi → mode TERBUKA, dikatakan di /api/operations/access
```

Empat keputusan yang dipegang (`lib/ops-auth.js`):

1. **Mode terbuka dinyatakan terbuka.** Tanpa token yang dikonfigurasi,
   aplikasi tidak berpura-pura terkunci; `/api/operations/access` dan halaman
   menuliskannya apa adanya.
2. **Baca publik sebagai bawaan.** Papan ini memang dipakai untuk memantau;
   `OPS_READ_PROTECTED=1` menguncinya untuk pemasangan privat.
3. **Pemasangan lama tidak berubah.** `OPS_WRITE_TOKEN` diperlakukan sebagai
   token ADMIN, jadi perilaku sebelum RBAC tetap berlaku.
4. **Token tidak pernah keluar dari server.** `/api/operations/access` hanya
   menyatakan peran mana yang terkonfigurasi dan peran pemanggil; perbandingan
   memakai `crypto.timingSafeEqual`.

Peran menentukan *boleh atau tidak*; nama pelaku tetap dari `x-ops-actor` dan
tetap menentukan *siapa* yang tercatat di timeline serta log audit.

---

## 9. Troubleshooting berbasis bukti (P2)

```
/api/operations/diagnose?service=|?alert=|?incident=   (atau tanpa sasaran → ringkasan armada)
        │
        ├─ ukurBilaPerlu()          → instance dingin mengukur dulu (mekanisme sama seperti rute baca lain)
        ├─ lib/troubleshoot.js      → aturan tetap atas pengukuran tersimpan
        └─ balasan: kesimpulan + kejelasan bukti + BUKTI ANGKA + langkah + runbook terkait
```

Ini **bukan** keluaran model bahasa. Yang menentukan hasil hanya pengukuran yang
sudah tersimpan: status, waktu respons, jumlah gagal berturut, kesegaran, pesan
galat tersanitasi, dan alert yang menyala.

Aturan yang dipegang:

| Keadaan | Jawaban modul |
|---|---|
| Sehat (tak ada sinyal) | "tidak ada indikasi masalah" + catatan bahwa itu **bukan jaminan**, dan tanpa runbook |
| Belum pernah diukur | "belum ada pengukuran" — **tidak** disebut rusak |
| Gagal 1–2× | "kegagalan baru N×, belum menetap" + jenis kegagalan + langkah yang bisa dikerjakan sekarang |
| Gagal ≥3× tanpa data | "tidak dapat dijangkau berulang" + jenis kegagalan (5xx/timeout/kredensial/kuota/tak terbaca) |
| Ada data tapi umur > CRITICAL | "nilai lama masih dipakai" |
| Respons > ambang lambat | "hulu lambat" — dinyatakan sebagai gejala, bukan kegagalan |
| ≥3 layanan turun bersamaan | "kemungkinan gangguan di sisi kita" + ambangnya disebutkan ("3 dari 9") |

Tingkat "kejelasan bukti" dihitung dari jumlah **kelompok** sinyal yang sejalan
(1 → rendah, 2–3 → sedang, ≥4 → tinggi) dan disertai field `arti` yang menegaskan
bahwa itu kejelasan **gejala**, bukan kepastian penyebab.

`kategoriUntuk(svc, alertsAktif)` memilih runbook dengan urutan yang dapat
diperiksa: alert yang menyala lebih dipercaya daripada bacaan status; layanan
sehat tidak diberi runbook sama sekali.
