# Berkontribusi

Terima kasih sudah menyempatkan waktu. Proyek ini alat bantu publik untuk
pemantauan bencana, jadi dua hal yang paling dihargai: **kejujuran angka** dan
**ketahanan saat sumber hulu bermasalah**.

## Menjalankan di komputer sendiri

```bash
npm ci
cp .env.example .env      # opsional; tanpa kunci pun aplikasi jalan
npm start                 # http://localhost:3000
npm run check             # gerbang wajib sebelum mengirim perubahan
```

`npm run check` menjalankan empat gerbang, seluruhnya tanpa jaringan: gaya
naskah (`scripts/check-style.js`), bundel aset, modul atmosfer, dan modul
Operations Center. Untuk perubahan pada halaman ops, uji antarmuka terpisah
dijalankan dengan peramban karena tidak dapat ikut di gerbang ini.

## Aturan yang dipegang proyek ini

1. **Jangan menampilkan angka yang tidak terukur.** Bila nilai belum ada,
   tulis "belum terukur" atau `null`, bukan nol yang tampak seperti aman.
2. **Riwayat kosong bukan nol.** Deretan grafik nol hanya sah bila memang ada
   riwayat; kalau belum ada, tulis "belum ada riwayat".
3. **Yang disimulasikan harus berlabel.** Angka perkiraan ditandai SIMULATED
   beserta model yang dipakai.
4. **Rahasia lewat environment variable.** Tidak ada token di kode, berkas
   contoh, atau riwayat commit.
5. **Status sumber apa adanya.** Sumber yang tidak aktif ditulis tidak aktif
   beserta sebabnya bila diketahui.
6. **Jangan menyebut perangkat atau vendor jaringan yang tidak ada.** Proyek
   ini tidak mengoperasikan perangkat jaringan.
7. **Naskah tanpa tanda pisah panjang.** Pakai tanda hubung biasa, titik dua,
   atau tanda kurung. `scripts/check-style.js` menolak em dash dan en dash,
   sekaligus menolak masuknya kembali berkas catatan proses ke repo.

## Alur perubahan

- Satu perubahan, satu tujuan. Sebutkan apa yang diubah dan **bagaimana
  dibuktikan** (perintah uji atau tangkapan layar).
- Sertakan pembaruan dokumentasi bila perilaku, rute, atau env berubah.
- Perubahan pada antarmuka wajib diperiksa pada lebar 390 px (tanpa geser
  samping) dan dengan `prefers-reduced-motion`.
- Bahasa kode dan komentar: Indonesia, ringkas, menjelaskan **mengapa**, bukan
  mengulang apa yang sudah terbaca dari kode.

## Melaporkan masalah

Sertakan: apa yang diharapkan, apa yang terjadi, langkah mengulang, dan
tangkapan layar bila ada. Templat issue dan pull request sudah disediakan dan
memuat pertanyaan yang sama, jadi mengisinya mempercepat penanganan. Untuk
masalah keamanan, ikuti `SECURITY.md`; untuk perilaku, `CODE_OF_CONDUCT.md`.
