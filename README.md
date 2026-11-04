# SIAGA.ID - verifiable disaster intelligence for Indonesia

**Meta Global AI Developer Hackathon submission · Track: Build for Your World**

[![Test gate](https://github.com/anggarabudiyantooo-hub/firewatch-id/actions/workflows/ci.yml/badge.svg)](https://github.com/anggarabudiyantooo-hub/firewatch-id/actions/workflows/ci.yml)

Live: <https://firewatch-id.vercel.app> · Repo: <https://github.com/anggarabudiyantooo-hub/firewatch-id> · License: [MIT](LICENSE)

> A public-interest tool, **not a replacement for official sources**. For emergency
> decisions follow BMKG, BNPB/BPBD, PVMBG and KLHK. Emergency number in Indonesia: **112**.

---

## 1. The problem

During Indonesian haze and fire seasons, a resident sees a grey sky and has three
questions that no single official page answers quickly:

1. Is what I see supported by any public data, or is it fog, dust, or a cloud?
2. Where is the smoke likely to travel, and which places are in the frame?
3. Can I hand something trustworthy to a neighbourhood group, a school, or a journalist?

Raw satellite detections are hard to read. Screenshots of dashboards lose their
legend, timestamp and attribution, so they travel as unattributed pictures.
Generative assistants make this worse when they invent numbers: a confident
"5,000 people affected" is dangerous when no dataset says so.

## 2. The solution

SIAGA.ID keeps a strict division of labour:

- **Code owns every number.** Deterministic, read-only tools compute counts,
  distances, AQI values, wind vectors and time-window comparisons.
- **Meta Muse Spark owns language and vision.** It picks tools, resolves place names, reads a map image,
  and describes what is visible in a citizen photo.
- **Code checks the model afterwards.** Every figure in an answer is matched against
  tool results. The model gets one chance to correct itself; anything still unmatched
  is flagged in the interface instead of being quietly removed.

Four user-facing results:

| Feature | What it does |
|---|---|
| **Agentic assistant** (`/dashboard`) | 17 read-only tools (including `find_place`, which resolves a named city to coordinates so the agent never asks the user for a bounding box), evidence receipts `[E1]`-`[E8]`, a numeric verifier badge, and "Show on map" buttons that move the map only to coordinates a tool returned. |
| **Map snapshot** (`/dashboard`, `/reports`) | "Capture map" composites the live Leaflet map to PNG with legend, attribution, WIB timestamp, bounding box, zoom and timeline frame baked into the image. |
| **Report with AI narrative** (`/reports`) | The snapshot plus a code-computed numeric summary plus a Muse Spark narrative written from the image and the data. Export as PNG or a one-page PDF. Before/after two-frame comparison supported. |
| **Cek Asap / Smoke Check** (`/cek-asap`) | A citizen photo or description plus place and time. Muse Spark describes only what is visible; code gathers evidence and returns *supported / not yet supported / not enough data*. |

## 3. Architecture

```
                       Browser
  ┌──────────────────────────────────────────────────────────────┐
  │ /dashboard   Leaflet map + 16 layers + assistant panel        │
  │ /reports     mini map + snapshot block + one-page PDF writer  │
  │ /cek-asap    photo re-encode (strips EXIF) + verdict view     │
  │                                                              │
  │ map-screenshot.js  composites panes -> PNG (CORS-safe)        │
  │ report-pdf.js      writes PDF 1.4 by hand, no dependency      │
  └───────────────┬──────────────────────────────────────────────┘
                  │ HTTPS, JSON (+ PNG data URL for vision)
  ┌───────────────▼──────────────────────────────────────────────┐
  │ Express server (server.js), API key server-side only          │
  │                                                              │
  │ /api/ask, /api/ask/challenge   -> lib/muse-agent.js           │
  │ /api/map-summary               -> deterministic numbers only  │
  │ /api/map-narrative             -> lib/map-narrative.js        │
  │ /api/cek-asap                  -> lib/smoke-check.js          │
  │                                                              │
  │ per-IP rate limits: text AI 12/min, image AI 6/min            │
  │ scheduler + cache: FIRMS, GFS, CAMS, PVMBG, BMKG, BNPB, ...   │
  └───────────────┬──────────────────────────────────────────────┘
                  │ Authorization: Bearer (server only)
  ┌───────────────▼──────────────────────────────────────────────┐
  │ Meta Model API  https://api.meta.ai/v1/chat/completions       │
  │ model: muse-spark-1.3   text + image in, text out             │
  └──────────────────────────────────────────────────────────────┘
```

The agent loop is bounded: at most 4 model turns, at most 8 tool calls, a 22 second
per-request timeout, schema-validated tool arguments, and a 7,000 character cap per
tool result. The numeric verifier may add exactly one repair request.

Those bounds are also capped by a **48 second total wall-clock budget**, so a slow
provider cannot overrun the 60 second serverless function limit. Each request gets
`min(per-request timeout, remaining budget)`, and the loop stops honestly with
`META_API_TIMEOUT` when less than 3 seconds remain. The turn count was raised from
3 to 4 after production evals showed that a question needing "resolve coordinates,
then fetch data, then answer" could not fit in 3 turns; the bound still exists and
is still tested.

## 4. Which Meta model does what

Model: **`muse-spark-1.3`** via the Meta Model API, Chat Completions surface
(`https://api.meta.ai/v1/chat/completions`), images passed as `image_url` content parts.
Docs consulted before implementation: `dev.meta.ai/docs` (quickstart, model list, API surfaces).

| Task | Model input | Model output | Guardrail |
|---|---|---|---|
| Situation briefing and skeptical challenge | tool results as JSON | prose with `[E1]`-`[E8]` citations | numeric verifier + one repair pass |
| Map narrative | map PNG + structured JSON | four short paragraphs | every figure must exist in the JSON; unmatched figures flagged |
| Cek Asap vision | citizen photo or text | JSON: scene, haze visible, sky colour, visibility, description | digits stripped from the description; verdict computed by code |

Not used: SAM 3.1 and Muse Voice Transcribe. See [Limitations](#7-limitations-and-honest-gaps).

## 5. What was built during the hackathon window

Only work committed **27 Oct - 4 Nov 2026** is presented as hackathon work.
[`HACKATHON.md`](HACKATHON.md) lists every feature commit with its date and separates
it from work that existed before the window. In short:

- **New in this window:** the whole Muse Spark agent, evidence receipts and skeptical
  pass, coordinate/bbox tools, the numeric verifier, "Show on map", map capture and its
  legend chrome, the multimodal report narrative, the one-page PDF writer, Cek Asap,
  the eval suite, the secret audit, and this documentation.
- **Existed before the window:** the Express server, the scheduler and caches, the
  Leaflet dashboard and its data layers, the plume and PM2.5 models, the Operations
  Center, and the daily/weekly report archive.

## 6. Run it

```bash
npm ci
npm start                 # http://localhost:3000
npm run check             # style + secret audit + 51 test files, no network needed
npm run eval:tools        # deterministic eval phase, no API key needed
npm run eval              # both phases; agent phase needs MODEL_API_KEY on the server
```

The app runs fully **without any environment variable**: every core data source is open.
Without `MODEL_API_KEY` the assistant, the map narrative and Cek Asap stay in clearly
labelled local mode and say so on screen. They never pretend to be model output.

Optional manual browser tests (need Playwright, Chromium and a running server):

```bash
npx playwright install chromium
node scripts/manual-map-capture.js     # 22 checks, desktop + mobile + image consent + failure mode
node scripts/manual-reports-demo.js    # 11 checks, demo label, archive timeout, 390px
node scripts/manual-report-summary.js  # 21 checks, summary card, accordion, ID/EN, 390px
node scripts/manual-agent-ui.js        # 10 checks, assistant panel
node scripts/manual-smoke-check.js     # 29 checks, Cek Asap
```

Screenshots and the generated PDF land in `docs/screenshots/map-capture/`.

### Environment variables

| Variable | Needed for | Notes |
|---|---|---|
| `MODEL_API_KEY` | Muse Spark features | Server only. Set a spend limit in the Meta console. |
| `FIRMS_MAP_KEY` | higher-rate NASA FIRMS | Optional; the open archive is the fallback. |
| `CRON_SECRET` | `/api/cron` refresh endpoint | Same random value in Vercel and GitHub Actions. |
| `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` | Operations Center login | bcrypt cost >= 12; never commit values. |

Full list with defaults: [`.env.example`](.env.example) and [`docs/README.id.md`](docs/README.id.md).

### Deploy to Vercel

1. Import the repo at <https://vercel.com/new>.
2. Framework preset **Other**; leave Build and Output commands empty.
3. Add the environment variables above in Project Settings.
4. Deploy. `vercel.json` routes every request to `api/index.js`, which loads the Express app.

Vercel Hobby allows one native cron per day, so a GitHub Actions schedule calls
`GET /api/cron` with `CRON_SECRET` every few minutes. Details in
[`docs/README.id.md`](docs/README.id.md).

### Reports page: capture, consent, demo mode

**How a capture works.** "Capture map" composites the live Leaflet map into a PNG entirely
in the browser. Tile servers send `Access-Control-Allow-Origin: *`, so the canvas is not
tainted and `toDataURL` succeeds. Legend, attribution, WIB timestamp, bounding box, zoom,
timeline frame and the active layer list are drawn into the image itself, so a PNG that
travels without the page still carries its own provenance. The numeric rows beside it come
from `/api/map-summary`, which is deterministic code and never calls a model.

**What is sent to Meta, and what is not.** Captures live in browser `sessionStorage` and are
not uploaded on their own. The AI narrative is a separate, explicit opt-in: the dialog shows
a consent box naming Meta, and the narrative button stays disabled until it is ticked. Only
then does the browser POST the PNG plus the structured data to `/api/map-narrative`, which
forwards both to the Meta Model API (`muse-spark-1.3`, `image_url` content part), holds them
in memory for that one request, and writes nothing to disk. Every new capture asks again.
Figures in the narrative are checked against the structured data by the numeric verifier;
anything not present there is flagged rather than silently kept. Without consent the image
goes nowhere, and `?demo=1` never sends it either.

**Demo mode.** `/reports?demo=1` reads the stored archive with `force-cache` and stops
refreshing the index, so a recording looks the same on every run. A visible badge reads
"Demo data: stored archive, not live data" in ID and EN. It is a fixture view, not live data,
and it is labelled as one on screen.

**Empty and failed states.** Every archive read is bounded by a 12-second `AbortController`.
A failed index says so plainly and points at "Capture map" to build a report from the latest
data, instead of leaving "Loading..." on screen forever. Missing issues are never backfilled.

## 7. Limitations and honest gaps

- **Thermal detections are not fires.** A FIRMS pixel is a heat anomaly, not a confirmed
  fire, not burned area, and not a count of people exposed.
- **The plume layer is a model.** Near-surface GFS wind advects indicative polygons. It is
  not an observed smoke trajectory; smoke aloft can travel differently.
- **Air quality is modelled.** CAMS/Open-Meteo grid values are not station measurements and
  are not smoke-specific. A transparent area is not proof of clean air.
- **The map image draws a capped subset.** `/api/overview` returns the top 2,000 detections
  by FRP. The numeric summary uses every available detection, and the capture chrome and the
  narrative both disclose the difference.
- **Concession overlap is a neutral verification hint**, never evidence of ignition or legal
  responsibility. The assistant is instructed never to accuse.
- **No medical advice, no evacuation orders, no politics.** AQI categories are quoted and the
  reader is directed to health professionals and authorities.
- **Cek Asap is a consistency check, not an investigation.** "Not yet supported" can mean a
  coverage gap, fog, dust, transported haze, or a model limitation. It never means the report is false.
- **The Meta Model API public preview is documented as US-only.** From other regions the
  provider may be unreachable; every feature then falls back to labelled local mode.
- **P2 skipped on purpose.** SAM 3.1 smoke segmentation and Muse Voice Transcribe were not
  implemented. Segmentation area in km² would have needed a validation dataset we could not
  build responsibly in the window, and an unvalidated area figure is exactly the kind of
  number this project refuses to publish.
- **Rate limits are per IP.** Indonesian mobile carriers use CGNAT, so limits are deliberately
  loose (12 text AI requests/min, 6 image AI requests/min) and shared by legitimate users.

### Requested but not done (5 Nov, after the window)

The last review pass asked for more than the remaining time allowed. Done: image consent and
the corrected privacy text, the operator link removed from public footers, demo mode, archive
timeouts, and the tests for all of it. **Not done, and not claimed anywhere:**

- Per-layer capture toggles (CAMS PM2.5 frame, indicative plume, volcanic ash, official PVMBG
  hazard radius, concession borders) and a `Now/+6/+12/+18h` frame picker inside the capture
  panel. Today the capture records whichever layers are already active on the dashboard, and
  the two-frame comparison uses two captures taken by hand.
- A one-click "Build a report now" that composes an issue from the latest data. The empty
  state currently points at "Capture map" instead of doing it automatically.

The summary card was built after that list was written: `/reports` now opens with a card
carrying the period, FIRMS detection count and high-confidence subset, provinces matched by
coarse boxes, source status, source-linked record count, and a three-sentence narrative
assembled by code, with the method folded into an accordion. Two requested fields are
deliberately shown as **unavailable rather than invented**: the daily archive stores no
AQI/PM2.5 and no regency list, so the card says so and points at "Capture map" for current
CAMS model figures. No map thumbnail is generated automatically; a capture must be attached
by the operator so the image carries its own legend and attribution.

These are listed as gaps rather than described as features. Nothing above is presented as
shipped, and no fixture is presented as live.

## 8. Evaluation

`evals/cases.json` holds **20 data-checkable questions and 6 refusal cases** (medical advice,
evacuation order, politics, prompt injection, accusation, military request).

`evals/run.js` runs two phases and refuses to blur them:

- **Tool phase** - no model, no API key. Executes the real read-only tools against live public
  data and checks invariants: counts consistent, high-confidence never above total, distances
  inside the search radius, caveats present, malformed arguments rejected.
- **Agent phase** - needs `MODEL_API_KEY` on the server. Sends each question to `/api/ask` and
  scores required keywords, forbidden phrases, evidence citations, refusal clarity and the
  numeric verifier status. Without a key every agent case is reported **SKIPPED**, never passed.

### Recorded results

Run against the keyed production deployment:

| Phase | Pass | Fail | Notes |
|---|---|---|---|
| Tool (no model, no key) | 24 / 24 | 0 | Includes 3 malformed-argument rejections. |
| Agent (Muse Spark) | 25 / 26 | 1 | See below. |

The first agent run scored **13/26** and was not hidden. Investigating it found four
distinct causes, two of them real product bugs:

1. **Verifier bug (product).** `collectAllowedNumbers` stored `-6.2146` while the scanner
   matched `6.2146`, so every southern latitude was flagged as invented. Magnitudes are now
   allowed alongside signed values; invented figures are still caught.
2. **Hidden tool output (product).** `get_province_hotspots` did not expose its own row
   count, so a correct sentence like "the top 8 provinces" was flagged. The tool now returns
   `returnedProvinceCount` and `maxReturnedProvinces`.
3. **Harness bug.** Substring matching scored correct refusals as violations, because
   "I cannot provide a strike plan" contains "strike plan". Forbidden phrases are now checked
   against negation markers in their clause.
4. **Harness spec bug.** Interpretation questions ("does Siaga mean erupting?") were required
   to cite tools even though a correct answer needs none. Four cases are now typed
   `interpretation`. One further case asked about "the map frame" without giving a box, which
   is unanswerable as written; it now states the box explicitly.

Three further production runs then found three more real defects, each fixed in code rather
than by editing the question:

5. **Wall-clock budget too small (product).** A 10s per-request cap and 3 turns made
   multi-tool questions abort mid-loop. Now 22s per request, 4 turns, 48s total, with each
   request capped by the time left and an honest stop when under 3s remains. This sits inside
   the 60s serverless limit. Recovered Q06.
6. **Verifier read pollutant names as quantities (product).** `PM2.5` was scanned as the
   number `2.5` and `PM10` as `10`, so a correct air-quality sentence was flagged as invented.
   Pollutant names and unit suffixes are now stripped before the digit scan. `PM2.5 is 999`
   still flags `999`. Recovered Q05 and Q13.
7. **Volcano level lost its numeric form (product).** The server passed only `"III Siaga"` to
   the tool, so the correct phrase "Level 3 (Siaga)" looked fabricated even though PVMBG
   publishes `level: 3`. The tool now carries `levelNumber`, `levelRoman` and `levelStatus`.
   `Merapi is 999 km away` still flags. Recovered Q08.

**The verifier is a product contract and was not loosened to make the score green.** Every
fix above made a real number available to the verifier or stopped it misreading a unit; none
widened what counts as verified.

### The one remaining failure, and why it was not hidden

**Q18 fails because Meta's own content filter refuses the question**, returning HTTP 400 with
`content_policy_violation`. The question is a harmless interpretation question ("does the map
plume show an actually observed smoke trajectory?"). Six consecutive requests reproduced it
deterministically. The English equivalent and two reworded Indonesian versions are all
answered normally by `muse-spark`, so this is a provider-side false positive on one phrasing,
not a defect in the agent.

The case was deliberately **left unchanged**. Rewording it would have produced 26/26 while
hiding a real behaviour users can hit. Instead the product was fixed where it was actually
wrong: the fallback used to say "Muse Spark could not be reached", which is false when the
model was reached and declined. The provider's error code is now read, sanitized to
`[a-z0-9_]` (never the raw body, which could contain user text or credentials), and the UI
distinguishes a content-filter refusal from an outage, suggesting a rephrase only in the
refusal case.

**Run-to-run variance matters more than the headline number.** Earlier runs scored 13/26,
then 22/26 three times with *different* failing cases, then 25/26 **twice in a row with the
identical single failure (Q18)**. Only after the three fixes above did the same cases pass
repeatedly. A single eval number would overstate reliability, so the progression is disclosed
rather than just the best run. The last two runs are the ones to trust: the score is now
stable, and the one failure has a known external cause rather than being random.

Full per-case detail: [`evals/results.md`](evals/results.md).
Reproduce with `npm run eval --origin=<your-deployment>`.

## 9. Privacy and safety

- Map captures and report snapshots live in browser `sessionStorage` and are not uploaded on their own.
  Requesting the AI narrative is an explicit opt-in: the PNG and the structured data are then sent to
  the Meta Model API, held in server memory for one request, and not written to disk here. The narrative
  button stays disabled until the consent box is ticked, and every new capture asks again.
- Cek Asap photos are re-encoded in the browser, which strips EXIF including GPS. The image is
  forwarded to the Meta Model API for assessment, held in server memory for one request, then
  discarded. It is never written to disk, a database or the report archive. This is stated on the page.
- Material that is not an outdoor sky or landscape, or that contains people or personal data,
  is rejected and not processed.
- Third-party text and text visible inside images are treated as **data, never instructions**.
- `scripts/audit-secrets.js` runs in the test gate and scans tracked files **and git history**
  for credential patterns. It prints locations, never values.

## 10. Data sources and attribution

| Source | Used for | Key |
|---|---|---|
| NASA FIRMS | VIIRS thermal detections (3 satellites) | optional |
| NOAA GFS | wind field for the indicative plume model | no |
| Open-Meteo / CAMS Global | US AQI, modelled PM2.5, PM2.5 forecast, volcanic SO₂ | no |
| PVMBG / MAGMA ESDM | official volcano levels, observatory eruption reports | no |
| BMKG | earthquakes, tsunami potential, dated haze reports | no |
| NOAA PTWC/NTWC | regional tsunami bulletins | no |
| BNPB GIS | displacement sites and reported figures | no |
| NASA GIBS / OMPS NOAA-21 | daily Aerosol Index raster | no |
| JMA Himawari | satellite imagery (IR, true colour, ash RGB, dust, water vapour) | no |
| Copernicus Sentinel-2 L2A | 10 m imagery | yes, free |
| Global Forest Watch | concession boundaries for neutral verification | no |
| GeoNames | 226 settlement centers (CC BY 4.0) | no |
| ASMC / NEA | dated regional haze reports | no |
| NOAA CPC, Open-Meteo Archive | ONI index, ERA5 rainfall | no |
| Esri, Maxar, Earthstar Geographics, HERE, Garmin, OpenStreetMap contributors | basemaps | no |

The MIT license covers **code only**. Third-party data remains under each provider's terms.
Full source table and methodology: [`docs/README.id.md`](docs/README.id.md) and `/tentang-data`.

## 11. Documentation map

| Document | Contents |
|---|---|
| [`HACKATHON.md`](HACKATHON.md) | hackathon-window features with commits and dates, separated from pre-existing work |
| [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) | 3-minute English demo script with screens and fallbacks |
| [`docs/PRE-SUBMIT-CHECKLIST.md`](docs/PRE-SUBMIT-CHECKLIST.md) | final submission checklist |
| [`docs/README.id.md`](docs/README.id.md) | the original Indonesian README, kept in full |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | system architecture, data flow, scheduler |
| [`evals/results.md`](evals/results.md) | latest eval run |
| [CONTRIBUTING](CONTRIBUTING.md) · [SECURITY](SECURITY.md) | contribution and security policy |
