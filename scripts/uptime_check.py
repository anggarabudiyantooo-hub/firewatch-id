#!/usr/bin/env python3
"""Periksa kesehatan sumber dari payload /api/status, dipakai pemantau uptime.

Aturan penilaian (dibuat konservatif supaya TIDAK memunculkan alarm palsu):

- GAGAL: ringkasan publik menandai `persistentFailure` setelah tiga
  kegagalan berturut-turut. Jumlah dan rincian galat tidak dipublikasikan.
- PERINGATAN: tugas punya data dan penjadwal menandai `late` (umur data >
  2,5 kali interval). Tugas tanpa data sengaja TIDAK dinilai: pada serverless,
  instance dingin melaporkan "belum diminta" untuk sumber on-demand (berita,
  pengungsi, letusan), bukan kerusakan.

Keluaran: ringkasan ke stdout + berkas isi tiket (default /tmp/uptime_body.md).
Kode keluar: 1 bila ada GAGAL (agar alur kerja bisa bercabang), selain itu 0.
"""
import json
import sys
import os
from datetime import datetime, timezone, timedelta

HEADER = "Pantauan otomatis kesehatan sumber data SIAGA.ID"
BODY_PATH = "/tmp/uptime_body.md"


def nilai(payload):
    gagal, peringatan = [], []
    for t in payload.get("tasks", []):
        label = t.get("label") or "?"
        if t.get("persistentFailure"):
            gagal.append("%s, sumber berulang kali gagal (rincian tidak dipublikasikan)" % label)
        if t.get("late"):
            peringatan.append("%s, data tertinggal (%s, jadwal %s)"
                              % (label, t.get("ageLabel") or "?", t.get("everyLabel") or "?"))
    return gagal, peringatan


def tulis_body(payload, gagal, peringatan):
    wib = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=7)))
    baris = [
        "**%s**, %s WIB" % (HEADER, wib.strftime("%d %b %H:%M")),
        "",
        "Sumber aktif: **%s dari %s** · diperiksa dari payload `/api/status` produksi."
        % (payload.get("healthy", "?"), payload.get("total", "?")),
        "",
    ]
    if gagal:
        baris.append("### Gagal (%d)" % len(gagal))
        baris += ["- " + x for x in gagal]
        baris.append("")
    if peringatan:
        baris.append("### Peringatan, data tertinggal (%d)" % len(peringatan))
        baris += ["- " + x for x in peringatan]
        baris.append("")
    if not gagal and not peringatan:
        baris.append("Semua sumber yang melaporkan data berada dalam batas normal.")
        baris.append("")
    baris.append("_Tiket ini dibuka/ditutup otomatis oleh `.github/workflows/uptime.yml`. "
                 "Ambang: gagal 3× berturut-turut = masalah; data > 2,5× interval = peringatan. "
                 "Tugas tanpa data tidak dinilai (instance dingin bukan kerusakan)._")
    return "\n".join(baris)


def main():
    sumber = sys.argv[1] if len(sys.argv) > 1 else "/tmp/status.json"
    if sumber.startswith("http"):
        import urllib.request
        with urllib.request.urlopen(sumber, timeout=40) as r:
            payload = json.load(r)
    else:
        with open(sumber, encoding="utf-8") as f:
            payload = json.load(f)

    gagal, peringatan = nilai(payload)
    print(tulis_body(payload, gagal, peringatan))
    try:
        with open(BODY_PATH, "w", encoding="utf-8") as f:
            f.write(tulis_body(payload, gagal, peringatan) + "\n")
    except OSError:
        pass
    if gagal:
        print("\nVERDIKT: MASALAH, %d sumber gagal berturut-turut" % len(gagal))
        return 1
    if peringatan:
        print("\nVERDIKT: PERINGATAN, %d sumber datanya tertinggal" % len(peringatan))
        return 0
    print("\nVERDIKT: SEHAT")
    return 0


if __name__ == "__main__":
    sys.exit(main())
