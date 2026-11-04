# Penjadwal: mengapa data bisa menua berjam-jam (dan apa yang bisa dilakukan)

Temuan 4 Okt 2026. Ditulis setelah dashboard produksi menunjukkan **5/9 sumber
aktif** dan beberapa baris "TELAMBAT · 2 jam lalu", bukan karena sumbernya
mati, melainkan karena **penjadwalnya tidak berjalan sesering yang tertulis di
alurnya**.

## 1. Bukti: yang dijanjikan vs yang benar-benar terjadi

Alur kerja GitHub Actions yang memanggil penyegaran:

| Alur kerja | Jadwal tertulis | Kenyataan hari itu (UTC) |
|---|---|---|
| `refresh.yml` → `GET /api/cron` | `*/10 * * * *` (tiap 10 menit) | 02:02 · 07:03 · 08:20, jarak **5 jam**, lalu 1 jam 17 menit |
| `uptime.yml` → cek `/api/status` | `*/5 * * * *` (tiap 5 menit) | 03:53 · 10:14, jarak **6 jam 21 menit** |

Angka diambil dari `GET /repos/:owner/:repo/actions/runs` (API GitHub), bukan dari
perkiraan. Keduanya berakhir `success`; yang salah bukan alurnya, melainkan
**jadwalnya tidak dijalankan**.

**Sebabnya:** `schedule` di GitHub Actions bersifat *best-effort*. GitHub
menjalankan cron terjadwal saat sistemnya senggang, dan untuk repositori yang
sepi aktivitas, jadwalnya bisa tertunda lama atau dilewati. Ini bukan konfigurasi
yang bisa diperbaiki lewat YAML, tidak ada opsi "paksa tepat waktu".

**Akibat yang terlihat pengguna:** angka di kepala halaman berubah-ubah tanpa
sebab yang jelas (9/9 → 5/9), beberapa sumber bertanda TELAMBAT, dan alarm
(uptime.yml) juga datang terlambat, alarm yang telat sama saja tidak ada.

## 2. Yang **tidak** dilakukan, dan alasannya

**Menjadikan alur kerja sebagai proses panjang** (`curl` lalu `sleep` berulang
dalam satu job 6 jam) memang membuat jadwal lebih rapi, dan tetap **tidak
dipakai**, tetapi alasannya berubah sejak repositori ini dibuka untuk publik:

- Saat repo masih privat, alasannya biaya: menit Actions dihitung (kuota 2.000
  menit/bulan) sedangkan job 24/7 sekitar 43.200 menit/bulan.
- Sekarang repo publik sehingga menitnya tidak lagi dihitung. Alasannya jadi:
  job tetap bisa **tertunda atau dilewati** karena jadwal GitHub masuk antrean,
  satu sesi hanya menutup 6 jam sehingga lubangnya tetap ada, dan menjalankan
  runner publik terus-menerus untuk keperluan yang bukan produksi perangkat
  lunak berisiko dianggap pemakaian di luar tujuan.

Yang menggantikannya bukan job panjang, melainkan tiga lapis yang saling
menutup: percobaan GitHub Actions, **cron harian bawaan Vercel** sebagai lantai
(selalu berjalan walau seluruh penjadwal luar mati), dan cron eksternal gratis
bila ingin presisi menit.

## 3. Pilihan yang tersedia

| Pilihan | Keandalan | Biaya | Catatan |
|---|---|---|---|
| **A. Cron eksternal gratis** (mis. cron-job.org) memanggil `/api/cron` dengan `Authorization: Bearer` | tinggi (per 5-10 menit) | Rp0 | butuh satu pendaftaran + `CRON_SECRET`; tidak memakai menit Actions |
| B. Vercel Cron | Hobby: sekali sehari | Rp0 | **terpasang** di `vercel.json` sebagai jaring terakhir; terlalu jarang untuk data 10 menitan |
| C. Vercel Pro (cron per menit) | tinggi | ±$20/bln | tidak perlu bila pilihan A cukup |
| D. Biarkan seperti sekarang | rendah | Rp0 | dashboard sudah jujur menandai TELAMBAT, tetapi angka berubah tanpa penjelasan |

**Rekomendasi: A**, ditambah **D** sebagai keadaan cadangan yang jujur.

## 4. Jaring harian yang sudah terpasang

`vercel.json` memuat `crons` yang memanggil `/api/cron` sekali sehari (19:00 UTC,
2:00 WIB). Batas "sekali sehari" itu milik paket Hobby, bukan pilihan desain:
Vercel menolak jadwal yang lebih rapat pada paket gratis. Fungsinya sempit dan
jelas, yaitu memastikan ada satu penyegaran penuh setiap hari tanpa bergantung
pada GitHub Actions, penjadwal luar, atau uluran tangan.

`CRON_SECRET` wajib dipasang di Vercel Production. Vercel Cron akan membawa
header `Authorization: Bearer` secara otomatis. Bila secret tidak ada,
`/api/cron` fail-closed dengan HTTP 503 dan tidak menjalankan penyegaran.

## 5. Langkah memasang pilihan A (tanpa menyentuh kode)

1. Daftar gratis di cron-job.org → **Create cronjob**.
2. URL: `https://firewatch-id.vercel.app/api/cron`. Atur header
   `Authorization: Bearer <CRON_SECRET>` di konfigurasi job, dengan nilai
   rahasia yang sama seperti di Vercel dan GitHub Actions. Jangan menaruh
   rahasia di URL atau query string.
3. Jadwal: **setiap 10 menit**. Timeout 60 detik. Aktifkan notifikasi surel
   saat gagal.
4. Buat cronjob kedua untuk alarm: `https://firewatch-id.vercel.app/api/alarm`
   setiap 5 menit, dengan notifikasi saat balasan **bukan 200**.

## 6. Alarm yang bisa dipakai monitor apa pun

Sebelumnya alarm hanya ada di dalam `uptime.yml`, yang ikut telat. Sejak
`/api/alarm` ditambahkan, monitor mana pun cukup melihat kode HTTP:

- **200**, normal.
- **503**, ada yang perlu ditangani; isi balasan menyebut *apa*.

`/api/alarm` memang publik dan hanya membaca status instance yang melayaninya;
route ini tidak memicu pengukuran atau permintaan hulu. Karena itu instance dingin
boleh menjawab `UNKNOWN` dengan HTTP 200 sampai penjadwal mengukurnya.

Aturan penilaiannya dipilih dengan sadar dan diuji:

- **Gagal** bila ada sumber **kritis** yang `DOWN` (mati atau data kedaluwarsa
  kritis) → `tingkat: "kritis"`.
- **Gagal** pula bila yang `DOWN` hanya sumber non-kritis → `tingkat:
  "peringatan"`.
- **Tidak gagal** untuk `UNKNOWN` (belum pernah terukur di instance ini).
  Alasannya konkret: instance Vercel selalu mulai tanpa pengukuran, dan alarm
  yang berbunyi setiap kali instance didaur ulang akan dilatih untuk diabaikan.
  Jumlah `UNKNOWN` tetap dilaporkan di badan balasan.

## 7. Cara memeriksa sendiri kapan saja

```
curl -s https://firewatch-id.vercel.app/api/alarm     # ringkasan kesehatan publik
curl -s https://firewatch-id.vercel.app/api/status    # status publik terbatas
# Detail /api/admin/data-sources hanya untuk sesi admin di /operations.
```

`/api/status` memberi proyeksi publik yang terbatas: label dan kesegaran sumber,
serta flag perhatian tanpa jumlah percobaan atau pesan galat. Host endpoint,
kuota agregat, dan log internal hanya tersedia di endpoint admin bersesi.

Umur tiap sumber (`ageMs`) dibandingkan dengan intervalnya sendiri; ambangnya
ditampilkan di halaman (`STALE > 1,5× · CRITICAL > 6×`). Bila GitHub Actions
terlambat lagi, yang berubah hanyalah kesegaran angka, dan itu tertulis apa
adanya, bukan disembunyikan.

## 8. Penjadwal luar untuk snapshot lalu lintas udara (dan batasnya)

Lapisan penerbangan sipil memakai jalur snapshot (`.github/workflows/flights-snapshot.yml`)
karena dari fungsi produksi Vercel koneksi ke OpenSky Network timeout, sedangkan
dari runner GitHub alamat yang sama menjawab 200.

Yang perlu diketahui siapa pun yang memakai atau mengembangkan jalur ini,
diukur pada 5 Oktober 2026, bukan disimpulkan dari konfigurasi:

- Meski `cron` ditulis `*/15 * * * *`, penjadwal GitHub pada repositori ini
  menjalankan workflow berjadwal sekitar **5 kali sehari**. Workflow
  `refresh.yml` yang ditulis `*/5 * * * *` pun tercatat berjalan pada pukul
  08:20, 14:12, 18:10, dan 21:29 UTC, bukan 288 kali sehari. Jadi jadwal
  GitHub adalah penjadwal "kadang", bukan penjadwal menit.
- Karena itu pekerjaan snapshot tidak dirancang "sekali panggil, sekali
  jalan". Satu pekerjaan mengambil 20 putaran dengan jeda 15 menit (sekitar
  5 jam 20 menit, di bawah batas enam jam GitHub), dan **penjadwal GitHub
  hanya berperan sebagai penjaga**: tiap kali cron memicu pekerjaan baru saat
  satu pekerjaan masih berjalan, pekerjaan baru itu masuk antrean grup
  `concurrency` yang sama, lalu mengambil alih begitu pekerjaan sebelumnya
  selesai. GitHub menyimpan paling banyak satu pekerjaan menunggu per grup,
  jadi antreannya tidak bisa menumpuk. Hasilnya irama 15 menit berjalan
  terus tanpa layanan penjadwal tambahan dan tanpa rahasia tambahan.
- Untuk memeriksa sekali ambil, jalankan manual dengan `putaran: 1`.
- Karena itu, snapshot sering lebih tua daripada batas 45 menit yang
  diterapkan aplikasi. Bila begitu, lapisan otomatis beralih ke sumber
  langsung (`OpenSky Network`, lalu `adsb.lol`) dan menampilkan umur data apa
  adanya di keterangan lapisan.
- Berkas snapshot disajikan lewat CDN GitHub, bukan langsung dari cabangnya.
  Terukur pada 5 Oktober 2026: `cache-control: max-age=300` dengan `x-cache:
  HIT`, sehingga salinan yang dibaca aplikasi bisa tertinggal sampai lima
  menit dari isi cabang. Umur yang ditampilkan di antarmuka tetap umur data
  di dalam berkas, jadi angka kesegarannya tidak ikut menyesatkan.
- Menjalankan workflow secara manual selalu bisa dilakukan dari tab Actions,
  dan itu memang cara yang andal untuk menyegarkan snapshot saat diperlukan.
- Riwayat cabang `snapshot-flights` selalu berisi satu commit: tiap putaran
  membuat commit tanpa induk lalu mendorongnya dengan paksa, jadi cabang data
  itu tidak menumpuk 96 commit sehari. Karena pohonnya dibangun dari kosong,
  workflow juga menyalin `vercel.json` ke cabang itu. Konfigurasi tersebut
  mencegah Vercel membuat Preview untuk berkas data saja.
- Snapshot sekarang juga menjadi jalur cepat aplikasi: bila umurnya di bawah
  20 menit, ia dibaca lebih dulu dan penyedia langsung tidak dicoba, sehingga
  lapisan tampil dalam ratusan milidetik, bukan setelah 6,2 detik percobaan
  yang berakhir gagal. Di atas 20 menit, penyedia langsung dicoba demi
  kesegaran, dan snapshot tetap disimpan sebagai cadangan bila semuanya gagal.
- Bila kelak tersedia penjadwal luar dengan presisi menit (misalnya layanan
  cron gratis yang memanggil workflow ini), tidak ada perubahan kode yang
  diperlukan: cukup arahkan penjadwal itu ke `workflow_dispatch` dengan
  `putaran: 1`, dan biarkan putaran berantai ini berhenti dengan sendirinya.
