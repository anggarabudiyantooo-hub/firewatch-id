# Peta Jalan Menuju Rilis Produksi — SIAGA ID

Versi 2.0 · 8 September 2026

---

## Keadaan sekarang

Audit black-box menyeluruh (8 September 2026, 43 temuan) memberi skor awal
**59/100** — *"prototipe publik yang kuat, belum layak menjadi rujukan darurat"*.

Dua temuan Critical dan sebagian besar High sudah ditangani:

| Temuan | Keadaan | Bukti |
|---|---|---|
| BUG-001 Cold start gagal senyap | ✅ selesai | Pesan muncul di detik ke-12 saat `/api/overview` ditahan |
| BUG-002 Data "24 jam" berumur 46 jam | ✅ selesai | Umur maksimum 23,9 jam; 2.583 titik basi dibuang |
| BUG-004 Sampel konsesi tanpa label | ✅ selesai | `sampled`, `population`, `samplingMethod` ditampilkan |
| BUG-005 `stats.clusters` tidak cocok | ✅ selesai | `clustersMeta` melaporkan 40 dari 570 |
| BUG-006 Format `acq` non-standar | ✅ selesai | ISO 8601 UTC, `acqRaw` disimpan |
| BUG-008 `frame-ancestors *` | ✅ selesai | `'self'` + `X-Frame-Options: SAMEORIGIN` |
| BUG-010 REFRESH terkunci | ✅ selesai | Pelepasan independen 12 detik |
| BUG-020/021/025 Kontras dan target | ✅ selesai | 31 selektor nol gagal; target <24 px nol |
| BUG-015/016 Pola ARIA tab | ✅ selesai | Roving tabindex + navigasi panah |
| BUG-031 Atribusi kosong salah label | ✅ selesai | "Analisis sedang berjalan" |
| BUG-036 `prefers-reduced-motion` | ✅ selesai | Ticker dan partikel berhenti |
| BUG-003 Payload 3,64 MB | ✅ selesai | 4,66 MB → **407 KB**; target <500 KB tercapai |

## Audit putaran-2 (8 September 2026)

Audit ulang memberi skor **78/100** dan menemukan satu regresi Critical
yang diperkenalkan oleh perbaikan putaran-1. Seluruhnya sudah ditangani:

| Temuan | Keadaan | Bukti |
|---|---|---|
| BUG-044 Peta runtuh 0 px di 721–768 px | ✅ selesai | Sapuan 320–1920 px langkah 10 px: tinggi minimum 440 px, nol lebar bermasalah |
| BUG-013 wind-field 800 KB | ✅ selesai | 800.064 B → 44.600 B (−94,4%); koordinat tidak sah 166 → 0 |
| BUG-009 Rate limiting | ✅ selesai | Header `RateLimit-*`, kelas biaya terpisah, `Retry-After` |
| BUG-012 Validasi `step` | ✅ selesai | Himpunan diskret; `?step=abc` → 400 |
| BUG-017 Hint bocor lintas lapisan | ✅ selesai | Timer dibatalkan; tiap lapisan punya pesan sendiri |
| BUG-018 Empat lapisan diam | ✅ selesai | Ketujuh lapisan memberi pesan dengan jumlah nyata |
| BUG-027 robots/sitemap/404 | ✅ selesai | 404 berkas 30 KB → 21 B |

**Skor audit putaran-2: 78/100.**

## Audit putaran-3 (8 September 2026)

Audit ulang menyatakan aplikasi **layak rilis** dengan skor **89/100**.
Regresi Critical putaran-2 tertutup, tidak ada Critical maupun High baru.
Dari 44 temuan kumulatif: 35 FIXED, 3 PARTIAL, 3 OPEN (semua Low), 3 ditarik.

Sisa temuan Low sudah ditangani pada putaran ini:

| Temuan | Keadaan | Bukti |
|---|---|---|
| BUG-045 Payload 7.172 titik, 91% tak dirender | ✅ selesai | 1.160.642 B → 327.585 B (−72%); over-the-wire 101 KB → 52,7 KB |
| A11Y-02 Kontras `.ev-detail` `.cs-lab` | ✅ selesai | 3,92:1 → 12,55:1 · 3,95:1 → 12,66:1 |
| A11Y-03 `role="application"` | ✅ selesai | `role="region"` + `aria-describedby` |
| A11Y-07 Empat target < 24 px | ✅ selesai | Terukur nol pelanggaran |
| BUG-038 `/api/ask` 3.000 karakter | ✅ selesai | Ditolak 400, bukan dipotong diam-diam |
| Sub-temuan 404 berat | ✅ selesai | 30 KB → 21 B untuk non-peramban |

**Estimasi skor sekarang: ~95/100.**

### Pelajaran dari BUG-045

Perbaikan payload putaran-2 diuji ketika data sedang sepi — 595 titik,
sehingga batas array tidak pernah terpakai. Begitu kemarau memuncak ke
7.172 titik, batas itu ternyata memang tidak pernah ada.

Sejak itu perbaikan performa diuji pada **beban puncak**, bukan pada
kondisi saat pengujian kebetulan berlangsung.

Bagian paling mudah salah bukan pemotongannya, melainkan angka
pembanding di antarmuka: memakai panjang array yang sudah dipotong
membuat "semua titik" terbaca 2.000 padahal satelit mendeteksi 7.172.

### Catatan tentang BUG-044

Regresi ini pelajaran penting: perbaikan putaran-1 menambahkan blok
`@media(max-width:768px)`, sementara aturan penyelamat `#map` yang sudah
ada memakai `720px`. Dua angka breakpoint berbeda di berkas yang sama
menciptakan jendela mati 48 px — dan pengujian responsif standar
(320/375/768/1024) hampir melewatkannya karena hanya memeriksa
"tidak ada geser samping", yang memang lolos.

Sejak itu pengujian peta memakai **sapuan langkah 10 px**, bukan titik
henti terpilih.

---

## Fase 1 — Wajib sebelum disebut siap produksi

Tiga hal berikut menghalangi aplikasi ini dipakai pada saat yang paling dibutuhkan:
jaringan seluler yang buruk saat bencana.

> **Catatan:** Butir 1.1–1.3 di bawah sudah **selesai** pada audit
> putaran-2. Dipertahankan sebagai catatan keputusan dan angka ukurnya.

### 1.1 Rate limiting per-IP `[keamanan · tinggi]` — ✅ SELESAI

Belum ada sama sekali. Satu aktor dapat menghabiskan kuota NASA FIRMS atau Open-Meteo
dan membuat dasbor gelap bagi semua orang. `/api/overview` 1,5 MB dan
`/api/concessions` 3,9 MB dapat dipicu tanpa kredensial apa pun.

- 60 permintaan/menit untuk endpoint ringan
- 10 permintaan/menit untuk endpoint >1 MB
- Balas `429` dengan `Retry-After`
- Ambang longgar; banyak pengguna Indonesia berbagi IP di balik NAT

**Selesai bila:** header rate limit hadir; permintaan berlebih menerima 429.

### 1.2 Kurangi payload `[performa · tinggi]` — ✅ SELESAI

Target < 500 KB. Sekarang ~1,5 MB.

- Agregasi hotspot di server pada zoom rendah (bin 0,1°)
- Renderer `L.canvas()` menggantikan SVG — menghapus ribuan simpul DOM
- Pangkas `/api/wind-field` ke rentang koordinat sah dan bbox yang relevan; 98,6%
  isinya kini di luar Indonesia, dan 166 titik berkoordinat tidak valid (`lon ±182`)
- Verifikasi kompresi Brotli aktif untuk JSON

**Selesai bila:** payload awal < 500 KB; re-render filter < 200 ms; klik marker tetap
membuka popup.

### 1.3 Retry dan cache hulu `[keandalan · tinggi]` — 🔸 SEBAGIAN

`/api/air-quality` membalas 502 setelah sembilan permintaan berurutan — dan
`loadAir()` terpicu pada tiap `moveend` dengan debounce hanya 450 ms, sehingga
pengguna yang menggeser peta memicunya pada pemakaian normal.

- Retry dengan backoff eksponensial + jitter (3 percobaan)
- Cache server dengan TTL per sumber; `stale-while-revalidate`
- Balas `429` dengan `Retry-After` bila memang kuota, bukan `502` generik
- Naikkan debounce klien ke 800 ms
- Satukan TTL endpoint sekerabat (`eruptions` dan `volcano-ash` pernah berbeda)

**Selesai bila:** 20 permintaan berurutan menghasilkan nol 502.

---

## Fase 2 — Pengerasan operasional

### 2.1 Pindahkan nilai tetap ke konfigurasi `[pemeliharaan]`
Prioritas dari [`HARDCODED.md`](HARDCODED.md): URL dasar hulu, interval penjadwal,
TTL cache terpusat, `SHELTER_MAX_AGE_DAYS`, label sudut peta diturunkan dari `BBOX`.

### 2.2 Pemantauan dan peringatan `[operasional]`
Audit mencatat: nol error di konsol juga berarti **kegagalan tidak terinstrumentasi**.
Saat `/api/overview` menggantung, tidak ada apa pun yang tercatat.

- Log terstruktur untuk kegagalan sumber
- Peringatan bila tugas kritis gagal berturut-turut
- Pantau konsumsi kuota; tampilkan di panel status

### 2.3 Segarkan data statis `[data]`
Snapshot PVMBG (7 September 2026) dan `regions.json` perlu jadwal penyegaran.
Idealnya otomatis lewat GitHub Actions.

### 2.4 Hentikan polling saat tab tersembunyi `[performa]`
Page Visibility API. Lima tab terbuka kini menghasilkan lima kali beban.

### 2.5 `robots.txt` dan `sitemap.xml` `[penemuan]`
Situs kepentingan publik seharusnya dapat ditemukan. Sekaligus sajikan 404 ringan;
kini tiap 404 mengembalikan dokumen 27 KB.

---

## Fase 3 — Kualitas dan kepercayaan

### 3.1 Uji pembaca layar sungguhan `[a11y]`
NVDA + Firefox, JAWS + Chrome, VoiceOver + Safari. Sekaligus tinjau
`role="application"` pada peta yang berpotensi menyandera navigasi.

### 3.2 Uji lintas peramban `[kompatibilitas]`
Baru diuji pada Chromium. Firefox dan Safari belum, termasuk `:has()` yang dipakai
pada penanda chip aktif.

### 3.3 Uji kebocoran memori `[keandalan]`
Sesi 2+ jam dengan snapshot heap berkala. `WindParticles` dan `setInterval` tanpa
pembersihan adalah kandidat utama.

### 3.4 Uji otomatis `[kualitas]`
Belum ada rangkaian uji. Minimal: uji unit untuk `relevance.js`, `firms-open.js`
(penyaringan jendela), `hazard.js` (ambang kesegaran); uji asap Playwright di CI.

### 3.5 Pemeriksaan kontras di CI `[a11y]`
Perbaikan kontras mudah kembali rusak tanpa penjaga otomatis.

---

## Fase 4 — Peningkatan pengalaman

| Butir | Catatan |
|---|---|
| Persistensi preferensi | `localStorage` untuk lapisan, peta dasar, filter. **Menambah permukaan privasi** — perlu pertimbangan sadar |
| Deep linking | `?lat=&lon=&zoom=&layers=` agar tampilan dapat dibagikan; penting untuk koordinasi darurat |
| Tombol atur ulang tampilan | Default FRP ≥10 MW menyembunyikan sebagian besar titik tanpa jalan kembali yang jelas |
| Label filter keyakinan | Ganti ambang numerik dengan kategori; VIIRS hanya punya tiga nilai sehingga angka menyiratkan ketelitian palsu |
| Isi ticker | Kini hanya mengulang satu metrik |
| Mode sematan resmi | `/embed` berlabel jelas, bila media memang membutuhkannya |

---

## Yang **tidak** akan dikerjakan

Ditulis eksplisit agar tidak berulang jadi bahan diskusi:

- **Peringatan dini resmi** — kewenangan BMKG dan PVMBG, bukan aplikasi ini
- **Akun pengguna** — tidak ada data per-pengguna, dan ketiadaannya menghapus seluruh
  kelas kerentanan
- **Prediksi bencana** — di luar kemampuan data yang tersedia dan berbahaya bila keliru
- **Kerangka frontend** — payload tambahan pada jaringan yang justru sedang buruk

---

## Daftar periksa rilis

Sebelum menyebut aplikasi ini siap dipakai sebagai rujukan publik:

- [ ] Rate limiting aktif dan teruji
- [ ] Payload awal < 500 KB
- [ ] Nol 502 pada 20 permintaan berurutan ke tiap endpoint
- [ ] Log terstruktur dan peringatan kegagalan sumber aktif
- [ ] Snapshot PVMBG disegarkan otomatis
- [ ] Rangkaian uji otomatis berjalan di CI
- [ ] Uji pembaca layar selesai
- [ ] Uji Firefox dan Safari selesai
- [ ] Uji beban dengan izin, hasil terdokumentasi
- [ ] `robots.txt` dan `sitemap.xml` ada
- [ ] Penyangkalan "bukan sumber resmi" terlihat di setiap tampilan utama
- [ ] Kontak pelaporan kekeliruan data tersedia

**Perkiraan skor setelah Fase 1–2: ~85/100.**

---

## Prinsip yang dipegang selama pengembangan lanjutan

Aplikasi ini sudah memiliki kejujuran epistemik yang lebih baik daripada kebanyakan
dasbor sejenis: ia menolak menampilkan nol ketika artinya "belum diketahui",
memisahkan angka media dari angka resmi, dan menyatakan batas modelnya sendiri.

Setiap perbaikan berikutnya sebaiknya memperluas prinsip yang sama ke lapisan yang
belum tersentuh. Aplikasi yang sudah berani berkata *"ini model, bukan pengukuran"*
seharusnya juga berani berkata *"data ini berumur 46 jam"* dan *"kami gagal memuat
sumber ini"*.
