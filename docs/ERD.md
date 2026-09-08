# Model Data — SIAGA ID

Versi 2.0 · 8 September 2026

> **Catatan penting.** Aplikasi ini **tidak memiliki basis data**. Tidak ada tabel,
> tidak ada skema SQL, tidak ada penyimpanan persisten. Dokumen ini memodelkan
> entitas logis yang mengalir dari sumber hulu, melalui cache di memori, sampai ke
> respons API. Diagram berikut menggambarkan hubungan antar-entitas, bukan relasi
> antar-tabel.

---

## 1. Peta entitas

```
┌──────────────────┐
│  SUMBER (12)     │  entitas akar; tiap sumber dipetakan ke satu tugas penjadwal
└────────┬─────────┘
         │ 1 : N
         ▼
┌──────────────────┐        ┌──────────────────────────────────────┐
│  TUGAS (8)       │───────▶│  SNAPSHOT CACHE                      │
│  id, interval,   │  1 : 1 │  data, updatedAt, ok, lastError,     │
│  kritis          │        │  runs, fails                         │
└──────────────────┘        └───────────────┬──────────────────────┘
                                            │ dibaca peek()
                                            ▼
                            ┌───────────────────────────────┐
                            │  ENTITAS DOMAIN               │
                            └───────────────┬───────────────┘
                                            │
   ┌──────────┬──────────┬──────────┬───────┴──────┬──────────┬──────────┐
   ▼          ▼          ▼          ▼              ▼          ▼          ▼
HOTSPOT   VOLCANO    QUAKE     SHELTER_SET     TSUNAMI    ARTICLE   CONCESSION
   │          │                     │                                   │
   │ N:1      │ 1:N                 │ 1:N                          N:1  │
   ▼          ▼                     ▼                                   │
CLUSTER   ERUPTION            SHELTER_POINT                             │
   │       REPORT                                                       │
   │ 1:1      │ 1:1                                                     │
   ▼          ▼                                                         │
 PLUME    ASH_PLUME                                                     │
   │                                                                    │
   │ N:M                                                                │
   ▼                                                                    │
IMPACTED_REGION                                                         │
   │                                                                    │
   │ N:1                                                                │
   ▼                                                                    │
 REGION (226, statis) ◀──────────────────────────────────────────────────┘
                                     ATTRIBUTION_UNIT menghubungkan
                                     HOTSPOT ke CONCESSION
```

---

## 2. Entitas

### HOTSPOT
Satu deteksi anomali termal satelit.

| Medan | Tipe | Keterangan |
|---|---|---|
| `lat`, `lon` | number | 4 desimal |
| `frp` | number | Fire Radiative Power, MW |
| `confidence` | number | 30 rendah / 65 nominal / 90 tinggi |
| `acq` | string | **ISO 8601 UTC**, hasil normalisasi |
| `acqRaw` | string | Bentuk asli FIRMS (`"2026-09-07 0516"`), untuk penelusuran |
| `satellite` | string | Suomi-NPP, NOAA-20, NOAA-21 |
| `daynight` | string | `D` atau `N` |

Kunci deduplikasi: `lat(4) + lon(4) + acq_date + acq_time`.
Aturan: seluruh baris wajib memenuhi `acq >= now − 24 jam`.

### CLUSTER
Kelompok HOTSPOT berdekatan. `{ lat, lon, count, frp }`.
Array dipotong 40 teratas; `clustersMeta` melaporkan `{ returned, total, truncated }`.

### PLUME
Model kerucut sebaran asap dari CLUSTER, dihitung dari arah angin dan FRP. Bukan
model dispersi atmosfer.

### IMPACTED_REGION
REGION yang berada di jalur PLUME. `{ name, province, population, distanceKm, bearing, score, level }`.
`score` 0–100 menggabungkan intensitas api, jarak, dan keselarasan angin. Bukan ISPU.

### REGION
226 permukiman ≥50.000 jiwa dari GeoNames. **Statis**, tersimpan di
`data/regions.json`. `{ name, province, lat, lon, population }`.

### VOLCANO
69 gunung api dipantau PVMBG.

| Medan | Keterangan |
|---|---|
| `name`, `lat`, `lon`, `elevation` | Identitas |
| `official.level` | Normal / Waspada / Siaga / Awas — **kewaspadaan, bukan kejadian** |
| `eruption` | Laporan letusan ≤24 jam, atau `null` |

**Aturan kritis:** ASH_PLUME hanya digambar bila `eruption` ada. Menggambarnya
berdasarkan `official.level >= 3` adalah bug yang pernah terjadi dan tidak boleh
diulang.

### ERUPTION_REPORT
Laporan pos pengamatan dari MAGMA. `{ volcano, at, count, heightM, bearingDeg, amplitude, duration }`.
`heightM` dan `bearingDeg` boleh `null` bila kolom abu tidak teramati — dan `null`
harus ditampilkan sebagai "tidak teramati", bukan nol.

### ASH_PLUME
Kerucut abu per lapisan ketinggian (≈3, 6, 10 km), masing-masing memakai angin
lapisannya sendiri karena arahnya bisa berbeda jauh dari angin permukaan.

### QUAKE
Gempa BMKG. `{ time, magnitude, depthKm, lat, lon, area, felt, tsunamiFlag, severity }`.
`severity` diturunkan dari magnitudo, kedalaman, dan bendera tsunami.

### TSUNAMI_BULLETIN
Buletin NOAA PTWC/NTWC, disaring hanya untuk kejadian yang menyangkut Indonesia dan
kawasan sekitarnya.

### SHELTER_SET
Satu kejadian pengungsian yang layanannya diterbitkan BNPB.

| Medan | Keterangan |
|---|---|
| `id`, `label`, `hazard` | Identitas kejadian |
| `total`, `terpusat`, `mandiri` | Jumlah jiwa |
| `sites` | Jumlah titik |
| `updatedAt`, `ageDays` | Kesegaran laporan |
| `topAreas[]` | Enam kabupaten terbanyak |
| `points[]` | Maksimum 500 SHELTER_POINT |

**Aturan kesegaran:** `ageDays > 10` dipindahkan ke `recentlyEnded` dan tidak
dihitung sebagai pengungsi aktif. BNPB tidak menghapus layanan saat warga pulang,
sehingga tanpa aturan ini angka lama menempel selamanya.

### CONCESSION
Batas konsesi dari kompilasi Global Forest Watch (sawit, HTI, HPH, tambang, RSPO).
Bukan sertifikat HGU resmi ATR/BPN.

### ATTRIBUTION_UNIT
Hasil titik-dalam-poligon antara HOTSPOT dan CONCESSION.

| Medan | Keterangan |
|---|---|
| `analyzed` | Ukuran sampel (220) |
| `population` | Total HOTSPOT |
| `sampled`, `samplingMethod` | `true`, `"top-FRP"` |
| `insideConcession`, `outsideConcession` | Hitungan dalam sampel |
| `insideShare` | Rasio terhadap **sampel**, bukan populasi |
| `units[]`, `groups[]` | Per unit lahan dan grup korporasi |

**Peringatan bias:** memilih 220 titik ber-FRP tertinggi adalah bias sistematis —
api besar lebih mungkin berada di perkebunan luas. Ini wajib dinyatakan di antarmuka.

### ARTICLE
Artikel berita hasil agregasi.

| Medan | Keterangan |
|---|---|
| `title`, `url`, `domain` | Identitas |
| `pubDate`, `seendate` | Waktu terbit |
| `topic`, `topicLabel` | Satu dari 13 topik |
| `foreign`, `country` | Penanda edisi negara tetangga |
| `score` | 0–10 dari `lib/relevance.js` |
| `category` | DARURAT / DAMPAK / PENANGANAN / UMUM |

Deduplikasi dua lapis: URL persis, lalu tumpang-tindih token judul (Jaccard ≥ 0,80)
terhadap 300 judul terakhir.

### CASUALTY
Angka korban hasil ekstraksi pola dari judul berita. **Bukan data resmi** — selalu
disertai kutipan asli dan tautan penerbit. Bila berbeda dengan angka BNPB, yang resmi
didahulukan.

---

## 3. Skema meta

Tiap respons `/api/overview` membawa blok `meta` yang menyatakan batas datanya:

```jsonc
{
  "meta": {
    "mode": "live",
    "source": "NASA FIRMS VIIRS 24 jam — Suomi-NPP, NOAA-20, NOAA-21 (arsip terbuka)",
    "updatedAt": "2026-09-08T05:12:00.000Z",
    "windowHours": 24,          // jendela yang dijanjikan
    "oldestAcq":   "2026-09-07T05:12:00.000Z",
    "newestAcq":   "2026-09-07T19:36:00.000Z",
    "dataAgeHours": 23.9,       // umur titik tertua
    "filteredOut": 2583,        // dibuang karena di luar jendela
    "bbox": { "west": 94.5, "south": -11.5, "east": 141.5, "north": 6.5 }
  }
}
```

**Konvensi kontrak API.** Setiap array yang dapat dipotong atau disampel wajib
menyertakan metadatanya:

| Pola | Medan wajib |
|---|---|
| Array dipotong | `{ returned, total, truncated }` |
| Hasil sampel | `{ sampled, sampleSize, population, samplingMethod }` |
| Belum diketahui | `null`, bukan `0`; balasan `no-store` |

---

## 4. Keadaan yang tidak disimpan

Tidak ada `localStorage`, `sessionStorage`, cookie, maupun IndexedDB. Seluruh
keadaan klien ada di memori dan hilang saat halaman dimuat ulang.

Konsekuensinya: preferensi lapisan, peta dasar, dan filter tidak bertahan. Imbalannya:
tidak ada permukaan privasi di sisi klien sama sekali. Ini pertukaran yang disengaja.
