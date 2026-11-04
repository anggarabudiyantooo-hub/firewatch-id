#!/usr/bin/env bash
# Commit dan push artefak data terjadwal ke main, tahan terhadap cron lain
# yang mendorong lebih dulu.
#
# Mengapa perlu: beberapa cron berjalan bersamaan. Pada 2026-11-04 cron arsip
# mendorong commit sementara cron grid CAMS masih mengunduh selama sebelas
# menit. Checkout grid itu jadi basi dan push ditolak dengan "fetch first",
# sehingga artefak yang sudah berhasil diunduh terbuang.
#
# Skrip ini mengulang secara terbatas: fetch, rebase, push. Bila rebase
# bertabrakan dengan perubahan lain, ia berhenti jujur dan TIDAK memaksa push,
# karena memaksa akan menghapus kerja cron yang lain.
#
# Pakai: scripts/ci-commit-push.sh <pesan commit> <berkas...>
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Pakai: $0 <pesan commit> <berkas...>" >&2
  exit 2
fi

MESSAGE="$1"
shift

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

git add -- "$@"

if git diff --cached --quiet; then
  echo "Tidak ada perubahan pada artefak; tidak ada yang di-commit."
  exit 0
fi

git commit -m "$MESSAGE"

for attempt in 1 2 3; do
  if git push origin HEAD:main; then
    echo "Terkirim pada percobaan $attempt."
    exit 0
  fi
  if [ "$attempt" -eq 3 ]; then
    echo "Push ditolak tiga kali; berhenti tanpa memaksa." >&2
    exit 1
  fi
  echo "Push ditolak; fetch dan rebase ke main terbaru (percobaan $attempt)."
  git fetch origin main
  if ! git rebase origin/main; then
    git rebase --abort || true
    echo "Rebase bertabrakan dengan perubahan lain; berhenti jujur." >&2
    exit 1
  fi
done