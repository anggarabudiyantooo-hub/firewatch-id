BEGIN;

CREATE SCHEMA IF NOT EXISTS ai_analytics;

CREATE TABLE IF NOT EXISTS ai_analytics.ingestion_runs (
  run_id uuid PRIMARY KEY,
  source_key text NOT NULL,
  capture_day_wib date NOT NULL,
  status text NOT NULL CHECK (status IN ('complete', 'partial', 'empty')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  source_captured_at timestamptz NOT NULL,
  source_age_ms bigint NOT NULL CHECK (source_age_ms >= 0),
  source_healthy boolean NOT NULL,
  source_mode text NOT NULL CHECK (source_mode = 'live'),
  source_window_hours smallint NOT NULL CHECK (source_window_hours BETWEEN 1 AND 168),
  oldest_event_at timestamptz,
  newest_event_at timestamptz,
  input_count integer NOT NULL CHECK (input_count >= 0),
  valid_count integer NOT NULL CHECK (valid_count >= 0),
  duplicate_count integer NOT NULL CHECK (duplicate_count >= 0),
  rejected_count integer NOT NULL CHECK (rejected_count >= 0),
  rollup_count smallint NOT NULL CHECK (rollup_count >= 0),
  coverage_status text NOT NULL CHECK (coverage_status IN (
    'rolling_window_snapshot', 'empty_feed_not_zero'
  )),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_key, capture_day_wib)
);

CREATE TABLE IF NOT EXISTS ai_analytics.fire_daily_rollups (
  capture_day_wib date NOT NULL,
  region_key text NOT NULL,
  region_level text NOT NULL CHECK (region_level IN ('country', 'province', 'unassigned')),
  region_name text,
  region_assignment_method text NOT NULL,
  captured_at timestamptz NOT NULL,
  source_age_ms bigint NOT NULL CHECK (source_age_ms >= 0),
  source_window_hours smallint NOT NULL CHECK (source_window_hours BETWEEN 1 AND 168),
  hotspot_count integer NOT NULL CHECK (hotspot_count >= 0),
  high_confidence_count integer NOT NULL CHECK (
    high_confidence_count >= 0 AND high_confidence_count <= hotspot_count
  ),
  frp_total_mw numeric(14, 3) NOT NULL CHECK (frp_total_mw >= 0),
  mean_confidence numeric(5, 2) CHECK (mean_confidence IS NULL OR mean_confidence BETWEEN 0 AND 100),
  satellite_count smallint NOT NULL CHECK (satellite_count >= 0),
  unassigned_count integer NOT NULL DEFAULT 0 CHECK (unassigned_count >= 0),
  oldest_event_at timestamptz,
  newest_event_at timestamptz,
  quality_status text NOT NULL CHECK (quality_status IN ('observed', 'partial')),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  ingestion_run_id uuid NOT NULL REFERENCES ai_analytics.ingestion_runs (run_id),
  PRIMARY KEY (capture_day_wib, region_key),
  CHECK (newest_event_at IS NULL OR oldest_event_at IS NULL OR newest_event_at >= oldest_event_at)
);

CREATE INDEX IF NOT EXISTS fire_daily_rollups_region_day_idx
  ON ai_analytics.fire_daily_rollups (region_key, capture_day_wib DESC);

CREATE TABLE IF NOT EXISTS ai_analytics.hazard_observations (
  observation_key char(64) PRIMARY KEY CHECK (observation_key ~ '^[a-f0-9]{64}$'),
  hazard_type text NOT NULL CHECK (hazard_type IN (
    'wildfire', 'smoke', 'earthquake', 'volcano', 'flood', 'drought',
    'air_quality', 'displacement', 'other'
  )),
  metric_name text NOT NULL,
  observed_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL,
  region_level text NOT NULL CHECK (region_level IN (
    'country', 'province', 'district', 'grid', 'unknown'
  )),
  region_name text,
  metric_value numeric,
  unit text,
  source_name text NOT NULL,
  source_url text,
  quality_status text NOT NULL CHECK (quality_status IN (
    'observed', 'modeled', 'reported', 'estimated', 'stale', 'partial'
  )),
  source_age_ms bigint CHECK (source_age_ms IS NULL OR source_age_ms >= 0),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingestion_run_id uuid REFERENCES ai_analytics.ingestion_runs (run_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hazard_observations_lookup_idx
  ON ai_analytics.hazard_observations (hazard_type, metric_name, region_name, observed_at DESC);

CREATE TABLE IF NOT EXISTS ai_analytics.verified_outcomes (
  outcome_key char(64) PRIMARY KEY CHECK (outcome_key ~ '^[a-f0-9]{64}$'),
  hazard_type text NOT NULL,
  metric_name text NOT NULL,
  event_started_at timestamptz NOT NULL,
  event_ended_at timestamptz,
  region_level text NOT NULL CHECK (region_level IN (
    'country', 'province', 'district', 'grid', 'unknown'
  )),
  region_name text,
  outcome_value numeric NOT NULL,
  unit text,
  source_name text NOT NULL,
  source_url text,
  source_record_id text,
  verified_at timestamptz NOT NULL,
  verification_method text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (event_ended_at IS NULL OR event_ended_at >= event_started_at)
);

CREATE INDEX IF NOT EXISTS verified_outcomes_lookup_idx
  ON ai_analytics.verified_outcomes (hazard_type, metric_name, region_name, event_started_at DESC);

CREATE TABLE IF NOT EXISTS ai_analytics.forecast_records (
  forecast_key char(64) PRIMARY KEY CHECK (forecast_key ~ '^[a-f0-9]{64}$'),
  hazard_type text NOT NULL,
  metric_name text NOT NULL,
  region_level text NOT NULL CHECK (region_level IN (
    'country', 'province', 'district', 'grid', 'unknown'
  )),
  region_name text,
  model_name text NOT NULL,
  model_version text NOT NULL,
  issued_at timestamptz NOT NULL,
  valid_at timestamptz NOT NULL,
  horizon_hours integer CHECK (horizon_hours IS NULL OR horizon_hours >= 0),
  prediction_value numeric,
  lower_quantile numeric,
  upper_quantile numeric,
  event_probability numeric CHECK (event_probability IS NULL OR event_probability BETWEEN 0 AND 1),
  unit text,
  training_data_through timestamptz,
  feature_cutoff timestamptz,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lower_quantile IS NULL OR upper_quantile IS NULL OR lower_quantile <= upper_quantile)
);

CREATE INDEX IF NOT EXISTS forecast_records_region_valid_idx
  ON ai_analytics.forecast_records (hazard_type, metric_name, region_name, valid_at DESC);

CREATE TABLE IF NOT EXISTS ai_analytics.model_runs (
  run_id uuid PRIMARY KEY,
  model_name text NOT NULL,
  model_version text NOT NULL,
  run_type text NOT NULL CHECK (run_type IN ('feature_build', 'baseline', 'train', 'backtest', 'inference')),
  hazard_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('complete', 'partial', 'skipped', 'failed')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  training_start timestamptz,
  training_end timestamptz,
  evaluation_start timestamptz,
  evaluation_end timestamptz,
  sample_count integer CHECK (sample_count IS NULL OR sample_count >= 0),
  baseline_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_uri text,
  data_cutoff timestamptz,
  limitations text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS model_runs_model_time_idx
  ON ai_analytics.model_runs (model_name, completed_at DESC);

CREATE OR REPLACE VIEW ai_analytics.v_fire_daily_region AS
SELECT
  region_key,
  region_level,
  region_name,
  region_assignment_method,
  capture_day_wib AS day_wib,
  captured_at,
  source_window_hours,
  source_age_ms,
  hotspot_count,
  high_confidence_count,
  frp_total_mw AS total_frp_mw,
  mean_confidence,
  satellite_count,
  unassigned_count,
  oldest_event_at,
  newest_event_at,
  quality_status,
  extract(month FROM capture_day_wib)::smallint AS calendar_month,
  extract(doy FROM capture_day_wib)::smallint AS day_of_year,
  extract(isodow FROM capture_day_wib)::smallint AS day_of_week
FROM ai_analytics.fire_daily_rollups;

COMMENT ON TABLE ai_analytics.fire_daily_rollups IS
  'Compact rolling FIRMS snapshot aggregates. At most one row per region per WIB capture day.';

COMMENT ON VIEW ai_analytics.v_fire_daily_region IS
  'One rolling-window snapshot per region and WIB capture day. It is not a calendar-day fire total; missing rows are not zero.';

COMMENT ON COLUMN ai_analytics.fire_daily_rollups.region_assignment_method IS
  'The current app uses coarse rectangular province boxes, not authoritative administrative boundaries.';

COMMENT ON COLUMN ai_analytics.fire_daily_rollups.content_hash IS
  'Stable digest of aggregate values. Identical snapshots are not rewritten unless six hours have elapsed.';

COMMENT ON COLUMN ai_analytics.forecast_records.limitation IS
  'Required provenance and limits for each forecast. A forecast is not an official warning.';

COMMIT;
