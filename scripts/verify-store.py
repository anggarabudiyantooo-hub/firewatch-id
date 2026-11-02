#!/usr/bin/env python3
"""
Verifikasi penyimpanan tetap produksi.

Dipanggil SETELAH penyimpanan dipasang dan deploy selesai. Endpoint store kini
memerlukan token VIEWER; pasang `OPS_TOKEN_VIEWER` atau token berperan lebih
tinggi di environment shell sebelum menjalankan pemeriksaan baca-saja:

    python3 scripts/verify-store.py

Untuk membuktikan bahwa data benar-benar bertahan lintas instance Vercel,
jalankan dengan `--tulis` setelah menyiapkan token OPERATOR/ADMIN di environment.
Satu insiden uji akan dibuat, dibaca kembali dua kali, lalu ditutup. Insiden itu
TIDAK dihapus dari papan. Tanpa token tulis, opsi tersebut dilewati tanpa POST.

    python3 scripts/verify-store.py --tulis
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "https://firewatch-id.vercel.app"
TULIS = "--tulis" in sys.argv
hasil = []


def cek(nama, ok, catatan=""):
    hasil.append(bool(ok))
    print(("  [LULUS] " if ok else "  [GAGAL] ") + nama + ("  (" + str(catatan) + ")" if catatan else ""))


def token_ops(untuk_tulis=False):
    nama = (("OPS_TOKEN_OPERATOR", "OPS_TOKEN_ADMIN", "OPS_WRITE_TOKEN") if untuk_tulis else
            ("OPS_TOKEN_VIEWER", "OPS_TOKEN_OPERATOR", "OPS_TOKEN_ADMIN", "OPS_WRITE_TOKEN"))
    for kunci in nama:
        nilai = os.environ.get(kunci, "").strip()
        if nilai:
            return nilai
    return ""


def api(path, metode="GET", body=None, base=BASE):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=metode)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    token = token_ops(untuk_tulis=metode.upper() not in ("GET", "HEAD"))
    if token:
        req.add_header("x-ops-token", token)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {}


def diagnosa_store(base):
    """Panggil ?uji=1: penyimpanan diuji saat itu juga, sebab kegagalan terbaca."""
    try:
        status, d = api("/api/operations/store?uji=1", base=base)
    except Exception as e:  # noqa: BLE001 - alat diagnosa, galat apa pun harus dilaporkan
        return {"ok": False, "alasan": "Tidak bisa menghubungi %s/api/operations/store?uji=1 (%s)" % (base, e)}
    if status != 200:
        return {"ok": False, "alasan": "Endpoint menolak akses (HTTP %s); pastikan token VIEWER tersedia." % status}
    return d.get("uji") or {"ok": None, "alasan": "Rute ini belum ada di versi yang berjalan (perlu deploy baru)."}


def main():
    st, acc = api("/api/operations/access")
    cek("status akses dapat dibaca", st == 200, st)
    if st != 200 or not isinstance(acc, dict):
        print("     [info] pastikan deployment dan endpoint akses tersedia")
        return 1

    mode_akses = acc.get("mode")
    if mode_akses in ("terbuka", "terkunci"):
        cek("akses operasional sudah dikunci", False,
            "mode %s; atur OPS_TOKEN_VIEWER/OPERATOR/ADMIN di Vercel, lalu redeploy" % mode_akses)
        return 1
    if mode_akses != "token":
        cek("mode akses dikenali", False, mode_akses)
        return 1
    if not token_ops():
        cek("token baca tersedia dari environment lokal", False,
            "atur OPS_TOKEN_VIEWER (atau token berperan lebih tinggi) di environment shell")
        return 1

    st, store = api("/api/operations/store")
    cek("mode penyimpanan terbaca", st == 200, st)
    if st != 200:
        print("     [info] pastikan token VIEWER lokal sah; nilai token tidak dicetak")
        return 1
    mode = store.get("mode")
    print("     [info] mode:", mode, "| tetap:", store.get("persistent"), "|", store.get("note", "")[:90])

    if mode == "ephemeral":
        cek("penyimpanan tetap sudah aktif", False,
            "masih ephemeral, pasang OPS_GITHUB_TOKEN+OPS_GITHUB_REPO atau UPSTASH_REDIS_REST_URL+TOKEN, lalu REDEPLOY")
        if store.get("lastError"):
            print("     [info] galat terakhir:", store["lastError"])
        return 1

    cek("penyimpanan bersifat tetap", bool(store.get("persistent")), mode)
    if store.get("lastError"):
        print("     [info] galat terakhir dari penyimpanan:", store["lastError"])

    # Penyimpanan bisa saja terpasang tetapi MENOLAK pembacaan (token salah,
    # izin kurang, repo keliru). Tanpa langkah ini, pengguna hanya melihat
    # "persistent: true" lalu bingung mengapa insiden tidak tampil.
    uji = diagnosa_store(BASE)
    print("     [info] uji penyimpanan saat ini: ok=%s langkah=%s , %s"
          % (uji.get("ok"), uji.get("langkah"), uji.get("alasan")))
    cek("penyimpanan dapat dibaca SEKARANG", uji.get("ok") is True,
        uji.get("alasan"))

    if not TULIS:
        print("\n  (baca-saja selesai; tambahkan --tulis untuk membuktikan data bertahan)")
        print("KESIMPULAN: %d/%d LULUS" % (sum(hasil), len(hasil)))
        return 0 if all(hasil) else 1
    if not token_ops(untuk_tulis=True):
        print("     [info] --tulis dilewati: perlu OPS_TOKEN_OPERATOR atau ADMIN; tidak ada POST yang dikirim")
        return 0 if all(hasil) else 1

    # --- bukti tahan-lama: tulis, lalu baca ulang dua kali ---
    st, inc = api("/api/incidents", "POST", {
        "title": "Uji penyimpanan tetap (dibuat oleh scripts/verify-store.py)",
        "severity": "LOW", "category": "lain_lain",
        "description": "Dibuat sekali untuk membuktikan insiden bertahan pada penyimpanan " + mode + ". Aman ditutup."
    })
    cek("insiden uji dapat dibuat", st in (200, 201), st)
    if st not in (200, 201):
        return 1
    ident = inc["incidentId"]
    print("     [info] insiden uji:", ident)

    ada1 = any(i["incidentId"] == ident for i in api("/api/incidents")[1].get("incidents", []))
    ada2 = any(i["incidentId"] == ident for i in api("/api/incidents")[1].get("incidents", []))
    cek("insiden terbaca pada pembacaan pertama", ada1, ident)
    cek("insiden terbaca pada pembacaan kedua (permintaan berbeda)", ada2, ident)

    api("/api/incidents/%s/resolve" % ident, "POST", {"resolution": "Uji penyimpanan selesai."})
    st, tutup = api("/api/incidents/%s/close" % ident, "POST", {})
    cek("insiden uji dapat ditutup", st == 200 and tutup.get("status") == "CLOSED", st)

    st, audit = api("/api/operations/audit?limit=5")
    cek("tindakan uji tercatat di log audit",
        any(e.get("target") == ident for e in audit.get("entries", [])), len(audit.get("entries", [])))

    print("\nKESIMPULAN: %d/%d LULUS" % (sum(hasil), len(hasil)))
    return 0 if all(hasil) else 1


sys.exit(main())
