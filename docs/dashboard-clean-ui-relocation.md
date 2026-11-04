# Relokasi teks dan konten dashboard

Dokumen ini memetakan konten lama yang dipindahkan pada refactor `refactor/dashboard-clean-ui`.
Tidak ada teks metodologi, disclaimer, atribusi, atau caveat akurasi yang dihapus; semuanya
dipindahkan ke lokasi yang lebih ringkas atau ke halaman `/tentang-data`.

| Konten lama | Lokasi lama | Lokasi baru |
| --- | --- | --- |
| Deskripsi tertanam tiap lapisan | Panel Lapisan, bawah setiap toggle | Tooltip `tip-ly*` dipicu hover, fokus, tekan lama, atau tombol info; sumber tersembunyi `.ui-tip-source` |
| Catatan mode asap: PM2.5 total model, plume indikatif | `#smokeModeNote` di panel Lapisan | Tooltip `tip-smoke-mode`, badge `Model`/`Indikatif` pada baris mode dan legenda aktif |
| Catatan angin 10 m tidak mewakili ketinggian asap | `#windParticlesNote` | Tooltip `tip-lyWind` dan badge `Model` saat lapisan angin aktif |
| Catatan ADS-B tidak lengkap, bukan radar resmi | Panel Lapisan dan panel Sumber | Tooltip `tip-lyFlights`; detail lengkap di `/tentang-data` bagian lalu lintas udara |
| Catatan cakupan klaster plume | Catatan lepas di panel Lapisan | Status lapisan `#plumeCoverageStatus` tetap hidup, tersembunyi saat tidak relevan; caveat di tooltip `tip-smoke-mode` dan `/tentang-data` |
| Catatan aerosol satelit dan atribusi NASA GIBS | Panel Lapisan/Sumber | Tooltip `tip-lyAerosol`; detail dan atribusi di `/tentang-data` |
| Konfigurasi hotspot: warna, keyakinan, min FRP | Selalu tampil di panel Lapisan | Bagian lipat `.layer-config[data-config-for="lyFire"]`, hanya saat titik api aktif |
| Filter AQI | Selalu tampil | Bagian lipat `.layer-config[data-config-for="lyAir"]`, hanya saat kualitas udara aktif |
| Aras angin | Selalu tampil | Bagian lipat `.layer-config[data-config-for="lyWind"]`, hanya saat angin aktif |
| Teks bantuan "Aktifkan layer ..." | Panel konfigurasi | Kontrol disembunyikan sampai lapisan aktif; penjelasan lewat tooltip |
| Ikhtisar panjang | Panel statistik besar | Strip chip ringkas `#statsPanel.kpi-rail` dekat atas peta |
| Legenda tersebar | Beberapa tempat di panel dan peta | Satu legenda pojok peta `#mapLegend`, bisa dilipat, hanya untuk lapisan aktif; badge `Model`/`Indikatif` |
| Delapan panel bawah terbuka bersamaan | Area bawah dashboard | Dock tab `#dock`, default terlipat; satu tab aktif saat dibuka |
| Kartu kamera Windy nonaktif dan teks 403 panjang | Panel Siaran | `#windySection hidden` kecuali ada kamera aktif; penjelasan 403 tetap ada di `/tentang-data` |
| "Memahami data ini" | Dashboard, bawah panel | `/tentang-data`, accordion per topik |
| "Sumber data & batasan" | Dashboard, panel Sumber | `/tentang-data`, accordion per sumber; dashboard hanya kartu tautan `#aboutDataLink` |
| Disclaimer "Bukan peringatan resmi", darurat 112, BMKG/BNPB/PVMBG | Footer dan panel Sumber | Safety bar permanen `.foot.safety-bar`, satu baris; juga ada di `/tentang-data` |
| Misi, darurat, cakupan | Footer terpisah | Safety bar: misi ringkas, darurat 112, cakupan Indonesia WGS84 |
| Atribusi NASA FIRMS, CAMS/ECMWF, Open-Meteo, BMKG, dll. | Panel Sumber dan catatan peta | Tetap di atribusi native peta, tooltip terkait, dan `/tentang-data` |

## Paritas bahasa

Semua teks baru dan tooltip memiliki pasangan ID/EN melalui `public/i18n.js`. Halaman
`/tentang-data` memuat skrip i18n yang sama sehingga pengalih bahasa situs bekerja di sana.

## Fitur yang dipertahankan

- Simpan, export, reset tata letak: `#layoutSave`, `#layoutExport`, `#layoutReset`.
- Pintasan F1-F8 ditangani `public/dashboard-clean.js`; F7 tetap membuka asisten AI.
- Asisten AI tetap dimuat melalui `assistant-widget.js`.
- Semua toggle lapisan tetap memakai id lama sehingga binding `app.js` tidak berubah.
