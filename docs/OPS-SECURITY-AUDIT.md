# Audit keamanan Operations Center - 4 November 2026

Audit Langkah 0 dilakukan sebelum perubahan kode, secara baca-saja pada repo dan deployment produksi `https://firewatch-id.vercel.app`. Tidak ada kredensial yang dikirim, endpoint mutasi/AI berbiaya tidak dipanggil, dan nilai environment Vercel tidak dibaca.

**Snapshot pra-perbaikan:** temuan di bawah menjelaskan keadaan yang diamati pada 4 Nov 2026 sebelum patch keamanan ini. Implementasi pada branch keamanan tidak mengubah deployment produksi sampai di-merge dan di-deploy.

## Arsitektur

Aplikasi memakai Express 4/Node.js (`server.js`) yang dibungkus sebagai Vercel Serverless Function oleh `api/index.js`; `vercel.json` menulis ulang rute ke function tersebut. Berkas `public/**` dapat disajikan langsung oleh Vercel, melewati middleware Express/Helmet. Bukti langsung: halaman `/operations` mendapat header Helmet, sedangkan `/operations.html`, `/ops.js`, `/ops.css`, dan aset statis lain tidak.

## Temuan paparan

### Halaman dan aset operator - publik (HTTP 200 tanpa kredensial)

- `/operations`, `/operations/`, `/operations.html`
- `/insiden/:id`, `/insiden.html`
- `/ops.js`, `/ops-core.js`, `/ops-detail.js`, `/ops.css`, `/insiden.js`

Halaman menyertakan `noindex` meta, tetapi tetap dapat dibuka; JavaScript dan CSS operator dapat diunduh langsung dari direktori publik. Footer `public/home.html` juga menautkan Operations Center.

### Endpoint operator

API data operasi telah memakai RBAC `x-ops-token`: pembacaan VIEWER; perubahan insiden OPERATOR; evaluasi ADMIN. Pengujian tanpa token di produksi memberi 401 untuk endpoint terlindungi. Pengecualian yang terbuka:

- `GET /api/operations/access` (200) menampilkan nama variabel token dan status konfigurasi peran, bukan nilai token.
- `GET /api/alarm` (200) memberi ringkasan kesehatan minimal bagi monitor luar.

Rute data yang sekarang terlindungi: `GET /api/operations/health`, `/api/data-sources`, `/api/alerts`, `/api/operations/infra`, `/api/operations/analytics`, `/api/operations/diagnose`, `/api/operations/audit`, `/api/incidents`, `/api/incidents/:id`, `/api/runbooks`, `/api/runbooks/:id`, `/api/operations/metrics`, `/api/operations/store`; `POST /api/operations/evaluate`, `/api/alerts/:id/incident`, `/api/incidents`, `/api/incidents/:id/{escalate,resolve,close,notes,assign}`; dan `PATCH /api/incidents/:id`. Proteksi ini belum berupa sesi admin/cookie.

### Endpoint status/debug publik

`GET /api/status` (200) mengembalikan rincian tugas scheduler, endpoint sumber, umur/waktu pemeriksaan, jumlah kegagalan, `errorNote`, `criticalAlerts`, kuota (429/5xx), dan `recentLogs`. Ini lebih detail daripada status publik yang dibutuhkan dashboard. `GET /api/ask/status` mengungkap status konfigurasi AI/model, tetapi bukan kunci. `/api/health` dan `/api/alarm` hanya memberi status ringkas.

Fallback boot di `api/index.js` memiliki cabang `?debug=...` yang dapat mengirim stack/path/versi Node jika `DEBUG_KEY` benar. Rahasia di query dapat tercatat di log URL. `GET /api/sentinel/diag` menolak anonim (404), tetapi dengan `DEBUG_KEY` Bearer dapat memanggil Copernicus dan menampilkan pesan galat hulu.

### Cron, aksi, dan layanan berbiaya

`GET /api/cron` menjalankan penyegaran scheduler dan evaluasi; tanpa Bearer menghasilkan 401 di produksi. Vercel Cron memanggilnya harian; `.github/workflows/refresh.yml` memanggilnya setiap lima menit dengan `CRON_SECRET`. `GET /api/operations/health`/`diagnose` dapat memicu warm-up saat instance Vercel dingin, `GET /api/operations/store?uji=1` menguji storage eksternal, dan `POST /api/operations/evaluate` menjalankan evaluasi.

`/api/ask` (GET) dan `/api/ask/challenge` (POST) dapat memanggil Muse Spark tanpa autentikasi. Pertanyaan dibatasi 200 karakter, claim 1.800 karakter, dan body JSON 32 KB. Rate limit saat ini berbasis `Map` per proses: 12/menit hanya untuk `/api/ask`; `/api/ask/challenge` jatuh ke bucket normal 240/menit. Batas lain ialah 90/menit untuk pola endpoint mahal dan 1.200/menit petak. Tidak ada `trust proxy`; identifikasi `req.ip` di Vercel belum dipastikan. Map dibersihkan seluruhnya ketika >5.000 entri dan batas per-proses hilang saat cold-start/instance berganti.

Endpoint publik yang dapat memicu cache-miss atau hulu mencakup `/api/overview`, `/api/wind-field`, `/api/air-quality`, `/api/smoke-grid`, `/api/smoke-grid-static`, `/api/air-point`, `/api/place`, `/api/concessions`, `/api/whose-land`, `/api/news`, `/api/flights`, `/api/webcams/foto`, `/api/aerosol-raster/meta`/petak, `/api/himawari/meta`/petak, dan `/api/sentinel/meta`/petak. Sebagian sudah memakai cache, tetapi tidak semua masuk bucket mahal.

## Secret, file, dan header

- `.gitignore` mengabaikan `.env`/`.env.*` kecuali `.env.example`. Hanya `.env.example` ditemukan sebagai path env di ref Git yang tersedia. Probe produksi `/.env` dan `/.env.example` memberi 404.
- Tidak ditemukan source map di berkas/ref yang diperiksa; probe `*.map` memberi 404.
- Scan heuristik pada 982 blob teks non-env di seluruh ref Git tidak menemukan pola umum private key atau token. Scan bukan jaminan sempurna; berkas env dan nilai Vercel dikecualikan.
- Tidak ditemukan API key/nilai env di kode klien. Kunci provider dipakai server-side; kode publik hanya memuat nama/label yang diperlukan UI.
- Tidak ditemukan kredensial yang terbukti bocor, jadi tidak ada secret yang dapat ditetapkan wajib rotasi dari bukti audit ini. Nilai `MODEL_API_KEY`, token Ops, `CRON_SECRET`, dan env Vercel tidak dibaca atau dicetak.
- Halaman dinamis `/operations` memiliki CSP, X-Frame-Options, X-Content-Type-Options, dan Referrer-Policy melalui Helmet. Berkas statis operator tidak. `X-Robots-Tag` tidak ada; `robots.txt` hanya melarang `/api/`, bukan rute operasi.

## Remediasi yang direncanakan

Opsi A: satu password admin bcrypt yang hanya disimpan sebagai hash di env, cookie sesi bertanda tangan HttpOnly/Secure/SameSite=Strict selama 8 jam, pembatasan login/backoff, CSRF/Origin check untuk mutasi, guard terpusat dan guard handler. Aset operasi dipindah keluar `public/` agar tidak dapat disajikan langsung Vercel. Endpoint admin dipindah ke `/api/admin/*`; status publik diringkas; debug query dihapus; AI challenge dan rute hulu dimasukkan ke rate limit yang sesuai.

## Status implementasi lokal - 4 November 2026

Perbaikan dikerjakan pada `security/lock-operations` berbasis `c8d7c21`;
commit autentikasi `6704810` ada di branch, sedangkan migrasi UI, route guard,
redaksi status, rate-limit coverage, tests, dan dokumentasi masih perubahan lokal
belum dikomit. Tidak ada push, PR, merge, atau deployment. Temuan HTTP produksi
di snapshot atas tetap berlaku sampai owner menyetujui deployment.

Secara lokal, `/operations`, `/insiden*`, `/admin-assets/*`, dan API
`/api/admin/*` memerlukan sesi; cookie 8 jam memakai bcrypt/HMAC, mutasi memakai
CSRF/Origin, dan login salah/backoff diuji. `/api/cron` fail-closed bila
`CRON_SECRET` kosong di Vercel/production dan menolak query-secret. `/api/status`
hanya menyajikan label/kesegaran/flag perhatian, tanpa endpoint, error text,
retry counts, quota, atau logs. Kegagalan boot tidak membuka detail lewat
`?debug=`. Dua jalur AI berbagi 12/menit; endpoint hulu 90/menit dan hanya pola
tile yang mendapat bucket 1.200/menit. Semua batas berbasis memori per-instance,
bukan kuota global.

Validasi lokal terbaru: `npm run check` lulus (style 178 berkas, 0 temuan),
15 tes autentikasi sesi, 67 tes route Operations, uji proyeksi `/api/status`,
robots/login headers, AI/upstream limits, dan fallback boot generik. Helper hash
bcrypt diuji dengan prompt TTY tanpa echo; `verify-store.py` diuji baca-saja pada
mock lokal terisolasi. `vercel.json` lolos parse dan smoke test bahwa `includeFiles`
adalah satu string glob yang mencakup `public/` dan `admin-ui/`; bundle yang benar-benar
terbentuk di Vercel belum dapat dibuktikan tanpa deployment.

Owner tetap harus memasang `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, dan
`CRON_SECRET` langsung di Vercel (serta `CRON_SECRET` di GitHub Actions) tanpa
mengirim nilainya ke repo/chat. Uji terhadap header deployment dan endpoint
produksi belum dilakukan karena patch belum dideploy. `MODEL_API_KEY` tidak
dibaca, disalin, atau diminta.
