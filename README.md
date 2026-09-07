# FireWatch ID

Web pemantauan kebakaran hutan & lahan (karhutla) Indonesia: peta titik api, perkiraan sebaran
asap, daerah terdampak, **atribusi tanggung jawab lahan**, dan dashboard berita penanganan.

## Jalankan lokal

```bash
npm install
npm start            # http://localhost:3000
```

## Deploy ke Vercel

Repo ini sudah siap deploy tanpa konfigurasi tambahan:

1. Buka <https://vercel.com/new> dan impor repositori ini.
2. Framework Preset: **Other**. Biarkan Build & Output Command kosong.
3. Klik **Deploy**.

`vercel.json` mengarahkan semua permintaan ke `api/index.js`, yang memuat aplikasi
Express dari `server.js`. Environment variable **tidak wajib** — tanpa kunci apa pun
aplikasi tetap berjalan (titik api memakai data contoh, sisanya data nyata).

Untuk mengaktifkan titik api satelit sungguhan, tambahkan `FIRMS_MAP_KEY` di
**Settings → Environment Variables** lalu redeploy.

> Catatan serverless: cache di memori tidak persisten antar-invocation, sehingga
> permintaan pertama setelah idle lebih lambat (cold start). Untuk cache yang tetap
> hidup, platform berbasis proses seperti Render/Railway/Fly.io juga bisa memakai
> repo ini apa adanya lewat `npm start`.

## Data satelit langsung (opsional)

1. Ambil MAP_KEY gratis: https://firms.modaps.eosdis.nasa.gov/api/map_key/
2. `cp .env.example .env` lalu isi `FIRMS_MAP_KEY=...`
3. Restart server. Badge di kanan atas berubah dari "Mode demo" -> "Data langsung".

Tanpa key, hanya titik api yang memakai data contoh. Angin, batas konsesi, dan berita tetap nyata.

## Fitur

| Fitur | Keterangan |
|---|---|
| Peta titik api | Marker berskala FRP, filter tingkat keyakinan, popup detail satelit |
| Sebaran asap | Poligon kerucut per klaster; arah & jangkauan dari angin permukaan real-time |
| Daerah terdampak | Skor paparan Ringan/Sedang/Berat untuk 34 kota, klik untuk zoom |
| Peringkat provinsi | Provinsi diurutkan berdasarkan jumlah titik api dan total FRP |
| Batas konsesi | Layer poligon sawit, HTI, HPH, tambang, RSPO (aktifkan di toolbar, zoom 6+) |
| Atribusi tanggung jawab | Titik api dicocokkan ke unit lahan; agregasi per perusahaan dan per grup korporasi |
| Cek lahan | Klik titik mana pun di peta untuk melihat status/pemegang izin lahan tersebut |
| Berita penanganan | Umpan Google Berita (cadangan GDELT), dapat dicari |
| Peta dasar | Tiga pilihan: Gelap, Citra satelit, Relief (Esri, bebas kunci) |
| Arah angin | Medan panah angin permukaan 10 m; kerapatan menyesuaikan zoom, warna per kecepatan |
| Angin gaya Windy | Animasi partikel garis arus di canvas (interpolasi bilinear medan angin), bisa ditukar ke mode panah |
| Kueri data (RAG lokal) | Pencarian BM25 atas seluruh data langsung + berita; jawaban disusun dari angka nyata beserta sumbernya |
| Terminal UI | Tata letak padat bergaya terminal keuangan: ticker berjalan, jam WIB/UTC, panel bernomor |
| Abu vulkanik | Gunung api Indonesia yang sedang erupsi + perkiraan sebaran abu pada tiga lapisan ketinggian (~3/6/10 km) dari angin ketinggian |
| Citra Himawari-9 | Overlay citra satelit Jepang (JMA) real-time: inframerah, warna alami, dan uap air |
| Kualitas udara | Layer sel US AQI (model CAMS) dengan legenda 6 kelas, saran kesehatan, dan kartu "Udara terburuk"; nilai AQI juga muncul di popup peta |
| Warna titik panas | Tingkat keyakinan (merah/kuning/hijau, skema SiPongi) atau daya radiasi FRP |
| Ringkasan titik panas | Panel jumlah Tinggi/Sedang/Rendah + total, di sudut peta |
| Wilayah administratif | Popup titik api menampilkan desa/kecamatan/kabupaten/provinsi |

## Soal HGU dan kepemilikan lahan — penting

Peta **HGU resmi ATR/BPN bukan data publik** di Indonesia. Meski Komisi Informasi Publik (2016) dan
Mahkamah Agung (2017) memutuskan dokumen HGU sawit bersifat terbuka, aksesnya tetap dibatasi
lewat prosedur permohonan dan tidak tersedia sebagai layanan data terbuka.

Karena itu FireWatch ID memakai **kompilasi peta konsesi Global Forest Watch** yang dihimpun dari
KLHK, ESDM, dan RSPO. Sebagian polanya memuat field `cont_type` bernilai `HGU`, `HGU in process`,
`Ijin Lokasi`, atau `Pencadangan` — ditampilkan sebagai "Alas hak" di antarmuka.

Batasan yang wajib dipahami:

- Ini **indikasi awal, bukan bukti hukum** dan bukan sertifikat resmi.
- Titik api di dalam batas konsesi **tidak otomatis berarti perusahaan itu membakar** — api dapat
  merambat dari luar area.
- Kompilasi dapat tidak lengkap; tahun sumber beragam (2012–2025) dan batas dapat berubah.
- Titik api di luar semua poligon bisa berada di lahan masyarakat, kawasan hutan negara, atau
  konsesi yang belum terpetakan.

## Sumber terbuka

- **NASA FIRMS** (VIIRS/MODIS NRT) — titik api
- **Open-Meteo** — angin, suhu, kelembapan untuk model sebaran asap dan medan panah angin
- **Open-Meteo Air Quality (model CAMS ECMWF)** — US AQI, PM2,5, dan PM10 untuk layer kualitas udara
- **Himawari-9 / Japan Meteorological Agency (JMA)** — citra satelit geostasioner Jepang (kanal B13 inframerah, B03 warna alami, B08 uap air), diproksikan lewat server
- **Smithsonian Global Volcanism Program (GVP)** — daftar gunung api Holosen Indonesia (WFS) & Weekly Volcanic Activity Report (RSS)
- **Open-Meteo angin ketinggian** — angin 700/500/250 hPa untuk memperkirakan arah sebaran abu
- **Global Forest Watch** vector tiles — konsesi sawit, HTI, HPH, tambang, RSPO
- **Google Berita RSS** (cadangan GDELT Project) — berita penanganan
- **Esri** (Dark Gray Canvas, World Imagery, Shaded Relief) — peta dasar
- **Nominatim / OpenStreetMap** — reverse geocoding wilayah administratif

## Arsitektur & keamanan

- Kunci API hanya dibaca di server; browser hanya memanggil `/api/*` milik sendiri.
- Helmet + CSP ketat (`default-src 'none'`, tanpa inline script), rate limit 120 req/menit/IP.
- Semua data eksternal dirender via `textContent`/`createElement` — tidak ada `innerHTML`.
  Tautan berita dibatasi skema http/https + `rel="noopener noreferrer nofollow"`.
- Error server dibalas pesan generik; stack trace hanya ke log.
- Validasi ketat pada parameter koordinat dan bbox, dengan pembatasan luas area.
- Cache in-memory: hotspot 10 mnt, cuaca 30 mnt, berita 20 mnt, atribusi 30 mnt, tile konsesi 6 jam,
  reverse geocode 24 jam (menghormati kebijakan penggunaan Nominatim).

### Endpoint

| Endpoint | Fungsi |
|---|---|
| `GET /api/overview` | Titik api, klaster, pluma asap, daerah terdampak, peringkat provinsi |
| `GET /api/attribution` | Agregasi titik api per unit lahan dan grup korporasi |
| `GET /api/concessions?west=&south=&east=&north=` | Poligon konsesi (GeoJSON) untuk area peta |
| `GET /api/whose-land?lat=&lon=` | Status/pemegang izin lahan pada satu koordinat |
| `GET /api/wind-field?step=&west=&south=&east=&north=` | Grid panah arah & kecepatan angin |
| `GET /api/air-quality?step=&west=&south=&east=&north=` | Grid US AQI/PM2,5/PM10 beserta legenda |
| `GET /api/air-point?lat=&lon=` | Kualitas udara pada satu titik untuk popup peta |
| `GET /api/ask?q=` | Tanya-jawab & pencarian atas data langsung (indeks BM25 lokal, tanpa LLM eksternal) |
| `GET /api/volcano-ash` | Gunung api erupsi + poligon sebaran abu per lapisan ketinggian |
| `GET /api/himawari/meta` | Waktu citra Himawari terbaru & daftar produk |
| `GET /api/himawari/:product/:z/:x/:y.jpg` | Proksi tile citra Himawari-9 (produk: `ir`, `vis`, `ash`; z 2–6) |
| `GET /api/place?lat=&lon=` | Wilayah administratif (desa/kecamatan/kabupaten/provinsi) |
| `GET /api/news` | Umpan berita penanganan |
| `GET /api/health` | Cek kesehatan layanan |

## Batasan model asap

Sebaran asap adalah model kerucut sederhana (arah/kecepatan angin permukaan + FRP), bukan model
dispersi atmosfer maupun pengukuran kualitas udara. Untuk keputusan darurat rujuk BMKG, BNPB/BPBD,
dan KLHK.

## Catatan sebaran abu vulkanik

Poligon sebaran abu adalah **perkiraan indikatif** dari arah dan kecepatan angin pada
ketinggian 700/500/250 hPa, bukan Volcanic Ash Advisory resmi. Wilayah Indonesia berada
di bawah tanggung jawab **Darwin VAAC (Bureau of Meteorology, Australia)** — bukan Tokyo VAAC —
sedangkan status dan tingkat aktivitas gunung api resmi diterbitkan oleh **PVMBG / MAGMA ESDM**.
Untuk keperluan penerbangan dan mitigasi, gunakan sumber resmi tersebut.

## Mesin kueri (RAG lokal)

`lib/rag.js` mengubah seluruh data langsung — ringkasan nasional, daerah terdampak,
peringkat provinsi, klaster & pluma asap, unit konsesi, kualitas udara, gunung api,
dan berita — menjadi dokumen teks, lalu mengindeksnya dengan **BM25** (plus pemangkas
imbuhan bahasa Indonesia sederhana). Kueri pengguna dideteksi maksudnya lalu jawaban
**dirakit dari angka nyata pada dokumen**, bukan dihasilkan model bahasa. Karena itu:

- tidak ada API key dan tidak ada biaya inferensi,
- jawaban tidak bisa "berhalusinasi" angka,
- setiap jawaban menyertakan daftar sumber yang dipakai.
