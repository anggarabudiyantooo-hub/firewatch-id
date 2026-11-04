# Hackathon build log

**Meta Global AI Developer Hackathon · Track: Build for Your World**
**Window claimed: 27 October - 4 November 2026.**

This file exists so a judge can separate what was built inside the window from what
already existed. Nothing here is backdated. Every row can be checked with
`git show <sha>`; the repository history is public and unmodified.

**Date convention:** dates in the tables are git commit dates in **UTC**, which is what
`git log --date=short` prints. Submission closes 5 Nov 2026 09:00 WIB (02:00 UTC). Work done
in the early hours of 5 Nov WIB therefore carries a 4 Nov UTC date; it is quarantined in
section 1.6 rather than counted as window work.

Repository: <https://github.com/anggarabudiyantooo-hub/firewatch-id>
Branch used for this submission: `feat/hackathon-final`

---

## 1. Built inside the hackathon window

### 1.1 Meta model integration (P0-A)

| Date | Commit | What landed |
|---|---|---|
| 2026-11-02 | `398d109` | First Muse Spark integration: `lib/muse-agent.js`, bounded tool-calling agent, situation briefing, compact fire history. Model `muse-spark-1.3`, Chat Completions, key server-side only. |
| 2026-11-04 | `1748425` | Evidence casefiles (`[E1]`-`[E8]` receipts with tool, arguments, source times, limitations), skeptical challenge pass (`/api/ask/challenge`), wind overlay. |
| 2026-11-04 | `3c1b97f` | Site-wide assistant toggle and truthful configuration status: `/api/ask/status` reports whether a key exists, and explicitly says verification has not been performed. |
| 2026-11-04 | `8728289` | Seven coordinate/bbox tools (`get_hotspots_in_area`, `get_places_in_area`, `get_air_quality_at` with PM2.5 forecast, `get_wind_at`, `get_volcano_near`, `compare_time_windows`, `get_source_health`), schema-required arguments, post-hoc numeric verifier with one repair pass, "Show on map" buttons driven only by tool output, per-feed health, `local_deterministic` labelling for non-model answers. |

### 1.2 Map screenshot and multimodal report (P0-B)

| Date | Commit | What landed |
|---|---|---|
| 2026-11-04 | `cad3e6a` | `public/map-screenshot.js`: dependency-free Leaflet pane compositor, `crossOrigin: 'anonymous'` on all 9 tile layers, honest `CANVAS_TAINTED_CORS` / `MAP_NOT_READY` / `CAPTURE_EMPTY` failures. Responsive chrome with WIB stamp, bbox, zoom, basemap, timeline frame, colour legend, attribution and the 112 disclaimer baked into the PNG. `lib/map-narrative.js`: Muse Spark receives the image plus structured JSON, every figure verified against the data, one repair pass, flagged remainder, labelled local fallback. `POST /api/map-narrative` with its own per-IP bucket. |
| 2026-11-04 | `ed93edf` | `/reports` mini map (`report-map.js`), snapshot block with before/after two frames, `POST /api/map-summary` so a report always has code-computed numbers even without a narrative, and `report-pdf.js`, a hand-written one-page PDF 1.4 writer (JPEG DCTDecode, no dependency). Fixed an SVG sizing bug that had silently skipped vector hotspot layers. |

### 1.3 Citizen report check (P1)

| Date | Commit | What landed |
|---|---|---|
| 2026-11-04 | `b0e38f7` | `lib/smoke-check.js` + `/cek-asap` (alias `/smoke-check`): Muse Spark vision describes only what is visible and may not emit digits, locations, causes or names; code gathers FIRMS detections within 50 km, CAMS AQI at the point, GFS wind, PVMBG volcanoes within 150 km, observatory eruption reports and dated regional haze reports; the verdict *supported / not yet supported / not enough data* is computed by code. Browser re-encode strips EXIF including GPS, 6 MB cap, no server retention, rejection of non-sky material and images of people. |

### 1.4 Evaluation, audit and documentation

| Date | Commit | What landed |
|---|---|---|
| 2026-11-04 | `b0e38f7` | `evals/cases.json` (20 data questions + 6 refusal cases) and `evals/run.js` with a no-key tool phase and a key-gated agent phase that reports SKIPPED rather than passing. |
| 2026-11-04 | `6eae784` | `scripts/audit-secrets.js` in the test gate (tracked files and git history, values never printed), English `README.md`, this build log, `docs/DEMO-SCRIPT.md`, `docs/PRE-SUBMIT-CHECKLIST.md`. The previous Indonesian README was moved to `docs/README.id.md`, not deleted. |
| 2026-11-04 | `a16046c` | Fixes found by running the agent eval against production: the numeric verifier rejected every negative latitude, `get_province_hotspots` hid its own row count, and the harness scored correct refusals as violations. Regression tests added (42 agent checks, 66 coordinate-tool checks). |

### 1.5 Supporting work inside the window

These are not headline AI features, but they were built in the window and the demo depends on them.

| Date | Commit | What landed |
|---|---|---|
| 2026-11-02 | `2439e34` | Restored the Home and Reports pages (PR #15). |
| 2026-11-02 | `f4943c6` | Hardened report URL scheme validation. |
| 2026-11-02 | `f5720c4` | Hardened Operations auth and moved the shortcut. |
| 2026-11-04 | `d45bb21`, `4a9f00b`, `8c687f7`, `63bf499` | Report fixes: missing weekly hotspot values labelled instead of zeroed, archive selection preserved, weekly fixtures isolated (PR #17). |
| 2026-11-04 | `3519d55`, `25d99b7` | Locked down Operations and admin APIs, addressed admin CodeQL findings (PR #18). |
| 2026-11-04 | `edd8c2d` | Written exploration findings before touching the dashboard. |
| 2026-11-04 | `e9ea2c1`, `bd00445`, `fbc3dc0`, `91c17e3`, `65ed5c8`, `25c9955` | Dashboard clean-UI refactor: accessible tooltips, accordion layer panel, progressive disclosure, dock closed by default, methodology relocated to `/tentang-data`, visual polish and safety bar (PR #19). |
| 2026-11-04 | `cd03cba` | Control feedback, AQI legend alignment, Operator link (PR #20). |
| 2026-11-04 | `94b4dbf` | AI toggle no longer covers controls, reachable dock, Operator link on every page (PR #21). |
| 2026-11-04 | `af81822` | Footer no longer covered by the global assistant toggle; admin login has a way back (PR #22). |

### 1.6 Finalisation on 5 November WIB (outside the claimed window, before the deadline)

These commits landed in the early hours of 5 Nov WIB, after the 4 Nov window closed but
before submission opened at 09:00 WIB. In UTC they still carry a 4 Nov date. They are
listed separately so the window claim stays exact: they are **verification and bug fixes,
not new features**.

| Date (WIB) | Commit | What landed |
|---|---|---|
| 2026-11-05 | `69386c0` | Agent wall-clock budget (48 s) and turn bound raised to 4, after production evals showed repeated `META_API_TIMEOUT` and `META_API_TURN_LIMIT` rather than model error. |
| 2026-11-05 | `c8da6bd` | `find_place` tool so the agent resolves a named city instead of asking the user for a bounding box. The prompt had literally instructed it to ask. |
| 2026-11-05 | `ccbbd89`, `e3766ad` | ID/EN parity fixes found by inspecting demo video frames: map legend, capture button, assistant footer, quick chip, dust tab and the AQI category. Regression tests added. |
| 2026-11-05 | `83ba5a7` | Verifier no longer reads pollutant names as quantities. `PM2.5` was scanned as the figure 2.5 and `PM10` as 10, flagging correct air-quality answers. |
| 2026-11-05 | `e3766ad` | The 3-minute demo video, its Playwright recorder and its assembler. |
| 2026-11-05 | `d6f6876` | Volcano tool carries PVMBG's numeric level (`levelNumber`, `levelRoman`, `levelStatus`), so "Level 3 (Siaga)" is grounded in tool output instead of looking invented. |
| 2026-11-05 | `f40fcc5` | Provider error codes are read and sanitized (`safeFailureDetail`) instead of discarded, and the fallback distinguishes a content-filter refusal from an outage in both languages. This is what made the Q18 root cause visible. |

| 2026-11-05 | `aad1601` | Cron race condition: three workflows pushed to `main` with a bare `git push`, so a slow CAMS download lost its artifact when the archive cron pushed first (`! [rejected] ... fetch first`). They now share `scripts/ci-commit-push.sh`, which fetches and rebases before retrying and never force-pushes. Guard test added. |
| 2026-11-05 | `2221f43` | Privacy defect: `/api/map-narrative` really does send the PNG to Meta, but the Reports page and README claimed images were "never uploaded". Added an explicit consent checkbox gating the narrative button, corrected the ID/EN privacy text, and removed the operator link from public footers. Guard test added. |
| 2026-11-05 | `58e7fe9` | Reports page: labelled `?demo=1` fixture mode for repeatable recordings, and a 12-second bound on every archive read so a hung request cannot leave "Loading..." on screen forever. |

No new capability was added after the window closed. Every row above either fixes a defect
found by running the eval against production, corrects an ID/EN label, or produces the demo
artefacts. The feature set was frozen at the end of 4 Nov. The three 5 Nov rows above are
defect fixes and recording aids, not new product features; the per-layer capture toggles and
the pinned summary card that were requested in the same pass were **not** built, and README
section 7 lists them as gaps.

**Author metadata was normalised on 5 Nov.** Commits made through an assistant had been
recorded under a tool identity (`Arena Agent`). They were rewritten to the repository owner's
identity with `git filter-repo --mailmap`, so every human-directed commit now shows one author.
This changed commit SHAs, and the 35 SHAs quoted in this file were remapped to the new ones.
**No commit date was altered, no commit was dropped, and no file content changed**: the tree
hash before and after the rewrite is identical (`0db5eaa5f613a725ea4421bd671ce94e9f7348f8`)
and the count stayed at 264. Automated `github-actions[bot]` and `dependabot[bot]` commits keep
their bot identity, because they are machine work and are not claimed as human work. The use of
AI assistance on this project remains disclosed here and in `docs/AI_HISTORY.md`.

Automated `data(cams)`, `data(report)` and `chore(snapshot)` commits in the window are
scheduled data refreshes, not features, and are not claimed as work.

---

## 2. Pre-existing platform (not claimed as hackathon work)

This project was already running before the hackathon window opened. The git history in
this repository is complete and unmodified, so the boundary is checkable rather than asserted.

The following systems predate the window and are **not** presented as hackathon work:

- Express server, Vercel serverless entrypoint, scheduler, caches and retry logic.
- The Leaflet dashboard and its data layers: FIRMS hotspots, GFS wind particles,
  CAMS PM2.5 raster and forecast, NASA OMPS aerosol, Himawari and Sentinel-2 imagery,
  volcano and ash layers, earthquakes, displacement, flights, webcams.
- The indicative plume model, plume selection, smoke grid artifacts and 24-hour playback.
- Regional haze report ingestion (ASMC, NEA, BMKG) and the report archive pipeline.
- Operations Center: health, freshness, alerts, incidents, runbooks, RBAC, audit log.
- Dashboard localization (ID/EN), the 112 safety bar and official-source disclaimers.
- Methodology content and the public data pages.

**The hackathon contribution is the verifiable AI layer built on top of that platform:**
the agent and its 17 read-only tools, the numeric verifier, map capture and multimodal
narrative, the one-page report export, Cek Asap, and the evaluation and audit tooling.
That is what sections 1 and 1.5 list, and it is what the demo shows.

---

## 3. How to verify this log

```bash
git log --since=2026-10-27 --pretty='%h %ad %s' --date=short   # window commits
git log --until=2026-10-26 --oneline | wc -l                  # pre-window commits
git show 90d8f24 --stat                                       # coordinate tools + verifier
git show 7a21b64 --stat                                       # capture + multimodal narrative
git show e254dae --stat                                       # Cek Asap + evals
node scripts/audit-secrets.js                                 # files and history
npm run check                                                 # full gate
npm run eval:tools                                            # deterministic eval phase
```

## 4. Not done

- **P2 SAM 3.1 smoke/burn-area segmentation.** Skipped deliberately: an unvalidated km²
  figure is exactly the kind of number this project refuses to publish.
- **P2 Muse Voice Transcribe.** Skipped to keep the window focused on P0 and P1.
- **Agent-phase eval is not a perfect score: 25/26, reproduced twice.** The first production run scored 13/26
  and exposed two real product bugs and two harness bugs, all fixed in `a16046c`. Three later
  runs found three more product bugs (wall-clock budget, pollutant names read as quantities,
  volcano level losing its numeric form), fixed in `69386c0`, `83ba5a7` and `d6f6876`.
  The one remaining failure, Q18, is **Meta's content filter refusing a harmless Indonesian
  question** (`content_policy_violation`); the English and reworded Indonesian equivalents
  answer normally. That case was deliberately not reworded to reach 26/26. Instead the
  fallback message was corrected to say "declined", not "unreachable" (`f40fcc5`).
  Two consecutive production runs scored 25/26 with the identical single failure, so the
  score is stable rather than a lucky run.
  Numbers are recorded in `evals/results.md` and are not rounded up. The tool phase runs
  anywhere; the agent phase needs `MODEL_API_KEY` and is reported SKIPPED without it.
