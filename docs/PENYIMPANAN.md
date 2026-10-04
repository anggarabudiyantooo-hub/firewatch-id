# Penyimpanan operasional: memasang yang tetap

Panduan singkat untuk berpindah dari `ephemeral` (memori instance — data hilang
saat instance didaur ulang) ke penyimpanan tetap. Ditulis 4 Okt 2026, setelah
mode GitHub benar-benar dijalankan dan diuji dari ujung ke ujung.

## Jawaban singkat: perlu Neon?

**Tidak.** Tiga alasan yang konkret, bukan soal selera:

1. **Kebutuhan datanya kecil dan berbentuk dokumen tunggal.** Seluruh keadaan
   operasional (insiden + alert + log audit) adalah satu JSON berukuran puluhan
   kilobita. Tidak ada relasi yang perlu di-join, tidak ada kueri berpola, tidak
   ada indeks yang perlu dirawat.
2. **Adapternya sudah ada dan sudah diuji.** `lib/ops-store.js` memilih mode
   `upstash` → `github` → `file` → `ephemeral`, dan antarmuka
   `/api/operations/store` menyatakan modenya apa adanya. Keduanya bisa dipasang
   **hari ini** dengan menambah variabel lingkungan, tanpa mengubah satu baris
   kode aplikasi.
3. **Neon menambah lapisan baru**: dependensi pengandar (`@neondatabase/serverless`
   atau `pg`), skema + migrasi, pengelolaan koneksi, dan satu titik gagal lagi —
   semuanya untuk data yang muat di satu dokumen.

Neon/SQL baru masuk akal bila nanti ada kebutuhan yang memang butuh kueri
relasional atau volume besar, misalnya **analitik jangka panjang** (riwayat
insiden lintas bulan dengan agregasi) atau penyimpanan **log audit** yang jauh
melampaui 200 entri. Bila saat itu tiba, langkahnya jelas dan terbatas: tambah
mode `neon` di `lib/ops-store.js` dengan antarmuka `read()`/`write()` yang sama,
lalu tabel `ops_state(doc jsonb)` — sisanya tidak perlu berubah.

## Pilihan yang tersedia sekarang

| Mode | Perlu akun baru? | Tahan daur ulang instance? | Batas nyata | Paling cocok untuk |
|---|---|---|---|---|
| `upstash` (Redis REST) | Ya (gratis) | Ya | kuota perintah/hari (gratis: 10.000/hari) | pemasangan yang ingin penyimpanan bersama dengan tulisan cepat |
| `github` (Issues) | **Tidak** — repo + token yang sudah ada | Ya | badan issue ≤ 60 KB (pemangkasan dicatat), satu penulis pada satu waktu | pemasangan kecil, tim yang ingin riwayat perubahannya terlihat manusia |
| `file` | Tidak | Hanya di lokal | berkas tunggal | pengembangan |
| `ephemeral` | Tidak | **Tidak** | memori satu instance | demo; spanduk peringatan muncul di halaman |

Catatan jujur tentang mode `github`: penyimpanannya adalah **satu issue**
berlabel `ops-state` yang badannya diperbarui setiap kali. Artinya
penulisan bersamaan bersifat *yang terakhir menang*, dan setiap perubahan
terlihat di tab History issue itu. Untuk papan operasi satu tim, itu memadai —
tetapi ia bukan basis data dan tidak boleh diperlakukan seperti basis data.

## Opsi A — GitHub (tanpa akun baru)

Repo yang dipakai saat ini: `anggarabudiyantooo-hub/firewatch-id` (**privat**).

1. Siapkan token. Token yang sudah dipakai untuk `git push` **cukup** (sudah
   diuji). Untuk prinsip hak-minimal, lebih baik token baru khusus:
   GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate
   → Repository access: *Only select repositories* → `firewatch-id`
   → Permissions: **Issues: Read and write** (+ Metadata: Read, wajib bawaan)
   → Generate. Catat tanggal kedaluwarsanya.
2. Vercel → proyek `firewatch-id` → **Settings → Environment Variables**.
3. Tambahkan dua variabel (Environment: Production, Preview juga bila mau):

   | Nama | Nilai |
   |---|---|
   | `OPS_GITHUB_TOKEN` | token dari langkah 1 (tempel, jangan disimpan di berkas repo) |
   | `OPS_GITHUB_REPO` | `anggarabudiyantooo-hub/firewatch-id` |

4. **Redeploy** (Deployments → … → Redeploy). Variabel lingkungan baru hanya
   terbaca oleh fungsi setelah deploy ulang.
5. Verifikasi: `python3 work/verifikasi_penyimpanan.py` — mode harus berubah
   menjadi `github`. Untuk membuktikan datanya benar-benar bertahan:
   `python3 work/verifikasi_penyimpanan.py --tulis` (membuat satu insiden uji,
   membacanya ulang, lalu menutupnya; insidennya tidak dihapus).
6. Issue keadaan: dibuat otomatis saat penulisan pertama, berjudul
   `[ops] Keadaan operasional SIAGA.ID`, berlabel `ops-state`. Pada pemasangan
   ini issue tersebut sudah dibuat saat uji pemasangan (nomor **#1**) dan
   keadaannya **sengaja dikosongkan**, sehingga produksi mulai dari nol yang
   bersih, bukan dari data uji.

Yang membuat mode ini tahan jeda indeks GitHub (dua cacat nyata yang ditemukan
saat pemasangan, sudah diperbaiki): pencarian issue memakai daftar berlabel
langsung dari repo (bukan `/search/issues` yang punya jeda indeks dan bisa
membuat **issue keadaan kedua**), dengan satu percobaan ulang setelah 1,2 detik
bila daftarnya masih kosong; dan `state=all` agar issue yang tertutup tidak
dianggap hilang.

## Opsi B — Upstash Redis (lebih cepat, perlu akun gratis)

1. Cara termudah lewat Vercel: **Integrations / Marketplace → Upstash → Create
   Database** lalu sambungkan ke proyek ini. Integrasi ini menyuntikkan
   `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` **sendiri**, jadi
   langkah 2–3 di bawah tidak perlu.
2. Cara manual: [console.upstash.com](https://console.upstash.com) → Create
   Database (region terdekat, mis. `ap-southeast-1`) → tab **REST API** → salin
   `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`.
3. Vercel → Settings → Environment Variables → tambahkan keduanya.
4. Redeploy, lalu verifikasi dengan perintah yang sama seperti Opsi A.

Bila **keduanya** terpasang, urutan deteksi `upstash` → `github` membuat Upstash
yang dipakai. Itu disengaja: Upstash lebih cepat dan tidak punya batas 60 KB.

## Hal yang perlu diketahui setelah penyimpanan tetap aktif

- **Peran akses (RBAC) jadi lebih penting.** Tanpa `OPS_TOKEN_*`, papan berjalan
  dalam mode terbuka dan siapa pun yang menjangkau server dapat mengubah insiden
  yang sekarang tersimpan permanen. Lihat tabel peran di README.
- **Log audit ikut tersimpan** (200 entri terakhir). Itu memang tujuannya:
  jejak "siapa mengubah apa" harus bertahan lebih lama daripada satu instance.
- **Insiden lama dari mode sementara tidak berpindah.** Yang tersimpan hanyalah
  apa yang ditulis setelah mode baru aktif. Keadaan pada issue #1 sengaja
  dikosongkan.
- **Kembali ke perilaku sebelumnya**: hapus kedua variabel lalu redeploy. Tidak
  ada perubahan data di repo yang perlu dibatalkan.

## Memeriksa bila ada yang tidak beres

```bash
curl -s https://firewatch-id.vercel.app/api/operations/store | python3 -m json.tool
```

- `mode` menyatakan mode yang benar-benar dipakai, dan `lastError` memuat galat
  terakhir dari penyimpanan (mis. `github_401_...` bila token tidak sah) —
  galat penyimpanan **tidak** pernah disembunyikan, dan tidak menjatuhkan
  halaman.
- `github_403` → token tidak punya izin *Issues: write*.
- `github_404` → `OPS_GITHUB_REPO` salah tulis, atau token tidak diberi akses ke
  repo itu (repo ini privat).
- Bila mode tetap `ephemeral` padahal variabel sudah diisi: hampir selalu karena
  **belum redeploy**.
