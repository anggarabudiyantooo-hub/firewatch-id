# Kebijakan Keamanan

## Melaporkan kerentanan

Jangan membuka issue publik untuk masalah keamanan. Hubungi pemilik repositori
lewat pesan pribadi di GitHub (profil `anggarabudiyantooo-hub`) dan sertakan
langkah mengulang. Konfirmasi akan diberikan dalam beberapa hari.

## Cakupan

Repositori ini adalah aplikasi web tanpa akun pengguna dan tanpa basis data.
Yang perlu diperhatikan:

- **Endpoint operasional bersifat publik sebagai bawaan.** Bila pemasangan
  Anda privat, pasang `OPS_READ_PROTECTED=1` dan token peran
  (`OPS_TOKEN_VIEWER`/`OPERATOR`/`ADMIN`). Tanpa itu, halaman akan menyatakan
  mode terbuka apa adanya.
- **Penyimpanan insiden dapat berupa layanan pihak ketiga** (Upstash, GitHub
  Issues). Kunci disimpan di environment variable, tidak pernah di repositori.
- **Sumber data hulu diperlakukan sebagai masukan yang tidak dipercaya.**
  Judul berita dan teks dari sumber eksternal hanya ditampilkan sebagai teks,
  tidak dieksekusi.

## Yang sudah dijamin lewat uji

- Tidak ada token atau kunci di berkas yang terlacak git (`.env` diabaikan).
- Perbandingan token akses memakai waktu tetap.
- Balasan galat tidak pernah memuat nilai token; hanya nama variabel yang
  diperiksa dan apakah ia terlihat pada deployment tersebut.
