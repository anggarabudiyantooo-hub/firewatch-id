# Sistem Desain — SIAGA ID

Versi 2.0 · 8 September 2026

---

## 1. Asal desain

Tampilan mengikuti templat ekspor Figma Make yang disediakan pemilik proyek: gaya
terminal gelap, monospace, sudut nol, kepala panel bernomor dan berwarna.

Tiga hal **sengaja** dibedakan dari templat, dan alasannya penting:

1. **Grid peta jauh lebih halus.** Di templat, kotak peta kosong sehingga grid pekat
   dan scanline aman dipakai. Di sini ada peta sungguhan; kepekatan aslinya
   mengaburkan titik api dan nama kota. Scanline dihapus sama sekali.
2. **Panel berisi data nyata,** bukan teks pengganti "STANDBY · AWAITING DATA".
3. **Angka dan label mengikuti kenyataan.** Templat menulis "6 topik"; aplikasi ini
   punya 13.

## 2. Palet

| Peran | Nilai | Pemakaian |
|---|---|---|
| `--bg` | `#080b0f` | Latar halaman |
| `--surface` | `#0f1318` | Kartu dan panel |
| `--surface-2` | `#131920` | Kepala panel, bilah metrik |
| `--line` | `#1e2530` | Garis batas |
| `--line-soft` | `#252d38` | Garis sekunder |
| `--line-3` | `#2d3748` | Garis tersier, label sudut peta |
| `--tx` | `#e2e8f0` | Teks utama |
| `--tx-dim` | `#64748b` | Teks sekunder |
| `--tx-faint` | `#334155` | Teks paling redup |
| `--accent` | `#f97316` | Oranye — aksen utama |
| `--accent-red` | `#ef4444` | Merah — darurat |
| `--ok` | `#22c55e` | Hijau — sehat |
| `--warn` | `#eab308` | Kuning — perhatian |
| `--info` | `#3b82f6` | Biru — informasi |
| `--cyan` | `#06b6d4` | Sian — pengungsi |
| `--magenta` | `#a855f7` | Ungu — berita |

**Nada khusus keterbacaan.** Audit menemukan teks keterangan berkontras 1,71:1 pada
8 px. Warna berikut menggantikannya di seluruh teks informatif:

| Nilai | Rasio | Pemakaian |
|---|---|---|
| `#94a3b8` | ~6,9:1 | Teks sekunder, label, legenda, catatan |
| `#cbd5e1` | ~11:1 | Catatan di dalam panel berlatar terang |
| `#f87171` `#fb923c` `#facc15` `#22d3ee` | ≥4,5:1 | Sub-teks metrik berwarna |

## 3. Tipografi

JetBrains Mono di seluruh antarmuka. Dasar 12 px / 1,5.

| Elemen | Ukuran | Catatan |
|---|---|---|
| Merek | 16 px, 700 | |
| Angka metrik | 20 px, 700 | |
| Kepala panel | 10–11 px, 700, `letter-spacing .1em`, kapital | |
| Teks isi | 12 px | |
| Label dan keterangan | 11 px | **Batas bawah** untuk teks informatif |
| Label sudut peta | 10 px | Dekoratif |

Aturan yang dipegang: **tidak ada teks informatif di bawah 11 px**. Templat memakai
8 px; pada layar sungguhan itu tidak terbaca.

## 4. Tata letak

```
┌─────────────────────────────────────────────────────────┐
│ TOPBAR (lengket)  merek · jam WIB/UTC · LIVE · REFRESH   │
├─────────────────────────────────────────────────────────┤
│ TICKER berjalan (terpotong overflow:hidden)              │
├─────────────────────────────────────────────────────────┤
│ 8 KARTU METRIK — grid 8 kolom, tinggi seragam            │
├─────────────────────────────────────────────────────────┤
│ BARIS KONTROL                                            │
│   ┌───────────────────────────────────────────────────┐ │
│   │ LAYER PETA — satu kartu selebar halaman, 9 chip   │ │
│   └───────────────────────────────────────────────────┘ │
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────────┐ │
│   │LINIMASA│ │ CITRA  │ │  PETA  │ │  KONFIGURASI     │ │
│   │  ASAP  │ │SATELIT │ │ DASAR  │ │  HOTSPOT         │ │
│   └────────┘ └────────┘ └────────┘ └──────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ PETA INTERAKTIF — lebar penuh                            │
├─────────────────────────────────────────────────────────┤
│ 01 Kejadian aktif   │ 02 Analisis wilayah   (1fr / 2fr)  │
├─────────────────────┼───────────────────────────────────┤
│ 03 Kueri data       │ 04 Berita             (1fr / 1fr)  │
├─────────────────────────────────────────────────────────┤
│ 05 · 06 · 07 · 08 · 09 · 10 — panel lebar penuh          │
├─────────────────────────────────────────────────────────┤
│ FOOTER  MISI · 112 · FUNGSI CEPAT F1–F8 · CAKUPAN        │
└─────────────────────────────────────────────────────────┘
```

### Aturan baris kontrol

Isi kartu **membungkus**, tidak digulir menyamping. Ini pelajaran dari dua percobaan
sebelumnya: susunan apa pun yang menggulir isinya pasti menyembunyikan kendali.
Tinggi kartu menyesuaikan isi, sehingga tidak ada satu pun kendali terpotong pada
lebar berapa pun.

Diverifikasi 320–1920 px: chip lapisan 9/9 dan kelompok konfigurasi 4/4 terlihat
penuh di semua lebar.

### Panel bergulir

Panel 09 (2.394 px) dan 10 (1.591 px) dulu mendorong halaman jauh ke bawah. Keduanya
kini satu kolom di dalam wadah `.pscroll` setinggi 340 px. Batas sama berlaku pada
daftar unit lahan, grid SO₂, panel status, dan seluruh pane tab.

Halaman: 9.370 px → ~4.400 px.

## 5. Komponen

| Komponen | Kelas | Catatan |
|---|---|---|
| Kartu metrik | `.stat` | Label, angka, sub-teks berwarna per kategori |
| Kartu kontrol | `.ctlbox` | Kepala berwarna + isi membungkus |
| Chip kotak-centang | `.chk` | Input 24×24 px, seluruh label dapat diklik |
| Tombol tab | `.tab` | Roving tabindex, navigasi panah |
| Panel | `.panel` | Kepala bernomor `.pnum` + chevron |
| Catatan panel | `.pane-note` | Menjelaskan pemotongan atau keadaan data |
| Keadaan kosong | `.hz-empty`, `.empty` | Membedakan "memang kosong" dari "gagal" |
| Fungsi cepat | `.fkey` | F1–F8, benar-benar melompat ke panelnya |

### Warna per panel

`#eventsPanel` merah · `#attrSection` oranye · `#statusPanel` hijau · `#so2Panel`
kuning · `.panel-ask` sian · berita ungu.

## 6. Keadaan

Setiap tampilan data wajib membedakan empat keadaan. Ini bukan estetika — pada
dasbor bencana, "tidak ada kejadian" dan "gagal memuat" berkonsekuensi sangat
berbeda.

| Keadaan | Tampilan |
|---|---|
| Memuat | Kerangka `.skel`, teks `—` |
| Berhasil | Angka dan keterangan |
| Kosong sah | Teks eksplisit, mis. "nihil · terakhir 14 hari lalu" |
| Gagal | Kerangka dilepas, teks `gagal`, lencana merah, pesan `#notice` |

Panel pengungsi menunjukkan pola ini paling jelas: saat nihil, panelnya tidak
disembunyikan diam-diam melainkan menampilkan blok NIHIL yang menerangkan datanya
memang kosong dan kapan terakhir ada pengungsi. Lapisan petanya dinonaktifkan
otomatis, dan menyala sendiri begitu BNPB melaporkan pengungsi baru.

## 7. Aksesibilitas

| Aspek | Keadaan |
|---|---|
| Kontras | ≥4,5:1 pada 31 selektor, diukur dengan latar efektif setelah lapisan semi-transparan dikomposit |
| Ukuran teks | ≥11 px untuk seluruh teks informatif |
| Target sentuh | ≥24×24 px, nol pelanggaran |
| Keyboard | Roving tabindex; `ArrowLeft` `ArrowRight` `Home` `End` pada kedua tablist |
| ARIA | Setiap `tabpanel` menyebut tab pengendalinya lewat `aria-labelledby` |
| Skip link | Ada dan berfungsi |
| Cincin fokus | 2 px `#3b82f6`, terlihat |
| Hierarki heading | h1 → h2 → h3 tanpa lompatan |
| Live region | `aria-live="polite"` pada ringkasan dan legenda |
| Gerak | `prefers-reduced-motion` menghentikan ticker dan partikel angin |
| Bahasa | `<html lang="id">` |

**Belum tuntas:** pengujian dengan pembaca layar sungguhan (NVDA, JAWS, VoiceOver)
dan peninjauan `role="application"` pada peta.

## 8. Responsif

| Titik henti | Perilaku |
|---|---|
| ≥1101 px | Baris kontrol dua tingkat; panel berpasangan |
| 769–1100 px | Kartu kontrol membungkus; panel satu kolom |
| ≤768 px | Tiap kartu kontrol satu baris penuh; peta `min-height: 60vh` |

Nol geser samping pada 320, 375, 768, 1024, 1280, 1600, dan 1920 px.

**Tinggi peta diuji dengan sapuan langkah 10 px**, bukan titik henti
terpilih. Sebuah regresi pernah membuat peta runtuh ke tinggi nol pada
rentang 721–768 px — celah antara dua angka breakpoint yang berbeda di
berkas yang sama. Pengujian pada titik standar hampir melewatkannya
karena rentang itu tetap lolos pemeriksaan geser samping.

Satu pelajaran mahal: `.sr-only` dengan `position:absolute` tanpa induk
ber-*containing block* diposisikan relatif terhadap halaman. Label selebar 1 px dapat
memperlebar dokumen 219 px. Kelompok kendali kini menjadi containing block.
