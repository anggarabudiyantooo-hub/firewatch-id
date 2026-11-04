# Hackathon build log

**Meta Global AI Developer Hackathon · Track: Build for Your World**
**Window claimed: 27 October - 4 November 2026.**

This file exists so a judge can separate what was built inside the window from what
already existed. Nothing here is backdated. Every row can be checked with
`git show <sha>`; the repository history is public and unmodified.

**Date convention:** dates in the tables are git commit dates in **UTC**, which is what
`git log --date=short` prints. Submission closes 5 Nov 2026 09:00 WIB (02:00 UTC), so the
final verification and eval-fix commits carry a 4 Nov UTC date while falling in the early
hours of 5 Nov WIB. They are listed rather than hidden.

Repository: <https://github.com/anggarabudiyantooo-hub/firewatch-id>
Branch used for this submission: `feat/hackathon-ai`

---

## 1. Built inside the hackathon window

### 1.1 Meta model integration (P0-A)

| Date | Commit | What landed |
|---|---|---|
| 2026-11-02 | `307d3bb` | First Muse Spark integration: `lib/muse-agent.js`, bounded tool-calling agent, situation briefing, compact fire history. Model `muse-spark-1.3`, Chat Completions, key server-side only. |
| 2026-11-04 | `413ffeb` | Evidence casefiles (`[E1]`-`[E8]` receipts with tool, arguments, source times, limitations), skeptical challenge pass (`/api/ask/challenge`), wind overlay. |
| 2026-11-04 | `3ce573b` | Site-wide assistant toggle and truthful configuration status: `/api/ask/status` reports whether a key exists, and explicitly says verification has not been performed. |
| 2026-11-04 | `90d8f24` | Seven coordinate/bbox tools (`get_hotspots_in_area`, `get_places_in_area`, `get_air_quality_at` with PM2.5 forecast, `get_wind_at`, `get_volcano_near`, `compare_time_windows`, `get_source_health`), schema-required arguments, post-hoc numeric verifier with one repair pass, "Show on map" buttons driven only by tool output, per-feed health, `local_deterministic` labelling for non-model answers. |

### 1.2 Map screenshot and multimodal report (P0-B)

| Date | Commit | What landed |
|---|---|---|
| 2026-11-04 | `7a21b64` | `public/map-screenshot.js`: dependency-free Leaflet pane compositor, `crossOrigin: 'anonymous'` on all 9 tile layers, honest `CANVAS_TAINTED_CORS` / `MAP_NOT_READY` / `CAPTURE_EMPTY` failures. Responsive chrome with WIB stamp, bbox, zoom, basemap, timeline frame, colour legend, attribution and the 112 disclaimer baked into the PNG. `lib/map-narrative.js`: Muse Spark receives the image plus structured JSON, every figure verified against the data, one repair pass, flagged remainder, labelled local fallback. `POST /api/map-narrative` with its own per-IP bucket. |
| 2026-11-04 | `769c5d6` | `/reports` mini map (`report-map.js`), snapshot block with before/after two frames, `POST /api/map-summary` so a report always has code-computed numbers even without a narrative, and `report-pdf.js`, a hand-written one-page PDF 1.4 writer (JPEG DCTDecode, no dependency). Fixed an SVG sizing bug that had silently skipped vector hotspot layers. |

### 1.3 Citizen report check (P1)

| Date | Commit | What landed |
|---|---|---|
| 2026-11-04 | `e254dae` | `lib/smoke-check.js` + `/cek-asap` (alias `/smoke-check`): Muse Spark vision describes only what is visible and may not emit digits, locations, causes or names; code gathers FIRMS detections within 50 km, CAMS AQI at the point, GFS wind, PVMBG volcanoes within 150 km, observatory eruption reports and dated regional haze reports; the verdict *supported / not yet supported / not enough data* is computed by code. Browser re-encode strips EXIF including GPS, 6 MB cap, no server retention, rejection of non-sky material and images of people. |

### 1.4 Evaluation, audit and documentation

| Date | Commit | What landed |
|---|---|---|
| 2026-11-04 | `e254dae` | `evals/cases.json` (20 data questions + 6 refusal cases) and `evals/run.js` with a no-key tool phase and a key-gated agent phase that reports SKIPPED rather than passing. |
| 2026-11-04 | `2ad88e0` | `scripts/audit-secrets.js` in the test gate (tracked files and git history, values never printed), English `README.md`, this build log, `docs/DEMO-SCRIPT.md`, `docs/PRE-SUBMIT-CHECKLIST.md`. The previous Indonesian README was moved to `docs/README.id.md`, not deleted. |
| 2026-11-05 | `351c61f` | Agent wall-clock budget (48 s) and turn bound raised to 4, after production evals showed repeated `META_API_TIMEOUT` and `META_API_TURN_LIMIT` rather than model error. |
| 2026-11-05 | `510bf7e` | `find_place` tool so the agent resolves a named city instead of asking the user for a bounding box. The prompt had literally instructed it to ask. |
| 2026-11-05 | `2849364`, `988127e` | ID/EN parity fixes found by inspecting demo video frames: map legend, capture button, assistant footer, quick chip, dust tab and the AQI category. Regression tests added. |
| 2026-11-05 | `1283c38` | Verifier no longer reads pollutant names as quantities. `PM2.5` was scanned as the figure 2.5 and `PM10` as 10, flagging correct air-quality answers. |
| 2026-11-05 | `988127e` | The 3-minute demo video, its Playwright recorder and its assembler. |
| 2026-11-04 | `a95216a` | Fixes found by running the agent eval against production: the numeric verifier rejected every negative latitude, `get_province_hotspots` hid its own row count, and the harness scored correct refusals as violations. Regression tests added (42 agent checks, 66 coordinate-tool checks). |

### 1.5 Supporting work inside the window

These are not headline AI features, but they were built in the window and the demo depends on them.

| Date | Commit | What landed |
|---|---|---|
| 2026-11-02 | `752d093` | Restored the Home and Reports pages (PR #15). |
| 2026-11-02 | `da5e9ed` | Hardened report URL scheme validation. |
| 2026-11-02 | `f1873a3` | Hardened Operations auth and moved the shortcut. |
| 2026-11-04 | `7f9bdbc`, `e1c235c`, `ef577cb`, `ae5312b` | Report fixes: missing weekly hotspot values labelled instead of zeroed, archive selection preserved, weekly fixtures isolated (PR #17). |
| 2026-11-04 | `a700643`, `2c73d18` | Locked down Operations and admin APIs, addressed admin CodeQL findings (PR #18). |
| 2026-11-04 | `d0fdb80` | Written exploration findings before touching the dashboard. |
| 2026-11-04 | `d5a7fc6`, `4c92f65`, `6444200`, `ba05006`, `b043240`, `71340b8` | Dashboard clean-UI refactor: accessible tooltips, accordion layer panel, progressive disclosure, dock closed by default, methodology relocated to `/tentang-data`, visual polish and safety bar (PR #19). |
| 2026-11-04 | `fdabfcc` | Control feedback, AQI legend alignment, Operator link (PR #20). |
| 2026-11-04 | `0c286a1` | AI toggle no longer covers controls, reachable dock, Operator link on every page (PR #21). |
| 2026-11-04 | `804d227` | Footer no longer covered by the global assistant toggle; admin login has a way back (PR #22). |

Automated `data(cams)`, `data(report)` and `chore(snapshot)` commits in the window are
scheduled data refreshes, not features, and are not claimed as work.

---

## 2. Existed before the window (not claimed)

183 commits precede 27 October 2026, starting `5947812` on 2026-09-07. The following
substantial systems were already in place and are **not** presented as hackathon work:

- Express server, Vercel serverless entrypoint, scheduler, caches and retry logic.
- The Leaflet dashboard and its data layers: FIRMS hotspots, GFS wind particles,
  CAMS PM2.5 raster and forecast, NASA OMPS aerosol, Himawari and Sentinel-2 imagery,
  volcano and ash layers, earthquakes, displacement, flights, webcams.
- The indicative plume model, plume selection, smoke grid artifacts and 24-hour playback.
- Regional haze report ingestion (ASMC, NEA, BMKG) and the report archive pipeline.
- Operations Center: health, freshness, alerts, incidents, runbooks, RBAC, audit log.
- Dashboard localization (ID/EN), the 112 safety bar and official-source disclaimers.
- Methodology content, design system, PRD/ERD/architecture documents.

Selected pre-window commits, for verification: `ee1cdd3` (2026-10-26 localization),
`65fc4a5` (2026-10-26 plume and regional smoke reports), `074bb60` (2026-10-22 historical
playback), `634b59c` (2026-10-19 CAMS forecast layer), `90bf8ab` (2026-10-19 OMPS raster),
`fdd72a3` (2026-10-04 Operations Center P0), `bd1ae1e` (2026-10-03 safety bar).

The hackathon contribution is the verifiable AI layer on top of that platform: the agent
and its tools, the numeric verifier, map capture and multimodal narrative, the one-page
report export, Cek Asap, and the evaluation and audit tooling.

---

## 3. How to verify this log

```bash
git log --since=2026-10-27 --pretty='%h %ad %s' --date=short   # window commits
git log --until=2026-10-26 --oneline | wc -l                  # 183 pre-window commits
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
- **Agent-phase eval is not a perfect score.** The first production run scored 13/26 and
  exposed two real product bugs and two harness bugs, all fixed in `a95216a`. The current
  numbers, including remaining failures, are recorded in `evals/results.md` and are not
  rounded up. The tool phase runs anywhere; the agent phase needs `MODEL_API_KEY` and is
  reported SKIPPED without it.
