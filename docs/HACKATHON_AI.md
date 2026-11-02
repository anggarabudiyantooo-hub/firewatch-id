# SIAGA ID AI Situation Briefing Agent

## Project boundary

SIAGA ID is an existing disaster-monitoring dashboard. The dashboard, its public-data pipeline, and the original deterministic BM25 assistant predate this hackathon and are reused as the project foundation. They are not presented as new hackathon work.

The hackathon contribution is the **AI Situation Briefing Agent**: Muse Spark selects and calls bounded, read-only tools over the dashboard's live and dated evidence, then produces a concise briefing with source links, freshness, and uncertainty. This is intended to be a domain-specific tool-using agent, not a basic RAG chat interface.

## Current implementation status

The server-side Meta Model API adapter and tool-calling loop are implemented. The local test suite uses a mocked HTTP response and makes no provider request. **A real Meta API key has not been configured or tested in this workspace yet. Until a real response identifies `provider: "muse-spark"`, the project must not be described as having demonstrated Muse Spark or as satisfying the hackathon's Meta-model requirement.**

When `MODEL_API_KEY` is absent, the existing deterministic assistant remains available as `provider: "local-rag"`. If the Meta request fails, the API returns `provider: "local-fallback"`. Both cases are explicitly labeled in the interface and are not evidence of Meta model usage.

The optional historical analytics layer has a Neon migration and cron-driven compact FIRMS regional rollups that read the refreshed cache without another upstream request or storing raw detections. It is disabled until `DATABASE_URL` is set and the migration is applied. It currently does not train or serve an ML forecast. The seasonal median helper is only a baseline and refuses output without at least three prior years, 20 seasonal samples, and externally verified source coverage of at least 90 percent. This data foundation is not evidence of a validated prediction capability.

## Agent tools

Muse Spark can choose from these read-only tools:

- `get_fire_situation`: FIRMS acquisition window, fire counts, source freshness, and plume-model status.
- `get_province_hotspots`: approximate province ranking and the coarse-box limitation.
- `get_modeled_impacted_places`: indicative modeled settlement intersections, not official impacts or exposed-population counts.
- `get_volcano_status`: PVMBG/MAGMA alert levels separated from observatory eruption reports.
- `get_earthquake_status`: recent BMKG records and feed coverage.
- `get_displacement_status`: active BNPB GIS reports and their update ages.
- `get_air_quality_status`: the highest modeled ambient point with the CAMS limitations.
- `get_regional_haze_reports`: dated ASMC, NEA, and BMKG report snapshots and date conflicts.
- `get_land_overlap_summary`: mapped concession overlap with a no-causal-attribution warning.

The model cannot call arbitrary URLs, run code, write dashboard data, or trigger operational actions. Only tool results requested during the turn are sent to Meta along with the user's question.

## Safety and evidence rules

- Live values come from the tools, not from model memory. Missing, stale, partial, or coarse data must remain explicit.
- Distinguish satellite detections, official reports, model output, and approximate administrative matching.
- A hotspot overlap does not establish ignition or legal responsibility.
- A near-surface wind plume is not an observed smoke trajectory. CAMS PM2.5 is total modeled ambient PM2.5, not fire-specific smoke or a station measurement.
- The assistant does not provide diagnosis, treatment, medication advice, evacuation instructions, or official warnings. It is not a substitute for local authorities.
- The question and selected public-data tool results are sent to Meta Model API only when the server-side key is configured.

## Configure a real Meta model call

1. Obtain a Meta Model API key through the official Meta developer flow. Do not paste the key into source code, the browser, a commit, or chat.
2. Set `MODEL_API_KEY` as a server-side environment variable. For local development, use the ignored `.env` file. For production, add it as a sensitive server environment variable in the hosting dashboard and redeploy when ready.
3. Run `npm run check`. The `test-muse-agent` test is offline and uses a mocked response.
4. Ask the assistant a live-data question and verify the JSON response contains all of:
   - `provider: "muse-spark"`
   - `model: "muse-spark-1.3"`
   - `agent.toolCalls` greater than zero for a live-data question
   - source links corresponding to the tools used
5. Confirm that the visible assistant header says `Muse Spark` and that the answer shows evidence sources and tool-call count. If the header says local mode or local fallback, the Meta-backed demo is not ready.

The application uses Meta Model API's OpenAI-compatible Chat Completions endpoint at `https://api.meta.ai/v1/chat/completions`. The model ID is fixed in the server adapter as `muse-spark-1.3`.

## Suggested demo questions

- `Create a current fire situation brief: hotspots, top provinces, and plume-model limits.`
- `What do ASMC, NEA, and BMKG report, and what remains uncertain?`
- `Which companies are responsible for the fires?` The expected behavior is to explain that overlap indicators alone cannot establish responsibility.

Before submission, capture a real run whose response shows the Meta provider and tool calls. Local mock tests are engineering tests, not proof of live model use.
