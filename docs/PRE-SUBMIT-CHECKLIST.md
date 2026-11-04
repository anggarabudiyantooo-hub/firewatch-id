# Pre-submit checklist

Run top to bottom. Anything unchecked is a blocker unless the note says otherwise.
Do not tick a box you have not actually verified.

## 1. Repository is reachable

- [x] `https://github.com/anggarabudiyantooo-hub/firewatch-id` is public: the unauthenticated
      API returns 200. Still open it in a private window yourself before submitting.
- [ ] Default branch contains the merged hackathon work.
- [ ] `README.md` renders on the repo home page and its internal links resolve.
- [ ] `HACKATHON.md`, `docs/DEMO-SCRIPT.md`, `evals/results.md` are present on the default branch.
- [ ] `LICENSE` is MIT and names the copyright holder.

## 2. No secrets anywhere

- [x] `node scripts/audit-secrets.js` passes on a **full clone** (not shallow): 227 tracked
      files, 242 commits, 0 real findings. It prints locations, never values.
- [ ] `.env` is not tracked and never was: `git log --all --diff-filter=A --name-only | grep '\.env$'`
      returns nothing.
- [ ] No API key in `public/`, in screenshots, or in the demo video.
- [ ] If any real credential was ever committed or pasted into a chat: **WAJIB DIROTASI**.
      Revoke and reissue it, then re-run the audit. Do not print the old value anywhere.
- [ ] GitHub personal access tokens used during development have been revoked.
- [ ] `MODEL_API_KEY` in Vercel has a **spend limit** set in the Meta console.

## 3. Admin surface is locked

- [x] `/operations` returns 303 to `/admin-login` and `/api/admin/status` returns 401 for an
      anonymous visitor (verified against production).
- [ ] `ADMIN_PASSWORD_HASH` is a bcrypt hash (cost >= 12) stored only in Vercel env vars.
- [ ] `SESSION_SECRET` is at least 32 random bytes, stored only in Vercel env vars.
- [ ] Legacy `OPS_TOKEN_*` variables removed from Vercel; they no longer authenticate.
- [ ] `/admin-login` is `noindex` and has a visible way back to the public site.

## 4. Public site works for a stranger

Test in a private window, on desktop and on a phone:

- [ ] `/` loads and the nav reaches Dashboard, Reports and Cek Asap.
- [ ] `/dashboard` renders the map, layers toggle, the assistant opens.
- [ ] "Capture map" produces a PNG with legend, attribution, WIB stamp and disclaimer inside the image.
- [ ] `/reports` mini map loads, capture works, "Add to report" fills the snapshot block.
- [ ] "Export one-page PDF" downloads a **single page** with the map, figures, narrative,
      limitations, sources and disclaimer.
- [ ] `/cek-asap` accepts a photo, strips EXIF, returns a verdict with evidence and limitations.
- [ ] Language switch ID/EN works on every page, including the new ones.
- [ ] No horizontal overflow at 390 px width.
- [ ] The footer is not covered by the assistant toggle.

## 5. Failure modes are honest

- [ ] With `MODEL_API_KEY` unset: assistant, map narrative and Cek Asap all show a labelled
      local mode and never claim to be model output.
- [ ] Blocking `/api/map-narrative` in devtools produces an explanation, not a blank image.
- [ ] Blocking `/api/cek-asap` produces an error message, not a silent spinner.
- [ ] A basemap that refuses CORS produces `CANVAS_TAINTED_CORS`, not a blank PNG.
- [ ] An empty detection window says "unavailable", never "zero affected".

## 6. Tests and evals

- [ ] `npm ci && npm run check` exits 0 (style, secret audit, all test files).
- [ ] `npm run eval:tools` reports the tool phase passing.
- [x] `node evals/run.js --origin=https://firewatch-id.vercel.app` run twice against the keyed
      deployment. Tool 24/24. Agent 22/26 both runs, but different cases failed; only 21/26
      passed in both. `evals/results.md` and the README carry those numbers and the variance.
- [ ] Manual browser suites run and their screenshots committed:
      `node scripts/manual-map-capture.js`, `node scripts/manual-agent-ui.js`,
      `node scripts/manual-smoke-check.js`.
- [ ] CI is green on the default branch and the Vercel production deployment succeeded.

## 7. Submission artefacts

- [ ] Demo video is **3 minutes or less**, in English, and the link opens without a login
      (test in a private window).
- [ ] The video shows: problem, report with snapshot and narrative, agent with evidence trail,
      Cek Asap, and the closing "what was built" segment.
- [ ] The video does not show any key, token, admin session or personal data.
- [ ] Submission form names the Meta model used: `muse-spark-1.3` via the Meta Model API.
- [ ] Track selected: **Build for Your World**.
- [ ] `HACKATHON.md` clearly separates window work from pre-existing work; nothing is backdated.

## 8. Content safety

- [ ] No medical advice anywhere in the UI or the model prompts' allowed output.
- [ ] No evacuation orders; emergency number 112 and official agencies are shown.
- [ ] No political or war content.
- [ ] Concession data appears only as a neutral verification hint, never as an accusation.
- [ ] Cek Asap discloses that the image is forwarded to the Meta Model API and not retained.
- [ ] Methodology page still contains every disclaimer, attribution and accuracy caveat.

## 9. Known gaps to state plainly in the submission

- [ ] P2 (SAM 3.1 segmentation, Muse Voice Transcribe) not implemented, with the reason.
- [ ] The map image draws a capped top-2,000 subset while the figures use all detections;
      both the capture chrome and the narrative disclose this.
- [ ] The Meta Model API public preview is documented as US-only; other regions fall back.
- [ ] Agent-phase eval results depend on a keyed server and are marked SKIPPED without one.
- [ ] The agent eval is 22/26 with run-to-run variance, not a clean sweep. Say so if asked.
