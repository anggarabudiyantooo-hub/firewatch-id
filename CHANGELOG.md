# Riwayat Perubahan

Catatan perubahan yang berarti bagi pengguna atau bagi siapa pun yang memasang
proyek ini. Format tanggal: YYYY-MM-DD (WIB).

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
