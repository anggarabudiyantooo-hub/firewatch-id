# Kebijakan Keamanan

## Melaporkan kerentanan

Jangan membuka issue publik untuk masalah keamanan. Hubungi pemilik repositori
lewat pesan pribadi di GitHub (profil `anggarabudiyantooo-hub`) dan sertakan
langkah mengulang. Konfirmasi akan diberikan dalam beberapa hari.

## Cakupan

Repositori ini adalah aplikasi web tanpa akun pengguna dan tanpa basis data.
Yang perlu diperhatikan:

- **API Operations fail-closed.** Tanpa `OPS_TOKEN_*` atau `OPS_WRITE_TOKEN`,
  endpoint data operasional yang dilindungi menolak baca dan tulis (503).
  Pembacaan memerlukan VIEWER, perubahan insiden OPERATOR, dan evaluasi ADMIN.
  `OPS_READ_PROTECTED` sudah usang dan diabaikan.
- **Cron production wajib rahasia.** `/api/cron` menolak permintaan di production
  bila `CRON_SECRET` belum dipasang; bila ada, hanya menerima
  `Authorization: Bearer` dan tidak menerima rahasia di query string.
- Dua endpoint publik yang dibatasi: `/api/operations/access` untuk petunjuk
  setup tanpa nilai token, dan `/api/alarm` untuk ringkasan kesehatan tanpa
  detail insiden, alert, audit, atau penyimpanan.
- Endpoint diagnostik Sentinel hanya menerima `DEBUG_KEY` lewat header Bearer;
  rahasia di query string tidak diterima.
- **Penyimpanan insiden dapat berupa layanan pihak ketiga** (Upstash, GitHub
  Issues). Kunci disimpan di environment variable, tidak pernah di repositori.
- **Sumber data hulu diperlakukan sebagai masukan yang tidak dipercaya.**
  Judul berita dan teks dari sumber eksternal hanya ditampilkan sebagai teks,
  tidak dieksekusi.

## Yang sudah dijamin lewat uji

- Tidak ada token atau kunci di berkas yang terlacak git (`.env` diabaikan).
- Perbandingan token akses memakai digest SHA-256 berukuran tetap dan `timingSafeEqual`; token panel hanya disimpan di `sessionStorage` tab aktif.
- Balasan galat tidak pernah memuat nilai token; hanya nama variabel yang
  diperiksa dan apakah ia terlihat pada deployment tersebut.
