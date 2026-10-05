# Audit Teknis: FireWatch / SIAGA.ID → Operations Center

Tanggal audit: 4 Oktober 2026 · Cakupan: repo produksi `firewatch-id` pada keadaan tip saat audit
Sifat dokumen: **pembacaan kode + pengukuran langsung**, bukan asumsi. Fase ini **tidak mengubah kode**.

---

## 1. Arsitektur

| Lapisan | Kenyataan di repo | Bukti |
|---|---|---|
| **Frontend** | Satu halaman, **tanpa kerangka kerja**, ES5 murni. `public/index.html` (629 baris) + `public/app.js` (**4.606 baris**) + `app.css` (1.372) + `v3-fix.css` + `v3-audit.css` + `v3-ui.js` (lapisan perbaikan audit) + `wind-particles.js`. Tidak ada router, navigasi lewat tab dock & panel, bukan URL. | `wc -l`, `grep app.get('/'` |
| **Backend** | **Express 4** di `server.js` (2.547 baris), **28 endpoint**, helmet (CSP ketat: `default-src 'none'; script-src 'self'`), compression. | `grep -cE "^app\.(get\|post...)"` → 28 |
| **Serverless** | `api/index.js` membungkus Express untuk Vercel; `vercel.json` menulis ulang **semua** path → `/api/index.js` (`maxDuration: 60`, `includeFiles: public/**`). Konsekuensinya: rute baru harus ditangani Express, bukan berkas statis Vercel. | `vercel.json`, `api/index.js` |
| **Basis data** | **TIDAK ADA.** Tidak ada SQL/ORM/Redis/KV. Seluruh keadaan hidup di memori proses dan hilang saat instance didaur ulang. Didokumentasikan sejak lama di `docs/ERD.md` & `docs/ARCHITECTURE.md`. | `docs/ERD.md` baris 5; `grep -i "sqlite\|prisma\|redis"` → 0 |
| **Autentikasi** | **Tidak ada.** Semua endpoint publik. Satu-satunya kredensial server: `FIRMS_MAP_KEY` dan OAuth Copernicus (token cache di memori), keduanya dari environment variable. `/api/cron` opsional dijaga `CRON_SECRET`. | `.env.example`, `lib/sentinel.js:243` |
| **Penyimpanan statis (snapshot)** | Beberapa data ikut repo sebagai cadangan: `data/regions.json`, `lib/pvmbg-snapshot.js`, `lib/volcano-coords-snapshot.js`, dipakai saat sumber hulu mati. | `scripts/refresh-snapshots.js` |
| **Penjadwalan** | `lib/scheduler.js` (kelas `Scheduler`), **9 tugas**: quake, tsunami, news, hotspots, shelter, volcano, pvmbg, eruption, drought. Timer internal **hanya di server berkelanjutan**; di Vercel penjadwal luar: **GitHub Actions `refresh.yml` tiap 10 menit** memanggil `/api/cron`. | `server.js:1883+`, `.github/workflows/refresh.yml` |
| **Deployment** | Vercel (satu fungsi) + 3 GitHub Actions: `refresh.yml` (data + pemanasan cache), `snapshots.yml`, `uptime.yml` (pemantau baru). | `.github/workflows/` |

---

## 2. Fungsi yang SUDAH ada (dan lokasinya)

| Fungsi | Lokasi |
|---|---|
| Peta interaktif Leaflet + SVG prototipe, lapisan panas, gunung, abu | `public/app.js` (~1.100 baris peta) |
| Titik api FIRMS (arsip terbuka / MAP_KEY + pemilihan liputan) | `server.js:410-500`, `lib/firms-open.js` |
| Gempa & tsunami | `lib/hazard.js`, `server.js` `/api/hazard` |
| Sebaran asap/abu (GFS + laporan letusan MAGMA) | `lib/wind-gfs.js`, `lib/eruption.js`, `lib/volcano.js` |
| Kualitas udara & SO₂ (CAMS/Open-Meteo) | `server.js:1640+`, `lib/atmos.js` |
| Pengungsi (BNPB ArcGIS) | `lib/casualty.js` |
| Berita (Google Berita RSS) | `server.js:879-1100` |
| Kekeringan & El Niño | `lib/drought.js` |
| Atribusi lahan (GFW) | `lib/concession.js` |
| **Status sumber** (`/api/status`): runs, fails, `consecutiveFails`, `errorNote` tersanitasi, `recentLogs` (20 terakhir), `criticalAlerts` | `lib/scheduler.js:245-330` |
| **Backoff** sumber gagal ≥6× (30 menit), baru | `lib/scheduler.js` `isDue()` |
| AI Asisten (RAG lokal, `/api/ask`) | `lib/rag.js`, `server.js:1785+` |
| Pemantau uptime → tiket GitHub otomatis | `scripts/uptime_check.py`, `.github/workflows/uptime.yml` |
| Uji: `npm run check` = `check-bundle.js` (simulasi serverless) + `test-atmos.js` (harness `cek()`) | `scripts/` |
| Uji end-to-end antarmuka (Playwright) | 8 skrip, 100+ asersi; sengaja tidak disertakan di repo karena menuntut peramban |

**Kesimpulan bagian ini:** fondasi monitoring **sudah ada** (status per tugas, log terstruktur, errorNote, uptime→tiket). Yang belum ada: **insiden, alert engine, runbook, halaman operasi, penyimpanan, dan RBAC**.

---

## 3. Aliran data (kenyataan)

```
12 sumber hulu (PVMBG/MAGMA · BMKG · BNPB GIS · NASA FIRMS · NOAA GFS · NOAA PTWC
              · CAMS/Open-Meteo · GFW · GeoNames · Himawari · Google Berita · GVP)
        │  HTTP (semua terbuka; FIRMS & Copernicus pakai kredensial env)
        ▼
lib/*.js, kolektor per sumber (fetch + retry/backoff + parsing + snapshot fallback)
        │
        ▼
lib/scheduler.js, 9 tugas: cache memori + runs/fails/errorHistory/backoff
        │  dipicu oleh: timer internal (dev) ATAU GET /api/cron (GitHub Actions)
        ▼
server.js, 28 endpoint JSON, cache CDN (max-age+s-maxage+SWR), helmet CSP
        │
        ▼
public/*, satu halaman; stempel waktu dari server; panel Sumber membaca /api/status
```

**Tidak ada simpul penyimpanan persisten** di alur ini, itu titik yang harus ditambahkan untuk insiden.

---

## 4. Keterbatasan untuk sasaran Operations Center

| Dibutuhkan | Status | Catatan |
|---|---|---|
| Pemantauan kesehatan sistem | **Sebagian** | Sudah ada per sumber (9 tugas) + uptime→tiket. Belum ada: model layanan seragam (`id/type/status/lastCheckedAt/responseTime`), pengukuran **waktu respons HTTP** per sumber (kini hanya sukses/gagal + umur data). |
| Kesegaran data (FRESH/STALE/CRITICAL) | **Sebagian** | UI sudah menandai `TERLAMBAT` (>2,5× interval). Belum ada ambang eksplisit berlapis + `source/updateInterval` terstruktur. |
| Alert engine | **Tidak ada** | Hanya `criticalAlerts` ad-hoc dari scheduler. Tidak ada aturan, tidak ada deduplikasi, tidak ada riwayat alert. |
| Manajemen insiden | **Tidak ada** | Dan tanpa basis data, ini mustahil tanpa keputusan penyimpanan (lihat §7). |
| Siklus hidup + timeline insiden | **Tidak ada** | - |
| Runbook/SOP | **Tidak ada** | - |
| Metrik operasional (MTTR, SLA) | **Tidak ada** | Wajib dihitung dari data nyata; bila kosong → "belum ada riwayat". |
| Halaman `/operations`, `/incidents`, `/runbooks` | **Tidak ada** | Aplikasi satu halaman tanpa router; perlu rute Express + berkas HTML baru (atau mode tampilan baru di SPA). |
| RBAC (VIEWER/OPERATOR/ADMIN) | **Tidak ada** | Tidak ada auth sama sekali. |
| Audit trail | **Sebagian** | `recentLogs` (20 entri, memori) cocok untuk diagnosa, **bukan** untuk audit (hilang saat instance didaur ulang). |
| AI troubleshooting | **Sebagian** | `/api/ask` sudah RAG dengan batasan eksplisit; belum ada mode diagnosis yang memisahkan fakta/dugaan/rekomendasi. |

---

## 5. Berkas yang akan disentuh

**Baru (backend):** `lib/service-health.js` · `lib/freshness.js` · `lib/alert-engine.js` · `lib/incidents.js` · `lib/runbooks.js` · `lib/ops-store.js` (adaptor penyimpanan) · `lib/ops-log.js`
**Baru (frontend):** `public/operations.html` · `public/ops.js` · `public/ops.css`
**Baru (uji & skrip):** `scripts/test-ops.js` (di `npm run check`) · `scripts/ops-smoke.js` · tambahan asersi di uji antarmuka terpisah
**Disentuh minimal (additif):** `server.js` (rute baru + `sendOps`), `lib/scheduler.js` (`status()` menambah `responseTimeMs` terakhir & `lastAttemptAt`), `.github/workflows/uptime.yml` (memicu evaluasi alert), `README.md`, `docs/ARCHITECTURE.md`, `docs/ERD.md` (memetakan entitas baru), `.env.example` (kunci ops baru, tanpa nilai).

**Tidak disentuh:** seluruh logika sumber hulu, `public/app.js` kecuali satu tautan masuk ke `/operations` (dan itu pun di area bebas dok auditan), CSP selain penambahan `connect-src 'self'` yang sudah ada, desain dasar.

---

## 6. Rencana implementasi

**Fase P0 (fondasi, dikerjakan lebih dulu)**
1. `ops-store`, adaptor penyimpanan berlapis: Upstash/Redis-REST → GitHub Issues → berkas lokal (dev) → **mode baca-saja dengan pesan jujur** bila tak ada yang terkonfigurasi di produksi. Tidak ada data palsu dalam keadaan apa pun.
2. `service-health`, model seragam 9 sumber + endpoint `/api/operations/health`, memakai data nyata `scheduler.status()` + pengukuran waktu respons yang sudah dicatat saat pengambilan.
3. `freshness`, FRESH/STALE/CRITICAL dengan ambang **eksplisit dan terdokumentasi** (default: >1× interval = STALE, >6× = CRITICAL; dapat diatur lewat env `OPS_FRESH_STALE_MULT`/`OPS_FRESH_CRIT_MULT`).
4. `alert-engine`, 4 aturan: sumber DOWN (gagal ≥3 berturut), data CRITICAL, respons > ambang (`OPS_SLOW_MS`, default 4000 ms), dan klaster titik api ≥ ambang (`OPS_HOTSPOT_CLUSTER`, default 25 titik dalam sel 0,5°) memakai data FIRMS yang sudah ada. Deduplikasi per `(rule, subject)` dengan jendela 30 menit; tanpa klaim ilmiah baru.
5. `incidents`, CRUD + siklus OPEN→INVESTIGATING→PENDING→RESOLVED→CLOSED dengan transisi tervalidasi, penugasan, eskalasi, catatan investigasi, **timeline per insiden**, dan konversi alert→insiden.
6. `/operations`, halaman ringkas: kartu kesehatan, tabel sumber data, tabel kesegaran, alert aktif, insiden terbuka, metrik operasional (kosong → "belum ada riwayat").

**Fase P1:** `/incidents` (daftar + detail `INC-YYYY-NNNNN` dengan timeline & tindakan), `/runbooks` (2 SOP awal yang benar-benar terkait kategori insiden nyata di sistem ini), metrik (MTTR/SLA dari data nyata), logging audit operasional, integrasi `uptime.yml`.

**Status 4 Okt 2026: P0, P1, dan P2 SELESAI.** P2 diwujudkan sebagai:
diagnosa berbasis bukti angka (`lib/troubleshoot.js`; **aturan tetap, bukan model
bahasa**, supaya tiap kalimat bisa ditelusuri ke pengukuran), RBAC token peran
VIEWER/OPERATOR/ADMIN (`lib/ops-auth.js`), analitik riwayat (`lib/analytics.js`,
nol ≠ "belum ada riwayat"), dan panel infrastruktur berlabel SIMULATED
(`lib/infra-sim.js`, tanpa perangkat/vendor/protokol fiktif). **Fase P2 (arsip,
rencana awal):** mode diagnosa AI (memisahkan **fakta terukur / dugaan / rekomendasi**, memakai `/api/ask` yang sudah ada), RBAC sederhana berbasis token peran, analitik riwayat, panel infrastruktur, **semua yang tidak nyata diberi label SIMULATED atau tidak dibuat sama sekali**.

**Urutan verifikasi tiap fase:** `npm run check` (termasuk `test-ops.js` baru) → uji Playwright baru untuk halaman → uji regresi 8 skrip antarmuka → tangkapan bukti → commit + deploy + uji terhadap produksi.

---

## 7. Risiko & satu keputusan yang memblokir P0

| Risiko | Penanganan |
|---|---|
| **Tidak ada penyimpanan persisten** (pemblokir nyata) | Adaptor berlapis di §6.1. Tanpa layanan terkonfigurasi, produksi berjalan **baca-saja dan mengatakannya**, bukan pura-pura menulis. |
| Instance serverless terpisah-pisah | Insiden/alert **wajib** lewat penyimpanan bersama; status kesehatan tetap boleh per-instance karena sudah jujur (`feedStamp` + label). |
| API hulu mati (MAGMA 500 sejak pagi, BNPB 5xx) | Sudah ditangani: retry, snapshot, backoff 30 menit, label "dijeda". Alert engine menandai, tidak memalsukan. |
| Halaman baru vs paritas dok auditan | Halaman **terpisah** dari dashboard; dok `SIAGA-ID-v3-dok-*` adalah potongan panel dashboard dan tidak tersentuh. |
| CSP ketat | Halaman ops memakai skrip/CSS berkas sendiri (`'self'`), tidak perlu melonggarkan CSP. |
| Biaya kuota | Polling ops tidak menambah permintaan hulu: membaca `scheduler.status()` yang sudah ada, kecuali satu health check HTTP ringan per sumber per interval; ambang respons dipakai ulang. |
| Klaim berlebihan | Setiap angka di UI berasal dari payload nyata; yang kosong ditulis "belum ada riwayat". Label **SIMULATED** wajib untuk apa pun yang bukan pengukuran. |

### Keputusan yang saya minta sebelum menulis kode P0

Penyimpanan insiden & alert (dua pilihan, keduanya nyata dan gratis):

- **A. Upstash Redis (REST)**, paling standar untuk Vercel; butuh 2 env var: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- **B. GitHub Issues di repo ini**, tanpa layanan baru; butuh `OPS_GITHUB_TOKEN` (scope `issues`) + `OPS_GITHUB_REPO`; bonus: riwayat & audit terlihat manusia, cocok untuk demo operasional.
- **C. Keduanya tidak ada sekarang**, saya bangun tetap jalan: lokal memakai berkas `.data/ops.json`, produksi tampil **baca-saja** dengan pemberitahuan eksplisit sampai salah satu env dipasang.
