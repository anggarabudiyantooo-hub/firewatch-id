# Eksplorasi refactor dashboard clean UI

Tanggal: 2026-11-04

## Rute dan aset

- `/dashboard` dan `/dashboard/` dilayani `server.js` melalui `sendIndex()`.
- Sumber HTML: `public/index.html`.
- Aset dashboard diberi versi cache oleh `renderIndex()` di `server.js`.

## Markup utama

- KPI/ikhtisar: `#statsPanel`.
- Peta: `#mapCard`, `#mapWrap`, `#map`.
- Inspector: `.side-stack.inspector` dengan tab Perhatian, Lapisan, Tampilan.
- Panel Lapisan: `#p-lapisan`.
- Kontrol layer memakai ID: `lyVolcano`, `lyFire`, `lyPm25`, `lyAod`, `lyDust`, `lySmoke`, `lyRegionalHaze`, `lyAerosol`, `lyImpact`, `lyAsh`, `lyAir`, `lyWind`, `lyQuake`, `lyShelter`, `lyConc`, `lyFlights`.
- Kontrol pendukung: `windLevel`, `colorSel`, `confSel`, `frpSel`, `airAqiSel`, `baseSel`, `himaSel`, dan kontrol Sentinel di tab Tampilan.
- Dock bawah: `#dock`, 8 tab: Linimasa, Kejadian, Wilayah, Berita, Atribusi, Bahaya, Sumber, Siaran.
- Metodologi tertanam di tab Sumber: blok "Memahami data ini" dan "Sumber data & batasan".
- Windy: `#daftarWindy`, `#windyMeta`.
- Footer: `.foot`, saat ini disembunyikan oleh CSS.

## CSS

- `public/app.css`: gaya dasar, KPI, dock, layer, legenda, responsif.
- `public/v3-fix.css`: override penting; menyembunyikan `#ctlRow`, SVG skematik, footer; memulihkan peta Leaflet.
- `public/v3-audit.css`: gaya tambahan untuk kartu, hazard, status, dan sumber.

## JavaScript

- `public/app.js`: binding layer, load data, render legenda/hint/status, Windy, layout, AI, shortcut terkait.
- `public/v3-ui.js`: tab inspector, dock, subtab, dan peta SVG prototipe yang sudah disembunyikan oleh CSS.
- `public/i18n.js`: kamus ID/EN dan MutationObserver untuk teks/atribut.
- `public/assistant-widget.js`: widget AI tambahan.

## Tes dan batasan

- Banyak tes memeriksa HTML/ID secara statis: `test-smoke-mode-interaction.js`, `test-webcams.js`, `test-kamera.js`, `test-i18n.js`, `check-bundle.js`.
- Tidak ada script build/lint terpisah; gerbang utama adalah `npm run check`.
- ID kontrol dan fungsi existing harus dipertahankan agar binding `app.js` tidak rusak.
- Disclaimer, nomor 112, tautan BMKG/BNPB/PVMBG, atribusi, dua bahasa, layout save/export/reset, shortcut F1-F8, dan AI harus tetap tersedia.

## Rencana perubahan

1. Komponen tooltip aksesibel + ikon info.
2. Refactor panel Lapisan menjadi accordion ringkas dengan segmented mode asap/aerosol.
3. Progressive disclosure untuk konfigurasi layer, strip ikhtisar, dan legenda pojok peta.
4. Dock bawah default tertutup, Windy nonaktif disembunyikan.
5. Metodologi dipindah ke halaman Tentang data.
6. Polesan visual, skeleton, safety bar ringkas, dan verifikasi.
