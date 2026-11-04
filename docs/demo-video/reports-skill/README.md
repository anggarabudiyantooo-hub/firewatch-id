# Reports tour, filmed with the video-demo skill

`siaga-reports-34s.mp4`: 34.0 s, 1440x900, H.264 + AAC, English narration, five retina stills.
Filmed on 5 Nov 2026 at commit `0982971` with [nilbuild/video-demo](https://github.com/nilbuild/video-demo).

## What it shows

1. The summary card above the capture panel, its narrative assembled by code from the archive file.
2. The AQI/PM2.5 tile reading **not stored in the archive** rather than showing an invented figure.
3. The source-status tile, where a failed feed reads unavailable and never zero.
4. The method accordion, folded rather than deleted.
5. The capture panel below the card.
6. `?demo=1` labelling itself **Demo data: stored archive, not live data**.

## Source of the footage, stated plainly

Filmed from an **immutable copy** of this repo at `0982971`, served by the app's own production
server (`node server.js`), not a dev server and not the live Vercel URL.

The live URL was rejected as a source for a concrete reason: the Vercel project is still wired to
the private archive repo, so `firewatch-id.vercel.app` serves the **old** privacy wording ("images
are never uploaded") and none of the 5 Nov fixes. Filming it would have put a false privacy claim
into a submission video. The copy cannot drift mid-run, which is the property the skill's
"pinned build, never a dev server" rule is protecting.

**Re-film from production once the Vercel project is repointed at `firewatch-id`.**

## Honest capture numbers

The skill measures real compositor paints rather than trusting the encode rate:

| | |
|---|---|
| Duration | 34.02 s |
| Real paints in motion | **34.2 fps** |
| Worst frame gap | 78 ms |
| Encoded at | 60 fps |
| Stills | 5, at 2x |

34.2 fps of real paint encoded at 60 will read as slight judder on fast moves. The first attempt at
1920x1080 sustained only **18.9 fps**, so the stage was reduced to 1440x900: fewer pixels per frame
is the honest fix, not a higher encode number. This sandbox has no hardware encoder.

## What is deliberately not in the film

The capture dialog and its consent checkbox. Under screencast the dialog failed twice to produce a
PNG within 60 s, and the skill's rule is that a scene which cannot be filmed reliably is worse than
a shorter honest one. The consent flow is covered instead by `scripts/manual-map-capture.js`
(**22/22**, including "narrate button disabled before consent" and "enabled after"), and by
`scripts/test-image-consent.js` (**20 checks**) in `npm run check`.

An earlier run did film the consent dialog successfully; its stills were deleted rather than kept,
because they came from a different take than the shipped clip and mixing takes would misrepresent
the footage.

## Reproducing it

```bash
git clone https://github.com/nilbuild/video-demo.git
cd video-demo && bash scripts/install.sh && bash scripts/install-voice.sh   # Node >= 22.18
node scripts/scaffold.mjs --site http://127.0.0.1:3100
# copy demo.config.ts, ui.ts and scenes/reports.scene.ts from this folder into the workspace
bash scripts/demo --project '<workspace>' --grep reports
```

`demo.config.ts`, `ui.ts`, `scenes/reports.scene.ts` and `manifest.json` here are the exact files
used for the shipped take.
