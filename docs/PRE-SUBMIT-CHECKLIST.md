# Pre-submit checklist

Run top to bottom. Anything unchecked is a blocker unless the note says otherwise.
Do not tick a box you have not actually verified.

## 1. Repository is reachable

- [x] `https://github.com/anggarabudiyantooo-hub/firewatch-id` is public: the unauthenticated
      API returns 200. Still open it in a private window yourself before submitting.
- [x] Default branch is `main` and contains the merged hackathon work (verified via the API).
- [x] `README.md` is on `main` and **all 14 internal links resolve** (each fetched from the
      API at `ref=main`, zero broken).
- [x] `HACKATHON.md`, `docs/DEMO-SCRIPT.md`, `evals/results.md`, `LICENSE`,
      `docs/PRE-SUBMIT-CHECKLIST.md` and the demo MP4 all return 200 at `ref=main`.
- [x] `LICENSE` is MIT and names the copyright holder (c) 2026 anggarabudiyantooo-hub.

## 2. No secrets anywhere

- [x] `node scripts/audit-secrets.js` passes on a **full clone** (not shallow): 0 real findings
      across tracked files and git history. It prints locations, never values. The `ghp_`
      matches it reports are regex and test-fixture literals, not credentials.
      Owner action still required: see section 8b.
- [x] `.env` is not tracked and never was: `git log --all --diff-filter=A --name-only` over all
      branches returns no `.env` entry.
- [x] No API key in `public/`: a scan for `sk-`, `ghp_` and assigned `MODEL_API_KEY` literals
      returns nothing. The demo video was recorded on the public site only, never on an
      admin session, and no env-var screen was recorded.

## 3. Admin surface is locked

- [x] `/operations` returns 303 to `/admin-login` and `/api/admin/status` returns 401 for an
      anonymous visitor (verified against production).
- [x] `/admin-login` is `noindex` and has a visible way back to the public site
      (asserted by `scripts/test-global-ai-dan-login.js`).

## 4. Public site works for a stranger

Test in a private window, on desktop and on a phone:

- [x] `/` loads and the nav reaches Dashboard, Reports and Cek Asap: all five public routes
      return 200 anonymously (`/`, `/dashboard`, `/reports`, `/cek-asap`, `/tentang-data`).
- [x] `/dashboard` renders the map, layers toggle, the assistant opens: asserted on desktop
      and mobile by `manual-agent-ui.js` and `manual-map-capture.js` against production.
- [x] "Capture map" produces a PNG with legend, attribution, WIB stamp and disclaimer inside the
      image. Verified on camera and in the extracted frames of the demo recording.
- [x] `/reports` mini map loads, capture works, "Add to report" fills the snapshot block.
- [x] "Export one-page PDF" downloads a **single page** with the map, figures, narrative,
      limitations, sources and disclaimer. `docs/demo-video/demo-report.pdf` was downloaded by
      the recorder and its page count checked: 1.
- [x] `/cek-asap` accepts a photo, strips EXIF, returns a verdict with evidence and limitations.
      Re-encoding in the browser drops EXIF including GPS; asserted by `test-smoke-check.js`.
- [x] Language switch ID/EN works on every page: `test-i18n.js` (75 checks) plus frame-by-frame
      inspection of the English demo recording, which is how the untranslated dust tab,
      legend, capture button and AQI category were found and fixed.
- [x] No horizontal overflow at 390 px width: `manual-map-capture.js` asserts `overflow=0` on
      mobile, and the agent panel is exercised at mobile width too.
- [x] The footer is not covered by the assistant toggle: asserted by
      `test-global-ai-dan-login.js` (`padding-bottom` reserved at desktop and under 600 px).

## 5. Failure modes are honest

- [x] With `MODEL_API_KEY` unset: assistant, map narrative and Cek Asap all show a labelled
      local mode and never claim to be model output. `manual-agent-ui.js` ran in exactly this
      state and asserted the honest-mode badge; `test-map-capture.js` asserts
      `provider === 'local-fallback'` with `META_API_KEY_MISSING`.
- [x] Blocking `/api/map-narrative` produces an explanation, not a blank image:
      `manual-map-capture.js` forces the failure and asserts the message
      "Narasi AI gagal diminta. Jaringan atau kuota bermasalah." is shown.
- [x] Blocking `/api/cek-asap` produces an error message, not a silent spinner
      (`CEK_ASAP_FAILED` surfaced by the page; covered by `manual-smoke-check.js`).
- [x] A basemap that refuses CORS produces `CANVAS_TAINTED_CORS`, not a blank PNG
      (unit-tested; the nine Esri layers were also confirmed to send `Access-Control-Allow-Origin: *`).
- [x] An empty detection window says "unavailable", never "zero affected": the tools return
      `[]` for read-but-empty and `null` for unreadable, and eval cases assert the distinction.

## 6. Tests and evals

- [x] `npm ci && npm run check` exits 0: 51 test files, style 231 files / 0 findings,
      secret audit 0 real findings.
- [x] `npm run eval:tools` reports tool 24/24 and agent 26 SKIPPED without a key, which is
      the intended behaviour. Note it rewrites `evals/results.*`; restore them afterwards.
- [x] `node evals/run.js --origin=https://firewatch-id.vercel.app` run five times against the
      keyed deployment. Tool 24/24 every run. Agent progressed 13/26 -> 22/26 -> 22/26 ->
      22/26 -> **25/26** as each run exposed a real bug that was then fixed in code.
      The last failure (Q18) is Meta's content filter refusing one Indonesian phrasing;
      it was left in place rather than reworded. `evals/results.md` and the README carry the
      numbers, the progression and that explanation.
- [x] All three browser suites run against production with
      `SIAGA_ORIGIN=https://firewatch-id.vercel.app`:
      `manual-map-capture.js` **20/20** (two timeline frames, one-page PDF with two images,
      mobile overflow 0, narrative failure explained rather than a blank image),
      `manual-agent-ui.js` **10/10** (desktop and mobile, verification badge visible),
      `manual-smoke-check.js` **29 checks**. Screenshots in `docs/screenshots/map-capture/`.
      The demo recorder additionally logged 15 steps with **0 failures**.
- [x] CI is green on `main` (`check`, CodeQL and all three Analyze jobs success) and production
      serves the merged code: all five public routes 200, `/operations` 303, admin API 401.

## 7. Submission artefacts

- [x] Demo video is **exactly 3:00**, in English, 1440x900 H.264 + AAC, committed at
      `docs/demo-video/siaga-id-demo-3min.mp4`. It opens from the public repo without a login.
      Narration is synthetic; screen playback is time-compressed where it waited on the model,
      and `build-report.json` records every speed factor.
- [x] The video shows: problem, report with snapshot and narrative, agent with evidence trail
      (including `find_place` resolving Pekanbaru), Cek Asap, and the closing "what was built".
      `recording-log.json` records every step; no step failed during the final recording.
- [x] The video does not show any key, token, admin session or personal data: every segment
      was recorded against public routes, and the frames were inspected.
- [x] `HACKATHON.md` separates window work from the 183 pre-existing commits; every listed
      SHA was checked to exist and its commit date read from git. Dates are UTC and the
      deadline conversion (5 Nov 09:00 WIB = 02:00 UTC) is disclosed.

## 8. Content safety

- [x] No medical advice anywhere in the UI or the model prompts' allowed output; the prompt
      forbids it and three eval refusal cases assert the agent defers to authorities.
- [x] No evacuation orders; emergency number 112 and official agencies are shown, and the
      refusal eval cases assert the agent does not issue evacuation instructions.
- [x] No political or war content; refusal eval cases cover politics and military targeting,
      and the methodology page states there is no military or private-jet layer.
- [x] Concession data appears only as a neutral verification hint, never as an accusation;
      an eval refusal case asserts the agent will not name a company as the cause.
- [x] Cek Asap discloses that the image is forwarded to the Meta Model API, held in memory
      for one request and discarded (`public/cek-asap.html`, ID and EN).
- [x] Methodology content still present: the static gate asserts the exact Indonesian
      literals (`bukan khusus asap`, `bukan PM2.5 permukaan`,
      `Area transparan bukan bukti udara bersih`, and the rest) and fails if any is removed.

## 8b. Only the repository owner can tick these

These need the Vercel dashboard, the Meta console or the submission form. They are left
unchecked on purpose; an agent cannot verify them and ticking them would be a false claim.

- [ ] **WAJIB DIROTASI**: the GitHub PAT pasted into chat during this build must be revoked at
      `https://github.com/settings/tokens`. It was used in memory only and never written to any
      file, git config or remote URL; a workspace-wide grep found no copy. Revoke it anyway,
      because a chat transcript is not a secret store.
- [ ] `MODEL_API_KEY` spend limit set in the Meta console.
- [ ] `ADMIN_PASSWORD_HASH` is bcrypt cost >= 12, `SESSION_SECRET` >= 32 random bytes, and
      legacy `OPS_TOKEN_*` removed, all in Vercel env vars only. The Vercel connector returned
      "Access denied" for this account, so none of these could be read or confirmed here.
- [ ] Submission form: model `muse-spark-1.3` via the Meta Model API, track
      **Build for Your World**, and the video link.

## 9. Known gaps to state plainly in the submission

- [x] P2 (SAM 3.1 segmentation, Muse Voice Transcribe) not implemented, with the reason,
      in both `README.md` and `HACKATHON.md`.
- [x] The map image draws a capped top-2,000 subset while the figures use all detections;
      both the capture chrome and the narrative disclose this.
- [x] The Meta Model API public preview is documented as US-only; other regions fall back.
      Stated in `README.md` limitations.
- [x] Agent-phase eval results depend on a keyed server and are marked SKIPPED without one
      (verified by running `npm run eval:tools` locally).
- [x] The agent eval is **25/26**, not a clean sweep, and the remaining failure is a provider
      content-filter refusal. Say so if asked; do not claim 26/26.
