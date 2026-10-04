#!/usr/bin/env python3
"""
Verifikasi penyimpanan tetap produksi.

Dipanggil SETELAH OPS_GITHUB_* atau UPSTASH_* dipasang di Vercel dan di-redeploy.
Tanpa argumen apa pun ia hanya MEMBACA (aman dijalankan kapan saja):

    python3 scripts/verify-store.py

Untuk membuktikan bahwa data benar-benar bertahan (dan bertahan lintas instance
Vercel), jalankan dengan --tulis: satu insiden uji dibuat, dibaca kembali dua
kali (dua permintaan berbeda bisa mendarat di instance berbeda), lalu ditutup
dengan judul yang jelas. Insiden itu TIDAK dihapus , biar terlihat di papan.

    python3 scripts/verify-store.py --tulis
"""
import json
import sys
import urllib.error
import urllib.request

BASE = "https://firewatch-id.vercel.app"
TULIS = "--tulis" in sys.argv
hasil = []


def cek(nama, ok, catatan=""):
    hasil.append(bool(ok))
    print(("  [LULUS] " if ok else "  [GAGAL] ") + nama + ("  (" + str(catatan) + ")" if catatan else ""))


def api(path, metode="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=metode)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
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
        with urllib.request.urlopen(base + "/api/operations/store?uji=1", timeout=60) as r:
            d = json.load(r)
    except Exception as e:  # noqa: BLE001 - alat diagnosa, galat apa pun harus dilaporkan
        return {"ok": False, "alasan": "Tidak bisa menghubungi %s/api/operations/store?uji=1 (%s)" % (base, e)}
    return d.get("uji") or {"ok": None, "alasan": "Rute ini belum ada di versi yang berjalan (perlu deploy baru)."}


def main():
    st, store = api("/api/operations/store")
    cek("mode penyimpanan terbaca", st == 200, st)
    mode = store.get("mode")
    print("     [info] mode:", mode, "| tetap:", store.get("persistent"), "|", store.get("note", "")[:90])

    if mode == "ephemeral":
        cek("penyimpanan tetap sudah aktif", False,
            "masih ephemeral , pasang OPS_GITHUB_TOKEN+OPS_GITHUB_REPO atau UPSTASH_REDIS_REST_URL+TOKEN, lalu REDEPLOY")
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

    st, acc = api("/api/operations/access")
    if isinstance(acc, dict) and acc.get("mode") == "token":
        print("     [info] pemasangan memakai token akses , uji tulis butuh x-ops-token")
        if not TULIS:
            return 0 if all(hasil) else 1
        print("     [info] jalankan dengan --tulis HANYA bila Anda menyiapkan header token; dilewati.")
        return 0 if all(hasil) else 1

    if not TULIS:
        print("\n  (baca-saja selesai; tambahkan --tulis untuk membuktikan data bertahan)")
        print("KESIMPULAN: %d/%d LULUS" % (sum(hasil), len(hasil)))
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
