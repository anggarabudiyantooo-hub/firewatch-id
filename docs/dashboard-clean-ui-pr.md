# PR: refactor/dashboard-clean-ui

## Ringkasan

Refactor UI `/dashboard` menjadi aplikasi peta yang bersih dan minimal: peta dominan,
kontrol ringkas, penjelasan tidak lagi tertanam permanen di bawah kontrol. Metodologi
dipindahkan ke `/tentang-data` tanpa menghapus isi. Disclaimer, darurat 112, dan tautan
sumber resmi tetap terlihat permanen pada safety bar satu baris.

## Tahap commit

1. `d0fdb80` docs: ringkasan eksplorasi struktur dashboard.
2. `d5a7fc6` feat(ui): komponen tooltip dan tombol info.
3. `4c92f65` feat(ui): refactor panel Lapisan menjadi accordion ringkas.
4. `6444200` feat(ui): progressive disclosure konfigurasi, legenda, dan KPI.
5. `ba05006` feat(ui): dock default terlipat dan kamera Windy hanya saat aktif.
6. `b043240` feat(ui): pindahkan metodologi ke halaman Tentang data.
7. Tahap f: safety bar permanen, drawer mobile, skeleton, pintasan F1-F8, polesan visual.

## Perubahan utama

- Panel Lapisan: accordion per kelompok, hanya Api & Asap terbuka default; baris ikon + nama + switch; tooltip hover 400 ms, tekan lama 500 ms, fokus keyboard, tombol info; Esc dan klik luar menutup.
- Mode asap menjadi segmented control satu baris: PM2.5, AOD, Debu, Plume.
- Konfigurasi hotspot, AQI, dan angin muncul hanya saat lapisan terkait aktif.
- Ikhtisar menjadi strip chip ringkas; legenda aktif di pojok peta dengan badge Model/Indikatif.
- Dock bawah default terlipat; satu tab aktif saat dibuka.
- Kartu Windy nonaktif disembunyikan; teks 403 panjang tidak tampil di dashboard.
- Metodologi dan sumber data pindah ke `/tentang-data` sebagai accordion per sumber.
- Safety bar permanen: Bukan peringatan resmi, Darurat 112, BMKG, BNPB, PVMBG, Tentang data, misi, cakupan.
- Skeleton loader menggantikan teks memuat; transisi 180 ms menghormati prefers-reduced-motion.
- Pintasan F1-F8 aktif; F7 tetap membuka asisten AI.

## Uji

- `npm run check` lulus penuh setelah tahap f.
- Uji baru: `test-ui-tooltip`, `test-layer-panel`, `test-progressive-disclosure`, `test-dock-windy`, `test-methodology-page`, `test-visual-polish`.
- Uji manual Playwright: desktop 1440 px, tablet 820 px, mobile 390 px; drawer mobile terbuka ke tab Lapisan; tidak ada galat konsol pada muat dashboard.

## Screenshot

Sebelum:
- `docs/screenshots/dashboard-clean-ui/before-desktop.png`
- `docs/screenshots/dashboard-clean-ui/before-tablet.png`
- `docs/screenshots/dashboard-clean-ui/before-mobile.png`

Sesudah:
- `docs/screenshots/dashboard-clean-ui/after-desktop.png`
- `docs/screenshots/dashboard-clean-ui/after-tablet.png`
- `docs/screenshots/dashboard-clean-ui/after-mobile.png`
- `docs/screenshots/dashboard-clean-ui/after-mobile-drawer.png`

## Relokasi teks

Lihat `docs/dashboard-clean-ui-relocation.md`.

## Catatan blocker

Push ke GitHub dan pembuatan PR otomatis belum dapat dilakukan dari lingkungan ini karena
tidak ada kredensial GitHub yang aman dan konektor GitHub tidak tersedia. Token yang pernah
dikirim di chat tidak digunakan ulang dan tidak disimpan. Alternatif aman:

1. Pengguna menghubungkan akun GitHub atau memberikan akses repo melalui mekanisme resmi, lalu branch ini didorong dan PR dibuat.
2. Pengguna mendorong branch secara manual dari bundle/patch yang disediakan, lalu membuka PR ke `main`.

Preview Vercel juga belum dapat dibuat karena akses konektor Vercel ditolak. Preview lokal
tersedia selama proses server berjalan; setelah branch didorong, preview Vercel dapat dibuat
dari PR atau deployment manual.
