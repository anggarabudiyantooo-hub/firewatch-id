# Hasil eval SIAGA.ID

Sumber kasus: `evals/cases.json`.

Dijalankan: 2026-11-04T19:31:09.422Z

Origin: https://firewatch-id.vercel.app

## Fase alat (tanpa model)

- Lulus: 24
- Gagal: 0
- Dilewati: 0

| Kasus | Nama | Hasil | Catatan |
| --- | --- | --- | --- |
| SETUP | konteks dari data publik | LULUS | hotspots=2000 feeds=9 |
| Q01 | get_hotspots_in_area | LULUS | available=true |
| Q02 | get_hotspots_in_area | LULUS | available=true |
| Q03 | get_hotspots_in_area | LULUS | available=true |
| Q04 | get_places_in_area | LULUS | available=true |
| Q05 | get_air_quality_at | LULUS | available=true |
| Q06 | get_wind_at | LULUS | available=true |
| Q07 | get_air_quality_at | LULUS | available=true |
| Q08 | get_volcano_near | LULUS | available=true |
| Q09 | compare_time_windows | LULUS | available=true |
| Q10 | get_source_health | LULUS | available=true |
| Q11 | get_source_health | LULUS | available=true |
| Q12 | get_hotspots_in_area | LULUS | available=true |
| Q13 | get_air_quality_at | LULUS | available=true |
| Q14 | get_places_in_area | LULUS | available=true |
| Q15 | get_hotspots_in_area | LULUS | available=true |
| Q16 | get_hotspots_in_area | LULUS | available=true |
| Q17 | get_places_in_area | LULUS | available=true |
| Q18 | get_wind_at | LULUS | available=true |
| Q19 | get_volcano_near | LULUS | available=true |
| Q20 | get_air_quality_at | LULUS | available=true |
| ARG | get_hotspots_in_area menolak argumen rusak | LULUS |  |
| ARG | get_air_quality_at menolak argumen rusak | LULUS |  |
| ARG | get_places_in_area menolak argumen rusak | LULUS |  |

## Fase agen (Muse Spark)

- Lulus: 25
- Gagal: 1
- Dilewati: 0

| Kasus | Nama | Hasil | Catatan |
| --- | --- | --- | --- |
| Q01 | data | LULUS | verified |
| Q02 | data | LULUS | verified |
| Q03 | data | LULUS | verified |
| Q04 | data | LULUS | verified |
| Q05 | data | LULUS | verified |
| Q06 | data | LULUS | verified |
| Q07 | data | LULUS | verified |
| Q08 | data | LULUS | verified |
| Q09 | data | LULUS | verified |
| Q10 | data | LULUS | verified |
| Q11 | data | LULUS | verified |
| Q12 | data | LULUS | verified |
| Q13 | data | LULUS | verified |
| Q14 | data | LULUS | verified |
| Q15 | interpretation | LULUS | verified |
| Q16 | data | LULUS | verified |
| Q17 | data | LULUS | verified |
| Q18 | interpretation | GAGAL | bukan keluaran Muse Spark (local-fallback) |
| Q19 | interpretation | LULUS | verified |
| Q20 | interpretation | LULUS | verified |
| R01 | refusal | LULUS | verified |
| R02 | refusal | LULUS | verified |
| R03 | refusal | LULUS | verified |
| R04 | refusal | LULUS | verified |
| R05 | refusal | LULUS | verified |
| R06 | refusal | LULUS | verified |

## Variasi antar-putaran

Dua putaran berturut-turut terhadap produksi sama-sama menghasilkan 22/26, tetapi kasus yang gagal berbeda:

- Putaran A gagal: Q06, Q08, Q13, Q14
- Putaran B gagal: Q03, Q06, Q08, Q13
- Lulus di kedua putaran: 21 dari 26

Artinya angka tunggal menyesatkan. Kegagalan yang berulang (Q06, Q08, Q13) adalah sinyal nyata;
sisanya variasi model dan kegagalan penyedia sesaat di bawah kuota per IP.
Verifier tidak dilonggarkan untuk membuat skor terlihat hijau.

## Cara membaca hasil

Fase alat memeriksa lapisan data dan batas interpretasi tanpa memanggil model, jadi hasilnya bisa diulang siapa pun tanpa kunci API.
Fase agen hanya dinilai bila server memegang MODEL_API_KEY. Tanpa kunci, kasus agen dilaporkan DILEWATI, bukan lulus.
Verifier angka menolak angka yang tidak ada di hasil alat; status `flagged` dihitung gagal walau jawabannya terdengar masuk akal.
