/* Lightweight Indonesian-English localization for the dashboard. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) {
    root.SiagaI18n = api;
    api.init(root);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var DICTIONARY = {
    'SIAGA ID, Pemantauan Bencana Indonesia: Gunung Api, Gempa, Karhutla': 'SIAGA ID, Indonesia Disaster Monitor: Volcanoes, Earthquakes, and Wildfires',
    'Pemantauan bencana Indonesia dari sumber resmi dan terbuka: letusan gunung api dan sebaran abu dari pos pengamatan PVMBG, gempa BMKG, tsunami, pengungsi BNPB, titik api dan asap karhutla.': 'An Indonesian disaster monitor using official and open data: PVMBG volcano reports and ash, BMKG earthquakes, tsunami bulletins, BNPB displacement reports, and wildfire hotspots and smoke.',
    'Lewati ke konten utama': 'Skip to main content',
    'Bahasa Indonesia': 'Indonesian',
    'English language': 'Bahasa Inggris',
    'Perbesar': 'Zoom in',
    'Perkecil': 'Zoom out',
    'Baik': 'Good',
    'Tidak sehat': 'Unhealthy',
    'Tidak sehat bagi kelompok sensitif': 'Unhealthy for sensitive groups',
    'Sangat tidak sehat': 'Very unhealthy',
    'Berbahaya': 'Hazardous',
    'Normal': 'Normal',
    'Meningkat': 'Elevated',
    'Terminal Bencana': 'Disaster Terminal',
    'Data Langsung': 'Live data',
    'Data langsung': 'Live data',
    'Buka status sumber data': 'Open data-source status',
    'memeriksa status sumber…': 'Checking source status...',
    'REFRESH': 'REFRESH',
    '✦ MODE ATUR LAYOUT, drag header untuk geser, sudut untuk resize': 'LAYOUT EDIT MODE, drag a header to move it and a corner to resize',
    'Desktop & mobile terpisah': 'Desktop and mobile layouts are separate',
    '💾 SIMPAN': '💾 SAVE',
    '⎙ EXPORT': '⎙ EXPORT',
    '↺ RESET': '↺ RESET',
    'menunggu laporan pos pengamatan': 'Waiting for observatory reports',
    'Gempa': 'Earthquakes',
    'menunggu data BMKG': 'Waiting for BMKG data',
    'Titik api': 'Fire hotspots',
    'menunggu data NASA FIRMS': 'Waiting for NASA FIRMS data',
    'Pengungsi': 'Displaced people',
    'menunggu laporan BNPB': 'Waiting for BNPB reports',
    'Dalam plume model': 'Inside the modeled plume',
    'menunggu plume indikatif': 'Waiting for the indicative plume',
    'AQI terburuk': 'Highest AQI',
    'menunggu data kualitas udara': 'Waiting for air-quality data',
    'Pengaturan peta': 'Map settings',
    'Peta interaktif Indonesia': 'Interactive map of Indonesia',
    'Peta interaktif, Indonesia · EPSG:4326 · WGS84': 'Interactive map, Indonesia · EPSG:4326 · WGS84',
    'Peta layar penuh': 'Full-screen map',
    'Layar penuh (F), ESC untuk keluar': 'Full screen (F), press ESC to exit',
    'Peta Indonesia dengan sebaran titik api': 'Map of Indonesia with fire hotspots',
    'Legenda kerapatan titik api, lima tingkat': 'Five-level fire-hotspot density legend',
    'Paling': 'Very',
    'Lemah': 'Low',
    'Sedang': 'Moderate',
    'Kuat': 'High',
    'Pusatkan ke lokasi saya': 'Center on my location',
    'Keluar layar penuh': 'Exit full screen',
    '✕ KELUAR FULLSCREEN (ESC)': '✕ EXIT FULL SCREEN (ESC)',
    'Panel inspeksi': 'Inspection panel',
    'Mode inspeksi': 'Inspection mode',
    'Perhatian': 'Alerts',
    'Lapisan': 'Layers',
    'Tampilan': 'Display',
    'Perlu perhatian · menunggu data sumber': 'Needs attention · waiting for source data',
    'Memuat…': 'Loading...',
    'LAPISAN PETA': 'MAP LAYERS',
    'Letusan gunung api': 'Volcanic eruptions',
    'Sebaran asap indikatif (FIRMS + GFS)': 'Indicative smoke plume (FIRMS + GFS)',
    'Sebaran asap indikatif FIRMS dan NOAA GFS': 'Indicative smoke plume from FIRMS and NOAA GFS',
    'Cakupan klaster plume akan muncul setelah data dimuat.': 'Plume cluster coverage will appear when data loads.',
    'Laporan kabut & observasi asap (ASMC / NEA / BMKG)': 'Regional haze reports and smoke observations (ASMC / NEA / BMKG)',
    'Sapuan regional ASMC, marker laporan NEA, dan observasi historis asap atmosfer BMKG di Jakarta': 'ASMC regional haze overlay, NEA report marker, and BMKG historical atmospheric-smoke observation in Jakarta',
    'Memuat laporan regional kabut asap...': 'Loading regional haze reports...',
    'Aerosol satelit (NASA)': 'Satellite aerosol (NASA)',
    'Indeks aerosol satelit NASA OMPS NOAA-21': 'NASA OMPS NOAA-21 satellite aerosol index',
    'Pusat kota dalam plume model': 'Cities within the modeled plume',
    'Pusat kota/kabupaten dalam plume indikatif, bukan laporan dampak resmi': 'City/regency centers inside the indicative plume, not an official impact report',
    'Abu vulkanik': 'Volcanic ash',
    'Kualitas udara (US AQI)': 'Air quality (US AQI)',
    'Kualitas udara US AQI': 'US AQI air quality',
    'PM2.5 total model (CAMS)': 'Total modeled PM2.5 (CAMS)',
    'PM2.5 total model CAMS Global, bukan khusus asap': 'CAMS Global total modeled PM2.5, not smoke-specific',
    'Legenda PM2.5 model dalam mikrogram per meter kubik': 'Modeled PM2.5 legend in micrograms per cubic meter',
    'Aliran angin': 'Wind flow',
    'Batas konsesi': 'Concession boundaries',
    'Lalu lintas udara': 'Air traffic',
    'Lalu lintas udara sipil': 'Civilian air traffic',
    'Pesawat sipil dari jaringan ADS-B publik. Jaringan penerima tidak rapat: ketiadaan pesawat bukan berarti tidak ada penerbangan.': 'Civilian aircraft from the public ADS-B network. Receiver coverage is sparse, so an aircraft not shown does not mean no flight is present.',
    'ANGIN': 'WIND',
    'Ketinggian angin': 'Wind altitude',
    'ANGIN: AUTO (IKUT ABU)': 'WIND: AUTO (MATCH ASH)',
    'ANGIN: PERMUKAAN 10 M': 'WIND: SURFACE 10 M',
    'ANGIN: 850 hPa ~1,5 KM': 'WIND: 850 hPa ~1.5 KM',
    'ANGIN: 700 hPa ~3 KM': 'WIND: 700 hPa ~3 KM',
    'ANGIN: 600 hPa ~4,2 KM': 'WIND: 600 hPa ~4.2 KM',
    'ANGIN: 500 hPa ~5,6 KM': 'WIND: 500 hPa ~5.6 KM',
    'ANGIN: 300 hPa ~9,2 KM': 'WIND: 300 hPa ~9.2 KM',
    'LINIMASA ASAP & PM2.5': 'SMOKE & PM2.5 TIMELINE',
    'Linimasa bawah peta memutar plume asap indikatif atau prakiraan PM2.5 total CAMS jika layernya aktif.': 'The timeline below the map plays the indicative smoke plume or the CAMS total PM2.5 forecast when its layer is active.',
    'KONFIGURASI HOTSPOT': 'HOTSPOT SETTINGS',
    'Warna titik api': 'Hotspot color',
    'KEYAKINAN': 'CONFIDENCE',
    'DAYA RADIASI (FRP)': 'FIRE RADIATIVE POWER (FRP)',
    'Filter keyakinan': 'Confidence filter',
    'SEMUA': 'ALL',
    'NOMINAL & TINGGI': 'NOMINAL & HIGH',
    'HANYA TINGGI': 'HIGH ONLY',
    'Min FRP': 'Minimum FRP',
    'KUALITAS UDARA': 'AIR QUALITY',
    'Filter AQI': 'AQI filter',
    'SEMUA (AQI ≥0)': 'ALL (AQI ≥0)',
    'SEDANG+ (≥50)': 'MODERATE+ (≥50)',
    'TIDAK SEHAT (≥100)': 'UNHEALTHY (≥100)',
    'SANGAT TIDAK SEHAT (≥150)': 'VERY UNHEALTHY (≥150)',
    'BERBAHAYA (≥200)': 'HAZARDOUS (≥200)',
    'SANGAT BERBAHAYA (≥300)': 'VERY HAZARDOUS (≥300)',
    'Aktifkan layer KUALITAS UDARA untuk melihat data': 'Turn on the AIR QUALITY layer to view data',
    'Klik legenda di peta untuk filter cepat · Sumber: CAMS via Open-Meteo': 'Click the map legend for a quick filter · Source: CAMS via Open-Meteo',
    'IKHTISAR': 'OVERVIEW',
    'Luas sebaran abu': 'Ash plume area',
    'Klaster titik api': 'Fire-hotspot clusters',
    'Titik api di dalam konsesi': 'Hotspots inside concessions',
    'Provinsi kekeringan': 'Drought-affected provinces',
    'PETA DASAR': 'BASEMAP',
    'Jenis': 'Type',
    'GELAP': 'DARK',
    'SATELIT': 'SATELLITE',
    'RELIEF': 'RELIEF',
    'CITRA SATELIT': 'SATELLITE IMAGERY',
    'Produk': 'Product',
    'NONAKTIF': 'OFF',
    'INFRAMERAH': 'INFRARED',
    'WARNA ALAMI': 'NATURAL COLOR',
    'ABU VULKANIK (RGB)': 'VOLCANIC ASH (RGB)',
    'DEBU & AEROSOL': 'DUST & AEROSOL',
    'UAP AIR': 'WATER VAPOR',
    'DETAIL: WARNA ALAMI': 'DETAIL: NATURAL COLOR',
    'DETAIL: INFRAMERAH SWIR': 'DETAIL: SWIR INFRARED',
    'DETAIL: VEGETASI': 'DETAIL: VEGETATION',
    'KEKERINGAN: KELEMBAPAN TANAMAN': 'DROUGHT: VEGETATION MOISTURE',
    'BANJIR: GENANGAN AIR': 'FLOOD: WATER EXTENT',
    'BANJIR: RADAR SAAT KEJADIAN': 'FLOOD: EVENT-TIME RADAR',
    'LEGENDA': 'LEGEND',
    'Tinggi': 'High',
    'Rendah': 'Low',
    'Asap': 'Smoke',
    'Kualitas udara': 'Air quality',
    'BAIK 0-50': 'GOOD 0-50',
    'SEDANG 51-100': 'MODERATE 51-100',
    'TIDAK SEHAT 101-150': 'UNHEALTHY 101-150',
    'BERBAHAYA 151+': 'HAZARDOUS 151+',
    'Dok data': 'Data dock',
    'Pilih panel data': 'Choose a data panel',
    'Linimasa': 'Timeline',
    'Kejadian': 'Events',
    'Wilayah': 'Regions',
    'Berita': 'News',
    'Atribusi': 'Attribution',
    'Bahaya': 'Hazards',
    'Sumber': 'Sources',
    'Siaran': 'Streams',
    '8 panel · klik untuk pindah': '8 panels · click to switch',
    'Lipat dok': 'Collapse data dock',
    'Buka Operations Center, halaman terpisah': 'Open Operations Center in a separate page',
    'Operasi': 'Operations',
    'DATA LANGSUNG': 'LIVE DATA',
    'Menunggu kejadian dan laporan dari sumber.': 'Waiting for events and reports from sources.',
    'Linimasa prakiraan asap dan PM2.5': 'Smoke and PM2.5 forecast timeline',
    'Putar linimasa layer aktif': 'Play the active layer timeline',
    'Riwayat dan prakiraan layer asap atau PM2.5 model': 'History and forecast for the smoke or modeled PM2.5 layer',
    'SEKARANG': 'NOW',
    'Riwayat plume indikatif 24 jam hingga prakiraan +18 jam. Bukan ukuran PM2.5.': '24-hour indicative plume history through an +18-hour forecast. This is not a PM2.5 measurement.',
    'Kejadian dan laporan dipantau · data resmi dan keluaran model dibedakan': 'Monitored events and reports · official data and model output are distinguished',
    'Analisis wilayah': 'Regional analysis',
    'Pusat dalam plume': 'Centers in plume',
    'Provinsi': 'Provinces',
    'Klaster': 'Clusters',
    'Kekeringan': 'Drought',
    'Cari berita': 'Search news',
    'Cari berita…': 'Search news...',
    'Semua 200': 'All 200',
    'Gempa & tsunami 12': 'Earthquakes & tsunami 12',
    'Kejadian & titik api 56': 'Events & hotspots 56',
    'Kebijakan pusat 12': 'National policy 12',
    'Operasi penanganan 12': 'Response operations 12',
    'Memuat berita…': 'Loading news...',
    'Baca dulu sebelum menyimpulkan.': 'Read this before drawing conclusions.',
    'Batas konsesi berasal dari kompilasi Global Forest Watch atas data KLHK, ESDM, dan RSPO,': 'Concession boundaries come from a Global Forest Watch compilation of KLHK, ESDM, and RSPO data,',
    'bukan sertifikat HGU resmi ATR/BPN': 'not an official land-use rights certificate from ATR/BPN',
    ', yang tidak dibuka ke publik. Titik api di dalam batas konsesi': ', which is not publicly available. A hotspot inside a concession boundary',
    'tidak otomatis': 'does not automatically',
    'berarti perusahaan itu membakar; api dapat merambat dari luar. Gunakan sebagai indikasi awal, bukan bukti hukum.': 'mean the company started the fire; fires can spread from outside. Treat this as an initial lead, not legal evidence.',
    'Per unit lahan': 'By land unit',
    'Per grup korporasi': 'By corporate group',
    'Gempa terkini': 'Latest earthquake',
    'berpotensi tsunami': 'tsunami potential',
    'gempa tercatat': 'recorded earthquakes',
    'mag ≥ 5': 'magnitude ≥ 5',
    'Peringatan tsunami: kawasan aman.': 'Tsunami warning: area is safe.',
    'Tidak ada pengungsian aktif.': 'No active displacement reported.',
    'Gas SO₂ · model CAMS · tiap 30 menit': 'SO₂ gas · CAMS model · every 30 minutes',
    'Acuan WHO: rata-rata 24 jam sebaiknya tidak melebihi': 'WHO guideline: the 24-hour average should not exceed',
    'Bukan pengukuran fluks kawah langsung oleh PVMBG.': 'This is not a direct crater-flux measurement by PVMBG.',
    'Sumber: BMKG · NOAA · PTWC · BNPB · CAMS via Open-Meteo. Gempa bumi diperbarui tiap 2 menit.': 'Sources: BMKG · NOAA · PTWC · BNPB · CAMS via Open-Meteo. Earthquake data refresh every 2 minutes.',
    'Status pembaruan data': 'Data refresh status',
    'sumber aktif': 'active sources',
    'gagal 429 (kuota)': '429 failures (quota)',
    'galat 5xx': '5xx errors',
    'run / gagal': 'runs / failures',
    'Bukan peringatan resmi.': 'Not an official warning.',
    'Bukan peringatan resmi': 'Not an official warning',
    'Untuk keputusan evakuasi, ikuti rujukan resmi:': 'For evacuation decisions, follow official guidance:',
    'telepon 112': 'call 112',
    'Memahami data ini': 'Understanding this data',
    'Apa itu titik api (hotspot)?': 'What is a fire hotspot?',
    'Apa:': 'What it is:',
    'piksel yang terdeteksi satelit sebagai anomali panas di permukaan bumi.': 'A satellite-detected pixel showing a thermal anomaly at the Earth\'s surface.',
    'Penting:': 'Important:',
    'hotspot': 'hotspot',
    'bukan': 'not',
    'berarti pasti kebakaran hutan.': 'necessarily a forest fire.',
    'FRP:': 'FRP:',
    'daya radiasi api dalam megawatt.': 'Fire radiative power, measured in megawatts.',
    'Kenapa plume asap tampak seperti kabut?': 'Why does the smoke plume look like haze?',
    'Cara baca:': 'How to read it:',
    'lapisan raster yang lembut menyatukan plume dari sampel maksimal 36 klaster titik api; arah tiap plume mengikuti angin. Pemilihan visual dibagi lintas wilayah supaya FRP terbesar tidak mendominasi seluruh peta. Perhitungan pusat model memeriksa seluruh klaster FIRMS yang memiliki sampel angin, sehingga cakupan hitungan dapat lebih luas dari selubung yang sedang digambar. Rona dan kelembutan hanya gaya visual, bukan ketebalan atau konsentrasi asap. Klik hit-area transparan plume untuk menyorot pusat kota/kabupaten yang masuk perkiraan model.': 'The soft raster layer combines plumes from a visual sample of up to 36 hotspot clusters, with each plume oriented by wind. Visual samples are distributed across regions so the highest FRP does not dominate the map. The modeled-center calculation checks all FIRMS clusters with valid wind samples, so its coverage can exceed the plume shapes currently drawn. Color and softness are visual styling only, not smoke thickness or concentration. Click a plume\'s transparent hit area to highlight city or regency centers within the model estimate.',
    'Linimasa asap dan PM2.5 (+6 / +12 / +18 jam)': 'Smoke and PM2.5 timeline (+6 / +12 / +18 hours)',
    'Cara pakai:': 'How to use it:',
    'tombol di linimasa bawah memutar layer prakiraan yang sedang aktif. Plume asap tetap model indikatif angin dan titik api. Jika layer PM2.5 CAMS aktif, nilai berwarna adalah prakiraan total dari semua sumber pada waktu berlaku yang ditampilkan, bukan kontribusi khusus asap.': 'The controls in the lower timeline play the forecast for the active layer. The smoke plume remains an indicative model based on wind and hotspots. If the CAMS PM2.5 layer is active, colored values show total modeled PM2.5 from all sources at the displayed valid time, not the contribution from smoke alone.',
    'Arti pusat kota dalam plume model': 'What city centers inside the modeled plume mean',
    'Angka ini mencocokkan daftar 226 pusat permukiman Indonesia dengan poligon plume indikatif dari seluruh klaster hasil pengelompokan deteksi FIRMS yang memiliki sampel angin NOAA GFS 10 m. Selubung visual di peta dibatasi maksimal 36 klaster dan tidak selalu menggambar semua sumber yang dipakai hitungan. Ini bukan lintasan asap teramati, laporan resmi daerah terdampak, batas administratif, jumlah orang terpapar, atau pengukuran ISPU. Angin 10 m tidak mewakili asap di ketinggian sekitar 4 km atau lebih. Laporan BMKG yang bertanggal ditampilkan sebagai observasi historis terpisah; laporan kesehatan, haze regional, dan PM2.5 ambien juga tidak dicampur dengan hitungan model.': 'This count compares 226 Indonesian settlement centers with indicative plume polygons from every FIRMS detection cluster that has a valid NOAA GFS 10 m wind sample. The map displays at most 36 visual clusters and may not draw every source used in the count. This is not an observed smoke trajectory, an official affected-area report, an administrative boundary, a count of exposed people, or an ISPU measurement. 10 m wind does not represent smoke at altitudes of about 4 km or higher. Dated BMKG reports are shown separately as historical observations; health reports, regional haze reports, and ambient PM2.5 are not combined with this model count.',
    'Angin & kenapa ia menentukan segalanya': 'Wind and why it matters',
    'Layer': 'Layer',
    'ketinggian angin': 'wind altitude',
    'memilih level tekanan: permukaan 10 m hingga 300 hPa (~9,2 km).': 'selects a pressure level: from 10 m near the surface to 300 hPa (~9.2 km).',
    'Kenapa kepemilikan lahan dipetakan': 'Why map land ownership?',
    'Untuk atribusi awal: titik api yang jatuh di dalam batas konsesi membantu mengarahkan verifikasi,': 'For initial attribution: hotspots within a concession boundary can help guide verification,',
    'bukan menetapkan kesalahan.': 'but do not establish wrongdoing.',
    'Abu vulkanik: bahaya yang berbeda': 'Volcanic ash: a different hazard',
    'Abu adalah partikel padat, dipantau terutama untuk': 'Ash consists of solid particles and is monitored primarily for',
    'keselamatan penerbangan': 'aviation safety',
    '; SO₂ adalah gas tak kasat mata yang bisa terbawa terpisah dari abu.': '; SO₂ is an invisible gas that can travel separately from ash.',
    'Sumber data & batasan': 'Data sources & limitations',
    'Letusan gunung api: PVMBG / MAGMA': 'Volcanic eruptions: PVMBG / MAGMA',
    'Laporan Pos Pengamatan Gunung Api, ditulis petugas yang berjaga di lapangan. Memuat waktu erupsi, tinggi kolom abu, arah condong, amplitudo dan durasi seismograf.': 'Reports from Volcano Observation Posts are written by staff on site. They include eruption times, ash-column heights, direction of drift, and seismograph amplitude and duration.',
    'Inilah acuan yang menentukan apakah sebaran abu digambar di peta.': 'These reports determine whether an ash plume is drawn on the map.',
    'Jendela pantau 24 jam terakhir.': 'Monitoring window: the past 24 hours.',
    'Tingkat aktivitas: PVMBG & Smithsonian GVP': 'Activity levels: PVMBG & Smithsonian GVP',
    'Normal / Waspada / Siaga / Awas. Status menyatakan': 'Normal / Advisory / Watch / Warning. The status indicates',
    'kewaspadaan': 'alert level',
    ', bukan bahwa gunung sedang meletus.': ', not that a volcano is currently erupting.',
    'Titik api: NASA FIRMS VIIRS': 'Fire hotspots: NASA FIRMS VIIRS',
    '24 jam dari tiga satelit: Suomi-NPP, NOAA-20, NOAA-21. Hotspot adalah': '24 hours of data from three satellites: Suomi-NPP, NOAA-20, and NOAA-21. A hotspot is',
    'anomali suhu permukaan': 'a surface-temperature anomaly',
    ': tidak semuanya kebakaran hutan.': ': not every hotspot is a forest fire.',
    'Sebaran asap indikatif: FIRMS + NOAA GFS': 'Indicative smoke plume: FIRMS + NOAA GFS',
    'Indeks pusat permukiman dihitung dari seluruh klaster hasil pengelompokan deteksi panas NASA FIRMS yang memiliki sampel angin permukaan NOAA GFS 10 m (grid global 1°). Demi performa, selubung raster di peta hanya menampilkan sampel maksimal 36 klaster yang dipilih lintas wilayah; status layer memisahkan jumlah sumber yang dihitung dan yang digambar. Geometri ini bukan model dispersi atmosfer, lintasan asap teramati, pengukuran kualitas udara, atau konsentrasi asap. Angin 10 m tidak mewakili asap di lapisan atmosfer lebih tinggi.': 'Settlement-center counts use every grouped NASA FIRMS heat-detection cluster with a NOAA GFS 10 m surface-wind sample (global 1° grid). For performance, the map raster shows a cross-region visual sample of at most 36 clusters; layer status separates the number counted from the number drawn. This geometry is not an atmospheric-dispersion model, an observed smoke trajectory, an air-quality measurement, or smoke concentration. 10 m wind does not represent smoke in higher atmospheric layers.',
    'Laporan haze regional dan observasi: ASMC, NEA, BMKG': 'Regional haze reports and observations: ASMC, NEA, BMKG',
    'Laporan regional, observasi atmosfer, hitungan kesehatan, dan pengukuran kualitas udara memiliki waktu serta definisi berbeda dari pusat kota yang beririsan dengan plume model. Sapuan difus ASMC hanya representasi visual area yang disebut laporan, bukan batas observasi atau konsentrasi. Marker BMKG di Jakarta merangkum laporan historis. Siaran resmi BMKG mencatat asap satelit pada 16 Okt; cuplikan ringkasan Kompas mengaitkan kutipan 5-6 jam di atas 4 km dengan 20 Okt, tetapi badan artikel menyebut 16 Okt. Tanggal kutipan ditandai tidak konsisten, bukan dipastikan. Marker bukan jejak sebaran atau kondisi saat ini. BMKG menyatakan pengamatan satelit 16 Okt tidak berdampak pada kualitas udara permukaan. NEA melaporkan sebagian haze berada di atas Singapura dengan pencampuran permukaan terbatas. PM2.5/PSI adalah kualitas udara ambien, bukan konsentrasi asap spesifik. Sumber dan tanggal ada pada kartu laporan.': 'Regional reports, atmospheric observations, health counts, and air-quality measurements have different dates and definitions from city centers intersecting a modeled plume. The diffuse ASMC overlay is only a visual summary of areas named in reports, not an observation boundary or concentration. The Jakarta BMKG marker summarizes a historical report. BMKG\'s official release records satellite-observed smoke on Oct 16; a Kompas summary snippet associates a 5-6 hour quote above 4 km with Oct 20, while the article body says Oct 16. The quote date is inconsistent and is not treated as certain. The marker is not a smoke trajectory or current condition. BMKG said its Oct 16 satellite observation did not affect surface air quality. NEA reported some haze above Singapore with limited mixing to the surface. PM2.5 and PSI describe ambient air quality, not smoke-specific concentration. Sources and dates are shown on the report cards.',
    'Aerosol satelit: NASA OMPS NOAA-21': 'Satellite aerosol: NASA OMPS NOAA-21',
    'Raster harian Aerosol Index (380 nm), resolusi sekitar 12 × 10 km, dari NASA GIBS. Indeks ini menandai aerosol penyerap UV yang dapat mencakup asap, debu, atau abu vulkanik di kolom atmosfer; tidak memastikan sumbernya dan bukan PM2.5 permukaan. Data dapat terputus oleh awan, lintasan satelit, atau ketiadaan retrieval. Area transparan bukan bukti udara bersih. Atribusi: NASA GIBS / OMPS NOAA-21.': 'Daily Aerosol Index raster (380 nm), about 12 × 10 km resolution, from NASA GIBS. The index flags UV-absorbing aerosols that may include smoke, dust, or volcanic ash in the atmospheric column; it does not identify the source and is not surface PM2.5. Data may be missing because of clouds, satellite coverage, or unavailable retrievals. A transparent area is not evidence of clean air. Attribution: NASA GIBS / OMPS NOAA-21.',
    'Batas konsesi: Global Forest Watch': 'Concession boundaries: Global Forest Watch',
    'Sawit, HTI serat kayu, konsesi tebang, tambang, dan anggota RSPO. Kompilasi dapat tidak lengkap dan tahun sumbernya beragam.': 'Oil palm, timber plantations, logging concessions, mines, and RSPO members. The compilation may be incomplete and draws on sources from different years.',
    'Kota & penduduk: GeoNames (CC BY 4.0)': 'Cities & population: GeoNames (CC BY 4.0)',
    '226 permukiman Indonesia berpenduduk ≥ 50.000 jiwa di 38 provinsi.': '226 Indonesian settlements with populations of at least 50,000 across 38 provinces.',
    'Kualitas udara (US AQI) & SO₂: CAMS via Open-Meteo': 'Air quality (US AQI) & SO₂: CAMS via Open-Meteo',
    'Grid kualitas udara adalah hasil model dekat permukaan, bukan pembacaan stasiun darat. US AQI dan konsentrasi PM2.5 ditampilkan sebagai variabel yang berbeda.': 'The air-quality grid is a near-surface model output, not a ground-station reading. US AQI and PM2.5 concentration are shown as separate variables.',
    'PM2.5 total model: CAMS Global': 'Total modeled PM2.5: CAMS Global',
    'Prakiraan PM2.5 dekat permukaan, sekitar 10 m di atas tanah, dari CAMS Global via Open-Meteo Air Quality API. Ini PM2.5 total model dari semua sumber, bukan pengukuran stasiun dan bukan kontribusi khusus asap kebakaran. Resolusi native sekitar 0,4° (~45 km), keluaran model 3-jam dan pembaruan model kira-kira tiap 12 jam; sel tampilan disampel mengikuti zoom dan dapat lebih kasar. Linimasa mengambil frame 0, +6, +12, dan +18 jam serta menampilkan waktu berlaku dalam WIB. Status layer juga menyebut waktu data sumber ditarik. Layer dibatasi pada wilayah Indonesia di aplikasi ini. Atribusi: CAMS / ECMWF dan Open-Meteo.': 'Near-surface PM2.5 forecast, about 10 m above ground, from CAMS Global via the Open-Meteo Air Quality API. It is total modeled PM2.5 from all sources, not a station measurement and not the fire-smoke contribution alone. Native resolution is about 0.4° (~45 km), model output is 3-hourly and updated roughly every 12 hours; displayed cells are sampled by zoom and may be coarser. The timeline uses 0, +6, +12, and +18 hour frames and shows valid times in WIB. Layer status also shows when source data was retrieved. This app limits the layer to Indonesia. Attribution: CAMS / ECMWF and Open-Meteo.',
    'Dokumentasi variabel PM2.5': 'PM2.5 variable documentation',
    'Gempa bumi & tsunami: BMKG & NOAA PTWC': 'Earthquakes & tsunami: BMKG & NOAA PTWC',
    'Daftar gempa dari BMKG dan buletin tsunami dari NOAA PTWC. Magnitudo dan kedalaman dapat direvisi beberapa menit setelah kejadian; yang tampil adalah nilai terbaru saat data ditarik, bukan revisi akhir.': 'Earthquake listings from BMKG and tsunami bulletins from NOAA PTWC. Magnitude and depth may be revised minutes after an event; the dashboard shows the latest value available when data was retrieved, not necessarily the final revision.',
    'Pengungsi: BNPB': 'Displacement: BNPB',
    'Jumlah dan lokasi pengungsian dari layanan ArcGIS BNPB. Angka mengikuti pembaruan petugas di lapangan sehingga bisa tertinggal dari keadaan sebenarnya; sumber ini juga kerap menolak permintaan dan tidak selalu tersedia: bila begitu, panel menuliskan alasannya.': 'Displacement counts and locations come from BNPB\'s ArcGIS service. Figures depend on field updates and may lag actual conditions. The source may also reject requests or be unavailable; when that happens, the panel gives the reason.',
    'Berita: Google Berita': 'News: Google News',
    'Judul dan tautan dari RSS Google Berita (edisi Indonesia dan negara tetangga). Hak atas tulisan tetap milik penerbitnya; judul tidak kami ubah, dan isi berita tidak kami sajikan ulang.': 'Headlines and links come from Google News RSS (Indonesia and neighboring-country editions). Articles remain the publishers\' property; headlines are not altered and article text is not republished.',
    'Kekeringan & El Niño: NOAA CPC & ERA5': 'Drought & El Niño: NOAA CPC & ERA5',
    'Indeks Oceanic Niño Index dari NOAA Climate Prediction Center untuk fase El Niño/La Niña, dan reanalisis ERA5 (Open-Meteo Archive) untuk hitungan hari tanpa hujan.': 'The Oceanic Niño Index from NOAA Climate Prediction Center identifies El Niño/La Niña phases; ERA5 reanalysis (Open-Meteo Archive) is used to count days without rain.',
    'Citra satelit: Himawari-9 & Sentinel-2': 'Satellite imagery: Himawari-9 & Sentinel-2',
    'Citra awan dari Himawari-9 (JMA) dan citra optik Sentinel-2 (Copernicus). Keduanya untuk konteks visual, bukan pengukuran presisi: resolusi, tutupan awan, dan waktu perekaman berbeda dari data titik api.': 'Cloud imagery from Himawari-9 (JMA) and optical imagery from Sentinel-2 (Copernicus). Both provide visual context, not precise measurements: resolution, cloud cover, and acquisition times differ from hotspot data.',
    'Kamera web komunitas: Windy': 'Community webcams: Windy',
    'Kamera yang diunggah pengguna Windy: jalan, pelabuhan, dan pantai di kota-kota yang tidak punya kamera resmi. Windy': 'Windy user-uploaded cameras show roads, ports, and beaches in cities without official cameras. Windy',
    'tidak mengizinkan': 'does not allow',
    'daftar kamera diambil tanpa kunci: permintaan tanpa kunci dijawab': 'the camera list to be retrieved without a key: requests without a key return',
    '403': '403',
    'dengan pesan "Missing Header x-windy-api-key", dan halaman windy.com bisa menampilkannya karena aplikasi Windy memakai kunci Windy sendiri, bukan kunci yang boleh kita pinjam. Karena itu bagian ini': 'with the message "Missing Header x-windy-api-key". The windy.com page can show cameras because Windy uses its own key, which we cannot borrow. Therefore, this section',
    'belum aktif': 'Inactive',
    'selama kunci milik kita belum dipasang, dan sebabnya ditulis di layar, bukan dibiarkan kosong. Setelah env': 'until we configure our own key; the reason is shown instead of leaving the panel blank. After the',
    'WINDY_WEBCAMS_KEY': 'WINDY_WEBCAMS_KEY',
    'dipasang, daftarnya terisi sendiri. Pemakaian gratis Windy dibatasi untuk non-komersial dan mewajibkan atribusi, jadi setiap kartu menyebut Windy.com dan waktu fotonya ditampilkan apa adanya; sumber ini tidak menyatakan siaran langsung.': 'environment variable is set, the list will populate automatically. Windy\'s free use is limited to non-commercial purposes and requires attribution, so each card credits Windy.com and displays the photo time as provided; this source does not indicate a live broadcast.',
    'Lalu lintas udara: OpenSky Network & adsb.lol (ADS-B)': 'Air traffic: OpenSky Network & adsb.lol (ADS-B)',
    'Posisi pesawat sipil dari jaringan penerima ADS-B sukarela.': 'Civilian aircraft positions from the volunteer ADS-B receiver network.',
    'Bukan': 'Not',
    'radar resmi dan': 'an official radar system, and',
    'tidak lengkap': 'incomplete',
    ': di banyak wilayah Indonesia penerima tidak rapat, jadi pesawat bisa sama sekali tidak terlihat. Tidak ada lapisan militer maupun jet pribadi; yang tampil hanya lalu lintas yang memang terpancar ke jaringan publik. Ada dua jalur pengambilan, dan penyedia yang sedang dipakai selalu tertulis di keterangan lapisan. Bila sumber langsung tidak dapat dijangkau dari produksi, aplikasi memakai snapshot yang diambil penjadwal luar tiap 15 menit; snapshot yang lebih tua dari 45 menit ditolak karena langit sudah berubah. Umur data selalu ditulis, dan bila seluruh jalur gagal, itu dikatakan apa adanya.': ': receiver coverage is sparse across much of Indonesia, so aircraft may not appear. No military or private-jet layer is shown; only traffic broadcast to the public network is included. Data can come through two routes, and the active provider is stated in the layer notes. If a live source cannot be reached in production, the app uses a snapshot taken by an external scheduler every 15 minutes; snapshots older than 45 minutes are rejected because air traffic changes quickly. Data age is always shown, and total source failure is reported clearly.',
    'KAMERA & SIARAN PUBLIK': 'PUBLIC CAMERAS & STREAMS',
    'Memuat daftar siaran…': 'Loading stream list...',
    'KAMERA WEB KOMUNITAS (WINDY)': 'COMMUNITY WEBCAMS (WINDY)',
    'Memeriksa keadaan sumber…': 'Checking source status...',
    'MISI': 'MISSION',
    'Platform pemantauan bencana untuk kepentingan publik dan edukasi. Data diperbarui otomatis dari sumber resmi.': 'A public-interest and educational disaster-monitoring platform. Data refresh automatically from official sources.',
    '→ BNPB': '→ BNPB',
    '→ BMKG': '→ BMKG',
    '→ PVMBG / MAGMA ESDM': '→ PVMBG / MAGMA ESDM',
    'DARURAT': 'EMERGENCY',
    '112': '112',
    'NOMOR DARURAT': 'EMERGENCY NUMBER',
    'FUNGSI CEPAT': 'QUICK NAVIGATION',
    'Lompat ke bagian': 'Jump to section',
    'PETA': 'MAP',
    'KEJADIAN': 'EVENTS',
    'GEMPA': 'EARTHQUAKES',
    'GUNUNG API': 'VOLCANOES',
    'BERITA': 'NEWS',
    'AI': 'AI',
    'STATUS': 'STATUS',
    'CAKUPAN': 'COVERAGE',
    'Seluruh Indonesia · 94,5°-141,5°BT / 11,5°LS-6,5°LU': 'All of Indonesia · 94.5°-141.5°E / 11.5°S-6.5°N',
    'EPSG:4326 · WGS84': 'EPSG:4326 · WGS84',
    'SIAGA.ID · TERMINAL BENCANA · DATA PUBLIK · BUKAN PENGGANTI SUMBER RESMI': 'SIAGA.ID · DISASTER TERMINAL · PUBLIC DATA · NOT A SUBSTITUTE FOR OFFICIAL SOURCES',
    'Buka AI Asisten': 'Open AI assistant',
    'AI Asisten, tanya data bencana (F7)': 'AI assistant, ask about disaster data (F7)',
    'AI ASISTEN': 'AI ASSISTANT',
    'AI ASISTEN SIAGA': 'SIAGA AI ASSISTANT',
    'AI Asisten SIAGA': 'SIAGA AI assistant',
    'indeks lokal': 'local index',
    '⋮⋮ geser': '⋮⋮ drag',
    'Tutup': 'Close',
    'Tanyakan tentang data bencana': 'Ask about disaster data',
    'siapa perusahaan yang bertanggung jawab?': 'which company is responsible?',
    'JALANKAN': 'RUN',
    'konsesi': 'concessions',
    'provinsi': 'provinces',
    'udara': 'air quality',
    'gunung': 'volcanoes',
    'angin': 'wind',
    'Ajukan pertanyaan; jawaban disusun dari data langsung di dashboard ini. Contoh: ketik \'siapa perusahaan yang bertanggung jawab?\' atau klik chip di atas.': 'Ask a question; answers use live data from this dashboard. Example: type \'which company is responsible?\' or click a suggestion above.',
    'Data lokal RAG · Sumber: FIRMS, PVMBG, BMKG, BNPB, CAMS ·': 'Local data search · Sources: FIRMS, PVMBG, BMKG, BNPB, CAMS ·',
    'dan bukan pengganti sumber resmi · Darurat:': 'and not a substitute for official sources · Emergency:',
    'Tidak ada hasil untuk kueri itu.': 'No results for that query.',
    'Pencarian sedang tidak tersedia. Coba lagi.': 'Search is temporarily unavailable. Try again.',
    'MENCARI…': 'SEARCHING...',
    'Menunggu data dari sumber.': 'Waiting for source data.',
    'Data kualitas udara tidak tersedia.': 'Air-quality data is unavailable.',
    'Analisis atribusi lahan sedang tidak tersedia. Coba muat ulang.': 'Land-attribution analysis is unavailable. Try refreshing.',
    'Tidak ada data peringkat provinsi.': 'No province ranking data is available.',
    'Belum ada data peringkat provinsi.': 'No province ranking data is available yet.',
    'Analisis atribusi tidak tersedia.': 'Attribution analysis is unavailable.',
    'Pusat model belum dihitung karena medan angin NOAA GFS 10 m tidak tersedia. Ini bukan bukti tidak ada asap.': 'Modeled centers have not been calculated because NOAA GFS 10 m wind data is unavailable. This is not evidence that there is no smoke.',
    'Pencocokan prakiraan memakai daftar pusat permukiman dan bentuk model saat ini; kota baru yang mungkin masuk jalur pada jam mendatang tidak dihitung. Lingkaran peta hanya penanda lokasi, bukan batas dampak.': 'The forecast match uses the current settlement-center list and model shapes; new cities that may enter the path in future hours are not recalculated. Map circles are location markers, not impact boundaries.',
    'Yang disorot adalah pusat kota/kabupaten dari daftar model yang berada di dalam plume terpilih. Plume dan lingkaran bukan batas administrasi, paparan terukur, atau laporan resmi dampak.': 'Highlighted locations are city and regency centers from the modeled list inside the selected plume. The plume and circles are not administrative boundaries, measured exposure, or official impact reports.',
    'Daftar ini mencocokkan 226 pusat permukiman dengan poligon indikatif dari seluruh klaster FIRMS yang memiliki sampel NOAA GFS 10 m. Selubung visual di peta hanya menampilkan sampel terpilih maksimal 36 klaster, jadi sebagian sumber model tidak selalu tampak sebagai selubung tersendiri. Kategori dan lingkaran adalah penanda geometri, bukan konsentrasi, ISPU, batas administratif, orang terpapar, lintasan teramati, atau laporan resmi daerah terdampak. Laporan BMKG historis, kesehatan Kemenkes, dan haze regional ASMC/NEA ditampilkan terpisah. Klik lokasi untuk melihat bahaya lain yang tercatat di sekitarnya.': 'This list matches 226 settlement centers against indicative polygons from all FIRMS clusters with valid NOAA GFS 10 m wind samples. The map overlay shows only a selected sample of up to 36 clusters, so some modeled sources may not appear as separate shapes. Categories and circles are geometry markers, not concentrations, Indonesia\'s air-pollution standard (ISPU), administrative boundaries, people exposed, observed trajectories, or official impact reports. Historical BMKG reports, Ministry of Health reports, and ASMC/NEA regional haze reports are shown separately. Select a location to view other hazards recorded nearby.',
    'Tampilkan semua pusat kota': 'Show all city centers',
    'Plume asap indikatif,': 'Indicative smoke plume,',
    'Pilih layer asap atau PM2.5 model untuk melihat prakiraan.': 'Select the smoke or modeled PM2.5 layer to view the forecast.',
    'Tab tersembunyi, polling dijeda untuk hemat kuota.': 'Tab hidden; polling paused to conserve quota.',
    'Tab aktif kembali, data disegarkan.': 'Tab active again; data refreshed.',
    'Semua panel ditampilkan': 'All panels shown',
    'Panel disembunyikan hemat ruang, tekan T lagi untuk tampilkan': 'Panels hidden to save space; press T again to show them',
    'Tampilkan kontrol': 'Show controls',
    'Sembunyikan kontrol': 'Hide controls',
    '☰ TAMPILKAN KONTROL': '☰ SHOW CONTROLS',
    '☰ KONTROL': '☰ CONTROLS',
    '✦ EDIT AKTIF': '✦ EDITING',
    '✦ ATUR LAYOUT': '✦ EDIT LAYOUT',
    'Sembunyikan/tampilkan panel': 'Hide/show panel',
    'Sembunyikan/tampilkan filter topik': 'Hide/show topic filters',
    'Keluar layar penuh (ESC)': 'Exit full screen (ESC)',
    'Putar ulang': 'Replay',
    'Jeda': 'Pause',
    'Putar': 'Play',
    'gagal': 'failed',
    'gagal dimuat': 'failed to load',
    'sumber tidak dapat dihubungi': 'source is unreachable',
    'tidak tersedia': 'unavailable',
    'data tidak tersedia': 'data unavailable',
    'waktu tidak diketahui': 'time unknown',
    'tanggal tidak tersedia': 'date unavailable',
    'tanggal tidak diketahui': 'date unknown',
    'Metadata laporan regional tidak tersedia.': 'Regional report metadata is unavailable.',
    'Ringkasan ASMC tidak tersedia.': 'ASMC summary is unavailable.',
    'Laporan kesehatan Kemenkes tidak tersedia pada snapshot ini.': 'The Ministry of Health report is not available in this snapshot.',
    'Angka ISPA tidak tersedia': 'ARI case count unavailable',
    'jumlah kabupaten/kota tidak tersedia': 'district/city count unavailable',
    'jumlah provinsi tidak tersedia': 'province count unavailable',
    'Siaran resmi BMKG menyatakan citra satelit melihat asap sesaat memasuki Jawa bagian barat, termasuk Jabodetabek, pada 16 Okt dan mulai menjauh pada 17 Okt.': 'BMKG\'s official release says satellite imagery briefly showed smoke entering western Java, including Greater Jakarta, on Oct 16, and moving away on Oct 17.',
    'Kompas.com pada 21 Okt melaporkan kutipan Kepala BMKG: asap terlihat 5-6 jam pada ketinggian lebih dari 4 km. Cuplikan ringkasan mengarah ke 20 Okt, tetapi badan halaman Kompas yang dapat dibuka menyebut Jumat 16 Okt; tanggal kejadian tidak konsisten.': 'Kompas.com reported a BMKG chief\'s statement on Oct 21: smoke was visible for 5-6 hours at an altitude above 4 km. The search snippet points to Oct 20, but the accessible article body says Friday, Oct 16; the event date is inconsistent.',
    'Catatan tanggal: BMKG secara resmi mencatat kejadian satelit 16 Okt. Cuplikan ringkasan berita Kompas mengaitkan kutipan 5-6 jam dengan 20 Okt, sedangkan badan halaman Kompas menyebut 16 Okt. Dashboard mempertahankan kedua tanggal sebagai ketidakpastian sumber, bukan menyatukannya sebagai satu tanggal pasti.': 'Date note: BMKG officially records the satellite observation on Oct 16. A Kompas news snippet associates the 5-6 hour quote with Oct 20, while the article body says Oct 16. The dashboard keeps both dates as a source uncertainty rather than treating them as one confirmed date.',
    'BMKG menyatakan pengamatan satelit 16 Okt tidak berdampak pada kualitas udara permukaan; Kepala BMKG yang dikutip Kompas juga mengatakan asap 5-6 jam itu tidak dirasakan warga. Keduanya bukan pembacaan PM2.5 spesifik; rujuk stasiun lokal untuk kondisi udara.': 'BMKG said the Oct 16 satellite observation did not affect surface air quality. The BMKG chief quoted by Kompas also said the smoke visible for 5-6 hours was not felt by residents. Neither statement is a PM2.5 measurement; consult local stations for current air conditions.',
    'Marker hanya menunjukkan lokasi laporan Jakarta, bukan koordinat pengamatan, cakupan asap, jalur sebaran, ketebalan, atau konsentrasi.': 'The marker shows the location of the Jakarta report only, not the observation coordinates, smoke extent, trajectory, thickness, or concentration.',
    'Sapuan awan adalah ringkasan visual umum dari area yang disebut dalam laporan. Tepi bentuk bukan batas resmi, kontur pengamatan, atau pengukuran konsentrasi.': 'The cloud overlay is a generalized visual summary of areas named in reports. Its edges are not official boundaries, observation contours, or concentration measurements.',
    'Pembacaan PM2.5 dan PSI mengukur kualitas udara ambien, bukan konsentrasi asap spesifik.': 'PM2.5 and PSI readings describe ambient air quality, not smoke-specific concentration.',
    'Angka kasus ISPA adalah laporan kesehatan kumulatif, bukan jumlah penduduk terpapar dan bukan batas plume.': 'ARI case counts are cumulative health reports, not counts of exposed people or plume boundaries.',
    'Arah plume indikatif dari beberapa klaster titik api terpilih:': 'Indicative plume directions from selected hotspot clusters:',
    'Ini bukan lintasan asap teramati, model dispersi, atau pengukuran konsentrasi.': 'This is not an observed smoke trajectory, a dispersion model, or a concentration measurement.',
    'Jumlah pusat model bukan hitungan penduduk terpapar, kasus ISPA, lintasan asap teramati, atau batas resmi dampak.': 'Modeled-center counts are not counts of exposed people or ARI cases, observed smoke trajectories, or official impact boundaries.',
    'Plume asap indikatif': 'Indicative smoke plume',
    'Pusat dalam plume model belum dihitung karena angin NOAA GFS 10 m tidak tersedia. Ini bukan bukti tidak ada asap.': 'Centers inside the modeled plume have not been calculated because NOAA GFS 10 m wind data is unavailable. This is not evidence that there is no smoke.',
    'Tidak ada klaster FIRMS pada jendela data untuk menghitung pusat dalam plume model.': 'No FIRMS clusters were present in the data window for calculating centers inside the modeled plume.',
    'ASMC regional haze': 'ASMC regional haze',
    'Snapshot laporan Kemenkes tidak tersedia pada data yang dimuat.': 'The Ministry of Health report snapshot is not available in the loaded data.',
    'Snapshot laporan haze regional tidak tersedia pada data yang dimuat.': 'The regional haze report snapshot is not available in the loaded data.',
    'Data kualitas udara belum tersedia.': 'Air-quality data is not available.',
    'Data gempa BMKG belum tersedia.': 'BMKG earthquake data is not available.',
    'Belum ada angka korban yang terbaca dari berita terkini.': 'No casualty figures were found in recent news.',
    'Untuk angka resmi, lihat data pengungsi BNPB pada panel kebencanaan.': 'For official figures, see BNPB displacement data in the hazards panel.',
    'Angka berikut dikutip dari LAPORAN MEDIA, bukan data resmi BNPB:': 'The following figures are quoted from MEDIA REPORTS, not official BNPB data:',
    'Belum ada data pengungsi resmi BNPB yang aktif.': 'No active official BNPB displacement data is available.',
    'Status resmi PVMBG saat ini:': 'Current official PVMBG status:',
    'Tidak ada laporan letusan dari pos pengamatan dalam 24 jam terakhir.': 'No eruption reports from observatories in the past 24 hours.',
    'Sebaran abu hanya digambar untuk gunung yang dilaporkan meletus oleh pos pengamatan. Bentuknya indikatif dari angin ketinggian, bukan advisory resmi Darwin VAAC.': 'Ash plumes are drawn only for volcanoes reported erupting by observatories. Their shapes are indicative, based on winds aloft, and are not official Darwin VAAC advisories.',
    'Provinsi dengan titik api terbanyak:': 'Provinces with the most fire hotspots:',
    'Berita penanganan terbaru:': 'Latest response news:',
    'Sumber: BNPB. Angka mengikuti laporan BPBD dan dapat berubah.': 'Source: BNPB. Figures follow BPBD reports and may change.',
    'Sumber: laporan Kemenkes yang dikutip dalam berita; periksa tautan sumber untuk rincian dan tanggal.': 'Source: Ministry of Health figures cited in news; check the linked source for details and dates.',
    'Ringkasan situasi': 'Situation summary',
    'Pusat model tidak dihitung': 'Modeled centers not calculated',
    'Menganalisis titik api terhadap batas konsesi…': 'Analyzing hotspots against concession boundaries...',
    'Satelit: ': 'Satellite: ',
    'Titik panas': 'Hotspot confidence',
    'Angka yang ditampilkan mengikuti pengamatan lapangan.': 'Displayed figures follow field observations.',
    'Sumber arah: laporan visual petugas pos pengamatan': 'Direction source: visual report from observatory staff',
    'Sumber arah: model angin ketinggian (NOAA GFS)': 'Direction source: NOAA GFS upper-air wind model',
    'Jenis peta dasar': 'Basemap type',
    'BAIK': 'GOOD',
    'SEDANG': 'MODERATE',
    'TIDAK SEHAT': 'UNHEALTHY',
    'SANGAT TIDAK SEHAT': 'VERY UNHEALTHY',
    'BERBAHAYA': 'HAZARDOUS',
    'TIDAK SEHAT BAGI KELOMPOK SENSITIF': 'UNHEALTHY FOR SENSITIVE GROUPS',
    'BERAT': 'SEVERE',
    'RINGAN': 'LIGHT',
    'Semua': 'All',
    'Tidak ada bencana': 'No disasters reported',
    'Tidak ada data dari sumber.': 'No data from the source.',
    'Tidak ada data titik api dari sumber.': 'No hotspot data from the source.',
    'Belum ada berita yang dapat ditampilkan.': 'No news is available to display yet.',
    'Tidak ada berita yang cocok dengan pencarian.': 'No news matches this search.',
    'Kualitas udara tidak tersedia.': 'Air-quality data is unavailable.',
    'Gagal memeriksa lahan': 'Could not check land status',
    'Gagal memuat batas konsesi.': 'Could not load concession boundaries.',
    'Gagal memuat data gunung api.': 'Could not load volcano data.',
    'Gagal memuat data pemantauan. Periksa koneksi lalu tekan "Muat ulang".': 'Could not load monitoring data. Check your connection, then select "Refresh".',
    'Wilayah administratif tidak terdata.': 'Administrative region is not listed.',
    'Data curah hujan tidak tersedia.': 'Rainfall data is unavailable.',
    'Tidak ada klaster titik api terdeteksi.': 'No fire-hotspot clusters were detected.',
    'Citra Sentinel-2 belum aktif: kredensial Copernicus belum dipasang ': 'Sentinel-2 imagery is not active: Copernicus credentials have not been configured ',
    'Belum dikonfigurasi': 'Not configured',
    'Muat ulang': 'Refresh',
    'Deteksi FIRMS: ': 'FIRMS detections: ',
    'Kondisi saat ini': 'Current conditions',
    'Kondisi saat ini · indikatif': 'Current conditions · indicative',
    'Gempa bumi (BMKG)': 'Earthquakes (BMKG)',
    'Buletin tsunami (NOAA PTWC)': 'Tsunami bulletin (NOAA PTWC)',
    'Berita (Google Berita)': 'News (Google News)',
    'Titik api (NASA FIRMS)': 'Fire hotspots (NASA FIRMS)',
    'Pengungsi (BNPB)': 'Displacement (BNPB)',
    'Gunung api & sebaran abu': 'Volcanoes & ash plume',
    'Status resmi PVMBG (MAGMA)': 'Official PVMBG status (MAGMA)',
    'Laporan letusan pos pengamatan': 'Observatory eruption reports',
    'Kekeringan & El Nino': 'Drought & El Niño',
    'Siaran BMKG · 17 Okt': 'BMKG release · Oct 17',
    'Kutipan BMKG · Kompas 21 Okt': 'BMKG statement · Kompas, Oct 21',
    'Semenanjung Malaysia': 'Peninsular Malaysia',
    'Singapura': 'Singapore',
    'Kalimantan': 'Kalimantan',
    'Sumatera Selatan': 'South Sumatra',
    'Kalimantan Barat': 'West Kalimantan',
    'Kalimantan Tengah': 'Central Kalimantan',
    'Kalimantan Selatan': 'South Kalimantan',
    'Kalimantan Timur': 'East Kalimantan',
    'Papua Barat': 'West Papua',
    'Gempa M ': 'Earthquake M ',
    'Tsunami & pengungsi': 'Tsunami & displacement',
    'Korban menurut laporan media': 'Casualties in media reports',
    'BELUM RESMI': 'UNOFFICIAL',
    'Gunung api': 'Volcanoes',
    'Laporan ASMC ': 'ASMC report ',
    'Laporan NEA: ': 'NEA report: ',
    'Observasi historis BMKG: ': 'Historical BMKG observation: ',
    'Marker tidak menunjukkan konsentrasi atau batas terdampak.': 'The marker does not show concentration or an affected-area boundary.',
    'Lokasi yang disebut dalam laporan, bukan pengukuran di titik marker.': 'Location named in a report, not a measurement at the marker.',
    'Pilih bahasa': 'Choose language',
    'SUMBER': 'SOURCES'
  };

  var DYNAMIC_DICTIONARY = {
    'Peramban ini tidak menyediakan layanan lokasi.': 'This browser does not provide location services.',
    'dipicu penjadwal luar': 'externally scheduled',
    'timer internal': 'internal timer',
    'Memuat data kualitas udara…': 'Loading air-quality data...',
    'Batas tampilan peta tidak valid.': 'Invalid map viewport bounds.',
    'Gagal simpan, localStorage penuh atau blocked': 'Could not save: local storage is full or blocked.',
    'Layout default paten dimuat, klik ATUR LAYOUT untuk edit lagi': 'Default layout loaded. Select EDIT LAYOUT to customize it.',
    'JSON layout disalin ke clipboard, paste ke docs/layout-default.json untuk dipatenkan': 'Layout JSON copied to the clipboard. Paste it into docs/layout-default.json to make it the default.',
    'Layout direset ke default grid, reload halaman': 'Layout reset to the default grid. Reload the page.',
    'Mode atur layout aktif, drag header ⋮⋮ untuk geser, drag sudut kanan-bawah untuk resize. Font auto-scale ikut ukuran panel. Klik SIMPAN LOKAL jika sudah pas.': 'Layout edit mode is active. Drag a header to move a panel and its lower-right corner to resize it. Font size adjusts automatically. Select SAVE LOCALLY when the layout looks right.',
    'Mode atur selesai, layout tetap free floating. Klik ATUR LAYOUT lagi untuk edit, atau SIMPAN LOKAL untuk patenkan.': 'Edit mode ended; the layout remains free-floating. Select EDIT LAYOUT to continue, or SAVE LOCALLY to keep it.',
    'Kontrol disembunyikan, hemat ruang. Klik lagi untuk tampil.': 'Controls hidden to save space. Select the button again to show them.',
    'Kontrol ditampilkan.': 'Controls shown.',
    'AI Asisten dibuka, drag header ⋮⋮ untuk geser posisi, ketik pertanyaan tentang data bencana.': 'AI assistant opened. Drag the ⋮⋮ header to move it, then ask about disaster data.',
    'salinan lama, sumber sedang gagal': 'stale snapshot; source is currently unavailable',
    'baru saja': 'just now',
    'belum dikonfigurasi': 'not configured',
    'sumber sedang gagal': 'source unavailable',
    'belum ada sumber terdaftar': 'no sources registered yet',
    'sedang-kencang': 'moderate to strong',
    'sedang': 'moderate',
    'lemah': 'weak',
    'tenang': 'calm',
    'MODEL': 'MODEL',
    'RESMI': 'OFFICIAL',
    'KOMUNITAS': 'COMMUNITY',
    'BUKA DI WINDY': 'OPEN IN WINDY',
    'BUKA DI YOUTUBE': 'OPEN ON YOUTUBE',
    'TAMPILKAN SIARAN': 'SHOW STREAM',
    'SIARAN DISEMATKAN': 'STREAM EMBEDDED',
    'BUKA PETA KAMERA DI WINDY': 'OPEN WINDY WEBCAM MAP',
    'Log terbaru:': 'Recent logs:',
    'menunggu data sumber': 'Waiting for source data',
    'Belum ada kejadian menonjol yang terpantau.': 'No notable events are being tracked.',
    'Total': 'Total',
    'Peta dasar': 'Basemap',
    'Perusahaan: ': 'Company: ',
    'Grup korporasi: ': 'Corporate group: ',
    'Jenis alas hak: ': 'Tenure type: ',
    'Nomor izin: ': 'License number: ',
    'Komoditas: ': 'Commodity: ',
    'Luas: ': 'Area: ',
    'Sumber: ': 'Source: ',
    'Titik api: ': 'Fire hotspots: ',
    'AKTIF': 'ACTIVE',
    'TIDAK AKTIF': 'INACTIVE',
    'INDEKS LOKAL': 'LOCAL INDEX',
    'Tugas kritis': 'Critical task',
    'Data belum terukur': 'Data not yet measured',
    'Tinggi puncak': 'Summit elevation',
    'Menunggu data sumber': 'Waiting for source data',
    'Silakan coba lagi.': 'Please try again.',
    'memeriksa kualitas udara…': 'Checking air quality...',
    'Ketinggian': 'Altitude',
    'Kecepatan': 'Speed',
    'Arah': 'Heading',
    'AKTIF · data di halaman …': 'ACTIVE · page data ...',
    'ON-DEMAND · belum diminta': 'ON-DEMAND · not requested yet',
    'Meminta izin lokasi ke peramban…': 'Requesting location permission from the browser...',
    'Posisi tidak dapat dibaca.': 'Could not read your location.',
    'Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan peramban, lalu klik lagi.': 'Location permission was denied. Enable location access for this site in your browser settings, then try again.',
    'Perangkat tidak dapat membaca posisi saat ini, cek layanan lokasi (GPS) perangkat.': 'The device could not determine your current location. Check its location services or GPS.',
    'Waktu pembacaan posisi habis. Pastikan pertanyaan izin lokasi dijawab, lalu klik lagi.': 'The location request timed out. Respond to the browser permission prompt, then try again.',
    'Peta dipusatkan ke titik api terpanas saat ini sebagai gantinya.': 'The map was centered on the current highest-FRP hotspot instead.',
    'Pusat kota tidak dicocokkan ulang untuk frame plume historis.': 'City centers are not rematched for historical plume frames.',
    'Pencocokan wilayah belum tersedia. Selubung model tetap ditampilkan.': 'Regional matching is not available yet. The modeled plume remains visible.',
    'Tidak ada titik pusat dari daftar dampak saat ini di dalam poligon ini.': 'No centers from the current impact list are inside this polygon.',
    'Wilayah terdampak tidak dihitung ulang untuk frame historis.': 'Affected regions are not recalculated for historical frames.',
    'Pencocokan titik pusat kota/kabupaten belum tersedia di peramban.': 'City and regency center matching is not available in this browser.',
    'Tidak ada pusat kota dari daftar model saat ini di dalam plume ini. Lihat Wilayah > Pusat dalam plume untuk rinciannya.': 'No city centers from the current model list are inside this plume. See Regions > Centers in plume for details.',
    'Pusat kota/kabupaten disorot; daftar dibuka di Wilayah > Pusat dalam plume.': 'City and regency centers highlighted; the list is open under Regions > Centers in plume.',
    'Tidak ada data dari sumber': 'No data from the source',
    'tidak ada data dari sumber': 'no data from the source',
    'riwayat titik api belum tersedia': 'fire-hotspot history is unavailable',
    'tidak ada deteksi FIRMS': 'no FIRMS detections',
    'waktu akuisisi terbaru tidak tersedia': 'latest acquisition time is unavailable',
    'belum pernah': 'never',
    'Tingkat keyakinan': 'Confidence level',
    'Daya radiasi (FRP)': 'Fire radiative power (FRP)',
    'Keyakinan': 'Confidence',
    'Satelit': 'Satellite',
    'Koordinat': 'Coordinates',
    'malam': 'night',
    'siang': 'day',
    'Memuat wilayah administratif…': 'Loading administrative region...',
    'Wilayah administratif tidak tersedia.': 'Administrative region is unavailable.',
    'Tidak ada kejadian menonjol yang terpantau.': 'No notable events are being tracked.',
    'Tidak ada klaster FIRMS pada jendela data.': 'No FIRMS clusters in the data window.',
    'Bisa berarti lahan masyarakat, kawasan hutan negara, atau konsesi yang belum terpetakan dalam basis data terbuka.': 'This may be community land, state forest, or a concession not yet mapped in open datasets.',
    'windy': 'Windy',
    'Windy menjawab, tetapi tidak ada kamera komunitas untuk Indonesia.': 'Windy responded, but no community webcams are available for Indonesia.',
    'Windy tidak menyediakan daftar kamera tanpa kunci (permintaan tanpa kunci dijawab 403), sehingga halaman ini menyatakan keadaannya apa adanya alih-alih menampilkan kotak kosong.': 'Windy does not provide a webcam list without an API key (unauthenticated requests return 403), so this page explains the limitation instead of showing an empty box.',
    'Belum aktif: kunci API Windy belum dipasang pada lingkungan ini, jadi daftar kamera tidak diambil. Windy tidak menyediakan daftar kamera tanpa kunci (permintaan tanpa kunci dijawab 403), sehingga halaman ini menyatakan keadaannya apa adanya alih-alih menampilkan kotak kosong.': 'Inactive: a Windy API key is not configured in this environment, so the webcam list is not requested. Windy does not provide a webcam list without an API key (unauthenticated requests return 403), so this page explains the limitation instead of showing an empty box.',
    'Sumber kamera Windy sedang gagal (timeout). Tidak ada kamera yang ditampilkan, bukan berarti tidak ada kamera di sana.': 'The Windy webcam source is unavailable (timeout). No cameras are shown; this does not mean there are no cameras at that location.',
    'Daftar siaran tidak dapat dimuat (timeout). Kanalnya tetap ada di YouTube; aplikasi ini tidak menyimpan salinan siaran.': 'The stream list could not be loaded (timeout). The channels remain available on YouTube; this app does not store copies of streams.',
    'Bila kotak di atas kosong atau berbunyi tidak ada siaran, berarti kanal sedang tidak menyiarkan. Status siaran diatur YouTube, bukan diukur aplikasi ini.': 'If the player above is blank or says there is no stream, the channel is not broadcasting. YouTube controls stream status; this app does not measure it.',
    'Dasar pemeriksaan: ': 'Verification basis: ',
    'Siaran resmi BPPTKG. Yang tampil adalah data mentah stasiun pemantauan, belum diolah; interpretasi resmi ada di laporan BPPTKG dan MAGMA.': 'Official BPPTKG stream. It shows raw monitoring-station data that has not been processed; official interpretation is provided in BPPTKG and MAGMA reports.',
    'Dikelola komunitas pemantau, bukan kanal resmi. Titik kameranya berpindah sehingga tidak dipetakan; jangan dipakai sebagai dasar keputusan.': 'Operated by a monitoring community, not an official channel. Camera locations move, so they are not mapped; do not use this as a basis for decisions.',
    'Kanal komunitas yang pernah dikutip media untuk pantauan Merapi. Bukan kanal resmi dan tidak dipetakan.': 'A community channel previously cited by media for Merapi monitoring. It is not an official channel and is not mapped.',
    'Kanal resmi untuk konferensi pers dan informasi bencana. Ini kanal informasi, bukan kamera pemantau lapangan.': 'An official channel for press conferences and disaster information. It is an information channel, not a field-monitoring camera.',
    'Kanal resmi aplikasi MAGMA. Tidak ditemukan arsip siaran langsung saat diperiksa, jadi kanal ini jangan diharapkan sebagai kamera.': 'The official MAGMA app channel. No archived live stream was found during verification, so this channel should not be expected to function as a webcam.',
    'Kanal @bpptkg HTTP 200 dan arsip siaran langsungnya ditemukan (video 38SPp4vpwx4) pada 5 Okt 2026.': 'Channel @bpptkg returned HTTP 200, and an archived livestream (video 38SPp4vpwx4) was found on Oct 5, 2026.',
    'Kanal HTTP 200 dan arsip siaran langsungnya ditemukan (video iBonwqY-G0Y) pada 5 Okt 2026.': 'The channel returned HTTP 200, and an archived livestream (video iBonwqY-G0Y) was found on Oct 5, 2026.',
    'Kanal HTTP 200 dan arsip siaran langsungnya ditemukan (video 8e4RwADkxjE) pada 5 Okt 2026.': 'The channel returned HTTP 200, and an archived livestream (video 8e4RwADkxjE) was found on Oct 5, 2026.',
    'Kanal @bnpb_indonesia HTTP 200 dengan judul "BNPB Indonesia" pada 5 Okt 2026.': 'Channel @bnpb_indonesia returned HTTP 200 with the title "BNPB Indonesia" on Oct 5, 2026.',
    'Kanal @magma_indonesia HTTP 200 pada 5 Okt 2026; arsip siaran tidak ditemukan.': 'Channel @magma_indonesia returned HTTP 200 on Oct 5, 2026; no archived livestream was found.',
    'Siaran resmi': 'Official stream',
    'Model CAMS belum memberi nilai untuk titik ini.': 'The CAMS model did not return a value for this point.',
    'Di bawah acuan WHO (40 ug/m3 rata-rata 24 jam).': 'Below the WHO guideline (40 µg/m³ 24-hour average).',
    'Di atas acuan WHO. Penderita asma sebaiknya waspada.': 'Above the WHO guideline. People with asthma should take caution.',
    'Bisa memicu iritasi mata dan saluran napas.': 'May cause eye and respiratory irritation.',
    'Hindari aktivitas luar ruang di sekitar kawah.': 'Avoid outdoor activity near the crater.',
    'Kualitas udara memuaskan, risiko minim.': 'Air quality is satisfactory, with minimal risk.',
    'Kelompok sangat sensitif sebaiknya kurangi aktivitas berat di luar.': 'Highly sensitive groups should reduce strenuous outdoor activity.',
    'Anak, lansia, penderita asma/jantung batasi aktivitas luar ruang.': 'Children, older adults, and people with asthma or heart conditions should limit outdoor activity.',
    'Semua orang mulai merasakan dampak. Kurangi aktivitas luar ruang, gunakan masker N95.': 'Everyone may begin to feel effects. Reduce outdoor activity and use an N95 mask.',
    'Peringatan kesehatan. Hindari aktivitas luar ruang, gunakan penyaring udara.': 'Health alert. Avoid outdoor activity and use an air purifier.',
    'Darurat kesehatan. Tetap di dalam ruangan tertutup, ikuti arahan dinas kesehatan.': 'Health emergency. Stay indoors with windows closed and follow health-agency guidance.',
    'Laporan siaran tidak ditemukan': 'No archived stream was found',
    'lokasi tidak dicatat sumber': 'location not recorded by source',
    'location not recorded by source': 'location not recorded by source',
    'KOMPETISI': 'COMPETITION',
    'Sawit': 'Oil palm',
    'HTI kayu': 'Timber plantation',
    'HPH tebang': 'Logging concession',
    'Tambang': 'Mining',
    'RSPO': 'RSPO',
    'Foto terakhir menurut sumber': 'Latest photo according to source',
    'Waktu foto tidak dicatat sumber': 'Photo time not recorded by source',
    'Sumber lalu lintas udara tidak tersedia': 'Air-traffic source unavailable',
    'tidak ada pesawat terpancar di wilayah cakupan': 'no aircraft broadcast in the coverage area',
    'tidak semua pesawat terpancar ke penerima darat': 'not all aircraft are visible to ground receivers',
    'ketiadaan pesawat di satu wilayah bukan bukti tidak ada penerbangan': 'the absence of aircraft in one area is not evidence that no flights are operating',
    'sumber': 'source',
    'sumber Windy.com': 'source: Windy.com',
    'waktu foto milik sumber, bukan siaran langsung yang diukur di sini': 'photo timestamp comes from the source; live-stream status is not measured here',
    'status siaran milik sumber, bukan diukur di sini': 'stream status is controlled by the source and is not measured here',
    'kurasi manual': 'manually curated',
    'diperiksa': 'verified',
    'tidak dicatat': 'not recorded',
    'jumlah tidak tersedia': 'count unavailable',
    'Kompilasi peta konsesi, bukan sertifikat HGU resmi ATR/BPN.': 'Concession map compilation, not an official ATR/BPN land-use rights certificate.',
    'Indikasi awal dari kompilasi peta konsesi GFW, bukan bukti hukum.': 'Preliminary indication from the GFW concession-map compilation, not legal evidence.',
    'Data batas konsesi adalah kompilasi Global Forest Watch dari sumber pemerintah (KLHK, ESDM) dan RSPO. Ini BUKAN sertifikat HGU resmi ATR/BPN, yang tidak dipublikasikan terbuka. Titik api di dalam batas konsesi TIDAK otomatis berarti perusahaan tersebut membakar, api dapat merambat dari luar. Gunakan sebagai indikasi awal, bukan bukti hukum.': 'Concession-boundary data are a Global Forest Watch compilation of government sources (KLHK and ESDM) and RSPO. This is NOT an official ATR/BPN land-use rights certificate (HGU), which is not publicly available. A hotspot inside a concession boundary does NOT automatically mean that the company started a fire; fire may spread from outside. Use this as an initial lead, not legal evidence.',
    'Data publik ADS-B, jaringan penerima tidak rapat': 'Public ADS-B data; receiver coverage is sparse',
    'Data publik ADS-B, jaringan penerima tidak rapat.': 'Public ADS-B data; receiver coverage is sparse.',
    'data publik ADS-B, jaringan penerima tidak rapat': 'public ADS-B data; receiver coverage is sparse',
    'seluruh kotak Indonesia': 'the entire Indonesia bounding box',
    'cakupan seluruh kotak Indonesia': 'coverage across the entire Indonesia bounding box',
    'satu permintaan untuk seluruh kotak Indonesia': 'a single request for the entire Indonesia bounding box',
    '7 titik radius 400 nm (bukan seluruh wilayah)': '7 points with a 400 nm radius (not the entire area)',
    '🔥 TITIK PANAS': '🔥 HOTSPOTS',
    'status siaran bergantung pada sumber dan tidak diukur': 'stream status depends on the source and is not measured',
    'Data foto tidak dicatat sumber': 'Photo time not recorded by source',
    'normal': 'normal',
    'meningkat': 'elevated',
    'sangat tinggi': 'very high',
    'Kencang': 'Strong',
    'KALIMANTAN': 'Kalimantan',
    'Titik api sedang dimuat…': 'Loading fire hotspots...',
    'Belum ada plume indikatif yang tersedia pada data saat ini.': 'No indicative plume is available in the current data.',
    'Prakiraan PM2.5 total CAMS sedang dimuat.': 'Loading the total CAMS PM2.5 forecast.',
    'Belum ada pusat kota/kabupaten yang beririsan dengan plume indikatif saat ini.': 'No city or regency centers intersect the current indicative plume.',
    'Tidak ada gunung berstatus siaga maupun erupsi saat ini.': 'No volcanoes are currently at Watch status or reported erupting.',
    'Sebaran abu tidak dimodelkan (belum berstatus Siaga dan tidak dilaporkan erupsi)': 'Ash plume is not modeled (not at Watch status and no eruption reported).',
    'Tidak ada laporan erupsi pada laporan mingguan GVP terakhir': 'No eruption was reported in the latest GVP weekly report.',
    'Status resmi PVMBG: tidak tercatat': 'Official PVMBG status: not recorded',
    'Tidak ada kota yang diperkirakan berada di jalur sebaran abu saat ini.': 'No cities are currently estimated to be in the ash plume path.',
    'Tidak ada pengungsian aktif yang dilaporkan BNPB.': 'BNPB reports no active displacement.',
    'Tidak ada pengungsian aktif yang dilaporkan BNPB dalam jendela data ini.': 'BNPB reports no active displacement in this data window.',
    'Tidak ada gempa tercatat 24 jam terakhir': 'No earthquakes recorded in the past 24 hours',
    'tidak ada gempa tercatat 24 jam terakhir': 'no earthquakes recorded in the past 24 hours',
    'Tidak ada gunung berstatus Siaga/Awas atau dilaporkan erupsi saat ini.': 'No volcanoes are at Watch or Warning status or reported erupting at this time.',
    'Host ini memakai penjadwal luar: sumber disegarkan saat datanya diminta. Baris "AKTIF · data di halaman …" diukur dari stempel data yang SEDANG Anda baca; "ON-DEMAND · belum diminta" berarti salinan server yang menjawab status belum menerima permintaan itu, bukan bahwa sumbernya mati.': 'This host uses an external scheduler: sources refresh when their data is requested. The "ACTIVE · page data ..." row uses the timestamp of the data you are CURRENTLY viewing; "ON-DEMAND · not requested yet" means the server snapshot answering the status request has not received that data request, not that the source is offline.',
    'Tidak ada buletin tsunami yang menyangkut Indonesia saat ini. Buletin untuk kawasan Pasifik lain sengaja tidak ditampilkan.': 'No tsunami bulletins currently concern Indonesia. Bulletins for other Pacific areas are intentionally not shown.',
    'tidak ada pengungsian aktif': 'no active displacement',
    'memang tidak ada': 'none reported',
    'gagal muat': 'failed to load',
    'data angin model belum tersedia': 'modeled wind data is unavailable',
    'pusat kota/kabupaten · indikatif': 'city and regency centers · indicative',
    'Laporan haze regional belum tersedia.': 'Regional haze reports are unavailable.',
    'Laporan regional ASMC': 'ASMC regional report',
    'Haze lintas batas dilaporkan di Asia Tenggara': 'Transboundary haze reported in Southeast Asia',
    'Sapuan peta merupakan representasi umum, bukan batas resmi.': 'The map overlay is a generalized representation, not an official boundary.',
    'BMKG resmi': 'Official BMKG report',
    'Asap karhutla sempat terpantau di atas Jakarta': 'Wildfire smoke was briefly observed above Jakarta',
    'Laporan kesehatan Kemenkes': 'Ministry of Health report',
    'Laporan ISPA Kemenkes tersedia; angka tidak tersedia': 'A Ministry of Health ARI report is available; case count is unavailable',
    'Angka kesehatan bukan hitungan penduduk terpapar plume.': 'Health figures are not a count of people exposed to a plume.',
    'Data gempa sedang dimuat…': 'Loading earthquake data...',
    'Data pengungsi sedang dimuat…': 'Loading displacement data...',
    'Data gunung api sedang dimuat…': 'Loading volcano data...',
    'STATUS: OBSERVASI LAPANGAN': 'STATUS: FIELD OBSERVATION',
    'STATUS: MODEL ATMOSFER': 'STATUS: ATMOSPHERIC MODEL',
    'Perkiraan indikatif dari angin ketinggian, bukan advisory resmi VAAC.': 'Indicative estimate from upper-air winds, not an official VAAC advisory.',
    'Perkiraan model dari angin ketinggian, bukan pengukuran sebaran abu.': 'Model estimate based on upper-air winds, not a measurement of ash dispersion.',
    'Memuat grid kualitas udara dan prakiraan PM2.5 CAMS…': 'Loading the air-quality grid and CAMS PM2.5 forecast...',
    'Memuat data kekeringan…': 'Loading drought data...',
    'Tsunami': 'Tsunami',
    'Karhutla': 'Wildfires',
    'Pengungsian': 'Displacement',
    'Observasi atmosfer BMKG': 'BMKG atmospheric observation',
    'Laporan regional': 'Regional report',
    'Periksa pengukuran kualitas udara dan imbauan kesehatan resmi setempat sebelum mengambil keputusan.': 'Check local air-quality measurements and official health advisories before making a decision.',
    'Ikuti pemantauan kualitas udara lokal; plume tidak memastikan kondisi permukaan.': 'Follow local air-quality monitoring; a plume does not establish surface conditions.',
    'Tetap rujuk data kualitas udara lokal; model ini bukan penilaian kesehatan.': 'Continue to consult local air-quality data; this model is not a health assessment.',
    'Peringatan tsunami kawasan': 'Regional tsunami warning',
    'Gempa & tsunami': 'Earthquakes & tsunami',
    'Kejadian & titik api': 'Events & fire hotspots',
    'Kebijakan pusat': 'Central government policy',
    'Operasi penanganan': 'Response operations',
    'Tanggap darurat daerah': 'Regional emergency response',
    'Penegakan hukum': 'Law enforcement',
    'Dampak kesehatan & pendidikan': 'Health & education impacts',
    'Penerbangan & bandara': 'Aviation & airports',
    'aman': 'safe',
    'NIHIL': 'NONE',
    'total mengungsi': 'total displaced',
    'di posko terpusat': 'in centralized shelters',
    'mengungsi mandiri': 'self-settled',
    'titik pengungsian': 'displacement sites',
    'jiwa': 'people',
    'Berat': 'High',
    'Ringan': 'Low',
    'Awas': 'Warning',
    'Rona gelap hanya gaya visual plume indikatif berbasis angin, bukan ketebalan asap terukur, model dispersi atmosfer, maupun pengukuran kualitas udara.': 'Dark shading is only a visual style for the wind-based indicative plume, not measured smoke thickness, an atmospheric-dispersion model, or an air-quality measurement.',
    'Klik selubung untuk menyorot zona kota yang pusatnya berada di dalam poligon.': 'Click the plume shape to highlight city zones whose centers fall inside the polygon.',
    'Rekonstruksi indikatif dari deteksi FIRMS dan angin arsip NOAA GFS, bukan lintasan asap teramati atau ukuran PM2.5. Rona gelap hanya gaya visual, bukan ketebalan asap terukur. FRP adalah agregat deteksi pada interval enam jam, bukan daya api sesaat.': 'Indicative reconstruction from FIRMS detections and archived NOAA GFS winds, not an observed smoke trajectory or PM2.5 measurement. Dark shading is visual styling only, not measured smoke thickness. FRP aggregates detections over a six-hour interval; it is not instantaneous fire power.',
    'Rona gelap hanya gaya visual plume indikatif berbasis angin, bukan ketebalan asap terukur, model dispersi atmosfer, maupun pengukuran kualitas udara. Pencocokan memakai daftar pusat kota dan plume model saat ini; kota baru yang mungkin masuk jalur pada jam prakiraan tidak dihitung ulang.': 'Dark shading is visual styling for the wind-based indicative plume, not measured smoke thickness, an atmospheric-dispersion model, or an air-quality measurement. Matching uses the current city-center list and plume model; new cities that may enter the path during forecast hours are not recalculated.',
    'Siaga': 'Watch',
    'Waspada': 'Alert',
    'permukaan': 'surface',
    'Permukaan 10 m': 'Surface 10 m',
    'AUTO · ikut abu': 'AUTO · match ash layer',
    'tidak ada provinsi kering': 'no provinces with dry conditions',
    'ENSO netral': 'ENSO neutral',
    'Kekeringan ekstrem': 'Extreme drought',
    'Kekeringan parah': 'Severe drought',
    'Kekeringan sedang': 'Moderate drought',
    'Waspada kering': 'Dryness advisory',
    'tinggi tidak teramati': 'height not observed',
    'tinggi kolom tidak teramati': 'ash-column height not observed',
    'elevasi puncak tidak diketahui': 'summit elevation unknown',
    'puncak + kolom di atas puncak': 'summit elevation + column height above summit',
    'tidak ada laporan letusan 24 jam': 'no eruption reports in the past 24 hours',
    'Memuat citra Sentinel-2…': 'Loading Sentinel-2 imagery...',
    'Warna alami': 'Natural color',
    'Inframerah': 'Infrared',
    'Inframerah SWIR': 'SWIR infrared',
    'Vegetasi': 'Vegetation',
    'Kelembapan tanaman': 'Vegetation moisture',
    'Genangan air': 'Flooded area',
    'Genangan radar': 'Radar flood extent',
    'RGB Abu Vulkanik': 'Volcanic ash RGB',
    'RGB Debu': 'Dust RGB',
    'Uap air': 'Water vapor',
    'tembus awan': 'cloud-penetrating',
    'Citra Sentinel-2 beresolusi 10 m dan baru dimuat mulai zoom 7. Perbesar peta, atau buka tab Kekeringan lalu pilih sebuah provinsi untuk langsung melompat ke sana.': 'Sentinel-2 imagery has 10 m resolution and loads from zoom level 7. Zoom in, or open the Drought tab and choose a province to jump there.',
    'Citra Sentinel-2 belum aktif: kredensial Copernicus belum dipasang di server. Daftar gratis di dataspace.copernicus.eu.': 'Sentinel-2 imagery is inactive because Copernicus credentials are not configured on the server. Register for free at dataspace.copernicus.eu.',
    'Hentikan animasi dan kembali ke citra terbaru': 'Stop the animation and return to the latest image',
    'Putar enam citra terakhir untuk melihat gerak awan': 'Play the six latest images to view cloud movement',
    'tanggal perekaman tidak tersedia': 'acquisition date unavailable',
    'tidak ada citra bebas awan': 'no cloud-free imagery',
    'Lihat di peta': 'View on map',
    'Tidak ada grup korporasi teridentifikasi.': 'No corporate groups were identified.',
    'Analisis atribusi sedang berjalan…': 'Attribution analysis is in progress...',
    'Tidak ada titik api yang jatuh di dalam batas konsesi terdata.': 'No hotspots fall inside the mapped concession boundaries.',
    'Tidak berada di dalam batas konsesi yang terdata.': 'Not inside a mapped concession boundary.',
    'Status lahan pada titik ini': 'Land status at this point',
    'Memeriksa status lahan…': 'Checking land status...',
    'Memeriksa kualitas udara…': 'Checking air quality...',
    'Tidak ada batas konsesi terdata pada area ini.': 'No mapped concession boundaries in this area.',
    'Area terlalu luas, perbesar peta untuk melihat batas konsesi.': 'Area is too large. Zoom in to view concession boundaries.',
    'Perbesar peta (zoom 6+) untuk menampilkan batas konsesi.': 'Zoom in to level 6 or higher to show concession boundaries.',
    'Memuat batas konsesi…': 'Loading concession boundaries...',
    'Berita gagal dimuat.': 'News could not be loaded.',
    'Tidak ada pusat kota/kabupaten dari daftar model saat ini di dalam plume terpilih.': 'No city or regency centers from the current model list are inside the selected plume.',
    'Daftar pusat permukiman untuk pencocokan belum tersedia.': 'The settlement-center list for matching is not available yet.',
    'Tidak ada klaster FIRMS pada jendela data untuk menghitung indikasi plume.': 'No FIRMS clusters were present in the data window for calculating the indicative plume.',
    'Belum ada pusat kota/kabupaten dalam daftar model yang beririsan dengan plume indikatif saat ini.': 'No city or regency centers in the model list intersect the current indicative plume.',
    'Klik lokasi untuk melihat bahaya lain yang tercatat di sekitarnya.': 'Click a location to see other hazards recorded nearby.',
    'Klik untuk zoom ke ': 'Click to zoom to ',
    'Memuat lalu lintas udara sipil...': 'Loading civilian air traffic...',
    'tidak ada pesawat': 'no aircraft',
    'umur tidak diketahui': 'age unknown',
    'Status: di darat': 'Status: on ground',
    'Status: di udara': 'Status: airborne',
    'tidak terukur': 'not measured',
    'Tidak ada pesawat terpancar di wilayah cakupan': 'No aircraft are broadcasting in the coverage area',
    'Pesawat tanpa callsign': 'Aircraft without a callsign',
    'kontrol disembunyikan hemat ruang': 'controls hidden to save space',
    'Kontrol ditampilkan.': 'Controls shown.',
    'Kontrol disembunyikan, hemat ruang. Klik lagi untuk tampil.': 'Controls hidden to save space. Click again to show them.',
    'AI Asisten dibuka, drag header ⋮⋮ untuk geser posisi, ketik pertanyaan tentang data bencana.': 'AI assistant opened. Drag the ⋮⋮ header to move it, then ask about disaster data.',
    'Tidak ada data angin pada area ini.': 'No wind data in this area.',
    'Gagal memuat data arah angin.': 'Could not load wind data.',
    'Memuat arah angin…': 'Loading wind direction...',
    'Tidak ada data kualitas udara.': 'No air-quality data.',
    'Tidak ada data kualitas udara pada area ini.': 'No air-quality data is available in this area.',
    'Gagal memuat data kualitas udara. Akan coba lagi saat peta digeser.': 'Could not load air-quality data. Will retry when the map is moved.',
    'Prakiraan PM2.5 CAMS tidak tersedia pada area ini.': 'CAMS PM2.5 forecast is unavailable for this area.',
    'Prakiraan PM2.5 CAMS tidak tersedia saat ini.': 'CAMS PM2.5 forecast is currently unavailable.',
    'Kuota Open-Meteo tercapai. Coba lagi setelah jeda; tidak ada nilai baru yang ditampilkan.': 'Open-Meteo quota reached. Try again after a pause; no new values are being shown.',
  };

  var FRAGMENTS = [
    ['dijeda 30 mnt agar sumber tak dihujani', 'paused for 30 min to avoid overloading the source'],
    ['Pusat dalam plume indikatif terpilih', 'Selected centers inside the indicative plume'],
    ['Pusat kota/kabupaten dalam poligon', 'City and regency centers inside the polygon'],
    ['pusat kota/kabupaten', 'city and regency centers'],
    ['Pusat kota/kabupaten', 'City and regency centers'],
    ['pencocokan titik pusat kota/kabupaten', 'city and regency center matching'],
    ['jumlah orang terpapar', 'number of people exposed'],
    ['jumlah penduduk terpapar', 'number of people exposed'],
    ['bukan jumlah orang terpapar', 'not a count of people exposed'],
    ['bukan hitungan orang terpapar', 'not a count of people exposed'],
    ['bukan hitungan penduduk terpapar', 'not a count of exposed people'],
    ['bukan laporan resmi dampak', 'not an official impact report'],
    ['bukan batas administratif', 'not an administrative boundary'],
    ['bukan batas resmi', 'not an official boundary'],
    ['bukan konsentrasi asap spesifik', 'not smoke-specific concentration'],
    ['kualitas udara ambien', 'ambient air quality'],
    ['pengukuran kualitas udara', 'air-quality measurement'],
    ['model dispersi atmosfer', 'atmospheric dispersion model'],
    ['lintasan asap teramati', 'observed smoke trajectory'],
    ['ketebalan asap terukur', 'measured smoke thickness'],
    ['sampel lintas wilayah', 'cross-region sample'],
    ['tanpa angin visual yang valid', 'without valid visual wind data'],
    ['klaster titik api', 'fire-hotspot clusters'],
    ['Klaster titik api', 'Fire-hotspot clusters'],
    ['klaster FIRMS', 'FIRMS clusters'],
    ['Klaster FIRMS', 'FIRMS clusters'],
    ['plume asap indikatif', 'indicative smoke plume'],
    ['Plume asap indikatif', 'Indicative smoke plume'],
    ['sebaran asap indikatif', 'indicative smoke plume'],
    ['Sebaran asap indikatif', 'Indicative smoke plume'],
    ['plume indikatif', 'indicative plume'],
    ['Plume indikatif', 'Indicative plume'],
    ['plume model', 'modeled plume'],
    ['Plume model', 'Modeled plume'],
    ['pusat model belum dihitung', 'modeled centers have not been calculated'],
    ['Pusat model belum dihitung', 'Modeled centers have not been calculated'],
    ['angin NOAA GFS 10 m tidak tersedia', 'NOAA GFS 10 m wind data is unavailable'],
    ['angin GFS 10 m tidak tersedia', 'GFS 10 m wind data is unavailable'],
    ['angin NOAA GFS 10 m', 'NOAA GFS 10 m wind'],
    ['angin GFS 10 m', 'GFS 10 m wind'],
    ['di dalam batas konsesi', 'inside concession boundaries'],
    ['dari daftar model saat ini', 'from the current model list'],
    ['dalam poligon', 'within the polygon'],
    ['geometri indikatif', 'indicative geometry'],
    ['Geometri indikatif', 'Indicative geometry'],
    ['pemerataan sampel', 'balancing the sample'],
    ['sumber aktif', 'active sources'],
    ['external scheduler', 'external scheduler'],
    ['penjadwal luar', 'external scheduler'],
    ['timer internal', 'internal timer'],
    [' · gagal ', ' · failures '],
    [' · terakhir 429:', ' · latest 429:'],
    ['Tugas kritis', 'Critical task'],
    ['tugas kritis', 'critical task'],
    ['data dari sumber', 'data from the source'],
    ['menunggu data sumber', 'waiting for source data'],
    ['Menunggu data sumber', 'Waiting for source data'],
    ['· terdeteksi', '· detected'],
    ['titik api terdeteksi', 'fire hotspots detected'],
    ['Titik api terdeteksi', 'Fire hotspots detected'],
    ['jam tanpa hujan', 'rain-free days'],
    ['hari tanpa hujan', 'days without rain'],
    ['laporan pos pengamatan', 'observatory report'],
    ['Laporan pos pengamatan', 'Observatory report'],
    ['asap terukur', 'measured smoke'],
    ['pengungsi aktif', 'active displacement'],
    ['Laporan regional', 'Regional report'],
    ['Data kumulatif', 'Cumulative data'],
    ['data kumulatif', 'cumulative data'],
    ['dikumpulkan dari semua sumber', 'compiled from all sources'],
    ['bukan ukuran PM2.5', 'not a PM2.5 measurement'],
    ['bukan ukuran konsentrasi', 'not a concentration measurement'],
    ['bukan pengukuran stasiun', 'not a station measurement'],
    ['Update:', 'Updated:'],
    ['Sumber:', 'Source:'],
    ['sumber:', 'source:']
  ];

  var LANG_KEY = 'siaga-id-language';
  var watchedAttributes = ['title', 'aria-label', 'aria-valuetext', 'placeholder', 'alt'];
  var rawText = new WeakMap();
  var appliedText = new WeakMap();
  var rawAttributes = new WeakMap();
  var appliedAttributes = new WeakMap();
  var currentLanguage = 'id';
  var documentRef = null;
  var observer = null;

  function normalizeLanguage(language) {
    return String(language || '').toLowerCase().indexOf('en') === 0 ? 'en' : 'id';
  }

  function translatePeriod(value) {
    return String(value || '')
      .replace(/kondisi saat ini/gi, 'current conditions')
      .replace(/prakiraan \+(\d+) jam/gi, 'forecast +$1 hours')
      .replace(/(\d+)-(\d+) jam lalu/gi, '$1 to $2 hours ago')
      .replace(/(\d+) jam lalu/gi, '$1 hours ago')
      .replace(/(\d+) jam/gi, '$1 hours')
      .replace(/baru saja/gi, 'just now')
      .replace(/pada waktu yang tidak tersedia/gi, 'at an unavailable time')
      .replace(/waktu tidak tersedia/gi, 'time unavailable')
      .replace(/sekarang/gi, 'now');
  }

  function translateFireSuffix(value) {
    return String(value || '')
      .replace(/ · (\d+)j, tertua (\d+)j lalu/gi, ' · $1h window, oldest $2h ago')
      .replace(/ · (\d+)-(\d+) jam lalu/gi, ' · $1 to $2 hours ago')
      .replace(/ · daftar dipotong ke ([\d.,]+) titik terkuat \(FRP ≥ ([\d.,]+) MW\)/gi, ' · list capped at $1 strongest hotspots (FRP ≥ $2 MW)')
      .replace(/ · daftar titik memakai batas top-FRP 24 jam/gi, ' · list capped by the 24-hour top-FRP limit')
      .replace(/ · akuisisi terbaru (.+?) \(([\d.,]+) jam lalu\)/gi, ' · latest acquisition $1 ($2 hours ago)')
      .replace(/ · waktu akuisisi terbaru tidak tersedia/gi, ' · latest acquisition time unavailable')
      .replace(/\((\d+) jam lalu\)/gi, '($1 hours ago)');
  }

  function translateDirection(value) {
    var directions = {
      utara: 'north', 'timur laut': 'northeast', timur: 'east', tenggara: 'southeast',
      selatan: 'south', 'barat daya': 'southwest', barat: 'west', 'barat laut': 'northwest'
    };
    return directions[String(value || '').toLowerCase()] || value;
  }

  function translateRegionName(value) {
    var region = String(value || '');
    var names = [
      ['Kepulauan Bangka Belitung', 'Bangka Belitung Islands'], ['Kepulauan Riau', 'Riau Islands'],
      ['Nusa Tenggara Barat', 'West Nusa Tenggara'], ['Nusa Tenggara Timur', 'East Nusa Tenggara'],
      ['Kalimantan Barat', 'West Kalimantan'], ['Kalimantan Tengah', 'Central Kalimantan'],
      ['Kalimantan Selatan', 'South Kalimantan'], ['Kalimantan Timur', 'East Kalimantan'],
      ['Kalimantan Utara', 'North Kalimantan'], ['Sumatera Barat', 'West Sumatra'],
      ['Sumatera Selatan', 'South Sumatra'], ['Sumatera Utara', 'North Sumatra'],
      ['Sulawesi Barat', 'West Sulawesi'], ['Sulawesi Selatan', 'South Sulawesi'],
      ['Sulawesi Tengah', 'Central Sulawesi'], ['Sulawesi Tenggara', 'Southeast Sulawesi'],
      ['Sulawesi Utara', 'North Sulawesi'], ['Jawa Barat', 'West Java'],
      ['Jawa Tengah', 'Central Java'], ['Jawa Timur', 'East Java'],
      ['Maluku Utara', 'North Maluku'], ['Papua Barat Daya', 'Southwest Papua'],
      ['Papua Pegunungan', 'Highland Papua'], ['Papua Selatan', 'South Papua'],
      ['Papua Tengah', 'Central Papua'], ['Papua Barat', 'West Papua'],
      ['DI Yogyakarta', 'Special Region of Yogyakarta'], ['D.I. Yogyakarta', 'Special Region of Yogyakarta'],
      ['Laut Jawa', 'Java Sea'], ['Laut Banda', 'Banda Sea'], ['Laut Flores', 'Flores Sea'],
      ['Laut Sulawesi', 'Celebes Sea'], ['Laut Timor', 'Timor Sea'], ['Laut Arafura', 'Arafura Sea'],
      ['Samudra Hindia', 'Indian Ocean'], ['Samudera Hindia', 'Indian Ocean'],
      ['Asia-Pasifik', 'Asia-Pacific'], ['Asia Pasifik', 'Asia Pacific'],
      ['wilayah tidak disebut', 'area not specified']
    ];
    names.forEach(function (entry) {
      var escaped = entry[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      region = region.replace(new RegExp('(^|[^A-Za-z])' + escaped + '(?=$|[^A-Za-z])', 'gi'), function (_, prefix) {
        return prefix + entry[1];
      });
    });
    return region
      .replace(/\bKota Administratif\b/gi, 'Administrative City')
      .replace(/\bKabupaten\b/gi, 'Regency')
      .replace(/\bKab\.\s*/gi, 'Regency of ')
      .replace(/\bKecamatan\b/gi, 'District')
      .replace(/\bKota\b/gi, 'City of')
      .replace(/\bProvinsi\b/gi, 'Province of');
  }

  function translateForecastSuffix(value) {
    return String(value || '')
      .replace(/ Waktu berlaku PM2\.5:/gi, ' PM2.5 valid time:')
      .replace(/ Waktu berlaku:/gi, ' Valid time:')
      .replace(/ Data sumber diambil:/gi, ' Source data retrieved:')
      .replace(/ Waktu berlaku PM2\.5 tidak tersedia\./gi, ' PM2.5 valid time is unavailable.')
      .replace(/Dekat permukaan 10 m/gi, 'Near the surface at 10 m')
      .replace(/bukan pembacaan stasiun/gi, 'not a station reading')
      .replace(/atau kontribusi khusus asap/gi, 'or a smoke-specific contribution')
      .replace(/PM2\.5 total semua sumber/gi, 'total PM2.5 from all sources')
      .replace(/bukan khusus asap kebakaran/gi, 'not specific to wildfire smoke')
      .replace(/bukan ukuran PM2\.5/gi, 'not a PM2.5 measurement')
      .replace(/Rona gelap hanya gaya visual/gi, 'Dark shading is visual styling only')
      .replace(/Rona gelap bukan ukuran konsentrasi/gi, 'Dark shading is not a concentration measurement')
      .replace(/bukan lintasan teramati/gi, 'not an observed trajectory')
      .replace(/bukan ukuran konsentrasi/gi, 'not a concentration measurement');
  }

  function translateHistoryStatus(value) {
    var text = String(value || '');
    var match;
    if (/^Data riwayat plume belum tersedia\.$/i.test(text)) return 'Plume history is not available yet.';
    if (/^Tidak ada deteksi FIRMS pada interval ini; ini bukan bukti bahwa tidak ada kebakaran\.$/i.test(text)) {
      return 'No FIRMS detections in this interval; this does not prove that no fires are present.';
    }
    if ((match = /^([\d.,]+) deteksi FIRMS tersedia, tetapi medan angin historis tidak tersedia\. Plume tidak digambar\.$/i.exec(text))) {
      return match[1] + ' FIRMS detections are available, but historical wind fields are not. No plume is drawn.';
    }
    if ((match = /^([\d.,]+) deteksi FIRMS; plume tersedia untuk ([\d.,]+) dari ([\d.,]+) klaster\. (Hanya 14 klaster teratas yang diproses\. )?Angin NOAA GFS 10 m, grid 1° berlaku (.+)\. FRP dijumlah per klaster, bukan daya api sesaat\.$/i.exec(text))) {
      return match[1] + ' FIRMS detections; plumes are available for ' + match[2] + ' of ' + match[3] + ' clusters. '
        + (match[4] ? 'Only the top 14 clusters were processed. ' : '')
        + 'NOAA GFS 10 m wind on a 1° grid valid at ' + match[5] + '. FRP is summed per cluster, not instantaneous fire power.';
    }
    if ((match = /^([\d.,]+) deteksi FIRMS pada interval ini; NOAA GFS 10 m, grid 1° berlaku (.+)\. FRP dijumlah per klaster, bukan daya api sesaat\.$/i.exec(text))) {
      return match[1] + ' FIRMS detections in this interval; NOAA GFS 10 m wind on a 1° grid valid at ' + match[2]
        + '. FRP is summed per cluster, not instantaneous fire power.';
    }
    return text;
  }

  function translateTaskId(value) {
    var tasks = {
      kebencanaan: 'disaster monitoring', kejadian: 'events and hotspots', pusat: 'national policy',
      penanganan: 'response operations', daerah: 'regional emergency response',
      penegakan: 'law enforcement', kesehatan: 'health and education impacts',
      penerbangan: 'aviation and airports', hotspots: 'fire hotspots', volcano: 'volcano data',
      eruption: 'eruption reports', news: 'news', drought: 'drought data',
      attribution: 'hotspot attribution', air: 'air quality', wind: 'wind data',
      tsunami: 'tsunami bulletins', shelter: 'displacement data', overview: 'overview data'
    };
    var id = String(value || '');
    return tasks[id.toLowerCase()] || id;
  }

  function translateDynamic(text) {
    var match;
    if ((match = /^(.*) Peta dipusatkan ke titik api terpanas saat ini sebagai gantinya\.$/i.exec(text))) {
      return translateCore(match[1]) + ' ' + translateCore('Peta dipusatkan ke titik api terpanas saat ini sebagai gantinya.');
    }
    if ((match = /^(\d[\d.,]*) kejadian dan laporan dipantau$/i.exec(text))) {
      return match[1] + ' events and reports monitored';
    }
    if ((match = /^Perlu perhatian · (\d+) peristiwa$/i.exec(text))) {
      return 'Needs attention · ' + match[1] + ' events';
    }
    if ((match = /^([\d.,]+) artikel · diperbarui (.+?)(?: \((.+)\))?$/i.exec(text))) {
      return match[1] + ' articles · updated ' + match[2] + (match[3] ? ' (' + translatePeriod(match[3]) + ')' : '');
    }
    if ((match = /^(.+?)\s+([\d.,]+)$/i.exec(text))) {
      var topicLabel = translateCore(match[1]);
      if (topicLabel !== match[1]) return topicLabel + ' ' + match[2];
    }
    if ((match = /^([\d.,]+) dari ([\d.,]+) titik api ditampilkan \(NASA FIRMS VIIRS, 24 jam\)\.$/i.exec(text))) {
      return match[1] + ' of ' + match[2] + ' fire hotspots shown (NASA FIRMS VIIRS, 24 hours).';
    }
    if ((match = /^([\d.,]+) sampel PM2\.5 total CAMS\. Bukan kontribusi khusus asap\.$/i.exec(text))) {
      return match[1] + ' total CAMS PM2.5 samples. Not a smoke-specific contribution.';
    }
    if ((match = /^([\d.,]+) sel kualitas udara \(filter: ([\d.,]+) tampil\) · model CAMS via Open-Meteo\.$/i.exec(text))) {
      return match[1] + ' air-quality cells (' + match[2] + ' shown after filtering) · CAMS model via Open-Meteo.';
    }
    if ((match = /^Kuota udara tercapai, coba lagi ([\d.,]+) detik\. Memakai cache terakhir\.$/i.exec(text))) {
      return 'Air-data quota reached; try again in ' + match[1] + ' seconds. Showing the most recent cache.';
    }
    if ((match = /^Filter AQI ≥ ([\d.,]+) direset, menampilkan semua ([\d.,]+) sel\.$/i.exec(text))) {
      return 'AQI filter reset; showing all ' + match[2] + ' cells.';
    }
    if ((match = /^Filter AQI direset, menampilkan semua ([\d.,]+) sel\.$/i.exec(text))) {
      return 'AQI filter reset; showing all ' + match[1] + ' cells.';
    }
    if ((match = /^Filter AQI ≥ ([\d.,]+), ([\d.,]+) sel ditampilkan\. Klik Reset untuk tampil semua\.$/i.exec(text))) {
      return 'AQI filter ≥ ' + match[1] + '; ' + match[2] + ' cells shown. Select Reset to show all.';
    }
    if ((match = /^Filter AQI ≥ ([\d.,]+), ([\d.,]+) dari ([\d.,]+) sel ditampilkan\.$/i.exec(text))) {
      return 'AQI filter ≥ ' + match[1] + '; ' + match[2] + ' of ' + match[3] + ' cells shown.';
    }
    if ((match = /^Filter: AQI ≥ ([\d.,]+)$/i.exec(text))) return 'Filter: AQI ≥ ' + match[1];
    if ((match = /^Klik untuk filter AQI ≥ ([\d.,]+)$/i.exec(text))) return 'Click to filter AQI ≥ ' + match[1];
    if ((match = /^([\d.,]+)(?:\/([\d.,]+))? sel$/i.exec(text))) return match[1] + (match[2] ? '/' + match[2] : '') + ' cells';
    if ((match = /^Resolusi: ([\d.,]+)° \(~([\d.,]+) km\) · Zoom untuk detail$/i.exec(text))) {
      return 'Resolution: ' + match[1].replace(',', '.') + '° (~' + match[2] + ' km) · Zoom in for details';
    }
    if ((match = /^Kualitas udara, US AQI ([\d.,]+)$/i.exec(text))) return 'Air quality, US AQI ' + match[1];
    if ((match = /^Kategori: (.+)$/i.exec(text))) return 'Category: ' + translateCore(match[1]);
    if ((match = /^PM2,5: (.+) µg\/m³$/i.exec(text))) return 'PM2.5: ' + match[1] + ' µg/m³';
    if ((match = /^PM10: (.+) µg\/m³$/i.exec(text))) return 'PM10: ' + match[1] + ' µg/m³';
    if ((match = /^Nilai model: (.+) µg\/m³$/i.exec(text))) return 'Modeled value: ' + match[1] + ' µg/m³';
    if ((match = /^Ketinggian representatif: sekitar (.+) m di atas tanah\.$/i.exec(text))) return 'Representative height: about ' + match[1] + ' m above ground.';
    if ((match = /^Sampel tampilan: (.+)°; grid native CAMS Global: sekitar (.+)° \(~(.+) km\)\.$/i.exec(text))) {
      return 'Display sample: ' + match[1] + '°; CAMS Global native grid: about ' + match[2] + '° (~' + match[3] + ' km).';
    }
    if ((match = /^([\d.,]+) sampel PM2\.5 model total\.(.*)$/i.exec(text))) {
      return match[1] + ' total modeled PM2.5 samples.' + translateForecastSuffix(match[2]);
    }
    if ((match = /^Tidak ada nilai model valid pada frame ini\.(.*)$/i.exec(text))) {
      return 'No valid modeled values in this frame.' + translateForecastSuffix(match[1]);
    }
    if (/^Data PM2\.5 historis CAMS tidak tersedia sebelum frame 0\.$/i.test(text)) {
      return 'Historical CAMS PM2.5 data is unavailable before frame 0.';
    }
    if ((match = /^CAMS Global native 0,4° \(~45 km\), 3 jam\. Sampel tampilan ([\d.,]+)° \(~([\d.,]+) km\)\. Warna bukan kategori kesehatan\.$/i.exec(text))) {
      return 'CAMS Global native resolution: 0.4° (~45 km), 3-hourly. Display sample: ' + match[1] + '° (~' + match[2] + ' km). Colors are not health categories.';
    }
    if ((match = /^Plume asap indikatif, frame (.+?), dari model angin dan deteksi FIRMS 24 jam terakhir; bukan ukuran PM2\.5\. PM2\.5 CAMS Global adalah total semua sumber pada frame yang sama\. Rona gelap bukan ukuran konsentrasi\.(.*)$/i.exec(text))) {
      return 'Indicative smoke plume, frame ' + translatePeriod(match[1]) + ', from the wind model and FIRMS detections over the past 24 hours; not a PM2.5 measurement. CAMS Global PM2.5 is the total from all sources for the same frame. Dark shading is not a concentration measurement.' + translateForecastSuffix(match[2]);
    }
    if ((match = /^PM2\.5 total model CAMS Global, frame (.+?), dekat permukaan 10 m; bukan khusus asap kebakaran\.(.*)$/i.exec(text))) {
      return 'CAMS Global total modeled PM2.5, frame ' + translatePeriod(match[1]) + ', near the surface at 10 m; not specific to wildfire smoke.' + translateForecastSuffix(match[2]);
    }
    if ((match = /^Kondisi angin saat ini dan deteksi FIRMS 24 jam terakhir\. Plume indikatif, bukan ukuran PM2\.5\. Rona gelap hanya gaya visual\.$/i.exec(text))) {
      return 'Current wind conditions and FIRMS detections over the past 24 hours. The plume is indicative, not a PM2.5 measurement. Dark shading is visual styling only.';
    }
    if ((match = /^Prakiraan \+(\d+) jam dari deteksi FIRMS 24 jam terakhir dan angin model\. Bukan ukuran PM2\.5\. Rona gelap hanya gaya visual\.$/i.exec(text))) {
      return 'Forecast +' + match[1] + ' hours from FIRMS detections over the past 24 hours and modeled winds. Not a PM2.5 measurement. Dark shading is visual styling only.';
    }
    if ((match = /^Plume asap indikatif, (.+?)\. (.+?) Rekonstruksi berbasis model angin dan intensitas titik api, bukan lintasan teramati atau ukuran PM2\.5\. Rona gelap hanya gaya visual\.$/i.exec(text))) {
      return 'Indicative smoke plume, ' + translatePeriod(match[1]) + '. ' + translateHistoryStatus(match[2]) + ' Reconstruction based on modeled wind and hotspot intensity, not an observed trajectory or PM2.5 measurement. Dark shading is visual styling only.';
    }
    if ((match = /^Aktifkan layer asap untuk melihat riwayat (.+)\. (.+)$/i.exec(text))) {
      return 'Turn on the smoke layer to view history for ' + translatePeriod(match[1]) + '. ' + translateHistoryStatus(match[2]);
    }
    if ((match = /^(\d+)\/(\d+) sumber aktif$/i.exec(text))) {
      return match[1] + '/' + match[2] + ' active sources';
    }
    if (text.indexOf(' · ') < 0 && /^(?:Kota(?: Administratif)?\b|Kabupaten\b|Kab\.\s|Provinsi\b|Kecamatan\b|(?:Kalimantan|Sumatera|Sulawesi|Jawa|Maluku|Nusa Tenggara|Kepulauan|Papua)\b|D\.?I\.?\s+Yogyakarta\b)/i.test(text)) {
      var translatedRegion = translateRegionName(text);
      if (translatedRegion !== text) return translatedRegion;
    }
    if ((match = /^·\s*(.+)$/i.exec(text))) return '· ' + translateCore(match[1]);
    if ((match = /^⚠(?:️)? perbesar peta ke zoom ([\d.,]+)\+ agar citra muncul$/i.exec(text))) {
      return '⚠ zoom the map to level ' + match[1] + '+ to show imagery';
    }
    if ((match = /^⚠(?:️)?\s*(\d+) tugas kritis gagal berturut:$/i.exec(text))) {
      return '⚠️ ' + match[1] + ' consecutive critical task failures:';
    }
    if ((match = /^⚠\s*(.+)$/i.exec(text))) {
      var kinds = { api: 'fire', gunung: 'volcano', gempa: 'earthquake', pengungsi: 'displacement', udara: 'air quality' };
      return '⚠ ' + match[1].split('+').map(function (kind) { return kinds[kind] || kind; }).join('+');
    }
    if ((match = /^Gempa M ([^,]+), (.+)$/i.exec(text))) return 'Earthquake M' + match[1] + ', ' + translateRegionName(match[2]);
    if ((match = /^terkini M ([\d.,]+)(?: · (.+))?$/i.exec(text))) {
      return 'latest M' + match[1] + (match[2] ? ' · ' + translateRegionName(match[2]) : '');
    }
    if ((match = /^nihil 24 jam · terakhir M ([\d.,]+), ([\d.,]+) jam lalu$/i.exec(text))) {
      return 'none in the past 24 hours · latest M' + match[1] + ', ' + match[2] + ' hours ago';
    }
    if ((match = /^nihil · terakhir ([\d.,]+) hari lalu$/i.exec(text))) return 'none reported · last reported ' + match[1] + ' days ago';
    if ((match = /^([\d.,]+) gempa M ≥ 5$/i.exec(text))) return match[1] + ' earthquakes M ≥ 5';
    if ((match = /^kedalaman ([\d.,]+) km$/i.exec(text))) return 'depth ' + match[1] + ' km';
    if ((match = /^Dirasakan: (.+)$/i.exec(text))) return 'Felt: ' + translateRegionName(match[1]);
    if ((match = /^Status BMKG: (.+)$/i.exec(text))) return 'BMKG status: ' + translateCore(match[1]);
    if ((match = /^([\d.,]+) kota terdampak$/i.exec(text))) return match[1] + ' affected cities and regencies';
    if ((match = /^([\d.,]+) pusat kota\/kabupaten dalam plume indikatif$/i.exec(text))) return match[1] + ' city and regency centers inside the indicative plume';
    if ((match = /^pusat model tidak dihitung, angin GFS tidak tersedia$/i.exec(text))) return 'modeled centers not calculated; GFS wind data unavailable';
    if ((match = /^Pusat kota\/kabupaten dalam poligon: (.+)$/i.exec(text))) {
      return 'City and regency centers inside polygon: ' + translateRegionName(match[1]).replace(/; \+([\d.,]+) lainnya$/i, '; +$1 more');
    }
    if ((match = /^([\d.,]+) plume indikatif dari klaster FIRMS dan angin NOAA GFS; bukan lintasan asap teramati atau ukuran konsentrasi\.$/i.exec(text))) {
      return match[1] + ' indicative plumes from FIRMS clusters and NOAA GFS winds; not observed smoke trajectories or concentration measurements.';
    }
    if ((match = /^([\d.,]+) sampel PM2\.5 total model CAMS, bukan khusus asap\.$/i.exec(text))) {
      return match[1] + ' CAMS total modeled PM2.5 samples, not smoke-specific.';
    }
    if ((match = /^([\d.,]+) pusat kota\/kabupaten masuk area plume indikatif saat ini\. Ini bukan hitungan dampak kesehatan, orang terpapar, atau batas resmi\.$/i.exec(text))) {
      return match[1] + ' city and regency centers inside the current indicative plume area. This is not a health-impact count, a count of people exposed, or an official boundary.';
    }
    if ((match = /^([\d.,]+) titik medan angin · (.+)\. Garis mengalir ke arah asap terbawa\.$/i.exec(text))) {
      var windSource = match[2].replace(/, angin /gi, ' wind at ').replace(/siklus /gi, 'run ')
        .replace(/permukaan/gi, 'surface');
      return match[1] + ' wind-field points · ' + windSource + '. Streamlines indicate the direction in which smoke may be carried.';
    }
    if ((match = /^(\d+) hPa \(~([\d.,]+) km\)$/i.exec(text))) return match[1] + ' hPa (~' + match[2].replace(',', '.') + ' km)';
    if ((match = /^([\d.,]+) gempa tercatat 24 jam terakhir(?: · terkini M ([\d.,]+))? \(BMKG\)\.$/i.exec(text))) {
      return match[1] + ' earthquakes recorded in the past 24 hours' + (match[2] ? ' · latest M' + match[2] : '') + ' (BMKG).';
    }
    if ((match = /^([\d.,]+) jiwa mengungsi di ([\d.,]+) kejadian \(BNPB\)\.$/i.exec(text))) return match[1] + ' people displaced in ' + match[2] + ' events (BNPB).';
    if ((match = /^Status iklim: (.+?) \(ONI ([\d.,]+), (.+?) (\d{4})(?:, (.+?))?\)\. El Niño meningkatkan peluang kemarau panjang tetapi tidak menentukannya, status tiap provinsi di bawah dihitung dari curah hujan yang benar-benar terukur, bukan dari indeks ini\.$/i.exec(text))) {
      var ensoPhase = { Netral: 'Neutral', 'El Niño': 'El Niño', 'La Niña': 'La Niña' }[match[1]] || match[1];
      var ensoTrend = { menguat: 'strengthening', mereda: 'easing', tetap: 'steady' }[match[5]] || match[5];
      return 'Climate status: ' + ensoPhase + ' (ONI ' + match[2] + ', ' + match[3] + ' ' + match[4]
        + (ensoTrend ? ', ' + ensoTrend : '') + '). El Niño increases the likelihood of prolonged dry conditions but does not determine them. Province statuses below are based on measured rainfall, not this index.';
    }
    if ((match = /^Hari tanpa hujan beruntun sampai (.+) · jendela ([\d.,]+) hari · sumber Open-Meteo \(ERA5\)\. Tombol "citra" memindahkan peta ke provinsi itu dan menyalakan lapisan kelembapan tanaman\.$/i.exec(text))) {
      return 'Consecutive dry days through ' + match[1] + ' · ' + match[2] + '-day window · source: Open-Meteo (ERA5). The "imagery" button centers the map on the province and enables the vegetation-moisture layer.';
    }
    if ((match = /^terkering (.+) ([\d.,]+) hari$/i.exec(text))) return 'driest: ' + translateRegionName(match[1]) + ' · ' + match[2] + ' days';
    if ((match = /^tanpa hujan · hujan 30 hari ([\d.,]+) mm · (.+)$/i.exec(text))) return 'no rain · 30-day rainfall ' + match[1] + ' mm · ' + translateCore(match[2]);
    if ((match = /^Lihat citra satelit (.+)$/i.exec(text))) return 'View satellite imagery for ' + translateRegionName(match[1]);
    if ((match = /^Memuat citra Sentinel-2, satelit melintas tiap 5 hari, jadi ini bukan citra hari ini\. Tanggal perekaman tampil di panel citra\.$/i.exec(text))) {
      return 'Loading Sentinel-2 imagery. The satellite passes every 5 days, so this is not a same-day image. The acquisition date is shown in the imagery panel.';
    }
    if ((match = /^Prakiraan \+([\d.,]+) jam(?: · siklus GFS (.+))?$/i.exec(text))) {
      return 'Forecast +' + match[1] + ' hours' + (match[2] ? ' · GFS run ' + match[2] : '');
    }
    if ((match = /^([\d.,]+) hari tanpa hujan$/i.exec(text))) return match[1] + ' days without rain';
    if ((match = /^([\d.,]+) hari$/i.exec(text))) return match[1] + ' days';
    if ((match = /^terbanyak (.+) · (.+)$/i.exec(text))) return 'most in ' + translateRegionName(match[1]) + ' · ' + translateCore(match[2]);
    if ((match = /^([\d.,]+) pusat kota\/kabupaten dalam plume indikatif dari ([\d.,]+)\/([\d.,]+) klaster berangin$/i.exec(text))) {
      return match[1] + ' city and regency centers in the indicative plume from ' + match[2] + '/' + match[3] + ' wind-sampled clusters';
    }
    if ((match = /^Klaster api terdekat (.+) km · arah (.+)$/i.exec(text))) {
      return 'Nearest fire cluster ' + match[1] + ' km · direction ' + translateDirection(match[2]);
    }
    if ((match = /^Waktu model (.+) · kategori model (.+?)(?: · ⚠ (.+))?$/i.exec(text))) {
      var dangerKinds = { api: 'fire', gunung: 'volcano', gempa: 'earthquake', pengungsi: 'displacement', udara: 'air quality' };
      var translatedKinds = (match[3] || '').split('+').map(function (kind) { return dangerKinds[kind] || kind; }).join('+');
      var modelLevel = { Berat: 'High', Sedang: 'Moderate', Ringan: 'Low' }[match[2]] || match[2];
      return 'Model ETA: ' + translateDynamic(match[1]) + ' · model category ' + modelLevel + (translatedKinds ? ' · ⚠ ' + translatedKinds : '');
    }
    if ((match = /^Erupsi (.+)$/i.exec(text))) return 'Eruption at ' + match[1];
    if ((match = /^(\d+)x letusan$/i.exec(text))) return match[1] + ' eruptions';
    if ((match = /^kolom ([\d.,]+) m di atas puncak$/i.exec(text))) return 'ash column ' + match[1] + ' m above the summit';
    if ((match = /^condong ke (.+)$/i.exec(text))) return 'drifting toward ' + translateDirection(match[1]);
    if (/^tinggi kolom tidak teramati$/i.test(text)) return 'ash-column height not observed';
    if ((match = /^M ([\d.,]+), (.+)$/i.exec(text))) return 'Magnitude ' + match[1] + ' earthquake, ' + translateRegionName(match[2]);
    if ((match = /^kedalaman ([\d.,]+) km(?: · dirasakan (.+))?$/i.exec(text))) {
      return 'depth ' + match[1] + ' km' + (match[2] ? ' · felt ' + match[2] : '');
    }
    if ((match = /^([\d.,]+) jiwa mengungsi$/i.exec(text))) return match[1] + ' people displaced';
    if ((match = /^([\d.,]+) provinsi dilanda kekeringan$/i.exec(text))) return match[1] + ' provinces affected by drought';
    if ((match = /^terparah (.+) · (\d+) hari tanpa hujan(?: · (.+))?$/i.exec(text))) {
      return 'worst affected: ' + translateRegionName(match[1]) + ' · ' + match[2] + ' days without rain'
        + (match[3] ? ' · ' + translateFragments(match[3]) : '');
    }
    if ((match = /^([\d.,]+) meletus · ([\d.,]+) dipantau · laporan pos pengamatan PVMBG(?: · status tersimpan \(MAGMA tidak merespons\))?$/i.exec(text))) {
      return match[1] + ' erupting · ' + match[2] + ' monitored · PVMBG observatory reports'
        + (/status tersimpan/.test(text) ? ' · cached status (MAGMA did not respond)' : '');
    }
    if ((match = /^Awas (\d+) · Siaga (\d+) · Waspada (\d+)$/i.exec(text))) {
      return 'Warning ' + match[1] + ' · Watch ' + match[2] + ' · Alert ' + match[3];
    }
    if ((match = /^(\d+) Awas, (\d+) Siaga, (\d+) Waspada \(PVMBG\)$/i.exec(text))) {
      return match[1] + ' Warning, ' + match[2] + ' Watch, ' + match[3] + ' Alert (PVMBG)';
    }
    if ((match = /^([\d.,]+) gunung aktif dipantau di peta(?:, status PVMBG: (.+))?\.?$/i.exec(text))) {
      var volcanoCountStatus = (match[2] || '').replace(/(\d+) Awas/g, '$1 Warning')
        .replace(/(\d+) Siaga/g, '$1 Watch').replace(/(\d+) Waspada/g, '$1 Alert');
      return match[1] + ' active volcanoes monitored on the map' + (volcanoCountStatus ? ', PVMBG status: ' + volcanoCountStatus : '');
    }
    if ((match = /^([\d.,]+) gunung dilaporkan meletus pos pengamatan dalam 24 jam, ([\d.,]+) dipantau \(status minimal Waspada\)\.(?: Status resmi PVMBG: ([\d.,]+) Awas, ([\d.,]+) Siaga, ([\d.,]+) Waspada\.)?(?: \(status dari data tersimpan\))?$/i.exec(text))) {
      return match[1] + ' volcanoes reported erupting by observatories in the past 24 hours; '
        + match[2] + ' monitored (Watch status or higher).'
        + (match[3] ? ' Official PVMBG status: ' + match[3] + ' Warning, ' + match[4] + ' Watch, ' + match[5] + ' Alert.' : '')
        + (/status dari data tersimpan/i.test(text) ? ' (status from cached data)' : '');
    }
    if ((match = /^Status resmi PVMBG: Level (.+), (Awas|Siaga|Waspada|Normal)$/i.exec(text))) {
      return 'Official PVMBG status: Level ' + match[1] + ', '
        + ({ Awas: 'Warning', Siaga: 'Watch', Waspada: 'Alert', Normal: 'Normal' }[match[2]] || match[2]);
    }
    if ((match = /^([\d.,]+) gunung meletus \(24 jam\)(?: · (.+))?\.$/i.exec(text))) {
      var statusText = (match[2] || '').replace(/(\d+) Awas/g, '$1 Warning')
        .replace(/(\d+) Siaga/g, '$1 Watch').replace(/(\d+) Waspada/g, '$1 Alert');
      return match[1] + ' volcanoes erupted (past 24 hours)' + (statusText ? ' · ' + statusText : '') + '.';
    }
    if ((match = /^riwayat titik api belum tersedia · (.+)$/i.exec(text))) {
      return 'Fire-hotspot history is unavailable · ' + translatePeriod(match[1]);
    }
    if ((match = /^tidak ada deteksi FIRMS · (.+)$/i.exec(text))) {
      return 'No FIRMS detections · ' + translatePeriod(match[1]);
    }
    if ((match = /^([\d.,]+) dari ([\d.,]+) (lolos filter|tampil)(.*)$/i.exec(text))) {
      return match[1] + ' of ' + match[2] + (match[3] === 'tampil' ? ' shown' : ' pass the filter')
        + translateFireSuffix(match[4]);
    }
    if ((match = /^([\d.,]+) titik((?: · .*)?)$/i.exec(text))) {
      return match[1] + ' hotspots' + translateFireSuffix(match[2]);
    }
    if ((match = /^([\d.,]+) titik api$/i.exec(text))) return match[1] + ' fire hotspots';
    if ((match = /^([\d.,]+) klaster$/i.exec(text))) return match[1] + ' clusters';
    if ((match = /^titik · FRP ([\d.,]+) MW$/i.exec(text))) return 'hotspots · FRP ' + match[1] + ' MW';
    if ((match = /^(\d+) detik lalu$/i.exec(text))) return match[1] + ' sec ago';
    if ((match = /^(\d+) mnt lalu$/i.exec(text))) return match[1] + ' min ago';
    if ((match = /^(\d+) menit lalu$/i.exec(text))) return match[1] + ' min ago';
    if ((match = /^(\d+) jam lalu$/i.exec(text))) return match[1] + ' hr ago';
    if ((match = /^(\d+) hari lalu$/i.exec(text))) return match[1] + (match[1] === '1' ? ' day ago' : ' days ago');
    if ((match = /^AKTIF · data di halaman (.+)$/i.exec(text))) return 'ACTIVE · page data ' + translateDynamic(match[1]);
    if ((match = /^AKTIF · (.+)$/i.exec(text))) return 'ACTIVE · ' + translateDynamic(match[1]);
    if ((match = /^ON-DEMAND · belum diminta$/i.exec(text))) return 'ON-DEMAND · not requested yet';
    if ((match = /^data di halaman (.+)$/i.exec(text))) return 'page data ' + translateDynamic(match[1]);
    if ((match = /^run (\d+)\/(\d+)$/i.exec(text))) return 'runs: ' + match[1] + ' · failures: ' + match[2];
    if ((match = /^galat terakhir (.+) UTC$/i.exec(text))) return 'last error at ' + match[1] + ' UTC';
    if ((match = /^gagal (\d+)×$/i.exec(text))) return match[1] + ' consecutive failures';
    if (/^TIDAK AKTIF$/i.test(text)) return 'INACTIVE';
    if ((match = /^CACHE (.+)$/i.exec(text))) return 'CACHED · ' + translateDynamic(match[1]);
    if ((match = /^TERLAMBAT · (.+)$/i.exec(text))) return 'LATE · ' + translateDynamic(match[1]);
    if ((match = /^(⚠️ )?(\d+) tugas kritis gagal berturut:$/i.exec(text))) return (match[1] || '') + match[2] + ' consecutive critical task failures:';
    if ((match = /^Perkiraan posisi Anda ditandai pada peta(?: \(±(\d+) m\))?\.$/i.exec(text))) {
      return 'Your approximate location is marked on the map' + (match[1] ? ' (±' + match[1] + ' m)' : '') + '.';
    }
    if (/^Perkiraan sebaran asap$/i.test(text)) return 'Indicative smoke plume';
    if ((match = /^Prakiraan sebaran \+([\d.,]+) jam$/i.exec(text))) return 'Plume forecast +' + match[1] + ' hours';
    if ((match = /^Rekonstruksi plume (.+)$/i.exec(text))) return 'Plume reconstruction ' + translatePeriod(match[1]);
    if (/^GUNUNG ERUPSI$/i.test(text)) return 'ERUPTING VOLCANOES';
    if ((match = /^Gunung ([^·]+)$/i.exec(text))) return 'Mount ' + match[1];
    if ((match = /^Posisi tidak dapat dibaca: (.+)$/i.exec(text))) return 'Could not read location: ' + match[1];
    if ((match = /^Daya radiasi \(FRP\): (.+) MW$/i.exec(text))) return 'Fire radiative power (FRP): ' + match[1] + ' MW';
    if ((match = /^Tingkat keyakinan: (\d+)%$/i.exec(text))) return 'Confidence level: ' + match[1] + '%';
    if ((match = /^Waktu: (.+)$/i.exec(text))) return 'Time: ' + translateDynamic(match[1]);
    if ((match = /^Satelit: (.+?)(?: · (malam|siang))?$/i.exec(text))) {
      return 'Satellite: ' + match[1] + (match[2] ? ' · ' + (match[2] === 'malam' ? 'night' : 'day') : '');
    }
    if ((match = /^Koordinat: (.+)$/i.exec(text))) return 'Coordinates: ' + match[1];
    if ((match = /^Wilayah: (.+)$/i.exec(text))) return 'Region: ' + translateRegionName(match[1]);
    if ((match = /^Wilayah administratif: (.+)$/i.exec(text))) return 'Administrative region: ' + translateRegionName(match[1]);
    if ((match = /^(\d+) pusat kota\/kabupaten disorot; daftar dibuka di Wilayah > Pusat dalam plume\.$/i.exec(text))) {
      return match[1] + ' city and regency centers highlighted; list opened under Regions > Centers in plume.';
    }
    if ((match = /^Pusat dalam plume indikatif terpilih · ([\d.,]+) kota\/kabupaten · (.+)$/i.exec(text))) {
      return 'Selected centers inside the indicative plume · ' + match[1] + ' cities/regencies · ' + translatePeriod(match[2]);
    }
    if ((match = /^Pusat kota dalam plume indikatif · ([\d.,]+) lokasi$/i.exec(text))) return 'City centers inside the indicative plume · ' + match[1] + ' locations';
    if ((match = /^Pusat kota dalam plume model: (.+)$/i.exec(text))) return 'City center in modeled plume: ' + translateRegionName(match[1]);
    if ((match = /^Klaster titik api terdekat: ([\d.,]+) km \((sangat dekat|dekat|jauh)\)$/i.exec(text))) {
      return 'Nearest fire-hotspot cluster: ' + match[1] + ' km (' + { 'sangat dekat': 'very close', dekat: 'close', jauh: 'far' }[match[2]] + ')';
    }
    if ((match = /^Klaster titik api terdekat: (.+)$/i.exec(text))) return 'Nearest fire-hotspot cluster: ' + match[1];
    if ((match = /^Arah plume model: (.+?) · angin ([\d.,]+) m\/s$/i.exec(text))) {
      return 'Modeled plume direction: ' + translateDirection(match[1]) + ' · wind ' + match[2] + ' m/s';
    }
    if ((match = /^Arah plume model: (.+)$/i.exec(text))) return 'Modeled plume direction: ' + translateDirection(match[1]);
    if ((match = /^Klaster plume sumber yang berkontribusi: (.+)$/i.exec(text))) return 'Contributing plume-source clusters: ' + match[1];
    if ((match = /^Angin ([\d.,]+) m\/s, asap bergerak ke (.+) \(([\d.,]+)°\)$/i.exec(text))) {
      return 'Wind ' + match[1] + ' m/s, smoke moving toward ' + translateDirection(match[2]) + ' (' + match[3] + '°)';
    }
    if ((match = /^Jangkauan perkiraan: ± ?([\d.,]+) km$/i.exec(text))) return 'Estimated range: ±' + match[1] + ' km';
    if ((match = /^Jangkauan: ± ?([\d.,]+) km$/i.exec(text))) return 'Range: ±' + match[1] + ' km';
    if ((match = /^Angin di ~([\d.,]+) km: ([\d.,]+) m\/s, dari (.+) \(([\d.,]+)°\)$/i.exec(text))) {
      return 'Wind at ~' + match[1] + ' km: ' + match[2] + ' m/s, from ' + translateDirection(match[3]) + ' (' + match[4] + '°)';
    }
    if ((match = /^Arah sebaran: (.+) \(([\d.,]+)°\)$/i.exec(text))) return 'Plume direction: ' + translateDirection(match[1]) + ' (' + match[2] + '°)';
    if ((match = /^Sebaran abu (.+), (.+)$/i.exec(text))) return 'Ash plume from ' + match[1] + ', ' + translateCore(match[2]);
    if ((match = /^(Rendah|Menengah|Tinggi) \(~([\d.,]+) km\)$/i.exec(text))) {
      return ({ Rendah: 'Low', Menengah: 'Mid-level', Tinggi: 'High' }[match[1]] || match[1]) + ' (~' + match[2].replace(',', '.') + ' km)';
    }
    if ((match = /^Tinggi puncak: ([\d.,]+) m AMSL$/i.exec(text))) return 'Summit elevation: ' + match[1] + ' m AMSL';
    if ((match = /^Tinggi kolom: ([\d.,]+) m di atas puncak$/i.exec(text))) return 'Column height: ' + match[1] + ' m above summit';
    if ((match = /^Puncak abu: ([\d.,]+) m AMSL \((.+)\)$/i.exec(text))) return 'Ash top: ' + match[1] + ' m AMSL (' + translateCore(match[2]) + ')';
    if ((match = /^Puncak abu: tidak dapat dihitung \((.+)\)$/i.exec(text))) return 'Ash top: cannot be calculated (' + translateCore(match[1]) + ')';
    if ((match = /^Angin dipakai: (.+) hPa @ (.+) m(?: \(interpolasi (.+) hPa\))?$/i.exec(text))) {
      return 'Wind level used: ' + match[1] + ' hPa @ ' + match[2] + ' m' + (match[3] ? ' (interpolated from ' + match[3] + ' hPa)' : '');
    }
    if ((match = /^Catatan: arah teramati berbeda ([\d.,]+)° dari arah model \((.+)\)\. Geser angin vertikal atau pengamatan pada bagian kolom yang lebih rendah\.$/i.exec(text))) {
      return 'Note: the observed direction differs from the modeled direction by ' + match[1] + '° (' + translateDirection(match[2]) + '). Vertical wind shear or observations in a lower part of the column may explain the difference.';
    }
    if (/^Catatan: arah kolom teramati berbeda dari arah angin model\. Angka yang ditampilkan mengikuti pengamatan lapangan\.$/i.test(text)) {
      return 'Note: the observed plume-column direction differs from the modeled wind direction. Displayed figures follow field observations.';
    }
    if (/^Sumber arah: laporan visual petugas pos pengamatan$/i.test(text)) return 'Direction source: visual report from an observatory officer';
    if (/^Sumber arah: model angin ketinggian \(NOAA GFS\)$/i.test(text)) return 'Direction source: upper-air wind model (NOAA GFS)';
    if ((match = /^Abu terbawa ke (.+)$/i.exec(text))) return 'Ash carried toward ' + match[1].split(/\s+\/\s+/).map(translateDirection).join(' / ');
    if ((match = /^Perkiraan jangkauan: ([\d.,]+) km$/i.exec(text))) return 'Estimated reach: ' + match[1] + ' km';
    if ((match = /^Tingkat paparan: (Berat|Sedang|Ringan) \(indeks ([\d.,]+) dari 100\)$/i.exec(text))) {
      var ashImpactLevel = { Berat: 'Severe', Sedang: 'Moderate', Ringan: 'Low' }[match[1]];
      return 'Exposure level: ' + ashImpactLevel + ' (index ' + match[2] + ' out of 100)';
    }
    if ((match = /^Sumber abu: Gunung (.+) · ([\d.,]+) km$/i.exec(text))) {
      return 'Ash source: Mount ' + match[1] + ' · ' + match[2] + ' km';
    }
    if (/^waktu tiba tidak diperkirakan$/i.test(text)) return 'arrival time not estimated';
    if (/^abu diperkirakan tiba <1 jam$/i.test(text)) return 'ash is estimated to arrive in under 1 hour';
    if ((match = /^abu diperkirakan tiba ~([\d.,]+) jam lagi$/i.exec(text))) return 'ash is estimated to arrive in about ' + match[1] + ' hours';
    if (/^abu diperkirakan tiba >1 hari$/i.test(text)) return 'ash is estimated to arrive in more than 1 day';
    if (/^tiba <1 jam$/i.test(text)) return 'arrival in under 1 hour';
    if ((match = /^tiba ~([\d.,]+) jam$/i.exec(text))) return 'arrival in about ' + match[1] + ' hours';
    if (/^tiba >1 hari$/i.test(text)) return 'arrival in more than 1 day';
    if ((match = /^Lapisan ketinggian: (.+) km$/i.exec(text))) return 'Altitude layers: ' + match[1] + ' km';
    if ((match = /^Lapisan ([\d.,/]+) km$/i.exec(text))) return 'Altitude layers: ' + match[1] + ' km';
    if ((match = /^indeks paparan ([\d.,]+)$/i.exec(text))) return 'exposure index ' + match[1];
    if ((match = /^Penduduk: (.+) jiwa$/i.exec(text))) return 'Population: ' + match[1] + ' people';
    if ((match = /^Status gunung: (.+)$/i.exec(text))) return 'Volcano status: ' + translateCore(match[1]);
    if ((match = /^Zona terdampak = area terpapar abu dengan radius ([\d.,]+) km dari pusat permukiman \(bukan batas administratif\)\.$/i.exec(text))) {
      return 'Indicative ash-impact zone: the area within a radius of ' + match[1] + ' km from the settlement center (not an administrative boundary).';
    }
    if (/^Perkiraan model dari angin ketinggian, bukan pengukuran sebaran abu\.$/i.test(text)) {
      return 'Model estimate based on upper-air winds, not a measurement of ash dispersion.';
    }
    if ((match = /^Permukiman di bawah jalur abu menurut arah angin tiap lapisan ketinggian\. Abu rendah \(~([\d.,]+) km\) paling berdampak ke permukaan; abu ~([\d.,]+) km umumnya melintas di atas dan lebih memengaruhi penerbangan\.(?: Menampilkan ([\d.,]+) paling terpapar dari ([\d.,]+) terdeteksi\.)? Model indikatif, bukan advisory resmi Darwin VAAC\.$/i.exec(text))) {
      return 'Settlement centers beneath ash paths follow wind direction at each altitude layer. Low-altitude ash (~' + match[1]
        + ' km) has the greatest potential surface impact; ash at ~' + match[2]
        + ' km generally passes overhead and is more relevant to aviation.'
        + (match[3] ? ' Showing the top ' + match[3] + ' most exposed of ' + match[4] + ' settlement centers identified by the model.' : '')
        + ' Indicative model only, not an official Darwin VAAC advisory.';
    }
    if ((match = /^Laporan GVP: erupsi (.+)$/i.exec(text))) return 'GVP report: eruption ' + match[1];
    if ((match = /^Tipe: (.+)$/i.exec(text))) return 'Type: ' + match[1];
    if ((match = /^Ketinggian: ([\d.,]+) mdpl$/i.exec(text))) return 'Elevation: ' + match[1] + ' m above sea level';
    if ((match = /^Kelembapan ([\d.,]+)%$/i.exec(text))) return 'Humidity ' + match[1] + '%';
    if ((match = /^Suhu ([\d.,]+)°C$/i.exec(text))) return 'Temperature ' + match[1] + '°C';
    if ((match = /^awan ([\d.,]+)%$/i.exec(text))) return 'cloud cover ' + match[1] + '%';
    if (/^tembus awan$/i.test(text)) return 'cloud-penetrating';
    if (/^memuat…$/i.test(text)) return 'loading...';
    if ((match = /^tidak ada citra bebas awan ([\d.,]+) hari terakhir$/i.exec(text))) {
      return 'no cloud-free imagery in the past ' + match[1] + ' days';
    }
    if ((match = /^⚠️? perbesar peta ke zoom ([\d.,]+)\+ agar citra muncul$/i.exec(text))) {
      return '⚠ zoom the map to level ' + match[1] + '+ to show imagery';
    }
    if ((match = /^▶ Putar ([\d.,]+) jam$/i.exec(text))) return '▶ Play ' + match[1] + ' hour' + (match[1] === '1' ? '' : 's');
    if (/^■ Hentikan$/i.test(text)) return '■ Stop';
    if ((match = /^Angin NOAA GFS 10 m, grid 1°, berlaku (.+)$/i.exec(text))) return 'NOAA GFS 10 m wind, 1° grid, valid at ' + match[1];
    if ((match = /^Deteksi FIRMS: (.+)$/i.exec(text))) return 'FIRMS detections: ' + translatePeriod(match[1]);
    if ((match = /^Sumber: klaster (.+)$/i.exec(text))) return 'Source: cluster ' + translateRegionName(match[1])
      .replace(/deteksi FIRMS/g, 'FIRMS detections').replace(/titik api/g, 'fire hotspots')
      .replace(/FRP gabungan interval/g, 'combined FRP over the interval')
      .replace(/(\d+) jam/g, '$1 hours').replace(/FRP /g, 'FRP ');
    if ((match = /^Koordinat pusat permukiman masuk area plume indikatif pada model saat ini\. Lingkaran ([\d.,]+) km hanya penanda visual, bukan batas terdampak\.$/i.exec(text))) {
      return 'Settlement-center coordinates fall inside the current indicative model plume. The ' + match[1] + ' km circle is a visual marker only, not an affected-area boundary.';
    }
    if ((match = /^Kategori model: (Berat|Sedang|Ringan) \(skor kedekatan ([\d.,]+)\/100; bukan ukuran paparan atau konsentrasi\)\.$/i.exec(text))) {
      var impactLevel = { Berat: 'High', Sedang: 'Moderate', Ringan: 'Low' }[match[1]];
      return 'Model category: ' + impactLevel + ' (proximity score ' + match[2] + '/100; not an exposure or concentration measurement).';
    }
    if ((match = /^Klaster titik api terdekat: ([\d.,]+) km \((sangat dekat|dekat|jauh)\)$/i.exec(text))) {
      return 'Nearest fire-hotspot cluster: ' + match[1] + ' km (' + { 'sangat dekat': 'very close', dekat: 'close', jauh: 'far' }[match[2]] + ')';
    }
    if ((match = /^Menampilkan ([\d.,]+) klaster terbesar dari ([\d.,]+) terdeteksi\.$/i.exec(text))) {
      return 'Showing the top ' + match[1] + ' largest clusters out of ' + match[2] + ' detected.';
    }
    if (/^angin lemah; estimasi waktu model tidak tersedia$/i.test(text)) return 'weak winds; modeled travel-time estimate unavailable';
    if ((match = /^estimasi geometris (<1|~[\d.,]+) jam$/i.exec(text))) return 'geometric estimate ' + match[1].replace('jam', '') + ' hour' + (match[1] === '<1' ? '' : 's');
    if (/^estimasi geometris lebih dari sehari$/i.test(text)) return 'geometric estimate more than a day';
    if (/^estimasi tidak tersedia$/i.test(text)) return 'estimate unavailable';
    if ((match = /^estimasi (<1|~[\d.,]+) jam$/i.exec(text))) return 'estimate ' + match[1].replace('jam', '') + ' hour' + (match[1] === '<1' ? '' : 's');
    if (/^estimasi >1 hari$/i.test(text)) return 'estimate >1 day';
    if ((match = /^Kategori model (tinggi|sedang|rendah)\. (.+)$/i.exec(text))) {
      var levelLabel = { tinggi: 'high', sedang: 'moderate', rendah: 'low' }[match[1].toLowerCase()];
      return 'Modeled category ' + levelLabel + '. ' + translateCore(match[2]);
    }
    if ((match = /^kategori model (Berat|Sedang|Ringan)$/i.exec(text))) {
      return 'model category ' + ({ Berat: 'High', Sedang: 'Moderate', Ringan: 'Low' }[match[1]] || match[1]);
    }
    if (/^dalam plume indikatif$/i.test(text)) return 'inside the indicative plume';
    if ((match = /^Saran umum: (.+)$/i.exec(text))) return 'General guidance: ' + translateCore(match[1]);
    if ((match = /^Perkiraan penduduk kota: (.+) jiwa; bukan jumlah orang terpapar\.$/i.exec(text))) return 'Estimated city population: ' + match[1] + ' people; this is not a count of people exposed.';
    if ((match = /^(\d+) dari (\d+) titik sampel \((\d+(?:[.,]\d+)?)\s*%\) di dalam batas konsesi · (\d+) di luar$/i.exec(text))) {
      return match[1] + ' of ' + match[2] + ' sampled hotspots (' + match[3] + '%) inside concession boundaries · ' + match[4] + ' outside';
    }
    if ((match = /^Keyakinan (Tinggi|Sedang|Rendah)$/i.exec(text))) {
      return 'Confidence ' + ({ Tinggi: 'High', Sedang: 'Moderate', Rendah: 'Low' }[match[1]] || match[1]);
    }
    if ((match = /^Titik api: (.+) klaster di dalam zona · FRP tertinggi (.+) · terdekat (.+) km$/i.exec(text))) {
      return 'Fire hotspots: ' + match[1] + ' clusters inside the zone · highest FRP ' + match[2] + ' · nearest ' + match[3] + ' km';
    }
    if ((match = /^Titik api: tidak ada klaster di dalam zona · terdekat (.+) km \(FRP (.+)\)$/i.exec(text))) {
      return 'Fire hotspots: no clusters inside the zone · nearest ' + match[1] + ' km (FRP ' + match[2] + ')';
    }
    if ((match = /^Gunung (.+?)(?:, (.+?))? · ([\d.,]+) km dari zona( · dilaporkan erupsi dengan sebaran abu)?$/i.exec(text))) {
      var volcanoDetail = match[2] || '';
      var volcanoStatus = { Awas: 'Warning', Siaga: 'Watch', Waspada: 'Alert', Normal: 'Normal' }[volcanoDetail.replace(/^status /i, '')];
      if (volcanoStatus) volcanoDetail = volcanoStatus;
      else if (/^status /i.test(volcanoDetail)) volcanoDetail = 'status ' + volcanoDetail.replace(/^status /i, '');
      return 'Volcano ' + match[1] + (volcanoDetail ? ', ' + volcanoDetail : '') + ' · ' + match[3] + ' km from the zone'
        + (match[4] ? ' · eruption and ash plume reported' : '');
    }
    if ((match = /^Gempa M (.+) · kedalaman (.+) km · (.+) km dari zona · (.*?)( · dirasakan)?( · berpotensi tsunami)?$/i.exec(text))) {
      return 'Earthquake M' + match[1] + ' · depth ' + match[2] + ' km · ' + match[3] + ' km from the zone · ' + match[4]
        + (match[5] ? ' · felt' : '') + (match[6] ? ' · tsunami potential' : '');
    }
    if ((match = /^Pengungsian: (.+) jiwa di (.+) titik terdekat · (.+) km dari zona$/i.exec(text))) {
      return 'Displacement: ' + match[1] + ' people at ' + match[2] + ' nearby sites · ' + match[3] + ' km from the zone';
    }
    if ((match = /^Kualitas udara: AQI (.+?)(?: · (.+?))? di grid terdekat$/i.exec(text))) {
      return 'Air quality: AQI ' + match[1] + (match[2] ? ' · ' + match[2] : '') + ' in the nearest grid cell';
    }
    if ((match = /^Plume visual: (.+)$/i.exec(text))) {
      var plume = match[1]
        .replace(/ klaster digambar dari sampel lintas wilayah/g, ' clusters drawn from a cross-region sample')
        .replace(/ tanpa angin visual yang valid/g, ' without valid visual wind data')
        .replace(/\bklaster\b/g, 'clusters')
        .replace(/ clusters dan /g, ' clusters and ')
        .replace(/maksimum /g, 'maximum ')
        .replace(/ per wilayah/g, ' per region')
        .replace(/Pusat model tidak dihitung: angin GFS 10 m tidak tersedia untuk/g, 'Modeled centers not calculated: GFS 10 m wind data is unavailable for')
        .replace(/Pusat model dihitung dari subset plume yang tersedia/g, 'Modeled centers use the available plume subset')
        .replace(/Pusat model dihitung dari/g, 'Modeled centers use')
        .replace(/Tidak ada klaster FIRMS pada jendela data/g, 'No FIRMS clusters in the data window')
        .replace(/Angin tidak tersedia untuk/g, 'Wind data is unavailable for')
        .replace(/dengan angin NOAA GFS/g, 'with NOAA GFS winds')
        .replace(/Geometri indikatif, bukan dispersi atau observasi; kotak wilayah hanya untuk pemerataan sampel/g, 'Indicative geometry, not dispersion or observation; regional boxes only balance the visual sample');
      return 'Visual plume: ' + plume;
    }
    if ((match = /^tiap ([\d.,]+) menit$/i.exec(text))) return 'every ' + match[1] + ' minute' + (match[1] === '1' ? '' : 's');
    if ((match = /^tiap ([\d.,]+) jam$/i.exec(text))) return 'every ' + match[1] + ' hour' + (match[1] === '1' ? '' : 's');
    if (/^belum pernah$/i.test(text)) return 'never';
    if ((match = /^(.+?) · run ([\d.,]+)\/([\d.,]+)(?: · data di halaman (.+?))?(?: · galat terakhir (.+?) UTC)?$/i.exec(text))) {
      return translateDynamic(match[1]) + ' · runs ' + match[2] + '/' + match[3]
        + (match[4] ? ' · page data ' + translateDynamic(match[4]) : '')
        + (match[5] ? ' · latest error ' + match[5] + ' UTC' : '');
    }
    if ((match = /^Penyebab: (.+), angka dari sumber ini belum terverifikasi saat ini\.$/i.exec(text))) {
      return 'Reason: ' + translateCore(match[1]) + '; figures from this source are not verified at this time.';
    }
    if ((match = /^diperbarui (.+)$/i.exec(text))) return 'updated ' + translateDynamic(match[1]);
    if ((match = /^([\d.,]+) kamera komunitas$/i.exec(text))) return match[1] + ' community webcams';
    if ((match = /^([\d.,]+) pesawat terpancar$/i.exec(text))) return match[1] + ' aircraft broadcasting';
    if ((match = /^([\d.,]+) sumber \(([\d.,]+) resmi, ([\d.,]+) komunitas\), kurasi manual, diperiksa (.+)$/i.exec(text))) {
      return match[1] + ' sources (' + match[2] + ' official, ' + match[3] + ' community), manually curated, verified ' + translateDynamic(match[4]);
    }
    if ((match = /^cakupan (.+)$/i.exec(text))) {
      var coverageName = translateRegionName(match[1]);
      if (coverageName === match[1]) coverageName = translateDynamic(match[1]);
      return 'coverage ' + coverageName;
    }
    if ((match = /^Foto terakhir menurut sumber: (.+) · Windy\.com$/i.exec(text))) return 'Latest photo according to source: ' + match[1] + ' · Windy.com';
    if (/^Waktu foto tidak dicatat sumber · Windy\.com$/i.test(text)) return 'Photo time not recorded by source · Windy.com';
    if ((match = /^([\d.,]+) TITIK$/i.exec(text))) return match[1] + ' HOTSPOTS';
    if ((match = /^Ketinggian: (.+)$/i.exec(text))) return 'Altitude: ' + (match[1] === 'tidak terukur' ? 'not measured' : match[1].replace(/ kaki\)/, ' ft)'));
    if ((match = /^Kecepatan: (.+) km\/j$/i.exec(text))) return 'Speed: ' + match[1] + ' km/h';
    if ((match = /^Arah: ([\d.,]+) derajat$/i.exec(text))) return 'Heading: ' + match[1] + ' degrees';
    if ((match = /^Negara pendaftaran: (.+)$/i.exec(text))) return 'Registration country: ' + translateRegionName(match[1]);
    if ((match = /^Kontak terakhir: (.+)$/i.exec(text))) return 'Last contact: ' + match[1];
    if ((match = /^Kode ICAO24: (.+)$/i.exec(text))) return 'ICAO24 code: ' + match[1];
    if ((match = /^Status: (.+)$/i.exec(text))) return 'Status: ' + ({ 'di darat': 'on ground', 'di udara': 'airborne', aktif: 'active' }[match[1].toLowerCase()] || match[1]);
    if ((match = /^sukses (\d+)x$/i.exec(text))) return 'success · ' + match[1] + ' run' + (match[1] === '1' ? '' : 's');
    if ((match = /^Kritis: (.+) gagal (\d+)x berturut!$/i.exec(text))) return 'Critical: ' + translateTaskId(match[1]) + ' failed ' + match[2] + ' consecutive times!';
    if ((match = /^Peringatan: (.+) gagal (\d+)x$/i.exec(text))) return 'Warning: ' + translateTaskId(match[1]) + ' failed ' + match[2] + ' times';
    if ((match = /^⚠️? (\d+) tugas kritis gagal berturut:$/i.exec(text))) return '⚠️ ' + match[1] + ' consecutive critical task failures:';
    if ((match = /^Kuota: 429=([\d.,]+) · 5xx=([\d.,]+) · total=([\d.,]+)(?: · terakhir 429: (.+))?$/i.exec(text))) {
      return 'Quota: 429=' + match[1] + ' · 5xx=' + match[2] + ' · total=' + match[3] + (match[4] ? ' · last 429: ' + match[4] : '');
    }
    if ((match = /^Perusahaan: (.+)$/i.exec(text))) return 'Company: ' + match[1];
    if ((match = /^Grup korporasi: (.+)$/i.exec(text))) return 'Corporate group: ' + match[1];
    if ((match = /^Jenis alas hak: (.+)$/i.exec(text))) {
      return 'Tenure type: ' + match[1].replace(/operasi produksi/gi, 'production operation');
    }
    if ((match = /^Nomor izin: (.+)$/i.exec(text))) return 'License number: ' + match[1];
    if ((match = /^Komoditas: (.+)$/i.exec(text))) {
      var commodity = { batubara: 'coal', 'batu bara': 'coal', nikel: 'nickel', emas: 'gold', bauksit: 'bauxite' }[match[1].toLowerCase()] || match[1];
      return 'Commodity: ' + commodity;
    }
    if ((match = /^Luas: (.+) ha$/i.exec(text))) return 'Area: ' + match[1] + ' ha';
    if ((match = /^grup (.+)$/i.exec(text))) return 'group ' + match[1];
    if ((match = /^alas hak (.+)$/i.exec(text))) return 'tenure ' + match[1];
    if ((match = /^([\d.,]+) unit lahan pada tampilan ini\. Klik poligon untuk detail\.$/i.exec(text))) {
      return match[1] + ' land units in this view. Select a polygon for details.';
    }
    if ((match = /^([\d.,]+) sumber \(([\d.,]+) resmi, ([\d.,]+) komunitas\), kurasi manual, diperiksa (.+)$/i.exec(text))) {
      return match[1] + ' sources (' + match[2] + ' official, ' + match[3] + ' community), manually curated, verified ' + translateDynamic(match[4]);
    }
    if ((match = /^jam perangkat meleset (\d+) mnt (lebih lambat|lebih cepat) · jam di sini dari server$/i.exec(text))) {
      return 'device clock is ' + match[1] + ' min ' + (match[2] === 'lebih lambat' ? 'slow' : 'fast') + ' · time shown here is server time';
    }
    if ((match = /^menjalankan · (\d+) dtk$/i.exec(text))) return 'running · ' + match[1] + ' sec';
    if ((match = /^intent: (.+)$/i.exec(text))) {
      var intents = { konsesi: 'concessions', health: 'health', regional: 'regional haze', udara: 'air quality', gempa: 'earthquakes', korban: 'casualties', pengungsi: 'displacement', gunung: 'volcanoes', berita: 'news', provinsi: 'provinces', daerah: 'regions', angin: 'wind', umum: 'overview' };
      return 'intent: ' + (intents[match[1]] || match[1]);
    }
    if ((match = /^data dari (.+) tidak tersedia$/i.exec(text))) return 'Data from ' + translateFragments(match[1]) + ' is unavailable.';
    if ((match = /^menunggu (data|laporan) (.+)$/i.exec(text))) {
      return (match[1] === 'data' ? 'Waiting for ' : 'Waiting for reports from ') + translateFragments(match[2]);
    }
    if ((match = /^Gagal memuat data (.+)\.$/i.exec(text))) return 'Could not load ' + translateFragments(match[1]) + ' data.';
    if ((match = /^Snapshot ASMC (.+) \((.+)\)\. Sapuan laporan ditampilkan; bentuknya perkiraan\.$/i.exec(text))) {
      return 'ASMC snapshot ' + match[1] + ' (' + match[2] + '). The reported-area overlay is shown; its shape is approximate.';
    }
    if ((match = /^Laporan ASMC (.+); area kabut digeneralisasi dan bukan batas resmi atau konsentrasi\.$/i.exec(text))) {
      return 'ASMC report ' + match[1] + '; the haze area is generalized and is not an official boundary or concentration measurement.';
    }
    if (/^Mengambil tanggal terbaru dan raster NASA GIBS…$/i.test(text)) return 'Retrieving the latest date and NASA GIBS raster...';
    if ((match = /^Memuat petak aerosol NASA OMPS untuk (.+)…$/i.exec(text))) return 'Loading NASA OMPS aerosol tiles for ' + match[1] + '...';
    if ((match = /^([\d.,]+) petak raster gagal dimuat\. Lapisan mungkin belum lengkap; coba lagi setelah beberapa saat\.$/i.exec(text))) {
      return match[1] + ' raster tiles failed to load. The layer may be incomplete; try again in a few moments.';
    }
    if ((match = /^Petak raster selesai dimuat · observasi (.+)\. Indeks kolom atmosfer, bukan PM2\.5 permukaan atau bukti asap karhutla\. Area transparan berarti tidak ada retrieval, bukan berarti tidak ada asap\.$/i.exec(text))) {
      return 'Raster tiles loaded · observation ' + match[1] + '. The atmospheric-column index is not surface PM2.5 or proof of wildfire smoke. Transparent areas mean no retrieval was available, not that no smoke is present.';
    }
    if ((match = /^Sumber NASA GIBS tidak aktif(?: saat ini)?: (.+)$/i.exec(text))) {
      return 'NASA GIBS source is inactive' + (/saat ini/i.test(text) ? ' at this time' : '') + ': ' + translateCore(match[1]);
    }
    if (/^tanggal data terbaru tidak tersedia\.?$/i.test(text)) return 'latest data date is unavailable';
    if (/^metadata raster tidak dapat dimuat\.?$/i.test(text)) return 'raster metadata could not be loaded';
    if ((match = /^Snapshot ASMC (.+) \((.+)\)\. Snapshot melewati batas (\d+) jam; sapuan ASMC disembunyikan\. Marker laporan historis BMKG tetap tersedia\.$/i.exec(text))) {
      return 'ASMC snapshot ' + match[1] + ' (' + match[2] + '). The snapshot is older than the ' + match[3] + '-hour limit, so the ASMC overlay is hidden. The historical BMKG report marker remains available.';
    }
    if ((match = /^(.+) masih tercatat menderita ISPA, bukan kasus baru harian\.$/i.exec(text))) {
      return match[1] + ' people are still recorded with ARI; this is not a daily count of new cases.';
    }
    if ((match = /^(.+) kasus ISPA dilaporkan di (.+), (.+)$/i.exec(text))) {
      return match[1] + ' ARI cases reported across ' + match[2] + ', ' + match[3];
    }
    if ((match = /^Update: (.+) WIB · CAMS via Open-Meteo$/i.exec(text))) return 'Updated: ' + match[1] + ' WIB · CAMS via Open-Meteo';
    if ((match = /^Foto terakhir menurut sumber: (.+)$/i.exec(text))) return 'Latest photo according to source: ' + match[1];
    if ((match = /^Foto terakhir menurut sumber: (.+) · Windy\.com$/i.exec(text))) return 'Latest photo according to source: ' + match[1] + ' · Windy.com';
    if ((match = /^Waktu foto tidak dicatat sumber( · Windy\.com)?$/i.exec(text))) return 'Photo time not recorded by source' + (match[1] || '');
    if ((match = /^Sumber lalu lintas udara tidak tersedia \((.+)\)\. Tidak ada pesawat yang digambar, bukan berarti tidak ada penerbangan\.$/i.exec(text))) {
      return 'Air-traffic data is unavailable (' + match[1] + '). No aircraft are drawn; this does not mean there are no flights.';
    }
    if ((match = /^sumber (.+)$/i.exec(text))) return 'source ' + translateRegionName(match[1]);
    if ((match = /^cakupan (.+)$/i.exec(text))) {
      var coverageName = translateRegionName(match[1]);
      if (coverageName === match[1]) coverageName = translateDynamic(match[1]);
      return 'coverage ' + coverageName;
    }
    if ((match = /^([\d.,]+) TITIK$/i.exec(text))) return match[1] + ' HOTSPOTS';
    if ((match = /^HOTSPOT$/i.exec(text))) return 'HOTSPOTS';
    if ((match = /^CONF>=80$/i.exec(text))) return 'CONFIDENCE ≥80';
    if ((match = /^KLASTER$/i.exec(text))) return 'CLUSTERS';
    if ((match = /^PUSAT DALAM PLUME$/i.exec(text))) return 'CENTERS IN PLUME';
    if ((match = /^AQI MAX$/i.exec(text))) return 'MAX AQI';
    if ((match = /^DLM KONSESI$/i.exec(text))) return 'IN CONCESSIONS';

    if ((match = /^BERITA$/i.exec(text))) return 'NEWS';
    if ((match = /^FRP MW$/i.exec(text))) return 'FRP MW';
    if ((match = /^(.+) gunung aktif dipantau di peta(?:, status PVMBG: (.+))?\.?$/i.exec(text))) {
      var tickerVolcanoStatus = (match[2] || '').replace(/(\d+) Awas/g, '$1 Warning')
        .replace(/(\d+) Siaga/g, '$1 Watch').replace(/(\d+) Waspada/g, '$1 Alert');
      return match[1] + ' active volcanoes monitored on the map' + (tickerVolcanoStatus ? ', PVMBG status: ' + tickerVolcanoStatus : '');
    }
    if ((match = /^salinan lama, sumber sedang gagal(?:: (.+))?$/i.exec(text))) {
      return 'stale snapshot; source is currently unavailable' + (match[1] ? ': ' + match[1] : '');
    }
    if ((match = /^Layout (desktop|mobile) disimpan lokal, ([\d.,]+) panel\. Export JSON untuk dipatenkan jadi default semua user\.$/i.exec(text))) {
      return match[1] + ' layout saved locally with ' + match[2] + ' panels. Export JSON to make it the default for all users.';
    }
    if (/^operasi produksi$/i.test(text)) return 'production operation';
    if ((match = /^ARTIKEL$/i.exec(text))) return 'ARTICLES';
    if ((match = /^cakupan (.+)$/i.exec(text))) {
      var coverageName = translateRegionName(match[1]);
      if (coverageName === match[1]) coverageName = translateDynamic(match[1]);
      return 'coverage ' + coverageName;
    }
    if ((match = /^(\d[\d.,]*) ARTIKEL$/i.exec(text))) return match[1] + ' ARTICLES';
    if ((match = /^(\d[\d.,]*) dari (\d[\d.,]*) sumber aktif$/i.exec(text))) return match[1] + ' of ' + match[2] + ' active sources';
    if ((match = /^(\d[\d.,]*) titik radius ([\d.,]+) nm \(bukan seluruh wilayah\)$/i.exec(text))) {
      return match[1] + ' points with a ' + match[2] + ' nm radius (not the entire area)';
    }
    if ((match = /^terbanyak (.+)$/i.exec(text))) return 'most in ' + translateRegionName(match[1]);
    if ((match = /^disaring untuk (.+)$/i.exec(text))) return 'filtered for ' + translateRegionName(match[1].replace(/^kawasan /i, ''));
    if ((match = /^G\. (.+)$/i.exec(text))) return 'Mount ' + match[1];
    if ((match = /^Laporan GVP (.+): ?$/i.exec(text))) return 'GVP report ' + match[1] + ': ';
    if ((match = /^Klik untuk memusatkan peta ke G\. (.+)$/i.exec(text))) return 'Click to center the map on Mount ' + match[1];
    if ((match = /^Sumber: (.+)\. Tidak semua pesawat terpancar ke penerima darat; ketiadaan pesawat di satu wilayah bukan bukti tidak ada penerbangan\.$/i.exec(text))) {
      return 'Source: ' + match[1] + '. Not all aircraft are visible to ground receivers; the absence of aircraft in one area is not evidence that no flights are operating.';
    }
    if ((match = /^([\d.,]+) TITIK$/i.exec(text))) return match[1] + ' HOTSPOTS';
    return text;
  }

  function translateFragments(text) {
    var result = text;
    FRAGMENTS.forEach(function (fragment) {
      if (result.indexOf(fragment[0]) !== -1) result = result.split(fragment[0]).join(fragment[1]);
    });
    return result;
  }

  function translateCore(core) {
    var translated = Object.prototype.hasOwnProperty.call(DICTIONARY, core)
      ? DICTIONARY[core]
      : Object.prototype.hasOwnProperty.call(DYNAMIC_DICTIONARY, core)
        ? DYNAMIC_DICTIONARY[core]
        : translateDynamic(core);
    if (translated !== core) return translated;
    if (core.indexOf(' · ') < 0) return translateFragments(core);
    return core.split(' · ').map(function (part) {
      var item = Object.prototype.hasOwnProperty.call(DICTIONARY, part)
        ? DICTIONARY[part]
        : Object.prototype.hasOwnProperty.call(DYNAMIC_DICTIONARY, part)
          ? DYNAMIC_DICTIONARY[part]
          : translateDynamic(part);
      return item === part ? translateFragments(part) : item;
    }).join(' · ');
  }

  function translateText(value, language) {
    var lang = normalizeLanguage(language || currentLanguage);
    var text = String(value == null ? '' : value);
    if (lang !== 'en') return text;
    var leading = /^\s*/.exec(text)[0];
    var trailing = /\s*$/.exec(text)[0];
    var core = text.slice(leading.length, text.length - trailing.length);
    if (!core) return text;
    return leading + translateCore(core) + trailing;
  }

  function skipElement(element) {
    if (!element || !element.closest) return false;
    return !!element.closest('script, style, code, pre, input, textarea, [data-i18n-skip]');
  }

  function translateTextNode(node) {
    if (!node || !node.parentElement || skipElement(node.parentElement)) return;
    if (!rawText.has(node)) rawText.set(node, node.data);
    var original = rawText.get(node);
    var output = translateText(original, currentLanguage);
    if (node.data !== output) {
      appliedText.set(node, output);
      node.data = output;
    }
  }

  function attributeMap(weakMap, element) {
    var map = weakMap.get(element);
    if (!map) { map = Object.create(null); weakMap.set(element, map); }
    return map;
  }

  function translateAttribute(element, name) {
    if (!element || skipElement(element) || watchedAttributes.indexOf(name) < 0) return;
    var originals = attributeMap(rawAttributes, element);
    if (!Object.prototype.hasOwnProperty.call(originals, name)) originals[name] = element.getAttribute(name);
    if (originals[name] == null) return;
    var next = translateText(originals[name], currentLanguage);
    if (element.getAttribute(name) !== next) {
      attributeMap(appliedAttributes, element)[name] = next;
      element.setAttribute(name, next);
    }
  }

  function translateTree(rootNode) {
    if (!documentRef || !rootNode) return;
    if (rootNode.nodeType === 3) {
      translateTextNode(rootNode);
      return;
    }
    if (rootNode.nodeType === 1) {
      watchedAttributes.forEach(function (name) { translateAttribute(rootNode, name); });
    }
    var walker = documentRef.createTreeWalker(rootNode, 4);
    var node;
    while ((node = walker.nextNode())) translateTextNode(node);
    if (rootNode.querySelectorAll) {
      var elements = rootNode.querySelectorAll('[title], [aria-label], [aria-valuetext], [placeholder], [alt]');
      for (var i = 0; i < elements.length; i++) {
        watchedAttributes.forEach(function (name) { translateAttribute(elements[i], name); });
      }
    }
  }

  function setDescription(language) {
    var meta = documentRef && documentRef.querySelector('meta[name="description"]');
    if (!meta) return;
    if (!meta.hasAttribute('data-i18n-original')) {
      meta.setAttribute('data-i18n-original', meta.getAttribute('content') || '');
    }
    var original = meta.getAttribute('data-i18n-original');
    meta.setAttribute('content', translateText(original, language));
  }

  function updateControls() {
    if (!documentRef) return;
    var idButton = documentRef.getElementById('langId');
    var enButton = documentRef.getElementById('langEn');
    [[idButton, 'id'], [enButton, 'en']].forEach(function (entry) {
      var button = entry[0];
      if (!button) return;
      var active = currentLanguage === entry[1];
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('active', active);
    });
  }

  function setLanguage(language, persist) {
    if (!documentRef) return currentLanguage;
    currentLanguage = normalizeLanguage(language);
    documentRef.documentElement.lang = currentLanguage;
    documentRef.documentElement.setAttribute('data-language', currentLanguage);
    updateControls();
    if (!documentRef.documentElement.hasAttribute('data-i18n-title-original')) {
      documentRef.documentElement.setAttribute('data-i18n-title-original', documentRef.title || '');
    }
    documentRef.title = translateText(
      documentRef.documentElement.getAttribute('data-i18n-title-original'), currentLanguage
    );
    setDescription(currentLanguage);
    translateTree(documentRef.body);
    if (persist !== false) {
      try { documentRef.defaultView.localStorage.setItem(LANG_KEY, currentLanguage); } catch (error) { /* storage may be disabled */ }
    }
    var view = documentRef.defaultView;
    if (view && typeof view.CustomEvent === 'function') {
      view.dispatchEvent(new view.CustomEvent('siaga:languagechange', {
        detail: { language: currentLanguage, locale: currentLanguage === 'en' ? 'en-US' : 'id-ID' }
      }));
    }
    return currentLanguage;
  }

  function init(view) {
    documentRef = view.document;
    var saved = 'id';
    try { saved = documentRef.defaultView.localStorage.getItem(LANG_KEY) || 'id'; } catch (error) { /* use Indonesian by default */ }
    var idButton = documentRef.getElementById('langId');
    var enButton = documentRef.getElementById('langEn');
    if (idButton) idButton.addEventListener('click', function () { setLanguage('id'); });
    if (enButton) enButton.addEventListener('click', function () { setLanguage('en'); });

    observer = new view.MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'childList') {
          for (var i = 0; i < record.addedNodes.length; i++) translateTree(record.addedNodes[i]);
        } else if (record.type === 'characterData') {
          var textNode = record.target;
          if (appliedText.has(textNode) && appliedText.get(textNode) === textNode.data) {
            appliedText.delete(textNode);
            return;
          }
          rawText.set(textNode, textNode.data);
          translateTextNode(textNode);
        } else if (record.type === 'attributes') {
          var target = record.target;
          var name = record.attributeName;
          var applied = appliedAttributes.get(target);
          if (applied && applied[name] === target.getAttribute(name)) {
            delete applied[name];
            return;
          }
          attributeMap(rawAttributes, target)[name] = target.getAttribute(name);
          translateAttribute(target, name);
        }
      });
    });
    observer.observe(documentRef.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: watchedAttributes
    });
    setLanguage(saved, false);
    return api;
  }

  var api = {
    init: init,
    setLanguage: setLanguage,
    getLanguage: function () { return currentLanguage; },
    getLocale: function () { return currentLanguage === 'en' ? 'en-US' : 'id-ID'; },
    translate: translateText,
    dictionary: DICTIONARY
  };
  return api;
});
