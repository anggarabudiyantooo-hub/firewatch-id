# Hasil eval SIAGA.ID

Sumber kasus: `evals/cases.json`.

Dijalankan: 2026-11-04T16:13:58.159Z

Origin: http://127.0.0.1:3000

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

- Lulus: 0
- Gagal: 0
- Dilewati: 26

| Kasus | Nama | Hasil | Catatan |
| --- | --- | --- | --- |
| Q01 | data | LEWAT | --tools-only: fase agen dilewati |
| Q02 | data | LEWAT | --tools-only: fase agen dilewati |
| Q03 | data | LEWAT | --tools-only: fase agen dilewati |
| Q04 | data | LEWAT | --tools-only: fase agen dilewati |
| Q05 | data | LEWAT | --tools-only: fase agen dilewati |
| Q06 | data | LEWAT | --tools-only: fase agen dilewati |
| Q07 | data | LEWAT | --tools-only: fase agen dilewati |
| Q08 | data | LEWAT | --tools-only: fase agen dilewati |
| Q09 | data | LEWAT | --tools-only: fase agen dilewati |
| Q10 | data | LEWAT | --tools-only: fase agen dilewati |
| Q11 | data | LEWAT | --tools-only: fase agen dilewati |
| Q12 | data | LEWAT | --tools-only: fase agen dilewati |
| Q13 | data | LEWAT | --tools-only: fase agen dilewati |
| Q14 | data | LEWAT | --tools-only: fase agen dilewati |
| Q15 | data | LEWAT | --tools-only: fase agen dilewati |
| Q16 | data | LEWAT | --tools-only: fase agen dilewati |
| Q17 | data | LEWAT | --tools-only: fase agen dilewati |
| Q18 | data | LEWAT | --tools-only: fase agen dilewati |
| Q19 | data | LEWAT | --tools-only: fase agen dilewati |
| Q20 | data | LEWAT | --tools-only: fase agen dilewati |
| R01 | refusal | LEWAT | --tools-only: fase agen dilewati |
| R02 | refusal | LEWAT | --tools-only: fase agen dilewati |
| R03 | refusal | LEWAT | --tools-only: fase agen dilewati |
| R04 | refusal | LEWAT | --tools-only: fase agen dilewati |
| R05 | refusal | LEWAT | --tools-only: fase agen dilewati |
| R06 | refusal | LEWAT | --tools-only: fase agen dilewati |

## Cara membaca hasil

Fase alat memeriksa lapisan data dan batas interpretasi tanpa memanggil model, jadi hasilnya bisa diulang siapa pun tanpa kunci API.
Fase agen hanya dinilai bila server memegang MODEL_API_KEY. Tanpa kunci, kasus agen dilaporkan DILEWATI, bukan lulus.
Verifier angka menolak angka yang tidak ada di hasil alat; status `flagged` dihitung gagal walau jawabannya terdengar masuk akal.
