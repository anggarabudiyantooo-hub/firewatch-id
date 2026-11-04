#!/usr/bin/env python3
"""
Verifikasi penyimpanan operasional SIAGA.ID.

Skrip ini meminta password admin melalui prompt tersembunyi, membuat sesi
sementara lewat HTTPS, lalu hanya menyimpan cookie/CSRF di memori proses.
Password, cookie, dan CSRF tidak dicetak. Tanpa --tulis, semua pemeriksaan
bersifat baca-saja. --tulis membuat satu insiden uji dan menutupnya, tetapi tidak
menghapusnya dari riwayat.

    python3 scripts/verify-store.py
    python3 scripts/verify-store.py --tulis
"""
import getpass
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request

BASE = "https://firewatch-id.vercel.app"
TULIS = "--tulis" in sys.argv
hasil = []
csrf_token = ""
cookie_jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))


def cek(nama, ok, catatan=""):
    hasil.append(bool(ok))
    print(("  [LULUS] " if ok else "  [GAGAL] ") + nama + ("  (" + str(catatan) + ")" if catatan else ""))


def api(path, metode="GET", body=None, base=BASE):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=metode)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    if metode.upper() not in ("GET", "HEAD"):
        req.add_header("Origin", base)
        if csrf_token:
            req.add_header("X-CSRF-Token", csrf_token)
    try:
        with opener.open(req, timeout=45) as response:
            try:
                return response.status, json.load(response)
            except ValueError:
                return response.status, {}
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.load(error)
        except Exception:
            return error.code, {}


def masuk_admin():
    global csrf_token
    password = getpass.getpass("Password admin SIAGA.ID (tidak ditampilkan): ")
    data = json.dumps({"password": password}).encode()
    request = urllib.request.Request(
        BASE + "/api/admin/auth/login", data=data, method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": BASE
        }
    )
    password = ""
    try:
        with opener.open(request, timeout=30) as response:
            body = json.load(response)
    except urllib.error.HTTPError as error:
        try:
            body = json.load(error)
        except Exception:
            body = {}
        cek("login admin berhasil", False, "HTTP %s; respons tidak memuat kredensial" % error.code)
        return False
    except Exception as error:
        cek("login admin berhasil", False, str(error))
        return False
    csrf_token = body.get("csrfToken", "")
    cek("login admin berhasil", response.status == 200 and body.get("authenticated") is True, response.status)
    return bool(csrf_token)


def diagnosa_store(base):
    """Panggil ?uji=1: penyimpanan diuji saat itu juga, sebab kegagalan terbaca."""
    try:
        status, data = api("/api/admin/operations/store?uji=1", base=base)
    except Exception as error:  # noqa: BLE001 - diagnosa harus melaporkan kegagalan apa pun
        return {"ok": False, "alasan": "Tidak bisa menghubungi %s/api/admin/operations/store?uji=1 (%s)" % (base, error)}
    if status != 200:
        return {"ok": False, "alasan": "Endpoint menolak akses (HTTP %s); pastikan sesi admin sah." % status}
    return data.get("uji") or {"ok": None, "alasan": "Rute uji belum tersedia pada versi yang berjalan."}


def main():
    if not masuk_admin():
        return 1

    status, session = api("/api/admin/auth/session")
    cek("status sesi terautentikasi", status == 200 and session.get("authenticated") is True, status)
    if status != 200:
        print("     [info] pastikan password admin dan environment Production benar")
        return 1

    status, store = api("/api/admin/operations/store")
    cek("mode penyimpanan terbaca", status == 200, status)
    if status != 200:
        print("     [info] pastikan sesi admin masih berlaku; cookie tidak dicetak")
        return 1
    mode = store.get("mode")
    print("     [info] mode:", mode, "| tetap:", store.get("persistent"), "|", store.get("note", "")[:90])

    if mode == "ephemeral":
        cek("penyimpanan tetap sudah aktif", False,
            "masih ephemeral; pasang OPS_GITHUB_TOKEN+OPS_GITHUB_REPO atau Upstash, lalu redeploy")
        if store.get("lastError"):
            print("     [info] galat terakhir:", store["lastError"])
        return 1

    cek("penyimpanan bersifat tetap", bool(store.get("persistent")), mode)
    if store.get("lastError"):
        print("     [info] galat terakhir dari penyimpanan:", store["lastError"])

    diagnostic = diagnosa_store(BASE)
    print("     [info] uji penyimpanan saat ini: ok=%s langkah=%s, %s"
          % (diagnostic.get("ok"), diagnostic.get("langkah"), diagnostic.get("alasan")))
    cek("penyimpanan dapat dibaca SEKARANG", diagnostic.get("ok") is True,
        diagnostic.get("alasan"))

    if not TULIS:
        print("\n  (baca-saja selesai; tambahkan --tulis untuk membuktikan data bertahan)")
        print("KESIMPULAN: %d/%d LULUS" % (sum(hasil), len(hasil)))
        return 0 if all(hasil) else 1

    status, incident = api("/api/admin/incidents", "POST", {
        "title": "Uji penyimpanan tetap (dibuat oleh scripts/verify-store.py)",
        "severity": "LOW", "category": "lain_lain",
        "description": "Dibuat sekali untuk membuktikan insiden bertahan pada penyimpanan " + str(mode) + ". Aman ditutup."
    })
    cek("insiden uji dapat dibuat", status in (200, 201), status)
    if status not in (200, 201):
        return 1
    ident = incident["incidentId"]
    print("     [info] insiden uji:", ident)

    status_a, incidents_a = api("/api/admin/incidents")
    status_b, incidents_b = api("/api/admin/incidents")
    found_a = any(item.get("incidentId") == ident for item in incidents_a.get("incidents", []))
    found_b = any(item.get("incidentId") == ident for item in incidents_b.get("incidents", []))
    cek("insiden terbaca pada pembacaan pertama", status_a == 200 and found_a, ident)
    cek("insiden terbaca pada pembacaan kedua (permintaan berbeda)", status_b == 200 and found_b, ident)

    api("/api/admin/incidents/%s/resolve" % ident, "POST", {"resolution": "Uji penyimpanan selesai."})
    status, closed = api("/api/admin/incidents/%s/close" % ident, "POST", {})
    cek("insiden uji dapat ditutup", status == 200 and closed.get("status") == "CLOSED", status)

    status, audit = api("/api/admin/operations/audit?limit=5")
    cek("tindakan uji tercatat di log audit",
        status == 200 and any(entry.get("target") == ident for entry in audit.get("entries", [])),
        len(audit.get("entries", [])))

    print("\nKESIMPULAN: %d/%d LULUS" % (sum(hasil), len(hasil)))
    return 0 if all(hasil) else 1


sys.exit(main())
