# PRD: SIAGA ID (Terminal Bencana)

| | |
|---|---|
| **Versi** | 2.0 |
| **Tanggal** | 8 September 2026 |
| **Status** | Beta publik, belum direkomendasikan sebagai rujukan darurat |
| **Produksi** | <https://firewatch-id.vercel.app> |

---

## 1. Latar belakang

Informasi bencana di Indonesia tersebar di banyak lembaga yang masing-masing punya
kanal sendiri. PVMBG menerbitkan status gunung api di MAGMA, BMKG menerbitkan gempa
di kanal terpisah, BNPB menerbitkan data pengungsi lewat layanan GIS, dan titik api
karhutla hanya tersedia dari satelit NASA. Tidak ada satu tampilan yang menjawab
pertanyaan paling dasar seorang warga: **"apa yang sedang terjadi sekarang, dan
apakah menyangkut daerah saya?"**

Masalah kedua lebih halus tetapi lebih berbahaya. Dasbor kebencanaan yang ada
cenderung menampilkan angka tanpa menyatakan batasnya: data berumur dua hari
disajikan seolah keadaan sekarang, status kewaspadaan dibaca sebagai kejadian, dan
hasil pemodelan disamakan dengan pengukuran. Pada perangkat yang dipakai orang untuk
memutuskan apakah harus mengungsi, kekeliruan semacam ini berkonsekuensi nyata.

## 2. Masalah yang dipecahkan

1. **Fragmentasi.** Warga harus membuka lima situs berbeda untuk memperoleh gambaran
   utuh.
2. **Ketiadaan konteks waktu.** Angka ditampilkan tanpa keterangan kapan datanya
   direkam.
3. **Kekaburan status dan kejadian.** "Gunung X berstatus Siaga" kerap dibaca sebagai
   "Gunung X sedang meletus".
4. **Tanggung jawab karhutla yang tidak terpetakan.** Titik api ditampilkan tanpa
   keterangan lahan siapa yang terbakar.
5. **Kegagalan yang tidak kelihatan.** Dasbor yang gagal memuat data tampak sama
   dengan dasbor yang melaporkan keadaan aman.

## 3. Pengguna sasaran

| Pengguna | Kebutuhan utama | Yang mereka lakukan dengan data ini |
|---|---|---|
| **Warga terdampak** | Jawaban cepat: aman atau tidak | Memutuskan mengungsi, memakai masker, membatalkan perjalanan |
| **Jurnalis** | Angka yang dapat dikutip beserta sumbernya | Menulis laporan, memverifikasi klaim |
| **Relawan dan BPBD daerah** | Sebaran posko, wilayah terdampak | Menyalurkan bantuan, menentukan prioritas |
| **Peneliti dan LSM lingkungan** | Atribusi lahan, riwayat titik api | Advokasi, penegakan akuntabilitas |
| **Pendidik dan pelajar** | Penjelasan cara membaca data | Belajar kebencanaan |

## 4. Lingkup

### Termasuk

- Pemantauan lima jenis bencana: gunung api, gempa, tsunami, pengungsi, karhutla
- Cakupan seluruh Indonesia (bbox `94,5-141,5°BT` / `11,5°LS-6,5°LU`)
- Peta interaktif sembilan lapisan dengan tiga peta dasar dan citra satelit Himawari
- Sepuluh panel analisis, termasuk kueri berbasis indeks lokal
- Atribusi lahan terhadap konsesi sawit, HTI, tambang, dan RSPO
- Agregasi berita 13 topik, termasuk lima edisi negara tetangga
- Penyegaran otomatis dengan interval mengikuti irama penerbitan tiap sumber

### Tidak termasuk

- Peringatan dini resmi, itu kewenangan BMKG dan PVMBG
- Notifikasi push atau berlangganan
- Akun pengguna, autentikasi, dan data per-pengguna
- Data historis jangka panjang atau analisis tren tahunan
- Aplikasi seluler asli
- Pelaporan kejadian oleh warga (crowdsourcing)

## 5. Keputusan lingkup yang sudah diambil

| Keputusan | Alasan |
|---|---|
| Dari karhutla menjadi bencana umum | Pengguna tidak berpikir per-jenis bencana; mereka bertanya "apa yang terjadi" |
| Panel teratas meringkas **semua** bencana aktif, diurutkan keparahan lintas jenis | Memaksa pembaca memeriksa empat panel terpisah menyulitkan pada saat genting |
| Nama netral **SIAGA ID**, bukan nama berbau karhutla | Cakupan sudah meluas; URL Vercel tetap `firewatch-id` |
| Hanya sumber terbuka, kunci API opsional | Aplikasi harus tetap hidup tanpa konfigurasi apa pun |
| Berita luar negeri dibatasi negara tetangga | Berita AS tentang Indonesia tidak relevan bagi pembaca Indonesia |
| Tanpa penyimpanan di sisi klien | Menghapus seluruh permukaan privasi; konsekuensinya preferensi tidak tersimpan |

## 6. Persyaratan fungsional

### F1: Ringkasan situasi nasional
Delapan kartu metrik: gunung meletus, status Siaga dan Awas, gempa dirasakan, warga
mengungsi, titik api, daerah terdampak asap, titik dalam konsesi, dan udara terburuk.
Tiap kartu menampilkan angka utama dan keterangan pendukung. Sumber yang belum pernah
berhasil dimuat menampilkan `-`, bukan `0`.

### F2: Peta interaktif
Sembilan lapisan yang dapat dinyalakan sendiri-sendiri, tiga peta dasar, lima produk
Himawari, dan linimasa prakiraan asap. Mengeklik titik mana pun menampilkan wilayah
administratif, status lahan, dan kualitas udara di titik tersebut.

### F3: Kejadian aktif lintas jenis
Satu daftar berisi seluruh kejadian dari semua jenis bencana, diurutkan menurut
tingkat keparahan, masing-masing dengan waktu relatif.

### F4: Atribusi lahan
Titik api dipetakan ke batas konsesi GFW, dikelompokkan per unit lahan dan grup
korporasi. Wajib disertai keterangan ukuran sampel dan penyangkalan kausalitas.

### F5: Berita
Tiga belas topik dari Google Berita RSS, disaring gerbang relevansi kebencanaan,
diberi skor, dan dibuang duplikatnya. Tiap artikel menampilkan penerbit, usia terbit,
dan jam WIB.

### F6: Kueri data
Pertanyaan bahasa alami dijawab dari indeks lokal yang disusun dari data dasbor
sendiri. Tanpa layanan LLM eksternal.

### F7: Transparansi sumber
Panel status menampilkan umur tiap sumber dan apakah penyegaran terakhirnya berhasil.
Panel sumber menjelaskan asal data beserta keterbatasannya.

## 7. Persyaratan non-fungsional

| Aspek | Target | Keadaan saat ini |
|---|---|---|
| Muat awal | < 1,5 detik | ~500 ms |
| Payload awal | < 500 KB | ~1,5 MB *(belum tercapai)* |
| Waktu re-render filter | < 200 ms | ~1,1 detik *(belum tercapai)* |
| Kesegaran data | Gempa 2 menit; titik api dan berita 10 menit; pengungsi dan gunung api 30 menit; status PVMBG 3 jam | tercapai |
| Kegagalan terlihat | ≤ 15 detik | 12 detik |
| Kontras teks | ≥ 4,5:1 pada ≥ 11 px | tercapai, 31 selektor nol gagal |
| Target sentuh | ≥ 24×24 px | tercapai |
| Geser samping | nol pada 320-1920 px | tercapai |
| Error JavaScript | nol | tercapai |

## 8. Kriteria keberhasilan

1. Seluruh delapan kartu terisi angka nyata dalam 15 detik pada instance hangat.
2. Tidak ada klaim di layar yang melampaui data yang dimiliki, jendela waktu, ukuran
   sampel, dan pemotongan daftar selalu dinyatakan.
3. Nol error JavaScript pada seluruh alur interaksi.
4. Kegagalan sumber mana pun terlihat pengguna dalam 15 detik.
5. Dapat dipakai di jaringan seluler Indonesia, **belum tercapai**, payload masih
   1,5 MB.
6. Lolos WCAG 2.1 AA untuk kontras, ukuran teks, dan target sentuh.

## 9. Risiko

| Risiko | Dampak | Penanganan |
|---|---|---|
| Sumber hulu berubah format | Data hilang senyap | Snapshot cadangan, saringan kesegaran, panel status |
| Kuota pihak ketiga habis | Dasbor gelap saat dibutuhkan | Cache tepi; rate limiting **belum ada** |
| Salah tafsir angka konsesi | Risiko reputasi dan hukum | Metadata sampel dan penyangkalan kausalitas ditampilkan |
| Data dianggap resmi | Keputusan darurat keliru | Penyangkalan di footer dan panel sumber |
| Cold start serverless | Kartu kosong tanpa penjelasan | Batas waktu 12 detik + penanda gagal |

## 10. Hal yang belum diputuskan

- Apakah menyediakan mode sematan resmi (`/embed`) untuk media
- Apakah menyimpan riwayat titik api untuk analisis tren
- Apakah pindah dari Vercel ke platform berbasis proses agar cache tetap hidup
- Apakah menambahkan bahasa Inggris
