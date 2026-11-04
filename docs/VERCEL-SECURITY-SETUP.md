# Panduan owner: menyiapkan keamanan Operations di Vercel

Panduan ini menyiapkan env Production untuk branch keamanan setelah perubahan
kode ditinjau dan benar-benar masuk ke deployment. Perubahan berada pada branch
`security/lock-operations-bundle` dan PR #18; belum di-merge atau di-deploy.
**Jangan anggap `firewatch-id.vercel.app` sudah terlindungi sebelum deployment
baru diverifikasi.**

Jangan kirim password, hash, `SESSION_SECRET`, atau `CRON_SECRET` melalui chat,
tiket, PR, atau commit. Owner membuat dan memasukkan nilainya langsung pada
terminal lokal, Vercel, dan GitHub. `MODEL_API_KEY` bukan bagian dari panduan ini.

## 1. Buat hash password admin secara lokal

Dari akar repo, jalankan:

```sh
node scripts/generate-admin-hash.js
```

Masukkan password admin dua kali pada prompt tersembunyi. Pilih password acak
panjang (mis. 20 karakter atau lebih), simpan di password manager, dan jangan
ketikkan nilainya sebagai argumen perintah karena argumen bisa tersimpan di
riwayat shell. Helper mengeluarkan hash bcrypt cost 12; yang dimasukkan ke Vercel
adalah hash, bukan password.

PowerShell Windows juga menjalankan perintah yang sama dari akar repo:

```powershell
node .\scripts\generate-admin-hash.js
```

Salin hash langsung dari terminal ke form env Vercel. Jangan menyimpannya di
`.env`, `.env.example`, atau berkas repo.

## 2. Buat dua secret acak yang berbeda

Jalankan perintah ini **dua kali secara terpisah**: sekali untuk
`SESSION_SECRET`, sekali lagi untuk `CRON_SECRET`. Keluaran adalah secret; jangan
menempelkan atau mengirimkannya di chat.

macOS/Linux/Git Bash:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Simpan sementara di password manager. Jangan gunakan password admin sebagai
secret sesi, dan jangan gunakan satu nilai yang sama untuk kedua secret.

## 3. Masukkan env di Vercel

1. Buka **Vercel Dashboard → project `firewatch-id` → Settings → Environment Variables**.
2. Tambahkan nama dan nilai berikut untuk environment **Production**:

   | Nama | Nilai |
   |---|---|
   | `ADMIN_PASSWORD_HASH` | Hash bcrypt dari langkah 1 |
   | `SESSION_SECRET` | Secret acak pertama dari langkah 2 |
   | `CRON_SECRET` | Secret acak kedua dari langkah 2 |

3. Pastikan tidak ada spasi/newline tambahan saat menempelkan nilai. Jangan
   menaruh nilai pada Preview/Development kecuali memang diperlukan.
4. Jika Preview memang harus dipakai, gunakan password/hash dan secret **terpisah**
   untuk Preview; jangan salin secret Production ke Preview.

Bila salah satu env admin belum ada atau invalid, login fail-closed dengan 503.
Jika `CRON_SECRET` tidak ada di Vercel Production, `/api/cron` fail-closed dengan
503 dan penyegaran terjadwal berhenti.

## 4. Samakan `CRON_SECRET` di GitHub Actions

1. Buka repo GitHub → **Settings → Secrets and variables → Actions**.
2. Buat repository secret bernama tepat `CRON_SECRET`.
3. Masukkan **nilai yang sama** dengan `CRON_SECRET` di Vercel. Jangan menulis
   nilainya pada workflow YAML atau mengaktifkan debug echo.
4. Pastikan workflow refresh memakai header `Authorization: Bearer ...` dari
   GitHub secret; secret tidak boleh menjadi parameter URL/query.

`SESSION_SECRET` dan `ADMIN_PASSWORD_HASH` hanya diperlukan oleh aplikasi di
Vercel; keduanya tidak perlu disalin ke GitHub Actions.

## 5. Redeploy setelah env tersimpan

Env Vercel baru berlaku pada deployment baru. Setelah kode keamanan ditinjau dan
sudah tersedia pada branch/deployment yang memang akan dipakai, lakukan
redeploy Production dari Vercel. Tidak perlu dan jangan meminta secret melalui
chat kepada siapa pun yang meninjau kode.

## 6. Verifikasi tanpa mengirim kredensial

Gunakan browser untuk alur login. Pemeriksaan anonim berikut tidak memerlukan
secret dan tidak mengubah data:

```powershell
$base = 'https://firewatch-id.vercel.app'
curl.exe -sS -D - -o NUL "$base/robots.txt"
curl.exe -sS -D - -o NUL "$base/operations"
curl.exe -sS -D - "$base/api/admin/operations/health"
curl.exe -sS -D - "$base/admin-assets/ops.js"
```

Harapan setelah deployment security:

- `/robots.txt` berisi `Disallow` untuk `/operations`, `/insiden`, `/admin-assets/`,
  `/admin-login`, dan `/api/`.
- `/operations` tanpa sesi mengembalikan redirect login (303), `X-Robots-Tag`
  `noindex`, dan cache privat/no-store. Jangan gunakan `-L` untuk tes ini karena
  `-L` mengikuti redirect.
- `/api/admin/operations/health` tanpa cookie admin mengembalikan 401.
- `/admin-assets/ops.js` tanpa sesi mengembalikan 401, bukan file JavaScript.
- `/admin-login` tersedia, namun mengirim `X-Robots-Tag: noindex` dan
  `Cache-Control: private, no-store`.

Lalu buka `/admin-login` di browser dan masuk. Jika ingin memeriksa password
salah, lakukan **satu** percobaan saja: respons generik 401 yang diharapkan.
Backoff bertambah dan dapat mengunci IP selama 15 menit setelah kegagalan
berulang. Jangan melakukan pengujian brute force.

Sesudah masuk, `/operations` dan `/insiden/:id` harus terbuka, API admin dibaca
lewat cookie sesi, dan mutasi dilakukan UI dengan CSRF/Origin otomatis. Tekan
**Logout**, lalu pastikan membuka `/operations` kembali meminta login. Cookie
bersifat stateless dan berakhir setelah 8 jam; logout menghapus cookie browser,
namun salinan cookie yang dicuri tetap berlaku sampai expiry.

## 7. Verifikasi cron dan penyimpanan

- Permintaan `/api/cron` tanpa Bearer harus ditolak (401 bila secret ada, 503
  bila secret belum dikonfigurasi). Jangan kirim `CRON_SECRET` di URL.
- **Jangan memanggil cron berkali-kali secara manual dengan secret sah** untuk
  mengetes: endpoint menjalankan refresh data hulu dan evaluasi alert. Periksa
  keberhasilan pemanggilan pada GitHub Actions terjadwal. Jika owner memilih
  menjalankan tes manual, satu pemanggilan saja dan sadar bahwa ia dapat memakai
  kuota sumber.
- Login admin tidak membuat penyimpanan insiden menjadi persisten. Pilih dan
  konfigurasi salah satu adaptor storage sesuai `docs/PENYIMPANAN.md`; tanpa itu,
  mode Vercel dapat bersifat `ephemeral`.
- Pemeriksaan baca-saja storage (setelah deployment dan login admin) dapat
  dilakukan dengan `python3 scripts/verify-store.py`. Password diminta tanpa
  echo; cookie dan CSRF tinggal di memori proses. Jangan menambahkan `--tulis`
  kecuali siap membuat dan menutup satu insiden uji yang tidak dihapus dari
  riwayat.

## Model keamanan singkat

- Cookie sesi `__Host-siaga_admin`: HMAC, `HttpOnly`, `Secure`, `SameSite=Strict`,
  8 jam.
- Mutasi API admin memerlukan sesi, Origin same-origin, token CSRF, dan JSON.
- Login dibatasi hingga 12 permintaan per 15 menit dengan backoff tambahan setelah
  kredensial gagal; aset admin dibatasi 120 permintaan per menit. Keduanya memakai
  limiter memori per instance serverless; batas dapat di-reset saat cold start/
  instance berganti dan bukan kuota global.
- `noindex` dan `robots.txt` hanya kebijakan mesin pencari, **bukan** kontrol
  akses. Kontrol akses adalah pemeriksaan sesi server-side.
- Ganti `SESSION_SECRET` akan membatalkan semua sesi yang sedang berlaku.
  Rotasi `CRON_SECRET` harus dilakukan pada Vercel dan GitHub Actions berdekatan
  waktunya agar penjadwalan tidak terputus.
