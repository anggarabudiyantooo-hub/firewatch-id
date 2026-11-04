# Demo video

**`siaga-id-demo-3min.mp4`** - 3:00, 1440x900, H.264 + AAC, English narration.

Recorded against the live production deployment
<https://firewatch-id.vercel.app>, not a mock and not a staging copy. Every
number, verdict and AI narrative in the video came from the real Meta Model API
and the real public data feeds at recording time.

## Segments

| Segment | Screen | Shows |
|---|---|---|
| 01 | `/` | The problem: a grey sky with no way to check it |
| 02 | `/reports` | Capture map, code-computed figures, Muse Spark narrative from the image, one-page PDF export |
| 03 | `/dashboard` | Agent resolves "Pekanbaru" via `find_place`, evidence trace, NUMBER CHECK badge, SHOW ON MAP, medical refusal |
| 04 | `/cek-asap` | Photo re-encode strips EXIF, verdict computed by code from public evidence |
| 05 | `HACKATHON.md` | What was built in the window, separated from pre-existing work |

## Reproduce

```bash
npm ci
npx playwright install chromium
node scripts/record-demo.js --origin=https://firewatch-id.vercel.app
node scripts/build-demo-video.js     # needs ffmpeg; pip install imageio-ffmpeg
```

`record-demo.js` records one Playwright context per segment and is resumable:
pass `--only=03-agent` to redo a single segment. Failures are recorded and
written to `recording-log.json`, never skipped silently.

`build-demo-video.js` fits each segment to a fixed second budget so the total is
exactly 180 s. It refuses to speed narration up more than 1.16x, so a segment
that runs long must be re-recorded or its script shortened rather than turned
into chipmunk audio.

Raw screen segments are **not committed** (34 MB, reproducible). What is
committed: the final MP4, the five narration clips, `recording-log.json`,
`build-report.json`, and `demo-report.pdf` - the actual PDF the video downloads.

## Honest notes

- The narration is synthetic speech, not a human presenter.
- Screen playback is time-compressed where the recording waited on the model
  (the agent segment runs at about 1.4x). Nothing was cut to hide a failure.
- `build-report.json` records the exact speed factor applied to every segment.
- Data changes between runs. A re-record will show different hotspot counts.
