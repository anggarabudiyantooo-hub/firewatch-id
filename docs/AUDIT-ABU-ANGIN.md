# Root Cause Analysis — Arah Angin vs Sebaran Abu Vulkanik

Tanggal audit: 10 September 2026
Ruang lingkup: seluruh jalur data angin dan abu, dari sumber sampai render.

---

## Ringkasan

Keluhan "arah angin dan sebaran abu terlihat tidak konsisten" **valid**, tetapi
penyebabnya bukan pembalikan arah seperti yang biasa dicurigai. Konvensi
meteorologi sudah benar. Penyebab sebenarnya ada tiga, dan dua di antaranya
menghasilkan kesalahan fisik yang nyata.

| # | Temuan | Tingkat |
|---|---|---|
| 1 | Tinggi kolom abu "di atas puncak" diperlakukan sebagai AMSL | **Kritis** |
| 2 | Layer "Aliran angin" memakai angin 10 m, abu memakai 3–10 km, tanpa keterangan | **Tinggi** |
| 3 | Satu nilai angin di titik puncak dipakai untuk seluruh jangkauan pluma | Sedang |
| 4 | Tidak ada penanda observed / forecast / model di antarmuka | Sedang |
| 5 | Pemilihan lapisan tekanan memakai tabel statis, bukan geopotential height | Rendah |

---

## Temuan 1 — Tinggi kolom above-summit diperlakukan sebagai AMSL

**Tingkat:** Kritis
**Berkas:** `lib/volcano.js` baris ~349
**Sumber terkait:** MAGMA Indonesia (PVMBG), Smithsonian GVP

### Perilaku sekarang

```js
const hKm = v.eruption.maxHeightM ? v.eruption.maxHeightM / 1000 : null;
```

`maxHeightM` berasal dari `lib/eruption.js`, yang parsernya secara eksplisit
menangkap frasa **"di atas puncak"**:

```js
text.match(/tinggi\s+kolom\s+abu[^.]*?±?\s*([\d.,]+)\s*m\s+di\s+atas\s+puncak/i)
```

Nilai itu lalu dipakai langsung sebagai ketinggian absolut untuk memilih lapisan
tekanan. Elevasi gunung (`elevM`, tersedia dari GVP) tidak pernah dijumlahkan —
kata kunci `elevM` hanya muncul satu kali di seluruh `lib/volcano.js`, yaitu saat
diambil dari sumber.

### Perilaku yang diharapkan

```
ashTopAMSL = elevasiGunungAMSL + tinggiKolomDiAtasPuncak
```

### Dampak terukur

| Gunung | Elevasi | Kolom | ashTop sekarang | ashTop benar | Lapisan |
|---|---:|---:|---:|---:|---|
| Semeru | 3.657 m | 1.000 m | 1.000 m | **4.657 m** | 3 km → 6 km |
| Semeru | 3.657 m | 2.000 m | 2.000 m | **5.657 m** | 3 km → 6 km |
| Merapi | 2.910 m | 2.000 m | 2.000 m | **4.910 m** | 3 km → 6 km |
| Marapi | 2.885 m | 2.000 m | 2.000 m | **4.885 m** | 3 km → 6 km |

Untuk Semeru, abu yang sebenarnya berada di ~4,7 km dimodelkan memakai angin
700 hPa (~3 km) padahal seharusnya mendekati 500 hPa (~5,5 km). Pada kondisi
geser angin vertikal, dua lapisan itu dapat bertiup ke arah berlawanan.

Gunung rendah seperti Anak Krakatau (285 m) dan Ibu (1.357 m) nyaris tidak
terpengaruh — itulah sebabnya kekeliruan ini tidak selalu terlihat.

---

## Temuan 2 — Layer angin permukaan disandingkan dengan abu ketinggian

**Tingkat:** Tinggi
**Berkas:** `lib/wind-gfs.js` baris 58–83, `lib/volcano.js` `ASH_LEVELS`

### Perilaku sekarang

Layer "ALIRAN ANGIN" membaca GRIB2 dengan penyaring:

```
lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on
```

Yaitu **angin 10 meter di atas permukaan**. Sementara pluma abu memakai
`wind_direction_700hPa`, `500hPa`, dan `250hPa` — yakni ~3, ~5,5, dan ~10 km.

### Mengapa ini masalah

Secara meteorologi keduanya memang boleh berbeda; itu geser angin vertikal, dan
benar adanya. Masalahnya ada di antarmuka: pengguna melihat satu layer bernama
"ALIRAN ANGIN" tanpa keterangan ketinggian, lalu membandingkannya dengan kerucut
abu. Perbedaan yang benar secara fisika terbaca sebagai kesalahan aplikasi.

Ini bukan bug perhitungan, melainkan bug penyajian — dan akibatnya sama:
pengguna kehilangan kepercayaan pada data yang sebenarnya benar.

---

## Temuan 3 — Satu nilai angin untuk seluruh jangkauan pluma

**Tingkat:** Sedang
**Berkas:** `lib/volcano.js` `fetchAloftWind` dan `ashPlume`

Angin diambil hanya pada koordinat puncak (`current=` pada satu titik), lalu
dipakai untuk memproyeksikan abu sampai ratusan kilometer. Medan angin nyata
berubah secara spasial; abu yang bergerak 60 km dapat memasuki rezim angin yang
berbeda. Ini keterbatasan model, bukan kekeliruan kode, tetapi harus dinyatakan.

---

## Temuan 4 — Tidak ada pembeda observed / forecast / model

**Tingkat:** Sedang
**Berkas:** `lib/volcano.js`, `public/app.js`

Data `observedDirection` sudah ada di API dan popup sudah menyebut sumber arah
sejak perbaikan sebelumnya, tetapi:

- tidak ada penanda tingkat kepercayaan pada geometri (semua poligon digambar
  dengan gaya sama);
- tidak ada label OBSERVED / MODEL yang terbaca sekilas;
- umur data angin tidak ditampilkan.

---

## Temuan 5 — Tabel ketinggian statis

**Tingkat:** Rendah
**Berkas:** `lib/volcano.js` `ASH_LEVELS`

Pemetaan 700 hPa → 3 km, 500 hPa → 6 km, 250 hPa → 10 km adalah pendekatan
atmosfer standar. Ketinggian geopotensial sebenarnya berubah menurut cuaca dan
lintang; Open-Meteo menyediakan `geopotential_height_[level]` yang lebih tepat.

---

## Yang diperiksa dan ternyata BENAR

Bagian ini sama pentingnya — agar tidak ada perbaikan yang merusak hal yang
sudah benar.

### Konvensi arah meteorologi — benar

`lib/wind-gfs.js` baris 148:

```js
from: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360
```

Diuji terhadap empat arah kardinal:

| u | v | from | to | Arti |
|---:|---:|---:|---:|---|
| 0 | −5 | 0 | 180 | dari utara, bertiup ke selatan |
| −5 | 0 | 90 | 270 | dari timur, bertiup ke barat |
| 0 | +5 | 180 | 0 | dari selatan, bertiup ke utara |
| +5 | 0 | 270 | 90 | dari barat, bertiup ke timur |

**4/4 benar.** Tidak ada pembalikan 180°, tidak ada tukar lat/lon, tidak ada
kekeliruan radian/derajat.

### Pemisahan from/to — benar

`lib/wind-gfs.js` baris 185–186 memisahkan `from` dan `to` secara eksplisit, dan
`ashPlume` memakai `to` untuk arah perpindahan, bukan `from`.

### Gerbang pluma — benar

Pluma hanya digambar bila ada laporan letusan pos pengamatan dalam 24 jam.
Status Siaga saja tidak cukup. Ini sudah benar dan tidak boleh diubah.

### Prioritas observasi di atas model — sebagian benar

Arah condong kolom hasil pengamatan visual petugas (`bearingDeg`) sudah
mengalahkan model, tetapi hanya pada lapisan terendah. Itu keputusan yang tepat:
petugas di darat hanya dapat melihat bagian bawah kolom.

---

## VAAC Darwin — tidak dapat diintegrasikan saat ini

Instruksi meminta integrasi Volcanic Ash Advisory dari Bureau of Meteorology
Australia. Hasil pemeriksaan pada 10 September 2026:

| URL | Status |
|---|---|
| `bom.gov.au/aviation/volcanic-ash/` | 200, halaman indeks |
| `bom.gov.au/aviation/volcanic-ash/darwin-va-advisory.shtml` | 200, **isi dimuat lewat JavaScript**, tidak ada teks advisory di HTML |
| `ftp.bom.gov.au/anon/gen/vaac/` | tidak dapat dihubungi |
| `bom.gov.au/fwo/IDD65300.txt` dan varian | 404 |
| `ssd.noaa.gov/VAAC/` | tidak dapat dihubungi |

Tidak ditemukan endpoint teks, XML, IWXXM, maupun JSON yang stabil dan dapat
diakses tanpa izin khusus. Ini konsisten dengan temuan sesi-sesi sebelumnya
(GVP CAP membalas 403; Darwin VAAC tanpa feed terbuka).

**Keputusan:** parser VAAC **tetap dibangun dan diuji** sesuai spesifikasi, tetapi
sumbernya dibiarkan kosong sampai jalur akses yang sah tersedia. Membangun
parser tanpa sumber lebih baik daripada mengarang data — dan begitu BoM
membuka akses, tinggal memasang URL-nya.

Alternatif yang perlu ditelusuri lebih lanjut (di luar lingkup audit ini):
kesepakatan lisensi dengan BoM, atau relai IWXXM lewat penyedia data
penerbangan resmi.

---

## Rencana perbaikan

| Urutan | Perbaikan | Alasan |
|---|---|---|
| 1 | Hitung `ashTopAMSL = elevM + heightAboveSummit` | Kesalahan fisik, memengaruhi pemilihan lapisan angin |
| 2 | Pilih lapisan tekanan dari ashTop yang benar, tambah level 850/600/400/300 | Resolusi vertikal terlalu kasar |
| 3 | Interpolasi vektor u/v antar dua level yang mengapit | Interpolasi sudut naif salah pada 350°/10° |
| 4 | Layer angin dapat memilih ketinggian, default mengikuti abu | Menghilangkan perbandingan yang menyesatkan |
| 5 | Badge ketinggian + sumber + umur data pada layer angin | Pengguna tahu sedang membandingkan apa |
| 6 | Penanda `dataMode` observed/model pada tiap pluma, gaya garis berbeda | Membedakan observasi dari model |
| 7 | Parser VAAC lengkap + uji, sumber kosong sampai akses tersedia | Siap pakai begitu akses terbuka |
| 8 | Rangkaian uji otomatis untuk seluruh konversi | Mencegah regresi |
