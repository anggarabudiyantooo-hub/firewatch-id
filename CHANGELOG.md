# Riwayat Perubahan

Catatan perubahan yang berarti bagi pengguna atau bagi siapa pun yang memasang
proyek ini. Format tanggal: YYYY-MM-DD (WIB).

## 2026-10-05

**Repositori siap publik**
- Lisensi MIT, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, dan gerbang CI
  yang menjalankan `npm run check` pada setiap push dan pull request.
- Riwayat git dirapikan: 150 menjadi 132 commit, tanpa berkas catatan proses
  internal, dan tanpa tanda pisah panjang pada naskah maupun pesan commit.
- Pemindaian rahasia, perlindungan push, peringatan Dependabot, dan pelaporan
  kerentanan privat aktif pada repositori.

**Ketergantungan diperbarui untuk menutup peringatan keamanan**
- `express` 4.22.3, `body-parser` 1.20.8, `qs` 6.16.0, `moment` 2.31.0, dan
  `playwright` 1.55.1 (khusus pengembangan). `npm audit` bersih.
- Uji ulang sesudah pembaruan: 53 uji bundel dan atmosfer, 180 uji modul
  operasi, serta uji antarmuka papan operasi dan tata letak.

**Panel Siaran dan lapisan lalu lintas udara**
- Panel Siaran pada dock berisi 5 sumber terkurasi (3 resmi, 2 komunitas):
  kamera Merapi BPPTKG, kanal BNPB, kanal MAGMA, serta dua kanal komunitas
  pemantau gunung api. Setiap kartu menyebut pemilik, dasar pemeriksaan, dan
  tidak ada klaim "sedang live"; status siaran diatur sumbernya.
- Pemutar disematkan hanya setelah tombol ditekan, memakai domain
  youtube-nocookie, dan CSP dibuka khusus domain itu. Setiap kartu punya
  tautan keluar sebagai jalur yang selalu bekerja.
- Titik adsb.lol diambil menurut prioritas koridor (Jawa, Sumatra selatan,
  Sulawesi lebih dulu), dan pengambilan titik dihentikan begitu penyedia
  mengembalikan pembatasan laju dua kali, bukan mengulang tujuh titik yang
  sama. Titik yang dilewati dilaporkan sebagai dilewati.
- Jalur snapshot: workflow `flights-snapshot.yml` mengambil snapshot kotak
  Indonesia tiap 15 menit ke cabang `snapshot-flights`, karena dari fungsi
  produksi Vercel koneksi ke OpenSky timeout sedangkan dari runner GitHub
  berhasil. Snapshot lebih tua dari 45 menit ditolak.
- Lapisan peta baru: lalu lintas udara sipil dari jaringan ADS-B publik,
  rute `GET /api/flights`. Dua penyedia dipakai berurutan: OpenSky Network
  (satu permintaan untuk seluruh kotak Indonesia) dan adsb.lol (tujuh titik
  radius 400 nm). Penyedia kedua diperlukan karena koneksi ke OpenSky
  timeout dari lingkungan produksi Vercel walau berhasil dari jaringan
  pengembang; penyebabnya sekarang ikut dilaporkan di badan balasan. Ada karena abu vulkanik adalah bahaya
  penerbangan. Tidak ada lapisan militer atau jet pribadi, umur data selalu
  ditulis, dan kegagalan sumber tidak pernah berubah menjadi "tidak ada
  pesawat". Kamera komunitas yang berpindah gunung sengaja tidak dipetakan.
- `GET /api/kamera` mengembalikan daftar tersebut; isinya kurasi di repo,
  bukan hasil pengambilan berkala dari YouTube.

**Penjadwal dan tata kelola repo publik**
- `vercel.json` mendaftarkan cron harian bawaan Vercel ke `/api/cron` sebagai
  lantai: data tetap tersegarkan walau seluruh penjadwal luar berhenti.
- Jadwal GitHub `refresh.yml` dirapatkan ke tiap 5 menit. Menit Actions kini
  gratis karena repo publik, dan percobaan yang lebih banyak memperbesar
  peluang jadwal benar-benar dijalankan.
- Dependabot dikonfigurasi mingguan dan dikelompokkan, ditambah templat issue
  dan pull request, serta `CODE_OF_CONDUCT.md`.
- `docs/PENJADWAL.md` diperbarui: alasan menolak job panjang berubah sejak repo
  menjadi publik (bukan lagi soal biaya menit), dan jaring harian Vercel
  didokumentasikan.

## 2026-10-04

**Operations Center (P0 sampai P2 selesai)**
- Papan operasi `/operations`: kesehatan layanan, kesegaran data per sumber,
  alert dari aturan yang dapat diatur, insiden dengan siklus hidup penuh,
  runbook, metrik, dan log audit.
- Alert berasal dari aturan atas keadaan nyata (`source_down`, `data_critical`,
  `api_slow`, `hotspot_cluster`), punya anti-duplikasi, dan dapat berubah
  menjadi insiden. Transisi status yang tidak sah ditolak (409).
- Lembar insiden `/insiden/INC-...`: satu insiden satu alamat, langkah runbook
  dapat ditandai, tautan dalam `?insiden=...` dari papan.
- Diagnosa berbasis bukti: setiap dugaan wajib menyertakan angka pengukuran dan
  runbook terkait; tanpa bukti, hasilnya "belum ada pengukuran", bukan tebakan.
- RBAC opsional VIEWER/OPERATOR/ADMIN lewat env. Tanpa token, aplikasi berjalan
  terbuka dan mengatakannya di halaman.
- Analitik dari riwayat tersimpan: insiden dan alert per hari, MTTR/SLA per
  severity, per kategori, per aturan. Bila belum ada riwayat, halaman menulis
  "belum ada riwayat" dan sengaja tidak menggambar grafik nol.
- Panel infrastruktur berlabel SIMULATED untuk angka yang memang tidak dapat
  diukur dari dalam fungsi serverless; nilai nyata ditandai NYATA.
- Penyimpanan berlapis: Upstash Redis, GitHub Issues, berkas lokal, atau
  memori instance (ephemeral) dengan spanduk peringatan. Kegagalan penyimpanan
  tidak pernah berubah menjadi "tidak ada insiden"; sebabnya ditampilkan.
- `GET /api/alarm` (200/503) untuk monitor luar, terpisah dari penjadwal.
- Dokumentasi: `docs/PENYIMPANAN.md`, `docs/PENJADWAL.md`, `docs/OPS-AUDIT.md`.

**Kesalahan yang diperbaiki bersama rilis ini**
- Rebutan tulisan antara mesin alert dan operator menghasilkan dua insiden
  ber-ID sama; kini ada kunci baca-ubah-tulis dan nomor insiden menolak ID
  yang sudah terpakai.
- Insiden yang baru dibuat dari alert lama tidak tampil di daftar 12 teratas
  karena urutannya memakai waktu deteksi; kini ada `?sort=activity`.
- Panel yang gagal memuat tidak lagi berbunyi "memuat..." selamanya.

## 2026-10-03

- Peta: kontrol zoom, pusatkan ke lokasi, dan layar penuh dikembalikan dan
  berfungsi (sebelumnya hilang saat API tidak tersedia).
- Penanda jam mengikuti jam server, bukan jam perangkat.
- Performa: bobot gzip halaman utama 22,8 KB; `app.js` 60,6 KB; `app.css` 14,3 KB.
- Kesiapan publik: nomor darurat 112, rujukan resmi, dan penyangkalan di
  halaman, bukan hanya di footer.

## 2026-10-02

- Tampilan enam panel dock diselaraskan dengan dokumen audit desain v3
  (taksonomi `.listrow`, `.card`, `.chips`), bukan tambalan CSS di atas kelas
  baru.

## 2026-09-30

- Versi pertama yang tayang: peta interaktif Indonesia, titik api NASA FIRMS,
  sebaran asap dari medan angin NOAA GFS, kualitas udara CAMS, gempa BMKG,
  buletin tsunami NOAA PTWC, pengungsi BNPB, abu vulkanik PVMBG, dan atribusi
  konsesi Global Forest Watch.

---

Berkas ini menggantikan catatan alih tugas internal yang sebelumnya ada di
repositori. Riwayat teknis yang lebih rinci tetap tersedia lewat `git log`.
