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
| **A. Cron eksternal gratis** (mis. cron-job.org) memanggil `/api/cron?key=…` | tinggi (per 5-10 menit) | Rp0 | butuh satu pendaftaran; tidak memakai menit Actions |
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

Bila `CRON_SECRET` dipasang di Vercel, permintaan cron dari Vercel membawa
header `Authorization: Bearer` secara otomatis dan tetap diterima `server.js`.

## 5. Langkah memasang pilihan A (tanpa menyentuh kode)

1. Daftar gratis di cron-job.org → **Create cronjob**.
2. URL: `https://firewatch-id.vercel.app/api/cron?key=<CRON_SECRET>`
   (`CRON_SECRET` adalah nilai yang sudah dipasang di Vercel. Bila memilih
   header, gunakan `Authorization: Bearer <CRON_SECRET>`; keduanya didukung
   `server.js`.)
3. Jadwal: **setiap 10 menit**. Timeout 60 detik. Aktifkan notifikasi surel
   saat gagal.
4. Buat cronjob kedua untuk alarm: `https://firewatch-id.vercel.app/api/alarm`
   setiap 5 menit, dengan notifikasi saat balasan **bukan 200**.

## 6. Alarm yang bisa dipakai monitor apa pun

Sebelumnya alarm hanya ada di dalam `uptime.yml`, yang ikut telat. Sejak
`/api/alarm` ditambahkan, monitor mana pun cukup melihat kode HTTP:

- **200**, normal.
- **503**, ada yang perlu ditangani; isi balasan menyebut *apa*.

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
curl -s https://firewatch-id.vercel.app/api/alarm     # 200 atau 503
curl -s https://firewatch-id.vercel.app/api/status    # ageMs per sumber
curl -s https://firewatch-id.vercel.app/api/data-sources | grep -o '"status":"[A-Z]*"'
```

Umur tiap sumber (`ageMs`) dibandingkan dengan intervalnya sendiri; ambangnya
ditampilkan di halaman (`STALE > 1,5× · CRITICAL > 6×`). Bila GitHub Actions
terlambat lagi, yang berubah hanyalah kesegaran angka, dan itu tertulis apa
adanya, bukan disembunyikan.
