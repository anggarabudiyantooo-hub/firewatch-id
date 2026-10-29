'use strict';

const fs = require('fs');
const path = require('path');
const i18n = require('../public/i18n.js');
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++;
  else failed++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name
    + (ok ? '' : '\n    actual: ' + actual + '\n    expected: ' + expected));
}

console.log('\n== Dashboard Indonesian-English localization ==');
check('Indonesian remains the default locale', i18n.translate('Ringkasan situasi', 'id'), 'Ringkasan situasi');
check('static dashboard labels translate to English', i18n.translate('Ringkasan situasi', 'en'), 'Situation summary');
check('smoke modes use the requested neutral bilingual labels',
  [
    i18n.translate('Raster PM2.5 total (CAMS)', 'en'),
    i18n.translate('Plume indikatif (FIRMS + GFS)', 'en'),
    i18n.translate('Hanya satu mode dapat aktif pada satu waktu. Memilih mode lain akan mengganti layer aktif.', 'en')
  ].join(' | '),
  'Total PM2.5 raster (CAMS) | Indicative plume (FIRMS + GFS) | Only one mode can be active at a time. Selecting the other replaces the active layer.');
check('CAMS source caveat and missing-sample warning translate to English',
  [
    i18n.translate('Raster PM2.5 total CAMS Global dari semua sumber, bukan khusus asap', 'en'),
    i18n.translate('Tidak ada sampel CAMS valid di sini; transparan berarti tidak tersedia, bukan nol.', 'en')
  ].join(' | '),
  'CAMS Global total PM2.5 raster from all sources, not smoke-specific | No valid CAMS grid sample here; transparent means unavailable, not zero.');
check('dynamic plume and CAMS layer hints translate to English',
  [
    i18n.translate('8 plume indikatif dari klaster FIRMS dan angin NOAA GFS; bukan lintasan asap teramati atau ukuran konsentrasi.', 'en'),
    i18n.translate('4 sampel PM2.5 total model CAMS, bukan khusus asap.', 'en')
  ].join(' | '),
  '8 indicative plumes from FIRMS clusters and NOAA GFS winds; not observed smoke tracks or measured concentrations. | 4 total modeled CAMS PM2.5 samples; not smoke-specific.');
check('visible language control has accessible ID and EN buttons',
  /id="langId"[^>]*aria-label="Bahasa Indonesia"[\s\S]*?id="langEn"[^>]*aria-label="English language"/.test(
    fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8')
  ), true);
check('English mode translates a dynamic event count',
  i18n.translate('12 kejadian dan laporan dipantau', 'en'), '12 events and reports monitored');
check('English mode translates the live-source status count',
  i18n.translate('3/8 sumber aktif', 'en'), '3/8 active sources');
check('English mode translates dynamic plume coverage status',
  i18n.translate('Plume visual: 2/8 klaster digambar dari sampel lintas wilayah, maksimum 36 klaster dan 3 per wilayah. Geometri indikatif, bukan dispersi atau observasi; kotak wilayah hanya untuk pemerataan sampel.', 'en'),
  'Visual plume: 2/8 clusters drawn from a cross-region sample, maximum 36 clusters and 3 per region. Indicative geometry, not dispersion or observation; regional boxes only balance the visual sample.');
check('English mode translates city and regency centers and administrative names',
  i18n.translate('Pusat kota/kabupaten dalam poligon: Kota Pontianak, Kalimantan Barat; Kab. Mempawah, Kalimantan Barat; +3 lainnya', 'en'),
  'City and regency centers inside polygon: City of Pontianak, West Kalimantan; Regency of Mempawah, West Kalimantan; +3 more');
check('English mode translates dynamic wind direction descriptions',
  i18n.translate('Angin 3.5 m/s, asap bergerak ke barat laut (315°)', 'en'),
  'Wind 3.5 m/s, smoke moving toward northwest (315°)');
check('English mode translates hotspot filters and historical time windows',
  i18n.translate('0 dari 1240 lolos filter · 24j, tertua 3j lalu', 'en'),
  '0 of 1240 pass the filter · 24h window, oldest 3h ago');
check('English mode translates the historical plume interval',
  i18n.translate('750 dari 1240 tampil · 24-18 jam lalu', 'en'),
  '750 of 1240 shown · 24 to 18 hours ago');
check('English mode translates dynamic earthquake region names',
  i18n.translate('Gempa M 5.5, Laut Jawa', 'en'),
  'Earthquake M5.5, Java Sea');
check('English mode localizes a satellite acquisition time while retaining UTC',
  /function fmtAcq\(iso\)[\s\S]*?toLocaleString\(getLocale\(\), \{\s*timeZone: 'UTC'/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('English mode translates grouped live hotspot counts and age labels',
  i18n.translate('1.234 dari 34.869 tampil · 24j, tertua 3j lalu · akuisisi terbaru 26 Okt, 15.20 WIB (3,2 jam lalu)', 'en'),
  '1.234 of 34.869 shown · 24h window, oldest 3h ago · latest acquisition 26 Okt, 15.20 WIB (3,2 hours ago)');
check('English mode translates time-dependent plume forecasts without changing their caveat',
  i18n.translate('Prakiraan +6 jam dari deteksi FIRMS 24 jam terakhir dan angin model. Bukan ukuran PM2.5. Rona gelap hanya gaya visual.', 'en'),
  'Forecast +6 hours from FIRMS detections over the past 24 hours and modeled winds. Not a PM2.5 measurement. Dark shading is visual styling only.');
check('English mode translates the dynamic dry-season status',
  i18n.translate('Status iklim: El Niño (ONI 0.6, OND 2026, menguat). El Niño meningkatkan peluang kemarau panjang tetapi tidak menentukannya, status tiap provinsi di bawah dihitung dari curah hujan yang benar-benar terukur, bukan dari indeks ini.', 'en'),
  'Climate status: El Niño (ONI 0.6, OND 2026, strengthening). El Niño increases the likelihood of prolonged dry conditions but does not determine them. Province statuses below are based on measured rainfall, not this index.');
check('English mode translates GFS forecast-cycle labels',
  i18n.translate('Prakiraan +6 jam · siklus GFS 20261026T00', 'en'),
  'Forecast +6 hours · GFS run 20261026T00');
check('English mode localizes plume and ash popup titles',
  [i18n.translate('Perkiraan sebaran asap', 'en'), i18n.translate('Prakiraan sebaran +6 jam', 'en'), i18n.translate('Rekonstruksi plume 24 jam lalu', 'en')].join(' | '),
  'Indicative smoke plume | Plume forecast +6 hours | Plume reconstruction 24 hours ago');
check('English mode translates ash-impact estimates and preserves their indicative limits',
  [
    i18n.translate('Tingkat paparan: Berat (indeks 78 dari 100)', 'en'),
    i18n.translate('Sumber abu: Gunung Merapi · 20 km', 'en'),
    i18n.translate('abu diperkirakan tiba ~6 jam lagi', 'en'),
    i18n.translate('Lapisan ketinggian: 3 / 4,2 km', 'en'),
    i18n.translate('Penduduk: 12.345 jiwa', 'en'),
    i18n.translate('Zona terdampak = area terpapar abu dengan radius 18 km dari pusat permukiman (bukan batas administratif).', 'en')
  ].join(' | '),
  'Exposure level: Severe (index 78 out of 100) | Ash source: Mount Merapi · 20 km | ash is estimated to arrive in about 6 hours | Altitude layers: 3 / 4,2 km | Population: 12.345 people | Indicative ash-impact zone: the area within a radius of 18 km from the settlement center (not an administrative boundary).');
check('English mode translates both ash-direction caveats and missing height provenance',
  [
    i18n.translate('Catatan: arah kolom teramati berbeda dari arah angin model. Angka yang ditampilkan mengikuti pengamatan lapangan.', 'en'),
    i18n.translate('Puncak abu: tidak dapat dihitung (tinggi tidak teramati)', 'en')
  ].join(' | '),
  'Note: the observed plume-column direction differs from the modeled wind direction. Displayed figures follow field observations. | Ash top: cannot be calculated (height not observed)');
check('WIB date and time formatting follows active locale and keeps explicit UTC+7',
  /function stampWIB\(iso\)[\s\S]*?toLocaleDateString\(getLocale\(\), \{\s*timeZone: 'UTC'[\s\S]*?toLocaleTimeString\(getLocale\(\), \{\s*timeZone: 'UTC'[\s\S]*?return dateLabel \+ ' ' \+ timeLabel \+ ' WIB'/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('CAMS update timestamps keep the WIB timezone in every locale',
  /toLocaleTimeString\(getLocale\(\), \{\s*timeZone: 'Asia\/Jakarta'[\s\S]*?\}\) \+ ' WIB · CAMS via Open-Meteo'/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('news timestamps follow locale conventions while retaining WIB',
  /function fmtJamWib\(ms\)[\s\S]*?toLocaleString\(getLocale\(\), \{\s*timeZone: 'UTC'[\s\S]*?\}\) \+ ' WIB'/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('terminal clocks use active locale with explicit Jakarta and UTC zones',
  /function tickClock\(\)[\s\S]*?toLocaleTimeString\(getLocale\(\),[\s\S]*?timeZone: 'Asia\/Jakarta'[\s\S]*?toLocaleTimeString\(getLocale\(\),[\s\S]*?timeZone: 'UTC'/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('Himawari acquisition-time labels follow locale and retain WIB',
  /var wibTime = wib\.toLocaleTimeString\(getLocale\(\), \{\s*timeZone: 'UTC'[\s\S]*?wibTime \+ ' WIB'/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('language changes rerender drought dates through the active-locale formatter',
  /if \(state\.drought\) \{ renderDroughtCard\(\); renderDryList\(\); \}/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('news headlines are marked to remain in their source language',
  /headline\.setAttribute\('data-i18n-skip', ''\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')), true);
check('English AI requests send an explicit language parameter',
  /\/api\/ask\?q=' \+ encodeURIComponent\(q\) \+ '&lang=' \+ encodeURIComponent\(getLanguage\(\)\)/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('language script loads before the dashboard app',
  /<script src="\/i18n\.js"><\/script>\s*<script src="\/app\.js"><\/script>/.test(
    fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8')
  ), true);
check('language script participates in asset versioning',
  /ASSET_FILES = \[[^\]]*'i18n\.js'/.test(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'))
    && /i18n\\\.js/.test(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8')), true);

check('flight API failure is translated as a complete, accurate warning',
  i18n.translate('Sumber lalu lintas udara tidak tersedia (timeout). Tidak ada pesawat yang digambar, bukan berarti tidak ada penerbangan.', 'en'),
  'Air-traffic data is unavailable (timeout). No aircraft are drawn; this does not mean there are no flights.');
check('flight layer metadata translates every bullet including source and coverage caveats',
  i18n.translate('2 pesawat terpancar · sumber adsb.lol · cakupan 7 titik radius 400 nm (bukan seluruh wilayah) · diperbarui 5 min ago · data publik ADS-B, jaringan penerima tidak rapat', 'en'),
  '2 aircraft broadcasting · source adsb.lol · coverage 7 points with a 400 nm radius (not the entire area) · updated 5 min ago · public ADS-B data; receiver coverage is sparse');
check('flight stale-cache state keeps its reason and does not imply live source data',
  i18n.translate('salinan lama, sumber sedang gagal: HTTP 503', 'en'),
  'stale snapshot; source is currently unavailable: HTTP 503');
check('concession metadata labels and common values translate without altering company names',
  [
    i18n.translate('Perusahaan: PT Contoh', 'en'),
    i18n.translate('Jenis alas hak: OPERASI PRODUKSI', 'en'),
    i18n.translate('Komoditas: batubara', 'en'),
    i18n.translate('Luas: 1.234,5 ha', 'en'),
    i18n.translate('Sawit', 'en')
  ].join(' | '),
  'Company: PT Contoh | Tenure type: production operation | Commodity: coal | Area: 1.234,5 ha | Oil palm');
check('concession caveat remains explicit in English',
  i18n.translate('Indikasi awal dari kompilasi peta konsesi GFW, bukan bukti hukum.', 'en'),
  'Preliminary indication from the GFW concession-map compilation, not legal evidence.');
check('duplicate inactive label resolves to the concise panel state',
  i18n.translate('belum aktif', 'en'), 'Inactive');
check('ticker labels and article counters translate together',
  [i18n.translate('🔥 TITIK PANAS', 'en'), i18n.translate('5 ARTIKEL', 'en')].join(' | '),
  '🔥 HOTSPOTS | 5 ARTICLES');
check('health guidance and CAMS sulfur-dioxide notices translate fully',
  [
    i18n.translate('Kualitas udara memuaskan, risiko minim.', 'en'),
    i18n.translate('Di atas acuan WHO. Penderita asma sebaiknya waspada.', 'en'),
    i18n.translate('Hindari aktivitas luar ruang di sekitar kawah.', 'en')
  ].join(' | '),
  'Air quality is satisfactory, with minimal risk. | Above the WHO guideline. People with asthma should take caution. | Avoid outdoor activity near the crater.');
check('dynamic map-hint loading text translates',
  i18n.translate('Memuat data kualitas udara…', 'en'), 'Loading air-quality data...');
check('English camera metadata has names, notes, and verification bases for every curated channel',
  require('../data/kamera.js').length === 5
    && require('../data/kamera.js').every(function (camera) {
      return !!(camera.namaEn && camera.catatanEn && camera.buktiEn);
    }), true);
check('BMKG source-date formatting uses active locale and retains the original WIB, WITA, WIT, or UTC zone',
  /function formatSourceDateTime\(value\)[\s\S]*?toLocaleString\(getLocale\(\), \{[\s\S]*?timeZone: zoneInfo\[0\][\s\S]*?\+ ' ' \+ zone/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('BMKG hazard refresh time explicitly uses Jakarta time and keeps WIB',
  /state\.hazardFetchedAt = Date\.now\(\);[\s\S]*?state\.hazardAt = new Date\(state\.hazardFetchedAt\)\.toLocaleTimeString\(getLocale\(\), \{\s*timeZone: 'Asia\/Jakarta'[\s\S]*?\}\) \+ ' WIB'/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('ASMC report includes distinct ID and English summaries',
  require('../lib/regional-haze.js').REPORT.asmc.summary
    !== require('../lib/regional-haze.js').REPORT.asmc.summaryId, true);
check('ASMC event chooses its summary from the active dashboard language',
  /detail: english \? \(asmc\.summary \|\| asmc\.summaryId\) : \(asmc\.summaryId \|\| asmc\.summary\)/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('external headlines, source event titles, quotes, and GVP summaries remain in their source language',
  /headline\.setAttribute\('data-i18n-skip', ''\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'))
    && /if \(e\.sourceTitle\) eventTitle\.setAttribute\('data-i18n-skip', ''\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'))
    && /quote\.setAttribute\('data-i18n-skip', ''\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'))
    && /activitySummary\.setAttribute\('data-i18n-skip', ''\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')), true);
check('language changes redraw flights safely, preserve stream embeds, and rerender SO2',
  /if \(state\.flights\) drawFlights\(\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'))
    && /if \(state\.flightsOn\) items\.forEach/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'))
    && /if \(state\.streamOpenId && state\.streamOpenId === k\.kanal\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'))
    && /if \(state\.so2\) renderSo2\(state\.so2\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')), true);
check('stream API errors and successful responses both persist state before rendering',
  /\.then\(function \(d\) \{ state\.streams = d; renderSiaran\(d\); \}\)[\s\S]*?state\.streams = \{ error:/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);

check('ticker labels, erupting-volcano label, and uppercase AQI categories translate correctly',
  [
    i18n.translate('HOTSPOT', 'en'), i18n.translate('CONF>=80', 'en'),
    i18n.translate('FRP MW', 'en'), i18n.translate('KLASTER', 'en'),
    i18n.translate('PUSAT DALAM PLUME', 'en'), i18n.translate('AQI MAX', 'en'),
    i18n.translate('DLM KONSESI', 'en'), i18n.translate('GUNUNG ERUPSI', 'en'),
    i18n.translate('TIDAK SEHAT BAGI KELOMPOK SENSITIF', 'en')
  ].join(' | '),
  'HOTSPOTS | CONFIDENCE ≥80 | FRP MW | CLUSTERS | CENTERS IN PLUME | MAX AQI | IN CONCESSIONS | ERUPTING VOLCANOES | UNHEALTHY FOR SENSITIVE GROUPS');
check('scheduler/API statuses translate ages, singular intervals, failures, and error timestamps',
  [
    i18n.translate('AKTIF · data di halaman 12 menit lalu', 'en'),
    i18n.translate('CACHE 35 menit lalu', 'en'),
    i18n.translate('TERLAMBAT · 1 jam lalu', 'en'),
    i18n.translate('· gagal 3×', 'en'),
    i18n.translate('tiap 1 jam', 'en'),
    i18n.translate('run 12/4', 'en'),
    i18n.translate('galat terakhir 10:10:10 UTC', 'en')
  ].join(' | '),
  'ACTIVE · page data 12 min ago | CACHED · 35 min ago | LATE · 1 hr ago | · 3 consecutive failures | every 1 hour | runs: 12 · failures: 4 | last error at 10:10:10 UTC');
check('critical scheduler alerts retain their warning icon and translate the full count',
  i18n.translate('⚠️ 2 tugas kritis gagal berturut:', 'en'),
  '⚠️ 2 consecutive critical task failures:');
check('location fallback and AQI map hints translate when dynamic clauses are appended',
  [
    i18n.translate('Peramban ini tidak menyediakan layanan lokasi. Peta dipusatkan ke titik api terpanas saat ini sebagai gantinya.', 'en'),
    i18n.translate('Filter AQI direset, menampilkan semua 120 sel.', 'en'),
    i18n.translate('Filter AQI ≥ 25, 10 dari 20 sel ditampilkan.', 'en'),
    i18n.translate('Batas tampilan peta tidak valid.', 'en')
  ].join(' | '),
  'This browser does not provide location services. The map was centered on the current highest-FRP hotspot instead. | AQI filter reset; showing all 120 cells. | AQI filter ≥ 25; 10 of 20 cells shown. | Invalid map viewport bounds.');
check('layout and AI map hints translate, including a variable panel count',
  [
    i18n.translate('Mode atur selesai, layout tetap free floating. Klik ATUR LAYOUT lagi untuk edit, atau SIMPAN LOKAL untuk patenkan.', 'en'),
    i18n.translate('Layout desktop disimpan lokal, 12 panel. Export JSON untuk dipatenkan jadi default semua user.', 'en'),
    i18n.translate('AI Asisten dibuka, drag header ⋮⋮ untuk geser posisi, ketik pertanyaan tentang data bencana.', 'en')
  ].join(' | '),
  'Edit mode ended; the layout remains free-floating. Select EDIT LAYOUT to continue, or SAVE LOCALLY to keep it. | desktop layout saved locally with 12 panels. Export JSON to make it the default for all users. | AI assistant opened. Drag the ⋮⋮ header to move it, then ask about disaster data.');
check('browser prompt for layout export follows the active language',
  /prompt\(getLanguage\(\) === 'en'[\s\S]*?Copy this layout JSON to save it as the default:/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('flight popup ICAO24 label translates while keeping the identifier intact',
  i18n.translate('Kode ICAO24: abc123', 'en'), 'ICAO24 code: abc123');
check('news fetch timestamp stays raw and is reformatted on language changes',
  /state\.newsFetchedAt = d\.fetchedAt \|\| new Date\(\)\.toISOString\(\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'))
    && /if \(state\.newsFetchedAt\) state\.newsAt = fmtJamWib\(Date\.parse\(state\.newsFetchedAt\)\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'))
    && /news: state\.newsFetchedAt \|\| null/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')), true);
check('hazard refresh time is reformatted on language changes from its raw timestamp',
  /if \(state\.hazardFetchedAt\) \{[\s\S]*?state\.hazardAt = new Date\(state\.hazardFetchedAt\)\.toLocaleTimeString\(getLocale\(\), \{\s*timeZone: 'Asia\/Jakarta'/.test(
    fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')
  ), true);
check('scheduler log and last-error clocks use active locale while retaining UTC',
  /function fmtUtcClock\(value\)[\s\S]*?toLocaleTimeString\(getLocale\(\), \{\s*timeZone: 'UTC'[\s\S]*?\}\) \+ ' UTC'/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'))
    && /lg\.at \? fmtUtcClock\(lg\.at\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8'))
    && /galat terakhir ' \+ fmtUtcClock\(t\.lastErrorAt\)/.test(fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8')), true);

console.log('\n========================================');
console.log('  ' + passed + ' passed, ' + failed + ' failed');
console.log('========================================');
if (failed) process.exitCode = 1;
