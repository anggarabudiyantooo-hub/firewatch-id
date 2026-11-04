# 3-minute demo script (English)

Total runtime target: **3:00**. Record at 1440x900, browser at 100% zoom, Indonesian
interface switched to **EN** for the recording. Keep a second tab open on `/reports`
so no time is lost to navigation.

Read the voiceover at a calm pace. Times below are cumulative.

---

## 0:00 - 0:15 · Problem (15s)

**Screen:** `/` home page, then a slow scroll to the dashboard link. Do not click yet.

> "During Indonesia's haze season, a resident sees a grey sky and cannot tell whether
> any public data supports it. Screenshots of dashboards travel without their legend or
> timestamp, and AI assistants make it worse by inventing numbers. SIAGA.ID keeps every
> number in code and lets the model handle only language and vision."

---

## 0:15 - 1:15 · Report with map snapshot and AI narrative (60s)

**Screen:** `/reports`, scroll to "Map snapshot for the report".

1. (0:15) Point at the mini map. Toggle **Hotspots** on, set **Detection window** to `24 h`.
2. (0:22) Click **Capture map**. The dialog opens with the PNG.
   > "Capture composites the live map: legend, attribution, bounding box, zoom, timeline
   > frame and a WIB timestamp are baked into the image, so it cannot travel stripped of context."
3. (0:32) Point at the numeric rows under the preview.
   > "These figures are computed by the server from public data, not by the model."
4. (0:38) Click **AI narrative from image**. Wait for the four paragraphs.
   > "Muse Spark receives the image plus that structured data. Every figure it writes is
   > matched back to the data. If one does not match, the model gets one chance to fix it,
   > and anything left over is flagged rather than hidden."
5. (0:50) Click **Add to report**. Scroll to the snapshot block.
6. (0:57) Set **Detection window** to `6 h`, capture again, add again. Point at the
   **Before / After** labels.
   > "Two frames become a before-and-after comparison."
7. (1:05) Click **Export one-page PDF**. Open the downloaded file briefly.
   > "One page: the map, the figures, the narrative, the limitations, the sources, and the
   > disclaimer. Written by a small PDF writer in the repo, no dependency, no personal data."

---

## 1:15 - 2:15 · Agentic assistant with evidence trail (60s)

**Screen:** `/dashboard`. Open the assistant with the AI toggle.

1. (1:15) Type: `How many thermal detections are near Pekanbaru in the last 24 hours?`
   > "The assistant is not a chatbot wrapper. It chooses among sixteen read-only tools."
2. (1:25) While it answers, point at the tool-call counter.
   > "Bounded: three model turns, eight tool calls, ten second timeout, schema-validated arguments."
3. (1:33) Expand **Evidence trace**. Open one receipt.
   > "Each claim carries a receipt: which tool, which arguments, the source time, and the
   > limits of interpretation. Citations in the answer link straight to it."
4. (1:44) Point at the **NUMBER CHECK** badge.
   > "A post-hoc verifier matched every figure in that answer against the tool results."
5. (1:50) Click a **Show on map** button. The map moves and draws the box.
   > "The model cannot move the map with free text. It can only use coordinates a tool returned."
6. (1:58) Type: `I am short of breath from the smoke, what medicine should I take?`
   > "Medical advice is refused. It quotes the AQI category and points to health professionals
   > and authorities. No evacuation orders, no politics, no accusations from concession overlap."

---

## 2:15 - 2:45 · Citizen report check (30s)

**Screen:** `/cek-asap`.

1. (2:15) Upload a sky photo. Point at the caption under the preview.
   > "The photo is re-encoded in the browser, which strips EXIF including GPS. It is sent to
   > the Meta Model API for assessment, held in memory for one request, then discarded.
   > Nothing is written to disk."
2. (2:24) Click **Use my location** or type coordinates, then **Check against data**.
3. (2:31) Point at the verdict badge.
   > "Muse Spark only says what is visible. Code gathers detections within fifty kilometres,
   > modelled air quality, wind, nearby volcano levels and dated haze reports, and computes the
   > verdict: supported, not yet supported, or not enough data."
4. (2:39) Point at the limitations list.
   > "Not yet supported never means the report is false. It can be a coverage gap, fog or dust."

---

## 2:45 - 3:00 · Close and what was built (15s)

**Screen:** `HACKATHON.md` on GitHub, scrolled to the window table.

> "Built in the hackathon window: the Muse Spark agent and its coordinate tools, the numeric
> verifier, map capture with multimodal narrative, the one-page report export, Cek Asap, and
> an eval suite with refusal cases. The dashboard and data pipeline existed before and are
> labelled as such. Code is MIT, the repo is public, and the secret audit runs in CI."

---

## Fallback scenarios

Rehearse these. A live demo that hides a failure is worse than one that explains it.

| If this happens | Do this | Say this |
|---|---|---|
| **No hotspots in the frame** (quiet fire day, or the 6 h window is empty) | Keep the empty frame. Do not fake data. | "An empty frame is a real result. The capture still carries its timestamp and bounds, and the narrative says detections are unavailable rather than inventing a count." |
| **Meta API unreachable / quota exhausted** | Let the labelled fallback appear. Point at the warning line. | "Muse Spark is unreachable, so this narrative was assembled by code from the data and is labelled as such. The figures never depended on the model." |
| **Capture fails with `CANVAS_TAINTED_CORS`** | Switch the basemap to `GELAP` and capture again. | "One tile source refused cross-origin reads. The compositor reports that instead of exporting a blank image." |
| **Cek Asap returns "not enough data"** | Show the evidence rows anyway. | "The vision model is not configured in this environment, so the photo was not assessed. The public-data comparison still ran, and the page says exactly that." |
| **Assistant answers in local mode** | Point at the local-mode note. | "Without a key the assistant refuses to impersonate the model. That honesty is part of the design." |
| **Rate limited (429)** | Wait for the reset seconds shown in the response, or switch to the pre-recorded segment. | "Image requests are limited to six per minute per IP on purpose, because each one costs provider quota." |
| **Everything fails at once** | Play the pre-recorded 3-minute video and narrate live over it. | Keep `docs/screenshots/map-capture/` open as still evidence. |

## Pre-recording checklist

- [ ] Browser in EN, zoom 100%, no personal bookmarks or extensions visible.
- [ ] Second tab already on `/reports`; a third on `/cek-asap`.
- [ ] One sky photo ready on disk, no people, no number plates, no documents.
- [ ] `MODEL_API_KEY` set on the deployment being recorded, with a spend limit.
- [ ] Dashboard tiles fully loaded before the first capture.
- [ ] Download folder empty so the PDF is easy to find on camera.
- [ ] A pre-recorded fallback video exported and reachable offline.
