# Riwayat data untuk analitik risiko

Lapisan ini terpisah dari penyimpanan status Operations Center. Tujuannya menyiapkan data historis kecil untuk laporan dan evaluasi risiko, bukan menyimpan ulang seluruh data peta atau melatih LLM.

## MVP dan ukuran penyimpanan

MVP hanya mengambil snapshot hotspot NASA FIRMS dari cache penjadwal yang baru disegarkan. Ia menghitung agregat di memori, lalu menyimpan satu baris per wilayah yang memiliki deteksi: jumlah hotspot, jumlah confidence tinggi, total FRP, rata-rata confidence, jumlah satelit, rentang waktu akuisisi, umur sumber, serta penanda kualitas.

Tidak ada baris per hotspot, koordinat mentah, payload mentah, raster, atau grid yang disalin ke Neon. Koordinat hanya dipakai sementara untuk penetapan wilayah. Maksimum ukuran tabel MVP adalah sekitar 40 rollup per hari: paling banyak 38 provinsi, satu total Indonesia, dan satu kelompok tidak terpetakan. Tabel ingest menyimpan satu baris per sumber per hari. Snapshot harian di-upsert; isinya tidak ditambahkan sebagai baris baru pada setiap cron.

Setiap cron yang memiliki data FIRMS segar menjalankan satu query kecil dan bertparameter. Jika hash isi sama, basis data tidak mengubah baris; update biasa ditahan sampai ada perubahan isi atau enam jam berlalu. `DATABASE_URL` yang kosong berarti tidak ada koneksi. Sumber basi/tidak sehat juga dilewati sebelum query database.

Rollup ini adalah **snapshot jendela bergerak 24 jam pada waktu `captured_at`**, dikelompokkan menurut hari WIB saat snapshot diambil. Itu bukan total pasti untuk satu hari kalender dan tidak boleh diberi label demikian. Baris kosong tidak dibuat untuk hari tanpa deteksi; status `empty_feed_not_zero` tidak boleh diperlakukan sebagai jumlah nol.

Dengan maksimum kira-kira 14.600 rollup dan 365 baris ingest per tahun, volume MVP jauh lebih kecil daripada menyimpan setiap deteksi satelit. Besaran byte sebenarnya bergantung pada overhead PostgreSQL dan indeks; angka ini estimasi jumlah baris, bukan jaminan kuota penyedia. Tabel generik outcome/prakiraan/run model disediakan untuk pengembangan berikutnya, tetapi saat ini pipeline tidak mengisinya.

## Buat database

1. Buat database PostgreSQL di Neon pada region yang dekat dengan fungsi aplikasi.
2. Simpan connection string sebagai `DATABASE_URL` di environment server saja. Jangan memasukkannya ke Git, HTML, JavaScript peramban, atau chat.
3. Terapkan skema dari root repo:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001-ai-history.sql
   ```

   Migration memakai `CREATE ... IF NOT EXISTS` dan tidak menghapus data. Jalankan lebih dulu pada branch database non-production bila tersedia.
4. Tambahkan `DATABASE_URL` di environment server yang sesuai dan rilis kode melalui alur yang disetujui. Jangan mengirim secret ke asisten.
5. Setelah migration dan kode tersedia serta `CRON_SECRET` dan penjadwal yang ada berjalan, respons berizin dari `/api/cron` menyertakan ringkasan `aiHistory`. Jangan jalankan cron produksi untuk uji coba tanpa rencana yang aman.

Driver Neon memakai HTTP serverless. Nilai agregat dikirim sebagai satu parameter JSONB. Batas waktu database 12 detik. Pesan galat mentah dan connection string tidak diteruskan ke respons.

## Provenance dan batas data

- `fire_daily_rollups` berisi agregat snapshot, bukan event satelit individual.
- `region_assignment_method` menyebut kotak provinsi aplikasi yang kasar. Ini bukan batas administrasi otoritatif.
- Ingest hanya menerima sumber berlabel `live`, sehat, dan berumur tidak lebih dari dua interval jadwal dengan batas minimum 20 menit. Data basi, tidak sehat, tidak valid, dan duplikat tidak menjadi rollup lengkap.
- Snapshot parsial tetap diberi label `partial`; baseline musiman mengecualikannya.
- View `v_fire_daily_region` menyediakan bulan, hari dalam tahun, dan hari dalam minggu WIB. Sistem tidak menetapkan satu kalender musim hujan/kemarau nasional karena pola musim berbeda menurut wilayah.
- Pengungsi tetap berupa agregat, tanpa koordinat shelter atau data pribadi. Raster/cuaca grid besar tidak disalin ke Neon.

## Kesiapan prediksi

`lib/ai-history.js` menyediakan fitur kalender dan baseline musiman sederhana untuk eksperimen terkontrol. Secara default baseline menolak hasil kecuali tersedia sedikitnya tiga tahun data sebelumnya, 20 sampel pada jendela kalender yang sama, dan rasio cakupan terverifikasi minimal 90 persen. Pemanggil harus memberikan rasio cakupan yang dibuktikan dari pemeriksaan sumber; nilai tidak boleh ditebak dari jumlah event.

Baseline tersebut bukan ML terlatih, bukan probabilitas terkalibrasi, dan bukan peringatan resmi. Snapshot 24 jam bergerak juga bukan total harian kalender. Baseline belum dihubungkan ke API pengguna dan belum ada model yang dilatih karena riwayat serta outcome terverifikasi belum tersedia. Tahap ML berikutnya harus memakai pemisahan waktu / walk-forward, dibandingkan dengan baseline musiman, dan dinilai per hazard/wilayah sebelum hasil ditampilkan atau memicu tindakan.

Prediksi gempa tepat waktu/lokasi/magnitudo tidak dijanjikan. AI tidak memberi nasihat medis, tidak menyimpulkan kausalitas dari overlap lahan, dan tidak mengirim tindakan evakuasi secara otomatis.
